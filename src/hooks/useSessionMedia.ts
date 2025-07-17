import { useState, useEffect, useCallback } from 'react';
import {
  fetchSessionMedias,
  uploadAndSaveSessionMedia,
  deleteSessionMedia,
  updateSessionMediaRecord,
} from '@/lib/session-media-api';
import type {
  MediaUploadProgress,
  SessionMediaWithPreview,
} from '@/types/session-media';

// AI dev note: Hook para gerenciar estado e operações de mídias de sessão
// Centraliza lógica de upload, carregamento, cache e estado

interface UseSessionMediaProps {
  agendamentoId: string;
  criadoPor?: string;
  enabled?: boolean;
}

interface UseSessionMediaReturn {
  medias: SessionMediaWithPreview[];
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: MediaUploadProgress[];
  error: string | null;
  // Operações
  refreshMedias: () => Promise<void>;
  uploadFiles: (files: File[], descricoes?: string[]) => Promise<void>;
  deleteMedia: (mediaId: string) => Promise<void>;
  updateMediaDescription: (mediaId: string, descricao: string) => Promise<void>;
  clearError: () => void;
}

export const useSessionMedia = ({
  agendamentoId,
  criadoPor,
  enabled = true,
}: UseSessionMediaProps): UseSessionMediaReturn => {
  const [medias, setMedias] = useState<SessionMediaWithPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<MediaUploadProgress[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);

  // Carregar mídias da sessão
  const refreshMedias = useCallback(async () => {
    if (!enabled || !agendamentoId) return;

    try {
      setIsLoading(true);
      setError(null);

      const fetchedMedias = await fetchSessionMedias(agendamentoId);

      // Converter para SessionMediaWithPreview
      const mediasWithPreview: SessionMediaWithPreview[] = fetchedMedias.map(
        (media) => ({
          ...media,
          previewUrl: media.url_arquivo,
          isLoading: false,
        })
      );

      setMedias(mediasWithPreview);
    } catch (err) {
      console.error('Erro ao carregar mídias:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar mídias');
    } finally {
      setIsLoading(false);
    }
  }, [agendamentoId, enabled]);

  // Carregar mídias na inicialização
  useEffect(() => {
    refreshMedias();
  }, [refreshMedias]);

  // Upload de múltiplos arquivos
  const uploadFiles = useCallback(
    async (files: File[], descricoes: string[] = []) => {
      if (!agendamentoId || files.length === 0) return;

      try {
        setIsUploading(true);
        setError(null);

        // Inicializar progresso
        const initialProgress: MediaUploadProgress[] = files.map((file) => ({
          file,
          progress: 0,
          status: 'uploading',
        }));
        setUploadProgress(initialProgress);

        const uploadPromises = files.map(async (file, index) => {
          try {
            // Atualizar progresso para "enviando"
            setUploadProgress((prev) =>
              prev.map((p, i) => (i === index ? { ...p, progress: 50 } : p))
            );

            const descricao = descricoes[index] || undefined;
            const savedMedia = await uploadAndSaveSessionMedia(
              file,
              agendamentoId,
              descricao,
              criadoPor
            );

            if (savedMedia) {
              // Atualizar progresso para completo
              setUploadProgress((prev) =>
                prev.map((p, i) =>
                  i === index
                    ? {
                        ...p,
                        progress: 100,
                        status: 'completed',
                        url: savedMedia.url_arquivo,
                      }
                    : p
                )
              );

              // Adicionar à lista de mídias
              const mediaWithPreview: SessionMediaWithPreview = {
                ...savedMedia,
                previewUrl: savedMedia.url_arquivo,
                isLoading: false,
              };

              setMedias((prev) => [mediaWithPreview, ...prev]);
            }
          } catch (err) {
            console.error(`Erro no upload do arquivo ${file.name}:`, err);

            // Atualizar progresso para erro
            setUploadProgress((prev) =>
              prev.map((p, i) =>
                i === index
                  ? {
                      ...p,
                      status: 'error',
                      error:
                        err instanceof Error ? err.message : 'Erro no upload',
                    }
                  : p
              )
            );
          }
        });

        await Promise.allSettled(uploadPromises);
      } catch (err) {
        console.error('Erro geral no upload:', err);
        setError(
          err instanceof Error ? err.message : 'Erro no upload de arquivos'
        );
      } finally {
        setIsUploading(false);

        // Limpar progresso após delay
        setTimeout(() => {
          setUploadProgress([]);
        }, 3000);
      }
    },
    [agendamentoId, criadoPor]
  );

  // Deletar mídia
  const deleteMedia = useCallback(async (mediaId: string) => {
    try {
      setError(null);

      // Otimistic update
      setMedias((prev) =>
        prev.map((media) =>
          media.id === mediaId ? { ...media, isLoading: true } : media
        )
      );

      await deleteSessionMedia(mediaId);

      // Remover da lista
      setMedias((prev) => prev.filter((media) => media.id !== mediaId));
    } catch (err) {
      console.error('Erro ao deletar mídia:', err);
      setError(err instanceof Error ? err.message : 'Erro ao deletar arquivo');

      // Reverter otimistic update
      setMedias((prev) =>
        prev.map((media) =>
          media.id === mediaId ? { ...media, isLoading: false } : media
        )
      );
    }
  }, []);

  // Atualizar descrição
  const updateMediaDescription = useCallback(
    async (mediaId: string, descricao: string) => {
      try {
        setError(null);

        // Otimistic update
        setMedias((prev) =>
          prev.map((media) =>
            media.id === mediaId ? { ...media, isLoading: true } : media
          )
        );

        const updatedMedia = await updateSessionMediaRecord({
          id: mediaId,
          descricao,
          atualizado_por: criadoPor,
        });

        if (updatedMedia) {
          setMedias((prev) =>
            prev.map((media) =>
              media.id === mediaId
                ? {
                    ...media,
                    ...updatedMedia,
                    previewUrl: updatedMedia.url_arquivo,
                    isLoading: false,
                  }
                : media
            )
          );
        }
      } catch (err) {
        console.error('Erro ao atualizar descrição:', err);
        setError(
          err instanceof Error ? err.message : 'Erro ao atualizar descrição'
        );

        // Reverter otimistic update
        setMedias((prev) =>
          prev.map((media) =>
            media.id === mediaId ? { ...media, isLoading: false } : media
          )
        );
      }
    },
    [criadoPor]
  );

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    medias,
    isLoading,
    isUploading,
    uploadProgress,
    error,
    refreshMedias,
    uploadFiles,
    deleteMedia,
    updateMediaDescription,
    clearError,
  };
};
