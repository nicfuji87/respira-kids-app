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
  suspensa: 'Não é mais lembrada',
  nao_aplicavel: 'Não precisa mais',
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

/** Medidas que não têm seção própria na evolução: o resultado vai no bloco */
export const MEDIDAS_SEM_SECAO: TipoMedidaMotora[] = [
  'mfs',
  'perimetro_cefalico',
  'desenvolvimento_motor',
  'outra',
];

export const INSTRUMENTOS_DESENVOLVIMENTO: { valor: string; label: string }[] =
  [
    { valor: 'aims', label: 'AIMS' },
    { valor: 'marcos', label: 'Checklist de marcos motores' },
    { valor: 'observacao', label: 'Observação funcional estruturada' },
    { valor: 'outro', label: 'Outro instrumento' },
  ];

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Se o resultado registrado no bloco basta para considerar a medida feita.
 * Medidas com seção própria (craniometria, goniometria) contam pelos campos
 * da seção; aqui só as que não têm seção.
 */
export function resultadoCompleto(
  tipo: TipoMedidaMotora,
  valores: Record<string, unknown> | undefined
): boolean {
  const v = valores || {};
  switch (tipo) {
    case 'mfs':
      return temNumero(v.mfs_direito) && temNumero(v.mfs_esquerdo);
    case 'perimetro_cefalico':
      return temNumero(v.perimetro_cefalico_cm);
    case 'desenvolvimento_motor':
      // AIMS só conta com o percentil; "outro" exige o nome do instrumento
      if (!texto(v.instrumento)) return false;
      if (v.instrumento === 'aims') return temNumero(v.percentil);
      if (v.instrumento === 'outro') return !!texto(v.instrumento_outro);
      return true;
    case 'outra':
      return !!texto(v.descricao);
    default:
      return true;
  }
}

export interface PendenciaMedicao {
  tipo: TipoMedidaMotora;
  problema: string;
}

/**
 * O que impede salvar: só "Medi hoje" sem o resultado. Sem isso a medida
 * seria dada como feita sem registro.
 */
export function pendenciasDasMedicoes(
  ev: EvolucaoMotoraAssimetria
): PendenciaMedicao[] {
  const pend: PendenciaMedicao[] = [];
  const comValores = new Set(medidasComValores(ev));
  for (const [tipo, m] of Object.entries(ev.medicoes || {}) as [
    TipoMedidaMotora,
    NonNullable<EvolucaoMotoraAssimetria['medicoes']>[TipoMedidaMotora],
  ][]) {
    if (m?.situacao !== 'medido') continue;
    const ok = MEDIDAS_SEM_SECAO.includes(tipo)
      ? resultadoCompleto(tipo, m.valores) || comValores.has(tipo)
      : comValores.has(tipo);
    if (ok) continue;
    const nome = NOME_MEDIDA_MOTORA[tipo];
    const inst = m.valores?.instrumento;
    pend.push({
      tipo,
      problema:
        tipo === 'desenvolvimento_motor'
          ? inst === 'aims'
            ? `${nome}: informe o percentil da AIMS`
            : inst === 'outro'
              ? `${nome}: informe qual instrumento foi usado`
              : `${nome}: escolha o instrumento usado`
          : tipo === 'mfs'
            ? `${nome}: marque os dois lados (0 a 5)`
            : `${nome}: preencha o resultado ou desmarque "Medi hoje"`,
    });
  }
  return pend;
}

/**
 * O que gravar na programação do paciente a partir da evolução salva.
 * Ordem: primeiro as feitas (cumprem a data que vencia), depois "não precisa
 * mais" e por último as próximas medições, para a próxima data não ser
 * apagada pela medida de hoje. "Não medi hoje" não grava nada: a medida
 * continua devida e o lembrete volta na sessão seguinte.
 */
export function chamadasDaEvolucao(
  ev: EvolucaoMotoraAssimetria,
  dataSessao: string
): ChamadaProgramacao[] {
  const feitas = new Set<TipoMedidaMotora>(medidasComValores(ev));
  const encerrar: ChamadaProgramacao[] = [];
  const programar = new Map<TipoMedidaMotora, ChamadaProgramacao>();

  for (const [tipo, m] of Object.entries(ev.medicoes || {}) as [
    TipoMedidaMotora,
    NonNullable<EvolucaoMotoraAssimetria['medicoes']>[TipoMedidaMotora],
  ][]) {
    if (!m) continue;
    if (m.situacao === 'medido') {
      // com seção própria: conta pelos campos da seção (medidasComValores);
      // sem seção: só com o resultado registrado no bloco
      if (
        MEDIDAS_SEM_SECAO.includes(tipo) &&
        resultadoCompleto(tipo, m.valores)
      )
        feitas.add(tipo);
    } else {
      // escolheu não medir: valores esquecidos na seção não contam
      feitas.delete(tipo);
    }
    if (m.situacao === 'nao_precisa')
      encerrar.push({ tipo, acao: 'nao_aplicavel', motivo: m.motivo });
  }

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

  // "Não precisa mais" e próxima medição na mesma medida: vale o encerramento
  for (const n of encerrar) programar.delete(n.tipo);

  return [
    ...[...feitas].map((tipo) => ({
      tipo,
      acao: 'feita' as const,
      data: dataSessao,
    })),
    ...encerrar,
    ...programar.values(),
  ];
}

const fmtNum = (n: number, casas = 0) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/** Resultado do bloco em texto (MFS D/E, perímetro, instrumento…) */
export function resultadoEmTexto(
  tipo: TipoMedidaMotora,
  valores: Record<string, unknown> | undefined
): string {
  const v = valores || {};
  switch (tipo) {
    case 'mfs':
      return `D ${v.mfs_direito} / E ${v.mfs_esquerdo}`;
    case 'perimetro_cefalico':
      return temNumero(v.perimetro_cefalico_cm)
        ? `${fmtNum(v.perimetro_cefalico_cm as number, 1)} cm`
        : '';
    case 'desenvolvimento_motor': {
      const inst =
        v.instrumento === 'outro'
          ? texto(v.instrumento_outro)
          : (INSTRUMENTOS_DESENVOLVIMENTO.find((i) => i.valor === v.instrumento)
              ?.label ?? '');
      const partes = [inst];
      if (temNumero(v.percentil)) partes.push(`percentil ${v.percentil}`);
      if (texto(v.resultado)) partes.push(texto(v.resultado));
      return partes.filter(Boolean).join(', ');
    }
    case 'outra':
      return [texto(v.descricao), texto(v.resultado)]
        .filter(Boolean)
        .join(': ');
    default:
      return '';
  }
}

/** Linhas do texto da evolução sobre medidas e próximas medições */
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
    if (m.situacao === 'medido' && !temValores.has(tipo)) {
      const r =
        MEDIDAS_SEM_SECAO.includes(tipo) && resultadoCompleto(tipo, m.valores)
          ? resultadoEmTexto(tipo, m.valores)
          : '';
      if (r) linhas.push(`${nome}: ${r}`);
    }
    if (m.situacao === 'nao_medido')
      linhas.push(`${nome}: prevista, não medida nesta sessão${motivo}`);
    if (m.situacao === 'nao_precisa')
      linhas.push(`${nome}: não precisa mais ser acompanhada${motivo}`);
  }
  for (const [tipo, p] of Object.entries(ev.proximas_reavaliacoes || {}) as [
    TipoMedidaMotora,
    NonNullable<
      EvolucaoMotoraAssimetria['proximas_reavaliacoes']
    >[TipoMedidaMotora],
  ][]) {
    if (!p?.data) continue;
    // encerrada nesta evolução: a data não é gravada (chamadasDaEvolucao)
    if (ev.medicoes?.[tipo]?.situacao === 'nao_precisa') continue;
    const nome =
      tipo === 'outra' && p.descricao ? p.descricao : NOME_MEDIDA_MOTORA[tipo];
    linhas.push(`Próxima medição: ${nome} em ${dataBR(p.data)}`);
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
