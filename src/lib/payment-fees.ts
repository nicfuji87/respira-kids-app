// AI dev note: Cálculo de repasse de taxas (gross-up) do pagamento via cartão.
// Dado o valor BASE (líquido que a clínica quer receber), calcula o valor BRUTO
// que o cliente paga em cada opção (PIX, cartão à vista, 2x..Nx) de forma que,
// após as taxas do Asaas (MDR + antecipação automática + tarifa fixa), a clínica
// receba o valor base. Função PURA e sem dependências — é a fonte da verdade dos
// valores exibidos na página pública (recalculados a partir do taxas_snapshot do link).
//
// Modelo da antecipação: para n parcelas, os meses de antecipação seguem a média
// (n+1)/2 (parcela k é recebida ~no mês k), salvo override explícito (faixa.meses,
// usado p/ à vista = 1 mês). Os números das faixas vêm da config da empresa.

import type {
  TaxaFaixaCartao,
  TaxasCartaoConfig,
  OpcaoCartao,
  OpcoesPagamento,
} from '@/types/payment-links';

const round2 = (v: number): number =>
  Math.round((v + Number.EPSILON) * 100) / 100;
// Arredonda o valor cobrado SEMPRE para cima (centavo) p/ garantir líquido >= base.
const ceil2 = (v: number): number =>
  Math.ceil((v - Number.EPSILON) * 100) / 100;

function mesesAntecipacao(n: number, mesesOverride?: number | null): number {
  if (typeof mesesOverride === 'number' && mesesOverride > 0)
    return mesesOverride;
  return (n + 1) / 2;
}

function faixaParaParcela(
  taxas: TaxasCartaoConfig,
  n: number
): TaxaFaixaCartao | undefined {
  return taxas.cartao.faixas.find((f) => n >= f.min && n <= f.max);
}

// Calcula todas as opções de pagamento (PIX + cartão 1x..maxParcelas).
export function calcularOpcoesPagamento(
  valorBase: number,
  taxas: TaxasCartaoConfig
): OpcoesPagamento {
  if (!(valorBase > 0)) {
    throw new Error('valorBase deve ser maior que zero');
  }

  // PIX = base + (percent% + fixo). Default: clínica absorve (percent=0, fixo=0).
  const pixTotal = ceil2(
    valorBase * (1 + (taxas.pix?.percent || 0) / 100) + (taxas.pix?.fixo || 0)
  );

  const maxParcelas = Math.max(1, taxas.max_parcelas || 1);
  const fixoCartao = taxas.cartao?.fixo || 0;
  const cartao: OpcaoCartao[] = [];

  for (let n = 1; n <= maxParcelas; n++) {
    const faixa = faixaParaParcela(taxas, n);
    if (!faixa) continue; // faixa não configurada => parcela indisponível

    const meses = mesesAntecipacao(n, faixa.meses);
    const fracaoTaxa = faixa.mdr / 100 + (faixa.antecipacao_mes / 100) * meses;
    if (fracaoTaxa >= 1) continue; // config inválida; evita divisão <= 0

    const bruto = ceil2((valorBase + fixoCartao) / (1 - fracaoTaxa));
    cartao.push({
      parcelas: n,
      total: bruto,
      valor_parcela: round2(bruto / n),
    });
  }

  return {
    valor_base: round2(valorBase),
    pix: { total: pixTotal },
    cartao,
  };
}

// Config padrão (valores iniciais dos prints enviados). Usada como fallback e como
// default da coluna pessoa_empresas.taxas_cartao. Ajustável por empresa.
export function gerarTaxasCartaoPadrao(): TaxasCartaoConfig {
  return {
    max_parcelas: 6,
    pix: { percent: 0, fixo: 0 },
    cartao: {
      fixo: 0.49,
      faixas: [
        { min: 1, max: 1, mdr: 2.99, antecipacao_mes: 1.15, meses: 1 },
        { min: 2, max: 6, mdr: 3.49, antecipacao_mes: 1.6, meses: null },
      ],
    },
  };
}
