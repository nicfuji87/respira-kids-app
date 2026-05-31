// AI dev note: Dashboard de Análise de Conversas (WhatsApp/Chatwoot).
// Acesso: admin + secretaria (rota protegida + RLS na tabela whatsapp_conversas).
// Estrutura: filtros globais + tabs (Visão Geral / Conversas / Follow-up / Reclamações / Insights).
// As análises são gravadas pelo n8n; aqui lemos e gerenciamos follow-ups.

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import {
  WhatsAppStatCard,
  WhatsAppDistribuicaoBarras,
  WhatsAppDashboardFilters,
  WhatsAppConversasList,
} from '@/components/domain/whatsapp-conversas';
import {
  applyFilters,
  computeInsights,
  computeStats,
  extractCanais,
  fetchWhatsAppConversas,
  updateFollowupStatus,
} from '@/lib/whatsapp-conversas-api';
import type {
  FollowupStatus,
  WhatsAppConversaRow,
  WhatsAppDashboardFilters as Filters,
} from '@/types/whatsapp-conversas';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  RefreshCw,
  ShieldAlert,
  Star,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';

const chartConfig = {
  total: {
    label: 'Conversas',
    color: 'hsl(var(--azul-respira))',
  },
} satisfies ChartConfig;

function formatMinutes(min: number | null): string {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export const WhatsAppConversasDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [allRows, setAllRows] = useState<WhatsAppConversaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWhatsAppConversas();
      setAllRows(data);
    } catch (err) {
      console.error('[WhatsAppConversasDashboard] erro ao carregar:', err);
      setError(
        'Não conseguimos carregar as conversas. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(
    () => applyFilters(allRows, filters),
    [allRows, filters]
  );
  const stats = useMemo(() => computeStats(filteredRows), [filteredRows]);
  const insights = useMemo(() => computeInsights(filteredRows), [filteredRows]);
  const canais = useMemo(() => extractCanais(allRows), [allRows]);

  // Follow-up: pendentes primeiro
  const followupRows = useMemo(() => {
    const arr = filteredRows.filter((r) => r.necessita_followup);
    const order: Record<FollowupStatus, number> = {
      pendente: 0,
      nao_aplicavel: 1,
      ignorado: 2,
      concluido: 3,
    };
    return [...arr].sort(
      (a, b) => order[a.followup_status] - order[b.followup_status]
    );
  }, [filteredRows]);

  const reclamacaoRows = useMemo(
    () => filteredRows.filter((r) => r.reclamacao_identificada),
    [filteredRows]
  );

  const handleFollowupChange = useCallback(
    async (row: WhatsAppConversaRow, status: FollowupStatus) => {
      setBusyId(row.id);
      try {
        await updateFollowupStatus(row.id, status, user?.pessoa?.id);
        setAllRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  followup_status: status,
                  followup_concluido_em:
                    status === 'concluido' ? new Date().toISOString() : null,
                  followup_concluido_por:
                    status === 'concluido' ? user?.pessoa?.id || null : null,
                }
              : r
          )
        );
        toast({
          title: 'Follow-up atualizado',
          description:
            status === 'concluido'
              ? 'Conversa marcada como concluída.'
              : status === 'ignorado'
                ? 'Conversa ignorada.'
                : 'Conversa reaberta.',
        });
      } catch {
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar o follow-up.',
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [toast, user?.pessoa?.id]
  );

  const onConcluir = useCallback(
    (row: WhatsAppConversaRow) => handleFollowupChange(row, 'concluido'),
    [handleFollowupChange]
  );
  const onIgnorar = useCallback(
    (row: WhatsAppConversaRow) => handleFollowupChange(row, 'ignorado'),
    [handleFollowupChange]
  );
  const onReabrir = useCallback(
    (row: WhatsAppConversaRow) => handleFollowupChange(row, 'pendente'),
    [handleFollowupChange]
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <MessagesSquare className="w-7 h-7 text-azul-respira" />
            Análise de Conversas
          </h1>
          <p className="text-muted-foreground mt-1">
            Inteligência sobre os atendimentos do WhatsApp — volume, qualidade,
            follow-ups e alertas.
          </p>
        </div>
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
      </div>

      {/* Erros */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-foreground flex-1">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => void loadData()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <WhatsAppDashboardFilters
        filters={filters}
        onChange={setFilters}
        canaisDisponiveis={canais}
      />

      {/* Loading inicial */}
      {loading && allRows.length === 0 && (
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
      )}

      {/* Sem dados */}
      {!loading && allRows.length === 0 && !error && (
        <Card className="bg-bege-fundo/30 border-azul-respira/20">
          <CardContent className="p-8 text-center space-y-3">
            <Inbox className="w-12 h-12 text-azul-respira mx-auto" />
            <p className="text-base text-foreground font-medium">
              Ainda não há conversas analisadas
            </p>
            <p className="text-sm text-muted-foreground">
              Assim que o fluxo do n8n processar as conversas do WhatsApp, elas
              aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {allRows.length > 0 && (
        <Tabs defaultValue="visao_geral" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="visao_geral" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="conversas" className="gap-2">
              <MessagesSquare className="w-4 h-4" />
              Conversas
              <span className="ml-1 text-xs text-muted-foreground">
                ({filteredRows.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="followup" className="gap-2">
              <ListChecks className="w-4 h-4" />
              Follow-up
              {stats.followupsPendentes > 0 && (
                <span className="ml-1 rounded-full bg-amarelo-pipa/30 text-roxo-titulo text-xs px-1.5">
                  {stats.followupsPendentes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reclamacoes" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              Reclamações
              {stats.reclamacoes > 0 && (
                <span className="ml-1 rounded-full bg-vermelho-kids/20 text-vermelho-kids text-xs px-1.5">
                  {stats.reclamacoes}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Insights
            </TabsTrigger>
          </TabsList>

          {/* ============================ VISÃO GERAL ============================ */}
          <TabsContent value="visao_geral" className="space-y-6">
            {/* KPIs principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <WhatsAppStatCard
                icon={MessagesSquare}
                tone="azul"
                label="Conversas"
                value={stats.totalConversas}
                hint={`${stats.conversasUltimos7Dias} nos últimos 7 dias`}
              />
              <WhatsAppStatCard
                icon={Flame}
                tone="vermelho"
                label="Leads quentes"
                value={stats.leadsQuentes}
                hint={`${insights.leadsQuentesSemAgendamento} sem agendamento`}
              />
              <WhatsAppStatCard
                icon={CalendarCheck}
                tone="verde"
                label="Agendamentos"
                value={stats.agendamentosRealizados}
                hint={`Conversão de leads: ${insights.taxaConversaoLeadAgendamento}%`}
              />
              <WhatsAppStatCard
                icon={ListChecks}
                tone="amarelo"
                label="Follow-ups pendentes"
                value={stats.followupsPendentes}
                hint={`${stats.pendentesAtendente} aguardando atendente`}
              />
            </div>

            {/* KPIs secundários */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <WhatsAppStatCard
                icon={Clock}
                tone="roxo"
                label="1ª resposta (média)"
                value={formatMinutes(stats.tempoMedioPrimeiraResposta)}
                hint="tempo até o atendente responder"
              />
              <WhatsAppStatCard
                icon={AlertTriangle}
                tone="vermelho"
                label="Reclamações"
                value={stats.reclamacoes}
                hint={`${stats.reclamacoesAtencaoAdmin} requerem atenção`}
              />
              <WhatsAppStatCard
                icon={DollarSign}
                tone="verde"
                label="Pagamentos confirmados"
                value={stats.pagamentosConfirmados}
                hint={`${stats.pagamentosSolicitados} cobranças solicitadas`}
              />
              <WhatsAppStatCard
                icon={Stethoscope}
                tone="azul"
                label="Conteúdo clínico"
                value={stats.conteudoClinico}
                hint={`${stats.urgenciaClinicaAlta} com urgência alta`}
              />
            </div>

            {/* Volume por dia */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-azul-respira" />
                  Conversas por dia (últimos 30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ChartContainer
                    config={chartConfig}
                    className="h-full w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.conversasPorDia}
                        margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                      >
                        <XAxis
                          dataKey="data"
                          tickLine={false}
                          axisLine={false}
                          className="text-xs"
                          tickFormatter={(value: string) =>
                            value.slice(8, 10) + '/' + value.slice(5, 7)
                          }
                          minTickGap={16}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                          className="text-xs"
                          width={28}
                        />
                        <Bar
                          dataKey="total"
                          fill="hsl(var(--azul-respira))"
                          radius={[4, 4, 0, 0]}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>

            {/* Distribuições */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WhatsAppDistribuicaoBarras
                title="Motivo do contato"
                subtitle="Intenção principal identificada pela IA"
                items={stats.distribuicaoIntencao}
                barColor="azul"
                maxItems={10}
              />
              <WhatsAppDistribuicaoBarras
                title="Status das conversas"
                items={stats.distribuicaoStatus}
                barColor="roxo"
              />
              <WhatsAppDistribuicaoBarras
                title="Tipo de demanda"
                items={stats.distribuicaoTipoDemanda}
                barColor="verde"
              />
              <WhatsAppDistribuicaoBarras
                title="Sentimento do cliente"
                items={stats.distribuicaoSentimento}
                barColor="amarelo"
              />
              <WhatsAppDistribuicaoBarras
                title="Etapa da jornada"
                items={stats.distribuicaoEtapa}
                barColor="roxo"
              />
              <WhatsAppDistribuicaoBarras
                title="Canal de origem"
                items={stats.distribuicaoCanal}
                barColor="azul"
                emptyLabel="Canal não informado nas conversas"
              />
            </div>
          </TabsContent>

          {/* ============================ CONVERSAS ============================ */}
          <TabsContent value="conversas" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {filteredRows.length} conversa
              {filteredRows.length !== 1 ? 's' : ''} (use os filtros acima para
              refinar).
            </p>
            <WhatsAppConversasList
              rows={filteredRows}
              emptyMessage="Nenhuma conversa corresponde aos filtros."
            />
          </TabsContent>

          {/* ============================ FOLLOW-UP ============================ */}
          <TabsContent value="followup" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <WhatsAppStatCard
                icon={ListChecks}
                tone="amarelo"
                label="Pendentes"
                value={stats.followupsPendentes}
              />
              <WhatsAppStatCard
                icon={Clock}
                tone="roxo"
                label="Aguardando atendente"
                value={stats.pendentesAtendente}
              />
              <WhatsAppStatCard
                icon={CheckCircle2}
                tone="verde"
                label="Concluídos (no filtro)"
                value={
                  followupRows.filter((r) => r.followup_status === 'concluido')
                    .length
                }
              />
            </div>

            {stats.distribuicaoResponsavel.length > 0 && (
              <WhatsAppDistribuicaoBarras
                title="Follow-ups por responsável sugerido"
                items={stats.distribuicaoResponsavel}
                barColor="azul"
              />
            )}

            <WhatsAppConversasList
              rows={followupRows}
              emptyMessage="Nenhum follow-up para os filtros atuais. 🎉"
              busyId={busyId}
              onConcluir={onConcluir}
              onIgnorar={onIgnorar}
              onReabrir={onReabrir}
            />
          </TabsContent>

          {/* ============================ RECLAMAÇÕES ============================ */}
          <TabsContent value="reclamacoes" className="space-y-4">
            <Card className="bg-vermelho-kids/5 border-vermelho-kids/30">
              <CardContent className="p-4 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-vermelho-kids shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Reclamações e insatisfações identificadas
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Conversas marcadas como insatisfação. As que requerem
                    atenção são enviadas automaticamente aos administradores
                    pelo cron.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <WhatsAppStatCard
                icon={AlertTriangle}
                tone="vermelho"
                label="Total de reclamações"
                value={stats.reclamacoes}
              />
              <WhatsAppStatCard
                icon={ShieldAlert}
                tone="vermelho"
                label="Requerem atenção do admin"
                value={stats.reclamacoesAtencaoAdmin}
              />
            </div>

            {insights.topMotivosInsatisfacao.length > 0 && (
              <WhatsAppDistribuicaoBarras
                title="Principais motivos de insatisfação"
                items={insights.topMotivosInsatisfacao}
                barColor="vermelho"
              />
            )}

            <WhatsAppConversasList
              rows={reclamacaoRows}
              emptyMessage="Nenhuma reclamação no período. 🎉"
              busyId={busyId}
              onConcluir={onConcluir}
              onIgnorar={onIgnorar}
              onReabrir={onReabrir}
            />
          </TabsContent>

          {/* ============================ INSIGHTS ============================ */}
          <TabsContent value="insights" className="space-y-6">
            <Card className="bg-bege-fundo/40 border-azul-respira/30">
              <CardContent className="p-4 flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-amarelo-pipa shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Insights estratégicos
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Funil de agendamento, gargalos de atendimento, oportunidades
                    perdidas e sugestões da IA.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Funil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <WhatsAppStatCard
                icon={DollarSign}
                tone="azul"
                label="Perguntaram valor"
                value={insights.funilPerguntouValor}
              />
              <WhatsAppStatCard
                icon={CalendarCheck}
                tone="amarelo"
                label="Perguntaram disponibilidade"
                value={insights.funilPerguntouDisponibilidade}
              />
              <WhatsAppStatCard
                icon={CheckCircle2}
                tone="verde"
                label="Agendaram"
                value={insights.funilAgendou}
                hint={`Conversão: ${insights.taxaConversaoLeadAgendamento}%`}
              />
              <WhatsAppStatCard
                icon={Flame}
                tone="vermelho"
                label="Leads quentes sem resposta"
                value={insights.leadsQuentesSemResposta}
                hint={`${insights.leadsQuentesSemAgendamento} sem agendamento`}
              />
            </div>

            {/* Resolução */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <WhatsAppStatCard
                icon={CheckCircle2}
                tone="verde"
                label="Taxa de resolução"
                value={`${insights.taxaResolucao}%`}
                hint="conversas finalizadas"
              />
              <WhatsAppStatCard
                icon={Clock}
                tone="amarelo"
                label="Pendente atendente"
                value={`${insights.taxaPendenteAtendente}%`}
                hint="aguardando a equipe"
              />
              <WhatsAppStatCard
                icon={Bot}
                tone="roxo"
                label="Excesso de automação"
                value={stats.excessoAutomacao}
                hint="conversas com automação demais"
              />
              <WhatsAppStatCard
                icon={Star}
                tone="amarelo"
                label="Avaliações solicitadas"
                value={stats.avaliacoesGoogle}
                hint={`${stats.pesquisasSatisfacao} pesquisas de satisfação`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WhatsAppDistribuicaoBarras
                title="Principais pontos de atrito"
                subtitle="Onde as conversas travam"
                items={insights.topPontosAtrito}
                barColor="vermelho"
              />
              <WhatsAppDistribuicaoBarras
                title="Sintomas mais mencionados"
                subtitle="Nas conversas com conteúdo clínico"
                items={insights.topSintomas}
                barColor="azul"
                emptyLabel="Nenhum sintoma registrado"
              />
              <WhatsAppDistribuicaoBarras
                title="Resolução por canal"
                subtitle="% de conversas finalizadas por canal"
                items={insights.npsOperacionalPorCanal}
                barColor="verde"
                emptyLabel="Canal não informado"
              />
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-amarelo-pipa" />
                    Sugestões de melhoria (IA)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.sugestoesMelhoria.length === 0 ? (
                    <p className="text-sm text-muted-foreground/80 py-4 text-center">
                      Sem sugestões no período
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {insights.sugestoesMelhoria.map((s, i) => (
                        <li
                          key={i}
                          className="text-sm text-muted-foreground flex items-start gap-2"
                        >
                          <Users className="w-3.5 h-3.5 text-azul-respira shrink-0 mt-1" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
