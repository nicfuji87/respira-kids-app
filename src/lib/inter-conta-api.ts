// AI dev note: Acesso à conta do Banco Inter pelo app (aba Financeiro).
//
// Leitura (saldo/extrato) é liberada para admin e secretaria — é a base da
// conciliação diária. Pagamento é só admin e passa por travas no servidor
// (teto por operação, teto diário, confirmação textual e auditoria).
//
// Nada aqui carrega credencial: as edge functions é que falam com o Inter.

import { supabase } from './supabase';

export interface SaldoInter {
  disponivel: number;
  bloqueadoCheque?: number;
  bloqueadoJudicialmente?: number;
  bloqueadoAdministrativo?: number;
  limite?: number;
  dataReferencia?: string;
}

export interface TransacaoExtrato {
  idTransacao: string;
  dataInclusao: string;
  dataTransacao: string;
  tipoTransacao: string;
  // C = entrada, D = saída
  tipoOperacao: string;
  valor: string;
  titulo?: string;
  descricao?: string;
}

export interface ContaInterResposta {
  saldo: SaldoInter;
  extrato: {
    totalPaginas: number;
    totalElementos: number;
    ultimaPagina: boolean;
    transacoes: TransacaoExtrato[];
  };
  periodo: { inicio: string; fim: string };
}

function erroDaFunction(data: unknown, fallback: string): string {
  const d = data as { error?: string } | null;
  return d?.error || fallback;
}

export async function fetchContaInter(opts?: {
  dataInicio?: string;
  dataFim?: string;
  pagina?: number;
}): Promise<ContaInterResposta> {
  const { data, error } = await supabase.functions.invoke('inter-conta', {
    body: {
      data_inicio: opts?.dataInicio,
      data_fim: opts?.dataFim,
      pagina: opts?.pagina ?? 0,
    },
  });
  if (error) throw new Error(erroDaFunction(data, error.message));
  const r = data as ContaInterResposta & { error?: string };
  if (r?.error) throw new Error(r.error);
  return r;
}

// O servidor exige exatamente este texto. Fica aqui para a tela não inventar
// outro e descobrir só no erro.
export const CONFIRMACAO_PAGAMENTO = 'CONFIRMO O PAGAMENTO';

export type TipoPagamento = 'boleto' | 'darf' | 'pix';

export interface PagamentoInput {
  tipo: TipoPagamento;
  valor: number;
  descricao?: string;
  codigoBarras?: string;
  dataPagamento?: string;
  chave?: string;
  favorecido?: string;
}

// ATENÇÃO: tira dinheiro da conta. Pix enviado não volta.
export async function enviarPagamentoInter(
  input: PagamentoInput
): Promise<{ ok: boolean; auditoria_id: string }> {
  const { data, error } = await supabase.functions.invoke('inter-pagar', {
    body: {
      tipo: input.tipo,
      valor: input.valor,
      confirmacao: CONFIRMACAO_PAGAMENTO,
      descricao: input.descricao ?? null,
      codigo_barras: input.codigoBarras ?? null,
      data_pagamento: input.dataPagamento ?? null,
      chave: input.chave ?? null,
      favorecido: input.favorecido ?? null,
    },
  });
  if (error) throw new Error(erroDaFunction(data, error.message));
  const r = data as { ok?: boolean; auditoria_id?: string; error?: string };
  if (r?.error) throw new Error(r.error);
  return { ok: Boolean(r?.ok), auditoria_id: r?.auditoria_id ?? '' };
}

export interface PagamentoAuditoria {
  id: string;
  tipo: TipoPagamento;
  valor: number;
  descricao: string | null;
  chave_pix: string | null;
  favorecido: string | null;
  status: 'enviando' | 'sucesso' | 'erro';
  erro: string | null;
  criado_em: string;
  solicitante?: { nome: string } | null;
}

export async function fetchPagamentosInter(
  limite = 30
): Promise<PagamentoAuditoria[]> {
  const { data, error } = await supabase
    .from('inter_pagamentos')
    .select(
      'id, tipo, valor, descricao, chave_pix, favorecido, status, erro, criado_em, solicitante:solicitado_por (nome)'
    )
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PagamentoAuditoria[];
}
