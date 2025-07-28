import { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminMetrics,
  fetchAllUpcomingAppointments,
  fetchAllConsultationsToEvolve,
  fetchAllMaterialRequests,
  fetchAdminFaturamentoComparativo,
  type AdminMetrics,
  type UpcomingAppointment,
  type ConsultationToEvolve,
  type MaterialRequest,
  type FaturamentoComparativo,
} from '@/lib/professional-dashboard-api';

// AI dev note: Hook personalizado para métricas do dashboard administrativo
// Similar ao useProfessionalMetrics mas para dados de todos os profissionais

interface UseAdminMetricsProps {
  startDate: string;
  endDate: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // em minutos
}

interface UseAdminMetricsReturn {
  // Dados
  metrics: AdminMetrics | null;
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

export const useAdminMetrics = ({
  startDate,
  endDate,
  autoRefresh = true,
  refreshInterval = 60, // 1 hora por padrão
}: UseAdminMetricsProps): UseAdminMetricsReturn => {
  // Estados principais
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
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

  // Função para buscar métricas administrativas
  const refreshMetrics = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAdminMetrics(startDate, endDate);
      setMetrics(data);
    } catch (err) {
      console.error('Erro ao buscar métricas administrativas:', err);
      setError('Erro ao carregar métricas administrativas');
    }
  }, [startDate, endDate]);

  // Função para buscar próximos agendamentos (todos os profissionais)
  const refreshUpcoming = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAllUpcomingAppointments(7);
      setUpcomingAppointments(data);
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
      setError('Erro ao carregar agendamentos');
    }
  }, []);

  // Função para buscar consultas a evoluir (todos os profissionais)
  const refreshConsultations = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAllConsultationsToEvolve();
      setConsultationsToEvolve(data);
    } catch (err) {
      console.error('Erro ao buscar consultas a evoluir:', err);
      setError('Erro ao carregar consultas');
    }
  }, []);

  // Função para buscar solicitações de material (todos os profissionais)
  const refreshMaterial = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAllMaterialRequests();
      setMaterialRequests(data);
    } catch (err) {
      console.error('Erro ao buscar solicitações:', err);
      setError('Erro ao carregar solicitações');
    }
  }, []);

  // Função para buscar faturamento comparativo (todos os profissionais)
  const refreshFaturamento = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAdminFaturamentoComparativo();
      setFaturamentoComparativo(data);
    } catch (err) {
      console.error('Erro ao buscar faturamento comparativo:', err);
      setError('Erro ao carregar faturamento');
    }
  }, []);

  // Função para refrescar todos os dados
  const refreshAll = useCallback(async () => {
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
      console.error('Erro ao refrescar dados administrativos:', err);
      setError('Erro ao carregar dados do dashboard administrativo');
    } finally {
      setLoading(false);
    }
  }, [
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshMaterial,
    refreshFaturamento,
  ]);

  // Efeito para carregar dados iniciais
  useEffect(() => {
    if (startDate && endDate) {
      refreshAll();
    }
  }, [startDate, endDate, refreshAll]);

  // Efeito para refresh automático
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(
      () => {
        refreshAll();
      },
      refreshInterval * 60 * 1000
    ); // Converter minutos para milissegundos

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshAll]);

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
