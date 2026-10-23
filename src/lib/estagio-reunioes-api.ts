// AI dev note: Dados ao vivo das reuniões com as estagiárias. A regra do bônus
// (R$100/mês, -R$5 por sessão sem evolução no prazo, domiciliar liberado;
// prazo = 24h, mas sábado e domingo vencem no fim da segunda) mora no
// servidor: fn_estagio_bonus_evolucoes (migrations estagio_bonus_evolucoes.sql
// e estagio_bonus_prazo_fim_de_semana.sql). O front só exibe.

import { supabase } from './supabase';

export type GrupoServico = 'respiratoria' | 'motora' | 'avaliacao' | 'outros';

export interface BonusPorGrupo {
  grupo: GrupoServico;
  contadas: number;
  no_prazo: number;
  perdidas: number;
  com_evolucao: number;
}

export interface BonusPorTurno {
  turno: 'manha' | 'tarde';
  contadas: number;
  perdidas: number;
}

export interface SessaoEmRisco {
  id: string;
  inicio: string; // hora de parede, sem fuso
  prazo: string; // hora de parede, sem fuso
  grupo: GrupoServico;
  fim_de_semana?: boolean; // sábado/domingo: prazo até o fim da segunda
  paciente: string;
  profissional: string;
}

export interface BonusEvolucoes {
  mes: string; // YYYY-MM
  inicio: string;
  fim: string;
  atualizado_em: string;
  bonus_base: number;
  desconto_por_perdida: number;
  contadas: number;
  no_prazo: number;
  perdidas: number;
  feitas_atrasadas: number;
  sem_evolucao: number;
  em_risco: number;
  adiantadas: number;
  bonus: number;
  domiciliares_liberadas: number;
  por_grupo: BonusPorGrupo[];
  por_turno: BonusPorTurno[];
  em_risco_lista: SessaoEmRisco[];
}

export const GRUPO_LABEL: Record<GrupoServico, string> = {
  respiratoria: 'Respiratória',
  motora: 'Motora',
  avaliacao: 'Avaliação',
  outros: 'Outros',
};

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2026-11" -> "novembro de 2026". */
export function nomeMes(yyyymm: string): string {
  const [ano, mes] = yyyymm.split('-').map(Number);
  return `${MESES[(mes || 1) - 1]} de ${ano}`;
}

/** Reais sem centavos: "R$ 100". */
export function brl(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/** mes no formato YYYY-MM; sem mes = mês corrente (hora de Brasília). */
export async function fetchBonusEvolucoes(
  mes?: string
): Promise<BonusEvolucoes> {
  const { data, error } = await supabase.rpc('fn_estagio_bonus_evolucoes', {
    p_mes: mes ? `${mes}-01` : null,
  });
  if (error) throw error;
  return data as BonusEvolucoes;
}

/**
 * Lê um timestamp de parede ("2026-10-22T14:00:00") sem converter fuso.
 * Nunca usar new Date(str) aqui: o navegador trataria como hora local e,
 * em outro fuso, o horário sairia errado (ver agenda-fuso-wall-clock).
 */
export function partesParede(iso: string): {
  dia: string;
  hora: string;
} {
  const [data, resto = ''] = iso.split('T');
  const [, mes, dia] = data.split('-');
  return { dia: `${dia}/${mes}`, hora: resto.slice(0, 5) };
}
