// AI dev note: Pix pedido pela @ju no grupo de notas e aprovado aqui no app.
//
// A Ju (n8n) só PREPARA o pedido (pix_solicitacoes) e manda o link /#/pix/:id no
// grupo. Quem paga é o admin logado, pela mesma inter-pagar da aba Financeiro
// (só admin, tetos, auditoria). A ordem importa:
//   1. iniciar  → trava o pedido em "pagando" (dois celulares não pagam duas vezes)
//   2. inter-pagar → o Pix sai
//   3. concluir → baixa a conta e libera o aviso no grupo
// Se o app fechar entre 2 e 3, o fluxo de aviso do n8n acha o Pix pela auditoria.

import { supabase } from './supabase';
import { enviarPagamentoInter } from './inter-conta-api';

export type PixSolicitacaoStatus =
  | 'aguardando'
  | 'pagando'
  | 'pago'
  | 'erro'
  | 'cancelado'
  | 'expirado';

export interface PixSolicitacao {
  id: string;
  status: PixSolicitacaoStatus;
  valor: number;
  chave_pix: string;
  favorecido: string | null;
  descricao: string | null;
  solicitante: string | null;
  expira_em: string;
  created_at: string;
  concluido_em: string | null;
  erro: string | null;
  lancamento_id: string;
  fornecedor_cnpj: string | null;
  chave_pix_origem: string | null;
  chave_pix_atualizada_em: string | null;
  aprovado_por: string | null;
}

export async function fetchPixSolicitacao(
  id: string
): Promise<PixSolicitacao | null> {
  const { data, error } = await supabase.rpc('fn_pix_solicitacao_obter', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as PixSolicitacao | null) ?? null;
}

// "Inter POST /banking/v2/pix (422): {"title":"Chave em formato inválido","detail":"..."}"
// vira "O Inter recusou: Chave em formato inválido. ..." para quem está pagando.
function mensagemInter(msg: string): string {
  const m = msg.match(/Inter [A-Z]+ \S+ \((\d+)\): (\{.*\})/s);
  if (!m) return msg;
  try {
    const corpo = JSON.parse(m[2]) as { title?: string; detail?: string };
    const partes = [corpo.title, corpo.detail].filter(Boolean).join('. ');
    return partes ? `O Inter recusou: ${partes}` : msg;
  } catch {
    return msg;
  }
}

// ATENÇÃO: tira dinheiro da conta. Pix enviado não volta.
export async function pagarPixSolicitacao(id: string): Promise<void> {
  const { data: inicio, error: iniErr } = await supabase.rpc(
    'fn_pix_solicitacao_iniciar',
    { p_id: id }
  );
  if (iniErr) throw new Error(iniErr.message);
  const ini = inicio as {
    ok: boolean;
    erro?: string;
    valor?: number;
    chave_pix?: string;
    favorecido?: string;
    descricao?: string;
  };
  if (!ini?.ok) throw new Error(ini?.erro || 'Pedido indisponível');

  let auditoriaId = '';
  try {
    const r = await enviarPagamentoInter({
      tipo: 'pix',
      valor: Number(ini.valor),
      chave: ini.chave_pix,
      favorecido: ini.favorecido ?? undefined,
      descricao: ini.descricao ?? undefined,
    });
    auditoriaId = r.auditoria_id;
  } catch (e) {
    const msg = mensagemInter(
      e instanceof Error ? e.message : 'Falha ao enviar o Pix'
    );
    await supabase.rpc('fn_pix_solicitacao_concluir', {
      p_id: id,
      p_inter_pagamento_id: null,
      p_erro: msg,
    });
    throw new Error(msg);
  }

  const { error: fimErr } = await supabase.rpc('fn_pix_solicitacao_concluir', {
    p_id: id,
    p_inter_pagamento_id: auditoriaId,
    p_erro: null,
  });
  // o Pix já saiu: falha aqui só atrasa a baixa (o fluxo do n8n reconcilia)
  if (fimErr) console.error('[pix-solicitacao] concluir:', fimErr.message);
}

export async function cancelarPixSolicitacao(id: string): Promise<void> {
  const { error } = await supabase.rpc('fn_pix_solicitacao_cancelar', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
}
