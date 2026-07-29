// AI dev note: API do levantamento para o Manual de Boas Práticas.
// Upsert por pergunta_id (UNIQUE) — cada pergunta é uma linha, salva sozinha.
// Isso permite autosave sem transação e responder em várias sessões/dispositivos.
//
// Fotos vão para o bucket privado 'qualidade' e são comprimidas antes do upload.
// ATENÇÃO: aqui a compressão usa maxDimension MAIOR que o padrão do app (600),
// porque o objetivo da foto é LER o registro ANVISA no rótulo do saneante.

import { supabase } from './supabase';
import { compressImage } from './image-utils';
import type {
  LevantamentoAnexo,
  LevantamentoRespostaInput,
  LevantamentoRespostaRow,
} from '@/types/qualidade';

const TABLE = 'qualidade_levantamento_respostas';
const BUCKET = 'qualidade';

/** Busca todas as respostas já gravadas. */
export async function fetchRespostas(): Promise<LevantamentoRespostaRow[]> {
  const { data, error } = await supabase.from(TABLE).select('*');

  if (error) {
    console.error('[qualidade-levantamento] erro ao buscar:', error);
    throw error;
  }
  return (data || []) as LevantamentoRespostaRow[];
}

/** Grava (ou atualiza) a resposta de UMA pergunta. */
export async function salvarResposta(
  input: LevantamentoRespostaInput,
  respondidoPor: string | null
): Promise<LevantamentoRespostaRow> {
  const payload = {
    pergunta_id: input.perguntaId,
    bloco: input.bloco,
    resposta: input.resposta ?? null,
    nao_sei: input.naoSei ?? false,
    nao_aplica: input.naoAplica ?? false,
    anexos: input.anexos ?? [],
    respondido_por: respondidoPor,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'pergunta_id' })
    .select()
    .single();

  if (error) {
    console.error('[qualidade-levantamento] erro ao salvar:', error);
    throw error;
  }
  return data as LevantamentoRespostaRow;
}

/**
 * Sobe uma foto para o bucket privado e devolve o anexo já com URL assinada.
 * maxDimension 1600 porque rótulo de saneante precisa ficar legível.
 */
export async function uploadAnexo(
  perguntaId: string,
  file: File
): Promise<LevantamentoAnexo> {
  const { blob, ext } = await compressImage(file, {
    maxDimension: 1600,
    quality: 0.75,
  });

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `levantamento/${perguntaId}/${stamp}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (upErr) {
    console.error('[qualidade-levantamento] erro no upload:', upErr);
    throw upErr;
  }

  const url = await assinarUrl(path);
  return { path, url, nome: file.name };
}

/** Bucket é privado — a URL precisa ser assinada para exibir. */
export async function assinarUrl(
  path: string,
  segundos = 60 * 60 * 8
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, segundos);

  if (error) {
    console.error('[qualidade-levantamento] erro ao assinar URL:', error);
    return '';
  }
  return data?.signedUrl ?? '';
}

/** Reassina os anexos de uma resposta (as URLs expiram). */
export async function reassinarAnexos(
  anexos: LevantamentoAnexo[]
): Promise<LevantamentoAnexo[]> {
  return Promise.all(
    anexos.map(async (a) => ({ ...a, url: await assinarUrl(a.path) }))
  );
}

export async function removerAnexo(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error('[qualidade-levantamento] erro ao remover anexo:', error);
    throw error;
  }
}

/**
 * Exporta tudo em Markdown — é assim que o levantamento sai da tela e
 * vira insumo para a redação dos POPs.
 */
export function exportarMarkdown(
  respostas: Map<string, LevantamentoRespostaRow>,
  blocos: {
    id: string;
    titulo: string;
    perguntas: { id: string; texto: string; critica?: boolean }[];
  }[]
): string {
  const linhas: string[] = [
    '# Levantamento para o Manual de Boas Práticas — Respira Kids',
    '',
    `> Exportado em ${new Date().toLocaleString('pt-BR')}`,
    '',
  ];

  for (const bloco of blocos) {
    linhas.push(`## ${bloco.id}. ${bloco.titulo}`, '');

    for (const p of bloco.perguntas) {
      const r = respostas.get(p.id);
      linhas.push(`**${p.id}.** ${p.texto}${p.critica ? ' 🔴' : ''}`);

      if (r?.nao_aplica) {
        linhas.push('', 'N/A', '');
      } else if (r?.nao_sei) {
        linhas.push('', '`NÃO SEI` — marcar como pendência no documento', '');
      } else if (r?.resposta?.trim()) {
        linhas.push('', r.resposta.trim(), '');
      } else {
        linhas.push('', '_(sem resposta)_', '');
      }

      if (r?.anexos?.length) {
        linhas.push(`_${r.anexos.length} foto(s) anexada(s)_`, '');
      }
    }
  }

  return linhas.join('\n');
}
