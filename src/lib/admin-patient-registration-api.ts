import { supabase } from './supabase';

export interface AdminPatientData {
  // WhatsApp
  whatsappResponsavel: string;
  jidResponsavel: string;

  // Responsável Legal
  responsavelId?: string; // Se já existe
  nomeResponsavel?: string;
  cpfResponsavel?: string;
  emailResponsavel?: string;

  // Endereço
  enderecoId?: string; // Se já existe
  cep?: string;
  logradouro?: string;
  numeroEndereco?: string;
  complementoEndereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;

  // Paciente
  nomePaciente: string;
  cpfPaciente: string;
  dataNascimentoPaciente: string;
  sexoPaciente: string;
  emailPaciente?: string;
  usarEnderecoResponsavel: boolean;
  cepPaciente?: string;
  numeroEnderecoPaciente?: string;
  complementoPaciente?: string;
  // AI dev note: logradouro, bairro, cidade, estado do paciente
  // usam os mesmos campos da seção Endereço (não duplicar)

  // Responsável Financeiro
  responsavelFinanceiroId?: string;
  isResponsavelFinanceiroIgualLegal: boolean;

  // Pediatra
  pediatraId?: string;

  // Autorizações
  autorizacoes: {
    uso_imagem_tratamento: boolean;
    uso_imagem_educacional: boolean;
    uso_imagem_marketing: boolean;
    compartilhamento_equipe: boolean;
    [key: string]: boolean;
  };
}

// AI dev note: Extrai número do JID removendo @s.whatsapp.net
export function extractPhoneFromJID(jid: string): string {
  return jid.split('@')[0];
}

// Buscar ou criar endereço
async function getOrCreateAddress(addressData: {
  cep: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}) {
  try {
    // Normalizar CEP
    const cleanCep = addressData.cep.replace(/\D/g, '');

    console.log('🔍 [getOrCreateAddress] Buscando endereço por CEP:', cleanCep);

    // Buscar endereço existente
    const { data: existing, error: searchError } = await supabase
      .from('enderecos')
      .select('id')
      .eq('cep', cleanCep)
      .maybeSingle();

    if (searchError) {
      console.error(
        '❌ [getOrCreateAddress] Erro ao buscar endereço:',
        searchError
      );
      throw searchError;
    }

    if (existing) {
      console.log(
        '✅ [getOrCreateAddress] Endereço existente encontrado:',
        existing.id
      );
      return existing.id;
    }

    // Validar estado antes de criar
    if (!addressData.estado || addressData.estado.length !== 2) {
      throw new Error(
        'Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)'
      );
    }

    // Criar novo endereço
    console.log('🆕 [getOrCreateAddress] Criando novo endereço:', {
      cep: cleanCep,
      logradouro: addressData.logradouro,
      bairro: addressData.bairro,
      cidade: addressData.cidade,
      estado: addressData.estado,
    });

    const { data, error } = await supabase
      .from('enderecos')
      .insert({
        cep: cleanCep,
        logradouro: addressData.logradouro || '',
        bairro: addressData.bairro || '',
        cidade: addressData.cidade || '',
        estado: addressData.estado,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('❌ [getOrCreateAddress] Erro ao criar endereço:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Endereço não foi criado');
    }

    console.log('✅ [getOrCreateAddress] Novo endereço criado:', data.id);
    return data.id;
  } catch (err) {
    console.error('❌ [getOrCreateAddress] Erro geral:', err);
    throw err;
  }
}

// Buscar ou criar/reativar responsável
async function getOrCreateResponsible(data: AdminPatientData): Promise<string> {
  try {
    const phoneNumber = extractPhoneFromJID(data.jidResponsavel);
    console.log('📱 [getOrCreateResponsible] Telefone extraído:', phoneNumber);

    // Se já tem ID, verificar se precisa reativar
    if (data.responsavelId) {
      console.log(
        '🔍 [getOrCreateResponsible] Responsável já existe:',
        data.responsavelId
      );

      const { data: pessoa, error: fetchError } = await supabase
        .from('pessoas')
        .select('ativo')
        .eq('id', data.responsavelId)
        .maybeSingle();

      if (fetchError) {
        console.error(
          '❌ [getOrCreateResponsible] Erro ao buscar responsável:',
          fetchError
        );
        throw fetchError;
      }

      if (!pessoa) {
        throw new Error('Responsável não encontrado');
      }

      // Reativar se estiver inativo
      if (!pessoa.ativo) {
        console.log('🔄 [getOrCreateResponsible] Reativando responsável...');
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({ ativo: true })
          .eq('id', data.responsavelId);

        if (updateError) {
          console.error(
            '❌ [getOrCreateResponsible] Erro ao reativar:',
            updateError
          );
          throw updateError;
        }
      }

      console.log(
        '✅ [getOrCreateResponsible] Responsável validado:',
        data.responsavelId
      );
      return data.responsavelId;
    }

    // Criar novo responsável
    console.log('🆕 [getOrCreateResponsible] Criando novo responsável...');

    const enderecoId =
      data.enderecoId ||
      (await getOrCreateAddress({
        cep: data.cep!,
        logradouro: data.logradouro,
        bairro: data.bairro,
        cidade: data.cidade,
        estado: data.estado,
      }));

    const { data: tipoResponsavel, error: tipoError } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'responsavel')
      .maybeSingle();

    if (tipoError) {
      console.error(
        '❌ [getOrCreateResponsible] Erro ao buscar tipo responsável:',
        tipoError
      );
      throw tipoError;
    }

    if (!tipoResponsavel) {
      throw new Error('Tipo "responsável" não encontrado no sistema');
    }

    // Normalizar CPF
    const cleanCpf = data.cpfResponsavel!.replace(/\D/g, '');

    console.log('📝 [getOrCreateResponsible] Dados do novo responsável:', {
      nome: data.nomeResponsavel,
      cpf: cleanCpf,
      email: data.emailResponsavel,
      telefone: phoneNumber,
      endereco: enderecoId,
    });

    // AI dev note: Gerar UUID antecipadamente para usar como responsavel_cobranca_id
    // Responsável é seu próprio responsável financeiro (auto-responsabilidade)
    const { data: uuidData } = await supabase.rpc('gen_random_uuid');
    const newId = uuidData as string;

    console.log('🆔 [getOrCreateResponsible] UUID gerado:', newId);

    const { data: newPessoa, error } = await supabase
      .from('pessoas')
      .insert({
        id: newId,
        nome: data.nomeResponsavel!,
        cpf_cnpj: cleanCpf,
        email: data.emailResponsavel,
        telefone: phoneNumber,
        id_tipo_pessoa: tipoResponsavel.id,
        id_endereco: enderecoId,
        numero_endereco: data.numeroEndereco,
        complemento_endereco: data.complementoEndereco,
        responsavel_cobranca_id: newId, // Auto-responsabilidade
        ativo: true,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error(
        '❌ [getOrCreateResponsible] Erro ao criar responsável:',
        error
      );
      throw error;
    }

    if (!newPessoa) {
      throw new Error('Responsável não foi criado');
    }

    console.log(
      '✅ [getOrCreateResponsible] Novo responsável criado:',
      newPessoa.id
    );
    return newPessoa.id;
  } catch (err) {
    console.error('❌ [getOrCreateResponsible] Erro geral:', err);
    throw err;
  }
}

// Criar paciente administrativamente
export async function createPatientAdmin(data: AdminPatientData): Promise<{
  success: boolean;
  patientId?: string;
  error?: string;
}> {
  try {
    console.log('🚀 [createPatientAdmin] Iniciando criação de paciente...');

    // Verificar permissões
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      console.error('❌ [createPatientAdmin] Usuário não autenticado');
      return { success: false, error: 'Usuário não autenticado' };
    }

    const { data: pessoa, error: pessoaError } = await supabase
      .from('pessoas')
      .select('role')
      .eq('auth_user_id', user.user.id)
      .maybeSingle();

    if (pessoaError) {
      console.error(
        '❌ [createPatientAdmin] Erro ao verificar permissões:',
        pessoaError
      );
      return { success: false, error: 'Erro ao verificar permissões' };
    }

    if (!pessoa || !['admin', 'secretaria'].includes(pessoa.role || '')) {
      console.error(
        '❌ [createPatientAdmin] Sem permissão - role:',
        pessoa?.role
      );
      return {
        success: false,
        error: 'Sem permissão para cadastrar pacientes',
      };
    }

    console.log(
      '✅ [createPatientAdmin] Permissões validadas - role:',
      pessoa.role
    );

    // 1. Criar/buscar responsável legal
    console.log('👤 [createPatientAdmin] Processando responsável legal...');
    const responsavelLegalId = await getOrCreateResponsible(data);

    // 2. Determinar responsável financeiro
    let responsavelFinanceiroId = responsavelLegalId;
    if (
      !data.isResponsavelFinanceiroIgualLegal &&
      data.responsavelFinanceiroId
    ) {
      responsavelFinanceiroId = data.responsavelFinanceiroId;
    }

    // 3. Determinar endereço do paciente
    console.log('🏠 [createPatientAdmin] Processando endereço do paciente...');
    let enderecoPacienteId: string;
    if (data.usarEnderecoResponsavel) {
      console.log('📍 [createPatientAdmin] Usando endereço do responsável');
      // Buscar endereço do responsável
      const { data: responsavelData, error: enderecoError } = await supabase
        .from('pessoas')
        .select('id_endereco')
        .eq('id', responsavelLegalId)
        .maybeSingle();

      if (enderecoError) {
        console.error(
          '❌ [createPatientAdmin] Erro ao buscar endereço do responsável:',
          enderecoError
        );
        throw enderecoError;
      }

      if (!responsavelData?.id_endereco) {
        throw new Error('Responsável não possui endereço cadastrado');
      }

      enderecoPacienteId = responsavelData.id_endereco;
    } else {
      console.log('📍 [createPatientAdmin] Paciente tem endereço próprio');
      // AI dev note: Paciente tem endereço próprio - usar dados que vieram do frontend
      // Os dados completos (logradouro, bairro, cidade, estado) já foram buscados via ViaCEP no frontend
      if (!data.logradouro || !data.bairro || !data.cidade || !data.estado) {
        console.log(
          '🔄 [createPatientAdmin] Dados incompletos, buscando CEP via ViaCEP...'
        );
        // Fallback: buscar via ViaCEP se dados não vieram do frontend
        const cleanCep = data.cepPaciente!.replace(/\D/g, '');
        const viaCepResponse = await fetch(
          `https://viacep.com.br/ws/${cleanCep}/json/`
        );
        const viaCepData = await viaCepResponse.json();

        if (viaCepData.erro) {
          throw new Error('CEP não encontrado');
        }

        enderecoPacienteId = await getOrCreateAddress({
          cep: data.cepPaciente!,
          logradouro: viaCepData.logradouro,
          bairro: viaCepData.bairro,
          cidade: viaCepData.localidade,
          estado: viaCepData.uf,
        });
      } else {
        console.log(
          '✅ [createPatientAdmin] Usando dados de endereço do frontend'
        );
        // Usar dados que já vieram do frontend
        enderecoPacienteId = await getOrCreateAddress({
          cep: data.cepPaciente!,
          logradouro: data.logradouro,
          bairro: data.bairro,
          cidade: data.cidade,
          estado: data.estado, // Já vem com 2 caracteres do ViaCEP
        });
      }
    }

    // 4. Buscar tipo paciente
    console.log('🔍 [createPatientAdmin] Buscando tipo paciente...');
    const { data: tipoPaciente, error: tipoError } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'paciente')
      .maybeSingle();

    if (tipoError) {
      console.error(
        '❌ [createPatientAdmin] Erro ao buscar tipo paciente:',
        tipoError
      );
      throw tipoError;
    }

    if (!tipoPaciente) {
      throw new Error('Tipo "paciente" não encontrado no sistema');
    }

    // 5. Calcular idade do paciente
    const birthDate = new Date(data.dataNascimentoPaciente);
    const today = new Date();
    let idade = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      idade--;
    }

    console.log('👶 [createPatientAdmin] Idade calculada:', idade);

    // 6. Criar paciente
    // Normalizar CPF do paciente
    const cleanCpfPaciente = data.cpfPaciente.replace(/\D/g, '');

    console.log('📝 [createPatientAdmin] Criando paciente:', {
      nome: data.nomePaciente,
      cpf: cleanCpfPaciente,
      dataNascimento: data.dataNascimentoPaciente,
      sexo: data.sexoPaciente,
      endereco: enderecoPacienteId,
    });

    const { data: newPaciente, error: pacienteError } = await supabase
      .from('pessoas')
      .insert({
        nome: data.nomePaciente,
        cpf_cnpj: cleanCpfPaciente,
        email: data.emailPaciente,
        data_nascimento: data.dataNascimentoPaciente,
        sexo: data.sexoPaciente,
        id_tipo_pessoa: tipoPaciente.id,
        id_endereco: enderecoPacienteId,
        numero_endereco: data.usarEnderecoResponsavel
          ? undefined
          : data.numeroEnderecoPaciente,
        complemento_endereco: data.usarEnderecoResponsavel
          ? undefined
          : data.complementoPaciente,
        responsavel_cobranca_id: responsavelFinanceiroId,
        autorizacao_uso_cientifico: data.autorizacoes.uso_imagem_educacional,
        autorizacao_uso_redes_sociais: data.autorizacoes.uso_imagem_marketing,
        autorizacao_uso_do_nome: data.autorizacoes.compartilhamento_equipe,
        ativo: true,
      })
      .select('id')
      .maybeSingle();

    if (pacienteError) {
      console.error(
        '❌ [createPatientAdmin] Erro ao criar paciente:',
        pacienteError
      );
      throw pacienteError;
    }

    if (!newPaciente) {
      throw new Error('Paciente não foi criado');
    }

    console.log('✅ [createPatientAdmin] Paciente criado:', newPaciente.id);

    // 7. Criar relacionamento paciente-responsável legal
    // Se paciente é maior de idade, ele pode ser seu próprio responsável
    const responsavelRelacionamentoId =
      idade >= 18 ? newPaciente.id : responsavelLegalId;

    console.log(
      '🔗 [createPatientAdmin] Criando relacionamento com responsável legal:',
      responsavelRelacionamentoId
    );

    const { error: relacionamentoError } = await supabase
      .from('pessoa_responsaveis')
      .insert({
        id_pessoa: newPaciente.id,
        id_responsavel: responsavelRelacionamentoId,
        tipo_responsabilidade: 'legal',
        ativo: true,
      });

    if (relacionamentoError) {
      console.error(
        '❌ [createPatientAdmin] Erro ao criar relacionamento legal:',
        relacionamentoError
      );
    } else {
      console.log('✅ [createPatientAdmin] Relacionamento legal criado');
    }

    // 8. Criar relacionamento com responsável financeiro (se diferente)
    if (responsavelFinanceiroId !== responsavelRelacionamentoId) {
      console.log(
        '💰 [createPatientAdmin] Criando relacionamento com responsável financeiro:',
        responsavelFinanceiroId
      );

      const { error: financeiroError } = await supabase
        .from('pessoa_responsaveis')
        .insert({
          id_pessoa: newPaciente.id,
          id_responsavel: responsavelFinanceiroId,
          tipo_responsabilidade: 'financeiro',
          ativo: true,
        });

      if (financeiroError) {
        console.error(
          '❌ [createPatientAdmin] Erro ao criar relacionamento financeiro:',
          financeiroError
        );
      } else {
        console.log('✅ [createPatientAdmin] Relacionamento financeiro criado');
      }
    }

    // 9. Vincular pediatra (se selecionado)
    if (data.pediatraId) {
      console.log(
        '👨‍⚕️ [createPatientAdmin] Vinculando pediatra:',
        data.pediatraId
      );

      const { error: pediatraError } = await supabase
        .from('paciente_pediatra')
        .insert({
          paciente_id: newPaciente.id,
          pediatra_id: data.pediatraId,
          ativo: true,
        });

      if (pediatraError) {
        console.error(
          '❌ [createPatientAdmin] Erro ao vincular pediatra:',
          pediatraError
        );
      } else {
        console.log('✅ [createPatientAdmin] Pediatra vinculado');
      }
    }

    console.log(
      '🎉 [createPatientAdmin] Paciente criado com sucesso:',
      newPaciente.id
    );

    return {
      success: true,
      patientId: newPaciente.id,
    };
  } catch (err) {
    console.error('❌ [createPatientAdmin] Erro geral ao criar paciente:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao criar paciente',
    };
  }
}
