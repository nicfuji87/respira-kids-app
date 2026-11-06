// AI dev note: seção "Atendimento Ju × equipe" da aba Desempenho (06/11/2026,
// pedido do dono). Base: pedidos que a Ju passou para a equipe
// (fn_conversas_atendimento). Regras combinadas com o dono:
// - espera da equipe em minutos de EXPEDIENTE (seg–sex 8h–18h); o tempo
//   corrido aparece junto, porque é o que a família sente;
// - pendentes não somem da conta (entram no "fora do prazo");
// - mapa de calor pelo horário do PEDIDO, com o número de casos na célula;
// - conversão × espera é só associação; amostra pequena aparece como tal.
// Nada de "vendas perdidas" calculadas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  Hourglass,
  Users,
} from 'lucide-react';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import {
  fetchAtendimento,
  fmtMinutos,
  pct,
  type Atendimento,
} from '@/lib/conversas-central-api';
import { Kpi, SERIE, Secao, Vazio } from './central-ui';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const FAIXAS = [8, 10, 12, 14, 16];
const POUCOS_CASOS = 3;

const tendenciaConfig = {
  mediana_min: { label: 'Espera típica (min de expediente)', color: SERIE[2] },
} satisfies ChartConfig;

const fmtSeg = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  return fmtMinutos(s / 60);
};
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const AtendimentoEquipe: React.FC<{ dias: number }> = ({ dias }) => {
  const [dados, setDados] = useState<Atendimento | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      setDados(await fetchAtendimento(dias));
    } catch {
      setErro(true);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <Secao icon={Users} titulo="Atendimento Ju × equipe">
        <Vazio texto="Não conseguimos carregar o atendimento agora." />
      </Secao>
    );
  }
  if (!dados) return <Skeleton className="h-72" />;

  const { ju, equipe: eq } = dados;
  const novos = dados.conversao.filter((c) => c.grupo === 'novo');
  const novosPedidos = novos.reduce((s, c) => s + c.pedidos, 0);
  const novosAgendaram = novos.reduce((s, c) => s + c.agendaram, 0);

  return (
    <Secao
      icon={Users}
      titulo="Atendimento Ju × equipe"
      subtitulo={`Pedidos que a Ju passou para a equipe nos últimos ${dados.periodo_dias} dias. Espera contada só no expediente (seg a sex, 8h às 18h).`}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={Bot}
            label="Resposta da Ju"
            value={fmtSeg(ju.mediana_sem_espera_s)}
            hint={`pior 10%: ${fmtSeg(ju.p90_sem_espera_s)} · contando as esperas de propósito (equipe na conversa): ${fmtSeg(ju.mediana_s)} e ${fmtSeg(ju.p90_s)}`}
          />
          <Kpi
            icon={Hourglass}
            label="Espera pela equipe"
            value={fmtMinutos(eq.mediana_min)}
            hint={`depois que a Ju passa · pior 10%: ${fmtMinutos(eq.p90_min)} · tempo corrido: ${fmtMinutos(eq.mediana_corrida_min)}`}
          />
          <Kpi
            icon={AlertTriangle}
            label={`Acima de ${dados.meta_min} min`}
            value={`${pct(eq.fora_prazo, eq.pedidos)}%`}
            hint={`${eq.fora_prazo} de ${eq.pedidos} pedidos · ${eq.pendentes} ainda sem resposta${eq.pendente_mais_antigo_min != null ? `, o mais antigo há ${fmtMinutos(eq.pendente_mais_antigo_min)} de expediente` : ''}`}
            destaque={eq.pendentes_fora_prazo > 0 ? 'atencao' : undefined}
          />
          <Kpi
            icon={CalendarCheck}
            label="Contatos novos que agendaram"
            value={novosPedidos ? `${pct(novosAgendaram, novosPedidos)}%` : '—'}
            hint={`${novosAgendaram} de ${novosPedidos} pedidos de agendamento em até 7 dias${novosPedidos < dados.amostra_minima ? ' · amostra pequena' : ''}`}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Quando a equipe mais demora</p>
            <p className="text-xs text-muted-foreground">
              Espera típica por dia e horário do pedido. O número é a quantidade
              de pedidos; células com menos de {POUCOS_CASOS} pedidos ficam
              apagadas.
            </p>
            <MapaEspera calor={dados.calor} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Espera × agendamento</p>
            <p className="text-xs text-muted-foreground">
              Pedidos de agendamento por tempo de espera pela equipe. Mostra
              associação, não causa: quem espera mais pode ser um caso
              diferente.
            </p>
            <Conversao dados={dados} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Espera típica por dia</p>
          <Tendencia dados={dados} />
        </div>
      </div>
    </Secao>
  );
};

function MapaEspera({ calor }: { calor: Atendimento['calor'] }) {
  const mapa = useMemo(() => {
    const m = new Map<string, Atendimento['calor'][number]>();
    for (const c of calor) m.set(`${c.dow}-${c.faixa}`, c);
    return m;
  }, [calor]);
  const confiaveis = calor.filter((c) => c.pedidos >= POUCOS_CASOS);
  const max = Math.max(30, ...confiaveis.map((c) => c.mediana_min ?? 0));
  const pior = confiaveis.reduce<Atendimento['calor'][number] | null>(
    (b, c) => (!b || (c.mediana_min ?? 0) > (b.mediana_min ?? 0) ? c : b),
    null
  );
  if (calor.length === 0) return <Vazio texto="Sem pedidos no período." />;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="w-10" />
              {DIAS.map((d) => (
                <th
                  key={d}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FAIXAS.map((f) => (
              <tr key={f}>
                <td className="pr-1 text-xs text-muted-foreground whitespace-nowrap">
                  {f}h
                </td>
                {DIAS.map((d, i) => {
                  const c = mapa.get(`${i + 1}-${f}`);
                  const n = c?.pedidos ?? 0;
                  const poucos = n > 0 && n < POUCOS_CASOS;
                  const alpha =
                    n === 0 || poucos
                      ? 0
                      : 0.15 + 0.85 * Math.min(1, (c?.mediana_min ?? 0) / max);
                  return (
                    <td
                      key={d}
                      className={cn(
                        'h-9 min-w-[44px] rounded-md text-center text-xs tabular-nums',
                        n === 0 && 'bg-muted/30 text-muted-foreground/50',
                        poucos && 'bg-muted/50 text-muted-foreground'
                      )}
                      style={
                        n && !poucos
                          ? {
                              background: `hsl(var(--serie-2) / ${alpha.toFixed(2)})`,
                            }
                          : undefined
                      }
                      title={`${d}, ${f}h–${f + 2}h: ${n} pedido(s)${c?.mediana_min != null ? ` · espera típica ${fmtMinutos(c.mediana_min)}` : ''}`}
                    >
                      {n || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          espera menor
          {[0.2, 0.45, 0.7, 0.95].map((o) => (
            <span
              key={o}
              className="inline-block h-3 w-4 rounded-[2px]"
              style={{ background: `hsl(var(--serie-2) / ${o})` }}
            />
          ))}
          maior
        </span>
        {pior && pior.mediana_min != null && (
          <span>
            Mais lento: {DIAS[pior.dow - 1]}, {pior.faixa}h–{pior.faixa + 2}h (
            {fmtMinutos(pior.mediana_min)}, {pior.pedidos} pedidos)
          </span>
        )}
      </div>
    </div>
  );
}

function Conversao({ dados }: { dados: Atendimento }) {
  const grupos: Array<{ chave: 'novo' | 'paciente'; titulo: string }> = [
    { chave: 'novo', titulo: 'Contatos novos' },
    { chave: 'paciente', titulo: 'Quem já é paciente' },
  ];
  if (dados.conversao.length === 0)
    return <Vazio texto="Sem pedidos de agendamento no período." />;
  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const linhas = dados.conversao.filter((c) => c.grupo === g.chave);
        const total = linhas.reduce((s, c) => s + c.pedidos, 0);
        if (!total) return null;
        return (
          <div key={g.chave} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {g.titulo} · {total} pedidos
              {total < dados.amostra_minima && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  amostra pequena
                </span>
              )}
            </p>
            {linhas.map((c) => {
              const p = pct(c.agendaram, c.pedidos);
              return (
                <div
                  key={c.ordem}
                  className="grid grid-cols-[6.5rem_1fr_6.5rem] items-center gap-2 text-sm"
                  title={`${c.agendaram} de ${c.pedidos} agendaram`}
                >
                  <span className="text-foreground/90">{c.faixa}</span>
                  <div className="h-2.5 rounded-r bg-muted/40">
                    <div
                      className="h-2.5 rounded-r"
                      style={{
                        width: `${Math.max(2, p)}%`,
                        background: g.chave === 'novo' ? SERIE[1] : SERIE[3],
                        opacity: c.pedidos < POUCOS_CASOS ? 0.45 : 1,
                      }}
                    />
                  </div>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {p}% · {c.agendaram}/{c.pedidos}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Tendencia({ dados }: { dados: Atendimento }) {
  const linhas = dados.tendencia.map((t) => ({ ...t, rotulo: fmtDia(t.dia) }));
  if (linhas.length === 0) return <Vazio texto="Sem pedidos no período." />;
  return (
    <ChartContainer config={tendenciaConfig} className="h-[200px] w-full">
      <BarChart data={linhas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="rotulo"
          tickLine={false}
          axisLine={false}
          className="text-xs"
          minTickGap={12}
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
            <ChartTooltipContent
              formatter={(_v, _n, item) => {
                const t = item.payload as (typeof linhas)[number];
                return `${fmtMinutos(t.mediana_min)} de espera típica · ${t.pedidos} pedidos${t.pendentes ? ` · ${t.pendentes} sem resposta` : ''}`;
              }}
            />
          }
        />
        <Bar
          isAnimationActive={false}
          dataKey="mediana_min"
          fill="var(--color-mediana_min)"
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ChartContainer>
  );
}
