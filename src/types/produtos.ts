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
  estoque_minimo: number;
  estoque_atual: number;
  foto_url: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
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

export interface VendaProdutoResumo {
  id: string;
  status: StatusVenda;
  valor_total: number;
  created_at: string;
  pago_em: string | null;
  itens: { nome: string; quantidade: number }[];
}
