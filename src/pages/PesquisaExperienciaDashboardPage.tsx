// AI dev note: Dashboard administrativo da Pesquisa de Experiência (apenas admin).
// Mostra métricas-chave: total de respostas, NPS, confiança média, distribuições
// por pergunta (single/multi choice) e comentários abertos.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  PesquisaStatCard,
  PesquisaNPSCard,
  PesquisaDistribuicaoBarras,
  PesquisaComentariosList,
} from '@/components/domain/pesquisa-experiencia';
import {
  computePesquisaStats,
  fetchPesquisasExperiencia,
} from '@/lib/pesquisa-experiencia-api';
import type {
  PesquisaExperienciaRow,
  PesquisaExperienciaStats,
} from '@/types/pesquisa-experiencia';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Copy,
  ExternalLink,
  Heart,
  Inbox,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function buildPublicSurveyUrl(): string {
  const origin = window.location.origin;
  // App usa HashRouter — rota pública: /#/experiencia
  return `${origin}/#/experiencia`;
}

export const PesquisaExperienciaDashboardPage: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PesquisaExperienciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPesquisasExperiencia();
      setRows(data);
    } catch (err) {
      console.error('[PesquisaDashboard] erro ao carregar:', err);
      setError(
        'Não conseguimos carregar as respostas. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats: PesquisaExperienciaStats | null = useMemo(
    () => (rows.length >= 0 ? computePesquisaStats(rows) : null),
    [rows]
  );

  const surveyUrl = useMemo(() => buildPublicSurveyUrl(), []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(surveyUrl);
      toast({
        title: 'Link copiado!',
        description: 'Cole onde quiser compartilhar a pesquisa.',
      });
    } catch {
      toast({
        title: 'Não consegui copiar',
        description: 'Tente novamente ou copie manualmente.',
        variant: 'destructive',
      });
    }
  }, [surveyUrl, toast]);

  const handleOpenSurvey = useCallback(() => {
    window.open(surveyUrl, '_blank', 'noopener,noreferrer');
  }, [surveyUrl]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Pesquisa de Experiência
          </h1>
          <p className="text-muted-foreground mt-1">
            Insights e percepções das famílias Respira Kids — respostas
            anônimas.
          </p>
        </div>
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
          <Button size="sm" onClick={handleOpenSurvey} className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Abrir pesquisa
          </Button>
        </div>
      </div>

      {/* Card do link público */}
      <Card className="bg-azul-respira/5 border-azul-respira/30">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium mb-1">
              Link público da pesquisa
            </p>
            <p className="text-sm font-mono text-foreground truncate">
              {surveyUrl}
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

      {/* Erros */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-foreground">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadData()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {stats && (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PesquisaStatCard
              icon={Inbox}
              tone="azul"
              label="Total de respostas"
              value={stats.totalRespostas}
              hint={`${stats.respostasUltimos30Dias} nos últimos 30 dias`}
            />
            <PesquisaStatCard
              icon={TrendingUp}
              tone="verde"
              label="NPS"
              value={stats.nps.total > 0 ? stats.nps.nps : '—'}
              hint={`${stats.nps.total} respondentes`}
            />
            <PesquisaStatCard
              icon={ShieldCheck}
              tone="roxo"
              label="Confiança média"
              value={
                stats.notaConfiancaMedia !== null
                  ? `${formatNumber(stats.notaConfiancaMedia)}/10`
                  : '—'
              }
              hint="Nota de 1 a 10"
            />
            <PesquisaStatCard
              icon={Activity}
              tone="amarelo"
              label="Últimos 7 dias"
              value={stats.respostasUltimos7Dias}
              hint="novas respostas"
            />
          </div>

          {/* NPS detalhado + Confiança */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <PesquisaNPSCard nps={stats.nps} />
            </div>
            <DistribuicaoNotasCard
              title="Confiança na equipe"
              subtitle="De 1 a 10"
              distribuicao={stats.distribuicaoConfianca}
              total={stats.totalRespostas}
              media={stats.notaConfiancaMedia}
            />
          </div>

          {/* Distribuição NPS detalhada */}
          <DistribuicaoNotasCard
            title="Chance de indicar (NPS)"
            subtitle="Distribuição das notas 1-10"
            distribuicao={stats.distribuicaoIndicacao}
            total={stats.nps.total}
            media={stats.notaIndicacaoMedia}
            highlightNps
          />

          {/* Jornada */}
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-azul-respira" />
              Jornada das famílias
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PesquisaDistribuicaoBarras
                title="Como conheceu a Respira Kids"
                items={stats.distribuicaoComoConheceu}
                barColor="azul"
              />
              <PesquisaDistribuicaoBarras
                title="Motivo principal da busca"
                items={stats.distribuicaoMotivoPrincipal}
                barColor="roxo"
              />
              <PesquisaDistribuicaoBarras
                title="Tempo de acompanhamento"
                items={stats.distribuicaoTempoAcompanhamento}
                barColor="verde"
              />
              <PesquisaDistribuicaoBarras
                title="Idade do filho atendido"
                items={stats.distribuicaoIdadeFilho}
                barColor="amarelo"
              />
            </div>
          </section>

          {/* Demografia */}
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-azul-respira" />
              Perfil das mães
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PesquisaDistribuicaoBarras
                title="Faixa etária"
                items={stats.distribuicaoFaixaEtaria}
                barColor="azul"
              />
              <PesquisaDistribuicaoBarras
                title="Conteúdo nas redes sociais"
                items={stats.distribuicaoConteudoRedes}
                barColor="verde"
              />
            </div>
          </section>

          {/* Percepção / Marca */}
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
              <Heart className="w-5 h-5 text-vermelho-kids" />
              Percepção da marca
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PesquisaDistribuicaoBarras
                title="Como a Respira Kids faz se sentir"
                subtitle="Múltipla escolha"
                items={stats.distribuicaoComoSeSente}
                barColor="verde"
              />
              <PesquisaDistribuicaoBarras
                title="O que mais gerou confiança"
                subtitle="Até 2 por respondente"
                items={stats.distribuicaoMotivosConfianca}
                barColor="azul"
              />
              <PesquisaDistribuicaoBarras
                title="Como definiria a Respira Kids"
                subtitle="Até 3 por respondente"
                items={stats.distribuicaoComoDefiniria}
                barColor="roxo"
              />
              <PesquisaDistribuicaoBarras
                title="Se fosse uma pessoa, seria…"
                subtitle="Até 3 por respondente"
                items={stats.distribuicaoSeFossePessoa}
                barColor="amarelo"
              />
              <PesquisaDistribuicaoBarras
                title="O ambiente transmite"
                subtitle="Múltipla escolha"
                items={stats.distribuicaoAmbienteTransmite}
                barColor="verde"
              />
              <PesquisaDistribuicaoBarras
                title="Como vê a Respira Kids hoje"
                items={stats.distribuicaoHojeVeComo}
                barColor="roxo"
              />
            </div>
          </section>

          {/* Comentários abertos */}
          <section className="space-y-3">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Vozes das famílias
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PesquisaComentariosList
                rows={rows}
                field="o_que_mais_ama"
                title="O que mais amam"
                accent="verde"
              />
              <PesquisaComentariosList
                rows={rows}
                field="o_que_melhorar"
                title="Sugestões de melhoria"
                accent="amarelo"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
};

// =====================================================
// Subcomponente local: distribuição de notas 1-10
// =====================================================

interface DistribuicaoNotasCardProps {
  title: string;
  subtitle?: string;
  distribuicao: number[];
  total: number;
  media: number | null;
  highlightNps?: boolean;
}

const DistribuicaoNotasCard = React.memo<DistribuicaoNotasCardProps>(
  ({ title, subtitle, distribuicao, total, media, highlightNps }) => {
    const max = Math.max(1, ...distribuicao);
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-semibold">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1.5 h-32">
            {distribuicao.map((count, i) => {
              const n = i + 1;
              const heightPct = (count / max) * 100;
              const isPromotor = highlightNps && n >= 9;
              const isDetrator = highlightNps && n <= 6;
              const isNeutro = highlightNps && n >= 7 && n <= 8;

              const colorClass = highlightNps
                ? isPromotor
                  ? 'bg-verde-pipa'
                  : isNeutro
                    ? 'bg-amarelo-pipa'
                    : isDetrator
                      ? 'bg-vermelho-kids/70'
                      : 'bg-muted'
                : n >= 9
                  ? 'bg-verde-pipa'
                  : n >= 7
                    ? 'bg-azul-respira'
                    : 'bg-azul-respira/60';

              return (
                <div
                  key={n}
                  className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                >
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {count > 0 ? count : ''}
                  </span>
                  <div className="w-full bg-muted/40 rounded-md overflow-hidden flex-1 flex items-end">
                    <div
                      className={cn(
                        'w-full rounded-md transition-all duration-500',
                        colorClass
                      )}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-medium">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>{total} respondentes</span>
            <span>
              Média:{' '}
              <span className="font-semibold text-foreground">
                {media !== null ? media.toFixed(1) : '—'}
              </span>
              /10
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }
);

DistribuicaoNotasCard.displayName = 'DistribuicaoNotasCard';
