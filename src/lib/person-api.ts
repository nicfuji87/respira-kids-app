import { supabase } from './supabase';
import type { PersonDetails } from '@/types/patient-details';

// AI dev note: person-api.ts - API para buscar dados de qualquer pessoa (paciente/responsável/profissional)
// Aplica filtros de permissão conforme role do usuário: profissional não vê contato

export interface FetchPersonDetailsResponse {
  person: PersonDetails | null;
  error: string | null;
}

// Função para buscar detalhes de qualquer pessoa por ID com controle de permissão
export const fetchPersonDetails = async (
  personId: string,
  userRole?: 'admin' | 'profissional' | 'secretaria' | null
): Promise<FetchPersonDetailsResponse> => {
  try {
    if (!personId) {
      return { person: null, error: 'ID da pessoa é obrigatório' };
    }

    // AI dev note: Buscar pessoa com dados completos incluindo tipo e endereço
    // Aplicar filtro de campos conforme permissão do usuário
    const shouldHideContact = userRole === 'profissional';

    let selectFields = `
      id,
      nome,
      cpf_cnpj,
      data_nascimento,
      registro_profissional,
      especialidade,
      bio_profissional,
      foto_perfil,
      numero_endereco,
      complemento_endereco,
      ativo,
      autorizacao_uso_cientifico,
      autorizacao_uso_redes_sociais,
      "autorizacao_uso_do nome",
      created_at,
      updated_at,
      id_tipo_pessoa,
      id_endereco
    `;

    // Incluir email e telefone apenas se usuário tiver permissão
    if (!shouldHideContact) {
      selectFields = `
        id,
        nome,
        email,
        telefone,
        cpf_cnpj,
        data_nascimento,
        registro_profissional,
        especialidade,
        bio_profissional,
        foto_perfil,
        numero_endereco,
        complemento_endereco,
        ativo,
        autorizacao_uso_cientifico,
        autorizacao_uso_redes_sociais,
        "autorizacao_uso_do nome",
        created_at,
        updated_at,
        id_tipo_pessoa,
        id_endereco
      `;
    }

    const { data: personData, error: personError } = await supabase
      .from('pessoas')
      .select(selectFields)
      .eq('id', personId)
      .eq('ativo', true)
      .single();

    if (personError) {
      console.error('Erro ao buscar pessoa:', personError);
      return { person: null, error: 'Erro ao carregar dados da pessoa' };
    }

    if (!personData) {
      return { person: null, error: 'Pessoa não encontrada' };
    }

    // AI dev note: Fazer casting seguro dos dados do Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = personData as any;

    // AI dev note: Buscar tipo de pessoa e endereço separadamente para evitar erro 406
    const [tipoResult, enderecoResult] = await Promise.all([
      supabase
        .from('pessoa_tipos')
        .select('codigo, nome')
        .eq('id', data.id_tipo_pessoa)
        .single(),
      data.id_endereco
        ? supabase
            .from('enderecos')
            .select('cep, logradouro, bairro, cidade, estado')
            .eq('id', data.id_endereco)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const { data: tipoData } = tipoResult;
    const { data: enderecoData } = enderecoResult;

    // AI dev note: Buscar dados de responsáveis se for paciente
    let nomes_responsaveis: string | undefined = undefined;
    const personType = tipoData?.codigo;

    if (personType === 'paciente') {
      const { data: responsaveisData } = await supabase
        .from('pessoa_responsaveis')
        .select(
          `
          pessoas!pessoa_responsaveis_id_responsavel_fkey(nome),
          tipo_responsabilidade
        `
        )
        .eq('id_pessoa', personId)
        .eq('ativo', true);

      if (responsaveisData && responsaveisData.length > 0) {
        nomes_responsaveis = responsaveisData
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r) => (r.pessoas as any)?.nome)
          .filter((nome) => nome)
          .join(' | ');
      }
    }

    // Mapear para interface PersonDetails
    const person: PersonDetails = {
      id: data.id,
      nome: data.nome,
      email: shouldHideContact ? undefined : data.email,
      telefone: shouldHideContact ? undefined : data.telefone,
      role: null, // Campo obrigatório da SupabasePessoa
      auth_user_id: null,
      is_approved: true,
      profile_complete: true,
      bloqueado: false,
      cpf_cnpj: data.cpf_cnpj,
      data_nascimento: data.data_nascimento,
      registro_profissional: data.registro_profissional,
      especialidade: data.especialidade,
      bio_profissional: data.bio_profissional,
      foto_perfil: data.foto_perfil,
      numero_endereco: data.numero_endereco,
      complemento_endereco: data.complemento_endereco,
      ativo: data.ativo,
      autorizacao_uso_cientifico: data.autorizacao_uso_cientifico,
      autorizacao_uso_redes_sociais: data.autorizacao_uso_redes_sociais,
      autorizacao_uso_nome: data['autorizacao_uso_do nome'],
      created_at: data.created_at,
      updated_at: data.updated_at,
      nomes_responsaveis,

      // Campos específicos de PersonDetails
      tipo_pessoa: personType,
      pessoa_tipo_nome: tipoData?.nome,

      // Endereço se existir
      endereco: enderecoData
        ? {
            cep: enderecoData.cep,
            logradouro: enderecoData.logradouro,
            bairro: enderecoData.bairro,
            cidade: enderecoData.cidade,
            estado: enderecoData.estado,
          }
        : null,
    };

    return { person, error: null };
  } catch (error) {
    console.error('Erro inesperado ao buscar pessoa:', error);
    return { person: null, error: 'Erro inesperado ao carregar dados' };
  }
};

// Função para buscar anamnese de pessoa (se aplicável)
export const fetchPersonAnamnesis = async (
  personId: string
): Promise<string | null> => {
  try {
    // AI dev note: Anamnese só se aplica a pacientes
    const { data } = await supabase
      .from('pessoas')
      .select('id_tipo_pessoa')
      .eq('id', personId)
      .single();

    // Buscar tipo de pessoa separadamente
    const { data: tipoData } = await supabase
      .from('pessoa_tipos')
      .select('codigo')
      .eq('id', data?.id_tipo_pessoa)
      .single();

    const personType = tipoData?.codigo;

    if (personType !== 'paciente') {
      return null; // Anamnese só para pacientes
    }

    // Buscar anamnese da tabela correspondente (se existir)
    // Por enquanto retornar null, pode ser implementado posteriormente
    return null;
  } catch (error) {
    console.error('Erro ao buscar anamnese da pessoa:', error);
    return null;
  }
};

// Função para salvar anamnese de pessoa
export const savePersonAnamnesis = async (
  personId: string,
  content: string
): Promise<void> => {
  try {
    // AI dev note: Implementar salvamento de anamnese se necessário
    // Por enquanto só log, pode ser expandido posteriormente
    console.log('Salvando anamnese para pessoa:', personId, content);
  } catch (error) {
    console.error('Erro ao salvar anamnese da pessoa:', error);
    throw error;
  }
};
