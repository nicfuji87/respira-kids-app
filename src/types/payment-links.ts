// AI dev note: Tipos do fluxo de link público de pagamento (PIX x Cartão com
// repasse de taxas ao cliente). Ver src/lib/payment-fees.ts (cálculo) e
// src/lib/payment-links-api.ts (CRUD/confirmação).

// === Configuração de taxas por empresa ===
// Armazenada em pessoa_empresas.taxas_cartao (jsonb). Mantida em snake_case para
// espelhar exatamente o blob no banco (sem transformação).
export interface TaxaFaixaCartao {
  min: number; // nº mínimo de parcelas da faixa
  max: number; // nº máximo de parcelas da faixa
  mdr: number; // % sobre o valor total da venda (taxa de intermediação)
  antecipacao_mes: number; // % ao mês (antecipação automática)
  meses?: number | null; // override de meses de antecipação; null => média (n+1)/2
}

export interface TaxasCartaoConfig {
  max_parcelas: number;
  pix: { percent: number; fixo: number };
  cartao: { fixo: number; faixas: TaxaFaixaCartao[] };
}

// === Saída do cálculo (valores BRUTOS pagos pelo cliente) ===
export interface OpcaoCartao {
  parcelas: number;
  valor_parcela: number; // valor de cada parcela (para exibição)
  total: number; // valor bruto total cobrado no cartão
}

export interface OpcoesPagamento {
  valor_base: number; // líquido desejado pela clínica (= valor PIX por padrão)
  pix: { total: number };
  cartao: OpcaoCartao[];
}

// === Registro do link público (tabela pagamento_links) ===
// pendente = aguardando o cliente escolher a forma
// confirmado = forma escolhida e cobrança criada no Asaas (pagamento em si fica na fatura)
// expirado/cancelado = link inválido
export type PagamentoLinkStatus =
  | 'pendente'
  | 'confirmado'
  | 'expirado'
  | 'cancelado';
export type FormaPagamento = 'pix' | 'credit_card';

export interface PagamentoLink {
  id: string;
  token: string;
  paciente_id: string;
  responsavel_cobranca_id: string;
  empresa_id: string;
  valor_base: number;
  descricao: string | null;
  vencimento: string | null; // YYYY-MM-DD
  status: PagamentoLinkStatus;
  forma_escolhida: FormaPagamento | null;
  installment_count: number | null;
  fatura_id: string | null;
  id_asaas: string | null;
  taxas_snapshot: TaxasCartaoConfig;
  opcoes_snapshot: OpcoesPagamento | null;
  expira_em: string | null; // timestamptz
  criado_por: string | null;
  criado_em: string;
  ativo: boolean;
}

// === Visão pública (retornada pela RPC SECURITY DEFINER) ===
// NUNCA inclui dados sensíveis (sem API key, sem ids internos além do necessário).
export interface PagamentoLinkPublico {
  token: string;
  status: PagamentoLinkStatus;
  paciente_nome: string;
  empresa_nome: string;
  valor_base: number;
  descricao: string | null;
  vencimento: string | null;
  forma_escolhida: FormaPagamento | null;
  installment_count: number | null;
  opcoes: OpcoesPagamento;
  datas_consultas: string[]; // datas das consultas cobradas (YYYY-MM-DD)
  expira_em: string | null;
  expirado: boolean;
}

// Payload retornado pela edge function ao confirmar a forma de pagamento.
export interface ConfirmarPagamentoResult {
  forma: FormaPagamento;
  invoiceUrl?: string; // checkout hospedado Asaas (cartão) ou fatura PIX
  pix?: {
    encodedImage?: string; // QR Code base64
    payload?: string; // copia-e-cola
    expirationDate?: string;
  };
}
