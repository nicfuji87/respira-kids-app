// AI dev note: API da Rotina da recepção (página /rotina). Tudo é decidido no banco
// (migration rotina_recepcao.sql):
//   fn_rotina_dia            tarefas de hoje (diárias, a da semana, as do mês em vigor
//                            e as atrasadas), com indicadores ao vivo e as metas da secretária
//                            com a cota de hoje
//   fn_rotina_marcar         marca/desmarca uma ocorrência (tarefas "auto" o banco recusa)
//   fn_rotina_historico      acompanhamento do admin (por dia e por tarefa)
//   fn_rotina_tarefas_listar / fn_rotina_tarefa_salvar   cadastro (salvar só admin)
// Tarefas "auto" são marcadas pelo cron rotina-auto (de 15 em 15 min) quando o número
// fica certo: sessões sem status zeradas, cota de contatos e de convites batida.

import { supabase } from './supabase';

export type BlocoRotina =
  | 'abertura'
  | 'manha'
  | 'almoco'
  | 'tarde'
  | 'fechamento';

export type FrequenciaRotina = 'diaria' | 'semanal' | 'mensal';

export const BLOCOS: Array<{
  valor: BlocoRotina;
  titulo: string;
  faixa: string;
}> = [
  { valor: 'abertura', titulo: 'Abertura', faixa: 'antes das 8h' },
  { valor: 'manha', titulo: 'Manhã', faixa: '8h às 12h' },
  { valor: 'almoco', titulo: 'Almoço', faixa: '12h' },
  { valor: 'tarde', titulo: 'Tarde', faixa: '13h às 17h30' },
  { valor: 'fechamento', titulo: 'Fechamento', faixa: '17h30 às 18h' },
];

export const DIAS_SEMANA = [
  '',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
];

export interface IndicadorValor {
  valor: number | null;
  cota?: number;
  ok: boolean | null;
  texto: string;
}

export interface TarefaDoDia {
  id: string;
  titulo: string;
  detalhe: string | null;
  bloco: BlocoRotina;
  frequencia: FrequenciaRotina;
  horario: string | null;
  link: string | null;
  indicador: string | null;
  auto: boolean;
  data_ref: string;
  prazo: string;
  atrasada: boolean;
  feito: boolean;
  feito_em: string | null;
  feito_por: string | null;
  observacao: string | null;
  indicador_valor: IndicadorValor | null;
}

export interface MetaDoDia {
  id: string;
  codigo:
    | 'contatos_inatividade'
    | 'pacientes_reativados'
    | 'pesquisa_convites'
    | 'pesquisa_respostas';
  titulo: string;
  unidade: string;
  valor_meta: number;
  valor_atual: number;
  hoje: number | null;
  cota_hoje: number | null;
  dias_uteis_restantes: number;
  esperado_ate_hoje: number;
  no_ritmo: boolean;
  niveis: Array<{ valor: number; bonus: number }> | null;
  nivel_atingido: number | null;
  bonus_nivel: number | null;
  requisito_titulo: string | null;
  requisito_ok: boolean | null;
  periodo_fim: string;
  quando: string | null;
}

export interface RotinaDia {
  dia: string;
  dia_util: boolean;
  agora: string;
  eh_admin: boolean;
  secretaria: { id: string; nome: string } | null;
  tarefas: TarefaDoDia[];
  metas: MetaDoDia[];
}

export interface RotinaHistorico {
  inicio: string;
  fim: string;
  dias: Array<{
    dia: string;
    total: number;
    no_prazo: number;
    atrasadas: number;
    nao_feitas: number;
    pendentes: number;
  }>;
  tarefas: Array<{
    id: string;
    titulo: string;
    bloco: BlocoRotina;
    frequencia: FrequenciaRotina;
    total: number;
    nao_feitas: number;
    atrasadas: number;
  }>;
}

export interface TarefaCadastro {
  id?: string;
  titulo: string;
  detalhe: string | null;
  bloco: BlocoRotina;
  frequencia: FrequenciaRotina;
  dia_semana: number | null;
  dia_mes: number | null;
  dia_mes_prazo: number | null;
  horario: string | null;
  indicador?: string | null;
  auto?: boolean;
  link: string | null;
  ordem?: number;
  ativo: boolean;
}

export async function fetchRotinaDia(): Promise<RotinaDia> {
  const { data, error } = await supabase.rpc('fn_rotina_dia');
  if (error) throw new Error(error.message);
  return data as RotinaDia;
}

export async function marcarTarefa(
  tarefaId: string,
  dataRef: string,
  feito: boolean,
  observacao?: string
): Promise<void> {
  const { error } = await supabase.rpc('fn_rotina_marcar', {
    p_tarefa: tarefaId,
    p_data_ref: dataRef,
    p_feito: feito,
    p_observacao: observacao ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchRotinaHistorico(
  inicio: string,
  fim: string
): Promise<RotinaHistorico> {
  const { data, error } = await supabase.rpc('fn_rotina_historico', {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw new Error(error.message);
  return data as RotinaHistorico;
}

export async function fetchTarefasCadastro(): Promise<TarefaCadastro[]> {
  const { data, error } = await supabase.rpc('fn_rotina_tarefas_listar');
  if (error) throw new Error(error.message);
  return (data ?? []) as TarefaCadastro[];
}

export async function salvarTarefa(t: TarefaCadastro): Promise<string> {
  const { data, error } = await supabase.rpc('fn_rotina_tarefa_salvar', {
    p: t,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// Quando a tarefa acontece, em palavras ("Toda segunda", "Dia 1, prazo dia 2"...).
export function descreverQuando(t: {
  frequencia: FrequenciaRotina;
  dia_semana: number | null;
  dia_mes: number | null;
  dia_mes_prazo: number | null;
}): string {
  if (t.frequencia === 'diaria') return 'Todo dia útil';
  if (t.frequencia === 'semanal')
    return `Toda ${DIAS_SEMANA[t.dia_semana ?? 0]?.toLowerCase() ?? ''}`;
  if (t.dia_mes === 0) return 'Último dia útil do mês';
  if (t.dia_mes_prazo && t.dia_mes_prazo !== t.dia_mes)
    return `Dia ${t.dia_mes}, prazo dia ${t.dia_mes_prazo}`;
  return `Dia ${t.dia_mes}`;
}

// 'YYYY-MM-DD' → 'seg, 09/11' sem passar por fuso (data pura).
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()];
  return `${sem}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
