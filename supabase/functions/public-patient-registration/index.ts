// AI dev note: Edge Function para finalizar cadastro público de paciente
// Cria todas as entidades no banco de dados seguindo a ordem correta
// Logs detalhados em cada etapa para rastreamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

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

  contratoId: string;
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
        contratoId: data.contratoId,
      })
    );

    if (action !== 'finalize_registration') {
      throw new Error(`Ação desconhecida: ${action}`);
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

    let enderecoId: string;

    const { data: enderecoExistente, error: errorEnderecoSearch } =
      await supabase
        .from('enderecos')
        .select('id')
        .eq('cep', data.endereco.cep)
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
          cep: data.endereco.cep,
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
      console.log('📋 [STEP 3] Dados:', {
        nome: data.responsavelLegal?.nome,
        cpf: data.responsavelLegal?.cpf,
        email: data.responsavelLegal?.email,
        telefone: data.phoneNumber,
      });

      const { data: novoResponsavelLegal, error: errorResponsavelLegal } =
        await supabase
          .from('pessoas')
          .insert({
            nome: data.responsavelLegal!.nome,
            cpf_cnpj: data.responsavelLegal!.cpf,
            telefone: data.phoneNumber,
            email: data.responsavelLegal!.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId,
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: null, // Será atualizado no próximo passo
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
    } else if (data.newPersonData) {
      // CENÁRIO 3: Nova pessoa (não encontrada por CPF)
      console.log('📋 [STEP 4] Criando novo responsável financeiro...');
      console.log('📋 [STEP 4] Dados:', {
        nome: data.newPersonData.nome,
        cpf: data.newPersonData.cpf,
        email: data.newPersonData.email,
        whatsapp: data.newPersonData.whatsapp,
      });

      // Usar mesmo endereço do responsável legal (conforme decisão do usuário)
      console.log('✅ [STEP 4] Usando mesmo endereço do responsável legal');

      console.log('📋 [STEP 4] Inserindo nova pessoa financeira...');
      const { data: novoResponsavelFin, error: errorResponsavelFin } =
        await supabase
          .from('pessoas')
          .insert({
            nome: data.newPersonData.nome,
            cpf_cnpj: data.newPersonData.cpf,
            telefone: data.newPersonData.whatsapp,
            email: data.newPersonData.email,
            id_tipo_pessoa: tipoResponsavel.id,
            id_endereco: enderecoId, // Mesmo endereço do responsável legal
            numero_endereco: data.endereco.numero,
            complemento_endereco: data.endereco.complemento || null,
            responsavel_cobranca_id: null, // Será atualizado
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

      const { data: tipoPediatra, error: errorTipoPediatra } = await supabase
        .from('pessoa_tipos')
        .select('id')
        .eq('codigo', 'pediatra')
        .single();

      if (errorTipoPediatra || !tipoPediatra) {
        console.error(
          '❌ [STEP 5] Erro ao buscar tipo pediatra:',
          errorTipoPediatra
        );
        throw new Error('Tipo de pessoa "pediatra" não encontrado');
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

    // Converter data de dd/mm/aaaa para aaaa-mm-dd
    const [dia, mes, ano] = data.paciente.dataNascimento.split('/');
    const dataNascimentoISO = `${ano}-${mes}-${dia}`;

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
    // STEP 7: Criar RELACIONAMENTO paciente ↔ responsável legal
    // ============================================
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

    // ============================================
    // STEP 8: Criar RELACIONAMENTO paciente ↔ responsável financeiro (se diferente)
    // ============================================
    if (responsavelFinanceiroId !== responsavelLegalId) {
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
    } else {
      console.log('⏭️ [STEP 8] Pulando (responsável financeiro = legal)');
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
    // STEP 10: Atualizar CONTRATO com ID do paciente
    // ============================================
    console.log('📋 [STEP 10] Atualizando contrato...');
    console.log('📋 [STEP 10] Contrato ID:', data.contratoId);
    console.log('📋 [STEP 10] Paciente ID:', pacienteId);

    const { error: errorContrato } = await supabase
      .from('user_contracts')
      .update({
        pessoa_id: pacienteId,
        assinado_em: new Date().toISOString(),
      })
      .eq('id', data.contratoId);

    if (errorContrato) {
      console.error('❌ [STEP 10] Erro ao atualizar contrato:', errorContrato);
      throw new Error('Erro ao atualizar contrato');
    }
    console.log('✅ [STEP 10] Contrato atualizado e assinado');

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
            contratoId: data.contratoId,
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
      contratoId: data.contratoId,
    });

    const result: FinalizationResult = {
      success: true,
      pacienteId,
      responsavelLegalId,
      responsavelFinanceiroId,
      contratoId: data.contratoId,
      message: 'Cadastro realizado com sucesso!',
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ [ERROR] Erro fatal no cadastro:', error);

    const result: FinalizationResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
