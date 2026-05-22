// AI dev note: API do sistema de inatividade de pacientes
// Usa vw_pacientes_inativos, pessoa_eventos e campo JSONB controle_inatividade

import { supabase } from './supabase';
import type {
  InactivePatient,
  InactivePatientsFilters,
  PessoaEvento,
  MetodoContato,
  ResultadoContato,
  TipoPaciente,
  StatusAlertaInatividade,
  MotivoNaoContatar,
} from '@/types/inatividade';

// AI dev note: Buscar pacientes inativos com filtros
export async function fetchInactivePatients(
  filtros?: InactivePatientsFilters
): Promise<InactivePatient[]> {
  try {
    let query = supabase
      .from('vw_pacientes_inativos')
      .select('*')
      .order('dias_sem_consulta', { ascending: false, nullsFirst: false });

    if (filtros?.tipo && filtros.tipo !== 'todos') {
      query = query.eq('tipo_paciente', filtros.tipo);
    }

    if (filtros?.status_alerta && filtros.status_alerta.length > 0) {
      query = query.in('status_alerta', filtros.status_alerta);
    }

    if (!filtros?.incluir_nao_contatar) {
      query = query.eq('nao_contatar', false);
    }

    if (filtros?.min_dias != null) {
      query = query.gte('dias_sem_consulta', filtros.min_dias);
    }

    if (filtros?.max_dias != null) {
      query = query.lte('dias_sem_consulta', filtros.max_dias);
    }

    if (filtros?.busca) {
      query = query.ilike('nome', `%${filtros.busca}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar pacientes inativos:', error);
      throw error;
    }

    return (data || []) as InactivePatient[];
  } catch (err) {
    console.error('Erro ao buscar pacientes inativos:', err);
    return [];
  }
}

// AI dev note: Contagens por status_alerta para o card resumo da secretaria
export async function fetchInactivePatientsCounts(): Promise<
  Record<StatusAlertaInatividade, number>
> {
  const empty: Record<StatusAlertaInatividade, number> = {
    ativo: 0,
    alerta_60: 0,
    alerta_180: 0,
    alerta_360: 0,
    alerta_540: 0,
    fora_janela: 0,
    sem_historico: 0,
    nao_contatar: 0,
    indefinido: 0,
  };

  try {
    const { data, error } = await supabase
      .from('vw_pacientes_inativos')
      .select('status_alerta')
      .eq('nao_contatar', false);

    if (error) throw error;

    (data || []).forEach((row: { status_alerta: StatusAlertaInatividade }) => {
      empty[row.status_alerta] = (empty[row.status_alerta] || 0) + 1;
    });
    return empty;
  } catch (err) {
    console.error('Erro ao buscar contagens de pacientes inativos:', err);
    return empty;
  }
}

// AI dev note: Registrar contato de inatividade
export async function registerInactivityContact(
  pacienteId: string,
  responsavelId: string | null,
  dados: {
    metodo: MetodoContato;
    dias_inativos: number;
    alerta: StatusAlertaInatividade;
    tipo_paciente: TipoPaciente;
    template_usado?: string;
    mensagem_enviada?: string;
    status?: ResultadoContato;
    resultado?: string;
    proximo_contato?: string;
    observacoes?: string;
  }
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (!pessoa) throw new Error('Pessoa não encontrada');

  const dadosEvento = {
    dias_inativos: dados.dias_inativos,
    alerta: dados.alerta,
    tipo_paciente: dados.tipo_paciente,
    template_usado: dados.template_usado,
    mensagem_enviada: dados.mensagem_enviada,
    status: dados.status || 'contatado',
    resultado: dados.resultado,
    proximo_contato: dados.proximo_contato,
  };

  const { error } = await supabase.from('pessoa_eventos').insert({
    pessoa_id: pacienteId,
    responsavel_id: responsavelId,
    tipo_evento: 'contato_inatividade',
    categoria: 'inatividade',
    metodo: dados.metodo,
    contatado_por: pessoa.id,
    dados_evento: dadosEvento,
    observacoes: dados.observacoes,
  });

  if (error) throw new Error(error.message);
}

// AI dev note: Marcar paciente como "não contatar"
export async function markPatientDoNotContact(
  pacienteId: string,
  motivo: MotivoNaoContatar,
  observacoes?: string
): Promise<void> {
  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('controle_inatividade')
    .eq('id', pacienteId)
    .single();

  const atual = (pessoa?.controle_inatividade || {}) as Record<string, unknown>;
  const controleAtualizado = {
    ...atual,
    nao_contatar: true,
    motivo_nao_contatar: motivo,
    observacoes_controle: observacoes || null,
  };

  const { error } = await supabase
    .from('pessoas')
    .update({
      controle_inatividade: controleAtualizado,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pacienteId);

  if (error) throw new Error(error.message);
}

export async function unmarkPatientDoNotContact(
  pacienteId: string
): Promise<void> {
  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('controle_inatividade')
    .eq('id', pacienteId)
    .single();

  const atual = (pessoa?.controle_inatividade || {}) as Record<string, unknown>;
  const controleAtualizado = {
    ...atual,
    nao_contatar: false,
    motivo_nao_contatar: null,
  };

  const { error } = await supabase
    .from('pessoas')
    .update({
      controle_inatividade: controleAtualizado,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pacienteId);

  if (error) throw new Error(error.message);
}

// AI dev note: Buscar histórico de contatos de um paciente
export async function fetchPatientInactivityContactHistory(
  pacienteId: string
): Promise<PessoaEvento[]> {
  try {
    const { data, error } = await supabase
      .from('pessoa_eventos')
      .select('*')
      .eq('pessoa_id', pacienteId)
      .eq('tipo_evento', 'contato_inatividade')
      .order('data_evento', { ascending: false });

    if (error) throw error;
    return (data || []) as PessoaEvento[];
  } catch (err) {
    console.error('Erro ao buscar histórico de contatos:', err);
    return [];
  }
}

// AI dev note: Helper para gerar link wa.me com o telefone do responsável
// O envio do WhatsApp acontece no próprio device da secretária (link wa.me)
// e o feedback do retorno é registrado depois via registerInactivityContact.
export function buildWhatsAppLink(
  telefone: number | string | null,
  mensagem?: string
): string | null {
  if (!telefone) return null;
  const onlyDigits = String(telefone).replace(/\D/g, '');
  if (!onlyDigits) return null;
  // Garantir DDI 55 (Brasil) caso ainda não esteja prefixado
  const withCountry = onlyDigits.startsWith('55')
    ? onlyDigits
    : `55${onlyDigits}`;
  const text = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
  return `https://wa.me/${withCountry}${text}`;
}
