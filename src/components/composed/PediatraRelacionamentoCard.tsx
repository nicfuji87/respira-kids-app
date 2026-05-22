// AI dev note: Card de relacionamento com pediatras para o AdminDashboard
// Lista pediatras priorizados por necessidade de contato (esfriando/sem_contato primeiro)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Stethoscope,
  Phone,
  Send,
  RefreshCw,
  Search,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchPediatrasCounts,
  fetchPediatrasRelacionamento,
  triggerDailyPediatraSummary,
} from '@/lib/pediatra-relacionamento-api';
import { useToast } from '@/components/primitives/use-toast';
import type {
  PediatraRelacionamento,
  StatusRelacionamentoPediatra,
} from '@/types/pediatra-relacionamento';

export interface PediatraRelacionamentoCardProps {
  className?: string;
  maxItems?: number;
  onPediatraClick?: (p: PediatraRelacionamento) => void;
  onContactPediatra?: (p: PediatraRelacionamento) => void;
  onSendEvolution?: (p: PediatraRelacionamento) => void;
}

const STATUS_FILTERS: Array<{
  key: StatusRelacionamentoPediatra;
  label: string;
  variant: 'destructive' | 'secondary' | 'default' | 'outline';
}> = [
  { key: 'sem_contato', label: 'Sem contato', variant: 'destructive' },
  { key: 'esfriando', label: 'Esfriando (>180d)', variant: 'destructive' },
  { key: 'devido', label: 'Devido (>90d)', variant: 'secondary' },
  { key: 'em_dia', label: 'Em dia', variant: 'outline' },
];

const STATUS_BADGE: Record<
  StatusRelacionamentoPediatra,
  {
    label: string;
    variant: 'destructive' | 'secondary' | 'default' | 'outline';
  }
> = {
  sem_contato: { label: 'Sem contato', variant: 'destructive' },
  esfriando: { label: 'Esfriando', variant: 'destructive' },
  devido: { label: 'Devido', variant: 'secondary' },
  em_dia: { label: 'Em dia', variant: 'outline' },
};

const formatDate = (date: string | null) => {
  if (!date) return 'Nunca';
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

const formatPhone = (phone: number | null) => {
  if (!phone) return null;
  const s = String(phone);
  if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return s;
};

export const PediatraRelacionamentoCard: React.FC<
  PediatraRelacionamentoCardProps
> = ({
  className,
  maxItems = 15,
  onPediatraClick,
  onContactPediatra,
  onSendEvolution,
}) => {
  const { toast } = useToast();
  const [pediatras, setPediatras] = useState<PediatraRelacionamento[]>([]);
  const [counts, setCounts] = useState<Record<
    StatusRelacionamentoPediatra,
    number
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusRelacionamentoPediatra | null>(
    'sem_contato'
  );
  const [search, setSearch] = useState('');
  const [sendingSummary, setSendingSummary] = useState(false);

  const handleSendDailySummary = async () => {
    setSendingSummary(true);
    try {
      const queueId = await triggerDailyPediatraSummary();
      toast({
        title: queueId ? 'Resumo enfileirado' : 'Sem agendamentos ontem',
        description: queueId
          ? 'O resumo da agenda foi enfileirado e será enviado ao n8n.'
          : 'Não havia agendamentos no dia anterior — nada foi enfileirado.',
      });
    } catch (err) {
      toast({
        title: 'Erro ao enfileirar resumo',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSendingSummary(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, c] = await Promise.all([
        fetchPediatrasRelacionamento({
          status: status ? [status] : undefined,
          busca: search || undefined,
        }),
        fetchPediatrasCounts(),
      ]);
      setPediatras(list.slice(0, maxItems));
      setCounts(c);
    } catch (err) {
      console.error('Erro ao carregar pediatras:', err);
      setError('Não foi possível carregar os pediatras');
    } finally {
      setLoading(false);
    }
  }, [status, search, maxItems]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalAtencao = useMemo(() => {
    if (!counts) return 0;
    return counts.sem_contato + counts.esfriando + counts.devido;
  }, [counts]);

  return (
    <Card className={cn('border-azul-respira/30', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-5 w-5 text-azul-respira" />
            Relacionamento com Pediatras
            {totalAtencao > 0 && (
              <Badge variant="destructive" className="ml-1">
                {totalAtencao}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendDailySummary}
              disabled={sendingSummary}
              className="gap-1 text-xs"
              title="Enfileira o resumo da agenda de ontem (cron diário às 08:00 BRT já faz isso automaticamente)"
            >
              <Mail
                className={cn('h-3 w-3', sendingSummary && 'animate-pulse')}
              />
              Enviar resumo D-1
            </Button>
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
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {STATUS_FILTERS.map((f) => {
            const count = counts?.[f.key] ?? 0;
            const active = status === f.key;
            return (
              <Button
                key={f.key}
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatus(f.key)}
                className="h-7 text-xs gap-1.5"
              >
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

        <div className="relative mt-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pediatra..."
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
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : pediatras.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum pediatra nessa categoria
          </div>
        ) : (
          <div className="space-y-2">
            {pediatras.map((p) => {
              const badge = STATUS_BADGE[p.status_relacionamento];
              const phone = formatPhone(p.telefone);
              return (
                <div
                  key={p.pessoa_pediatra_id}
                  className={cn(
                    'flex items-start justify-between gap-3 p-3 rounded-md border',
                    'hover:bg-muted/40 cursor-pointer transition-colors'
                  )}
                  onClick={() => onPediatraClick?.(p)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {p.pediatra_nome}
                      </span>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                      {p.crm && (
                        <Badge variant="outline" className="text-[10px]">
                          CRM {p.crm}
                        </Badge>
                      )}
                      {p.novas_indicacoes_90d > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-1"
                        >
                          <TrendingUp className="h-3 w-3" />+
                          {p.novas_indicacoes_90d} ind. (90d)
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        {p.total_pacientes_vinculados} paciente
                        {p.total_pacientes_vinculados !== 1 ? 's' : ''}
                      </span>
                      <span>{p.pacientes_ativos_90d} ativo(s) 90d</span>
                      <span>
                        Último contato: {formatDate(p.ultimo_contato)}
                        {p.dias_desde_ultimo_contato != null &&
                          ` (${p.dias_desde_ultimo_contato}d)`}
                      </span>
                      {phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {phone}
                        </span>
                      )}
                      {p.especialidade && <span>{p.especialidade}</span>}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onSendEvolution && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onSendEvolution(p)}
                        title="Enviar evolução clínica"
                      >
                        <Send className="h-3 w-3" />
                        Evolução
                      </Button>
                    )}
                    {onContactPediatra && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1 h-7"
                        onClick={() => onContactPediatra(p)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Registrar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

PediatraRelacionamentoCard.displayName = 'PediatraRelacionamentoCard';
