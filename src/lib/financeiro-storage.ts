import { supabase } from './supabase';

// AI dev note: documentos fiscais (nota, boleto, comprovante) vão para o bucket PRIVADO
// respira-financeiro — nunca para respira-documents, que é público e devolve URL que não
// expira. Nota fiscal traz CNPJ, valores e endereço.
//
// `lancamentos_financeiros.arquivo_url` guarda o CAMINHO no bucket (ex.:
// "lancamentos/<pessoaId>/1785…-nota.pdf"), não uma URL. Para abrir, gera-se uma URL
// assinada de curta duração. Registros legados (2 lançamentos de nov/2024 apontando para
// uchat.com.au) continuam sendo URL http — por isso `abrirDocumentoFinanceiro` trata os
// dois formatos.

export const BUCKET_FINANCEIRO = 'respira-financeiro';

const EXPIRACAO_PADRAO_SEGUNDOS = 300; // 5 min

const ehUrlExterna = (valor: string) => /^https?:\/\//i.test(valor);

/** Sobe o arquivo no bucket privado e devolve o caminho a gravar em arquivo_url. */
export async function uploadDocumentoFinanceiro(
  file: File,
  pessoaId?: string | null
): Promise<string> {
  const extensao = file.name.split('.').pop()?.toLowerCase() || 'bin';
  // acentos e qualquer outro caractere fora de [a-zA-Z0-9] viram '-' — o Storage
  // rejeita nome de objeto com caractere especial
  const nomeSanitizado = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  const caminho = `lancamentos/${pessoaId || 'sem-usuario'}/${Date.now()}-${nomeSanitizado || 'documento'}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET_FINANCEIRO)
    .upload(caminho, file, { contentType: file.type || undefined });

  if (error) throw error;

  return caminho;
}

/** URL assinada de curta duração para um caminho do bucket privado. */
export async function getUrlAssinadaDocumento(
  caminho: string,
  expiraEmSegundos = EXPIRACAO_PADRAO_SEGUNDOS
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_FINANCEIRO)
    .createSignedUrl(caminho, expiraEmSegundos);

  if (error) {
    console.error('❌ Erro ao assinar URL do documento financeiro:', error);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Abre o documento em nova aba. Aceita caminho do bucket privado ou URL legada.
 * Devolve `null` em caso de sucesso e a mensagem de erro caso contrário.
 *
 * A aba é aberta ANTES do await (ainda dentro do gesto do usuário) para não ser
 * bloqueada como popup; só depois recebe a URL assinada.
 */
export async function abrirDocumentoFinanceiro(
  arquivo: string
): Promise<string | null> {
  if (ehUrlExterna(arquivo)) {
    window.open(arquivo, '_blank', 'noopener,noreferrer');
    return null;
  }

  const janela = window.open('', '_blank');
  const url = await getUrlAssinadaDocumento(arquivo);

  if (!url) {
    janela?.close();
    return 'Não foi possível gerar o link do documento. Tente novamente.';
  }

  if (janela) {
    janela.opener = null;
    janela.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return null;
}
