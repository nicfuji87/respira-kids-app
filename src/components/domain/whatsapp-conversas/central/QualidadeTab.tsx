// AI dev note: aba Qualidade. O atrito (texto livre da IA) vira categoria por
// regra fixa no banco (fn_conversas_categoria_atrito), separando "falha da
// operação" (a clínica errou: cobrança indevida, nota, contrato, link, cadastro,
// mensagem automática) do resto. Sentimento é do último estado de cada conversa,
// por isso é tendência, não contagem exata.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  HeartPulse,
  MessageCircle,
  PauseCircle,
  Repeat,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import {
  chatwootUrl,
  fetchQualidade,
  pct,
  whatsappUrl,
  type Qualidade,
} from '@/lib/conversas-central-api';
import { BarraLinha, Kpi, Legenda, SERIE, Secao, Vazio } from './central-ui';

const PERIODOS = [30, 90, 180] as const;

const MES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const fmtMes = (ym: string) => MES[Number(ym.slice(5, 7)) - 1] ?? ym;

const ASSUNTO: Record<string, string> = {
  botoes: 'Mensagens com botões (confirmação, escolha)',
  cobranca: 'Cobrança e pagamento',
  reajuste: 'Aviso de reajuste',
  contrato: 'Contrato',
  nota_fiscal: 'Nota fiscal',
  agenda: 'Lembrete de consulta',
  cadastro: 'Cadastro realizado',
  pesquisa: 'Pesquisa de experiência',
  documento: 'Documentos (relatório, atestado)',
  outros: 'Outros',
};

const mensalConfig = {
  internas: { label: 'Falha da operação', color: SERIE[2] },
  outras: { label: 'Outros atritos', color: SERIE[1] },
} satisfies ChartConfig;

const sentimentoConfig = {
  negativo: { label: 'Frustradas ou insatisfeitas', color: SERIE[2] },
  preocupado: { label: 'Preocupadas ou ansiosas', color: SERIE[3] },
} satisfies ChartConfig;

export const QualidadeTab: React.FC = () => {
  const [dias, setDias] = useState<number>(90);
  const [dados, setDados] = useState<Qualidade | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchQualidade(dias));
    } catch {
      setErro('Não conseguimos carregar a qualidade. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sentimento = useMemo(
    () =>
      (dados?.sentimento ?? []).map((s) => ({
        semana: s.semana,
        total: s.total,
        negativo: s.total >= 5 ? pct(s.negativo, s.total) : null,
        preocupado: s.total >= 5 ? pct(s.preocupado, s.total) : null,
      })),
    [dados]
  );

  if (carregando && !dados) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (erro || !dados) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = dados.kpis;
  const cats = dados.categorias;
  const maxCat = Math.max(1, ...cats.map((c) => c.familias));
  const internas = cats.filter((c) => c.interna);
  const topInterna = internas[0];
  const auto = dados.automacao;
  const assuntos = auto.por_assunto ?? [];
  const maxAssunto = Math.max(1, ...assuntos.map((a) => a.total));

  return (
    <div
      className={cn('space-y-5', carregando && 'opacity-60 transition-opacity')}
    >
      <div className="flex gap-1.5" role="tablist" aria-label="Período">
        {PERIODOS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={dias === p ? 'default' : 'outline'}
            onClick={() => setDias(p)}
          >
            {p} dias
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Wrench}
          label="Famílias afetadas por falha nossa"
          value={k.familias_falha_interna}
          hint={`${pct(k.familias_falha_interna, k.conversas_analisadas)}% das ${k.conversas_analisadas} conversas do período`}
          destaque={k.familias_falha_interna > 0 ? 'atencao' : undefined}
        />
        <Kpi
          icon={Repeat}
          label="Afetadas mais de uma vez"
          value={k.familias_repetidas}
          hint="duas ou mais falhas da operação na mesma conversa"
        />
        <Kpi
          icon={AlertTriangle}
          label="Reclamações"
          value={k.reclamacoes}
          hint={`${k.reclamacoes_falha_interna} com falha da operação como causa`}
        />
        <Kpi
          icon={PauseCircle}
          label="Cobranças pausadas para conferência"
          value={dados.pausas.criadas}
          hint={
            dados.pausas.horas_ate_resolver != null
              ? `resolvidas em ${dados.pausas.horas_ate_resolver.toLocaleString('pt-BR')} h (mediana) · ${dados.pausas.abertas} abertas`
              : `${dados.pausas.abertas} abertas`
          }
        />
      </div>

      {topInterna && (
        <Card className="border-vermelho-kids/40 bg-vermelho-kids/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert
              className="h-5 w-5 text-vermelho-kids shrink-0 mt-0.5"
              aria-hidden
            />
            <p className="text-sm">
              <strong>{topInterna.label}</strong> é a falha da operação que mais
              aparece: {topInterna.familias} famílias no período
              {topInterna.reclamacoes > 0
                ? `, ${topInterna.reclamacoes} delas reclamaram`
                : ''}
              .
              {k.reclamacoes > 0 &&
                ` ${pct(k.reclamacoes_falha_interna, k.reclamacoes)}% das reclamações têm uma falha nossa como causa.`}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Secao
          className="xl:col-span-3"
          icon={Wrench}
          titulo="Onde as conversas travam"
          subtitulo="Famílias com cada tipo de atrito no período. Passe o mouse para ver um exemplo real."
        >
          {cats.length === 0 ? (
            <Vazio texto="Nenhum atrito identificado no período." />
          ) : (
            <div className="space-y-3">
              <Legenda
                itens={[
                  { label: 'Falha da operação', cor: SERIE[2] },
                  { label: 'Outros atritos', cor: SERIE[1] },
                ]}
              />
              <div className="space-y-2">
                {cats.map((c) => (
                  <BarraLinha
                    key={c.categoria}
                    label={c.label}
                    valor={c.familias}
                    max={maxCat}
                    cor={c.interna ? SERIE[2] : SERIE[1]}
                    titulo={c.exemplo ? `Exemplo: ${c.exemplo}` : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </Secao>
        <Secao
          className="xl:col-span-2"
          icon={AlertTriangle}
          titulo="Mês a mês"
          subtitulo="Conversas com atrito, pela data da última mensagem."
        >
          <div className="space-y-3">
            <Legenda
              itens={[
                { label: 'Falha da operação', cor: SERIE[2] },
                { label: 'Outros atritos', cor: SERIE[1] },
              ]}
            />
            <ChartContainer config={mensalConfig} className="h-[240px] w-full">
              <BarChart
                data={dados.mensal}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeOpacity={0.4} />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtMes}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                  className="text-xs"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => fmtMes(String(v))}
                    />
                  }
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="internas"
                  stackId="m"
                  fill="var(--color-internas)"
                  stroke="hsl(var(--card))"
                  strokeWidth={1}
                  maxBarSize={24}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="outras"
                  stackId="m"
                  fill="var(--color-outras)"
                  stroke="hsl(var(--card))"
                  strokeWidth={1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </Secao>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Secao
          icon={Bot}
          titulo="O que a automação manda"
          subtitulo={`Últimos ${auto.janela_dias} dias, sem contar números da equipe e de teste.`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {auto.mensagens.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-muted-foreground">
                  mensagens automáticas para {auto.familias} famílias
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {auto.mediana_por_familia_semana ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  por família na semana (mediana)
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {auto.familias_5mais_semana}
                </p>
                <p className="text-xs text-muted-foreground">
                  famílias receberam 5 ou mais numa semana
                </p>
              </div>
            </div>
            {assuntos.length === 0 ? (
              <Vazio texto="Sem mensagens automáticas no período." />
            ) : (
              <div className="space-y-2">
                {assuntos.map((a) => (
                  <BarraLinha
                    key={a.assunto}
                    label={ASSUNTO[a.assunto] ?? a.assunto}
                    valor={a.total}
                    max={maxAssunto}
                    cor={SERIE[4]}
                  />
                ))}
              </div>
            )}
            {(auto.mais_recebem ?? []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Quem mais recebeu nos últimos 7 dias
                </p>
                <ul className="text-sm space-y-0.5">
                  {(auto.mais_recebem ?? []).map((m, i) => (
                    <li
                      key={`${m.nome}-${i}`}
                      className="flex justify-between gap-2"
                    >
                      <span className="truncate">{m.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {m.n} mensagens
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Secao>
        <Secao
          icon={HeartPulse}
          titulo="Como as famílias se sentem"
          subtitulo="Percentual das conversas da semana. Semanas com menos de 5 conversas ficam de fora."
        >
          <div className="space-y-3">
            <Legenda
              itens={[
                { label: 'Frustradas ou insatisfeitas', cor: SERIE[2] },
                { label: 'Preocupadas ou ansiosas', cor: SERIE[3] },
              ]}
            />
            <ChartContainer
              config={sentimentoConfig}
              className="h-[240px] w-full"
            >
              <LineChart
                data={sentimento}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeOpacity={0.4} />
                <XAxis
                  dataKey="semana"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) =>
                    `${v.slice(8, 10)}/${v.slice(5, 7)}`
                  }
                  minTickGap={16}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v: number) => `${v}%`}
                  className="text-xs"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) =>
                        `Semana de ${String(v).slice(8, 10)}/${String(v).slice(5, 7)}`
                      }
                    />
                  }
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="negativo"
                  stroke="var(--color-negativo)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="preocupado"
                  stroke="var(--color-preocupado)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          </div>
        </Secao>
      </div>

      <Secao
        icon={MessageCircle}
        titulo="Reclamações recentes"
        subtitulo="Com a causa identificada. Falha da operação aparece destacada."
      >
        {dados.reclamacoes_recentes.length === 0 ? (
          <Vazio texto="Nenhuma reclamação no período." />
        ) : (
          <ul className="divide-y divide-border/60">
            {dados.reclamacoes_recentes.map((r) => {
              const wa = whatsappUrl(r.telefone);
              const cw = chatwootUrl(r.chatwoot_id);
              return (
                <li key={r.id} className="py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {r.nome}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ·{' '}
                        {new Date(r.ult).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                        {r.nivel && r.nivel !== 'nenhum'
                          ? ` · insatisfação ${r.nivel}`
                          : ''}
                        {['concluido', 'resolvido_sistema'].includes(
                          r.followup_status
                        )
                          ? ' · tratada'
                          : ''}
                      </span>
                    </p>
                    <div className="flex gap-1.5">
                      {wa && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1"
                          asChild
                        >
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        </Button>
                      )}
                      {cw && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1"
                          asChild
                        >
                          <a
                            href={cw}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Chatwoot
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.motivo && (
                    <p className="text-sm text-foreground/90">{r.motivo}</p>
                  )}
                  {(r.categorias ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(r.categorias ?? []).map((c) => (
                        <Badge
                          key={c.categoria}
                          variant="outline"
                          className={cn(
                            'text-xs',
                            c.interna &&
                              'border-vermelho-kids/50 bg-vermelho-kids/10'
                          )}
                        >
                          {c.interna ? 'Falha nossa: ' : ''}
                          {c.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </div>
  );
};
