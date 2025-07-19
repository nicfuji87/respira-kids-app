import { useState, useEffect, useCallback } from 'react';
import {
  fetchMediaByPatient,
  fetchMediaBySession,
  countMediaByPatient,
} from '@/lib/session-media-api';
import type {
  SessionMediaGroup,
  SessionMediaWithDocument,
  MediaFilters,
} from '@/types/session-media';

// AI dev note: Hook para gerenciar mídias de sessão - Fase 4 MediaGallery
// Busca mídias agrupadas por sessão com filtros e estados de loading

interface UseSessionMediaResult {
  mediaGroups: SessionMediaGroup[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  applyFilters: (filters: MediaFilters) => void;
  currentFilters: MediaFilters;
}

export function useSessionMedia(patientId?: string): UseSessionMediaResult {
  const [mediaGroups, setMediaGroups] = useState<SessionMediaGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFilters, setCurrentFilters] = useState<MediaFilters>({
    tipo_midia: 'all',
    momento_sessao: 'all',
  });

  const loadMediaData = useCallback(async () => {
    if (!patientId) {
      setMediaGroups([]);
      setTotalCount(0);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Buscar mídias agrupadas e contagem em paralelo
      const [groups, count] = await Promise.all([
        fetchMediaByPatient(patientId, currentFilters),
        countMediaByPatient(patientId),
      ]);

      setMediaGroups(groups);
      setTotalCount(count);
    } catch (err) {
      console.error('Erro ao carregar mídias:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar mídias');
      setMediaGroups([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [patientId, currentFilters]);

  // Carregar dados quando patient ID ou filtros mudarem
  useEffect(() => {
    loadMediaData();
  }, [loadMediaData]);

  const applyFilters = useCallback((filters: MediaFilters) => {
    setCurrentFilters(filters);
  }, []);

  const refetch = useCallback(async () => {
    await loadMediaData();
  }, [loadMediaData]);

  return {
    mediaGroups,
    totalCount,
    isLoading,
    error,
    refetch,
    applyFilters,
    currentFilters,
  };
}

// Hook para buscar mídias de uma sessão específica
interface UseSessionMediaBySessionResult {
  medias: SessionMediaWithDocument[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionMediaBySession(
  agendamentoId?: string
): UseSessionMediaBySessionResult {
  const [medias, setMedias] = useState<SessionMediaWithDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessionMedia = useCallback(async () => {
    if (!agendamentoId) {
      setMedias([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const sessionMedia = await fetchMediaBySession(agendamentoId);
      setMedias(sessionMedia);
    } catch (err) {
      console.error('Erro ao carregar mídias da sessão:', err);
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar mídias da sessão'
      );
      setMedias([]);
    } finally {
      setIsLoading(false);
    }
  }, [agendamentoId]);

  useEffect(() => {
    loadSessionMedia();
  }, [loadSessionMedia]);

  const refetch = useCallback(async () => {
    await loadSessionMedia();
  }, [loadSessionMedia]);

  return {
    medias,
    isLoading,
    error,
    refetch,
  };
}
