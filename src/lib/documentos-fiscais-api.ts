import { supabase } from './supabase';
import { uploadDocumentoFinanceiro } from './financeiro-storage';

// AI dev note: ingestão de documento fiscal (nota, boleto, cupom) para virar
// pré-lançamento. Sem WhatsApp — a entrada é upload in-app.
//
// Fluxo: upload no bucket privado -> linha em documentos_fiscais -> edge
// parse-documento-fiscal (XML por parser determinístico, PDF/imagem por IA) ->
// RPC fn_financeiro_criar_prelancamento (fornecedor/categoria por regra) ->
// tela de Pré-Lançamentos para validação humana.
//
// Nada entra como lançamento validado direto. Ver PLANO_FINANCEIRO_IMPLANTACAO.md §3.

export type DocumentoStatus =
  | 'recebido'
  | 'processando'
  | 'extraido'
  | 'erro'
  | 'duplicado'
  | 'descartado'
  | 'consumido';

export interface DocumentoFiscal {
  id: string;
  nome_original: string;
  caminho: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  tipo_detectado: string | null;
  status: DocumentoStatus;
  confianca: number | null;
  erro_msg: string | null;
  tentativas: number;
  lancamento_id: string | null;
  created_at: string;
}

export interface ResultadoIngestao {
  documentoId: string;
  nome: string;
  status: DocumentoStatus;
  lancamentoId?: string;
  erro?: string;
}

/** SHA-256 do conteúdo — é o que impede o mesmo arquivo de entrar duas vezes. */
async function hashArquivo(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sobe um documento, manda extrair e cria o pré-lançamento.
 * Cada etapa atualiza `documentos_fiscais`, então um erro no meio deixa rastro.
 */
export async function ingerirDocumentoFiscal(
  file: File,
  pessoaId?: string | null
): Promise<ResultadoIngestao> {
  const hash = await hashArquivo(file);

  // 1) Arquivo já processado antes? Não sobe de novo.
  const { data: existente } = await supabase
    .from('documentos_fiscais')
    .select('id, nome_original, status, lancamento_id')
    .eq('hash_sha256', hash)
    .maybeSingle();

  if (existente) {
    return {
      documentoId: existente.id,
      nome: file.name,
      status: 'duplicado',
      lancamentoId: existente.lancamento_id ?? undefined,
      erro: `Este arquivo já foi enviado antes (${existente.nome_original}).`,
    };
  }

  // 2) Bucket privado
  const caminho = await uploadDocumentoFinanceiro(file, pessoaId);

  const { data: doc, error: insErr } = await supabase
    .from('documentos_fiscais')
    .insert({
      caminho,
      nome_original: file.name,
      mime_type: file.type || null,
      tamanho_bytes: file.size,
      hash_sha256: hash,
      enviado_por: pessoaId ?? null,
    })
    .select('id')
    .single();

  if (insErr || !doc) {
    throw new Error(
      insErr?.message || 'Não foi possível registrar o documento'
    );
  }

  // 3) Extração
  const { data: parse, error: parseErr } = await supabase.functions.invoke(
    'parse-documento-fiscal',
    { body: { documento_id: doc.id } }
  );

  if (parseErr || !parse?.success) {
    const { data: atual } = await supabase
      .from('documentos_fiscais')
      .select('erro_msg')
      .eq('id', doc.id)
      .maybeSingle();

    return {
      documentoId: doc.id,
      nome: file.name,
      status: 'erro',
      erro:
        atual?.erro_msg || parse?.error || 'Não foi possível ler o documento.',
    };
  }

  // 4) Pré-lançamento
  const { data: criado, error: rpcErr } = await supabase.rpc(
    'fn_financeiro_criar_prelancamento',
    { p_documento_id: doc.id }
  );

  if (rpcErr) {
    return {
      documentoId: doc.id,
      nome: file.name,
      status: 'erro',
      erro: rpcErr.message,
    };
  }

  if (!criado?.ok) {
    return {
      documentoId: doc.id,
      nome: file.name,
      status: criado?.duplicado ? 'duplicado' : 'erro',
      lancamentoId: criado?.lancamento_id,
      erro: criado?.erro || 'Não foi possível criar o pré-lançamento',
    };
  }

  return {
    documentoId: doc.id,
    nome: file.name,
    status: 'consumido',
    lancamentoId: criado.lancamento_id,
  };
}

/** Documentos que não viraram lançamento (erro, duplicado, parados no meio). */
export async function fetchDocumentosPendentes(): Promise<DocumentoFiscal[]> {
  const { data, error } = await supabase
    .from('documentos_fiscais')
    .select(
      'id, nome_original, caminho, mime_type, tamanho_bytes, tipo_detectado, status, confianca, erro_msg, tentativas, lancamento_id, created_at'
    )
    .neq('status', 'consumido')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as DocumentoFiscal[]) || [];
}

/** Reprocessa um documento que deu erro (ex.: chave de IA que estava fora do ar). */
export async function reprocessarDocumento(
  documentoId: string
): Promise<ResultadoIngestao> {
  const { data: parse, error: parseErr } = await supabase.functions.invoke(
    'parse-documento-fiscal',
    { body: { documento_id: documentoId } }
  );

  if (parseErr || !parse?.success) {
    return {
      documentoId,
      nome: '',
      status: 'erro',
      erro: parse?.error || 'Não foi possível ler o documento.',
    };
  }

  const { data: criado } = await supabase.rpc(
    'fn_financeiro_criar_prelancamento',
    { p_documento_id: documentoId }
  );

  return {
    documentoId,
    nome: '',
    status: criado?.ok ? 'consumido' : 'erro',
    lancamentoId: criado?.lancamento_id,
    erro: criado?.ok ? undefined : criado?.erro,
  };
}

export async function descartarDocumento(documentoId: string): Promise<void> {
  const { error } = await supabase
    .from('documentos_fiscais')
    .update({ status: 'descartado' })
    .eq('id', documentoId);
  if (error) throw error;
}
