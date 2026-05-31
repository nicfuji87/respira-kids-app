// AI dev note: API do dashboard de Análise de Conversas (WhatsApp/Chatwoot).
// Leitura/atualização restrita a admin + secretaria (RLS na tabela whatsapp_conversas).
// A escrita das análises é feita pelo n8n (service_role) — aqui só lemos e
// atualizamos o estado de follow-up (concluir/ignorar).

import { supabase } from './supabase';
import type {
  DistribuicaoItem,
  FollowupStatus,
  WhatsAppConversaRow,
  WhatsAppConversasInsights,
  WhatsAppConversasStats,
  WhatsAppDashboardFilters,
} from '@/types/whatsapp-conversas';

const TABLE = 'whatsapp_conversas';

// =====================================================
// LABELS (enums definidos no prompt da IA)
// =====================================================

export const STATUS_LABELS: Record<string, string> = {
  finalizada: 'Finalizada',
  pendente_atendente: 'Pendente atendente',
  pendente_cliente: 'Pendente cliente',
  aguardando_equipe: 'Aguardando equipe',
  aguardando_data_futura: 'Aguardando data futura',
  sem_atendimento: 'Sem atendimento',
};

export const INTENCAO_LABELS: Record<string, string> = {
  agendamento: 'Agendamento',
  confirmacao: 'Confirmação de consulta',
  remarcacao: 'Remarcação',
  cancelamento: 'Cancelamento',
  duvida_valor: 'Dúvida de valor',
  duvida_clinica: 'Dúvida clínica',
  financeiro: 'Financeiro',
  documento: 'Documento',
  atestado: 'Atestado',
  nota_fiscal: 'Nota fiscal',
  avaliacao: 'Avaliação',
  pos_consulta: 'Pós-consulta',
  sem_atendimento: 'Sem atendimento',
  outros: 'Outros',
};

export const TIPO_DEMANDA_LABELS: Record<string, string> = {
  clinica: 'Clínica',
  administrativa: 'Administrativa',
  financeira: 'Financeira',
  comercial: 'Comercial',
  relacionamento: 'Relacionamento',
  mista: 'Mista',
  outros: 'Outros',
};

export const SENTIMENTO_LABELS: Record<string, string> = {
  positivo: 'Positivo',
  satisfeito: 'Satisfeito',
  neutro: 'Neutro',
  ansioso: 'Ansioso',
  preocupado: 'Preocupado',
  frustrado: 'Frustrado',
  negativo: 'Negativo',
};

export const ETAPA_LABELS: Record<string, string> = {
  novo_lead: 'Novo lead',
  paciente_ativo: 'Paciente ativo',
  pos_consulta: 'Pós-consulta',
  cobranca: 'Cobrança',
  recorrente: 'Recorrente',
  suporte: 'Suporte',
  outros: 'Outros',
};

export const URGENCIA_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  nao_aplicavel: 'Não aplicável',
};

export const RESPONSAVEL_LABELS: Record<string, string> = {
  recepcao: 'Recepção',
  fisioterapeuta: 'Fisioterapeuta',
  financeiro: 'Financeiro',
  gestao: 'Gestão',
  medico_ou_triagem: 'Médico / Triagem',
  nao_aplicavel: 'Não aplicável',
};

export const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  pendente: 'Pendente',
  concluido: 'Concluído',
  ignorado: 'Ignorado',
  nao_aplicavel: 'Não aplicável',
};

export function labelFor(
  map: Record<string, string>,
  value: string | null | undefined
): string {
  if (!value) return '—';
  return map[value] || value;
}

// =====================================================
// FETCH
// =====================================================

/**
 * Busca conversas (admin/secretaria). Busca em lotes para suportar volume.
 */
export async function fetchWhatsAppConversas(): Promise<WhatsAppConversaRow[]> {
  const all: WhatsAppConversaRow[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('[whatsapp-conversas] erro ao buscar:', error);
      throw error;
    }

    const rows = (data || []) as WhatsAppConversaRow[];
    all.push(...rows);
    offset += batchSize;
    hasMore = rows.length === batchSize;
    if (offset > 20000) break; // Safety
  }

  return all;
}

/**
 * Atualiza o estado de follow-up de uma conversa (concluir / ignorar / reabrir).
 */
export async function updateFollowupStatus(
  id: string,
  status: FollowupStatus,
  pessoaId?: string | null
): Promise<void> {
  const update: Record<string, unknown> = { followup_status: status };
  if (status === 'concluido') {
    update.followup_concluido_em = new Date().toISOString();
    update.followup_concluido_por = pessoaId ?? null;
  } else {
    update.followup_concluido_em = null;
    update.followup_concluido_por = null;
  }

  const { error } = await supabase.from(TABLE).update(update).eq('id', id);
  if (error) {
    console.error('[whatsapp-conversas] erro ao atualizar follow-up:', error);
    throw error;
  }
}

// =====================================================
// FILTROS
// =====================================================

function passesArrayFilter(
  filter: string[] | undefined,
  value: string | null | undefined
): boolean {
  if (!filter || filter.length === 0) return true;
  if (value === undefined || value === null) return false;
  return filter.includes(value);
}

export function applyFilters(
  rows: WhatsAppConversaRow[],
  filters: WhatsAppDashboardFilters
): WhatsAppConversaRow[] {
  if (!filters) return rows;

  const startMs = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00`).getTime()
    : null;
  const endMs = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999`).getTime()
    : null;
  const search = (filters.search || '').trim().toLowerCase();

  return rows.filter((row) => {
    const ref = row.iniciada_em || row.created_at;
    if (startMs !== null || endMs !== null) {
      const t = new Date(ref).getTime();
      if (startMs !== null && t < startMs) return false;
      if (endMs !== null && t > endMs) return false;
    }

    if (!passesArrayFilter(filters.status, row.status_conversa)) return false;
    if (!passesArrayFilter(filters.intencoes, row.intencao_principal))
      return false;
    if (!passesArrayFilter(filters.tiposDemanda, row.tipo_demanda))
      return false;
    if (!passesArrayFilter(filters.sentimentos, row.sentimento_cliente))
      return false;
    if (!passesArrayFilter(filters.canais, row.canal_origem)) return false;

    if (filters.apenasFollowup) {
      if (!row.necessita_followup || row.followup_status !== 'pendente')
        return false;
    }
    if (filters.apenasReclamacoes && !row.reclamacao_identificada) return false;
    if (filters.apenasClinico && !row.tem_conteudo_clinico) return false;

    if (search) {
      const haystack = [
        row.contato_nome,
        row.contato_telefone,
        row.resumo,
        row.profissional_mencionado,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

// =====================================================
// AGREGAÇÕES
// =====================================================

function distribuicaoSingle(
  rows: WhatsAppConversaRow[],
  field: keyof WhatsAppConversaRow,
  labelMap?: Record<string, string>
): DistribuicaoItem[] {
  const counts = new Map<string, number>();
  let validos = 0;

  for (const row of rows) {
    const v = row[field];
    if (typeof v === 'string' && v.length > 0) {
      counts.set(v, (counts.get(v) || 0) + 1);
      validos += 1;
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelMap?.[value] || value,
      count,
      percent: validos > 0 ? Math.round((count / validos) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function distribuicaoArray(
  rows: WhatsAppConversaRow[],
  field: keyof WhatsAppConversaRow
): DistribuicaoItem[] {
  const counts = new Map<string, number>();
  let respondentes = 0;

  for (const row of rows) {
    const v = row[field];
    if (Array.isArray(v) && v.length > 0) {
      respondentes += 1;
      for (const item of v) {
        if (typeof item === 'string' && item.trim().length > 0) {
          const key = item.trim();
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      percent: respondentes > 0 ? Math.round((count / respondentes) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / values.length);
}

function countBool(
  rows: WhatsAppConversaRow[],
  field: keyof WhatsAppConversaRow
): number {
  return rows.filter((r) => r[field] === true).length;
}

function refDate(row: WhatsAppConversaRow): number {
  return new Date(row.iniciada_em || row.created_at).getTime();
}

function conversasPorDia(rows: WhatsAppConversaRow[]) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dias: Array<{ data: string; total: number }> = [];
  const indexByKey = new Map<string, number>();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    indexByKey.set(key, dias.length);
    dias.push({ data: key, total: 0 });
  }

  for (const row of rows) {
    const ref = row.iniciada_em || row.created_at;
    if (!ref) continue;
    const key = new Date(ref).toISOString().slice(0, 10);
    const idx = indexByKey.get(key);
    if (typeof idx === 'number') dias[idx].total += 1;
  }

  return dias;
}

export function computeStats(
  rows: WhatsAppConversaRow[]
): WhatsAppConversasStats {
  const agora = Date.now();
  const ms7 = 7 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;

  const primeirasRespostas = rows
    .map((r) => r.tempo_resposta_inicial_minutos)
    .filter((n): n is number => typeof n === 'number');
  const respostasMedias = rows
    .map((r) => r.tempo_medio_resposta_minutos)
    .filter((n): n is number => typeof n === 'number');

  return {
    totalConversas: rows.length,
    conversasUltimos7Dias: rows.filter((r) => agora - refDate(r) <= ms7).length,
    conversasUltimos30Dias: rows.filter((r) => agora - refDate(r) <= ms30)
      .length,
    totalMensagens: rows.reduce((acc, r) => acc + (r.total_mensagens || 0), 0),

    leadsQuentes: countBool(rows, 'lead_quente'),
    clientesNovos: countBool(rows, 'cliente_novo'),
    agendamentosRealizados: countBool(rows, 'agendamento_realizado'),
    remarcacoes: countBool(rows, 'remarcacao_solicitada'),
    cancelamentos: countBool(rows, 'cancelamento_detectado'),
    noShows: countBool(rows, 'no_show_detectado'),
    pagamentosSolicitados: countBool(rows, 'pagamento_solicitado'),
    pagamentosConfirmados: countBool(rows, 'pagamento_confirmado'),
    notasFiscaisEnviadas: countBool(rows, 'nota_fiscal_enviada'),
    pesquisasSatisfacao: countBool(rows, 'pesquisa_satisfacao_enviada'),
    avaliacoesGoogle: countBool(rows, 'avaliacao_google_solicitada'),

    tempoMedioPrimeiraResposta: media(primeirasRespostas),
    tempoMedioResposta: media(respostasMedias),

    followupsPendentes: rows.filter(
      (r) => r.necessita_followup && r.followup_status === 'pendente'
    ).length,
    pendentesAtendente: rows.filter(
      (r) =>
        r.status_conversa === 'pendente_atendente' ||
        r.status_conversa === 'aguardando_equipe'
    ).length,

    reclamacoes: countBool(rows, 'reclamacao_identificada'),
    reclamacoesAtencaoAdmin: countBool(rows, 'requer_atencao_admin'),
    conteudoClinico: countBool(rows, 'tem_conteudo_clinico'),
    urgenciaClinicaAlta: rows.filter((r) => r.urgencia_clinica === 'alta')
      .length,
    triagemHumana: countBool(rows, 'necessita_triagem_humana'),
    excessoAutomacao: countBool(rows, 'possivel_excesso_automacao'),
    riscoLgpdAlto: rows.filter((r) => r.risco_lgpd === 'alto').length,

    distribuicaoStatus: distribuicaoSingle(
      rows,
      'status_conversa',
      STATUS_LABELS
    ),
    distribuicaoIntencao: distribuicaoSingle(
      rows,
      'intencao_principal',
      INTENCAO_LABELS
    ),
    distribuicaoTipoDemanda: distribuicaoSingle(
      rows,
      'tipo_demanda',
      TIPO_DEMANDA_LABELS
    ),
    distribuicaoSentimento: distribuicaoSingle(
      rows,
      'sentimento_cliente',
      SENTIMENTO_LABELS
    ),
    distribuicaoEtapa: distribuicaoSingle(rows, 'etapa_conversa', ETAPA_LABELS),
    distribuicaoCanal: distribuicaoSingle(rows, 'canal_origem'),
    distribuicaoUrgenciaClinica: distribuicaoSingle(
      rows.filter((r) => r.tem_conteudo_clinico),
      'urgencia_clinica',
      URGENCIA_LABELS
    ),
    distribuicaoResponsavel: distribuicaoSingle(
      rows.filter((r) => r.necessita_followup),
      'responsavel_sugerido',
      RESPONSAVEL_LABELS
    ),
    conversasPorDia: conversasPorDia(rows),
  };
}

// =====================================================
// INSIGHTS
// =====================================================

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function computeInsights(
  rows: WhatsAppConversaRow[]
): WhatsAppConversasInsights {
  const perguntouValor = countBool(rows, 'perguntou_valor');
  const perguntouDisp = countBool(rows, 'perguntou_disponibilidade');
  const agendou = countBool(rows, 'agendamento_realizado');

  const interessados = rows.filter(
    (r) => r.perguntou_disponibilidade || r.perguntou_valor || r.lead_quente
  );

  const leadsQuentes = rows.filter((r) => r.lead_quente);
  const leadsQuentesSemAgendamento = leadsQuentes.filter(
    (r) => !r.agendamento_realizado
  ).length;
  const leadsQuentesSemResposta = leadsQuentes.filter(
    (r) =>
      r.status_conversa === 'pendente_atendente' ||
      r.status_conversa === 'aguardando_equipe' ||
      (r.mensagens_atendente === 0 && r.mensagens_cliente > 0)
  ).length;

  const finalizadas = rows.filter(
    (r) => r.status_conversa === 'finalizada'
  ).length;
  const pendentesAtendente = rows.filter(
    (r) =>
      r.status_conversa === 'pendente_atendente' ||
      r.status_conversa === 'aguardando_equipe'
  ).length;

  // NPS operacional por canal = % finalizadas por canal
  const canais = new Map<string, { total: number; finalizadas: number }>();
  for (const r of rows) {
    const c = r.canal_origem || 'nao_informado';
    const entry = canais.get(c) || { total: 0, finalizadas: 0 };
    entry.total += 1;
    if (r.status_conversa === 'finalizada') entry.finalizadas += 1;
    canais.set(c, entry);
  }
  const npsOperacionalPorCanal: DistribuicaoItem[] = Array.from(
    canais.entries()
  )
    .map(([value, v]) => ({
      value,
      label: value === 'nao_informado' ? 'Não informado' : value,
      count: v.total,
      percent: pct(v.finalizadas, v.total),
    }))
    .sort((a, b) => b.count - a.count);

  const sugestoes = rows
    .map((r) => (r.sugestao_melhoria || '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 25);

  return {
    funilPerguntouValor: perguntouValor,
    funilPerguntouDisponibilidade: perguntouDisp,
    funilAgendou: agendou,
    taxaConversaoLeadAgendamento: pct(agendou, interessados.length),

    leadsQuentesSemAgendamento,
    leadsQuentesSemResposta,

    topPontosAtrito: distribuicaoArray(rows, 'pontos_de_atrito').slice(0, 10),
    topSintomas: distribuicaoArray(
      rows.filter((r) => r.tem_conteudo_clinico),
      'sintomas_mencionados'
    ).slice(0, 10),
    topMotivosInsatisfacao: distribuicaoSingle(
      rows.filter((r) => r.reclamacao_identificada),
      'motivo_insatisfacao'
    ).slice(0, 10),

    taxaResolucao: pct(finalizadas, rows.length),
    taxaPendenteAtendente: pct(pendentesAtendente, rows.length),

    npsOperacionalPorCanal,

    sugestoesMelhoria: sugestoes,
  };
}

/**
 * Lista os valores distintos de canal_origem presentes nas conversas (para filtros).
 */
export function extractCanais(rows: WhatsAppConversaRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.canal_origem) set.add(row.canal_origem);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
