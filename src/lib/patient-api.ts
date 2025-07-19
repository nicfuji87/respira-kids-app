// AI dev note: API específica para gerenciamento de pacientes
// Funções centralizadas para CRUD de dados de pacientes

import { supabase } from './supabase';
import type {
  PatientDetails,
  PatientConsent,
  PatientDetailsResponse,
} from '@/types/patient-details';

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
    const { data, error } = await supabase
      .from('relatorio_evolucao')
      .select('conteudo, created_at')
      .eq('tipo_relatorio_id', tipoData.id)
      .eq('id_agendamento', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao buscar histórico compilado:', error);
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
