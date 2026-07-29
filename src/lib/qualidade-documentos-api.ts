// AI dev note: API dos documentos do Manual (Manual de Boas Práticas + POPs).
// Regra central: só UMA versão vigente por código (garantida por índice único
// parcial no banco). Aprovar um documento é o ato que o torna vigente — e grava
// nome/registro da RT como SNAPSHOT, para o documento não mudar retroativamente
// se a RT sair da clínica.

import { supabase } from './supabase';
import type { DocumentoRow, DocumentoStatus } from '@/types/qualidade';

const TABLE = 'qualidade_documentos';

export async function fetchDocumentos(): Promise<DocumentoRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('codigo', { ascending: true });

  if (error) {
    console.error('[qualidade-documentos] erro ao buscar:', error);
    throw error;
  }
  return (data || []) as DocumentoRow[];
}

/**
 * Aprova o documento e o torna vigente.
 * Grava nome + registro da RT como snapshot imutável.
 */
export async function aprovarDocumento(
  id: string,
  rt: { pessoaId: string | null; nome: string; registro: string },
  proximaRevisao: string | null
): Promise<DocumentoRow> {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: 'vigente' satisfies DocumentoStatus,
      vigente_desde: hoje,
      proxima_revisao: proximaRevisao,
      aprovado_por: rt.pessoaId,
      aprovado_por_nome: rt.nome,
      aprovado_por_registro: rt.registro,
      aprovado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[qualidade-documentos] erro ao aprovar:', error);
    throw error;
  }
  return data as DocumentoRow;
}

/** Registra leitura ou aceite ("li e entendi") da versão atual do documento. */
export async function registrarTreinamento(
  documentoId: string,
  pessoaId: string,
  versao: number,
  tipo: 'leitura' | 'aceite'
): Promise<void> {
  const { error } = await supabase.from('qualidade_treinamentos').upsert(
    {
      documento_id: documentoId,
      pessoa_id: pessoaId,
      tipo,
      versao_snapshot: versao,
    },
    { onConflict: 'documento_id,pessoa_id,tipo' }
  );

  if (error) {
    console.error(
      '[qualidade-documentos] erro ao registrar treinamento:',
      error
    );
    throw error;
  }
}
