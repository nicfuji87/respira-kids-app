// AI dev note: aba Desempenho. Atendimento medido por MENSAGEM (ju_mensagens,
// que só existe desde 16/10/2026): tempo de resposta em mediana E pior 10%
// (a média escondia tudo: 44 h de "média" com 6 min de mediana). Funil com a
// agenda real, não com a opinião da IA. Comparação com o período anterior só
// aparece quando há histórico para isso (historico_limitado).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Bot,
  Clock,
  Filter,
  Hourglass,
  Info,
  MessageSquareReply,
  MessagesSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
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
  fetchDesempenho,
  fmtMinutos,
  pct,
  type Desempenho,
} from '@/lib/conversas-central-api';
import { INTENCAO_LABELS } from '@/lib/whatsapp-conversas-api';
import {
  BarraLinha,
  DeltaBadge,
  Kpi,
  Legenda,
  SERIE,
  Secao,
  Vazio,
} from './central-ui';

const PERIODOS = [7, 30, 90] as const;
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HORAS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h às 22h

const volumeConfig = {
  familia: { label: 'Famílias', color: SERIE[1] },
  equipe: { label: 'Equipe', color: SERIE[2] },
  ju: { label: 'Ju', color: SERIE[3] },
  automacao: { label: 'Automáticas', color: SERIE[4] },
} satisfies ChartConfig;

const faixasConfig = {
  expediente: { label: 'No expediente', color: SERIE[1] },
  fora: { label: 'Fora do expediente', color: SERIE[2] },
} satisfies ChartConfig;

const TIPO_PEDIDO: Record<string, string> = {
  AGENDAMENTO: 'Agendamento',
  REMARCACAO: 'Remarcação',
  CANCELAMENTO: 'Cancelamento',
  FINANCEIRO: 'Financeiro',
  NOTA_FISCAL: 'Nota fiscal',
  CLINICO: 'Dúvida clínica',
  CONTRATO: 'Contrato',
  RECLAMACAO: 'Reclamação',
  HUMANO: 'Quer falar com alguém',
  CADASTRO: 'Cadastro',
  EXTERNO: 'Não é família',
  OUTRO: 'Outro',
};

const ACAO_JU: Record<string, string> = {
  REENVIO_CONTRATO: 'Reenviou contrato',
  CORRIGIR_CONTATO_CONTRATO: 'Corrigiu contato do contrato',
  NF_EMITIR: 'Emitiu nota fiscal',
  RENOVAR_LINK: 'Renovou link de pagamento',
  ATESTADO: 'Gerou atestado',
  CANCELAR_CONSULTA: 'Cancelou consulta',
  SUSPENDER_COBRANCA: 'Pausou cobrança para conferência',
};

const FAIXA_CURTA: Record<number, string> = {
  1: 'até 5 min',
  2: '5–15 min',
  3: '15–60 min',
  4: '1–4 h',
  5: '4–24 h',
  6: '+24 h',
  7: 'sem resp.',
};

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const DesempenhoTab: React.FC = () => {
  const [dias, setDias] = useState<number>(30);
  const [dados, setDados] = useState<Desempenho | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchDesempenho(dias));
    } catch {
      setErro('Não conseguimos carregar o desempenho. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !dados) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
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

  const a = dados.kpis.atual;
  const ant = dados.historico_limitado ? undefined : dados.kpis.anterior;
  const desde = new Date(dados.mensagens_desde).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <div
      className={cn('space-y-5', carregando && 'opacity-60 transition-opacity')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {dados.historico_limitado && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" aria-hidden />
            Tempo de resposta e volume por mensagem existem desde {desde}.
          </p>
        )}
      </div>

      <SemanaCard semana={dados.semana} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Users}
          label="Famílias que escreveram"
          value={a.familias.toLocaleString('pt-BR')}
          hint={`${a.pedidos.toLocaleString('pt-BR')} pedidos · ${a.fora_expediente ?? 0}% fora do expediente`}
          delta={
            ant
              ? { atual: a.familias, anterior: ant.familias, melhor: 'maior' }
              : undefined
          }
        />
        <Kpi
          icon={Clock}
          label="Resposta típica"
          value={fmtMinutos(a.mediana_min)}
          hint={`metade é respondida em até isso · pior 10%: ${fmtMinutos(a.p90_min)}`}
          delta={
            ant
              ? {
                  atual: a.mediana_min,
                  anterior: ant.mediana_min,
                  melhor: 'menor',
                  formatar: fmtMinutos,
                }
              : undefined
          }
        />
        <Kpi
          icon={MessageSquareReply}
          label="Respondidos em até 15 min"
          value={`${a.pct_15min ?? 0}%`}
          hint={`${a.pct_1h ?? 0}% em até 1 h · ${a.repetiram} famílias precisaram insistir`}
          delta={
            ant
              ? {
                  atual: a.pct_15min,
                  anterior: ant.pct_15min,
                  melhor: 'maior',
                  formatar: (v) => `${v}%`,
                }
              : undefined
          }
        />
        <Kpi
          icon={Hourglass}
          label="Pedidos sem resposta"
          value={a.sem_resposta}
          hint={`${a.pct_ju ?? 0}% das respostas foram da Ju`}
          destaque={a.sem_resposta > 0 ? 'atencao' : undefined}
          delta={
            ant
              ? {
                  atual: a.sem_resposta,
                  anterior: ant.sem_resposta,
                  melhor: 'menor',
                }
              : undefined
          }
        />
      </div>

      <Secao
        icon={MessagesSquare}
        titulo="Quem conversa com as famílias"
        subtitulo="Mensagens por dia. Mostra o peso da Ju e das mensagens automáticas no atendimento."
      >
        <VolumeChart dados={dados} />
      </Secao>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Secao
          icon={Clock}
          titulo="Quando as famílias escrevem"
          subtitulo="Pedidos por dia da semana e hora. Passe o mouse para ver o tempo típico de resposta em cada horário."
        >
          <MapaCalor calor={dados.calor} />
        </Secao>
        <Secao
          icon={Hourglass}
          titulo="Quanto as famílias esperam"
          subtitulo={`Expediente: mediana de ${fmtMinutos(a.mediana_expediente_min)} · fora dele: ${fmtMinutos(a.mediana_fora_min)}`}
        >
          <FaixasChart dados={dados} />
        </Secao>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Secao
          icon={Filter}
          titulo="Do primeiro contato ao retorno"
          subtitulo={`Contatos novos que começaram a conversar nos últimos ${dados.periodo_dias} dias, cruzados com a agenda.`}
        >
          <Funil funil={dados.funil} />
        </Secao>
        <Secao
          icon={Bot}
          titulo="O que a Ju fez"
          subtitulo={`Últimos ${dados.periodo_dias} dias${dados.historico_limitado ? ` (desde ${desde})` : ''}`}
        >
          <JuPainel dados={dados} />
        </Secao>
      </div>

      <Secao
        icon={TrendingUp}
        titulo="Por que as famílias procuram a clínica"
        subtitulo="Motivo principal das conversas com mensagem no período, segundo a análise das conversas."
      >
        <Motivos motivos={dados.motivos} />
      </Secao>
    </div>
  );
};

function SemanaCard({ semana: s }: { semana: Desempenho['semana'] }) {
  const linhas: Array<{
    label: string;
    valor: string;
    delta?: Parameters<typeof DeltaBadge>[0]['delta'];
  }> = [
    {
      label: 'Famílias que escreveram',
      valor: s.familias.toLocaleString('pt-BR'),
      delta: { atual: s.familias, anterior: s.familias_ant, melhor: 'maior' },
    },
    {
      label: 'Resposta típica (mediana)',
      valor: fmtMinutos(s.mediana_min),
      delta: {
        atual: s.mediana_min,
        anterior: s.mediana_min_ant,
        melhor: 'menor',
        formatar: fmtMinutos,
      },
    },
    {
      label: 'Pior 10% esperou',
      valor: fmtMinutos(s.p90_min),
      delta: {
        atual: s.p90_min,
        anterior: s.p90_min_ant,
        melhor: 'menor',
        formatar: fmtMinutos,
      },
    },
    {
      label: 'Pedidos sem resposta',
      valor: String(s.sem_resposta),
      delta: {
        atual: s.sem_resposta,
        anterior: s.sem_resposta_ant,
        melhor: 'menor',
      },
    },
    {
      label: 'Reclamações',
      valor: String(s.reclamacoes),
      delta: {
        atual: s.reclamacoes,
        anterior: s.reclamacoes_ant,
        melhor: 'menor',
      },
    },
    {
      label: 'Cobranças pausadas para conferência',
      valor: String(s.cobrancas_pausadas),
      delta: {
        atual: s.cobrancas_pausadas,
        anterior: s.cobrancas_pausadas_ant,
        melhor: 'menor',
      },
    },
    {
      label: 'Agendamentos recuperados pelo painel',
      valor: String(s.recuperados),
    },
  ];

  return (
    <Secao
      icon={TrendingUp}
      titulo="O que mudou nesta semana"
      subtitulo="Últimos 7 dias comparados aos 7 anteriores. Todos os números saem das mensagens e do sistema."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        {linhas.map((l) => (
          <div
            key={l.label}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-0"
          >
            <span className="text-sm text-muted-foreground">{l.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{l.valor}</span>
              {l.delta && <DeltaBadge delta={l.delta} />}
            </span>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 md:col-span-2">
          <span className="text-sm text-muted-foreground">
            Principal atrito da semana
          </span>
          <span className="font-semibold">
            {s.principal_atrito
              ? `${s.principal_atrito} (${s.principal_atrito_familias} famílias)`
              : 'nenhum identificado'}
          </span>
        </div>
      </div>
    </Secao>
  );
}

function VolumeChart({ dados }: { dados: Desempenho }) {
  // Antes de 16/10/2026 não há mensagens gravadas: não desenhar dias vazios.
  const inicio = dados.mensagens_desde.slice(0, 10);
  const volume = dados.volume.filter((d) => d.dia >= inicio);
  const total = volume.reduce(
    (acc, d) => ({
      familia: acc.familia + d.familia,
      equipe: acc.equipe + d.equipe,
      ju: acc.ju + d.ju,
      automacao: acc.automacao + d.automacao,
    }),
    { familia: 0, equipe: 0, ju: 0, automacao: 0 }
  );
  const enviadas = total.equipe + total.ju + total.automacao;
  if (total.familia + enviadas === 0)
    return <Vazio texto="Sem mensagens no período." />;
  return (
    <div className="space-y-3">
      <Legenda
        itens={[
          {
            label: `Famílias (${total.familia.toLocaleString('pt-BR')})`,
            cor: SERIE[1],
          },
          {
            label: `Equipe (${total.equipe.toLocaleString('pt-BR')})`,
            cor: SERIE[2],
          },
          { label: `Ju (${total.ju.toLocaleString('pt-BR')})`, cor: SERIE[3] },
          {
            label: `Automáticas (${total.automacao.toLocaleString('pt-BR')})`,
            cor: SERIE[4],
          },
        ]}
      />
      <ChartContainer config={volumeConfig} className="h-[240px] w-full">
        <BarChart
          data={volume}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeOpacity={0.4} />
          <XAxis
            dataKey="dia"
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtDia}
            minTickGap={20}
            className="text-xs"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            className="text-xs"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent labelFormatter={(v) => fmtDia(String(v))} />
            }
          />
          <Bar
            isAnimationActive={false}
            dataKey="familia"
            stackId="v"
            fill="var(--color-familia)"
            stroke="hsl(var(--card))"
            strokeWidth={1}
            maxBarSize={24}
          />
          <Bar
            isAnimationActive={false}
            dataKey="equipe"
            stackId="v"
            fill="var(--color-equipe)"
            stroke="hsl(var(--card))"
            strokeWidth={1}
            maxBarSize={24}
          />
          <Bar
            isAnimationActive={false}
            dataKey="ju"
            stackId="v"
            fill="var(--color-ju)"
            stroke="hsl(var(--card))"
            strokeWidth={1}
            maxBarSize={24}
          />
          <Bar
            isAnimationActive={false}
            dataKey="automacao"
            stackId="v"
            fill="var(--color-automacao)"
            stroke="hsl(var(--card))"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Das mensagens enviadas às famílias, {pct(total.automacao, enviadas)}%
        foram automáticas, {pct(total.ju, enviadas)}% da Ju e{' '}
        {pct(total.equipe, enviadas)}% da equipe.
      </p>
    </div>
  );
}

function MapaCalor({ calor }: { calor: Desempenho['calor'] }) {
  const mapa = useMemo(() => {
    const m = new Map<
      string,
      { pedidos: number; mediana_min: number | null }
    >();
    for (const c of calor) m.set(`${c.dow}-${c.hora}`, c);
    return m;
  }, [calor]);
  const max = Math.max(1, ...calor.map((c) => c.pedidos));
  const pico = calor.reduce<Desempenho['calor'][number] | null>(
    (best, c) => (!best || c.pedidos > best.pedidos ? c : best),
    null
  );
  if (calor.length === 0) return <Vazio texto="Sem pedidos no período." />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-9" />
              {HORAS.map((h) => (
                <th
                  key={h}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {h % 3 === 1 ? `${h}h` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS_SEMANA.map((d, i) => (
              <tr key={d}>
                <td className="pr-1 text-xs text-muted-foreground">{d}</td>
                {HORAS.map((h) => {
                  const c = mapa.get(`${i + 1}-${h}`);
                  const n = c?.pedidos ?? 0;
                  const alpha = n === 0 ? 0 : 0.12 + 0.88 * (n / max);
                  return (
                    <td
                      key={h}
                      className="h-6 min-w-[18px] rounded-[3px] bg-muted/40"
                      style={
                        n
                          ? {
                              background: `hsl(var(--serie-1) / ${alpha.toFixed(2)})`,
                            }
                          : undefined
                      }
                      title={`${d}, ${h}h: ${n} pedido(s)${c?.mediana_min != null ? ` · resposta típica ${fmtMinutos(c.mediana_min)}` : ''}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          menos
          {[0.15, 0.4, 0.65, 0.9].map((o) => (
            <span
              key={o}
              className="inline-block h-3 w-4 rounded-[2px]"
              style={{ background: `hsl(var(--serie-1) / ${o})` }}
            />
          ))}
          mais pedidos
        </span>
        {pico && (
          <span>
            Pico: {DIAS_SEMANA[pico.dow - 1]} às {pico.hora}h ({pico.pedidos}{' '}
            pedidos)
          </span>
        )}
      </div>
    </div>
  );
}

function FaixasChart({ dados }: { dados: Desempenho }) {
  const linhas = dados.faixas.map((f) => ({
    ...f,
    rotulo: FAIXA_CURTA[f.ordem] ?? f.faixa,
  }));
  return (
    <div className="space-y-3">
      <Legenda
        itens={[
          { label: 'Pedido no expediente', cor: SERIE[1] },
          { label: 'Pedido fora do expediente', cor: SERIE[2] },
        ]}
      />
      <ChartContainer config={faixasConfig} className="h-[240px] w-full">
        <BarChart
          data={linhas}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={2}
        >
          <CartesianGrid vertical={false} strokeOpacity={0.4} />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            interval={0}
            className="text-xs"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            className="text-xs"
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            isAnimationActive={false}
            dataKey="expediente"
            fill="var(--color-expediente)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            isAnimationActive={false}
            dataKey="fora"
            fill="var(--color-fora)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function Funil({ funil }: { funil: Desempenho['funil'] }) {
  const etapas = [
    { label: 'Contatos novos', valor: funil.contatos_novos },
    { label: 'Mostraram interesse', valor: funil.interessados },
    { label: 'Fizeram cadastro', valor: funil.cadastrados },
    { label: 'Agendaram', valor: funil.agendaram },
    { label: 'Foram atendidos', valor: funil.atendidos },
    { label: 'Voltaram (2+ sessões)', valor: funil.voltaram },
  ];
  const base = etapas[0].valor;
  if (base === 0) return <Vazio texto="Nenhum contato novo no período." />;

  let maiorQueda = { de: '', para: '', perda: 0, a: 0, b: 0 };
  for (let i = 1; i < etapas.length; i++) {
    const perda = etapas[i - 1].valor - etapas[i].valor;
    const rel = etapas[i - 1].valor > 0 ? perda / etapas[i - 1].valor : 0;
    if (rel > maiorQueda.perda) {
      maiorQueda = {
        de: etapas[i - 1].label,
        para: etapas[i].label,
        perda: rel,
        a: etapas[i - 1].valor,
        b: etapas[i].valor,
      };
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {etapas.map((e) => (
          <BarraLinha
            key={e.label}
            label={e.label}
            valor={e.valor}
            max={base}
            cor={SERIE[1]}
            detalhe={`(${pct(e.valor, base)}%)`}
          />
        ))}
      </div>
      {maiorQueda.de && (
        <p className="rounded-md bg-vermelho-kids/10 p-2.5 text-xs text-foreground">
          <strong>Maior perda:</strong> de “{maiorQueda.de.toLowerCase()}” para
          “{maiorQueda.para.toLowerCase()}” ({maiorQueda.a} → {maiorQueda.b},{' '}
          {Math.round(maiorQueda.perda * 100)}% ficam pelo caminho).
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Cadastro e agenda são cruzados pelo telefone da conversa (com ou sem o
        nono dígito) e pelos dependentes de quem conversa. Quem se cadastrou com
        outro número aparece como não cadastrado.
      </p>
    </div>
  );
}

function JuPainel({ dados }: { dados: Desempenho }) {
  const ju = dados.ju;
  const tipos = (ju.encaminhados_por_tipo ?? []).filter(
    (t) => t.tipo !== 'EXTERNO'
  );
  const maxTipo = Math.max(1, ...tipos.map((t) => t.total));
  const acoes = ju.acoes ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">
            {ju.pedidos_respondidos}
          </p>
          <p className="text-xs text-muted-foreground">
            pedidos respondidos pela Ju
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{ju.encaminhados}</p>
          <p className="text-xs text-muted-foreground">
            passados para a equipe
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">
            {ju.tempo_ate_resolver_h != null
              ? `${ju.tempo_ate_resolver_h.toLocaleString('pt-BR')} h`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            até a equipe resolver (mediana)
          </p>
        </div>
      </div>
      {tipos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            O que a Ju passou para a equipe
          </p>
          {tipos.slice(0, 6).map((t) => (
            <BarraLinha
              key={t.tipo}
              label={TIPO_PEDIDO[t.tipo] ?? t.tipo}
              valor={t.total}
              max={maxTipo}
              cor={SERIE[3]}
            />
          ))}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Ações que a Ju executou sozinha
        </p>
        {acoes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma no período.</p>
        ) : (
          <ul className="text-sm space-y-0.5">
            {acoes.map((x) => (
              <li key={x.tipo} className="flex justify-between gap-2">
                <span>{ACAO_JU[x.tipo] ?? x.tipo}</span>
                <span className="tabular-nums text-muted-foreground">
                  {x.ok}
                  {x.falhou > 0 ? ` · ${x.falhou} não deram certo` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ju.resolvidos_automaticamente > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            {ju.resolvidos_automaticamente} pedidos se fecharam sozinhos quando
            a consulta ou a cobrança entrou no sistema.
          </p>
        )}
      </div>
    </div>
  );
}

function Motivos({ motivos }: { motivos: Desempenho['motivos'] }) {
  const total = motivos.reduce((s, m) => s + m.total, 0);
  const top = motivos.slice(0, 8);
  const max = Math.max(1, ...top.map((m) => m.total));
  if (total === 0)
    return <Vazio texto="Sem conversas analisadas no período." />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2">
      {top.map((m) => (
        <BarraLinha
          key={m.intencao}
          label={INTENCAO_LABELS[m.intencao] ?? m.intencao}
          valor={m.total}
          max={max}
          cor={SERIE[1]}
          detalhe={`(${pct(m.total, total)}%)`}
        />
      ))}
    </div>
  );
}
