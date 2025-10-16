// AI dev note: Queries reutilizáveis para buscar logs de cadastro público
// Centraliza acesso às 3 tabelas de logging

import { supabase } from '@/lib/supabase';

export interface RegistrationLog {
  id: string;
  session_id: string;
  step_name: string | null;
  event_type:
    | 'step_started'
    | 'step_completed'
    | 'validation_error'
    | 'api_error'
    | 'success'
    | null;
  error_message: string | null;
  error_stack: string | null;
  ip_address: string | null;
  user_agent: string | null;
  browser_info: Record<string, unknown>;
  created_at: string;
}

export interface RegistrationFormData {
  id: string;
  session_id: string;
  step_name: string;
  form_data: Record<string, unknown>;
  is_valid: boolean | null;
  validation_errors: Record<string, string> | null;
  created_at: string;
}

export interface RegistrationApiLog {
  id: string;
  session_id: string;
  request_body: Record<string, unknown> | null;
  response_body: Record<string, unknown> | null;
  http_status: number | null;
  duration_ms: number | null;
  edge_function_version: number | null;
  error_type:
    | 'database_error'
    | 'validation_error'
    | 'network_error'
    | 'unknown_error'
    | null;
  error_details: Record<string, unknown> | null;
  paciente_id: string | null;
  responsavel_legal_id: string | null;
  responsavel_financeiro_id: string | null;
  contrato_id: string | null;
  created_at: string;
}

export interface LogFilters {
  session_id?: string;
  event_type?: string;
  step_name?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

/**
 * Buscar logs gerais de eventos de cadastro
 */
export async function fetchRegistrationLogs(filters?: LogFilters) {
  try {
    let query = supabase
      .from('public_registration_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.session_id) {
      query = query.eq('session_id', filters.session_id);
    }

    if (filters?.event_type) {
      query = query.eq('event_type', filters.event_type);
    }

    if (filters?.step_name) {
      query = query.eq('step_name', filters.step_name);
    }

    if (filters?.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters?.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(100); // Limite padrão
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data: data as RegistrationLog[], error: null };
  } catch (error) {
    console.error('Erro ao buscar logs de cadastro:', error);
    return { data: null, error };
  }
}

/**
 * Buscar dados de formulário por session_id
 */
export async function fetchRegistrationFormData(sessionId: string) {
  try {
    const { data, error } = await supabase
      .from('public_registration_form_data')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data as RegistrationFormData[], error: null };
  } catch (error) {
    console.error('Erro ao buscar dados de formulário:', error);
    return { data: null, error };
  }
}

/**
 * Buscar logs de API por session_id
 */
export async function fetchRegistrationApiLogs(sessionId: string) {
  try {
    const { data, error } = await supabase
      .from('public_registration_api_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data as RegistrationApiLog[], error: null };
  } catch (error) {
    console.error('Erro ao buscar logs de API:', error);
    return { data: null, error };
  }
}

/**
 * Buscar detalhes consolidados de uma sessão (todas as 3 tabelas)
 */
export async function fetchLogDetails(sessionId: string) {
  try {
    const [logsResult, formDataResult, apiLogsResult] = await Promise.all([
      fetchRegistrationLogs({ session_id: sessionId }),
      fetchRegistrationFormData(sessionId),
      fetchRegistrationApiLogs(sessionId),
    ]);

    return {
      logs: logsResult.data || [],
      formData: formDataResult.data || [],
      apiLogs: apiLogsResult.data || [],
      error: logsResult.error || formDataResult.error || apiLogsResult.error,
    };
  } catch (error) {
    console.error('Erro ao buscar detalhes da sessão:', error);
    return { logs: [], formData: [], apiLogs: [], error };
  }
}

/**
 * Buscar sessions únicas com erro (para dashboard de admin)
 */
export async function fetchErrorSessions(limit = 50) {
  try {
    const { data, error } = await supabase
      .from('public_registration_logs')
      .select('session_id, event_type, error_message, created_at')
      .in('event_type', ['api_error', 'validation_error'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Remover duplicatas de session_id
    const uniqueSessions = data?.reduce((acc: RegistrationLog[], log) => {
      if (!acc.find((item) => item.session_id === log.session_id)) {
        acc.push(log as RegistrationLog);
      }
      return acc;
    }, []);

    return { data: uniqueSessions || [], error: null };
  } catch (error) {
    console.error('Erro ao buscar sessões com erro:', error);
    return { data: null, error };
  }
}
