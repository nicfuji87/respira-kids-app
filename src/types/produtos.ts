// AI dev note: Tipos do módulo Produtos (venda de espaçadores/brinquedos + estoque).
// O catálogo reaproveita a tabela produtos_servicos (flag vendavel=true). Kits são
// produtos com eh_kit=true cuja baixa consome componentes (produto_kit_componentes).

export type CategoriaVenda = 'espacador' | 'brinquedo' | 'outro';

export const CATEGORIA_LABELS: Record<CategoriaVenda, string> = {
  espacador: 'Espaçador',
  brinquedo: 'Brinquedo',
  outro: 'Outro',
};

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade_medida: string;
  vendavel: boolean;
  controla_estoque: boolean;
  eh_kit: boolean;
  categoria_venda: CategoriaVenda | null;
  preco_venda: number | null;
  preco_referencia: number | null;
  estoque_minimo: number;
  estoque_atual: number;
  foto_url: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Produto do catálogo já com o saldo vendável resolvido.
// disponivel: null = ilimitado (não controla estoque); kit = mínimo entre componentes.
export interface ProdutoVendavel extends Produto {
  disponivel: number | null;
}

export interface KitComponenteRef {
  id: string;
  nome: string;
  estoque_atual: number;
  unidade_medida: string;
  controla_estoque: boolean;
}

export interface KitComponente {
  id: string;
  kit_produto_id: string;
  componente_produto_id: string;
  quantidade: number;
  componente?: KitComponenteRef | null;
}

export type TipoMovimento = 'entrada' | 'saida_venda' | 'ajuste' | 'perda';

export const TIPO_MOVIMENTO_LABELS: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  saida_venda: 'Saída (venda)',
  ajuste: 'Ajuste',
  perda: 'Perda',
};

export interface EstoqueMovimento {
  id: string;
  produto_id: string;
  tipo: TipoMovimento;
  quantidade: number; // delta com sinal
  custo_unitario: number | null;
  motivo: string | null;
  venda_id: string | null;
  criado_por: string | null;
  created_at: string;
  produto?: { nome: string; unidade_medida: string } | null;
}

export interface ProdutoInput {
  nome: string;
  descricao?: string | null;
  unidade_medida?: string;
  categoria_venda: CategoriaVenda;
  preco_venda: number | null;
  // custo de compra por unidade; fallback do CMV quando a entrada de estoque
  // não informa custo_unitario
  preco_referencia?: number | null;
  controla_estoque: boolean;
  eh_kit: boolean;
  estoque_minimo?: number;
  foto_url?: string | null;
  ativo?: boolean;
}

export interface KitComponenteInput {
  componente_produto_id: string;
  quantidade: number;
}

export type StatusVenda =
  | 'rascunho'
  | 'aguardando_pagamento'
  | 'pago'
  | 'cancelado';

export const STATUS_VENDA_LABELS: Record<StatusVenda, string> = {
  rascunho: 'Rascunho',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

// Cor do badge de status — a mesma no detalhe do paciente e na página Vendas.
export const STATUS_VENDA_BADGE_CLASSES: Record<StatusVenda, string> = {
  pago: 'bg-verde-pipa/20 text-roxo-titulo border-verde-pipa/30',
  aguardando_pagamento:
    'bg-amarelo-pipa/20 text-amarelo-pipa border-amarelo-pipa/30',
  cancelado: 'bg-muted text-muted-foreground border-border',
  rascunho: 'bg-muted text-muted-foreground border-border',
};

export interface VendaProdutoResumo {
  id: string;
  status: StatusVenda;
  valor_total: number;
  created_at: string;
  pago_em: string | null;
  itens: { nome: string; quantidade: number }[];
  // cobrança Pix do Banco Inter (ver produtos_cobranca_inter.sql)
  pix_copia_cola: string | null;
  cobranca_token: string | null;
  pix_expira_em: string | null;
}

// Por onde a venda foi cobrada:
//   pix_inter = Pix do Banco Inter, sem nota (caminho atual)
//   asaas     = fatura do Asaas (caminho antigo; vem de produto_vendas.fatura_id)
//   manual    = marcada paga sem cobrança registrada
export type CanalCobrancaVenda = 'pix_inter' | 'asaas' | 'manual';

export interface VendaHistoricoItem {
  produto_id: string | null;
  nome: string;
  categoria: CategoriaVenda | null;
  eh_kit: boolean;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

// Uma venda na página Vendas (histórico de todas as vendas da loja).
export interface VendaHistorico {
  id: string;
  status: StatusVenda;
  valor_total: number;
  desconto: number;
  created_at: string;
  // dia da venda no fuso da clínica (YYYY-MM-DD); é nele que o filtro de período bate
  data_venda: string;
  paciente: { id: string; nome: string } | null;
  // quem paga: o responsável de cobrança do paciente
  responsavel: { id: string; nome: string } | null;
  vendedor_nome: string | null;
  itens: VendaHistoricoItem[];
  observacoes: string | null;
  canal: CanalCobrancaVenda | null;
  // venda cancelada pode ter sido paga antes — o estorno do Pix é separado
  foi_paga: boolean;
  pago_em: string | null;
  pago_valor: number | null;
  // EndToEndId do Pix: é por ele que se acha o pagamento no extrato do Inter
  pago_e2eid: string | null;
  cobranca_token: string | null;
  pix_expira_em: string | null;
  fatura: {
    id: string;
    status: string;
    invoice_url: string | null;
    forma: string | null;
  } | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  estorno_valor: number | null;
}

// Retorno de inter-criar-cobranca-produto
export interface CobrancaPixProduto {
  txid: string;
  pix_copia_cola: string;
  token: string | null;
  link_pagamento?: string;
  expira_em?: string;
  reaproveitada: boolean;
}

// Retorno de fn_public_venda_produto_por_token (página pública, sem login)
export interface VendaProdutoPublica {
  status: StatusVenda;
  valor_total: number;
  desconto: number;
  paciente_primeiro_nome: string | null;
  pix_copia_cola: string | null;
  pix_expira_em: string | null;
  pago_em: string | null;
  itens: { nome: string; quantidade: number; preco_unitario: number }[];
}

// Custo unitário por produto (vw_produto_custo).
// custo_efetivo null = nunca foi informado custo; a tela deve dizer isso em vez
// de assumir zero, que faria a margem parecer 100%.
export interface ProdutoCusto {
  produto_id: string;
  nome: string;
  estoque_atual: number;
  preco_venda: number | null;
  custo_medio: number | null;
  custo_referencia: number | null;
  custo_efetivo: number | null;
  custo_desconhecido: boolean;
}

export interface CredencialAVencer {
  chave: string;
  descricao: string;
  vence_em: string;
  dias_restantes: number;
  vencida: boolean;
  instrucao_renovacao: string | null;
}
