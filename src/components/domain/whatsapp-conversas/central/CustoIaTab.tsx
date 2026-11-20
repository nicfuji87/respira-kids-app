// AI dev note: aba "Custo de IA" da central de Conversas (só admin). Mostra quanto a IA gasta
// (tokens e US$) por período, por fluxo, pelo que a Ju fez em cada execução e por conversa.
// Dados: fetchIaUsoPainel (fn_ia_uso_painel). O custo do Atendimento é estimado e aparece como
// faixa: "sem cache" (teto, tudo a preço cheio) e "com cache" (a parte fixa do prompt, ~20 mil
// tokens por chamada, lida do cache a US$ 0,10/milhão). Os totais oficiais da OpenAI aparecem
// quando a chave de administrador estiver no Vault (edge ia-uso-openai, de hora em hora).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarDays,
  Coins,
  Gauge,
  KeyRound,
  ListOrdered,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Card, CardContent } from '@/components/primitives/card';
import {
  fetchIaUsoPainel,
  FLUXO_LABEL,
  fmtTokens,
  fmtUsd,
  RESULTADO_LABEL,
  type IaTotais,
  type IaUsoPainel,
} from '@/lib/ia-uso-api';
import { BarraLinha, Kpi, SERIE, Secao, Vazio } from './central-ui';

const PERIODOS: Array<{ chave: keyof IaUsoPainel['totais']; titulo: string }> =
  [
    { chave: 'hoje', titulo: 'Hoje' },
    { chave: '7_dias', titulo: 'Últimos 7 dias' },
    { chave: 'mes', titulo: 'Este mês' },
  ];

function faixa(t: {
  custo_usd_com_cache: number;
  custo_usd_sem_cache: number;
}) {
  const a = Number(t.custo_usd_com_cache ?? 0);
  const b = Number(t.custo_usd_sem_cache ?? 0);
  if (Math.abs(a - b) < 0.005) return fmtUsd(b);
  return `${fmtUsd(a)} a ${fmtUsd(b)}`;
}

function diaCurto(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function CustoIaTab() {
  const [dados, setDados] = useState<IaUsoPainel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchIaUsoPainel(30));
    } catch (e) {
      console.error('[Custo de IA] erro ao carregar:', e);
      setErro('Não conseguimos carregar o consumo de IA. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const oficialPorDia = useMemo(() => {
    const m = new Map<
      string,
      { tokens: number; cache: number; custo: number }
    >();
    for (const o of dados?.openai_oficial ?? []) {
      const atual = m.get(o.dia) ?? { tokens: 0, cache: 0, custo: 0 };
      atual.tokens += Number(o.tokens_entrada ?? 0);
      atual.cache += Number(o.tokens_cache ?? 0);
      atual.custo += Number(o.custo_usd ?? 0);
      m.set(o.dia, atual);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [dados]);

  if (erro) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">{erro}</p>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!dados) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const ultimosDias = [...dados.por_dia].slice(-14).reverse();
  const maxDia = Math.max(1, ...ultimosDias.map((d) => d.tokens_entrada));
  const maxFluxo = Math.max(1, ...dados.por_fluxo.map((f) => f.tokens_entrada));
  const maxRes = Math.max(1, ...dados.por_resultado.map((r) => r.execucoes));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Quanto a IA está gastando. O atendimento às famílias é estimado pelo
          tamanho de cada conversa, por isso o custo aparece como faixa: o menor
          valor considera que a parte fixa das instruções veio do cache; o
          maior, que nada veio. O @ju e o resumo do dia usam os números reais da
          OpenAI.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void carregar()}
          disabled={carregando}
        >
          <RefreshCw
            className={carregando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PERIODOS.map(({ chave, titulo }) => {
          const t: IaTotais = dados.totais[chave];
          return (
            <Kpi
              key={chave}
              icon={Coins}
              label={titulo}
              value={faixa(t)}
              hint={
                <>
                  {fmtTokens(t.tokens_entrada)} tokens de entrada ·{' '}
                  {t.execucoes.toLocaleString('pt-BR')} execuções
                  {t.puladas > 0 &&
                    ` · ${t.puladas.toLocaleString('pt-BR')} sem IA (economia)`}
                </>
              }
            />
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao
          icon={Bot}
          titulo="Por fluxo"
          subtitulo="Últimos 30 dias, tokens de entrada."
        >
          {dados.por_fluxo.length === 0 ? (
            <Vazio texto="Ainda sem registros." />
          ) : (
            <div className="space-y-2">
              {dados.por_fluxo.map((f) => (
                <BarraLinha
                  key={f.fluxo}
                  label={FLUXO_LABEL[f.fluxo] ?? f.fluxo}
                  valor={f.tokens_entrada}
                  max={maxFluxo}
                  cor={SERIE[1]}
                  titulo={`${f.execucoes} execuções · ${faixa(f)}${f.estimado ? ' (estimado)' : ''}`}
                />
              ))}
            </div>
          )}
        </Secao>

        <Secao
          icon={Gauge}
          titulo="O que a Ju fez no atendimento"
          subtitulo="Execuções dos últimos 30 dias. 'Leu e não falou nada' é o desperdício que o filtro corta."
        >
          {dados.por_resultado.length === 0 ? (
            <Vazio texto="Ainda sem registros." />
          ) : (
            <div className="space-y-2">
              {dados.por_resultado.map((r) => (
                <BarraLinha
                  key={r.resultado}
                  label={RESULTADO_LABEL[r.resultado] ?? r.resultado}
                  valor={r.execucoes}
                  max={maxRes}
                  cor={
                    r.resultado === 'pulada'
                      ? SERIE[2]
                      : r.resultado === 'nada'
                        ? SERIE[3]
                        : SERIE[1]
                  }
                  titulo={`${fmtTokens(r.tokens_entrada)} tokens`}
                />
              ))}
            </div>
          )}
        </Secao>
      </div>

      <Secao
        icon={CalendarDays}
        titulo="Por dia"
        subtitulo="Últimos 14 dias com registro, tokens de entrada."
      >
        {ultimosDias.length === 0 ? (
          <Vazio texto="Ainda sem registros." />
        ) : (
          <div className="space-y-2">
            {ultimosDias.map((d) => (
              <BarraLinha
                key={d.dia}
                label={`${diaCurto(d.dia)} · ${faixa(d)}`}
                valor={d.tokens_entrada}
                max={maxDia}
                cor={SERIE[1]}
                titulo={`${d.execucoes} execuções · ${d.puladas} sem IA`}
              />
            ))}
          </div>
        )}
      </Secao>

      <Secao
        icon={ListOrdered}
        titulo="Conversas que mais gastaram"
        subtitulo="Últimos 30 dias. Nome do WhatsApp e final do telefone."
      >
        {dados.top_conversas.length === 0 ? (
          <Vazio texto="Ainda sem registros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Conversa</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Execuções
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                  <th className="py-2 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {dados.top_conversas.map((c) => (
                  <tr key={c.conversa_id} className="border-t border-border/60">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{c.nome}</span>
                      {c.telefone_final && (
                        <span className="text-muted-foreground">
                          {' '}
                          · final {c.telefone_final}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.execucoes.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmtTokens(c.tokens_entrada)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">
                      {faixa(c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao
        icon={KeyRound}
        titulo="Totais oficiais da OpenAI"
        subtitulo="Somando todos os fluxos, direto da conta da OpenAI (dia em UTC)."
      >
        {oficialPorDia.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não configurado. Crie uma chave de administrador da
            organização na OpenAI (Settings → Organization → Admin keys) e salve
            no Vault do Supabase com o nome <code>openai_admin_key</code>. Os
            totais passam a aparecer aqui em até uma hora.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Dia</th>
                  <th className="py-2 pr-3 text-right font-medium">Entrada</th>
                  <th className="py-2 pr-3 text-right font-medium">Do cache</th>
                  <th className="py-2 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {oficialPorDia.map(([dia, o]) => (
                  <tr key={dia} className="border-t border-border/60">
                    <td className="py-2 pr-3">{diaCurto(dia)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmtTokens(o.tokens)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {o.tokens > 0
                        ? `${Math.round((100 * o.cache) / o.tokens)}%`
                        : '-'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(o.custo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SkipForward className="h-3.5 w-3.5" aria-hidden />
        "Sem IA" são mensagens que chegaram com a Lolô conduzindo a conversa e
        sem nada que precisasse da Ju: o sistema nem chamou o modelo.
      </p>
    </div>
  );
}
