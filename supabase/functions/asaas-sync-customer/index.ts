// AI dev note: Edge Function que SINCRONIZA o cadastro de uma pessoa em TODAS as
// contas ASAAS das empresas (BC FISIO, F.S PACHECO, etc.). Cada empresa tem sua
// própria base de clientes no ASAAS. Ao atualizar um cadastro na aplicação, esta
// função procura o cliente (por CPF/CNPJ) em cada conta e atualiza os dados onde já
// existe. Usa service role para ler as API keys das empresas. Chamada (fire-and-forget)
// após salvar um cadastro.
//
// Parâmetros opcionais:
//   - createIfMissing: quando true, CRIA o cliente nas contas onde ele ainda não existe
//     (usado ao escolher o tomador da NFS-e — garante cadastro no Asaas na hora).
//   - contactFallbackPersonId: pessoa cujo email/telefone é usado como FALLBACK quando
//     a pessoa sincronizada não tem os seus (tomador = paciente bebê → usa o contato do
//     responsável de cobrança). Não altera o cadastro da pessoa, só o payload do Asaas.
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

    const { personId, createIfMissing, contactFallbackPersonId } =
      await req.json();

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

    // Contato com fallback: quando a pessoa não tem email/telefone e foi informado um
    // contactFallbackPersonId (ex.: responsável de cobrança), usamos o contato dele —
    // a NFS-e exige email do tomador. Não grava nada no cadastro da pessoa.
    let email = pessoa.email || '';
    let mobilePhone = normalizePhone(pessoa.telefone) || '';
    if (
      (!email || !mobilePhone) &&
      contactFallbackPersonId &&
      contactFallbackPersonId !== personId
    ) {
      const { data: fb } = await supabase
        .from('vw_usuarios_admin')
        .select('email, telefone')
        .eq('id', contactFallbackPersonId)
        .maybeSingle();
      if (fb) {
        if (!email && fb.email) email = fb.email as string;
        if (!mobilePhone && fb.telefone)
          mobilePhone = normalizePhone(fb.telefone) || '';
      }
    }

    // Campos a sincronizar (apenas os que têm valor, para não apagar dados no ASAAS)
    const updatePayloadBase: Record<string, string> = {
      name: pessoa.nome || '',
      cpfCnpj,
      externalReference: pessoa.id,
    };
    if (email) updatePayloadBase.email = email;
    if (mobilePhone) updatePayloadBase.mobilePhone = mobilePhone;
    if (pessoa.cep)
      updatePayloadBase.postalCode = String(pessoa.cep).replace(/[^\d]/g, '');
    const addressNumber =
      `${pessoa.numero_endereco || ''} ${pessoa.complemento_endereco || ''}`.trim();
    if (addressNumber) updatePayloadBase.addressNumber = addressNumber;

    const results: Array<{
      empresa: string;
      empresaId: string;
      status: 'updated' | 'created' | 'not_found' | 'error';
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
          // Não existe: cria quando solicitado (ex.: escolha do tomador da NFS-e).
          if (!createIfMissing) {
            results.push({
              empresa: empresa.razao_social,
              empresaId: empresa.id,
              status: 'not_found',
            });
            continue;
          }

          const createResp = await fetch(`${ASAAS_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
              access_token: apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'RespiraKids/1.0',
            },
            // notificationDisabled: quem avisa o cliente é o n8n, não o Asaas
            body: JSON.stringify({
              ...updatePayloadBase,
              notificationDisabled: true,
            }),
          });
          const createData = await createResp.json().catch(() => ({}));
          if (createResp.ok && createData?.id) {
            results.push({
              empresa: empresa.razao_social,
              empresaId: empresa.id,
              status: 'created',
              asaasCustomerId: createData.id,
            });
            console.log(
              `🆕 Cliente criado no ASAAS (${empresa.razao_social}):`,
              createData.id
            );
          } else {
            results.push({
              empresa: empresa.razao_social,
              empresaId: empresa.id,
              status: 'error',
              error:
                createData?.errors?.[0]?.description ||
                `Erro ${createResp.status} ao criar cliente`,
            });
          }
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
    const created = results.filter((r) => r.status === 'created').length;
    console.log(
      `🔁 Sincronização ASAAS concluída para ${pessoa.nome}: ${updated} atualizada(s), ${created} criada(s) de ${results.length} empresa(s).`
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
