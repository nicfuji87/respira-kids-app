// AI dev note: Edge Function que SINCRONIZA o cadastro de uma pessoa em TODAS as
// contas ASAAS das empresas (BC FISIO, F.S PACHECO, etc.). Cada empresa tem sua
// própria base de clientes no ASAAS. Ao atualizar um cadastro na aplicação, esta
// função procura o cliente (por CPF/CNPJ) em cada conta e, SE existir, atualiza os
// dados (não cria — apenas atualiza onde já existe). Usa service role para ler as
// API keys das empresas. É chamada (fire-and-forget) após salvar um cadastro.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Normaliza telefone: remove não-dígitos e o DDI 55 (ASAAS exige sem código do país)
function normalizePhone(phone?: string | number | null): string | undefined {
  if (phone === null || phone === undefined) return undefined;
  let p = String(phone).replace(/[^\d]/g, '');
  if (p.startsWith('55') && p.length > 11) p = p.substring(2);
  return p || undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { personId } = await req.json();

    if (!personId) {
      return new Response(
        JSON.stringify({ success: false, error: 'personId é obrigatório' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Carregar dados atuais da pessoa (fonte da verdade = aplicação)
    const { data: pessoa, error: pessoaError } = await supabase
      .from('vw_usuarios_admin')
      .select(
        `id, nome, cpf_cnpj, email, telefone,
         numero_endereco, complemento_endereco, cep`
      )
      .eq('id', personId)
      .single();

    if (pessoaError || !pessoa) {
      console.error('❌ Pessoa não encontrada:', pessoaError);
      return new Response(
        JSON.stringify({ success: false, error: 'Pessoa não encontrada' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Sem CPF/CNPJ não há como localizar o cliente no ASAAS
    const cpfCnpj = (pessoa.cpf_cnpj || '').replace(/[^\d]/g, '');
    if (!cpfCnpj) {
      console.log('ℹ️ Pessoa sem CPF/CNPJ; nada a sincronizar no ASAAS.');
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          message: 'Pessoa sem CPF/CNPJ — sincronização ignorada.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2) Carregar todas as empresas ativas com API key configurada
    const { data: empresas, error: empresasError } = await supabase
      .from('pessoa_empresas')
      .select('id, razao_social, api_token_externo')
      .eq('ativo', true)
      .not('api_token_externo', 'is', null);

    if (empresasError) {
      console.error('❌ Erro ao carregar empresas:', empresasError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao carregar empresas' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Campos a sincronizar (apenas os que têm valor, para não apagar dados no ASAAS)
    const updatePayloadBase: Record<string, string> = {
      name: pessoa.nome || '',
      cpfCnpj,
      externalReference: pessoa.id,
    };
    const mobilePhone = normalizePhone(pessoa.telefone);
    if (pessoa.email) updatePayloadBase.email = pessoa.email;
    if (mobilePhone) updatePayloadBase.mobilePhone = mobilePhone;
    if (pessoa.cep)
      updatePayloadBase.postalCode = String(pessoa.cep).replace(/[^\d]/g, '');
    const addressNumber =
      `${pessoa.numero_endereco || ''} ${pessoa.complemento_endereco || ''}`.trim();
    if (addressNumber) updatePayloadBase.addressNumber = addressNumber;

    const results: Array<{
      empresa: string;
      empresaId: string;
      status: 'updated' | 'not_found' | 'error';
      asaasCustomerId?: string;
      error?: string;
    }> = [];

    // 3) Para cada empresa: localizar o cliente por CPF e atualizar se existir
    for (const empresa of empresas || []) {
      const apiKey = empresa.api_token_externo as string;
      try {
        const searchResp = await fetch(
          `${ASAAS_BASE_URL}/customers?cpfCnpj=${cpfCnpj}&limit=1`,
          {
            method: 'GET',
            headers: {
              access_token: apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'RespiraKids/1.0',
            },
          }
        );
        const searchData = await searchResp.json().catch(() => ({}));

        if (!searchResp.ok) {
          results.push({
            empresa: empresa.razao_social,
            empresaId: empresa.id,
            status: 'error',
            error:
              searchData?.errors?.[0]?.description ||
              `Erro ${searchResp.status} ao buscar cliente`,
          });
          continue;
        }

        const customer = (searchData.data || [])[0];
        if (!customer?.id) {
          results.push({
            empresa: empresa.razao_social,
            empresaId: empresa.id,
            status: 'not_found',
          });
          continue;
        }

        const updateResp = await fetch(
          `${ASAAS_BASE_URL}/customers/${customer.id}`,
          {
            method: 'PUT',
            headers: {
              access_token: apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'RespiraKids/1.0',
            },
            body: JSON.stringify(updatePayloadBase),
          }
        );
        const updateData = await updateResp.json().catch(() => ({}));

        if (updateResp.ok) {
          results.push({
            empresa: empresa.razao_social,
            empresaId: empresa.id,
            status: 'updated',
            asaasCustomerId: customer.id,
          });
          console.log(
            `✅ Cliente atualizado no ASAAS (${empresa.razao_social}):`,
            customer.id
          );
        } else {
          results.push({
            empresa: empresa.razao_social,
            empresaId: empresa.id,
            status: 'error',
            asaasCustomerId: customer.id,
            error:
              updateData?.errors?.[0]?.description ||
              `Erro ${updateResp.status} ao atualizar cliente`,
          });
        }
      } catch (err) {
        results.push({
          empresa: empresa.razao_social,
          empresaId: empresa.id,
          status: 'error',
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    const updated = results.filter((r) => r.status === 'updated').length;
    console.log(
      `🔁 Sincronização ASAAS concluída para ${pessoa.nome}: ${updated}/${
        results.length
      } empresa(s) atualizada(s).`
    );

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('💥 Erro na Edge Function asaas-sync-customer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
