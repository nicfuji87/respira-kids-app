// AI dev note: API do dashboard de Análise de Conversas (WhatsApp/Chatwoot).
// Leitura na VIEW vw_whatsapp_conversas_enriquecidas (conversa + pessoa vinculada +
// agendamentos/faturas do sistema). Escrita (follow-up) na tabela base whatsapp_conversas.
// A escrita das análises é feita pelo n8n (service_role); aqui só lemos, conciliamos e
// atualizamos o estado de follow-up (concluir/ignorar).

import { supabase } from './supabase';
import type {
  ConciliacaoAlerta,
  DistribuicaoItem,
  FollowupStatus,
  WhatsAppConversaRow,
  WhatsAppConversasInsights,
  WhatsAppConversasStats,
  WhatsAppDashboardFilters,
} from '@/types/whatsapp-conversas';

const RPC_FETCH = 'get_whatsapp_conversas_enriquecidas';
const RPC_FETCH_PACIENTE = 'get_whatsapp_conversas_por_paciente';
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
  documento: 'Documento / atestado',
  nota_fiscal: 'Nota fiscal',
  avaliacao: 'Avaliação',
  pos_consulta: 'Pós-consulta',
  sem_atendimento: 'Sem atendimento',
  outros: 'Outros',
};

export const TIPO_SERVICO_LABELS: Record<string, string> = {
  respiratoria: 'Fisio respiratória',
  motora: 'Fisio motora',
  avaliacao: 'Avaliação',
  multiplos: 'Múltiplos',
  nao_informado: 'Não informado',
};

export const LOCAL_ATENDIMENTO_LABELS: Record<string, string> = {
  clinica: 'Clínica',
  domiciliar: 'Domiciliar',
  nao_informado: 'Não informado',
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
 * Busca conversas enriquecidas (admin/secretaria) via RPC SECURITY DEFINER.
 * A função checa o papel (is_admin/is_secretaria) e roda a view como dono,
 * evitando overhead de RLS por linha nas tabelas-base do join.
 */
export async function fetchWhatsAppConversas(): Promise<WhatsAppConversaRow[]> {
  const { data, error } = await supabase.rpc(RPC_FETCH);

  if (error) {
    console.error('[whatsapp-conversas] erro ao buscar:', error);
    throw error;
  }

  return (data || []) as WhatsAppConversaRow[];
}

/**
 * Busca as conversas vinculadas a um paciente (usado no detalhe do paciente).
 * Casa o paciente (ou seu responsável) com a conversa pelo telefone.
 */
export async function fetchWhatsAppConversasByPaciente(
  pacienteId: string
): Promise<WhatsAppConversaRow[]> {
  const { data, error } = await supabase.rpc(RPC_FETCH_PACIENTE, {
    p_paciente_id: pacienteId,
  });

  if (error) {
    console.error('[whatsapp-conversas] erro ao buscar por paciente:', error);
    throw error;
  }

  return (data || []) as WhatsAppConversaRow[];
}

/**
 * Atualiza o estado de follow-up de uma conversa (concluir / ignorar / reabrir).
 * Escreve na tabela base (a view não é atualizável).
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
// CONCILIAÇÃO (conversa x sistema)
// =====================================================

const MS_DIA = 24 * 60 * 60 * 1000;
/** Tolerância para casar uma data mencionada com um agendamento (em dias). */
const TOLERANCIA_DIAS = 2;
/** Janela de conciliação ao redor da conversa (a conversa é processada parcialmente,
 * então datas muito distantes geram falsos positivos). */
const JANELA_DIAS = 30;

function diaUTC(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  // Normaliza para o "dia" (descarta horas) usando referência local.
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDia(diaMs: number): string {
  const d = new Date(diaMs);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function dentroDaTolerancia(a: number, lista: number[]): boolean {
  return lista.some((b) => Math.abs(a - b) <= TOLERANCIA_DIAS * MS_DIA);
}

function conversaSobreAgenda(row: WhatsAppConversaRow): boolean {
  return (
    row.agendamento_realizado ||
    row.confirmacao_consulta ||
    row.remarcacao_solicitada ||
    row.intencao_principal === 'agendamento' ||
    row.intencao_principal === 'confirmacao' ||
    row.intencao_principal === 'remarcacao'
  );
}

/**
 * Compara o que a conversa afirma (IA) com o que o sistema tem (agendamentos /
 * faturas) e devolve as divergências. Só faz sentido para clientes cadastrados.
 */
export function computeConciliacao(
  row: WhatsAppConversaRow
): ConciliacaoAlerta[] {
  if (!row.cliente_cadastrado) return [];

  const alertas: ConciliacaoAlerta[] = [];

  const agendamentos = Array.isArray(row.agendamentos_sistema)
    ? row.agendamentos_sistema
    : [];
  const faturas = Array.isArray(row.faturas_sistema) ? row.faturas_sistema : [];

  // --- Agendamento ---
  // Janela ±30 dias relativa ao período da conversa (descarta datas distantes).
  const refIni = diaUTC(row.iniciada_em || row.created_at);
  const refFim = diaUTC(row.ultima_mensagem_em || row.created_at);
  const naJanela = (d: number): boolean => {
    if (refIni !== null && d < refIni - JANELA_DIAS * MS_DIA) return false;
    if (refFim !== null && d > refFim + JANELA_DIAS * MS_DIA) return false;
    return true;
  };

  const datasMencionadas = (
    Array.isArray(row.data_consulta_mencionada)
      ? row.data_consulta_mencionada
      : []
  )
    .map((d) => diaUTC(d))
    .filter((d): d is number => d !== null)
    .filter(naJanela);

  const datasSistema = agendamentos
    .map((a) => diaUTC(a.data_hora))
    .filter((d): d is number => d !== null);

  for (const dm of datasMencionadas) {
    if (!dentroDaTolerancia(dm, datasSistema)) {
      alertas.push({
        trilha: 'agendamento',
        direcao: 'conversa_sem_sistema',
        severidade: 'media',
        mensagem: `Conversa menciona consulta em ${fmtDia(dm)}, sem agendamento correspondente no sistema.`,
      });
    }
  }

  if (conversaSobreAgenda(row)) {
    for (const a of agendamentos) {
      const ds = diaUTC(a.data_hora);
      if (ds === null) continue;
      // Só agendamentos dentro da janela ±30 dias da conversa.
      if (!naJanela(ds)) continue;
      if (!dentroDaTolerancia(ds, datasMencionadas)) {
        alertas.push({
          trilha: 'agendamento',
          direcao: 'sistema_sem_conversa',
          severidade: 'baixa',
          mensagem: `Agendamento em ${fmtDia(ds)}${
            a.status_consulta ? ` (${a.status_consulta})` : ''
          } no sistema não foi mencionado na conversa.`,
        });
      }
    }
  }

  // --- Nota fiscal ---
  const temNfeSistema =
    faturas.some((f) => f.tem_nfe) || agendamentos.some((a) => a.tem_nfe);
  if (row.nota_fiscal_enviada && !temNfeSistema) {
    alertas.push({
      trilha: 'nota_fiscal',
      direcao: 'conversa_sem_sistema',
      severidade: 'media',
      mensagem:
        'Conversa indica nota fiscal enviada, mas não há NF registrada no sistema.',
    });
  }
  if (
    !row.nota_fiscal_enviada &&
    temNfeSistema &&
    row.intencao_principal === 'nota_fiscal'
  ) {
    alertas.push({
      trilha: 'nota_fiscal',
      direcao: 'sistema_sem_conversa',
      severidade: 'baixa',
      mensagem:
        'Sistema possui NF emitida que não aparece registrada na conversa.',
    });
  }

  // --- Cobrança / pagamento ---
  const faturasAberto = faturas.filter(
    (f) => f.status === 'pendente' || f.status === 'atrasado'
  );
  if (row.pagamento_confirmado && faturasAberto.length > 0) {
    const st = faturasAberto.some((f) => f.status === 'atrasado')
      ? 'atrasada'
      : 'pendente';
    alertas.push({
      trilha: 'cobranca',
      direcao: 'conversa_sem_sistema',
      severidade: 'alta',
      mensagem: `Cliente indica pagamento na conversa, mas há fatura ${st} no sistema.`,
    });
  }
  const temAtrasada = faturas.some((f) => f.status === 'atrasado');
  if (temAtrasada && !row.pagamento_solicitado && !row.pagamento_confirmado) {
    alertas.push({
      trilha: 'cobranca',
      direcao: 'sistema_sem_conversa',
      severidade: 'media',
      mensagem:
        'Há fatura atrasada no sistema sem cobrança registrada na conversa.',
    });
  }

  return alertas;
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
    if (!passesArrayFilter(filters.tiposServico, row.tipo_servico_mencionado))
      return false;

    if (filters.cadastro === 'cadastrados' && !row.cliente_cadastrado)
      return false;
    if (filters.cadastro === 'nao_cadastrados' && row.cliente_cadastrado)
      return false;

    if (filters.apenasFollowup) {
      if (!row.necessita_followup || row.followup_status !== 'pendente')
        return false;
    }
    if (filters.apenasReclamacoes && !row.reclamacao_identificada) return false;
    if (filters.apenasClinico && !row.tem_conteudo_clinico) return false;
    if (filters.apenasDivergencias && computeConciliacao(row).length === 0)
      return false;

    if (search) {
      const haystack = [
        row.contato_nome,
        row.contato_telefone,
        row.pessoa_vinculada_nome,
        row.resumo,
        ...(Array.isArray(row.profissional_mencionado)
          ? row.profissional_mencionado
          : []),
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

  // Conciliação (uma passada)
  let conversasComDivergencia = 0;
  let divergenciasAgendamento = 0;
  let divergenciasNotaFiscal = 0;
  let divergenciasCobranca = 0;
  for (const r of rows) {
    const alertas = computeConciliacao(r);
    if (alertas.length > 0) conversasComDivergencia += 1;
    for (const a of alertas) {
      if (a.trilha === 'agendamento') divergenciasAgendamento += 1;
      else if (a.trilha === 'nota_fiscal') divergenciasNotaFiscal += 1;
      else if (a.trilha === 'cobranca') divergenciasCobranca += 1;
    }
  }

  const cadastrados = countBool(rows, 'cliente_cadastrado');

  return {
    totalConversas: rows.length,
    conversasUltimos7Dias: rows.filter((r) => agora - refDate(r) <= ms7).length,
    conversasUltimos30Dias: rows.filter((r) => agora - refDate(r) <= ms30)
      .length,
    totalMensagens: rows.reduce((acc, r) => acc + (r.total_mensagens || 0), 0),

    clientesCadastrados: cadastrados,
    clientesNaoCadastrados: rows.length - cadastrados,

    leadsQuentes: countBool(rows, 'lead_quente'),
    clientesNovos: countBool(rows, 'cliente_novo'),
    agendamentosRealizados: countBool(rows, 'agendamento_realizado'),
    remarcacoes: countBool(rows, 'remarcacao_solicitada'),
    cancelamentos: countBool(rows, 'cancelamento_detectado'),
    pagamentosSolicitados: countBool(rows, 'pagamento_solicitado'),
    pagamentosConfirmados: countBool(rows, 'pagamento_confirmado'),
    notasFiscaisEnviadas: countBool(rows, 'nota_fiscal_enviada'),
    foraHorarioComercial: countBool(rows, 'fora_horario_comercial'),

    atendimentosDomiciliares: rows.filter(
      (r) => r.local_atendimento === 'domiciliar'
    ).length,
    resolvidosPrimeiroContato: countBool(rows, 'resolvido_primeiro_contato'),
    valorMencionadoTotal: rows.reduce(
      (acc, r) =>
        acc + (typeof r.valor_mencionado === 'number' ? r.valor_mencionado : 0),
      0
    ),

    conversasComDivergencia,
    divergenciasAgendamento,
    divergenciasNotaFiscal,
    divergenciasCobranca,

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
    conversasComAutomacao: rows.filter(
      (r) => (r.mensagens_automaticas || 0) > 0
    ).length,

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
    distribuicaoTipoServico: distribuicaoSingle(
      rows,
      'tipo_servico_mencionado',
      TIPO_SERVICO_LABELS
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

  // Resolução por tipo de serviço = % finalizadas por tipo de serviço
  const servicos = new Map<string, { total: number; finalizadas: number }>();
  for (const r of rows) {
    const c = r.tipo_servico_mencionado || 'nao_informado';
    const entry = servicos.get(c) || { total: 0, finalizadas: 0 };
    entry.total += 1;
    if (r.status_conversa === 'finalizada') entry.finalizadas += 1;
    servicos.set(c, entry);
  }
  const resolucaoPorTipoServico: DistribuicaoItem[] = Array.from(
    servicos.entries()
  )
    .map(([value, v]) => ({
      value,
      label: TIPO_SERVICO_LABELS[value] || value,
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
    topMotivosInsatisfacao: distribuicaoSingle(
      rows.filter((r) => r.reclamacao_identificada),
      'motivo_insatisfacao'
    ).slice(0, 10),
    topProfissionais: distribuicaoArray(rows, 'profissional_mencionado').slice(
      0,
      10
    ),

    taxaResolucao: pct(finalizadas, rows.length),
    taxaPendenteAtendente: pct(pendentesAtendente, rows.length),

    resolucaoPorTipoServico,

    sugestoesMelhoria: sugestoes,
  };
}
