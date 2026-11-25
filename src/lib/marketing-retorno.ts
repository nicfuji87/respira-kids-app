// AI dev note: Marketing → Retorno por canal → Google Ads (admin). Dados de
// fn_atrib_retorno_anuncios (supabase/migrations/atribuicao_v2_p0_calculo_unico.sql),
// que usa a MESMA base do Retorno por canal (interno.fn_atrib_conversas /
// fn_atrib_pacientes): mesma paciente, mesmo resultado nas duas visões.
// Responde "quem veio do anúncio, quantas sessões fez e quanto rendeu":
// - paciente atendida = presença CONFIRMADA (sessão finalizada); sessão passada sem
//   baixa fica "a conferir", mesmo paga (a falta é cobrada, pagamento não prova presença);
// - receita REALIZADA: sessões finalizadas + faltas (cobradas integral), pelo valor da agenda;
// - receita A CONFERIR: sessões que já passaram sem baixa;
// - receita RECEBIDA: o que as faturas pagas cobriram;
// - receita AGENDADA: sessões futuras, fora do ROAS realizado.
// Filtros de campanha e serviço vão para o banco. Com serviço, investimento, cliques e
// conversas vêm nulos: ROAS, CAC e custo por conversa ficam "indisponível neste recorte".
// Valores BRUTOS: sem comissão, imposto nem taxa (a margem ainda não existe no sistema).

import { supabase } from '@/lib/supabase';
import type { Indicador } from '@/lib/marketing-atribuicao';
import { SEM_DIVISAO_SERVICO, type Presenca } from '@/lib/marketing-canais';

export interface CampanhaRetorno {
  campanha_id: string;
  nome: string;
  /** null = recorte por serviço (investimento não se divide por serviço). */
  investimento: number | null;
  impressoes: number | null;
  cliques: number | null;
  conversas: number | null;
  convenio: number | null;
  agendaram: number;
  /** Pacientes com presença confirmada. */
  pacientes: number;
  pacientes_novas: number;
  /** Sem sessão finalizada, com sessão passada paga (a conferir). */
  pacientes_provaveis: number;
  novas_provaveis: number;
  sessoes_realizadas: number;
  sessoes_provaveis: number;
  sessoes_pendentes: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_a_conferir: number;
  receita_recebida: number;
  receita_agendada: number;
}

export interface PacienteRetorno {
  paciente_id: string;
  nome: string | null;
  conversa_id: number;
  campanha_id: string | null;
  palavra_chave: string | null;
  presenca: Presenca;
  vinculo: string | null;
  /** Hora de parede (São Paulo), "AAAA-MM-DDTHH:MM". */
  primeiro_contato: string | null;
  primeira_sessao: string | null;
  proxima_sessao: string | null;
  servico: string | null;
  ja_era_paciente: boolean;
  /** Sessões finalizadas. */
  sessoes_realizadas: number;
  sessoes_provaveis: number;
  sessoes_pendentes: number;
  /** Já passaram, mas seguem "Agendado"/"Confirmado" (recepção não deu baixa). */
  sessoes_sem_baixa: number;
  faltas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_a_conferir: number;
  receita_recebida: number;
  receita_agendada: number;
}

export type Resultado =
  | 'paciente'
  | 'a_conferir'
  | 'agendada'
  | 'pediu_horario'
  | 'conversa';

export interface ConversaRetorno {
  conversa_id: number;
  campanha_id: string | null;
  palavra_chave: string | null;
  pagina: string | null;
  vinculo: string | null;
  primeira_msg: string | null;
  convenio: boolean;
  resultado: Resultado;
  paciente_id: string | null;
}

export interface DadosRetorno {
  desde: string;
  ate: string;
  plataforma: string;
  recorte: { campanha: string | null; servico: string | null };
  gerado_em: string;
  custo_ultimo_dia: string | null;
  campanhas: CampanhaRetorno[];
  pacientes: PacienteRetorno[];
  conversas: ConversaRetorno[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const nn = (v: unknown) => (v == null ? null : Number(v));

export async function carregarRetorno(
  desde: string,
  ate: string,
  f: { campanha: string; servico: string }
): Promise<DadosRetorno> {
  const { data, error } = await supabase.rpc('fn_atrib_retorno_anuncios', {
    p_desde: desde,
    p_ate: ate,
    p_campanha: f.campanha === 'todas' ? null : f.campanha,
    p_servico: f.servico === 'todos' ? null : f.servico,
  });
  if (error) throw new Error(error.message);
  const d = data as DadosRetorno;
  return {
    ...d,
    recorte: {
      campanha: d.recorte?.campanha ?? null,
      servico: d.recorte?.servico ?? null,
    },
    campanhas: (d.campanhas ?? []).map((c) => ({
      ...c,
      investimento: nn(c.investimento),
      impressoes: nn(c.impressoes),
      cliques: nn(c.cliques),
      conversas: nn(c.conversas),
      convenio: nn(c.convenio),
      agendaram: n(c.agendaram),
      pacientes: n(c.pacientes),
      pacientes_novas: n(c.pacientes_novas),
      pacientes_provaveis: n(c.pacientes_provaveis),
      novas_provaveis: n(c.novas_provaveis),
      sessoes_realizadas: n(c.sessoes_realizadas),
      sessoes_provaveis: n(c.sessoes_provaveis),
      sessoes_pendentes: n(c.sessoes_pendentes),
      sessoes_agendadas: n(c.sessoes_agendadas),
      receita_realizada: n(c.receita_realizada),
      receita_a_conferir: n(c.receita_a_conferir),
      receita_recebida: n(c.receita_recebida),
      receita_agendada: n(c.receita_agendada),
    })),
    pacientes: (d.pacientes ?? []).map((p) => ({
      ...p,
      presenca: (p.presenca ?? 'sem_sessao') as Presenca,
      sessoes_realizadas: n(p.sessoes_realizadas),
      sessoes_provaveis: n(p.sessoes_provaveis),
      sessoes_pendentes: n(p.sessoes_pendentes),
      sessoes_sem_baixa: n(p.sessoes_sem_baixa),
      faltas: n(p.faltas),
      sessoes_agendadas: n(p.sessoes_agendadas),
      receita_realizada: n(p.receita_realizada),
      receita_a_conferir: n(p.receita_a_conferir),
      receita_recebida: n(p.receita_recebida),
      receita_agendada: n(p.receita_agendada),
    })),
    conversas: d.conversas ?? [],
  };
}

/** Campanha de busca pela marca: quem procura "Respira Kids" já conhecia a clínica. */
export const ehMarca = (nome: string | null | undefined) =>
  /\bmarca\b/i.test(nome ?? '');

const razao = (a: number, b: number, motivo: string): Indicador =>
  b > 0 ? { valor: a / b } : { valor: null, motivo };

export interface Totais {
  /** null = recorte por serviço. */
  investimento: number | null;
  cliques: number | null;
  conversas: number | null;
  convenio: number | null;
  agendaram: number;
  pacientes: number;
  pacientes_novas: number;
  pacientes_provaveis: number;
  sessoes_realizadas: number;
  sessoes_provaveis: number;
  sessoes_pendentes: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_a_conferir: number;
  receita_recebida: number;
  receita_agendada: number;
  roas_realizado: Indicador;
  roas_com_agendadas: Indicador;
  roas_recebido: Indicador;
  cac: Indicador;
  custo_conversa: Indicador;
  sessoes_por_paciente: Indicador;
}

/** porServico: há filtro de serviço, então investimento/cliques/conversas vieram nulos. */
export function somar(cs: CampanhaRetorno[], porServico = false): Totais {
  const s = (k: keyof CampanhaRetorno) =>
    cs.reduce((acc, c) => acc + n(c[k]), 0);
  const sn = (k: 'investimento' | 'cliques' | 'conversas' | 'convenio') =>
    porServico ? null : s(k);
  const investimento = sn('investimento');
  const conversas = sn('conversas');
  const receita_realizada = s('receita_realizada');
  const receita_agendada = s('receita_agendada');
  const receita_recebida = s('receita_recebida');
  const pacientes = s('pacientes');
  const pacientes_novas = s('pacientes_novas');
  const sessoes_realizadas = s('sessoes_realizadas');
  const semCusto = 'Sem investimento no período.';
  const indisp: Indicador = { valor: null, motivo: SEM_DIVISAO_SERVICO };
  const porInvest = (a: number, motivo: string): Indicador =>
    investimento == null ? indisp : razao(a, investimento, motivo);
  return {
    investimento,
    cliques: sn('cliques'),
    conversas,
    convenio: sn('convenio'),
    agendaram: s('agendaram'),
    pacientes,
    pacientes_novas,
    pacientes_provaveis: s('pacientes_provaveis'),
    sessoes_realizadas,
    sessoes_provaveis: s('sessoes_provaveis'),
    sessoes_pendentes: s('sessoes_pendentes'),
    sessoes_agendadas: s('sessoes_agendadas'),
    receita_realizada,
    receita_a_conferir: s('receita_a_conferir'),
    receita_recebida,
    receita_agendada,
    roas_realizado: porInvest(receita_realizada, semCusto),
    roas_com_agendadas: porInvest(
      receita_realizada + receita_agendada,
      semCusto
    ),
    roas_recebido: porInvest(receita_recebida, semCusto),
    cac:
      investimento == null
        ? indisp
        : razao(
            investimento,
            pacientes_novas,
            'Nenhuma paciente nova com presença confirmada.'
          ),
    custo_conversa:
      investimento == null || conversas == null
        ? indisp
        : razao(investimento, conversas, 'Nenhuma conversa ainda.'),
    sessoes_por_paciente: razao(
      sessoes_realizadas,
      pacientes,
      'Nenhuma paciente com presença confirmada.'
    ),
  };
}

export const RESULTADO: Record<
  Resultado,
  { rotulo: string; variante: 'success' | 'warning' | 'attention' | 'muted' }
> = {
  paciente: { rotulo: 'Virou paciente', variante: 'success' },
  a_conferir: { rotulo: 'Presença a conferir', variante: 'attention' },
  agendada: { rotulo: 'Agendada', variante: 'warning' },
  pediu_horario: { rotulo: 'Pediu horário', variante: 'attention' },
  conversa: { rotulo: 'Só conversa', variante: 'muted' },
};

/** "AAAA-MM-DDTHH:MM" (hora de parede) → "DD/MM HH:MM", sem conversão de fuso. */
export const dataParede = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—';
