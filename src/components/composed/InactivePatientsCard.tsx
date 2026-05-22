// AI dev note: InactivePatientsCard - Worklist de pacientes inativos para a secretaria/admin
// Mostra lista priorizada por tempo sem consulta com filtros por tipo e status
// Permite registrar contato e marcar paciente como "não contatar"

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Input } from '@/components/primitives/input';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Users,
  AlertTriangle,
  PhoneCall,
  Wind,
  Activity,
  RefreshCw,
  Search,
  Ban,
  MessageCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchInactivePatients,
  fetchInactivePatientsCounts,
} from '@/lib/inatividade-api';
import type {
  InactivePatient,
  StatusAlertaInatividade,
  TipoPaciente,
} from '@/types/inatividade';

export interface InactivePatientsCardProps {
  className?: string;
  maxItems?: number;
  onPatientClick?: (patient: InactivePatient) => void;
  onContactPatient?: (patient: InactivePatient) => void;
  onManagePatient?: (patient: InactivePatient) => void;
}

const STATUS_FILTERS: Array<{
  key: StatusAlertaInatividade;
  label: string;
  tipo: TipoPaciente | null;
}> = [
  {
    key: 'alerta_540',
    label: '1,5+ anos (respiratório)',
    tipo: 'respiratorio',
  },
  { key: 'alerta_360', label: '1 ano (respiratório)', tipo: 'respiratorio' },
  { key: 'alerta_180', label: '6 meses (respiratório)', tipo: 'respiratorio' },
  { key: 'alerta_60', label: '60 dias (motor)', tipo: 'motor' },
  { key: 'fora_janela', label: 'Fora da janela (motor)', tipo: 'motor' },
  { key: 'sem_historico', label: 'Sem histórico', tipo: null },
];

const ALERT_BADGE: Record<
  StatusAlertaInatividade,
  {
    label: string;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
  }
> = {
  ativo: { label: 'Ativo', variant: 'secondary' },
  alerta_60: { label: '60 dias', variant: 'destructive' },
  alerta_180: { label: '6 meses', variant: 'secondary' },
  alerta_360: { label: '1 ano', variant: 'destructive' },
  alerta_540: { label: '1,5 anos', variant: 'destructive' },
  fora_janela: { label: 'Fora da janela', variant: 'outline' },
  sem_historico: { label: 'Sem histórico', variant: 'outline' },
  nao_contatar: { label: 'Não contatar', variant: 'outline' },
  indefinido: { label: 'Indefinido', variant: 'outline' },
};

const formatDateBR = (date: string | null): string => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatPhone = (phone: number | null): string => {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return s;
};

export const InactivePatientsCard: React.FC<InactivePatientsCardProps> = ({
  className,
  maxItems = 25,
  onPatientClick,
  onContactPatient,
  onManagePatient,
}) => {
  const [patients, setPatients] = useState<InactivePatient[]>([]);
  const [counts, setCounts] = useState<Record<
    StatusAlertaInatividade,
    number
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<StatusAlertaInatividade | null>('alerta_540');
  const [search, setSearch] = useState('');

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, c] = await Promise.all([
        fetchInactivePatients({
          status_alerta: statusFilter ? [statusFilter] : undefined,
          incluir_nao_contatar: false,
          busca: search || undefined,
        }),
        fetchInactivePatientsCounts(),
      ]);
      setPatients(list.slice(0, maxItems));
      setCounts(c);
    } catch (err) {
      console.error('Erro ao carregar pacientes inativos:', err);
      setError('Não foi possível carregar a lista de pacientes inativos');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, maxItems]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalAtivos = useMemo(() => {
    if (!counts) return 0;
    return (
      counts.alerta_60 +
      counts.alerta_180 +
      counts.alerta_360 +
      counts.alerta_540 +
      counts.fora_janela +
      counts.sem_historico
    );
  }, [counts]);

  return (
    <Card className={cn('border-rosa-suave/40', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-rosa-suave" />
            Pacientes Inativos
            {totalAtivos > 0 && (
              <Badge variant="destructive" className="ml-1">
                {totalAtivos}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1 text-xs"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        {/* Filtros por status */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STATUS_FILTERS.map((f) => {
            const count = counts?.[f.key] ?? 0;
            const active = statusFilter === f.key;
            return (
              <Button
                key={f.key}
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(f.key)}
                className="h-7 text-xs gap-1.5"
              >
                {f.tipo === 'respiratorio' && <Wind className="h-3 w-3" />}
                {f.tipo === 'motor' && <Activity className="h-3 w-3" />}
                {f.label}
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 px-1 text-[10px]"
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative mt-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do paciente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum paciente nessa categoria
          </div>
        ) : (
          <div className="space-y-2">
            {patients.map((p) => {
              const alertInfo = ALERT_BADGE[p.status_alerta];
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-start justify-between gap-3 p-3 rounded-md border',
                    'hover:bg-muted/40 cursor-pointer transition-colors'
                  )}
                  onClick={() => onPatientClick?.(p)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{p.nome}</span>
                      <Badge
                        variant={alertInfo.variant}
                        className="text-[10px]"
                      >
                        {alertInfo.label}
                      </Badge>
                      {p.tipo_paciente === 'respiratorio' && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Wind className="h-3 w-3" />
                          Respiratório
                        </Badge>
                      )}
                      {p.tipo_paciente === 'motor' && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Activity className="h-3 w-3" />
                          Motor
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Última visita: {formatDateBR(p.data_ultima_consulta)}
                        {p.dias_sem_consulta != null &&
                          ` (${p.dias_sem_consulta} dias)`}
                      </span>
                      {p.responsavel_legal_nome && (
                        <span>Resp: {p.responsavel_legal_nome}</span>
                      )}
                      {p.responsavel_telefone && (
                        <span>{formatPhone(p.responsavel_telefone)}</span>
                      )}
                      {p.total_contatos > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1"
                        >
                          {p.total_contatos} contato
                          {p.total_contatos > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onContactPatient && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onContactPatient(p)}
                      >
                        <MessageCircle className="h-3 w-3" />
                        Contatar
                      </Button>
                    )}
                    {onManagePatient && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onManagePatient(p)}
                        title="Gerenciar (histórico, não contatar)"
                      >
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && patients.length >= maxItems && (
          <div className="text-center text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <PhoneCall className="h-3 w-3" />
            Mostrando os primeiros {maxItems}. Use os filtros para refinar.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

InactivePatientsCard.displayName = 'InactivePatientsCard';
