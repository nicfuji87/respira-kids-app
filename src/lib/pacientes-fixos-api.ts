// AI dev note: Pacientes Fixos — paciente motor com frequência de atendimento.
// Banco: supabase/migrations/pacientes_fixos.sql. Toda escrita é por RPC; a
// evolução motora finalizada sincroniza sozinha (gatilho no banco), então o
// app só lê a frequência para pré-preencher a conduta.
// Regra da semana: a frequência nunca muda sozinha; quinzenal/mensal contam a
// partir da última sessão, e "Adiar" empurra a semana prevista.

import { supabase } from '@/lib/supabase';

export type FrequenciaFixo =
  | 'diaria'
  | '3x_semana'
  | '2x_semana'
  | 'semanal'
  | 'quinzenal'
  | 'mensal';

export const FREQUENCIAS_FIXO: { valor: FrequenciaFixo; label: string }[] = [
  { valor: '3x_semana', label: '3x/semana' },
  { valor: '2x_semana', label: '2x/semana' },
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'quinzenal', label: 'Quinzenal' },
  { valor: 'mensal', label: 'Mensal' },
  { valor: 'diaria', label: 'Diária' },
];

export const rotuloFrequencia = (f?: string | null): string =>
  FREQUENCIAS_FIXO.find((x) => x.valor === f)?.label ?? '—';

export interface PacienteFixoHistorico {
  acao:
    | 'criado'
    | 'frequencia'
    | 'adiado'
    | 'adiamento_removido'
    | 'encerrado'
    | 'reativado'
    | 'editado';
  origem: 'cadastro' | 'evolucao' | 'lista' | null;
  frequencia: FrequenciaFixo | null;
  frequencia_antes: FrequenciaFixo | null;
  adiado_ate: string | null;
  feito_por_nome: string | null;
  feito_em: string;
}

export interface ProfissionalRef {
  id: string;
  nome: string;
}

/** Quem atendeu nas últimas 6 sessões motoras (120 dias). */
export interface AlternanciaHistorico {
  profissionais: (ProfissionalRef & { sessoes: number; ultima: string })[];
  total: number;
  /** 2+ profissionais com 2+ sessões cada (uma sessão só é substituição) */
  divide: boolean;
  dividem: string[];
  da_vez: string | null;
}

export interface PacienteFixo {
  /** null quando o paciente ainda não é fixo (vem só o histórico) */
  id: string | null;
  novo?: boolean;
  paciente_id: string;
  frequencia: FrequenciaFixo;
  profissional_id: string | null;
  profissional_nome: string | null;
  /** Profissionais do cadastro (2+ = atendimento dividido) */
  profissionais: ProfissionalRef[];
  historico_profissionais: AlternanciaHistorico | null;
  observacao: string | null;
  ativo: boolean;
  adiado_ate: string | null;
  adiado_motivo: string | null;
  encerrado_em: string | null;
  encerrado_motivo: 'alta' | 'manual' | null;
  ultima_origem: 'cadastro' | 'evolucao' | 'lista';
  atualizado_por_nome: string | null;
  updated_at: string;
  historico: PacienteFixoHistorico[];
}

export type SituacaoFixo = 'falta' | 'completo' | 'adiado' | 'fora_da_semana';

export interface SessaoMarcada {
  id: string;
  data_hora: string; // 'YYYY-MM-DDTHH:mm' hora de parede
  status: string;
  profissional_nome: string | null;
}

export interface PacienteFixoSemana {
  paciente_id: string;
  paciente_nome: string;
  data_nascimento: string | null;
  frequencia: FrequenciaFixo;
  sessoes: number;
  semanas: number;
  situacao: SituacaoFixo;
  falta: number;
  atrasado: boolean;
  semana_prevista: string;
  adiado_ate: string | null;
  adiado_motivo: string | null;
  observacao: string | null;
  marcadas: SessaoMarcada[];
  ultima_sessao: string | null;
  /** A da vez (atendeu há mais tempo entre as do paciente) */
  profissional_id: string | null;
  origem_agendamento_id: string | null;
  profissional_nome: string | null;
  profissional_fixa: boolean;
  /** Cadastro > histórico (quando divide) > última sessão */
  profissionais: ProfissionalRef[];
  divide: boolean;
  divide_origem: 'cadastro' | 'historico' | null;
  historico_profissionais: AlternanciaHistorico['profissionais'];
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  envio: {
    enviado_em: string;
    enviado_por_nome: string | null;
    agenda_id: string | null;
    vezes: number;
  } | null;
}

export interface AgendaPublicaSemana {
  id: string;
  token: string;
  titulo: string;
  profissional_id: string;
  profissional_nome: string;
  data_inicio: string;
  data_fim: string;
  slots: number;
  livres: number;
}

export interface SemanaFixos {
  ok: boolean;
  motivo?: string;
  semana: string;
  semana_fim: string;
  pacientes: PacienteFixoSemana[];
  altas_recentes: {
    paciente_id: string;
    paciente_nome: string;
    encerrado_em: string;
    por_nome: string | null;
  }[];
  agendas: AgendaPublicaSemana[];
}

export interface SugestaoFixo {
  paciente_id: string;
  paciente_nome: string;
  sessoes_90d: number;
  ultima_sessao: string;
  profissional_id: string | null;
  profissional_nome: string | null;
  divide: boolean;
  dividem: string[];
  historico_profissionais: AlternanciaHistorico['profissionais'];
  frequencia_evolucao: string | null;
  frequencia_sugerida: FrequenciaFixo;
}

export interface HorariosLivresSemana {
  ok: boolean;
  motivo?: string;
  profissional_id: string;
  semana: string;
  duracao_minutos: number;
  padrao: {
    agenda_modelo_id: string | null;
    servicos: { id: string; nome: string; duracao_minutos: number }[];
    locais: { id: string; nome: string }[];
    empresas: { id: string; nome: string }[];
  };
  dias: {
    data: string;
    historico: boolean;
    feriado: string | null;
    livres: number;
    horarios: { hora: string; livre: boolean }[];
  }[];
}

const erroLegivel = (e: unknown): Error =>
  new Error(
    typeof e === 'object' && e && 'message' in e
      ? String((e as { message: unknown }).message)
      : 'Erro inesperado'
  );

async function rpc<T>(nome: string, params?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome, params);
  if (error) throw erroLegivel(error);
  return data as T;
}

export const buscarPacienteFixo = (pacienteId: string) =>
  rpc<PacienteFixo | null>('fn_paciente_fixo_get', {
    p_paciente_id: pacienteId,
  });

export const salvarPacienteFixo = (dados: {
  pacienteId: string;
  frequencia: FrequenciaFixo;
  profissionalId?: string | null;
  /** Lista de profissionais (vence profissionalId); [] = vale o histórico */
  profissionais?: string[] | null;
  observacao?: string | null;
  origem?: 'cadastro' | 'lista';
}) =>
  rpc<PacienteFixo>('fn_paciente_fixo_salvar', {
    p_paciente_id: dados.pacienteId,
    p_frequencia: dados.frequencia,
    p_profissional_id: dados.profissionalId ?? null,
    p_observacao: dados.observacao ?? null,
    p_origem: dados.origem ?? 'cadastro',
    p_profissionais: dados.profissionais ?? null,
  });

export const encerrarPacienteFixo = (
  pacienteId: string,
  origem: 'cadastro' | 'lista' = 'cadastro'
) =>
  rpc<PacienteFixo>('fn_paciente_fixo_encerrar', {
    p_paciente_id: pacienteId,
    p_origem: origem,
  });

/** volta = qualquer dia da semana em que ele volta; null tira o adiamento. */
export const adiarPacienteFixo = (
  pacienteId: string,
  volta: string | null,
  motivo?: string | null
) =>
  rpc<PacienteFixo>('fn_paciente_fixo_adiar', {
    p_paciente_id: pacienteId,
    p_volta: volta,
    p_motivo: motivo ?? null,
  });

export const registrarEnvioLink = (dados: {
  pacienteId: string;
  semana: string;
  agendaId: string | null;
  telefone: string | null;
}) =>
  rpc<string>('fn_paciente_fixo_registrar_envio', {
    p_paciente_id: dados.pacienteId,
    p_semana: dados.semana,
    p_agenda_id: dados.agendaId,
    p_telefone: dados.telefone,
  });

export const buscarSemanaFixos = (semana: string) =>
  rpc<SemanaFixos>('fn_pacientes_fixos_semana', { p_semana: semana });

export const buscarSugestoesFixos = () =>
  rpc<SugestaoFixo[]>('fn_pacientes_fixos_sugestoes');

export const buscarHorariosLivresSemana = (
  profissionalId: string,
  semana: string
) =>
  rpc<HorariosLivresSemana>('fn_fixos_horarios_livres', {
    p_profissional_id: profissionalId,
    p_semana: semana,
  });

export const criarAgendaDaSemana = (dados: {
  profissionalId: string;
  semana: string;
  horarios: string[]; // 'YYYY-MM-DD HH:mm'
  titulo?: string | null;
}) =>
  rpc<{
    ok: boolean;
    agenda_id: string;
    token: string;
    titulo: string;
    slots: number;
  }>('fn_fixos_criar_agenda', {
    p_profissional_id: dados.profissionalId,
    p_semana: dados.semana,
    p_horarios: dados.horarios,
    p_titulo: dados.titulo ?? null,
  });

// ---------------------------------------------------------------------------
// Datas (sempre texto 'YYYY-MM-DD', sem fuso: hora de parede)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDia = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const deIso = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
};

/** Segunda-feira da semana do dia (hoje, se omitido). */
export const segundaDaSemana = (iso?: string) => {
  const d = iso ? deIso(iso) : new Date();
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dow);
  return isoDia(d);
};

export const somarDias = (iso: string, dias: number) => {
  const d = deIso(iso);
  d.setDate(d.getDate() + dias);
  return isoDia(d);
};

export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const diaSemanaCurto = (iso: string) => DIAS_SEMANA[deIso(iso).getDay()];

/** '2026-11-09T15:00' → 'seg 09/11 15:00' */
export const rotuloSessao = (dataHora: string) =>
  `${diaSemanaCurto(dataHora)} ${diaMes(dataHora)} ${dataHora.slice(11, 16)}`;

export const rotuloSemana = (segunda: string) =>
  `${diaMes(segunda)} a ${diaMes(somarDias(segunda, 5))}`;

// ---------------------------------------------------------------------------
// Link e mensagem
// ---------------------------------------------------------------------------

export const linkAgendaPublica = (token: string) => {
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${appUrl}/#/agenda-publica/${token}`;
};

const primeiroNome = (nome?: string | null) =>
  (nome || '').trim().split(/\s+/)[0] || '';

/**
 * Texto do convite para escolher o horário. Curto e direto, sem diminutivo;
 * a secretaria pode ajustar no WhatsApp antes de enviar.
 */
export interface AgendaDoLink {
  profissionalNome: string | null;
  /** Período da agenda ('YYYY-MM-DD'), ex.: 09/11 a 13/11 */
  de: string;
  ate: string;
  link: string;
}

/**
 * Texto do convite para escolher o horário. Curto e direto, sem diminutivo;
 * a secretaria pode ajustar no WhatsApp antes de enviar. Paciente dividido
 * entre profissionais recebe um link de cada (a da vez primeiro).
 */
export const mensagemLinkAgenda = (dados: {
  responsavelNome: string | null;
  pacienteNome: string;
  agendas: AgendaDoLink[];
}) => {
  const saudacao = dados.responsavelNome
    ? `Olá, ${primeiroNome(dados.responsavelNome)}!`
    : 'Olá!';
  const crianca = primeiroNome(dados.pacienteNome);
  const de = dados.agendas.map((a) => a.de).sort()[0];
  const ate = dados.agendas
    .map((a) => a.ate)
    .sort()
    .slice(-1)[0];
  const periodo = `de ${diaMes(de)} a ${diaMes(ate)}`;

  if (dados.agendas.length === 1) {
    const a = dados.agendas[0];
    const com = a.profissionalNome
      ? ` com a ${primeiroNome(a.profissionalNome)}`
      : '';
    return (
      `${saudacao} Aqui é da Respira Kids.\n\n` +
      `A agenda da fisioterapia motora${com} ${periodo} já está aberta. ` +
      `Para escolher o melhor horário para ${crianca}, é só acessar o link:\n\n` +
      `${a.link}\n\n` +
      `Se nesta semana não for possível, nos avise por aqui.`
    );
  }

  const nomes = dados.agendas.map((a) => primeiroNome(a.profissionalNome));
  const lista = `${nomes.slice(0, -1).join(', a ')} e a ${nomes.slice(-1)[0]}`;
  const links = dados.agendas
    .map((a) => `Com a ${primeiroNome(a.profissionalNome)}:\n${a.link}`)
    .join('\n\n');
  return (
    `${saudacao} Aqui é da Respira Kids.\n\n` +
    `A agenda da fisioterapia motora ${periodo} já está aberta. ` +
    `Os atendimentos de ${crianca} são divididos entre a ${lista}, então dá para escolher o horário com qualquer uma delas:\n\n` +
    `${links}\n\n` +
    `Se nesta semana não for possível, nos avise por aqui.`
  );
};

/** Carimbo do banco (timestamptz) → 'dd/mm/aaaa' no fuso de Brasília. */
export const dataCarimbo = (ts?: string | null) =>
  ts
    ? new Date(ts).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      })
    : '';

/** Carimbo → 'dd/mm HH:mm' no fuso de Brasília. */
export const dataHoraCarimbo = (ts?: string | null) =>
  ts
    ? new Date(ts).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

// ---------------------------------------------------------------------------
// Envio em massa (fila no banco; sai pelo número da recepção, 5-9 min entre
// mensagens, 8h-20h, dividindo o ritmo com as cobranças em lote)
// ---------------------------------------------------------------------------

export type StatusEnvio =
  | 'fila'
  | 'enviando'
  | 'enviado'
  | 'falhou'
  | 'cancelado';

export interface EnvioSemana {
  status: StatusEnvio;
  canal: 'whatsapp_manual' | 'whatsapp_auto';
  enviado_em: string | null;
  fila_em: string | null;
  erro: string | null;
  enviado_por_nome: string | null;
  agenda_id: string | null;
  vezes: number;
}

export const buscarEnviosSemana = (semana: string) =>
  rpc<Record<string, EnvioSemana>>('fn_pacientes_fixos_envios_semana', {
    p_semana: semana,
  });

export const enfileirarEnvios = (
  itens: {
    paciente_id: string;
    semana: string;
    agendas: string[];
    telefone: string;
    texto: string;
  }[]
) =>
  rpc<{ enfileirados: number; ignorados: number; na_fila: number }>(
    'fn_fixos_enfileirar_envios',
    { p_itens: itens }
  );

export const cancelarFilaEnvios = (semana: string, pacienteId?: string) =>
  rpc<number>('fn_fixos_cancelar_fila', {
    p_semana: semana,
    p_paciente_id: pacienteId ?? null,
  });

/** Intervalo médio do envio automático (5 a 9 min). */
export const MINUTOS_MEDIOS_POR_ENVIO = 7;
