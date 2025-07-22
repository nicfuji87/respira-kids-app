import { useState, useEffect, useCallback } from 'react';
import {
  fetchProfessionalMetrics,
  fetchUpcomingAppointments,
  fetchConsultationsToEvolve,
  fetchMaterialRequests,
  fetchFaturamentoComparativo,
  type ProfessionalMetrics,
  type UpcomingAppointment,
  type ConsultationToEvolve,
  type MaterialRequest,
  type FaturamentoComparativo,
} from '@/lib/professional-dashboard-api';

// AI dev note: Hook personalizado para métricas do dashboard profissional
// Gerencia estado, loading, error e cache inteligente

interface UseProfessionalMetricsProps {
  professionalId: string;
  startDate: string;
  endDate: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // em minutos
}

interface UseProfessionalMetricsReturn {
  // Dados
  metrics: ProfessionalMetrics | null;
  upcomingAppointments: UpcomingAppointment[];
  consultationsToEvolve: ConsultationToEvolve[];
  materialRequests: MaterialRequest[];
  faturamentoComparativo: FaturamentoComparativo | null;

  // Estados
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;

  // Ações
  refreshMetrics: () => Promise<void>;
  refreshUpcoming: () => Promise<void>;
  refreshConsultations: () => Promise<void>;
  refreshMaterial: () => Promise<void>;
  refreshFaturamento: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useProfessionalMetrics = ({
  professionalId,
  startDate,
  endDate,
  autoRefresh = true,
  refreshInterval = 60, // 1 hora por padrão
}: UseProfessionalMetricsProps): UseProfessionalMetricsReturn => {
  // Estados principais
  const [metrics, setMetrics] = useState<ProfessionalMetrics | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    UpcomingAppointment[]
  >([]);
  const [consultationsToEvolve, setConsultationsToEvolve] = useState<
    ConsultationToEvolve[]
  >([]);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>(
    []
  );
  const [faturamentoComparativo, setFaturamentoComparativo] =
    useState<FaturamentoComparativo | null>(null);

  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Função para buscar métricas
  const refreshMetrics = useCallback(async () => {
    if (!professionalId) return;

    try {
      setError(null);
      const data = await fetchProfessionalMetrics(
        professionalId,
        startDate,
        endDate
      );
      setMetrics(data);
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
      setError('Erro ao carregar métricas');
    }
  }, [professionalId, startDate, endDate]);

  // Função para buscar próximos agendamentos
  const refreshUpcoming = useCallback(async () => {
    if (!professionalId) return;

    try {
      setError(null);
      const data = await fetchUpcomingAppointments(professionalId, 7);
      setUpcomingAppointments(data);
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
      setError('Erro ao carregar agendamentos');
    }
  }, [professionalId]);

  // Função para buscar consultas a evoluir
  const refreshConsultations = useCallback(async () => {
    if (!professionalId) return;

    try {
      setError(null);
      const data = await fetchConsultationsToEvolve(professionalId);
      setConsultationsToEvolve(data);
    } catch (err) {
      console.error('Erro ao buscar consultas a evoluir:', err);
      setError('Erro ao carregar consultas');
    }
  }, [professionalId]);

  // Função para buscar solicitações de material
  const refreshMaterial = useCallback(async () => {
    if (!professionalId) return;

    try {
      setError(null);
      const data = await fetchMaterialRequests(professionalId);
      setMaterialRequests(data);
    } catch (err) {
      console.error('Erro ao buscar solicitações:', err);
      setError('Erro ao carregar solicitações');
    }
  }, [professionalId]);

  // Função para buscar faturamento comparativo
  const refreshFaturamento = useCallback(async () => {
    if (!professionalId) return;

    try {
      setError(null);
      const data = await fetchFaturamentoComparativo(professionalId);
      setFaturamentoComparativo(data);
    } catch (err) {
      console.error('Erro ao buscar faturamento comparativo:', err);
      setError('Erro ao carregar faturamento');
    }
  }, [professionalId]);

  // Função para refrescar todos os dados
  const refreshAll = useCallback(async () => {
    if (!professionalId) return;

    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        refreshMetrics(),
        refreshUpcoming(),
        refreshConsultations(),
        refreshMaterial(),
        refreshFaturamento(),
      ]);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Erro ao refrescar dados:', err);
      setError('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }, [
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshMaterial,
    refreshFaturamento,
    professionalId,
  ]);

  // Efeito para carregar dados iniciais
  useEffect(() => {
    if (professionalId && startDate && endDate) {
      refreshAll();
    }
  }, [professionalId, startDate, endDate, refreshAll]);

  // Efeito para refresh automático
  useEffect(() => {
    if (!autoRefresh || !professionalId) return;

    const interval = setInterval(
      () => {
        refreshAll();
      },
      refreshInterval * 60 * 1000
    ); // Converter minutos para milissegundos

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, professionalId, refreshAll]);

  return {
    // Dados
    metrics,
    upcomingAppointments,
    consultationsToEvolve,
    materialRequests,
    faturamentoComparativo,

    // Estados
    loading,
    error,
    lastUpdate,

    // Ações
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshMaterial,
    refreshFaturamento,
    refreshAll,
  };
};
