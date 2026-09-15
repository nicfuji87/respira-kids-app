// AI dev note: Filtros e totais da aba Vendas de Produtos (histórico da loja). Puro,
// sem Supabase: a aba carrega o histórico inteiro uma vez (fetchHistoricoVendas) e
// estas funções recortam em memória. Datas de filtro são YYYY-MM-DD no fuso da
// clínica e comparam direto como texto.

import { normalizeText } from '@/lib/utils';
import type {
  CategoriaVenda,
  VendaHistorico,
  VendaHistoricoItem,
} from '@/types/produtos';

const FORMATO_DATA_CLINICA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// YYYY-MM-DD no fuso da clínica. produto_vendas.created_at é timestamptz de
// verdade, então converter pelo fuso é o certo aqui — diferente de
// agendamentos.data_hora, que é hora de parede e não pode passar por esta função.
export function dataNoFusoDaClinica(valor: string | number | Date): string {
  const partes = FORMATO_DATA_CLINICA.formatToParts(new Date(valor));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

export type FiltroStatusVenda = 'todas' | 'pagas' | 'em_aberto' | 'canceladas';

export interface FiltrosVendas {
  busca: string;
  status: FiltroStatusVenda;
  de: string; // '' = sem limite (desde a primeira venda)
  ate: string; // '' = sem limite
  categoria: CategoriaVenda | null;
  produtoId: string | null;
}

export const FILTROS_VENDAS_VAZIOS: FiltrosVendas = {
  busca: '',
  status: 'todas',
  de: '',
  ate: '',
  categoria: null,
  produtoId: null,
};

export function temFiltroDeItem(f: FiltrosVendas): boolean {
  return f.categoria !== null || f.produtoId !== null;
}

export function itemCasaComFiltro(
  item: VendaHistoricoItem,
  f: FiltrosVendas
): boolean {
  return (
    (f.categoria === null || item.categoria === f.categoria) &&
    (f.produtoId === null || item.produto_id === f.produtoId)
  );
}

function casaStatus(venda: VendaHistorico, status: FiltroStatusVenda): boolean {
  switch (status) {
    case 'pagas':
      return venda.status === 'pago';
    case 'em_aberto':
      // rascunho = a cobrança nem chegou a ser gerada; para quem consulta, está em aberto
      return (
        venda.status === 'aguardando_pagamento' || venda.status === 'rascunho'
      );
    case 'canceladas':
      return venda.status === 'cancelado';
    default:
      return true;
  }
}

// Busca com as mesmas regras de Cobranças/Pacientes: ignora acento e maiúscula, e
// várias palavras precisam casar DENTRO do mesmo campo — "maria couto" acha
// "Mariana Graça Couto", mas não junta o nome do paciente com o do responsável.
export function filtrarVendas(
  vendas: VendaHistorico[],
  f: FiltrosVendas
): VendaHistorico[] {
  const palavras = normalizeText(f.busca).split(/\s+/).filter(Boolean);
  const casaTodasAsPalavras = (valor: string | null | undefined) => {
    const alvo = normalizeText(valor ?? '');
    return alvo !== '' && palavras.every((p) => alvo.includes(p));
  };
  const filtraItens = temFiltroDeItem(f);

  return vendas.filter((v) => {
    if (!casaStatus(v, f.status)) return false;
    if (f.de && v.data_venda < f.de) return false;
    if (f.ate && v.data_venda > f.ate) return false;
    if (filtraItens && !v.itens.some((i) => itemCasaComFiltro(i, f))) {
      return false;
    }
    if (palavras.length === 0) return true;
    return (
      casaTodasAsPalavras(v.paciente?.nome) ||
      casaTodasAsPalavras(v.responsavel?.nome) ||
      v.itens.some((i) => casaTodasAsPalavras(i.nome))
    );
  });
}

export interface ResumoVendas {
  vendasPagas: number;
  recebido: number;
  unidadesVendidas: number;
  vendasEmAberto: number;
  emAberto: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

// Com categoria ou produto escolhido, a venda não entra inteira no total: conta a
// fatia dos itens filtrados, proporcional ao subtotal. Assim uma venda de espaçador
// + brinquedo não infla "Brinquedo", e um desconto da venda se divide entre os itens.
function valorConsiderado(
  venda: VendaHistorico,
  base: number,
  f: FiltrosVendas
): number {
  if (!temFiltroDeItem(f)) return base;
  const bruto = venda.itens.reduce((acc, i) => acc + i.subtotal, 0);
  if (bruto <= 0) return 0;
  const filtrado = venda.itens
    .filter((i) => itemCasaComFiltro(i, f))
    .reduce((acc, i) => acc + i.subtotal, 0);
  return (base * filtrado) / bruto;
}

export function resumirVendas(
  vendas: VendaHistorico[],
  f: FiltrosVendas
): ResumoVendas {
  let vendasPagas = 0;
  let recebido = 0;
  let unidadesVendidas = 0;
  let vendasEmAberto = 0;
  let emAberto = 0;

  for (const v of vendas) {
    if (v.status === 'pago') {
      vendasPagas += 1;
      // pago_valor é o que o banco informou; sem ele, vale o total da venda
      recebido += valorConsiderado(v, v.pago_valor ?? v.valor_total, f);
      unidadesVendidas += v.itens
        .filter((i) => itemCasaComFiltro(i, f))
        .reduce((acc, i) => acc + i.quantidade, 0);
    } else if (v.status === 'aguardando_pagamento' || v.status === 'rascunho') {
      vendasEmAberto += 1;
      emAberto += valorConsiderado(v, v.valor_total, f);
    }
  }

  return {
    vendasPagas,
    recebido: centavos(recebido),
    unidadesVendidas,
    vendasEmAberto,
    emAberto: centavos(emAberto),
  };
}

export type PeriodoRapido = 'inicio' | 'este_mes' | 'mes_passado' | 'este_ano';

export const PERIODOS_RAPIDOS: { value: PeriodoRapido; label: string }[] = [
  { value: 'inicio', label: 'Desde o início' },
  { value: 'este_mes', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'este_ano', label: 'Este ano' },
];

// hoje: YYYY-MM-DD no fuso da clínica. Os períodos que chegam até hoje ficam com
// `ate` vazio: não existe venda no futuro, e assim a venda de hoje nunca fica de fora.
export function intervaloDoPeriodo(
  periodo: PeriodoRapido,
  hoje: string
): { de: string; ate: string } {
  const [ano, mes] = hoje.split('-').map(Number);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');

  switch (periodo) {
    case 'este_mes':
      return { de: `${ano}-${doisDigitos(mes)}-01`, ate: '' };
    case 'mes_passado': {
      const anoAnterior = mes === 1 ? ano - 1 : ano;
      const mesAnterior = mes === 1 ? 12 : mes - 1;
      // dia 0 do mês seguinte = último dia do mês anterior
      const ultimoDia = new Date(
        Date.UTC(anoAnterior, mesAnterior, 0)
      ).getUTCDate();
      return {
        de: `${anoAnterior}-${doisDigitos(mesAnterior)}-01`,
        ate: `${anoAnterior}-${doisDigitos(mesAnterior)}-${doisDigitos(ultimoDia)}`,
      };
    }
    case 'este_ano':
      return { de: `${ano}-01-01`, ate: '' };
    default:
      return { de: '', ate: '' };
  }
}
