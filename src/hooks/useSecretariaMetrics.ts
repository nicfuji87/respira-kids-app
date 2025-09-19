import { useState, useEffect, useCallback } from 'react';
import {
  fetchSecretariaMetrics,
  fetchSecretariaUpcomingAppointments,
  fetchSecretariaConsultationsToEvolve,
  fetchSecretariaVolumeComparativo,
  type SecretariaMetrics,
  type SecretariaVolumeComparativo,
  type UpcomingAppointment,
  type ConsultationToEvolve,
} from '@/lib/secretaria-dashboard-api';

// AI dev note: Hook personalizado para métricas do dashboard da secretaria
// Foca em métricas operacionais sem valores financeiros globais
// Filtra dados apenas pelos profissionais autorizados

interface UseSecretariaMetricsProps {
  secretariaId: string;
  startDate: string;
  endDate: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // em minutos
}

interface UseSecretariaMetricsReturn {
  // Dados
  metrics: SecretariaMetrics | null;
  upcomingAppointments: UpcomingAppointment[];
  consultationsToEvolve: ConsultationToEvolve[];
  volumeComparativo: SecretariaVolumeComparativo | null;

  // Estados
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;

  // Ações
  refreshMetrics: () => Promise<void>;
  refreshUpcoming: () => Promise<void>;
  refreshConsultations: () => Promise<void>;
  refreshVolume: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useSecretariaMetrics = ({
  secretariaId,
  startDate,
  endDate,
  autoRefresh = true,
  refreshInterval = 60, // 1 hora por padrão
}: UseSecretariaMetricsProps): UseSecretariaMetricsReturn => {
  // Estados principais
  const [metrics, setMetrics] = useState<SecretariaMetrics | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    UpcomingAppointment[]
  >([]);
  const [consultationsToEvolve, setConsultationsToEvolve] = useState<
    ConsultationToEvolve[]
  >([]);
  const [volumeComparativo, setVolumeComparativo] =
    useState<SecretariaVolumeComparativo | null>(null);

  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Função para buscar métricas
  const refreshMetrics = useCallback(async () => {
    if (!secretariaId) return;

    try {
      setError(null);
      const data = await fetchSecretariaMetrics(
        secretariaId,
        startDate,
        endDate
      );
      setMetrics(data);
    } catch (err) {
      console.error('Erro ao buscar métricas da secretaria:', err);
      setError('Erro ao carregar métricas operacionais');
    }
  }, [secretariaId, startDate, endDate]);

  // Função para buscar próximos agendamentos
  const refreshUpcoming = useCallback(async () => {
    if (!secretariaId) return;

    try {
      setError(null);
      const data = await fetchSecretariaUpcomingAppointments(secretariaId, 7);
      setUpcomingAppointments(data);
    } catch (err) {
      console.error('Erro ao buscar agendamentos da secretaria:', err);
      setError('Erro ao carregar próximos agendamentos');
    }
  }, [secretariaId]);

  // Função para buscar consultas a evoluir
  const refreshConsultations = useCallback(async () => {
    if (!secretariaId) return;

    try {
      setError(null);
      const data = await fetchSecretariaConsultationsToEvolve(secretariaId);
      setConsultationsToEvolve(data);
    } catch (err) {
      console.error('Erro ao buscar consultas a evoluir da secretaria:', err);
      setError('Erro ao carregar consultas pendentes');
    }
  }, [secretariaId]);

  // Função para buscar volume comparativo
  const refreshVolume = useCallback(async () => {
    if (!secretariaId) return;

    try {
      setError(null);
      const data = await fetchSecretariaVolumeComparativo(secretariaId);
      setVolumeComparativo(data);
    } catch (err) {
      console.error('Erro ao buscar volume comparativo da secretaria:', err);
      setError('Erro ao carregar dados de volume');
    }
  }, [secretariaId]);

  // Função para refrescar todos os dados
  const refreshAll = useCallback(async () => {
    if (!secretariaId) return;

    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        refreshMetrics(),
        refreshUpcoming(),
        refreshConsultations(),
        refreshVolume(),
      ]);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Erro ao refrescar dados da secretaria:', err);
      setError('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }, [
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshVolume,
    secretariaId,
  ]);

  // Efeito para carregar dados iniciais
  useEffect(() => {
    if (secretariaId && startDate && endDate) {
      refreshAll();
    }
  }, [secretariaId, startDate, endDate, refreshAll]);

  // Efeito para refresh automático
  useEffect(() => {
    if (!autoRefresh || !secretariaId) return;

    const interval = setInterval(
      () => {
        refreshAll();
      },
      refreshInterval * 60 * 1000
    ); // Converter minutos para milissegundos

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, secretariaId, refreshAll]);

  return {
    // Dados
    metrics,
    upcomingAppointments,
    consultationsToEvolve,
    volumeComparativo,

    // Estados
    loading,
    error,
    lastUpdate,

    // Ações
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshVolume,
    refreshAll,
  };
};
