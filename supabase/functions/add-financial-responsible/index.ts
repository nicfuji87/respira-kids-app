// AI dev note: Edge Function para adicionar responsável financeiro a pacientes
// Processa todo o fluxo: validação, criação/busca de pessoa, vínculo e notificação

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface EnderecoData {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface FinancialResponsibleData {
  isSelf: boolean;
  phone?: string;
  nome?: string;
  cpf?: string;
  email?: string;
  endereco?: EnderecoData;
  useSameAddress?: boolean;
}

interface RequestBody {
  responsiblePhone: string; // Telefone do responsável que está cadastrando
  patientIds: string[]; // IDs dos pacientes
  financialResponsible: FinancialResponsibleData;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    console.log('📥 [add-financial-responsible] Request recebido:', {
      responsiblePhone: body.responsiblePhone,
      patientIds: body.patientIds,
      isSelf: body.financialResponsible.isSelf,
    });

    // ============================================
    // VALIDAÇÕES INICIAIS
    // ============================================

    if (
      !body.responsiblePhone ||
      !body.patientIds ||
      body.patientIds.length === 0
    ) {
      throw new Error('Dados obrigatórios faltando');
    }

    // AI dev note: IMPORTANTE - usar JID completo (com código país 55)
    // Ex: usuário digita 61981446666, webhook retorna 556181446666@whatsapp.net
    // Devemos salvar: 556181446666 (JID antes do '@')
    const cleanPhone = body.responsiblePhone.replace(/\D/g, '');
    const phoneForDB = cleanPhone.startsWith('55')
      ? cleanPhone
      : `55${cleanPhone}`;
    const phoneBigInt = BigInt(phoneForDB);

    console.log('📱 [add-financial-responsible] Telefone para DB:', phoneForDB);

    // Buscar responsável que está cadastrando
    const { data: responsible, error: responsibleError } = await supabase
      .from('pessoas')
      .select('id, nome, id_endereco, numero_endereco, complemento_endereco')
      .eq('telefone', phoneBigInt)
      .eq('ativo', true)
      .single();

    if (responsibleError || !responsible) {
      throw new Error('Responsável não encontrado no sistema');
    }

    console.log(
      '✅ [add-financial-responsible] Responsável encontrado:',
      responsible.nome
    );

    // ============================================
    // DETERMINAR RESPONSÁVEL FINANCEIRO
    // ============================================

    let financialResponsibleId: string;
    let financialResponsibleName: string;
    let finPhoneForDB = phoneForDB;

    if (body.financialResponsible.isSelf) {
      // CENÁRIO 1: O próprio responsável
      financialResponsibleId = responsible.id;
      financialResponsibleName = responsible.nome;

      console.log(
        '✅ [add-financial-responsible] Responsável financeiro = próprio'
      );
    } else {
      // CENÁRIO 2: Outra pessoa
      console.log(
        '📝 [add-financial-responsible] Criando/buscando responsável financeiro'
      );

      if (!body.financialResponsible.phone || !body.financialResponsible.nome) {
        throw new Error('Dados do responsável financeiro são obrigatórios');
      }

      // AI dev note: IMPORTANTE - usar JID completo (com código país 55)
      const finPhone = body.financialResponsible.phone.replace(/\D/g, '');
      finPhoneForDB = finPhone.startsWith('55') ? finPhone : `55${finPhone}`;
      const finPhoneBigInt = BigInt(finPhoneForDB);

      console.log(
        '📱 [add-financial-responsible] Telefone financeiro para DB:',
        finPhoneForDB
      );

      // Buscar se pessoa já existe por telefone
      const { data: existingPerson } = await supabase
        .from('pessoas')
        .select('id, nome, id_endereco')
        .eq('telefone', finPhoneBigInt)
        .eq('ativo', true)
        .maybeSingle();

      if (existingPerson) {
        // Pessoa já existe - apenas vincular
        console.log(
          '✅ [add-financial-responsible] Pessoa já existe:',
          existingPerson.nome
        );
        financialResponsibleId = existingPerson.id;
        financialResponsibleName = existingPerson.nome;

        // Atualizar endereço se necessário
        if (
          body.financialResponsible.endereco &&
          !body.financialResponsible.useSameAddress
        ) {
          const enderecoId = await createOrFindEndereco(
            supabase,
            body.financialResponsible.endereco
          );

          await supabase
            .from('pessoas')
            .update({
              id_endereco: enderecoId,
              numero_endereco: body.financialResponsible.endereco.numero,
              complemento_endereco:
                body.financialResponsible.endereco.complemento || null,
              email: body.financialResponsible.email || null,
            })
            .eq('id', existingPerson.id);
        }
      } else {
        // Criar nova pessoa
        console.log('📝 [add-financial-responsible] Criando nova pessoa');

        // Buscar tipo_pessoa 'responsavel' ou 'paciente' (vamos usar um genérico)
        const { data: tipoPessoa } = await supabase
          .from('pessoa_tipos')
          .select('id')
          .eq('codigo', 'paciente') // Usar tipo paciente como fallback
          .single();

        if (!tipoPessoa) {
          throw new Error('Tipo de pessoa não encontrado');
        }

        // Criar/buscar endereço
        let enderecoId: string | null = null;

        if (
          body.financialResponsible.useSameAddress &&
          body.patientIds.length > 0
        ) {
          // Usar endereço do primeiro paciente
          const { data: firstPatient } = await supabase
            .from('pessoas')
            .select('id_endereco, numero_endereco, complemento_endereco')
            .eq('id', body.patientIds[0])
            .single();

          if (firstPatient) {
            enderecoId = firstPatient.id_endereco;
          }
        } else if (body.financialResponsible.endereco) {
          enderecoId = await createOrFindEndereco(
            supabase,
            body.financialResponsible.endereco
          );
        }

        // Criar pessoa com ID temporário para auto-referência
        const tempId = crypto.randomUUID();

        console.log(
          '💾 [add-financial-responsible] Salvando telefone (JID):',
          finPhoneBigInt
        );

        const { data: newPerson, error: createError } = await supabase
          .from('pessoas')
          .insert({
            id: tempId,
            id_tipo_pessoa: tipoPessoa.id,
            nome: body.financialResponsible.nome,
            cpf_cnpj: body.financialResponsible.cpf?.replace(/\D/g, '') || null,
            email: body.financialResponsible.email || null,
            telefone: finPhoneBigInt, // AI dev note: JID completo com código país
            id_endereco: enderecoId,
            numero_endereco: body.financialResponsible.endereco?.numero || null,
            complemento_endereco:
              body.financialResponsible.endereco?.complemento || null,
            responsavel_cobranca_id: tempId, // Auto-referência
            ativo: true,
          })
          .select()
          .single();

        if (createError || !newPerson) {
          console.error(
            '❌ [add-financial-responsible] Erro ao criar pessoa:',
            createError
          );
          throw new Error('Erro ao criar responsável financeiro');
        }

        financialResponsibleId = newPerson.id;
        financialResponsibleName = newPerson.nome;
        console.log(
          '✅ [add-financial-responsible] Nova pessoa criada:',
          financialResponsibleName
        );
      }
    }

    // ============================================
    // CRIAR VÍNCULOS COM PACIENTES
    // ============================================

    const updatedPatients: Array<{ id: string; nome: string }> = [];

    for (const patientId of body.patientIds) {
      console.log(
        '🔗 [add-financial-responsible] Processando paciente:',
        patientId
      );

      // Buscar paciente
      const { data: patient, error: patientError } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('id', patientId)
        .eq('ativo', true)
        .single();

      if (patientError || !patient) {
        console.error(
          '❌ [add-financial-responsible] Paciente não encontrado:',
          patientId
        );
        continue;
      }

      // Verificar se já existe vínculo
      const { data: existingLink } = await supabase
        .from('pessoa_responsaveis')
        .select('id, tipo_responsabilidade')
        .eq('id_pessoa', patientId)
        .eq('id_responsavel', financialResponsibleId)
        .eq('ativo', true)
        .is('data_fim', null)
        .maybeSingle();

      if (existingLink) {
        // Atualizar tipo de responsabilidade
        if (existingLink.tipo_responsabilidade === 'legal') {
          console.log(
            '📝 [add-financial-responsible] Atualizando vínculo existente para "ambos"'
          );
          await supabase
            .from('pessoa_responsaveis')
            .update({ tipo_responsabilidade: 'ambos' })
            .eq('id', existingLink.id);
        } else {
          console.log(
            'ℹ️ [add-financial-responsible] Vínculo já existe como financeiro/ambos'
          );
        }
      } else {
        // Criar novo vínculo
        console.log('📝 [add-financial-responsible] Criando novo vínculo');
        await supabase.from('pessoa_responsaveis').insert({
          id_pessoa: patientId,
          id_responsavel: financialResponsibleId,
          tipo_responsabilidade: 'financeiro',
          ativo: true,
          data_inicio: new Date().toISOString().split('T')[0],
        });
      }

      // Atualizar responsavel_cobranca_id
      console.log(
        '📝 [add-financial-responsible] Atualizando responsavel_cobranca_id'
      );
      await supabase
        .from('pessoas')
        .update({ responsavel_cobranca_id: financialResponsibleId })
        .eq('id', patientId);

      updatedPatients.push({ id: patient.id, nome: patient.nome });
    }

    // ============================================
    // ENVIAR EVENTO PARA WEBHOOK (n8n)
    // ============================================

    console.log('📤 [add-financial-responsible] Enviando evento para webhook');

    // AI dev note: WhatsApp JID completo para webhook
    const whatsappJid = `${finPhoneForDB}@s.whatsapp.net`;

    console.log('📱 [add-financial-responsible] WhatsApp JID:', whatsappJid);

    await supabase.from('webhook_queue').insert({
      evento: 'novo_responsavel_financeiro',
      payload: {
        tipo: 'novo_responsavel_financeiro',
        timestamp: new Date().toISOString(),
        data: {
          responsavel_financeiro_id: financialResponsibleId,
          responsavel_financeiro_nome: financialResponsibleName,
          responsavel_financeiro_whatsapp: whatsappJid,
          pacientes: updatedPatients,
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
      proximo_retry: new Date().toISOString(),
    });

    console.log(
      '✅ [add-financial-responsible] Processo concluído com sucesso'
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          financialResponsibleId,
          financialResponsibleName,
          patientsUpdated: updatedPatients.length,
          patients: updatedPatients,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ [add-financial-responsible] Erro:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// ============================================
// HELPER: Criar ou buscar endereço
// ============================================
async function createOrFindEndereco(
  supabase: SupabaseClient,
  endereco: EnderecoData
): Promise<string> {
  const cleanCep = endereco.cep.replace(/\D/g, '');

  // Buscar endereço existente por CEP
  const { data: existingEndereco } = await supabase
    .from('enderecos')
    .select('id')
    .eq('cep', cleanCep)
    .maybeSingle();

  if (existingEndereco) {
    console.log('✅ [createOrFindEndereco] Endereço já existe:', cleanCep);
    return existingEndereco.id;
  }

  // Criar novo endereço
  console.log('📝 [createOrFindEndereco] Criando novo endereço:', cleanCep);
  const { data: newEndereco, error: enderecoError } = await supabase
    .from('enderecos')
    .insert({
      cep: cleanCep,
      logradouro: endereco.logradouro,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      estado: endereco.estado,
    })
    .select()
    .single();

  if (enderecoError || !newEndereco) {
    console.error('❌ [createOrFindEndereco] Erro:', enderecoError);
    throw new Error('Erro ao criar endereço');
  }

  return newEndereco.id;
}
