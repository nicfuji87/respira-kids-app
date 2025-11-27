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
      // AI dev note: Mapear campo do banco (autorizacao_uso_do_nome) para o esperado pelo TypeScript (autorizacao_uso_nome)
      autorizacao_uso_nome: data.autorizacao_uso_do_nome,
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
    // AI dev note: Coluna do banco é autorizacao_uso_do_nome (com "do")
    const { error } = await supabase
      .from('pessoas')
      .update({
        autorizacao_uso_cientifico: consents.autorizacao_uso_cientifico,
        autorizacao_uso_redes_sociais: consents.autorizacao_uso_redes_sociais,
        autorizacao_uso_do_nome: consents.autorizacao_uso_nome,
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
 * AI dev note: Anamnese agora é permanente e vinculada diretamente à pessoa
 */
export async function fetchPatientAnamnesis(
  patientId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('anamnese')
      .eq('id', patientId)
      .single();

    if (error) {
      console.error('Erro ao buscar anamnese:', error);
      return null;
    }

    return data?.anamnese || null;
  } catch (err) {
    console.error('Erro ao buscar anamnese do paciente:', err);
    return null;
  }
}

/**
 * Salvar anamnese do paciente
 * AI dev note: Anamnese agora é permanente e vinculada diretamente à pessoa
 */
export async function savePatientAnamnesis(
  patientId: string,
  content: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        anamnese: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao salvar anamnese:', err);
    throw err;
  }
}

/**
 * Buscar observações do paciente
 * AI dev note: Observações são permanentes e vinculadas diretamente à pessoa
 */
export async function fetchPatientObservations(
  patientId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('pessoas')
      .select('observacoes')
      .eq('id', patientId)
      .single();

    if (error) {
      console.error('Erro ao buscar observações:', error);
      return null;
    }

    return data?.observacoes || null;
  } catch (err) {
    console.error('Erro ao buscar observações do paciente:', err);
    return null;
  }
}

/**
 * Salvar observações do paciente
 * AI dev note: Observações são permanentes e vinculadas diretamente à pessoa
 */
export async function savePatientObservations(
  patientId: string,
  content: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pessoas')
      .update({
        observacoes: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao salvar observações:', err);
    throw err;
  }
}

/**
 * Buscar relatórios médicos do paciente
 * AI dev note: Relatórios médicos são múltiplos e vinculados à pessoa
 */
export async function fetchPatientMedicalReports(
  patientId: string
): Promise<import('@/types/patient-details').MedicalReport[]> {
  try {
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'relatorio_medico')
      .single();

    if (tipoError || !tipoData) {
      console.error('Erro ao buscar tipo relatorio_medico:', tipoError);
      return [];
    }

    const { data, error } = await supabase
      .from('relatorios_medicos')
      .select(
        `
        id,
        id_pessoa,
        conteudo,
        pdf_url,
        criado_por,
        atualizado_por,
        created_at,
        updated_at,
        transcricao
      `
      )
      .eq('id_pessoa', patientId)
      .eq('tipo_relatorio_id', tipoData.id)
      .eq('ativo', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar relatórios médicos:', error);
      return [];
    }

    // Buscar nomes dos criadores/atualizadores separadamente
    const reportsWithNames = await Promise.all(
      (data || []).map(async (item) => {
        let criadoPorNome = null;
        let atualizadoPorNome = null;

        if (item.criado_por) {
          const { data: criadoPor } = await supabase
            .from('pessoas')
            .select('nome')
            .eq('id', item.criado_por)
            .single();
          criadoPorNome = criadoPor?.nome || null;
        }

        if (item.atualizado_por) {
          const { data: atualizadoPor } = await supabase
            .from('pessoas')
            .select('nome')
            .eq('id', item.atualizado_por)
            .single();
          atualizadoPorNome = atualizadoPor?.nome || null;
        }

        return {
          id: item.id,
          id_pessoa: item.id_pessoa,
          conteudo: item.conteudo || '',
          pdf_url: item.pdf_url,
          criado_por: item.criado_por,
          criado_por_nome: criadoPorNome,
          atualizado_por: item.atualizado_por,
          atualizado_por_nome: atualizadoPorNome,
          created_at: item.created_at,
          updated_at: item.updated_at,
          transcricao: item.transcricao || false,
        };
      })
    );

    return reportsWithNames;
  } catch (err) {
    console.error('Erro ao buscar relatórios médicos:', err);
    return [];
  }
}

/**
 * Buscar aniversários da semana (segunda a domingo)
 * AI dev note: Retorna pacientes com aniversário na semana atual e na semana seguinte
 * Destaque para pacientes com agendamento na semana
 */
export async function fetchWeekBirthdays(): Promise<
  import('@/types/patient-details').WeekBirthday[]
> {
  try {
    // Calcular início (segunda-feira) e fim (domingo) da semana atual
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = domingo, 1 = segunda, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajustar para segunda-feira
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Calcular início (segunda-feira) e fim (domingo) da semana seguinte
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    nextMonday.setHours(0, 0, 0, 0);

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    nextSunday.setHours(23, 59, 59, 999);

    // Buscar todos os pacientes com data de nascimento
    const { data: pacientes, error: pacientesError } = await supabase
      .from('pacientes_com_responsaveis_view')
      .select('id, nome, data_nascimento, responsavel_legal_nome')
      .eq('tipo_pessoa_codigo', 'paciente')
      .eq('ativo', true)
      .not('data_nascimento', 'is', null);

    if (pacientesError) {
      console.error('Erro ao buscar pacientes:', pacientesError);
      return [];
    }

    if (!pacientes || pacientes.length === 0) {
      return [];
    }

    // Filtrar pacientes cujo aniversário cai na semana atual ou na semana seguinte (independente do ano)
    const birthdaysThisWeek = pacientes.filter((p) => {
      if (!p.data_nascimento) return false;

      const birthDate = new Date(p.data_nascimento + 'T00:00:00');
      const birthMonth = birthDate.getMonth(); // 0-11
      const birthDay = birthDate.getDate(); // 1-31

      // Criar data do aniversário no ano atual
      const birthdayThisYear = new Date(
        today.getFullYear(),
        birthMonth,
        birthDay
      );

      // Verificar se o aniversário cai entre segunda e domingo da semana atual
      // ou entre segunda e domingo da semana seguinte
      return (
        (birthdayThisYear >= monday && birthdayThisYear <= sunday) ||
        (birthdayThisYear >= nextMonday && birthdayThisYear <= nextSunday)
      );
    });

    if (birthdaysThisWeek.length === 0) {
      return [];
    }

    // Buscar agendamentos durante todo o período de amostragem
    // (semana atual + semana seguinte) para esses pacientes
    const patientIds = birthdaysThisWeek.map((p) => p.id);
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, paciente_id, data_hora, profissional_id')
      .in('paciente_id', patientIds)
      .gte('data_hora', monday.toISOString())
      .lte('data_hora', nextSunday.toISOString())
      .eq('ativo', true)
      .order('data_hora', { ascending: true });

    // Buscar nomes dos profissionais separadamente
    let profissionaisNomes: Record<string, string> = {};
    if (agendamentos && agendamentos.length > 0) {
      const profissionalIds = Array.from(
        new Set(
          agendamentos.map((a) => a.profissional_id).filter(Boolean) as string[]
        )
      );

      if (profissionalIds.length > 0) {
        const { data: profissionais } = await supabase
          .from('pessoas')
          .select('id, nome')
          .in('id', profissionalIds);

        if (profissionais) {
          profissionaisNomes = profissionais.reduce(
            (acc, prof) => {
              acc[prof.id] = prof.nome;
              return acc;
            },
            {} as Record<string, string>
          );
        }
      }
    }

    // Montar resultado final
    const weekBirthdays = birthdaysThisWeek.map((p) => {
      const birthDate = new Date(p.data_nascimento + 'T00:00:00');
      const birthMonth = birthDate.getMonth();
      const birthDay = birthDate.getDate();

      // Criar data do aniversário no ano atual para calcular dia da semana
      const birthdayThisYear = new Date(
        today.getFullYear(),
        birthMonth,
        birthDay
      );

      // Calcular idade
      const idade = today.getFullYear() - birthDate.getFullYear();

      // Dia da semana em português
      const diasSemana = [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado',
      ];
      const dia_semana = diasSemana[birthdayThisYear.getDay()];

      // Verificar se é da semana atual ou da semana seguinte
      const isCurrentWeek =
        birthdayThisYear >= monday && birthdayThisYear <= sunday;

      // Agendamentos do paciente durante todo o período de amostragem
      // (semana atual + semana seguinte)
      const agendamentosP = (agendamentos || [])
        .filter((a) => a.paciente_id === p.id)
        .map((a) => ({
          id: a.id,
          data_hora: a.data_hora,
          profissional_nome: a.profissional_id
            ? profissionaisNomes[a.profissional_id] || null
            : null,
        }));

      return {
        id: p.id,
        nome: p.nome,
        data_nascimento: p.data_nascimento,
        idade,
        dia_semana,
        dia_mes: birthDay,
        mes: birthMonth + 1, // 1-12
        responsavel_legal_nome: p.responsavel_legal_nome || null,
        tem_agendamento: agendamentosP.length > 0,
        isCurrentWeek,
        agendamentos: agendamentosP.length > 0 ? agendamentosP : undefined,
      };
    });

    // Ordenar: primeiro por semana (atual primeiro), depois por mês e dia
    return weekBirthdays.sort((a, b) => {
      // Semana atual primeiro (true vem antes de false)
      if (a.isCurrentWeek !== b.isCurrentWeek) {
        return a.isCurrentWeek ? -1 : 1;
      }
      // Depois por mês e dia
      if (a.mes !== b.mes) return a.mes - b.mes;
      return a.dia_mes - b.dia_mes;
    });
  } catch (err) {
    console.error('Erro ao buscar aniversários da semana:', err);
    return [];
  }
}

/**
 * Salvar novo relatório médico do paciente
 * AI dev note: Relatórios médicos são gerados a partir de evoluções
 */
export async function savePatientMedicalReport(
  patientId: string,
  content: string,
  userId: string
): Promise<void> {
  try {
    const { data: tipoData, error: tipoError } = await supabase
      .from('relatorios_tipo')
      .select('id')
      .eq('codigo', 'relatorio_medico')
      .single();

    if (tipoError || !tipoData) {
      throw new Error('Tipo de relatório médico não encontrado');
    }

    const { error } = await supabase.from('relatorios_medicos').insert({
      id_pessoa: patientId,
      tipo_relatorio_id: tipoData.id,
      conteudo: content,
      criado_por: userId,
      transcricao: false,
      ativo: true,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao salvar relatório médico:', err);
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
 * Buscar contrato do paciente
 * Retorna o contrato mais recente e ativo ou null
 * AI dev note: Suporta retrocompatibilidade com campo legado link_contrato
 */
export async function fetchPatientContract(patientId: string): Promise<{
  contract: {
    id: string;
    nome_contrato: string;
    conteudo_final: string;
    arquivo_url: string | null;
    status_contrato: string | null;
    data_geracao: string | null;
    data_assinatura: string | null;
    is_legacy?: boolean;
  } | null;
  error?: string;
}> {
  try {
    // Primeiro, buscar na tabela user_contracts (sistema novo)
    const { data, error } = await supabase
      .from('user_contracts')
      .select(
        `
        id,
        nome_contrato,
        conteudo_final,
        arquivo_url,
        status_contrato,
        data_geracao,
        data_assinatura,
        created_at
      `
      )
      .eq('pessoa_id', patientId)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar contrato do paciente:', error);
      return { contract: null, error: 'Erro ao buscar contrato' };
    }

    // Se encontrou contrato na tabela nova, retornar
    if (data) {
      return { contract: data };
    }

    // Fallback: verificar campo legado link_contrato na tabela pessoas
    const { data: pessoaData, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id, nome, link_contrato')
      .eq('id', patientId)
      .single();

    if (pessoaError) {
      console.error('Erro ao buscar pessoa:', pessoaError);
      return { contract: null, error: 'Erro ao buscar dados do paciente' };
    }

    // Se tem link_contrato preenchido, retornar como contrato legado
    if (pessoaData?.link_contrato) {
      return {
        contract: {
          id: patientId, // Usar ID da pessoa como identificador
          nome_contrato: `Contrato - ${pessoaData.nome}`,
          conteudo_final: '', // Contrato legado não tem conteúdo armazenado
          arquivo_url: pessoaData.link_contrato,
          status_contrato: 'assinado', // Assumir que contratos legados estão assinados
          data_geracao: null,
          data_assinatura: null,
          is_legacy: true, // Flag para indicar que é contrato legado
        },
      };
    }

    // Não encontrou contrato em nenhum lugar
    return { contract: null };
  } catch (err) {
    console.error('Erro ao buscar contrato do paciente:', err);
    return {
      contract: null,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
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
  startWithLetter?: string,
  sortBy: 'nome' | 'updated_at' = 'nome'
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
      .eq('ativo', true);

    // AI dev note: Aplicar ordenação baseada no filtro selecionado
    if (sortBy === 'updated_at') {
      query = query.order('updated_at', { ascending: false });
    } else {
      query = query.order('nome', { ascending: true });
    }

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
