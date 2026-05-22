// AI dev note: API de relacionamento com pediatras (admin/sócios)
// View vw_pediatras_relacionamento + pessoa_eventos com tipos contato_pediatra/envio_evolucao_pediatra

import { supabase } from './supabase';
import type {
  DadosContatoPediatra,
  PediatraRelacionamento,
  PediatrasFilters,
  StatusRelacionamentoPediatra,
  TipoContatoPediatra,
} from '@/types/pediatra-relacionamento';
import type { MetodoContato, PessoaEvento } from '@/types/inatividade';

export async function fetchPediatrasRelacionamento(
  filtros?: PediatrasFilters
): Promise<PediatraRelacionamento[]> {
  let query = supabase
    .from('vw_pediatras_relacionamento')
    .select('*')
    .order('total_pacientes_vinculados', {
      ascending: false,
      nullsFirst: false,
    });

  if (filtros?.status && filtros.status.length > 0) {
    query = query.in('status_relacionamento', filtros.status);
  }
  if (filtros?.min_pacientes != null) {
    query = query.gte('total_pacientes_vinculados', filtros.min_pacientes);
  }
  if (filtros?.busca) {
    query = query.ilike('pediatra_nome', `%${filtros.busca}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao buscar pediatras:', error);
    return [];
  }
  return (data || []) as PediatraRelacionamento[];
}

export async function fetchPediatrasCounts(): Promise<
  Record<StatusRelacionamentoPediatra, number>
> {
  const empty: Record<StatusRelacionamentoPediatra, number> = {
    em_dia: 0,
    devido: 0,
    esfriando: 0,
    sem_contato: 0,
  };
  try {
    const { data, error } = await supabase
      .from('vw_pediatras_relacionamento')
      .select('status_relacionamento');
    if (error) throw error;
    (data || []).forEach(
      (row: { status_relacionamento: StatusRelacionamentoPediatra }) => {
        empty[row.status_relacionamento] =
          (empty[row.status_relacionamento] || 0) + 1;
      }
    );
    return empty;
  } catch (err) {
    console.error('Erro ao buscar contagens de pediatras:', err);
    return empty;
  }
}

export async function registerPediatraEvent(
  pediatraId: string,
  tipo: TipoContatoPediatra,
  dados: {
    metodo: MetodoContato;
    dadosEvento: DadosContatoPediatra;
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

  const { error } = await supabase.from('pessoa_eventos').insert({
    pessoa_id: pediatraId,
    tipo_evento: tipo,
    categoria: 'relacionamento',
    metodo: dados.metodo,
    contatado_por: pessoa.id,
    dados_evento: dados.dadosEvento,
    observacoes: dados.observacoes,
  });

  if (error) throw new Error(error.message);
}

export async function fetchPediatraEventHistory(
  pediatraId: string
): Promise<PessoaEvento[]> {
  const { data, error } = await supabase
    .from('pessoa_eventos')
    .select('*')
    .eq('pessoa_id', pediatraId)
    .in('tipo_evento', ['contato_pediatra', 'envio_evolucao_pediatra'])
    .order('data_evento', { ascending: false });

  if (error) {
    console.error('Erro ao buscar histórico do pediatra:', error);
    return [];
  }
  return (data || []) as PessoaEvento[];
}

// AI dev note: Dispara manualmente o webhook diário de resumo da agenda para pediatras
// Equivalente ao cron diário, mas sob demanda. Sem parâmetro, usa o dia anterior.
export async function triggerDailyPediatraSummary(
  dataReferencia?: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    'fn_enqueue_daily_pediatra_summary',
    dataReferencia ? { p_data: dataReferencia } : {}
  );
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function enqueuePediatraRelacionamentoWebhook(payload: {
  pediatra_id: string;
  pediatra_nome: string;
  tipo: TipoContatoPediatra;
  paciente_id?: string;
  paciente_nome?: string;
  evolucao_resumo?: string;
  mensagem?: string;
}): Promise<void> {
  const { error } = await supabase.from('webhook_queue').insert({
    evento: payload.tipo,
    payload: {
      tipo: payload.tipo,
      timestamp: new Date().toISOString(),
      webhook_id: crypto.randomUUID(),
      data: payload,
    },
    status: 'pendente',
    tentativas: 0,
    max_tentativas: 3,
  });
  if (error) throw new Error(error.message);
}
