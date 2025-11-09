// AI dev note: Edge Function para finalizar cadastro público de paciente
// Cria todas as entidades no banco de dados seguindo a ordem correta
// Logs detalhados em cada etapa para rastreamento
// Versão 39: Logs detalhados de CEP + mensagens de erro melhoradas

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface PatientRegistrationData {
  sessionId?: string;
  existingPersonId?: string;
  existingUserData?: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
  };
  responsavelLegal?: {
    nome: string;
    cpf: string;
    email: string;
  };
  responsavelFinanceiroMesmoQueLegal: boolean;
  responsavelFinanceiroExistingId?: string;
  newPersonData?: {
    nome: string;
    cpf: string;
    email: string;
    whatsapp?: string;
    whatsappJid?: string;
  };
  endereco: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    numero: string;
    complemento?: string;
  };
  paciente: {
    nome: string;
    dataNascimento: string;
    sexo: string;
    cpf?: string;
  };
  pediatra: {
    id?: string;
    nome: string;
    crm?: string;
  };
  autorizacoes: {
    usoCientifico: boolean;
    usoRedesSociais: boolean;
    usoNome: boolean;
  };
  contractVariables: Record<string, unknown>;
  whatsappJid?: string;
  phoneNumber?: string;
}

function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

// AI dev note: Função helper para limpar CPF antes de salvar no banco
// Remove toda formatação (pontos, traços) e valida se tem 11 dígitos
function cleanCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.length === 11 ? cleaned : null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let supabase: SupabaseClient;
  let sessionId = 'unknown';
  let startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody = await req.json();
    console.log(
      '🔍 [DEBUG] Request body completo recebido:',
      JSON.stringify(requestBody)
    );

    const { action, data } = requestBody as {
      action: string;
      data: PatientRegistrationData;
    };

    sessionId = data?.sessionId || 'unknown';
    startTime = Date.now();

    console.log('🚀 [PUBLIC-PATIENT-REGISTRATION] Iniciando cadastro público');
    console.log('📋 [LOGGING] Session ID:', sessionId);
    console.log('📋 [STEP 0] Ação:', action);

    // Validações básicas
    console.log('🔍 [DEBUG] data é null?', data === null);
    console.log('🔍 [DEBUG] data é undefined?', data === undefined);
    console.log('🔍 [DEBUG] typeof data:', typeof data);

    if (!data) {
      console.error('❌ [ERROR] data está null ou undefined!');
      throw new Error('Dados de cadastro não fornecidos no request body');
    }

    console.log('🔍 [DEBUG] data.paciente existe?', !!data.paciente);
    console.log('🔍 [DEBUG] data.paciente:', JSON.stringify(data.paciente));
    console.log('🔍 [DEBUG] data.pediatra existe?', !!data.pediatra);
    console.log('🔍 [DEBUG] data.pediatra:', JSON.stringify(data.pediatra));

    console.log(
      '📋 [STEP 0] Dados recebidos (resumo):',
      JSON.stringify({
        hasExistingUser: !!data.existingPersonId,
        hasResponsavelLegal: !!data.responsavelLegal,
        responsavelFinanceiroMesmoQueLegal:
          data.responsavelFinanceiroMesmoQueLegal,
        responsavelFinanceiroExistingId: data.responsavelFinanceiroExistingId,
        hasNewPersonData: !!data.newPersonData,
        pacienteNome: data.paciente?.nome || 'não fornecido',
        pediatraId: data.pediatra?.id || 'novo pediatra',
        pediatraNome: data.pediatra?.nome || 'não fornecido',
        hasContractVariables: !!data.contractVariables,
      })
    );

    if (action !== 'finalize_registration') {
      throw new Error(`Ação desconhecida: ${action}`);
    }

    if (!data.contractVariables) {
      throw new Error('Variáveis do contrato são obrigatórias');
    }

    // ============================================
    // STEP 1: Buscar tipos de pessoa
    // ============================================
    console.log('📋 [STEP 1] Buscando tipos de pessoa...');

    const { data: tipoResponsavel, error: errorTipoResponsavel } =
      await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'responsavel')
        .single();

    if (errorTipoResponsavel || !tipoResponsavel) {
      console.error(
        '❌ [STEP 1] Erro ao buscar tipo responsavel:',
        errorTipoResponsavel
      );
      throw new Error('Tipo de pessoa "responsavel" não encontrado');
    }
    console.log('✅ [STEP 1] Tipo responsavel:', tipoResponsavel.id);

    const { data: tipoPaciente, error: errorTipoPaciente } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'paciente')
      .single();

    if (errorTipoPaciente || !tipoPaciente) {
      console.error(
        '❌ [STEP 1] Erro ao buscar tipo paciente:',
        errorTipoPaciente
      );
      throw new Error('Tipo de pessoa "paciente" não encontrado');
    }
    console.log('✅ [STEP 1] Tipo paciente:', tipoPaciente.id);

    // ============================================
    // STEP 2: Buscar ou Criar ENDEREÇO do Responsável Legal
    // ============================================
    console.log('📋 [STEP 2] Buscando ou criando endereço...');
    console.log('📋 [STEP 2] CEP:', data.endereco.cep);

    // AI dev note: Normalizar CEP removendo caracteres não numéricos antes de buscar/inserir
    const cepNormalizado = data.endereco.cep.replace(/\D/g, '');
    console.log('📋 [STEP 2] CEP normalizado:', cepNormalizado);

    let enderecoId: string;

    // AI dev note: Buscar endereço APENAS por CEP (constraint UNIQUE no CEP)
    // Campos logradouro/bairro/cidade/estado são bloqueados no frontend após busca
    const { data: enderecoExistente, error: errorEnderecoSearch } =
      await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cepNormalizado)
        .maybeSingle();

    if (errorEnderecoSearch) {
      console.error(
        '❌ [STEP 2] Erro ao buscar endereço:',
        errorEnderecoSearch
      );
      throw new Error('Erro ao buscar endereço');
    }

    if (enderecoExistente) {
      enderecoId = enderecoExistente.id;
      console.log('✅ [STEP 2] Endereço já existe (reutilizando):', enderecoId);
    } else {
      console.log('📋 [STEP 2] Criando novo endereço...');

      // Log detalhado dos dados do endereço antes da inserção
      console.log('🔍 [DEBUG] Dados do endereço a serem inseridos:', {
        cep: cepNormalizado,
        cep_length: cepNormalizado.length,
        logradouro: data.endereco.logradouro,
        logradouro_length: data.endereco.logradouro?.length || 0,
        logradouro_trimmed: data.endereco.logradouro?.trim(),
        bairro: data.endereco.bairro,
        bairro_length: data.endereco.bairro?.length || 0,
        bairro_trimmed: data.endereco.bairro?.trim(),
        cidade: data.endereco.cidade,
        cidade_length: data.endereco.cidade?.length || 0,
        cidade_trimmed: data.endereco.cidade?.trim(),
        estado: data.endereco.estado,
        estado_length: data.endereco.estado?.length || 0,
        estado_trimmed: data.endereco.estado?.trim(),
        estado_trimmed_length: data.endereco.estado?.trim()?.length || 0,
        estado_raw_chars: data.endereco.estado
          ? data.endereco.estado
              .split('')
              .map((c) => `'${c}' (code: ${c.charCodeAt(0)})`)
          : [],
      });

      // AI dev note: Adicionar trim() em todos os campos para evitar espaços em branco
      // A constraint do banco requer que estado tenha exatamente 2 caracteres
      const { data: novoEndereco, error: errorEnderecoInsert } = await supabase
        .from('enderecos')
        .insert({
          cep: cepNormalizado, // AI dev note: Usar CEP normalizado sem formatação
          logradouro: data.endereco.logradouro?.trim() || '',
          bairro: data.endereco.bairro?.trim() || '',
          cidade: data.endereco.cidade?.trim() || '',
          estado: data.endereco.estado?.trim()?.toUpperCase() || '', // Trim + uppercase
        })
        .select('id')
        .single();

      if (errorEnderecoInsert || !novoEndereco) {
        console.error(
          '❌ [STEP 2] Erro ao criar endereço:',
          errorEnderecoInsert
        );
        console.error(
          '❌ [STEP 2] Detalhes do erro:',
          JSON.stringify(errorEnderecoInsert, null, 2)
        );

        // Mensagem mais específica baseada no erro
        let errorMessage = 'Erro ao criar endereço';

        if (errorEnderecoInsert?.message?.includes('enderecos_estado_check')) {
          errorMessage =
            'Erro: Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)';
        } else if (errorEnderecoInsert?.code === '23505') {
          errorMessage = 'Erro: CEP já cadastrado no sistema';
        } else if (errorEnderecoInsert?.message?.includes('not-null')) {
          errorMessage = 'Erro: Todos os campos de endereço são obrigatórios';
        } else if (errorEnderecoInsert?.message) {
          errorMessage = `Erro ao criar endereço: ${errorEnderecoInsert.message}`;
        }

        throw new Error(errorMessage);
      }

      enderecoId = novoEndereco.id;
      console.log('✅ [STEP 2] Novo endereço criado:', enderecoId);
    }

    // ============================================
    // STEP 3: Criar ou Usar RESPONSÁVEL LEGAL
    // ============================================
    let responsavelLegalId: string;

    // AI dev note: Verificar se há pessoa existente (pode vir em existingPersonId ou existingUserData.id)
    const existingId = data.existingPersonId || data.existingUserData?.id;

    if (existingId && data.existingUserData) {
      // Usar pessoa existente
      responsavelLegalId = existingId;
      console.log(
        '✅ [STEP 3] Usando pessoa existente como responsável legal:',
        responsavelLegalId
      );
      console.log('📋 [STEP 3] Dados do usuário existente:', {
        nome: data.existingUserData.nome,
        email: data.existingUserData.email,
        telefone: data.existingUserData.telefone,
      });

      // Atualizar endereço da pessoa existente
      console.log(
        '📋 [STEP 3] Atualizando endereço do responsável existente...'
      );
      const { error: errorUpdateEndereco } = await supabase
        .from('pessoas')
        .update({
          id_endereco: enderecoId,
          numero_endereco: data.endereco.numero,
          complemento_endereco: data.endereco.complemento || null,
        })
        .eq('id', responsavelLegalId);

      if (errorUpdateEndereco) {
        console.error(
          '❌ [STEP 3] Erro ao atualizar endereço:',
          errorUpdateEndereco
        );
        throw new Error('Erro ao atualizar endereço do responsável');
      }
      console.log('✅ [STEP 3] Endereço atualizado para responsável existente');
    } else {
      // Criar novo responsável legal
      console.log('📋 [STEP 3] Criando novo responsável legal...');

      const telefoneResponsavelLegal = data.whatsappJid
        ? extractPhoneFromJid(data.whatsappJid)
        : data.phoneNumber;

      console.log('📋 [STEP 3] Dados:', {
        nome: data.responsavelLegal?.nome,
        cpf: data.responsavelLegal?.cpf,
        email: data.responsavelLegal?.email,
        telefone: telefoneResponsavelLegal,
      });

      // AI dev note: Usar UUID temporário para criar autoreferência
      const tempId = crypto.randomUUID();

      const { data: novoResponsavelLegal, error: errorResponsavelLegal } =
        await supabase
          .from('pessoas')
          .insert({
            id: tempId, // ID temporário para auto-referência
            nome: data.responsavelLegal.nome,
            cpf_cnpj: cleanCPF(data.responsavelLegal.cpf), // AI dev note: Limpar CPF antes de salvar
            telefone: telefoneResponsavelLegal,
            email: data.responsavelLegal.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId,
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: tempId, // Auto-referência
            ativo: true,
          })
          .select('id')
          .single();

      if (errorResponsavelLegal || !novoResponsavelLegal) {
        console.error(
          '❌ [STEP 3] Erro ao criar responsável legal:',
          errorResponsavelLegal
        );
        throw new Error('Erro ao criar responsável legal');
      }

      responsavelLegalId = novoResponsavelLegal.id;
      console.log('✅ [STEP 3] Responsável legal criado:', responsavelLegalId);

      // Atualizar auto-referência
      console.log('📋 [STEP 3.1] Atualizando auto-referência...');
      const { error: errorAutoReferencia } = await supabase
        .from('pessoas')
        .update({ responsavel_cobranca_id: responsavelLegalId })
        .eq('id', responsavelLegalId);

      if (errorAutoReferencia) {
        console.error(
          '❌ [STEP 3.1] Erro ao atualizar auto-referência:',
          errorAutoReferencia
        );
        throw new Error('Erro ao atualizar auto-referência do responsável');
      }
      console.log('✅ [STEP 3.1] Auto-referência atualizada');
    }

    // ============================================
    // STEP 4: Criar ou Usar RESPONSÁVEL FINANCEIRO
    // ============================================
    let responsavelFinanceiroId: string;

    if (data.responsavelFinanceiroMesmoQueLegal) {
      // Responsável financeiro é o mesmo que o legal
      responsavelFinanceiroId = responsavelLegalId;
      console.log(
        '✅ [STEP 4] Responsável financeiro = legal:',
        responsavelFinanceiroId
      );
    } else if (data.responsavelFinanceiroExistingId) {
      // Usar pessoa existente como responsável financeiro
      responsavelFinanceiroId = data.responsavelFinanceiroExistingId;
      console.log(
        '✅ [STEP 4] Usando responsável financeiro existente:',
        responsavelFinanceiroId
      );

      // Verificar se pessoa existe
      const { data: pessoaExistente, error: errorPessoaCheck } = await supabase
        .from('pessoas')
        .select('id, nome')
        .eq('id', responsavelFinanceiroId)
        .eq('ativo', true)
        .single();

      if (errorPessoaCheck || !pessoaExistente) {
        console.error(
          '❌ [STEP 4] Pessoa existente não encontrada:',
          errorPessoaCheck
        );
        throw new Error('Responsável financeiro não encontrado no sistema');
      }
      console.log(
        '✅ [STEP 4] Pessoa existente confirmada:',
        pessoaExistente.nome
      );

      // Atualizar endereço do responsável financeiro existente
      console.log(
        '📋 [STEP 4] Atualizando endereço do responsável financeiro existente...'
      );
      const { error: errorUpdateEnderecoFin } = await supabase
        .from('pessoas')
        .update({
          id_endereco: enderecoId,
          numero_endereco: data.endereco.numero,
          complemento_endereco: data.endereco.complemento || null,
        })
        .eq('id', responsavelFinanceiroId);

      if (errorUpdateEnderecoFin) {
        console.error(
          '❌ [STEP 4] Erro ao atualizar endereço financeiro:',
          errorUpdateEnderecoFin
        );
        throw new Error('Erro ao atualizar endereço do responsável financeiro');
      }
      console.log(
        '✅ [STEP 4] Endereço atualizado para responsável financeiro existente'
      );
    } else if (data.newPersonData) {
      // Criar novo responsável financeiro
      console.log('📋 [STEP 4] Criando novo responsável financeiro...');

      const telefoneResponsavelFin = data.newPersonData.whatsappJid
        ? extractPhoneFromJid(data.newPersonData.whatsappJid)
        : data.newPersonData.whatsapp;

      console.log('📋 [STEP 4] Dados:', {
        nome: data.newPersonData.nome,
        cpf: data.newPersonData.cpf,
        email: data.newPersonData.email,
        telefone: telefoneResponsavelFin,
      });

      // Usar mesmo endereço do responsável legal
      console.log('✅ [STEP 4] Usando mesmo endereço do responsável legal');

      console.log('📋 [STEP 4] Inserindo nova pessoa financeira...');
      const tempFinId = crypto.randomUUID();

      const { data: novoResponsavelFin, error: errorResponsavelFin } =
        await supabase
          .from('pessoas')
          .insert({
            id: tempFinId, // ID temporário para auto-referência
            nome: data.newPersonData.nome,
            cpf_cnpj: cleanCPF(data.newPersonData.cpf), // AI dev note: Limpar CPF antes de salvar
            telefone: telefoneResponsavelFin,
            email: data.newPersonData.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId,
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: tempFinId, // Auto-referência
            ativo: true,
          })
          .select('id')
          .single();

      if (errorResponsavelFin || !novoResponsavelFin) {
        console.error(
          '❌ [STEP 4] Erro ao criar responsável financeiro:',
          errorResponsavelFin
        );
        throw new Error('Erro ao criar responsável financeiro');
      }

      responsavelFinanceiroId = novoResponsavelFin.id;
      console.log(
        '✅ [STEP 4] Responsável financeiro criado:',
        responsavelFinanceiroId
      );

      // Atualizar auto-referência
      console.log(
        '📋 [STEP 4.1] Atualizando auto-referência do responsável financeiro...'
      );
      const { error: errorAutoRefFin } = await supabase
        .from('pessoas')
        .update({ responsavel_cobranca_id: responsavelFinanceiroId })
        .eq('id', responsavelFinanceiroId);

      if (errorAutoRefFin) {
        console.error(
          '❌ [STEP 4.1] Erro ao atualizar auto-referência financeiro:',
          errorAutoRefFin
        );
        throw new Error(
          'Erro ao atualizar auto-referência do responsável financeiro'
        );
      }
      console.log('✅ [STEP 4.1] Auto-referência financeiro atualizada');
    } else {
      throw new Error('Dados do responsável financeiro não fornecidos');
    }

    // ============================================
    // STEP 5: Criar ou Usar PEDIATRA
    // ============================================
    console.log('📋 [STEP 5] Processando pediatra...');
    let pediatraId: string;

    if (data.pediatra.id) {
      // Usar pediatra existente
      pediatraId = data.pediatra.id;
      console.log('✅ [STEP 5] Usando pediatra existente:', pediatraId);
    } else {
      // Criar novo pediatra
      console.log('📋 [STEP 5] Criando novo pediatra...');
      console.log('📋 [STEP 5] Nome:', data.pediatra.nome);
      console.log('📋 [STEP 5] CRM:', data.pediatra.crm || 'não fornecido');

      // Buscar tipo 'medico' para pediatra
      const { data: tipoPediatra, error: errorTipoPediatra } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'medico')
        .single();

      if (errorTipoPediatra || !tipoPediatra) {
        console.error(
          '❌ [STEP 5] Erro ao buscar tipo médico/pediatra:',
          errorTipoPediatra
        );
        throw new Error(
          'Tipo de pessoa "medico" (Médico Pediatra) não encontrado'
        );
      }

      // Criar pessoa do tipo médico
      const tempPedId = crypto.randomUUID();
      const { data: novoPediatra, error: errorPediatra } = await supabase
        .from('pessoas')
        .insert({
          id: tempPedId,
          nome: data.pediatra.nome,
          id_tipo_pessoa: tipoPediatra.id,
          responsavel_cobranca_id: tempPedId, // Auto-referência
          ativo: true,
        })
        .select('id')
        .single();

      if (errorPediatra || !novoPediatra) {
        console.error(
          '❌ [STEP 5] Erro ao criar pessoa pediatra:',
          errorPediatra
        );
        throw new Error('Erro ao criar pediatra');
      }

      const pediatraPessoaId = novoPediatra.id;
      console.log('✅ [STEP 5] Pessoa pediatra criada:', pediatraPessoaId);

      // Criar registro na tabela pessoa_pediatra
      console.log('📋 [STEP 5] Criando registro pessoa_pediatra...');
      const { data: pessoaPediatra, error: errorPessoaPediatra } =
        await supabase
          .from('pessoa_pediatra')
          .insert({
            pessoa_id: pediatraPessoaId,
            crm: data.pediatra.crm || null,
            especialidade: 'Pediatria',
            ativo: true,
          })
          .select('id')
          .single();

      if (errorPessoaPediatra || !pessoaPediatra) {
        console.error(
          '❌ [STEP 5] Erro ao criar pessoa_pediatra:',
          errorPessoaPediatra
        );
        throw new Error('Erro ao criar registro de pediatra');
      }

      pediatraId = pessoaPediatra.id;
      console.log('✅ [STEP 5] Registro pessoa_pediatra criado:', pediatraId);
    }

    // ============================================
    // STEP 6: Criar PACIENTE
    // ============================================
    console.log('📋 [STEP 6] Criando paciente...');
    console.log('📋 [STEP 6] Dados:', {
      nome: data.paciente.nome,
      dataNascimento: data.paciente.dataNascimento,
      sexo: data.paciente.sexo,
      cpf: data.paciente.cpf || 'não fornecido',
    });

    // AI dev note: Data já vem no formato ISO do frontend
    const dataNascimentoISO = data.paciente.dataNascimento;

    const { data: novoPaciente, error: errorPaciente } = await supabase
      .from('pessoas')
      .insert({
        nome: data.paciente.nome,
        data_nascimento: dataNascimentoISO,
        sexo: data.paciente.sexo,
        cpf_cnpj: cleanCPF(data.paciente.cpf), // AI dev note: Limpar CPF antes de salvar
        id_tipo_pessoa: tipoPaciente.id,
        id_endereco: enderecoId,
        numero_endereco: data.endereco.numero,
        complemento_endereco: data.endereco.complemento || null,
        responsavel_cobranca_id: responsavelFinanceiroId, // Responsável financeiro paga as contas
        autorizacao_uso_cientifico: data.autorizacoes.usoCientifico,
        autorizacao_uso_redes_sociais: data.autorizacoes.usoRedesSociais,
        autorizacao_uso_do_nome: data.autorizacoes.usoNome,
        ativo: true,
      })
      .select('id')
      .single();

    if (errorPaciente || !novoPaciente) {
      console.error('❌ [STEP 6] Erro ao criar paciente:', errorPaciente);
      throw new Error('Erro ao criar paciente');
    }

    const pacienteId = novoPaciente.id;
    console.log('✅ [STEP 6] Paciente criado:', pacienteId);

    // ============================================
    // STEP 7/8: Criar relacionamentos paciente ↔ responsáveis
    // ============================================
    if (responsavelFinanceiroId === responsavelLegalId) {
      // Mesma pessoa é responsável legal E financeiro
      console.log(
        '📋 [STEP 7] Criando relacionamento paciente ↔ responsável (legal e financeiro)...'
      );
      const { error: errorRelAmbos } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: pacienteId,
          id_responsavel: responsavelLegalId,
          tipo_responsabilidade: 'ambos',
          ativo: true,
        });

      if (errorRelAmbos) {
        console.error(
          '❌ [STEP 7] Erro ao criar relacionamento ambos:',
          errorRelAmbos
        );
        throw new Error('Erro ao criar relacionamento com responsável');
      }
      console.log('✅ [STEP 7] Relacionamento criado (legal e financeiro)');
    } else {
      // Pessoas diferentes para responsável legal e financeiro
      console.log(
        '📋 [STEP 7] Criando relacionamento paciente ↔ responsável legal...'
      );
      const { error: errorRelLegal } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: pacienteId,
          id_responsavel: responsavelLegalId,
          tipo_responsabilidade: 'legal',
          ativo: true,
        });

      if (errorRelLegal) {
        console.error(
          '❌ [STEP 7] Erro ao criar relacionamento legal:',
          errorRelLegal
        );
        throw new Error('Erro ao criar relacionamento com responsável legal');
      }
      console.log('✅ [STEP 7] Relacionamento legal criado');

      console.log(
        '📋 [STEP 8] Criando relacionamento paciente ↔ responsável financeiro...'
      );
      const { error: errorRelFin } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: pacienteId,
          id_responsavel: responsavelFinanceiroId,
          tipo_responsabilidade: 'financeiro',
          ativo: true,
        });

      if (errorRelFin) {
        console.error(
          '❌ [STEP 8] Erro ao criar relacionamento financeiro:',
          errorRelFin
        );
        throw new Error(
          'Erro ao criar relacionamento com responsável financeiro'
        );
      }
      console.log('✅ [STEP 8] Relacionamento financeiro criado');
    }

    // ============================================
    // STEP 9: Criar relacionamento paciente ↔ pediatra
    // ============================================
    console.log('📋 [STEP 9] Criando relacionamento paciente ↔ pediatra...');
    const { error: errorRelPediatra } = await supabase
      .from('paciente_pediatra')
      .insert({
        paciente_id: pacienteId,
        pediatra_id: pediatraId,
        ativo: true,
      });

    if (errorRelPediatra) {
      console.error(
        '❌ [STEP 9] Erro ao criar relacionamento pediatra:',
        errorRelPediatra
      );
      throw new Error('Erro ao criar relacionamento com pediatra');
    }
    console.log('✅ [STEP 9] Relacionamento pediatra criado');

    // ============================================
    // STEP 10: Criar contrato
    // ============================================
    console.log('📋 [STEP 10] Criando contrato...');
    console.log(
      '📋 [STEP 10] Responsável Financeiro ID:',
      responsavelFinanceiroId
    );
    console.log('📋 [STEP 10] Paciente ID:', pacienteId);

    // Buscar template de contrato ativo
    const { data: template, error: errorTemplate } = await supabase
      .from('contract_templates')
      .select('id, nome, conteudo_template')
      .eq('ativo', true)
      .order('versao', { ascending: false })
      .limit(1)
      .single();

    if (errorTemplate || !template) {
      console.error('❌ [STEP 10] Erro ao buscar template:', errorTemplate);
      throw new Error('Template de contrato não encontrado');
    }

    console.log('✅ [STEP 10] Template encontrado:', template.nome);

    // Substituir variáveis no template
    let conteudoFinal = template.conteudo_template;
    Object.entries(data.contractVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      conteudoFinal = conteudoFinal.replace(regex, value ?? '');
    });

    console.log('✅ [STEP 10] Variáveis substituídas no contrato');

    // Criar contrato assinado
    const { data: contrato, error: errorContrato } = await supabase
      .from('user_contracts')
      .insert({
        contract_template_id: template.id,
        pessoa_id: responsavelFinanceiroId,
        nome_contrato: `Contrato Fisioterapia - ${
          data.paciente.nome
        } - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo_final: conteudoFinal,
        variaveis_utilizadas: data.contractVariables,
        status_contrato: 'assinado',
        data_geracao: new Date().toISOString(),
        data_assinatura: new Date().toISOString(),
        assinatura_digital_id: `whatsapp_${
          data.whatsappJid || data.phoneNumber
        }_${Date.now()}`,
        ativo: true,
      })
      .select('id')
      .single();

    if (errorContrato || !contrato) {
      console.error('❌ [STEP 10] Erro ao criar contrato:', errorContrato);
      throw new Error('Erro ao criar contrato');
    }

    const contratoId = contrato.id;
    console.log('✅ [STEP 10] Contrato criado e assinado:', contratoId);

    // ============================================
    // STEP 11: Enviar webhook de confirmação (opcional)
    // ============================================
    console.log('📋 [STEP 11] Enviando webhook de confirmação...');
    const webhookUrl = Deno.env.get('REGISTRATION_WEBHOOK_URL');

    if (webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'patient_registered',
            pacienteId,
            responsavelLegalId,
            responsavelFinanceiroId,
            contratoId: contratoId,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!webhookResponse.ok) {
          console.warn(
            '⚠️ [STEP 11] Webhook retornou erro:',
            webhookResponse.status
          );
        } else {
          console.log('✅ [STEP 11] Webhook enviado com sucesso');
        }
      } catch (webhookError) {
        console.error('⚠️ [STEP 11] Erro ao enviar webhook:', webhookError);
        // Não falhar o cadastro por erro no webhook
      }
    } else {
      console.log('⏭️ [STEP 11] Webhook não configurado');
    }

    // ============================================
    // FINALIZAÇÃO
    // ============================================
    console.log('🎉 [FINALIZAÇÃO] Cadastro concluído com sucesso!');
    console.log('📋 [FINALIZAÇÃO] IDs criados:', {
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: contratoId,
    });

    const result = {
      success: true,
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: contratoId,
      message: 'Cadastro realizado com sucesso!',
    };

    // Salvar log de sucesso
    try {
      await supabase.from('public_registration_api_logs').insert({
        session_id: sessionId,
        http_status: 200,
        duration_ms: Date.now() - startTime,
        edge_function_version: 37, // AI dev note: Incrementar versão
        paciente_id: pacienteId,
        responsavel_legal_id: responsavelLegalId,
        responsavel_financeiro_id: responsavelFinanceiroId,
        contrato_id: contratoId,
      });
    } catch (logError) {
      console.warn('⚠️ [LOGGING] Erro ao salvar log (ignorado):', logError);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ [ERROR] Erro fatal no cadastro:', error);
    console.error(
      '❌ [ERROR] Stack trace:',
      error instanceof Error ? error.stack : 'N/A'
    );
    console.error('❌ [ERROR] Tipo do erro:', typeof error);
    console.error(
      '❌ [ERROR] Error completo:',
      JSON.stringify(error, Object.getOwnPropertyNames(error))
    );

    const result = {
      success: false,
      error:
        error instanceof Error
          ? `${error.message}\n\nStack: ${error.stack}`
          : String(error),
    };

    // Salvar log de erro
    try {
      await supabase.from('public_registration_api_logs').insert({
        session_id: sessionId,
        http_status: 500,
        duration_ms: Date.now() - startTime,
        edge_function_version: 37, // AI dev note: Incrementar versão
        error_type: 'database_error',
        error_details: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    } catch (logError) {
      console.warn(
        '⚠️ [LOGGING] Erro ao salvar log de erro (ignorado):',
        logError
      );
    }

    // Inserir na fila de webhook para notificar erro
    try {
      await supabase.from('webhook_queue').insert({
        evento: 'registration_error',
        payload: {
          tipo: 'registration_error',
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          metadata: {
            ip_address: req.headers.get('x-forwarded-for'),
            user_agent: req.headers.get('user-agent'),
            edge_function_version: 37,
          },
        },
        status: 'pendente',
        tentativas: 0,
        max_tentativas: 3,
      });
    } catch (webhookError) {
      console.warn(
        '⚠️ [WEBHOOK] Erro ao inserir webhook de erro (ignorado):',
        webhookError
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
