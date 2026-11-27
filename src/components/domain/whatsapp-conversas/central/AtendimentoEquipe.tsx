// AI dev note: seção "Atendimento Ju × equipe" da aba Desempenho (06/11/2026,
// pedido do dono; revisada no mesmo dia). Base: pedidos que a Ju passou para a
// equipe (fn_conversas_atendimento). Regras combinadas com o dono:
// - espera em minutos de EXPEDIENTE, conforme a tabela ju_expediente_cobertura
//   (a tela mostra o expediente considerado); o tempo corrido aparece junto;
// - mede a 1ª RESPOSTA da equipe (não a resolução), contada só até o pedido
//   seguinte da mesma conversa;
// - medianas só dos respondidos; pendentes abertos aparecem à parte, com a
//   espera acumulada; pedido fechado sem mensagem da equipe não entra em nenhum;
// - conversão só com a janela de 7 dias completa; os recentes são provisórios;
// - conversão × espera e follow-up × agendamento são só associação.
// Nada de "vendas perdidas" calculadas.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  Hourglass,
  Inbox,
  Send,
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
import { BarraLinha, Kpi, SERIE, Secao, Vazio } from './central-ui';

const NOME_DIA = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
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
const fmtData = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
    : null;
const fmtHora = (hhmm: string) =>
  hhmm.endsWith(':00')
    ? `${Number(hhmm.slice(0, 2))}h`
    : hhmm.replace(':', 'h');

// "seg a sex, 8h às 18h · sáb, 8h às 14h"
function textoExpediente(exp: Atendimento['expediente']): string {
  if (exp.length === 0) return 'sem expediente cadastrado';
  const grupos: Array<{
    de: number;
    ate: number;
    inicio: string;
    fim: string;
  }> = [];
  for (const e of exp) {
    const g = grupos[grupos.length - 1];
    if (g && g.ate === e.dow - 1 && g.inicio === e.inicio && g.fim === e.fim)
      g.ate = e.dow;
    else grupos.push({ de: e.dow, ate: e.dow, inicio: e.inicio, fim: e.fim });
  }
  return grupos
    .map(
      (g) =>
        `${NOME_DIA[g.de].toLowerCase()}${g.ate > g.de ? ` a ${NOME_DIA[g.ate].toLowerCase()}` : ''}, ${fmtHora(g.inicio)} às ${fmtHora(g.fim)}`
    )
    .join(' · ');
}

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
  const prov = dados.conversao_provisoria;
  const desde = fmtData(dados.dados_desde);

  return (
    <div className="space-y-6">
      <Secao
        icon={Users}
        titulo="Atendimento Ju × equipe"
        subtitulo={`Pedidos que a Ju passou para a equipe nos últimos ${dados.periodo_dias} dias${desde ? ` (registro desde ${desde})` : ''}. Espera contada só no expediente: ${textoExpediente(dados.expediente)}.`}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi
              icon={Bot}
              label="Resposta da Ju"
              value={fmtSeg(ju.mediana_sem_espera_s)}
              hint={`pior 10%: ${fmtSeg(ju.p90_sem_espera_s)} · contando as esperas de propósito (equipe na conversa): ${fmtSeg(ju.mediana_s)} e ${fmtSeg(ju.p90_s)}`}
            />
            <Kpi
              icon={Hourglass}
              label="1ª resposta da equipe"
              value={fmtMinutos(eq.mediana_min)}
              hint={`${eq.respondidos} pedidos respondidos · pior 10%: ${fmtMinutos(eq.p90_min)} · tempo corrido: ${fmtMinutos(eq.mediana_corrida_min)}`}
            />
            <Kpi
              icon={AlertTriangle}
              label={`Respondidos depois de ${dados.meta_min} min`}
              value={
                eq.respondidos
                  ? `${pct(eq.respondidos_fora_prazo, eq.respondidos)}%`
                  : '—'
              }
              hint={`${eq.respondidos_fora_prazo} de ${eq.respondidos} respondidos`}
            />
            <Kpi
              icon={Inbox}
              label="Sem resposta agora"
              value={eq.pendentes}
              hint={`${eq.pendentes_fora_prazo} há mais de ${dados.meta_min} min${eq.pendente_mais_antigo_min != null ? ` · o mais antigo há ${fmtMinutos(eq.pendente_mais_antigo_min)} de expediente` : ''} · ${eq.encerrados_sem_resposta} fechados sem mensagem da equipe (fora da conta)`}
              destaque={eq.pendentes_fora_prazo > 0 ? 'atencao' : undefined}
            />
            <Kpi
              icon={CalendarCheck}
              label="Contatos novos que agendaram"
              value={
                novosPedidos ? `${pct(novosAgendaram, novosPedidos)}%` : '—'
              }
              hint={`${novosAgendaram} de ${novosPedidos} pedidos de agendamento, em até 7 dias${novosPedidos < dados.amostra_minima ? ' · amostra pequena' : ''}${prov.novo_pedidos ? ` · mais ${prov.novo_pedidos} recentes ainda na janela (${prov.novo_agendaram} já agendaram)` : ''}`}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">Quando a equipe mais demora</p>
              <p className="text-xs text-muted-foreground">
                A cor é a espera até a 1ª resposta dos pedidos já respondidos,
                pelo dia e horário do pedido. O número é o total de pedidos; o
                ponto vermelho marca pedidos ainda sem resposta, que não entram
                na cor. Células com menos de {POUCOS_CASOS} respondidos ficam
                apagadas.
              </p>
              <MapaEspera dados={dados} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Espera × agendamento</p>
              <p className="text-xs text-muted-foreground">
                Pedidos de agendamento com os 7 dias já completos, pelo tempo
                até a 1ª resposta da equipe. Mostra associação, não causa: quem
                espera mais pode ser um caso diferente.
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

      <FollowUp dados={dados} />
    </div>
  );
};

function MapaEspera({ dados }: { dados: Atendimento }) {
  const { calor } = dados;
  const dias = useMemo(() => {
    const d = dados.expediente.map((e) => e.dow).filter((x) => x <= 6);
    return d.length ? d : [1, 2, 3, 4, 5];
  }, [dados.expediente]);
  const mapa = useMemo(() => {
    const m = new Map<string, Atendimento['calor'][number]>();
    for (const c of calor) m.set(`${c.dow}-${c.faixa}`, c);
    return m;
  }, [calor]);
  const confiaveis = calor.filter(
    (c) => dias.includes(c.dow) && c.respondidos >= POUCOS_CASOS
  );
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
              {dias.map((d) => (
                <th
                  key={d}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {NOME_DIA[d]}
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
                {dias.map((d) => {
                  const c = mapa.get(`${d}-${f}`);
                  const n = c?.pedidos ?? 0;
                  const pend = c?.pendentes ?? 0;
                  const poucos = n > 0 && (c?.respondidos ?? 0) < POUCOS_CASOS;
                  const alpha =
                    n === 0 || poucos
                      ? 0
                      : 0.15 + 0.85 * Math.min(1, (c?.mediana_min ?? 0) / max);
                  return (
                    <td
                      key={d}
                      className={cn(
                        'relative h-9 min-w-[40px] rounded-md text-center text-xs tabular-nums',
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
                      title={`${NOME_DIA[d]}, ${f}h–${f + 2}h: ${n} pedido(s), ${c?.respondidos ?? 0} respondido(s)${c?.mediana_min != null ? ` · 1ª resposta típica ${fmtMinutos(c.mediana_min)}` : ''}${pend ? ` · ${pend} ainda sem resposta` : ''}`}
                    >
                      {n || ''}
                      {pend > 0 && (
                        <span
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-vermelho-kids"
                          aria-label={`${pend} sem resposta`}
                        />
                      )}
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
          <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-vermelho-kids" />
          sem resposta
        </span>
        {pior && pior.mediana_min != null && (
          <span>
            Mais lento: {NOME_DIA[pior.dow]}, {pior.faixa}h–{pior.faixa + 2}h (
            {fmtMinutos(pior.mediana_min)}, {pior.respondidos} respondidos)
          </span>
        )}
      </div>
    </div>
  );
}

function Conversao({ dados }: { dados: Atendimento }) {
  const grupos: Array<{
    chave: 'novo' | 'paciente';
    titulo: string;
    prov: number;
    provAg: number;
  }> = [
    {
      chave: 'novo',
      titulo: 'Contatos novos',
      prov: dados.conversao_provisoria.novo_pedidos,
      provAg: dados.conversao_provisoria.novo_agendaram,
    },
    {
      chave: 'paciente',
      titulo: 'Quem já é paciente',
      prov: dados.conversao_provisoria.paciente_pedidos,
      provAg: dados.conversao_provisoria.paciente_agendaram,
    },
  ];
  if (dados.conversao.length === 0)
    return (
      <Vazio texto="Ainda não há pedidos de agendamento com os 7 dias completos." />
    );
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
            {g.prov > 0 && (
              <p className="text-xs text-muted-foreground">
                Provisório: mais {g.prov} pedidos dos últimos 7 dias, {g.provAg}{' '}
                já agendaram.
              </p>
            )}
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
                return `${fmtMinutos(t.mediana_min)} até a 1ª resposta (respondidos) · ${t.pedidos} pedidos${t.pendentes ? ` · ${t.pendentes} ainda sem resposta` : ''}`;
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

// Onde o follow-up automático parou. 'revisar' hoje não aparece para ninguém
// da equipe: a tela avisa, para não parecer que alguém está cuidando.
const MOTIVO: Record<string, string> = {
  ja_tem_agendamento: 'Já tinha consulta marcada',
  clinica_deve_resposta: 'A clínica devia a resposta',
  ju_passou_para_secretaria: 'Esperando a secretária',
  mais_de_3_dias_uteis: 'Passou de 3 dias úteis',
  intencao_vencida: 'Data pedida já passou',
  convenio_com_interesse: 'Convênio com interesse',
  reclamacao_ou_desculpas: 'Reclamação ou desculpas',
  mencao_saude: 'Falou de internação',
  sem_pendencia_da_familia: 'Nada pendente com a família',
  familia_vai_ver: 'A família disse que vai ver',
  familia_parou: 'Candidata, ainda sem envio',
  pesquisa_contato_novo: 'Só pesquisou, sem envio',
  so_pesquisou: 'Só pesquisou',
  so_convenio: 'Só perguntou de convênio',
  sem_ia: 'Conversa sem IA',
  clinica_ja_marcou: 'A clínica já marcou',
  recusa_ou_resolvido: 'Recusou ou resolveu',
  familia_ja_listada_hoje: 'Já listada no dia',
  sem_mensagens: 'Sem mensagens',
  familia_pediu_contato_em_data: 'Pediu contato em outra data',
};
function rotuloMotivo(m: string | null): string {
  if (!m) return 'Sem motivo registrado';
  if (m.startsWith('menos_de_')) return 'Ainda cedo para retomar';
  if (m.startsWith('pedido_aberto_')) return 'Pedido aberto para a equipe';
  if (m.startsWith('regras:revisar:'))
    return rotuloMotivo(m.slice('regras:revisar:'.length));
  return MOTIVO[m] ?? m.replace(/^ia:/, 'IA: ').replace(/_/g, ' ');
}

function FollowUp({ dados }: { dados: Atendimento }) {
  const f = dados.followup;
  const desde = fmtData(f.desde);
  const etapas = [
    { label: 'Conversas avaliadas', valor: f.analisadas },
    { label: 'Chegaram a candidatas', valor: f.candidatas },
    { label: 'Receberam a mensagem', valor: f.enviadas },
    { label: 'Responderam', valor: f.responderam },
    { label: 'Agendaram depois', valor: f.agendaram },
  ];
  const paradas = f.paradas.slice(0, 10);
  const maxParada = Math.max(1, ...paradas.map((p) => p.conversas));
  return (
    <Secao
      icon={Send}
      titulo="Follow-up automático"
      subtitulo={`Quantas conversas o follow-up avaliou nos últimos ${dados.periodo_dias} dias e onde as outras pararam${desde ? `. Envio real desde ${desde}` : ''}. Agendar depois da mensagem não prova que foi por causa dela.`}
    >
      {f.analisadas === 0 ? (
        <Vazio texto="Nenhuma conversa avaliada no período." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Funil</p>
            {etapas.map((e) => (
              <BarraLinha
                key={e.label}
                label={e.label}
                valor={e.valor}
                max={f.analisadas}
                cor={SERIE[1]}
                titulo={`${e.label}: ${e.valor}`}
              />
            ))}
            {f.enviadas < dados.amostra_minima && (
              <p className="text-xs text-muted-foreground">
                Amostra pequena: {f.enviadas} mensagens enviadas.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Onde pararam sem mensagem</p>
            {paradas.map((p) => (
              <BarraLinha
                key={`${p.situacao}-${p.motivo}`}
                label={`${p.situacao === 'revisar' ? 'Revisar · ' : ''}${rotuloMotivo(p.motivo)}`}
                valor={p.conversas}
                max={maxParada}
                cor={p.situacao === 'revisar' ? SERIE[4] : SERIE[3]}
                titulo={`${p.situacao === 'revisar' ? 'Revisar · ' : ''}${rotuloMotivo(p.motivo)}: ${p.conversas} conversas`}
              />
            ))}
            {paradas.some((p) => p.situacao === 'revisar') && (
              <p className="text-xs text-muted-foreground">
                "Revisar" ainda não aparece para ninguém da equipe: essas
                conversas param aqui.
              </p>
            )}
          </div>
        </div>
      )}
    </Secao>
  );
}
