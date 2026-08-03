import { supabase } from './supabase';
import { buildWhatsAppUrl } from './cobrancas-api';

// AI dev note: API do LEMBRETE DE CONSULTA manual (botão na visão Agenda).
// Mesma mecânica de /cobrancas: o envio não passa por aqui — montamos a URL, o
// browser abre a conversa com o texto pronto e a secretária aperta enter. O que
// registramos é o clique.
//
// `buildWhatsAppUrl` é reusado de cobrancas-api de propósito: a regra de
// web.whatsapp.com no desktop x wa.me no tablet vale para os dois canais e não
// deve viver duplicada.
export { buildWhatsAppUrl };

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DadosLembreteAgendamento {
  agendamento_id: string;
  data_hora: string;
  paciente_nome: string | null;
  profissional_nome: string | null;
  servico: string | null;
  tipo_local: string | null;
  local_nome: string | null;
  destinatario_id: string | null;
  destinatario_nome: string | null;
  destinatario_telefone: number | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
}

// AI dev note: RPC porque a vw_agendamentos_completos não traz o telefone do
// responsável legal nem endereço — seriam 3 queries encadeadas no cliente a
// cada clique.
export async function fetchDadosLembrete(
  agendamentoId: string
): Promise<ApiResponse<DadosLembreteAgendamento>> {
  try {
    const { data, error } = await supabase.rpc(
      'fn_dados_lembrete_agendamento',
      { p_agendamento_id: agendamentoId }
    );

    if (error) {
      console.error('❌ Erro ao buscar dados do lembrete:', error);
      return { success: false, error: error.message };
    }

    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha) {
      return { success: false, error: 'Agendamento não encontrado' };
    }

    return { success: true, data: linha as DadosLembreteAgendamento };
  } catch (e) {
    console.error('❌ Erro inesperado ao buscar dados do lembrete:', e);
    return { success: false, error: 'Erro inesperado ao buscar os dados' };
  }
}

export async function registrarLembreteManual(
  agendamentoId: string,
  telefone: number | string | null
): Promise<ApiResponse<string>> {
  try {
    const { data, error } = await supabase.rpc('fn_registrar_lembrete_manual', {
      p_agendamento_id: agendamentoId,
      p_telefone: telefone ? String(telefone) : null,
    });

    if (error) {
      console.error('❌ Erro ao registrar lembrete manual:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as string };
  } catch (e) {
    console.error('❌ Erro inesperado ao registrar lembrete:', e);
    return { success: false, error: 'Erro inesperado ao registrar o lembrete' };
  }
}

export interface ResumoLembreteManual {
  total: number;
  ultimoEm: string | null;
}

// AI dev note: Uma query para TODOS os agendamentos visíveis na agenda — não uma
// por card. Alimenta o "já enviado Nx" do botão, que é o que evita a secretária
// mandar o mesmo lembrete duas vezes.
export async function fetchLembretesManuais(
  agendamentoIds: string[]
): Promise<Map<string, ResumoLembreteManual>> {
  const mapa = new Map<string, ResumoLembreteManual>();
  if (agendamentoIds.length === 0) return mapa;

  try {
    const { data, error } = await supabase
      .from('lembrete_manual_log')
      .select('agendamento_id, criado_em')
      .in('agendamento_id', agendamentoIds)
      .order('criado_em', { ascending: false });

    if (error) {
      console.warn('⚠️ Erro ao carregar histórico de lembretes:', error);
      return mapa;
    }

    (data || []).forEach((linha) => {
      const atual = mapa.get(linha.agendamento_id);
      if (atual) {
        atual.total += 1;
      } else {
        // A query vem ordenada desc, então o primeiro de cada id é o mais recente.
        mapa.set(linha.agendamento_id, {
          total: 1,
          ultimoEm: linha.criado_em,
        });
      }
    });

    return mapa;
  } catch (e) {
    console.warn('⚠️ Erro inesperado ao carregar lembretes:', e);
    return mapa;
  }
}
