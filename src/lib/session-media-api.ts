import { supabase } from './supabase';
import type {
  SessionMedia,
  CreateSessionMedia,
  UpdateSessionMedia,
  MediaUploadResult,
} from '@/types/session-media';

// AI dev note: API Supabase para sistema de mídias de sessão
// Gerencia upload para bucket respira-sessions e CRUD na tabela midias_sessao

const BUCKET_NAME = 'respira-sessions';

/**
 * Upload de arquivo para o bucket respira-sessions
 */
export const uploadSessionMedia = async (
  file: File,
  agendamentoId: string
): Promise<MediaUploadResult> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${agendamentoId}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Erro no upload:', error);
      return {
        success: false,
        error: error.message,
        file,
      };
    }

    // Gerar URL assinada (bucket privado)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileName, 3600); // 1 hora de validade

    if (urlError || !signedUrlData?.signedUrl) {
      console.error('Erro ao gerar URL assinada:', urlError);
      return {
        success: false,
        error: urlError?.message || 'Erro ao gerar URL de acesso',
        file,
      };
    }

    return {
      success: true,
      url: signedUrlData.signedUrl,
      file,
    };
  } catch (error) {
    console.error('Erro no upload de mídia:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      file,
    };
  }
};

/**
 * Salvar referência da mídia na tabela midias_sessao
 */
export const createSessionMediaRecord = async (
  mediaData: CreateSessionMedia
): Promise<SessionMedia | null> => {
  try {
    const { data, error } = await supabase
      .from('midias_sessao')
      .insert(mediaData)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar mídia no DB:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Erro ao criar registro de mídia:', error);
    throw error;
  }
};

/**
 * Gerar URL assinada para uma mídia existente
 */
const generateSignedUrlForMedia = async (
  media: SessionMedia
): Promise<string> => {
  try {
    // Extrair o path do arquivo da URL armazenada
    const url = new URL(media.url_arquivo);
    const pathParts = url.pathname.split('/');
    // Formato esperado: /storage/v1/object/public/respira-sessions/agendamentoId/arquivo.ext
    const filePath = pathParts.slice(-2).join('/'); // agendamentoId/arquivo.ext

    const { data: signedUrlData, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 3600); // 1 hora de validade

    if (error || !signedUrlData?.signedUrl) {
      console.error('Erro ao gerar URL assinada para mídia existente:', error);
      return media.url_arquivo; // Fallback para URL original
    }

    return signedUrlData.signedUrl;
  } catch (error) {
    console.error('Erro ao processar URL da mídia:', error);
    return media.url_arquivo; // Fallback para URL original
  }
};

/**
 * Buscar todas as mídias de uma sessão
 */
export const fetchSessionMedias = async (
  agendamentoId: string
): Promise<SessionMedia[]> => {
  try {
    const { data, error } = await supabase
      .from('midias_sessao')
      .select('*')
      .eq('id_agendamento', agendamentoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar mídias:', error);
      throw error;
    }

    // Gerar URLs assinadas para todas as mídias
    const mediasWithSignedUrls = await Promise.all(
      (data || []).map(async (media) => ({
        ...media,
        url_arquivo: await generateSignedUrlForMedia(media),
      }))
    );

    return mediasWithSignedUrls;
  } catch (error) {
    console.error('Erro ao buscar mídias da sessão:', error);
    throw error;
  }
};

/**
 * Atualizar descrição de uma mídia
 */
export const updateSessionMediaRecord = async (
  mediaData: UpdateSessionMedia
): Promise<SessionMedia | null> => {
  try {
    const { data, error } = await supabase
      .from('midias_sessao')
      .update({
        descricao: mediaData.descricao,
        atualizado_por: mediaData.atualizado_por,
      })
      .eq('id', mediaData.id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar mídia:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Erro ao atualizar mídia:', error);
    throw error;
  }
};

/**
 * Remover mídia (arquivo do storage + registro do DB)
 */
export const deleteSessionMedia = async (mediaId: string): Promise<boolean> => {
  try {
    // Primeiro buscar a mídia para obter a URL
    const { data: media, error: fetchError } = await supabase
      .from('midias_sessao')
      .select('url_arquivo')
      .eq('id', mediaId)
      .single();

    if (fetchError || !media) {
      console.error('Erro ao buscar mídia para remoção:', fetchError);
      throw fetchError || new Error('Mídia não encontrada');
    }

    // Extrair o path do arquivo da URL
    const url = new URL(media.url_arquivo);
    const filePath = url.pathname.split('/').slice(-2).join('/'); // agendamentoId/arquivo.ext

    // Remover do storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (storageError) {
      console.error('Erro ao remover arquivo do storage:', storageError);
      // Continua mesmo com erro no storage para limpar o DB
    }

    // Remover do DB
    const { error: dbError } = await supabase
      .from('midias_sessao')
      .delete()
      .eq('id', mediaId);

    if (dbError) {
      console.error('Erro ao remover mídia do DB:', dbError);
      throw dbError;
    }

    return true;
  } catch (error) {
    console.error('Erro ao deletar mídia:', error);
    throw error;
  }
};

/**
 * Upload completo: arquivo + registro no DB
 */
export const uploadAndSaveSessionMedia = async (
  file: File,
  agendamentoId: string,
  descricao?: string,
  criadoPor?: string
): Promise<SessionMedia | null> => {
  try {
    // 1. Upload do arquivo
    const uploadResult = await uploadSessionMedia(file, agendamentoId);

    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || 'Falha no upload');
    }

    // 2. Determinar tipo de mídia
    const tipoMidia = file.type.startsWith('image/')
      ? 'foto'
      : file.type.startsWith('video/')
        ? 'video'
        : 'audio';

    // 3. Salvar no DB
    const mediaData: CreateSessionMedia = {
      id_agendamento: agendamentoId,
      url_arquivo: uploadResult.url,
      tipo_midia: tipoMidia,
      descricao: descricao || null,
      criado_por: criadoPor || null,
    };

    const savedMedia = await createSessionMediaRecord(mediaData);
    return savedMedia;
  } catch (error) {
    console.error('Erro no upload completo de mídia:', error);
    throw error;
  }
};
