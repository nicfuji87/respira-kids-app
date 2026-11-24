// AI dev note: aba Marketing → Retorno dos anúncios (admin). Dados de
// fn_atrib_retorno_anuncios (supabase/migrations/atribuicao_v2_retorno_anuncios.sql).
// Responde "quem veio do anúncio, quantas sessões fez e quanto rendeu":
// - receita REALIZADA: sessões que já aconteceram, pelo valor da agenda, mesmo sem
//   baixa "Finalizado" (a cobrança é mensal, então o pagamento chega depois);
// - receita RECEBIDA: o que as faturas pagas cobriram;
// - receita AGENDADA: sessões futuras, fora do ROAS realizado.
// Valores BRUTOS: sem comissão, imposto nem taxa (a margem ainda não existe no sistema).
// Sem dado suficiente o indicador fica indisponível com o motivo, nunca estimado.

import { supabase } from '@/lib/supabase';
import type { Indicador } from '@/lib/marketing-atribuicao';

export interface CampanhaRetorno {
  campanha_id: string;
  nome: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  conversas: number;
  convenio: number;
  agendaram: number;
  pacientes: number;
  pacientes_novas: number;
  sessoes_realizadas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_recebida: number;
  receita_agendada: number;
}

export interface PacienteRetorno {
  paciente_id: string;
  nome: string | null;
  conversa_id: number;
  campanha_id: string | null;
  palavra_chave: string | null;
  /** Hora de parede (São Paulo), "AAAA-MM-DDTHH:MM". */
  primeiro_contato: string | null;
  primeira_sessao: string | null;
  proxima_sessao: string | null;
  servico: string | null;
  ja_era_paciente: boolean;
  sessoes_realizadas: number;
  /** Já passaram, mas seguem "Agendado"/"Confirmado" (recepção não deu baixa). */
  sessoes_sem_baixa: number;
  faltas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_recebida: number;
  receita_agendada: number;
}

export type Resultado = 'paciente' | 'agendada' | 'pediu_horario' | 'conversa';

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
  gerado_em: string;
  custo_ultimo_dia: string | null;
  campanhas: CampanhaRetorno[];
  pacientes: PacienteRetorno[];
  conversas: ConversaRetorno[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function carregarRetorno(
  desde: string,
  ate: string
): Promise<DadosRetorno> {
  const { data, error } = await supabase.rpc('fn_atrib_retorno_anuncios', {
    p_desde: desde,
    p_ate: ate,
  });
  if (error) throw new Error(error.message);
  const d = data as DadosRetorno;
  return {
    ...d,
    campanhas: (d.campanhas ?? []).map((c) => ({
      ...c,
      investimento: n(c.investimento),
      impressoes: n(c.impressoes),
      cliques: n(c.cliques),
      conversas: n(c.conversas),
      convenio: n(c.convenio),
      agendaram: n(c.agendaram),
      pacientes: n(c.pacientes),
      pacientes_novas: n(c.pacientes_novas),
      sessoes_realizadas: n(c.sessoes_realizadas),
      sessoes_agendadas: n(c.sessoes_agendadas),
      receita_realizada: n(c.receita_realizada),
      receita_recebida: n(c.receita_recebida),
      receita_agendada: n(c.receita_agendada),
    })),
    pacientes: (d.pacientes ?? []).map((p) => ({
      ...p,
      sessoes_realizadas: n(p.sessoes_realizadas),
      sessoes_sem_baixa: n(p.sessoes_sem_baixa),
      faltas: n(p.faltas),
      sessoes_agendadas: n(p.sessoes_agendadas),
      receita_realizada: n(p.receita_realizada),
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
  investimento: number;
  cliques: number;
  conversas: number;
  convenio: number;
  agendaram: number;
  pacientes: number;
  pacientes_novas: number;
  sessoes_realizadas: number;
  sessoes_agendadas: number;
  receita_realizada: number;
  receita_recebida: number;
  receita_agendada: number;
  roas_realizado: Indicador;
  roas_com_agendadas: Indicador;
  roas_recebido: Indicador;
  cac: Indicador;
  custo_conversa: Indicador;
  sessoes_por_paciente: Indicador;
}

export function somar(cs: CampanhaRetorno[]): Totais {
  const s = (k: keyof CampanhaRetorno) =>
    cs.reduce((acc, c) => acc + n(c[k]), 0);
  const investimento = s('investimento');
  const receita_realizada = s('receita_realizada');
  const receita_agendada = s('receita_agendada');
  const receita_recebida = s('receita_recebida');
  const pacientes = s('pacientes');
  const pacientes_novas = s('pacientes_novas');
  const conversas = s('conversas');
  const sessoes_realizadas = s('sessoes_realizadas');
  const semCusto = 'Sem investimento no período.';
  return {
    investimento,
    cliques: s('cliques'),
    conversas,
    convenio: s('convenio'),
    agendaram: s('agendaram'),
    pacientes,
    pacientes_novas,
    sessoes_realizadas,
    sessoes_agendadas: s('sessoes_agendadas'),
    receita_realizada,
    receita_recebida,
    receita_agendada,
    roas_realizado: razao(receita_realizada, investimento, semCusto),
    roas_com_agendadas: razao(
      receita_realizada + receita_agendada,
      investimento,
      semCusto
    ),
    roas_recebido: razao(receita_recebida, investimento, semCusto),
    cac: razao(investimento, pacientes_novas, 'Nenhuma paciente nova ainda.'),
    custo_conversa: razao(investimento, conversas, 'Nenhuma conversa ainda.'),
    sessoes_por_paciente: razao(
      sessoes_realizadas,
      pacientes,
      'Nenhuma paciente ainda.'
    ),
  };
}

export const RESULTADO: Record<
  Resultado,
  { rotulo: string; variante: 'success' | 'warning' | 'attention' | 'muted' }
> = {
  paciente: { rotulo: 'Virou paciente', variante: 'success' },
  agendada: { rotulo: 'Agendada', variante: 'warning' },
  pediu_horario: { rotulo: 'Pediu horário', variante: 'attention' },
  conversa: { rotulo: 'Só conversa', variante: 'muted' },
};

/** "AAAA-MM-DDTHH:MM" (hora de parede) → "DD/MM HH:MM", sem conversão de fuso. */
export const dataParede = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—';
