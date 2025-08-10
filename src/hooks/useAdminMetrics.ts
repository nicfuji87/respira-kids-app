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
// Agora com suporte a filtros por profissional

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

  // Controle de agendamentos
  hasMoreAppointments: boolean;

  // Filtros
  professionalFilters: {
    faturamento: string[];
    agendamentos: string[];
    consultas: string[];
  };
  setProfessionalFilters: (filters: {
    faturamento?: string[];
    agendamentos?: string[];
    consultas?: string[];
  }) => void;

  // Configurações de agendamentos
  appointmentsLimit: number;
  setAppointmentsLimit: (limit: number) => void;

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
  const [hasMoreAppointments, setHasMoreAppointments] = useState(false);

  // Estados de filtros
  const [professionalFilters, setProfessionalFiltersState] = useState({
    faturamento: [] as string[],
    agendamentos: [] as string[],
    consultas: [] as string[],
  });

  // Estado de configurações
  const [appointmentsLimit, setAppointmentsLimit] = useState(10);

  // Função para atualizar filtros
  const setProfessionalFilters = useCallback(
    (filters: {
      faturamento?: string[];
      agendamentos?: string[];
      consultas?: string[];
    }) => {
      setProfessionalFiltersState((prev) => ({
        ...prev,
        ...filters,
      }));
    },
    []
  );

  // Função para buscar métricas administrativas
  const refreshMetrics = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAdminMetrics(endDate);
      setMetrics(data);
    } catch (err) {
      console.error('Erro ao buscar métricas administrativas:', err);
      setError('Erro ao carregar métricas administrativas');
    }
  }, [endDate]);

  // Função para buscar próximos agendamentos (com filtros)
  const refreshUpcoming = useCallback(async () => {
    try {
      setError(null);
      const { appointments, hasMore } = await fetchAllUpcomingAppointments(
        7,
        professionalFilters.agendamentos.length > 0
          ? professionalFilters.agendamentos
          : undefined,
        appointmentsLimit
      );
      setUpcomingAppointments(appointments);
      setHasMoreAppointments(hasMore);
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
      setError('Erro ao carregar agendamentos');
    }
  }, [professionalFilters.agendamentos, appointmentsLimit]);

  // Função para buscar consultas a evoluir (com filtros)
  const refreshConsultations = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAllConsultationsToEvolve(
        professionalFilters.consultas.length > 0
          ? professionalFilters.consultas
          : undefined
      );
      setConsultationsToEvolve(data);
    } catch (err) {
      console.error('Erro ao buscar consultas a evoluir:', err);
      setError('Erro ao carregar consultas');
    }
  }, [professionalFilters.consultas]);

  // Função para buscar solicitações de material
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

  // Função para buscar faturamento comparativo (com filtros)
  const refreshFaturamento = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAdminFaturamentoComparativo(
        professionalFilters.faturamento.length > 0
          ? professionalFilters.faturamento
          : undefined
      );
      setFaturamentoComparativo(data);
    } catch (err) {
      console.error('Erro ao buscar faturamento comparativo:', err);
      setError('Erro ao carregar faturamento');
    }
  }, [professionalFilters.faturamento]);

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

  // Efeito para carregar dados iniciais apenas uma vez
  useEffect(() => {
    if (startDate && endDate) {
      // Carregar dados iniciais apenas na montagem
      setLoading(true);
      setError(null);

      Promise.all([
        refreshMetrics(),
        refreshUpcoming(),
        refreshConsultations(),
        refreshMaterial(),
        refreshFaturamento(),
      ])
        .then(() => setLastUpdate(new Date()))
        .catch((err) => {
          console.error('Erro ao carregar dados administrativos:', err);
          setError('Erro ao carregar dados do dashboard administrativo');
        })
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executar apenas na montagem do componente

  // Efeito para atualizar quando filtros de agendamentos mudam
  useEffect(() => {
    if (professionalFilters.agendamentos.length > 0) {
      refreshUpcoming();
    }
  }, [professionalFilters.agendamentos, appointmentsLimit]); // Apenas quando filtros ou limite mudam

  // Efeito para atualizar quando filtros de consultas mudam
  useEffect(() => {
    if (professionalFilters.consultas.length > 0) {
      refreshConsultations();
    }
  }, [professionalFilters.consultas]); // Apenas quando filtros mudam

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
  }, [autoRefresh, refreshInterval]); // Removido refreshAll das dependências

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

    // Controle de agendamentos
    hasMoreAppointments,

    // Filtros
    professionalFilters,
    setProfessionalFilters,

    // Configurações
    appointmentsLimit,
    setAppointmentsLimit,

    // Ações
    refreshMetrics,
    refreshUpcoming,
    refreshConsultations,
    refreshMaterial,
    refreshFaturamento,
    refreshAll,
  };
};
