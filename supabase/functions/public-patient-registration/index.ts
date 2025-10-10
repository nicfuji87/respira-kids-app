// AI dev note: Edge Function para finalizar cadastro público de paciente
// Cria todas as entidades no banco de dados seguindo a ordem correta
// Logs detalhados em cada etapa para rastreamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface FinalizationData {
  whatsappJid?: string;
  phoneNumber?: string;
  existingPersonId?: string;
  existingUserData?: {
    id: string;
    nome: string;
    cpf_cnpj?: string;
    telefone?: string;
    email?: string;
    tipo_responsabilidade?: string;
  };

  responsavelLegal?: {
    nome: string;
    cpf: string;
    email: string;
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

  responsavelFinanceiroMesmoQueLegal: boolean;
  responsavelFinanceiroExistingId?: string; // ID de pessoa existente buscada por CPF
  newPersonData?: {
    // Se é pessoa nova (não encontrada por CPF)
    cpf: string;
    nome: string;
    email: string;
    whatsapp: string;
    whatsappJid: string;
  };

  paciente: {
    nome: string;
    dataNascimento: string;
    sexo: 'M' | 'F';
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

  // AI dev note: Variáveis do contrato (Edge Function cria o contrato após criar as pessoas)
  contractVariables: Record<string, string>;
}

interface FinalizationResult {
  success: boolean;
  pacienteId?: string;
  responsavelLegalId?: string;
  responsavelFinanceiroId?: string;
  contratoId?: string;
  message?: string;
  error?: string;
}

// AI dev note: Helper para extrair telefone do JID do WhatsApp
// Remove o sufixo @s.whatsapp.net e retorna apenas os números
function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data } = (await req.json()) as {
      action: string;
      data: FinalizationData;
    };

    console.log('🚀 [PUBLIC-PATIENT-REGISTRATION] Iniciando cadastro público');
    console.log('📋 [STEP 0] Ação:', action);
    console.log(
      '📋 [STEP 0] Dados recebidos:',
      JSON.stringify({
        hasExistingUser: !!data.existingPersonId,
        hasResponsavelLegal: !!data.responsavelLegal,
        responsavelFinanceiroMesmoQueLegal:
          data.responsavelFinanceiroMesmoQueLegal,
        responsavelFinanceiroExistingId: data.responsavelFinanceiroExistingId,
        hasNewPersonData: !!data.newPersonData,
        pacienteNome: data.paciente.nome,
        pediatraId: data.pediatra.id,
        hasContractVariables: !!data.contractVariables,
      })
    );

    if (action !== 'finalize_registration') {
      throw new Error(`Ação desconhecida: ${action}`);
    }

    // Validar variáveis do contrato
    if (!data.contractVariables) {
      throw new Error('Variáveis do contrato são obrigatórias');
    }

    // ============================================
    // STEP 1: Buscar TIPOS DE PESSOA
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

    const { data: enderecoExistente, error: errorEnderecoSearch } =
      await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', cepNormalizado)
        .eq('logradouro', data.endereco.logradouro)
        .eq('bairro', data.endereco.bairro)
        .eq('cidade', data.endereco.cidade)
        .eq('estado', data.endereco.estado)
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
      console.log('✅ [STEP 2] Endereço já existe:', enderecoId);
    } else {
      console.log('📋 [STEP 2] Criando novo endereço...');
      const { data: novoEndereco, error: errorEnderecoInsert } = await supabase
        .from('enderecos')
        .insert({
          cep: cepNormalizado, // AI dev note: Usar CEP normalizado sem formatação
          logradouro: data.endereco.logradouro,
          bairro: data.endereco.bairro,
          cidade: data.endereco.cidade,
          estado: data.endereco.estado,
          ativo: true,
        })
        .select('id')
        .single();

      if (errorEnderecoInsert || !novoEndereco) {
        console.error(
          '❌ [STEP 2] Erro ao criar endereço:',
          errorEnderecoInsert
        );
        throw new Error('Erro ao criar endereço');
      }

      enderecoId = novoEndereco.id;
      console.log('✅ [STEP 2] Novo endereço criado:', enderecoId);
    }

    // ============================================
    // STEP 3: Criar ou Usar RESPONSÁVEL LEGAL
    // ============================================
    let responsavelLegalId: string;

    if (data.existingPersonId && data.existingUserData) {
      // Usar pessoa existente como responsável legal
      responsavelLegalId = data.existingPersonId;
      console.log(
        '✅ [STEP 3] Usando pessoa existente como responsável legal:',
        responsavelLegalId
      );

      // Atualizar endereço se necessário
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

      // AI dev note: Telefone deve ser o JID (formato internacional completo, ex: 556181446666)
      const telefoneResponsavelLegal = data.whatsappJid
        ? extractPhoneFromJid(data.whatsappJid)
        : data.phoneNumber;

      console.log('📋 [STEP 3] Dados:', {
        nome: data.responsavelLegal?.nome,
        cpf: data.responsavelLegal?.cpf,
        email: data.responsavelLegal?.email,
        telefone: telefoneResponsavelLegal,
      });

      // AI dev note: responsavel_cobranca_id é NOT NULL, então NÃO podemos passar null.
      // Vamos inserir um UUID temporário e depois fazer UPDATE.
      const tempId = crypto.randomUUID();

      const { data: novoResponsavelLegal, error: errorResponsavelLegal } =
        await supabase
          .from('pessoas')
          .insert({
            id: tempId, // AI dev note: Usar ID fixo temporário para poder referenciar em responsavel_cobranca_id
            nome: data.responsavelLegal!.nome,
            cpf_cnpj: data.responsavelLegal!.cpf,
            telefone: telefoneResponsavelLegal, // AI dev note: JID do WhatsApp (formato internacional)
            email: data.responsavelLegal!.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId,
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: tempId, // AI dev note: Auto-referência temporária
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

      // STEP 3.1: Atualizar AUTO-REFERÊNCIA (responsavel_cobranca_id = próprio ID)
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
      // CENÁRIO 1: Mesmo que responsável legal
      responsavelFinanceiroId = responsavelLegalId;
      console.log(
        '✅ [STEP 4] Responsável financeiro = legal:',
        responsavelFinanceiroId
      );
    } else if (data.responsavelFinanceiroExistingId) {
      // CENÁRIO 2: Pessoa existente (encontrada por CPF)
      responsavelFinanceiroId = data.responsavelFinanceiroExistingId;
      console.log(
        '✅ [STEP 4] Usando responsável financeiro existente:',
        responsavelFinanceiroId
      );

      // Verificar se a pessoa existe
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

      // AI dev note: Atualizar endereço do responsável financeiro existente para o endereço do cadastro
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
      // CENÁRIO 3: Nova pessoa (não encontrada por CPF)
      console.log('📋 [STEP 4] Criando novo responsável financeiro...');

      // AI dev note: Telefone deve ser o JID (formato internacional completo, ex: 556181446666)
      const telefoneResponsavelFin = data.newPersonData.whatsappJid
        ? extractPhoneFromJid(data.newPersonData.whatsappJid)
        : data.newPersonData.whatsapp;

      console.log('📋 [STEP 4] Dados:', {
        nome: data.newPersonData.nome,
        cpf: data.newPersonData.cpf,
        email: data.newPersonData.email,
        telefone: telefoneResponsavelFin,
      });

      // Usar mesmo endereço do responsável legal (conforme decisão do usuário)
      console.log('✅ [STEP 4] Usando mesmo endereço do responsável legal');

      console.log('📋 [STEP 4] Inserindo nova pessoa financeira...');
      // AI dev note: responsavel_cobranca_id é NOT NULL, então criamos ID temporário
      const tempFinId = crypto.randomUUID();

      const { data: novoResponsavelFin, error: errorResponsavelFin } =
        await supabase
          .from('pessoas')
          .insert({
            id: tempFinId, // AI dev note: Usar ID fixo temporário
            nome: data.newPersonData.nome,
            cpf_cnpj: data.newPersonData.cpf,
            telefone: telefoneResponsavelFin, // AI dev note: JID do WhatsApp (formato internacional)
            email: data.newPersonData.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId, // Mesmo endereço do responsável legal
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: tempFinId, // AI dev note: Auto-referência temporária
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

      // Atualizar auto-referência do responsável financeiro
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
    // STEP 5: Buscar ou Criar PEDIATRA
    // ============================================
    console.log('📋 [STEP 5] Processando pediatra...');
    let pediatraId: string;

    if (data.pediatra.id) {
      // Pediatra existente selecionado
      pediatraId = data.pediatra.id;
      console.log('✅ [STEP 5] Usando pediatra existente:', pediatraId);
    } else {
      // Criar novo pediatra
      console.log('📋 [STEP 5] Criando novo pediatra...');
      console.log('📋 [STEP 5] Nome:', data.pediatra.nome);
      console.log('📋 [STEP 5] CRM:', data.pediatra.crm || 'não fornecido');

      // AI dev note: O tipo correto é 'medico' (Médico Pediatra), não 'pediatra'
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

      // Criar pessoa do pediatra
      const { data: novoPediatra, error: errorPediatra } = await supabase
        .from('pessoas')
        .insert({
          nome: data.pediatra.nome,
          id_tipo_pessoa: tipoPediatra.id,
          responsavel_cobranca_id: responsavelFinanceiroId, // Temporário
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

      // Criar registro em pessoa_pediatra
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

    // AI dev note: Data já vem em formato ISO (yyyy-mm-dd) do frontend
    const dataNascimentoISO = data.paciente.dataNascimento;

    const { data: novoPaciente, error: errorPaciente } = await supabase
      .from('pessoas')
      .insert({
        nome: data.paciente.nome,
        data_nascimento: dataNascimentoISO,
        sexo: data.paciente.sexo,
        cpf_cnpj: data.paciente.cpf || null,
        id_tipo_pessoa: tipoPaciente.id,
        id_endereco: enderecoId, // Mesmo endereço do responsável legal
        numero_endereco: data.endereco.numero,
        complemento_endereco: data.endereco.complemento || null,
        responsavel_cobranca_id: responsavelFinanceiroId, // ⚠️ CRÍTICO
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
    // STEP 7 & 8: Criar RELACIONAMENTOS paciente ↔ responsáveis
    // ============================================
    if (responsavelFinanceiroId === responsavelLegalId) {
      // Mesma pessoa: criar um único relacionamento com tipo 'ambos'
      console.log(
        '📋 [STEP 7] Criando relacionamento paciente ↔ responsável (legal e financeiro)...'
      );
      const { error: errorRelAmbos } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: pacienteId,
          id_responsavel: responsavelLegalId,
          tipo_responsabilidade: 'ambos', // AI dev note: Usar 'ambos' quando é a mesma pessoa
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
      // Pessoas diferentes: criar dois relacionamentos separados
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
    // STEP 9: Criar RELACIONAMENTO paciente ↔ pediatra
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
    // STEP 10: CRIAR E ASSINAR CONTRATO
    // ============================================
    console.log('📋 [STEP 10] Criando contrato...');
    console.log(
      '📋 [STEP 10] Responsável Financeiro ID:',
      responsavelFinanceiroId
    );
    console.log('📋 [STEP 10] Paciente ID:', pacienteId);

    // 1. Buscar template ativo
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

    // 2. Substituir variáveis no template
    let conteudoFinal = template.conteudo_template;
    Object.entries(data.contractVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      conteudoFinal = conteudoFinal.replace(regex, value ?? '');
    });

    console.log('✅ [STEP 10] Variáveis substituídas no contrato');

    // 3. Criar contrato no banco
    const { data: contrato, error: errorContrato } = await supabase
      .from('user_contracts')
      .insert({
        contract_template_id: template.id,
        pessoa_id: responsavelFinanceiroId, // Contrato no nome do resp. financeiro
        nome_contrato: `Contrato Fisioterapia - ${data.paciente.nome} - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo_final: conteudoFinal,
        variaveis_utilizadas: data.contractVariables,
        status_contrato: 'assinado',
        data_geracao: new Date().toISOString(),
        data_assinatura: new Date().toISOString(),
        assinatura_digital_id: `whatsapp_${data.whatsappJid || data.phoneNumber}_${Date.now()}`,
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
    // STEP 11: Enviar webhook de confirmação (se configurado)
    // ============================================
    console.log('📋 [STEP 11] Enviando webhook de confirmação...');
    const webhookUrl = Deno.env.get('REGISTRATION_WEBHOOK_URL');

    if (webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
        // Não falhar a operação por causa do webhook
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

    const result: FinalizationResult = {
      success: true,
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: contratoId,
      message: 'Cadastro realizado com sucesso!',
    };

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

    const result: FinalizationResult = {
      success: false,
      error:
        error instanceof Error
          ? `${error.message}\n\nStack: ${error.stack}`
          : String(error),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // AI dev note: SEMPRE 200 para o Supabase client ler o body!
    });
  }
});
