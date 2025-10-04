// AI dev note: API específica para gerenciamento de pacientes
// Funções centralizadas para CRUD de dados de pacientes

import { supabase } from './supabase';
import { normalizeText } from './utils';
import type {
  PatientDetails,
  PatientConsent,
  PatientDetailsResponse,
} from '@/types/patient-details';
import type { PaginatedUsuarios, ApiResponse } from '@/types/usuarios';

/**
 * Buscar detalhes completos do paciente por ID
 * Inclui dados pessoais, responsáveis, endereço e consentimentos
 */
export async function fetchPatientDetails(
  patientId: string
): Promise<PatientDetailsResponse> {
  try {
    // AI dev note: View atualizada já inclui dados de endereço e responsáveis
    // Não precisa mais de JOIN com enderecos pois dados estão na view
    const { data, error } = await supabase
      .from('pacientes_com_responsaveis_view')
      .select('*')
      .eq('id', patientId)
      .single();

    if (error) {
      console.error('Erro ao buscar detalhes do paciente:', error);
      return { patient: null, error: error.message };
    }

    if (!data) {
      return { patient: null, error: 'Paciente não encontrado' };
    }

    // Mapear dados para interface PatientDetails
    // Endereço agora vem diretamente da view
    const patient: PatientDetails = {
      ...data,
      // AI dev note: Garantir que responsavel_cobranca_nome está sempre definido
      responsavel_cobranca_nome:
        data.responsavel_cobranca_nome || data.nome || 'Não definido',
      endereco: data.cep
        ? {
            cep: data.cep,
            logradouro: data.logradouro,
            bairro: data.bairro,
            cidade: data.cidade,
            estado: data.estado,
          }
        : null,
    };

    return { patient, error: undefined };
  } catch (err) {
    console.error('Erro ao buscar detalhes do paciente:', err);
    return {
      patient: null,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}

/**
 * Atualizar consentimentos do paciente
 */
export async function updatePatientConsents(
  patientId: string,
  consents: PatientConsent
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        autorizacao_uso_cientifico: consents.autorizacao_uso_cientifico,
        autorizacao_uso_redes_sociais: consents.autorizacao_uso_redes_sociais,
        autorizacao_uso_nome: consents.autorizacao_uso_nome,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao atualizar consentimentos:', err);
    throw err;
  }
}

/**
 * Atualizar anamnese do paciente
 */
export async function updatePatientAnamnesis(
  patientId: string,
  anamnese: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        anamnese: anamnese,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao atualizar anamnese:', err);
    throw err;
  }
}

/**
 * Buscar paciente por ID usando a API existente como fallback
 * Compatibilidade com fetchPacientes
 */
export async function getPatientById(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('*')
      .eq('id', patientId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  } catch (err) {
    console.error('Erro ao buscar paciente por ID:', err);
    throw err;
  }
}

/**
 * Buscar anamnese do paciente
 * Usa relatorio_evolucao com tipo 'anamnese' através dos agendamentos do paciente
 */
export async function fetchPatientAnamnesis(
  patientId: string
): Promise<string | null> {
  try {
    // Buscar tipo de relatório 'anamnese'
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'anamnese')
      .single();

    if (tipoError || !tipoData) {
      console.error('Erro ao buscar tipo anamnese:', tipoError);
      return null;
    }

    // AI dev note: Buscar anamnese através dos agendamentos do paciente
    // Anamnese está relacionada a agendamentos, não diretamente ao paciente
    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .select(
        `
        conteudo,
        agendamentos!inner(paciente_id)
      `
      )
      .eq('tipo_relatorio_id', tipoData.id)
      .eq('agendamentos.paciente_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao buscar anamnese:', error);
      return null;
    }

    return data?.conteudo || null;
  } catch (err) {
    console.error('Erro ao buscar anamnese do paciente:', err);
    return null;
  }
}

/**
 * Salvar anamnese do paciente
 * Cria/atualiza relatorio_evolucao com tipo 'anamnese' associado ao agendamento mais recente
 */
export async function savePatientAnamnesis(
  patientId: string,
  content: string
): Promise<void> {
  try {
    // Buscar tipo de relatório 'anamnese'
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'anamnese')
      .single();

    if (tipoError || !tipoData) {
      throw new Error('Tipo de relatório anamnese não encontrado');
    }

    // AI dev note: Buscar agendamento mais recente do paciente para associar anamnese
    // Anamnese deve estar relacionada a um agendamento real, não diretamente ao paciente
    const { data: agendamentoData, error: agendamentoError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('paciente_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (agendamentoError || !agendamentoData) {
      throw new Error(
        'Nenhum agendamento encontrado para este paciente. Crie um agendamento primeiro.'
      );
    }

    // Verificar se já existe anamnese para este paciente
    const { data: existingData } = await supabase
      .from('relatorio_evolucao')
      .select('id, id_agendamento')
      .eq('tipo_relatorio_id', tipoData.id)
      .in('id_agendamento', [agendamentoData.id])
      .single();

    if (existingData) {
      // Atualizar existente
      const { error } = await supabase
        .from('relatorio_evolucao')
        .update({
          conteudo: content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingData.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      // Criar novo associado ao agendamento mais recente
      const { error } = await supabase.from('relatorio_evolucao').insert({
        id_agendamento: agendamentoData.id,
        tipo_relatorio_id: tipoData.id,
        conteudo: content,
      });

      if (error) {
        throw new Error(error.message);
      }
    }
  } catch (err) {
    console.error('Erro ao salvar anamnese:', err);
    throw err;
  }
}

/**
 * Buscar evoluções do paciente para compilação de histórico
 */
export async function fetchPatientEvolutions(
  patientId: string
): Promise<string[]> {
  try {
    // Buscar tipo de relatório 'evolucao'
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'evolucao')
      .single();

    if (tipoError || !tipoData) {
      console.error('Erro ao buscar tipo evolução:', tipoError);
      return [];
    }

    // Buscar todas as evoluções do paciente
    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .select('conteudo, created_at')
      .eq('tipo_relatorio_id', tipoData.id)
      .contains('agendamentos', `{"paciente_id": "${patientId}"}`) // Relação via agendamentos
      .not('conteudo', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar evoluções:', error);
      return [];
    }

    return data?.map((item) => item.conteudo).filter(Boolean) || [];
  } catch (err) {
    console.error('Erro ao buscar evoluções do paciente:', err);
    return [];
  }
}

/**
 * Gerar histórico compilado usando Edge Function
 */
export async function generatePatientHistory(
  patientId: string,
  patientName: string,
  evolutions: string[]
): Promise<string> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/patient-history-ai`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          patientId,
          patientName,
          evolutions,
        }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Erro ao gerar histórico');
    }

    // Salvar histórico compilado
    await savePatientCompiledHistory(patientId, result.compiledHistory);

    return result.compiledHistory;
  } catch (err) {
    console.error('Erro ao gerar histórico compilado:', err);
    throw err;
  }
}

/**
 * Salvar histórico compilado
 */
export async function savePatientCompiledHistory(
  patientId: string,
  compiledHistory: string
): Promise<void> {
  try {
    // Buscar tipo de relatório 'relatorio_compilado_evolucoes'
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'relatorio_compilado_evolucoes')
      .single();

    if (tipoError || !tipoData) {
      throw new Error('Tipo de relatório compilado não encontrado');
    }

    // Sempre criar novo (histórico é versionado)
    const { error } = await supabase.from('relatorio_evolucao').insert({
      id_agendamento: patientId,
      tipo_relatorio_id: tipoData.id,
      conteudo: compiledHistory,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao salvar histórico compilado:', err);
    throw err;
  }
}

/**
 * Buscar histórico compilado mais recente
 */
export async function fetchPatientCompiledHistory(patientId: string): Promise<{
  history: string | null;
  lastGenerated: string | null;
}> {
  try {
    // Buscar tipo de relatório 'relatorio_compilado_evolucoes'
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'relatorio_compilado_evolucoes')
      .single();

    if (tipoError || !tipoData) {
      return { history: null, lastGenerated: null };
    }

    // Buscar histórico mais recente
    // AI dev note: Corrigida consulta incorreta que usava patientId como id_agendamento

    // Primeiro, buscar agendamentos do paciente
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('paciente_id', patientId);

    if (agendamentosError || !agendamentos || agendamentos.length === 0) {
      return { history: null, lastGenerated: null };
    }

    const agendamentoIds = agendamentos.map((a) => a.id);

    // Segundo, buscar relatório compilado usando os IDs dos agendamentos
    // AI dev note: Fallback robusto para tratar erro 406 de RLS complexa
    let data, error;

    try {
      const result = await supabase
        .from('relatorio_evolucao')
        .select('conteudo, created_at')
        .eq('tipo_relatorio_id', tipoData.id)
        .in('id_agendamento', agendamentoIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle para evitar erro quando vazio

      data = result.data;
      error = result.error;
    } catch (fetchError) {
      console.warn(
        '⚠️ Erro ao buscar histórico compilado (não crítico):',
        fetchError
      );
      return { history: null, lastGenerated: null };
    }

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Erro não crítico ao buscar histórico compilado:', error);
      return { history: null, lastGenerated: null };
    }

    return {
      history: data?.conteudo || null,
      lastGenerated: data?.created_at || null,
    };
  } catch (err) {
    console.error('Erro ao buscar histórico compilado:', err);
    return { history: null, lastGenerated: null };
  }
}

/**
 * Buscar histórico do paciente por ID
 * Retorna o histórico mais recente gerado automaticamente ou manualmente
 */
export async function fetchPatientHistory(patientId: string): Promise<{
  history: string | null;
  lastGenerated: string | null;
  isAiGenerated: boolean | null;
}> {
  try {
    // Buscar tipo de relatório para histórico de evolução
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'historico_evolucao')
      .single();

    if (tipoError) {
      console.error('Erro ao buscar tipo de relatório:', tipoError);
      return { history: null, lastGenerated: null, isAiGenerated: null };
    }

    // Buscar histórico mais recente por paciente
    // AI dev note: Abordagem robusta com duas queries para evitar erro 406 de join mal formado

    // Primeiro, buscar agendamentos do paciente
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('paciente_id', patientId);

    if (agendamentosError) {
      console.error('Erro ao buscar agendamentos:', agendamentosError);
      return { history: null, lastGenerated: null, isAiGenerated: null };
    }

    if (!agendamentos || agendamentos.length === 0) {
      return { history: null, lastGenerated: null, isAiGenerated: null };
    }

    const agendamentoIds = agendamentos.map((a) => a.id);

    // Segundo, buscar histórico usando os IDs dos agendamentos
    // AI dev note: Fallback robusto para tratar erro 406 de RLS complexa
    let data, error;

    try {
      const result = await supabase
        .from('relatorio_evolucao')
        .select('conteudo, created_at, transcricao')
        .eq('tipo_relatorio_id', tipoData.id)
        .in('id_agendamento', agendamentoIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle para evitar erro quando vazio

      data = result.data;
      error = result.error;
    } catch (fetchError) {
      console.warn('⚠️ Erro ao buscar histórico (não crítico):', fetchError);
      return { history: null, lastGenerated: null, isAiGenerated: null };
    }

    if (error && error.code !== 'PGRST116') {
      console.warn(
        '⚠️ Erro não crítico ao buscar histórico do paciente:',
        error
      );
      return { history: null, lastGenerated: null, isAiGenerated: null };
    }

    return {
      history: data?.conteudo || null,
      lastGenerated: data?.created_at || null,
      isAiGenerated: data?.transcricao || false, // transcricao indica se foi gerado por IA
    };
  } catch (err) {
    console.error('Erro ao buscar histórico do paciente:', err);
    return { history: null, lastGenerated: null, isAiGenerated: null };
  }
}

/**
 * Salvar histórico do paciente manualmente
 * Usado quando o admin edita o histórico com IA desligada
 */
export async function savePatientHistory(
  patientId: string,
  content: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar o pessoa_id correspondente ao auth_user_id
    const { data: pessoaData, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id')
      .eq('auth_user_id', userId)
      .single();

    if (pessoaError || !pessoaData) {
      console.error('Erro ao buscar pessoa pelo auth_user_id:', pessoaError);
      return { success: false, error: 'Usuário não encontrado no sistema' };
    }

    const pessoaId = pessoaData.id;

    // Buscar tipo de relatório para histórico de evolução
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'historico_evolucao')
      .single();

    if (tipoError) {
      console.error('Erro ao buscar tipo de relatório:', tipoError);
      return { success: false, error: 'Erro ao identificar tipo de relatório' };
    }

    // Buscar agendamentos do paciente
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from('agendamentos')
      .select('id')
      .eq('paciente_id', patientId)
      .order('created_at', { ascending: false });

    if (agendamentosError || !agendamentos || agendamentos.length === 0) {
      console.error(
        'Erro ao buscar agendamentos do paciente:',
        agendamentosError
      );
      return {
        success: false,
        error: 'Paciente deve ter pelo menos um agendamento',
      };
    }

    const agendamentoIds = agendamentos.map((a) => a.id);

    // Buscar histórico existente de forma simplificada
    // AI dev note: Fallback robusto para tratar erro 406 de RLS complexa
    let existingHistory = null;

    try {
      const result = await supabase
        .from('relatorio_evolucao')
        .select('id, id_agendamento')
        .eq('tipo_relatorio_id', tipoData.id)
        .in('id_agendamento', agendamentoIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Usar maybeSingle ao invés de single para evitar erro se não existe

      existingHistory = result.data;

      if (result.error) {
        console.warn(
          '⚠️ Erro não crítico ao buscar histórico existente:',
          result.error
        );
      }
    } catch (fetchError) {
      console.warn(
        '⚠️ Erro ao buscar histórico existente (não crítico):',
        fetchError
      );
    }

    if (existingHistory) {
      // SEMPRE atualizar o histórico existente
      const { error } = await supabase
        .from('relatorio_evolucao')
        .update({
          conteudo: content.substring(0, 1500), // Limitar a 1500 caracteres
          transcricao: false, // Manual = false
          atualizado_por: pessoaId, // Usar pessoa_id ao invés de auth_user_id
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingHistory.id);

      if (error) {
        console.error('Erro ao atualizar histórico:', error);
        return { success: false, error: 'Erro ao atualizar histórico' };
      }
    } else {
      // Criar novo histórico apenas se não existe nenhum
      const { error } = await supabase.from('relatorio_evolucao').insert({
        id_agendamento: agendamentos[0].id, // Usar o agendamento mais recente
        tipo_relatorio_id: tipoData.id,
        conteudo: content.substring(0, 1500), // Limitar a 1500 caracteres
        transcricao: false, // Manual = false
        criado_por: pessoaId, // Usar pessoa_id ao invés de auth_user_id
        atualizado_por: pessoaId, // Usar pessoa_id ao invés de auth_user_id
      });

      if (error) {
        console.error('Erro ao criar histórico:', error);
        return { success: false, error: 'Erro ao criar histórico' };
      }
    }

    return { success: true };
  } catch (err) {
    console.error('Erro ao salvar histórico:', err);
    return { success: false, error: 'Erro interno do servidor' };
  }
}

/**
 * Gerar histórico do paciente usando IA
 * Chama a Edge Function patient-history-ai
 */
export async function generatePatientHistoryAI(
  patientId: string,
  userId: string
): Promise<{ success: boolean; error?: string; history?: string }> {
  try {
    // Buscar configuração de IA do usuário
    const { data: userData, error: userError } = await supabase
      .from('pessoas')
      .select('ai_historico_ativo')
      .eq('id', userId)
      .single();

    if (userError || !userData?.ai_historico_ativo) {
      return {
        success: false,
        error: 'IA de histórico não está ativa para este usuário',
      };
    }

    // Chamar Edge Function para gerar histórico
    const { data, error } = await supabase.functions.invoke(
      'patient-history-ai',
      {
        body: {
          patientId,
          userId,
          maxCharacters: 1500,
        },
      }
    );

    if (error) {
      console.error('Erro na Edge Function de histórico IA:', error);
      return { success: false, error: 'Erro ao gerar histórico com IA' };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Erro desconhecido na geração de histórico',
      };
    }

    return {
      success: true,
      history: data.history,
    };
  } catch (err) {
    console.error('Erro ao gerar histórico com IA:', err);
    return { success: false, error: 'Erro interno do servidor' };
  }
}

/**
 * Verificar se IA de histórico está ativa para o usuário
 */
export async function checkAIHistoryStatus(
  userId: string
): Promise<{ isActive: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('ai_historico_ativo')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Erro ao verificar status da IA:', error);
      return { isActive: false, error: 'Erro ao verificar configuração' };
    }

    return { isActive: data?.ai_historico_ativo || false };
  } catch (err) {
    console.error('Erro ao verificar status da IA:', err);
    return { isActive: false, error: 'Erro interno do servidor' };
  }
}

/**
 * Atualizar configuração de IA de histórico do usuário
 */
export async function updateAIHistoryStatus(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({ ai_historico_ativo: isActive })
      .eq('id', userId);

    if (error) {
      console.error('Erro ao atualizar status da IA:', error);
      return { success: false, error: 'Erro ao atualizar configuração' };
    }

    return { success: true };
  } catch (err) {
    console.error('Erro ao atualizar status da IA:', err);
    return { success: false, error: 'Erro interno do servidor' };
  }
}

/**
 * Buscar responsáveis do paciente para seleção de cobrança
 * Inclui o próprio paciente + responsáveis ativos
 */
export async function fetchPatientResponsibles(patientId: string): Promise<{
  responsibles: Array<{ id: string; nome: string; ativo: boolean }>;
  error?: string;
}> {
  try {
    // Buscar o próprio paciente
    const { data: patientData, error: patientError } = await supabase
      .from('pessoas')
      .select('id, nome, ativo')
      .eq('id', patientId)
      .single();

    if (patientError) {
      console.error('Erro ao buscar paciente:', patientError);
      return { responsibles: [], error: 'Paciente não encontrado' };
    }

    // Buscar responsáveis ativos do paciente
    const { data: responsiblesData, error: responsiblesError } = await supabase
      .from('pessoa_responsaveis')
      .select(
        `
        id_responsavel,
        pessoas!id_responsavel(id, nome, ativo)
      `
      )
      .eq('id_pessoa', patientId)
      .eq('ativo', true)
      .is('data_fim', null); // Responsabilidade ainda ativa

    if (responsiblesError) {
      console.error('Erro ao buscar responsáveis:', responsiblesError);
      return { responsibles: [], error: 'Erro ao buscar responsáveis' };
    }

    // Combinar paciente + responsáveis, removendo duplicatas
    const allResponsibles = [patientData];

    if (responsiblesData) {
      responsiblesData.forEach((rel) => {
        const responsavel = Array.isArray(rel.pessoas)
          ? rel.pessoas[0]
          : rel.pessoas;
        if (responsavel && responsavel.id !== patientId && responsavel.ativo) {
          allResponsibles.push({
            id: responsavel.id,
            nome: responsavel.nome,
            ativo: responsavel.ativo,
          });
        }
      });
    }

    return { responsibles: allResponsibles, error: undefined };
  } catch (err) {
    console.error('Erro ao buscar responsáveis do paciente:', err);
    return {
      responsibles: [],
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}

/**
 * Atualizar responsável pela cobrança do paciente
 * Apenas admin/secretaria podem alterar
 */
export async function updateBillingResponsible(
  patientId: string,
  responsibleId: string,
  userRole?: 'admin' | 'profissional' | 'secretaria' | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validação de role
    if (userRole !== 'admin' && userRole !== 'secretaria') {
      return {
        success: false,
        error:
          'Acesso negado. Apenas admin/secretaria podem alterar responsável pela cobrança',
      };
    }

    // Verificar se o responsável existe e está ativo
    const { data: responsibleData, error: responsibleError } = await supabase
      .from('pessoas')
      .select('id, ativo')
      .eq('id', responsibleId)
      .single();

    if (responsibleError || !responsibleData) {
      return { success: false, error: 'Responsável não encontrado' };
    }

    if (!responsibleData.ativo) {
      return { success: false, error: 'Responsável selecionado está inativo' };
    }

    // Verificar se é uma seleção válida (paciente ou responsável dele)
    if (responsibleId !== patientId) {
      const { error: relationError } = await supabase
        .from('pessoa_responsaveis')
        .select('id')
        .eq('id_pessoa', patientId)
        .eq('id_responsavel', responsibleId)
        .eq('ativo', true)
        .is('data_fim', null)
        .single();

      if (relationError) {
        return {
          success: false,
          error: 'Responsável selecionado não está vinculado ao paciente',
        };
      }
    }

    // Atualizar responsável pela cobrança
    const { error: updateError } = await supabase
      .from('pessoas')
      .update({
        responsavel_cobranca_id: responsibleId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (updateError) {
      console.error('Erro ao atualizar responsável cobrança:', updateError);
      return {
        success: false,
        error: 'Erro ao atualizar responsável pela cobrança',
      };
    }

    return { success: true };
  } catch (err) {
    console.error('Erro ao atualizar responsável cobrança:', err);
    return { success: false, error: 'Erro interno do servidor' };
  }
}

/**
 * Buscar pacientes com paginação
 * Usa a view pacientes_com_responsaveis_view filtrando apenas pacientes
 * Busca IGUAL ao PatientSelect da Agenda: sem acento, busca em todos os campos
 */
export async function fetchPatients(
  searchTerm: string = '',
  page: number = 1,
  limit: number = 20,
  startWithLetter?: string
): Promise<ApiResponse<PaginatedUsuarios>> {
  try {
    // AI dev note: Verificação de autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        '❌ fetchPatients: Usuário não autenticado:',
        authError?.message
      );
      return {
        data: null,
        error: 'Usuário não autenticado',
        success: false,
      };
    }

    // AI dev note: BUSCAR TODOS os pacientes para filtrar no cliente (igual PatientSelect)
    // Isso permite busca sem acento usando normalizeText
    let query = supabase
      .from('pacientes_com_responsaveis_view')
      .select('*')
      .eq('tipo_pessoa_codigo', 'paciente')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    // AI dev note: Aplicar filtro por letra inicial no servidor
    if (startWithLetter && startWithLetter.length === 1) {
      query = query.ilike('nome', `${startWithLetter}%`);
    }

    const { data: allPatients, error } = await query;

    if (error) {
      console.error('Erro ao buscar pacientes:', error);
      return {
        data: null,
        error: error.message,
        success: false,
      };
    }

    let filteredPatients = allPatients || [];

    // AI dev note: Aplicar busca no cliente com normalizeText (igual PatientSelect)
    if (searchTerm.trim() && !startWithLetter) {
      const searchWords = searchTerm
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);

      const normalizedSearchWords = searchWords.map((word) =>
        normalizeText(word)
      );

      filteredPatients = filteredPatients.filter((patient) => {
        if (!patient.nome) return false;

        // Função helper para verificar se todas as palavras estão presentes
        const matchesAllWords = (text: string) => {
          const normalizedText = normalizeText(text);
          return normalizedSearchWords.every((word) =>
            normalizedText.includes(word)
          );
        };

        // Buscar em todos os campos (igual PatientSelect)
        if (matchesAllWords(patient.nome)) return true;
        if (
          patient.nomes_responsaveis &&
          matchesAllWords(patient.nomes_responsaveis)
        )
          return true;
        if (patient.email && matchesAllWords(patient.email)) return true;
        if (patient.cpf_cnpj && matchesAllWords(patient.cpf_cnpj)) return true;
        if (patient.telefone && matchesAllWords(patient.telefone.toString()))
          return true;
        if (
          patient.responsavel_legal_nome &&
          matchesAllWords(patient.responsavel_legal_nome)
        )
          return true;
        if (
          patient.responsavel_legal_email &&
          matchesAllWords(patient.responsavel_legal_email)
        )
          return true;
        if (
          patient.responsavel_legal_cpf &&
          matchesAllWords(patient.responsavel_legal_cpf)
        )
          return true;
        if (
          patient.responsavel_legal_telefone &&
          matchesAllWords(patient.responsavel_legal_telefone.toString())
        )
          return true;
        if (
          patient.responsavel_financeiro_nome &&
          matchesAllWords(patient.responsavel_financeiro_nome)
        )
          return true;
        if (
          patient.responsavel_financeiro_email &&
          matchesAllWords(patient.responsavel_financeiro_email)
        )
          return true;
        if (
          patient.responsavel_financeiro_cpf &&
          matchesAllWords(patient.responsavel_financeiro_cpf)
        )
          return true;
        if (
          patient.responsavel_financeiro_telefone &&
          matchesAllWords(patient.responsavel_financeiro_telefone.toString())
        )
          return true;

        return false;
      });
    }

    const totalCount = filteredPatients.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Aplicar paginação manual
    const offset = (page - 1) * limit;
    const paginatedPatients = filteredPatients.slice(offset, offset + limit);

    // AI dev note: Enriquecer dados com status de pagamento
    const enrichedData = await Promise.all(
      paginatedPatients.map(async (patient) => {
        // Buscar status de pagamento das consultas do paciente
        const { data: agendamentos } = await supabase
          .from('vw_agendamentos_completos')
          .select('status_pagamento_codigo')
          .eq('paciente_id', patient.id)
          .eq('ativo', true);

        const totalConsultas = agendamentos?.length || 0;
        const consultasPagas =
          agendamentos?.filter((a) => a.status_pagamento_codigo === 'pago')
            .length || 0;
        const consultasAtrasadas =
          agendamentos?.filter((a) => a.status_pagamento_codigo === 'atrasado')
            .length || 0;
        const consultasPendentes =
          agendamentos?.filter((a) => a.status_pagamento_codigo === 'pendente')
            .length || 0;

        const todasPagas =
          totalConsultas > 0 && consultasPagas === totalConsultas;
        const temAtrasadas = consultasAtrasadas > 0;

        return {
          ...patient,
          // Novos campos de status de pagamento
          total_consultas_pagamento: totalConsultas,
          consultas_pagas: consultasPagas,
          consultas_atrasadas: consultasAtrasadas,
          consultas_pendentes: consultasPendentes,
          todas_consultas_pagas: todasPagas,
          tem_consultas_atrasadas: temAtrasadas,
        };
      })
    );

    return {
      data: {
        data: enrichedData,
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    console.error('Erro ao buscar pacientes:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      success: false,
    };
  }
}
