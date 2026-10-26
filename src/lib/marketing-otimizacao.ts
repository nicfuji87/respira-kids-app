// AI dev note: aba Marketing → Otimização (admin). Dados de fn_atrib_otimizacao.
// "visitas"/"whatsapp" e o funil vêm da contagem ANÔNIMA do site (todos os
// visitantes, inclusive quem recusou cookies; sem ligar a pessoas) — por isso não
// se subtrai uma da outra para "estimar conversas sem origem":
// nem todo clique no WhatsApp vira mensagem enviada.
// Base:
// custo por palavra-chave e termos de pesquisa do Google Ads (script
// scripts/google-ads/atrib-detalhe.js) cruzados com conversas, agendamentos,
// pacientes e receita do sistema, + sinal "citou convênio" das conversas
// (atrib_sinais). A regra da recomendação de convênio é a MESMA do alerta
// semanal no banco (fn_atrib_alerta_convenio) — mudou aqui, mude lá.
// Sem dado suficiente: indicador "indisponível" com motivo, nunca estimativa.

import { supabase } from '@/lib/supabase';
import type { Indicador } from '@/lib/marketing-atribuicao';

export interface PalavraBruta {
  campanha_id: string | null;
  grupo_id: string | null;
  grupo_nome: string | null;
  palavra: string | null;
  corresp: 'e' | 'p' | 'b' | null;
  impressoes: number;
  cliques: number;
  custo: number;
  conversoes_ads: number;
  conversas: number;
  agendaram: number;
  pacientes: number;
  receita_1a: number;
  receita_30d: number;
  citaram_convenio: number;
  /** Contagem anônima do site (todos os visitantes, inclusive quem recusou cookies). */
  visitas?: number;
  whatsapp?: number;
}

/** Funil por campanha: clique no anúncio → chegou ao site → clicou no WhatsApp →
 *  conversa com origem identificada (código ou horário). As contagens do site são
 *  anônimas: valem para todos, mas não dizem qual conversa veio de qual clique. */
export interface FunilCampanhaBruto {
  campanha_id: string;
  cliques_anuncio: number;
  custo: number;
  visitas: number;
  whatsapp: number;
  visitas_aceitaram: number;
  visitas_recusaram: number;
  whatsapp_recusaram: number;
  conversas: number;
  conversas_por_horario: number;
  agendaram: number;
}

export interface TermoBruto {
  termo: string;
  palavra: string | null;
  impressoes: number;
  cliques: number;
  custo: number;
  conversoes_ads: number;
  convenio: string[] | null;
}

export interface ConvenioGrupo {
  recorte: 'pago' | 'todos_novos';
  citou: boolean;
  conversas: number;
  agendaram: number;
  pacientes: number;
  receita_30d: number;
}

export interface DadosOtimizacao {
  desde: string;
  ate: string;
  gerado_em: string;
  detalhe_ads_ultimo: string | null;
  contagem_ultima?: string | null;
  palavras: PalavraBruta[];
  funil?: FunilCampanhaBruto[];
  termos: TermoBruto[];
  termos_convenio: { termos: number; cliques: number; custo: number };
  convenio: ConvenioGrupo[];
  convenio_detalhes: {
    detalhe: string;
    conversas: number;
    agendaram: number;
    pagas: number;
  }[];
}

export async function carregarOtimizacao(
  desde: string,
  ate: string
): Promise<DadosOtimizacao> {
  const { data, error } = await supabase.rpc('fn_atrib_otimizacao', {
    p_desde: desde,
    p_ate: ate,
  });
  if (error) throw new Error(error.message);
  return data as DadosOtimizacao;
}

/** Primeiro e último dia do recorte mensal do painel (AAAA-MM). */
export function periodoDosMeses(mesInicio: string, mesFim: string) {
  const [a, m] = mesFim.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return {
    desde: `${mesInicio}-01`,
    ate: `${mesFim}-${String(ultimo).padStart(2, '0')}`,
  };
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const razao = (a: number, b: number, motivo: string): Indicador =>
  b > 0 ? { valor: a / b } : { valor: null, motivo };

export const ROTULO_CORRESP: Record<string, string> = {
  e: 'exata',
  p: 'frase',
  b: 'ampla',
};

export interface LinhaFunil extends FunilCampanhaBruto {
  campanha_nome: string;
  /** chegaram ao site / cliques no anúncio */
  taxaChegada: Indicador;
  /** clicaram no WhatsApp / chegaram ao site */
  taxaWhatsapp: Indicador;
  /** conversas com origem / cliques no WhatsApp */
  taxaConversa: Indicador;
}

export function linhasFunil(
  d: DadosOtimizacao,
  nomes: Map<string, string>
): LinhaFunil[] {
  return (d.funil ?? []).map((f) => {
    const l = {
      ...f,
      cliques_anuncio: n(f.cliques_anuncio),
      custo: n(f.custo),
      visitas: n(f.visitas),
      whatsapp: n(f.whatsapp),
      visitas_aceitaram: n(f.visitas_aceitaram),
      visitas_recusaram: n(f.visitas_recusaram),
      whatsapp_recusaram: n(f.whatsapp_recusaram),
      conversas: n(f.conversas),
      conversas_por_horario: n(f.conversas_por_horario),
      agendaram: n(f.agendaram),
    };
    return {
      ...l,
      campanha_nome: nomes.get(f.campanha_id) || f.campanha_id,
      taxaChegada: razao(
        l.visitas,
        l.cliques_anuncio,
        'Sem clique no anúncio.'
      ),
      taxaWhatsapp: razao(
        l.whatsapp,
        l.visitas,
        'Ninguém chegou ao site ainda.'
      ),
      taxaConversa: razao(
        l.conversas,
        l.whatsapp,
        'Ninguém clicou no WhatsApp ainda.'
      ),
    };
  });
}

export interface LinhaPalavra extends PalavraBruta {
  campanha_nome: string;
  taxaWhatsapp: Indicador;
  ctr: Indicador;
  custoPorConversa: Indicador;
  taxaAgendamento: Indicador;
  cac: Indicador;
  roas30: Indicador;
}

export function linhasPalavra(
  d: DadosOtimizacao,
  nomes: Map<string, string>
): LinhaPalavra[] {
  return d.palavras.map((p) => {
    const custo = n(p.custo);
    const linha = {
      ...p,
      impressoes: n(p.impressoes),
      cliques: n(p.cliques),
      custo,
      conversas: n(p.conversas),
      agendaram: n(p.agendaram),
      pacientes: n(p.pacientes),
      receita_30d: n(p.receita_30d),
      citaram_convenio: n(p.citaram_convenio),
      visitas: n(p.visitas),
      whatsapp: n(p.whatsapp),
    };
    const semCusto =
      'Sem custo importado para esta palavra (script de detalhe).';
    return {
      ...linha,
      campanha_nome:
        (p.campanha_id && nomes.get(p.campanha_id)) || p.campanha_id || '—',
      taxaWhatsapp: razao(
        linha.whatsapp,
        linha.visitas,
        'Ninguém chegou ao site por esta palavra.'
      ),
      ctr: razao(linha.cliques, linha.impressoes, 'Sem impressões.'),
      custoPorConversa:
        custo > 0
          ? razao(custo, linha.conversas, 'Nenhuma conversa ainda.')
          : { valor: null, motivo: semCusto },
      taxaAgendamento: razao(
        linha.agendaram,
        linha.conversas,
        'Nenhuma conversa ainda.'
      ),
      cac:
        custo > 0
          ? razao(custo, linha.pacientes, 'Nenhum paciente novo ainda.')
          : { valor: null, motivo: semCusto },
      roas30:
        custo > 0
          ? {
              valor: linha.receita_30d / custo,
              aviso:
                'Receita dos primeiros 30 dias; coortes recentes ainda amadurecem.',
            }
          : { valor: null, motivo: semCusto },
    };
  });
}

export type Recomendacao = 'amostra_insuficiente' | 'negar' | 'manter';

export interface ResumoConvenio {
  pago: { citou: Taxa; nao: Taxa };
  novos: { citou: Taxa; nao: Taxa };
  recomendacao: Recomendacao;
  faltam: number;
  termos: { termos: number; cliques: number; custo: number };
}
interface Taxa {
  conversas: number;
  agendaram: number;
  pacientes: number;
  receita30: number;
  taxa: number | null;
}

export const AMOSTRA_CONVENIO = 10;

function taxa(g: ConvenioGrupo[], recorte: string, citou: boolean): Taxa {
  const x = g.find((c) => c.recorte === recorte && Boolean(c.citou) === citou);
  const conversas = n(x?.conversas);
  const agendaram = n(x?.agendaram);
  return {
    conversas,
    agendaram,
    pacientes: n(x?.pacientes),
    receita30: n(x?.receita_30d),
    taxa: conversas > 0 ? agendaram / conversas : null,
  };
}

/** Mesma regra do alerta semanal: ≥ 10 contatos de anúncio que citaram convênio e
 *  taxa de agendamento deles < metade da dos demais → negar operadoras. */
export function resumoConvenio(d: DadosOtimizacao): ResumoConvenio {
  const pago = {
    citou: taxa(d.convenio, 'pago', true),
    nao: taxa(d.convenio, 'pago', false),
  };
  const novos = {
    citou: taxa(d.convenio, 'todos_novos', true),
    nao: taxa(d.convenio, 'todos_novos', false),
  };
  let recomendacao: Recomendacao = 'manter';
  if (pago.citou.conversas < AMOSTRA_CONVENIO)
    recomendacao = 'amostra_insuficiente';
  else if (
    pago.nao.taxa != null &&
    (pago.citou.taxa ?? 0) < 0.5 * pago.nao.taxa
  )
    recomendacao = 'negar';
  return {
    pago,
    novos,
    recomendacao,
    faltam: Math.max(0, AMOSTRA_CONVENIO - pago.citou.conversas),
    termos: {
      termos: n(d.termos_convenio?.termos),
      cliques: n(d.termos_convenio?.cliques),
      custo: n(d.termos_convenio?.custo),
    },
  };
}

export const ROTULO_DETALHE: Record<string, string> = {
  convenio: 'Convênio/plano (genérico)',
  reembolso: 'Reembolso',
  'inas/gdf saude': 'INAS / GDF Saúde',
  'forcas armadas': 'Fusex / Fusma / Funsa',
  'tst/trt saude': 'TST / TRT Saúde',
  'saude caixa': 'Saúde Caixa',
  'postal saude': 'Postal Saúde',
};
export const rotuloDetalhe = (d: string) =>
  ROTULO_DETALHE[d] ?? d.replace(/\b\w/g, (c) => c.toUpperCase());
