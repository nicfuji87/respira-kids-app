// AI dev note: Painel interno do Processo Seletivo (admin + secretaria).
// Lista de candidaturas + KPIs + filtro por status. Clicar abre o detalhe com
// a correção do situacional, textos escritos, estilo e o formulário de avaliação.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/primitives/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Copy,
  ExternalLink,
  Inbox,
  RefreshCw,
  Users,
  ClipboardCheck,
  ChevronRight,
  Clock,
  Wallet,
} from 'lucide-react';
import {
  StatusBadge,
  RecomendacaoBadge,
  EstagioCandidatoDetail,
  PontoEletronicoTab,
  ValeTransportePainel,
} from '@/components/domain/processo-seletivo';
import {
  computeStats,
  fetchCandidaturas,
  getRecomendacao,
} from '@/lib/processo-seletivo-api';
import { STATUS_LABELS } from '@/lib/processo-seletivo-questions';
import type {
  CandidaturaEstagioRow,
  StatusCandidatura,
} from '@/types/processo-seletivo';
import type { LucideIcon } from 'lucide-react';

function buildPublicUrl(): string {
  return `${window.location.origin}/#/vaga-estagio`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return iso;
  }
}

type FilterStatus = 'todos' | StatusCandidatura;

export const ProcessoSeletivoDashboardPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const avaliadorId = user?.pessoa?.id ?? null;

  const [rows, setRows] = useState<CandidaturaEstagioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('todos');
  const [selected, setSelected] = useState<CandidaturaEstagioRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'ponto' | 'vt' | 'candidaturas'>(
    'ponto'
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandidaturas();
      setRows(data);
    } catch (err) {
      console.error('[ProcessoSeletivoDashboard] erro ao carregar:', err);
      setError(
        'Não conseguimos carregar as candidaturas. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => computeStats(rows), [rows]);

  const filteredRows = useMemo(() => {
    if (filter === 'todos') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const publicUrl = useMemo(() => buildPublicUrl(), []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({
        title: 'Link copiado!',
        description: 'Cole onde quiser divulgar a vaga.',
      });
    } catch {
      toast({
        title: 'Não consegui copiar',
        description: 'Copie manualmente o link exibido.',
        variant: 'destructive',
      });
    }
  }, [publicUrl, toast]);

  const handleOpenRow = useCallback((row: CandidaturaEstagioRow) => {
    setSelected(row);
    setDetailOpen(true);
  }, []);

  const handleSaved = useCallback((updated: CandidaturaEstagioRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(updated);
  }, []);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Estagiários
          </h1>
          <p className="text-muted-foreground mt-1">
            Ponto eletrônico, vale-transporte e candidaturas dos estagiários.
          </p>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as 'ponto' | 'vt' | 'candidaturas')}
      >
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="ponto" className="gap-2">
            <Clock className="w-4 h-4" />
            Ponto eletrônico
          </TabsTrigger>
          <TabsTrigger value="vt" className="gap-2">
            <Wallet className="w-4 h-4" />
            Vale-transporte
          </TabsTrigger>
          <TabsTrigger value="candidaturas" className="gap-2">
            <Users className="w-4 h-4" />
            Candidaturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ponto" className="mt-4">
          <PontoEletronicoTab />
        </TabsContent>

        <TabsContent value="vt" className="mt-4">
          <ValeTransportePainel />
        </TabsContent>

        <TabsContent value="candidaturas" className="space-y-6 mt-4">
          {/* Ações da candidatura */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              Copiar link
            </Button>
            <Button
              size="sm"
              onClick={() =>
                window.open(publicUrl, '_blank', 'noopener,noreferrer')
              }
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir teste
            </Button>
          </div>

          {/* Card do link público */}
          <Card className="bg-azul-respira/5 border-azul-respira/30">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium mb-1">
                  Link público do teste
                </p>
                <p className="text-sm font-mono text-foreground truncate">
                  {publicUrl}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLink}
                className="shrink-0 gap-2"
              >
                <Copy className="w-4 h-4" />
                Copiar
              </Button>
            </CardContent>
          </Card>

          {error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <p className="flex-1 text-sm text-foreground">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadData()}
                >
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          )}

          {/* KPIs */}
          {loading && rows.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            rows.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Users}
                  tone="azul"
                  label="Candidaturas"
                  value={stats.total}
                />
                <StatCard
                  icon={Inbox}
                  tone="amarelo"
                  label="A avaliar"
                  value={stats.aAvaliar}
                />
                <StatCard
                  icon={ClipboardCheck}
                  tone="roxo"
                  label="Em entrevista"
                  value={stats.entrevista}
                />
                <StatCard
                  icon={Award}
                  tone="verde"
                  label="Média situacional"
                  value={
                    stats.mediaPontuacao !== null
                      ? `${stats.mediaPontuacao}/${stats.pontuacaoMaxima}`
                      : '—'
                  }
                />
              </div>
            )
          )}

          {/* Alerta de respostas de risco */}
          {stats.comRespostaPerigosa > 0 && (
            <Card className="border-vermelho-kids/40 bg-vermelho-kids/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-vermelho-kids shrink-0" />
                <p className="text-sm text-foreground">
                  <span className="font-semibold">
                    {stats.comRespostaPerigosa}
                  </span>{' '}
                  candidatura(s) com resposta de risco em segurança — destacadas
                  na lista.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!loading && rows.length === 0 && (
            <Card className="bg-bege-fundo/30 border-azul-respira/20">
              <CardContent className="p-8 text-center space-y-3">
                <Inbox className="w-12 h-12 text-azul-respira mx-auto" />
                <p className="text-base text-foreground font-medium">
                  Ainda não há candidaturas
                </p>
                <p className="text-sm text-muted-foreground">
                  Compartilhe o link público para começar a receber inscrições.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Filtro + lista */}
          {rows.length > 0 && (
            <div className="space-y-4">
              <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as FilterStatus)}
              >
                <TabsList className="flex flex-wrap h-auto">
                  <TabsTrigger value="todos">Todos ({rows.length})</TabsTrigger>
                  {(
                    [
                      'a_avaliar',
                      'entrevista',
                      'aprovado',
                      'descartado',
                    ] as StatusCandidatura[]
                  ).map((s) => {
                    const count = rows.filter((r) => r.status === s).length;
                    return (
                      <TabsTrigger key={s} value={s}>
                        {STATUS_LABELS[s]} ({count})
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              {filteredRows.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Nenhuma candidatura neste status.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filteredRows.map((row) => {
                    const recomendacao = getRecomendacao(row);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => handleOpenRow(row)}
                        className={cn(
                          'w-full text-left rounded-xl border bg-card p-4 transition-all',
                          'hover:border-azul-respira/50 hover:shadow-md',
                          'flex items-center gap-4',
                          row.tem_resposta_perigosa &&
                            row.status === 'a_avaliar'
                            ? 'border-vermelho-kids/40'
                            : 'border-border/60'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {row.nome}
                            </span>
                            <StatusBadge status={row.status} />
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {[row.curso, row.instituicao]
                              .filter(Boolean)
                              .join(' · ') || row.email}
                            <span className="text-muted-foreground/60">
                              {' '}
                              · {formatDate(row.created_at)}
                            </span>
                          </p>
                        </div>

                        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                          <span className="text-sm font-bold text-foreground">
                            {row.pontuacao_situacional}/{row.pontuacao_maxima}
                          </span>
                          <RecomendacaoBadge recomendacao={recomendacao} />
                        </div>

                        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <EstagioCandidatoDetail
        row={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        avaliadorId={avaliadorId}
        onSaved={handleSaved}
      />
    </div>
  );
};

// =====================================================
// Subcomponente local: card de métrica
// =====================================================

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: 'azul' | 'verde' | 'amarelo' | 'roxo';
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  azul: 'bg-azul-respira/15 text-azul-respira',
  verde: 'bg-verde-pipa/30 text-roxo-titulo',
  amarelo: 'bg-amarelo-pipa/25 text-roxo-titulo',
  roxo: 'bg-roxo-titulo/10 text-roxo-titulo',
};

const StatCard = React.memo<StatCardProps>(
  ({ icon: Icon, label, value, tone }) => (
    <Card className="overflow-hidden">
      <CardContent className="p-5 flex items-start gap-4">
        <div
          className={cn(
            'shrink-0 rounded-xl p-3 flex items-center justify-center',
            TONE_CLASSES[tone]
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
            {label}
          </p>
          <p className="text-2xl md:text-3xl font-bold text-foreground mt-0.5 leading-tight truncate">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
);
StatCard.displayName = 'StatCard';

export default ProcessoSeletivoDashboardPage;
