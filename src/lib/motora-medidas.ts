// Programação de medidas da evolução motora: leitura da situação de cada
// medida (calculada no banco, ver supabase/migrations/motora_medidas_programacao.sql),
// lembretes da agenda e o que a evolução manda gravar na programação.
//
// Datas aqui são sempre 'YYYY-MM-DD' de parede. Nunca passar por Date +
// toISOString (desloca o dia). Ver memória "Fuso: data_hora é hora de parede".

import { supabase } from '@/lib/supabase';
import {
  NOME_MEDIDA_MOTORA,
  type EvolucaoMotoraAssimetria,
  type TipoMedidaMotora,
} from '@/types/evolucao-clinica';

export type EstadoMedida =
  | 'em_dia'
  | 'prevista'
  | 'atrasada'
  | 'sem_programacao'
  | 'suspensa'
  | 'nao_aplicavel';

export interface MedidaPaciente {
  tipo: TipoMedidaMotora;
  nome: string;
  ordem: number;
  status: 'ativa' | 'suspensa' | 'nao_aplicavel';
  intervalo_dias: number | null;
  janela_dias: number;
  proxima_data: string | null;
  programado_em: string | null;
  descricao: string | null;
  motivo: string | null;
  ultima_data: string | null;
  ultima_valores: Record<string, unknown> | null;
  ultima_fonte: 'evolucao' | 'avaliacao' | 'marcada' | null;
  estado: EstadoMedida;
  alvo: string | null;
  origem: 'intervalo' | 'reprogramada' | null;
}

export interface MedidaPrevista {
  agendamento_id: string;
  tipo: TipoMedidaMotora;
  nome: string;
  estado: 'prevista' | 'atrasada';
  alvo: string | null;
  ultima_data: string | null;
}

export interface ConfigMedida {
  tipo: TipoMedidaMotora;
  nome: string;
  ordem: number;
  intervalo_padrao_dias: number | null;
  janela_antes_dias: number;
  ativo: boolean;
}

export type AcaoProgramacao =
  | 'programar'
  | 'feita'
  | 'nao_aplicavel'
  | 'suspender'
  | 'reativar';

export interface ChamadaProgramacao {
  tipo: TipoMedidaMotora;
  acao: AcaoProgramacao;
  data?: string;
  motivo?: string;
  descricao?: string;
}

// ------------------------------------------------------------------ datas

/** 'YYYY-MM-DD' da hora de parede de um data_hora do Supabase */
export const diaDeParede = (dataHora: string | null | undefined) =>
  dataHora ? dataHora.slice(0, 10) : '';

/** 'YYYY-MM-DD' → 'dd/mm/aaaa', sem passar por Date */
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Soma dias a 'YYYY-MM-DD' em UTC (sem fuso) */
export const somarDias = (iso: string, dias: number) => {
  const [a, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86400000;
  const r = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${r.getUTCFullYear()}-${p(r.getUTCMonth() + 1)}-${p(r.getUTCDate())}`;
};

// ------------------------------------------------------------- rótulos

export const ROTULO_ESTADO_MEDIDA: Record<EstadoMedida, string> = {
  em_dia: 'Em dia',
  prevista: 'Prevista para hoje',
  atrasada: 'Atrasada',
  sem_programacao: 'Sem programação',
  suspensa: 'Acompanhamento suspenso',
  nao_aplicavel: 'Não se aplica',
};

/** Frase curta da situação, com datas (ex.: "Atrasada desde 10/10") */
export function descreverEstado(
  m: Pick<MedidaPaciente, 'estado' | 'alvo' | 'origem'>
) {
  switch (m.estado) {
    case 'prevista':
      return m.alvo
        ? `Prevista para esta sessão (alvo ${dataBR(m.alvo)})`
        : 'Prevista para esta sessão';
    case 'atrasada':
      return m.alvo ? `Atrasada desde ${dataBR(m.alvo)}` : 'Atrasada';
    case 'em_dia':
      return m.alvo
        ? `Em dia · próxima ${m.origem === 'reprogramada' ? 'programada para' : 'prevista em'} ${dataBR(m.alvo)}`
        : 'Em dia';
    default:
      return ROTULO_ESTADO_MEDIDA[m.estado];
  }
}

export const medidaPendente = (estado: EstadoMedida | undefined) =>
  estado === 'prevista' || estado === 'atrasada';

// --------------------------------------------- evolução → programação

const temNumero = (v: unknown) => typeof v === 'number';

/** Medidas que a evolução registrou com valores (fora o que foi marcado) */
export function medidasComValores(
  ev: EvolucaoMotoraAssimetria
): TipoMedidaMotora[] {
  const tipos: TipoMedidaMotora[] = [];
  const c = ev.craniometria || {};
  if (
    (temNumero(c.diagonal_a_mm) && temNumero(c.diagonal_b_mm)) ||
    (temNumero(c.comprimento_ap_mm) && temNumero(c.largura_ml_mm))
  )
    tipos.push('craniometria');
  const g = ev.goniometria || {};
  if (
    Object.entries(g).some(
      ([k, v]) =>
        /^(rotacao|inclinacao)_(ativa|passiva)_(direita|esquerda)$/.test(k) &&
        temNumero(v)
    )
  )
    tipos.push('goniometria');
  if (temNumero(c.perimetro_cefalico_cm)) tipos.push('perimetro_cefalico');
  return tipos;
}

/**
 * O que gravar na programação do paciente a partir da evolução salva.
 * Ordem: primeiro as feitas (cumprem a programação vencida), depois "não se
 * aplica" e por último as novas datas, para a próxima data não ser apagada
 * pela medida de hoje.
 */
export function chamadasDaEvolucao(
  ev: EvolucaoMotoraAssimetria,
  dataSessao: string
): ChamadaProgramacao[] {
  const feitas = new Set<TipoMedidaMotora>(medidasComValores(ev));
  const naoAplica: ChamadaProgramacao[] = [];
  const programar = new Map<TipoMedidaMotora, ChamadaProgramacao>();

  for (const [tipo, m] of Object.entries(ev.medicoes || {}) as [
    TipoMedidaMotora,
    NonNullable<EvolucaoMotoraAssimetria['medicoes']>[TipoMedidaMotora],
  ][]) {
    if (!m) continue;
    if (m.situacao === 'medido') feitas.add(tipo);
    // escolheu adiar/dispensar/não se aplica: valores esquecidos não contam
    else feitas.delete(tipo);
    if (m.situacao === 'adiado' && m.nova_data)
      programar.set(tipo, {
        tipo,
        acao: 'programar',
        data: m.nova_data,
        motivo: m.motivo,
      });
    if (m.situacao === 'dispensado' && m.nova_data)
      programar.set(tipo, {
        tipo,
        acao: 'programar',
        data: m.nova_data,
        motivo: m.motivo,
      });
    if (m.situacao === 'nao_aplicavel')
      naoAplica.push({ tipo, acao: 'nao_aplicavel', motivo: m.motivo });
  }

  // Próxima reavaliação escolhida na conduta prevalece sobre a nova data do adiamento
  for (const [tipo, p] of Object.entries(ev.proximas_reavaliacoes || {}) as [
    TipoMedidaMotora,
    NonNullable<
      EvolucaoMotoraAssimetria['proximas_reavaliacoes']
    >[TipoMedidaMotora],
  ][]) {
    if (!p?.data) continue;
    programar.set(tipo, {
      tipo,
      acao: 'programar',
      data: p.data,
      descricao: p.descricao,
    });
  }

  // "Não se aplica" e nova data na mesma medida: vale o "não se aplica"
  for (const n of naoAplica) programar.delete(n.tipo);

  return [
    ...[...feitas].map((tipo) => ({
      tipo,
      acao: 'feita' as const,
      data: dataSessao,
    })),
    ...naoAplica,
    ...programar.values(),
  ];
}

/** Linhas do texto da evolução sobre medidas e próximas reavaliações */
export function linhasMedidasDoResumo(ev: EvolucaoMotoraAssimetria): string[] {
  const linhas: string[] = [];
  const temValores = new Set(medidasComValores(ev));
  for (const [tipo, m] of Object.entries(ev.medicoes || {}) as [
    TipoMedidaMotora,
    NonNullable<EvolucaoMotoraAssimetria['medicoes']>[TipoMedidaMotora],
  ][]) {
    if (!m) continue;
    const nome = NOME_MEDIDA_MOTORA[tipo];
    const motivo = m.motivo ? ` (${m.motivo})` : '';
    if (m.situacao === 'medido' && !temValores.has(tipo))
      linhas.push(`${nome}: realizada nesta sessão`);
    if (m.situacao === 'adiado')
      linhas.push(
        `${nome}: prevista, adiada${m.nova_data ? ` para ${dataBR(m.nova_data)}` : ''}${motivo}`
      );
    if (m.situacao === 'dispensado')
      linhas.push(
        `${nome}: dispensada nesta ocasião${motivo}${m.nova_data ? `; reprogramada para ${dataBR(m.nova_data)}` : ''}`
      );
    if (m.situacao === 'nao_aplicavel')
      linhas.push(`${nome}: não se aplica a este caso${motivo}`);
  }
  for (const [tipo, p] of Object.entries(ev.proximas_reavaliacoes || {}) as [
    TipoMedidaMotora,
    NonNullable<
      EvolucaoMotoraAssimetria['proximas_reavaliacoes']
    >[TipoMedidaMotora],
  ][]) {
    if (!p?.data) continue;
    const nome =
      tipo === 'outra' && p.descricao ? p.descricao : NOME_MEDIDA_MOTORA[tipo];
    linhas.push(`Próxima reavaliação: ${nome} em ${dataBR(p.data)}`);
  }
  return linhas;
}

// ------------------------------------------------------------------- API

export async function fetchMedidasPaciente(
  pacienteId: string,
  dataSessao: string,
  excluirAgendamentoId?: string
): Promise<MedidaPaciente[]> {
  const { data, error } = await supabase.rpc('fn_motora_medidas_paciente', {
    p_paciente_id: pacienteId,
    p_data: dataSessao,
    p_excluir_agendamento: excluirAgendamentoId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as MedidaPaciente[];
}

export async function fetchMedidasPrevistas(
  agendamentoIds: string[]
): Promise<MedidaPrevista[]> {
  if (agendamentoIds.length === 0) return [];
  const { data, error } = await supabase.rpc('fn_motora_medidas_previstas', {
    p_agendamento_ids: agendamentoIds,
  });
  if (error) throw error;
  return (data ?? []) as MedidaPrevista[];
}

export async function programarMedida(
  pacienteId: string,
  c: ChamadaProgramacao
): Promise<void> {
  const { error } = await supabase.rpc('fn_motora_programar_medida', {
    p_paciente_id: pacienteId,
    p_tipo: c.tipo,
    p_acao: c.acao,
    p_data: c.data ?? null,
    p_descricao: c.descricao ?? null,
    p_motivo: c.motivo ?? null,
  });
  if (error) throw error;
}

/** Aplica, em ordem, o que a evolução mandou gravar. Devolve as que falharam. */
export async function aplicarProgramacaoDaEvolucao(
  pacienteId: string,
  ev: EvolucaoMotoraAssimetria,
  dataSessao: string
): Promise<ChamadaProgramacao[]> {
  const falhas: ChamadaProgramacao[] = [];
  for (const c of chamadasDaEvolucao(ev, dataSessao)) {
    try {
      await programarMedida(pacienteId, c);
    } catch (e) {
      console.error('Falha ao programar medida', c, e);
      falhas.push(c);
    }
  }
  return falhas;
}

export async function fetchConfigMedidas(): Promise<ConfigMedida[]> {
  const { data, error } = await supabase
    .from('motora_medida_config')
    .select(
      'tipo, nome, ordem, intervalo_padrao_dias, janela_antes_dias, ativo'
    )
    .order('ordem');
  if (error) throw error;
  return (data ?? []) as ConfigMedida[];
}

export async function salvarConfigMedida(c: ConfigMedida): Promise<void> {
  const { error } = await supabase.rpc('fn_motora_salvar_config_medida', {
    p_tipo: c.tipo,
    p_intervalo_padrao_dias: c.intervalo_padrao_dias,
    p_janela_antes_dias: c.janela_antes_dias,
    p_ativo: c.ativo,
  });
  if (error) throw error;
}
