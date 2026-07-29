// AI dev note: Aba de pendências de adequação — ações concretas (licenciamento,
// tributário, estrutural, POPs a escrever, treinamento), não perguntas a responder.
// Cada item tem status próprio, atualizado direto na tela (sem debounce: são poucos
// cliques por sessão, diferente do levantamento que é digitação contínua).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/primitives/accordion';
import { Tabs, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Circle,
  Clock,
  ListTodo,
  RefreshCw,
} from 'lucide-react';
import {
  atualizarStatusPendencia,
  fetchPendencias,
} from '@/lib/qualidade-pendencias-api';
import type {
  PendenciaCategoria,
  PendenciaCriticidade,
  PendenciaRow,
  PendenciaStatus,
} from '@/types/qualidade';

const CATEGORIA_LABELS: Record<PendenciaCategoria, string> = {
  licenciamento: 'Licenciamento',
  tributario: 'Tributário',
  estrutural: 'Estrutural / Sanitário',
  pop: 'POPs a escrever',
  treinamento: 'Treinamento',
};

const CATEGORIA_ORDER: PendenciaCategoria[] = [
  'licenciamento',
  'tributario',
  'estrutural',
  'pop',
  'treinamento',
];

const CRITICIDADE_LABELS: Record<PendenciaCriticidade, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

const CRITICIDADE_CLASSES: Record<PendenciaCriticidade, string> = {
  alta: 'border-vermelho-kids/40 text-vermelho-kids',
  media: 'border-amarelo-pipa/50 text-roxo-titulo',
  baixa: 'border-border text-muted-foreground',
};

const STATUS_SEQUENCE: PendenciaStatus[] = [
  'pendente',
  'em_andamento',
  'concluido',
];

type Filtro = 'todas' | 'abertas' | 'alta' | 'concluidas';

function formatPrazo(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export const PendenciasTab: React.FC = () => {
  const { toast } = useToast();
  const [pendencias, setPendencias] = useState<PendenciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const rows = await fetchPendencias();
      setPendencias(rows);
    } catch (e) {
      console.error('[PendenciasTab] erro ao carregar:', e);
      setErro(
        'Não consegui carregar as pendências. Verifique a conexão e tente de novo.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const handleStatus = useCallback(
    async (id: string, status: PendenciaStatus) => {
      setSalvandoId(id);
      const anterior = pendencias;
      // atualização otimista — poucas linhas, risco baixo de conflito
      setPendencias((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      try {
        await atualizarStatusPendencia(id, status);
      } catch {
        setPendencias(anterior);
        toast({
          title: 'Não consegui atualizar',
          description: 'Tente de novo em instantes.',
          variant: 'destructive',
        });
      } finally {
        setSalvandoId(null);
      }
    },
    [pendencias, toast]
  );

  const progresso = useMemo(() => {
    const total = pendencias.length;
    const concluidas = pendencias.filter((p) => p.status === 'concluido').length;
    const altaAbertas = pendencias.filter(
      (p) => p.criticidade === 'alta' && p.status !== 'concluido'
    ).length;
    return { total, concluidas, altaAbertas };
  }, [pendencias]);

  const pctGeral =
    progresso.total > 0
      ? Math.round((progresso.concluidas / progresso.total) * 100)
      : 0;

  const filtradas = useMemo(() => {
    return pendencias.filter((p) => {
      if (filtro === 'abertas') return p.status !== 'concluido';
      if (filtro === 'concluidas') return p.status === 'concluido';
      if (filtro === 'alta')
        return p.criticidade === 'alta' && p.status !== 'concluido';
      return true;
    });
  }, [pendencias, filtro]);

  const grupos = useMemo(() => {
    return CATEGORIA_ORDER.map((categoria) => ({
      categoria,
      itens: filtradas
        .filter((p) => p.categoria === categoria)
        .sort((a, b) => a.ordem - b.ordem),
    })).filter((g) => g.itens.length > 0);
  }, [filtradas]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {erro && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="flex-1 text-sm text-foreground">{erro}</p>
            <Button variant="ghost" size="sm" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
                Pendências resolvidas
              </p>
              <p className="text-2xl font-bold text-foreground mt-0.5">
                {progresso.concluidas}
                <span className="text-muted-foreground font-normal text-lg">
                  {' '}
                  / {progresso.total}
                </span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void carregar()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>

          <Progress value={pctGeral} className="h-2" />

          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle
              className={cn(
                'w-4 h-4 shrink-0',
                progresso.altaAbertas === 0
                  ? 'text-verde-pipa'
                  : 'text-vermelho-kids'
              )}
            />
            <span className="text-muted-foreground">
              Criticidade alta em aberto:{' '}
              <span className="font-semibold text-foreground">
                {progresso.altaAbertas}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="abertas">
            Em aberto ({pendencias.filter((p) => p.status !== 'concluido').length})
          </TabsTrigger>
          <TabsTrigger value="alta" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Alta ({progresso.altaAbertas})
          </TabsTrigger>
          <TabsTrigger value="concluidas">
            Concluídas ({progresso.concluidas})
          </TabsTrigger>
          <TabsTrigger value="todas">Todas ({progresso.total})</TabsTrigger>
        </TabsList>
      </Tabs>

      {grupos.length === 0 ? (
        <Card className="bg-verde-pipa/10 border-verde-pipa/40">
          <CardContent className="p-8 text-center space-y-2">
            <Check className="w-10 h-10 text-verde-pipa mx-auto" />
            <p className="font-medium text-foreground">
              Nada neste filtro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={CATEGORIA_ORDER}
          className="space-y-3"
        >
          {grupos.map(({ categoria, itens }) => (
            <AccordionItem
              key={categoria}
              value={categoria}
              className="border rounded-xl px-4 bg-card border-border/60"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
                    <ListTodo className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {CATEGORIA_LABELS[categoria]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {itens.length} item(ns)
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-4 space-y-3">
                {itens.map((p) => (
                  <PendenciaCard
                    key={p.id}
                    pendencia={p}
                    salvando={salvandoId === p.id}
                    onStatusChange={(status) => void handleStatus(p.id, status)}
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};

interface PendenciaCardProps {
  pendencia: PendenciaRow;
  salvando: boolean;
  onStatusChange: (status: PendenciaStatus) => void;
}

const PendenciaCard: React.FC<PendenciaCardProps> = ({
  pendencia,
  salvando,
  onStatusChange,
}) => {
  const prazoFormatado = formatPrazo(pendencia.prazo);
  const concluida = pendencia.status === 'concluido';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3 transition-colors',
        concluida
          ? 'border-verde-pipa/50 bg-verde-pipa/5'
          : 'border-border/60 bg-card'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              concluida
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            )}
          >
            {pendencia.titulo}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn('text-xs', CRITICIDADE_CLASSES[pendencia.criticidade])}
            >
              {CRITICIDADE_LABELS[pendencia.criticidade]}
            </Badge>
            {pendencia.responsavel_sugerido && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {pendencia.responsavel_sugerido}
              </Badge>
            )}
            {prazoFormatado && (
              <Badge
                variant="outline"
                className="text-xs border-azul-respira/40 text-azul-respira gap-1"
              >
                <Clock className="w-3 h-3" />
                {prazoFormatado}
              </Badge>
            )}
          </div>

          {pendencia.descricao && (
            <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
              {pendencia.descricao}
            </p>
          )}

          {pendencia.origem && (
            <p className="text-xs text-muted-foreground/70">
              Origem: {pendencia.origem}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_SEQUENCE.map((status) => (
          <StatusButton
            key={status}
            status={status}
            ativo={pendencia.status === status}
            disabled={salvando}
            onClick={() => onStatusChange(status)}
          />
        ))}
      </div>
    </div>
  );
};

interface StatusButtonProps {
  status: PendenciaStatus;
  ativo: boolean;
  disabled: boolean;
  onClick: () => void;
}

const STATUS_META: Record<
  PendenciaStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pendente: { label: 'Pendente', icon: Circle },
  em_andamento: { label: 'Em andamento', icon: Clock },
  concluido: { label: 'Concluído', icon: Check },
};

const StatusButton: React.FC<StatusButtonProps> = ({
  status,
  ativo,
  disabled,
  onClick,
}) => {
  const { label, icon: Icon } = STATUS_META[status];
  return (
    <Button
      type="button"
      variant={ativo ? 'default' : 'outline'}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="gap-1.5 text-xs h-8"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
};

export default PendenciasTab;
