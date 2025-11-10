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
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;

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
    // Buscar endereço existente
    const { data: existing } = await supabase
      .from('enderecos')
      .select('id')
      .eq('cep', addressData.cep.replace(/\D/g, ''))
      .single();

    if (existing) {
      return existing.id;
    }

    // Criar novo endereço
    // AI dev note: estado deve ter exatamente 2 caracteres (sigla UF)
    if (!addressData.estado || addressData.estado.length !== 2) {
      throw new Error('Estado (UF) deve ter exatamente 2 caracteres (ex: SP, RJ, MG)');
    }

    const { data, error } = await supabase
      .from('enderecos')
      .insert({
        cep: addressData.cep.replace(/\D/g, ''),
        logradouro: addressData.logradouro || '',
        bairro: addressData.bairro || '',
        cidade: addressData.cidade || '',
        estado: addressData.estado,
        ativo: true,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error('Erro ao criar endereço:', err);
    throw err;
  }
}

// Buscar ou criar/reativar responsável
async function getOrCreateResponsible(data: AdminPatientData): Promise<string> {
  try {
    const phoneNumber = extractPhoneFromJID(data.jidResponsavel);

    // Se já tem ID, verificar se precisa reativar
    if (data.responsavelId) {
      const { data: pessoa, error: fetchError } = await supabase
        .from('pessoas')
        .select('ativo')
        .eq('id', data.responsavelId)
        .single();

      if (fetchError) throw fetchError;

      // Reativar se estiver inativo
      if (!pessoa.ativo) {
        const { error: updateError } = await supabase
          .from('pessoas')
          .update({ ativo: true })
          .eq('id', data.responsavelId);

        if (updateError) throw updateError;
      }

      return data.responsavelId;
    }

    // Criar novo responsável
    const enderecoId =
      data.enderecoId ||
      (await getOrCreateAddress({
        cep: data.cep!,
        logradouro: data.logradouro,
        bairro: data.bairro,
        cidade: data.cidade,
        estado: data.estado,
      }));

    const { data: tipoResponsavel } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'responsavel')
      .single();

    const { data: newPessoa, error } = await supabase
      .from('pessoas')
      .insert({
        nome: data.nomeResponsavel!,
        cpf_cnpj: data.cpfResponsavel!.replace(/\D/g, ''),
        email: data.emailResponsavel,
        telefone: phoneNumber,
        id_tipo_pessoa: tipoResponsavel?.id,
        id_endereco: enderecoId,
        numero_endereco: data.numeroEndereco,
        complemento_endereco: data.complementoEndereco,
        ativo: true,
      })
      .select('id')
      .single();

    if (error) throw error;
    return newPessoa.id;
  } catch (err) {
    console.error('Erro ao criar responsável:', err);
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
    // Verificar permissões
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return { success: false, error: 'Usuário não autenticado' };
    }

    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('role')
      .eq('auth_user_id', user.user.id)
      .single();

    if (!pessoa || !['admin', 'secretaria'].includes(pessoa.role || '')) {
      return {
        success: false,
        error: 'Sem permissão para cadastrar pacientes',
      };
    }

    // 1. Criar/buscar responsável legal
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
    let enderecoPacienteId: string;
    if (data.usarEnderecoResponsavel) {
      // Buscar endereço do responsável
      const { data: responsavelData } = await supabase
        .from('pessoas')
        .select('id_endereco')
        .eq('id', responsavelLegalId)
        .single();

      enderecoPacienteId = responsavelData?.id_endereco;
    } else {
      // AI dev note: Paciente tem endereço próprio - usar dados que vieram do frontend
      // Os dados completos (logradouro, bairro, cidade, estado) já foram buscados via ViaCEP no frontend
      if (!data.logradouro || !data.bairro || !data.cidade || !data.estado) {
        // Fallback: buscar via ViaCEP se dados não vieram do frontend
        const cleanCep = data.cepPaciente!.replace(/\D/g, '');
        const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
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
    const { data: tipoPaciente } = await supabase
      .from('pessoa_tipos')
      .select('id')
      .eq('codigo', 'paciente')
      .single();

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

    // 6. Criar paciente
    const { data: newPaciente, error: pacienteError } = await supabase
      .from('pessoas')
      .insert({
        nome: data.nomePaciente,
        cpf_cnpj: data.cpfPaciente.replace(/\D/g, ''),
        email: data.emailPaciente,
        data_nascimento: data.dataNascimentoPaciente,
        sexo: data.sexoPaciente,
        id_tipo_pessoa: tipoPaciente?.id,
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
      .single();

    if (pacienteError) throw pacienteError;

    // 7. Criar relacionamento paciente-responsável legal
    // Se paciente é maior de idade, ele pode ser seu próprio responsável
    const responsavelRelacionamentoId =
      idade >= 18 ? newPaciente.id : responsavelLegalId;

    const { error: relacionamentoError } = await supabase
      .from('pessoa_responsaveis')
      .insert({
        id_pessoa: newPaciente.id,
        id_responsavel: responsavelRelacionamentoId,
        tipo_responsabilidade: 'legal',
        ativo: true,
      });

    if (relacionamentoError) {
      console.error('Erro ao criar relacionamento:', relacionamentoError);
    }

    // 8. Criar relacionamento com responsável financeiro (se diferente)
    if (responsavelFinanceiroId !== responsavelRelacionamentoId) {
      await supabase.from('pessoa_responsaveis').insert({
        id_pessoa: newPaciente.id,
        id_responsavel: responsavelFinanceiroId,
        tipo_responsabilidade: 'financeiro',
        ativo: true,
      });
    }

    // 9. Vincular pediatra (se selecionado)
    if (data.pediatraId) {
      await supabase.from('paciente_pediatra').insert({
        paciente_id: newPaciente.id,
        pediatra_id: data.pediatraId,
        ativo: true,
      });
    }

    return {
      success: true,
      patientId: newPaciente.id,
    };
  } catch (err) {
    console.error('Erro ao criar paciente:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao criar paciente',
    };
  }
}
