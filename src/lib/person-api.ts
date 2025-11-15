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
      autorizacao_uso_do_nome,
      created_at,
      updated_at,
      id_tipo_pessoa,
      id_endereco,
      responsavel_cobranca_id
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
        autorizacao_uso_do_nome,
        created_at,
        updated_at,
        id_tipo_pessoa,
        id_endereco,
        responsavel_cobranca_id
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

    // AI dev note: Buscar tipo de pessoa, endereço e responsável pela cobrança separadamente para evitar erro 406
    const [tipoResult, enderecoResult, responsavelCobrancaResult] =
      await Promise.all([
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
        data.responsavel_cobranca_id
          ? supabase
              .from('pessoas')
              .select('nome')
              .eq('id', data.responsavel_cobranca_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);

    const { data: tipoData } = tipoResult;
    const { data: enderecoData } = enderecoResult;
    const { data: responsavelCobrancaData } = responsavelCobrancaResult;

    // AI dev note: Buscar dados de responsáveis se for paciente
    let nomes_responsaveis: string | undefined = undefined;
    let responsavel_legal_id: string | undefined = undefined;
    let responsavel_legal_nome: string | undefined = undefined;
    let responsavel_legal_email: string | undefined = undefined;
    let responsavel_legal_telefone: number | undefined = undefined;
    let responsavel_financeiro_id: string | undefined = undefined;
    let responsavel_financeiro_nome: string | undefined = undefined;
    let responsavel_financeiro_email: string | undefined = undefined;
    let responsavel_financeiro_telefone: number | undefined = undefined;

    const personType = tipoData?.codigo;

    if (personType === 'paciente') {
      const { data: responsaveisData } = await supabase
        .from('pessoa_responsaveis')
        .select(
          `
          id_responsavel,
          tipo_responsabilidade,
          pessoas!pessoa_responsaveis_id_responsavel_fkey(id, nome, email, telefone)
        `
        )
        .eq('id_pessoa', personId)
        .eq('ativo', true);

      if (responsaveisData && responsaveisData.length > 0) {
        const nomes: string[] = [];

        responsaveisData.forEach((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pessoa = r.pessoas as any;
          if (pessoa?.nome) {
            nomes.push(pessoa.nome);

            // Mapear responsável legal
            if (
              r.tipo_responsabilidade === 'legal' ||
              r.tipo_responsabilidade === 'ambos'
            ) {
              responsavel_legal_id = pessoa.id;
              responsavel_legal_nome = pessoa.nome;
              responsavel_legal_email = pessoa.email;
              responsavel_legal_telefone = pessoa.telefone;
            }

            // Mapear responsável financeiro
            if (
              r.tipo_responsabilidade === 'financeiro' ||
              r.tipo_responsabilidade === 'ambos'
            ) {
              responsavel_financeiro_id = pessoa.id;
              responsavel_financeiro_nome = pessoa.nome;
              responsavel_financeiro_email = pessoa.email;
              responsavel_financeiro_telefone = pessoa.telefone;
            }
          }
        });

        nomes_responsaveis = nomes.length > 0 ? nomes.join(' | ') : undefined;
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
      autorizacao_uso_nome: data.autorizacao_uso_do_nome,
      created_at: data.created_at,
      updated_at: data.updated_at,
      nomes_responsaveis,

      // Campos de responsáveis individuais
      responsavel_legal_id,
      responsavel_legal_nome,
      responsavel_legal_email,
      responsavel_legal_telefone,
      responsavel_financeiro_id,
      responsavel_financeiro_nome,
      responsavel_financeiro_email,
      responsavel_financeiro_telefone,

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

      // Campos obrigatórios adicionados recentemente
      responsavel_cobranca_id: data.responsavel_cobranca_id || data.id, // Default para própria pessoa se não definido
      responsavel_cobranca_nome:
        responsavelCobrancaData?.nome || data.nome || 'Não definido',
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

/**
 * Salvar anamnese de pessoa
 * AI dev note: Anamnese agora é permanente e vinculada diretamente à pessoa
 */
export const savePersonAnamnesis = async (
  personId: string,
  content: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        anamnese: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', personId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Erro ao salvar anamnese da pessoa:', error);
    throw error;
  }
};

/**
 * Buscar observações de pessoa
 * AI dev note: Observações são permanentes e vinculadas diretamente à pessoa
 */
export const fetchPersonObservations = async (
  personId: string
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('observacoes')
      .eq('id', personId)
      .single();

    if (error) {
      console.error('Erro ao buscar observações:', error);
      return null;
    }

    return data?.observacoes || null;
  } catch (error) {
    console.error('Erro ao buscar observações da pessoa:', error);
    return null;
  }
};

/**
 * Salvar observações de pessoa
 * AI dev note: Observações são permanentes e vinculadas diretamente à pessoa
 */
export const savePersonObservations = async (
  personId: string,
  content: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        observacoes: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', personId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Erro ao salvar observações da pessoa:', error);
    throw error;
  }
};
