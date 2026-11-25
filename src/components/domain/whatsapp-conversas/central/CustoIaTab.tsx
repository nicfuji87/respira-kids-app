// AI dev note: aba "Custo de IA" da central de Conversas (só admin). Mostra quanto a IA gasta
// (tokens e US$) por período, por fluxo, pelo que a Ju fez em cada execução e por conversa.
// Dados: fetchIaUsoPainelFiltro (fn_ia_uso_painel_filtro). Filtros (23/11/2026): período
// (atalhos ou datas livres), fluxo, resultado, busca por nome do WhatsApp ou final do telefone
// e ordem da lista de conversas. Os cartões Hoje / 7 dias / Este mês seguem fluxo, resultado e
// busca, mas não o período. O custo do Atendimento é estimado e aparece como faixa: "com cache"
// (a parte fixa do prompt, ~20 mil tokens por chamada, lida do cache) a "sem cache" (teto).
// Datas: dia de Brasília montado à mão (nunca toISOString, que é UTC).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarDays,
  Coins,
  Filter,
  Gauge,
  KeyRound,
  ListOrdered,
  RefreshCw,
  Search,
  SkipForward,
  X,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Skeleton } from '@/components/primitives/skeleton';
import { Card, CardContent } from '@/components/primitives/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { cn } from '@/lib/utils';
import {
  fetchIaUsoPainelFiltro,
  FLUXO_LABEL,
  fmtTokens,
  fmtUsd,
  RESULTADO_LABEL,
  type IaFiltros,
  type IaOrdem,
  type IaTotais,
  type IaUsoPainelFiltrado,
} from '@/lib/ia-uso-api';
import { BarraLinha, Kpi, SERIE, Secao, Vazio } from './central-ui';

type Atalho = 'hoje' | '7' | '30' | 'mes' | 'mes_passado' | 'livre';

const ATALHOS: Array<{ id: Atalho; titulo: string }> = [
  { id: 'hoje', titulo: 'Hoje' },
  { id: '7', titulo: '7 dias' },
  { id: '30', titulo: '30 dias' },
  { id: 'mes', titulo: 'Este mês' },
  { id: 'mes_passado', titulo: 'Mês passado' },
  { id: 'livre', titulo: 'Escolher datas' },
];

const RAPIDOS: Array<{
  chave: keyof IaUsoPainelFiltrado['totais'];
  titulo: string;
}> = [
  { chave: 'hoje', titulo: 'Hoje' },
  { chave: '7_dias', titulo: 'Últimos 7 dias' },
  { chave: 'mes', titulo: 'Este mês' },
];

const ORDENS: Array<{ id: IaOrdem; titulo: string }> = [
  { id: 'custo', titulo: 'Maior custo' },
  { id: 'execucoes', titulo: 'Mais execuções' },
  { id: 'recentes', titulo: 'Mais recentes' },
];

const TODOS = 'todos';

/** YYYY-MM-DD do dia local (o app roda em Brasília). */
function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

function intervalo(atalho: Atalho): { de: string; ate: string } | null {
  const hoje = new Date();
  const menos = (n: number) =>
    new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n);
  switch (atalho) {
    case 'hoje':
      return { de: ymd(hoje), ate: ymd(hoje) };
    case '7':
      return { de: ymd(menos(6)), ate: ymd(hoje) };
    case '30':
      return { de: ymd(menos(29)), ate: ymd(hoje) };
    case 'mes':
      return {
        de: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
        ate: ymd(hoje),
      };
    case 'mes_passado':
      return {
        de: ymd(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        ate: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      };
    default:
      return null;
  }
}

function faixa(t: {
  custo_usd_com_cache: number | null;
  custo_usd_sem_cache: number | null;
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

function rotuloPeriodo(de: string, ate: string) {
  return de === ate ? diaCurto(de) : `${diaCurto(de)} a ${diaCurto(ate)}`;
}

export function CustoIaTab() {
  const inicial = intervalo('30')!;
  const [atalho, setAtalho] = useState<Atalho>('30');
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [fluxo, setFluxo] = useState<string>(TODOS);
  const [resultado, setResultado] = useState<string>(TODOS);
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<IaOrdem>('custo');

  const [dados, setDados] = useState<IaUsoPainelFiltrado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // a busca só vai ao banco depois de uma pausa na digitação
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaDigitada), 400);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  const filtros: IaFiltros = useMemo(
    () => ({
      de,
      ate,
      fluxo: fluxo === TODOS ? null : fluxo,
      resultado: resultado === TODOS ? null : resultado,
      busca,
      ordem,
    }),
    [de, ate, fluxo, resultado, busca, ordem]
  );

  const carregar = useCallback(async () => {
    if (!filtros.de || !filtros.ate) return;
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchIaUsoPainelFiltro(filtros));
    } catch (e) {
      console.error('[Custo de IA] erro ao carregar:', e);
      setErro('Não conseguimos carregar o consumo de IA. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const escolherAtalho = (a: Atalho) => {
    setAtalho(a);
    const r = intervalo(a);
    if (r) {
      setDe(r.de);
      setAte(r.ate);
    }
  };

  const temFiltro =
    fluxo !== TODOS ||
    resultado !== TODOS ||
    buscaDigitada.trim() !== '' ||
    ordem !== 'custo' ||
    atalho !== '30';

  const limpar = () => {
    escolherAtalho('30');
    setFluxo(TODOS);
    setResultado(TODOS);
    setBuscaDigitada('');
    setBusca('');
    setOrdem('custo');
  };

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

  const oficialTotal = oficialPorDia.reduce((s, [, o]) => s + o.custo, 0);

  const barraFiltros = (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          <Filter className="mr-1 h-4 w-4 text-muted-foreground" aria-hidden />
          {ATALHOS.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={atalho === a.id ? 'default' : 'outline'}
              onClick={() => escolherAtalho(a.id)}
            >
              {a.titulo}
            </Button>
          ))}
        </div>

        {atalho === 'livre' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              De
              <Input
                type="date"
                value={de}
                max={ate}
                onChange={(e) => setDe(e.target.value)}
                className="w-40"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Até
              <Input
                type="date"
                value={ate}
                min={de}
                max={ymd(new Date())}
                onChange={(e) => setAte(e.target.value)}
                className="w-40"
              />
            </label>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={fluxo} onValueChange={setFluxo}>
            <SelectTrigger aria-label="Fluxo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os fluxos</SelectItem>
              {Object.entries(FLUXO_LABEL).map(([id, nome]) => (
                <SelectItem key={id} value={id}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={resultado} onValueChange={setResultado}>
            <SelectTrigger aria-label="O que a IA fez">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Tudo o que a IA fez</SelectItem>
              {Object.entries(RESULTADO_LABEL).map(([id, nome]) => (
                <SelectItem key={id} value={id}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={buscaDigitada}
              onChange={(e) => setBuscaDigitada(e.target.value)}
              placeholder="Nome ou final do telefone"
              aria-label="Buscar conversa"
              className="pl-8"
            />
          </div>

          <Select value={ordem} onValueChange={(v) => setOrdem(v as IaOrdem)}>
            <SelectTrigger aria-label="Ordem das conversas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDENS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {dados
              ? `Período: ${rotuloPeriodo(dados.de, dados.ate)}`
              : 'Carregando…'}
          </p>
          <div className="flex gap-2">
            {temFiltro && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={limpar}
              >
                <X className="h-4 w-4" aria-hidden />
                Limpar filtros
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void carregar()}
              disabled={carregando}
            >
              <RefreshCw
                className={carregando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden
              />
              Atualizar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (erro) {
    return (
      <div className="space-y-4">
        {barraFiltros}
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">{erro}</p>
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="space-y-4">
        {barraFiltros}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const p = dados.periodo;
  const dias = [...dados.por_dia].reverse();
  const maxDia = Math.max(1, ...dias.map((d) => d.tokens_entrada));
  const maxFluxo = Math.max(1, ...dados.por_fluxo.map((f) => f.tokens_entrada));
  const maxRes = Math.max(1, ...dados.por_resultado.map((r) => r.execucoes));
  const periodoTxt = rotuloPeriodo(dados.de, dados.ate);

  return (
    <div
      className={cn('space-y-4', carregando && 'opacity-60 transition-opacity')}
    >
      <p className="max-w-3xl text-sm text-muted-foreground">
        Quanto a IA está gastando. O atendimento às famílias é estimado pelo
        tamanho de cada conversa, por isso o custo aparece como faixa: o menor
        valor considera que a parte fixa das instruções veio do cache; o maior,
        que nada veio. O @ju e o resumo do dia usam os números reais da OpenAI.
      </p>

      {barraFiltros}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Coins}
          label={`Período (${periodoTxt})`}
          value={faixa(p)}
          destaque="ok"
          hint={
            <>
              {p.conversas.toLocaleString('pt-BR')} conversas ·{' '}
              {p.execucoes.toLocaleString('pt-BR')} execuções
              {p.conversas > 0 && (
                <>
                  {' '}
                  · média por conversa{' '}
                  {faixa({
                    custo_usd_com_cache: p.custo_medio_conversa_com_cache,
                    custo_usd_sem_cache: p.custo_medio_conversa_sem_cache,
                  })}
                </>
              )}
              {p.puladas > 0 &&
                ` · ${p.puladas.toLocaleString('pt-BR')} sem IA (economia)`}
            </>
          }
        />
        {RAPIDOS.map(({ chave, titulo }) => {
          const t: IaTotais = dados.totais[chave];
          return (
            <Kpi
              key={chave}
              icon={Coins}
              label={titulo}
              value={faixa(t)}
              hint={
                <>
                  {fmtTokens(t.tokens_entrada)} tokens ·{' '}
                  {t.execucoes.toLocaleString('pt-BR')} execuções
                  {t.puladas > 0 &&
                    ` · ${t.puladas.toLocaleString('pt-BR')} sem IA`}
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
          subtitulo={`${periodoTxt}, tokens de entrada. Mostra todos os fluxos para comparar.`}
        >
          {dados.por_fluxo.length === 0 ? (
            <Vazio texto="Nada neste período." />
          ) : (
            <div className="space-y-2">
              {dados.por_fluxo.map((f) => (
                <BarraLinha
                  key={f.fluxo}
                  label={`${FLUXO_LABEL[f.fluxo] ?? f.fluxo} · ${faixa(f)}`}
                  valor={f.tokens_entrada}
                  max={maxFluxo}
                  cor={fluxo === f.fluxo ? SERIE[2] : SERIE[1]}
                  titulo={`${f.execucoes} execuções${f.estimado ? ' (estimado)' : ''}`}
                />
              ))}
            </div>
          )}
        </Secao>

        <Secao
          icon={Gauge}
          titulo="O que a IA fez"
          subtitulo={`${periodoTxt}, execuções. 'Leu e não falou nada' é o desperdício que o filtro corta.`}
        >
          {dados.por_resultado.length === 0 ? (
            <Vazio texto="Nada neste período." />
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
        subtitulo={`${periodoTxt}, tokens de entrada.`}
      >
        {dias.length === 0 ? (
          <Vazio texto="Nada neste período." />
        ) : (
          <div className="space-y-2">
            {dias.map((d) => (
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
        titulo="Conversas"
        subtitulo={`${periodoTxt}. Nome do WhatsApp e final do telefone. Até 100 conversas, em ordem de ${ORDENS.find((o) => o.id === ordem)?.titulo.toLowerCase()}.`}
      >
        {dados.conversas.length === 0 ? (
          <Vazio
            texto={
              busca ? 'Nenhuma conversa com essa busca.' : 'Nada neste período.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Conversa</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Execuções
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Sem IA</th>
                  <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                  <th className="py-2 pr-3 text-right font-medium">Custo</th>
                  <th className="py-2 text-right font-medium">Última</th>
                </tr>
              </thead>
              <tbody>
                {dados.conversas.map((c) => (
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
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {c.puladas > 0 ? c.puladas.toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmtTokens(c.tokens_entrada)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {faixa(c)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {c.ultima}
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
        subtitulo={
          <>
            {periodoTxt}, todos os fluxos da Respira Kids somados, direto da
            conta da OpenAI (dia em UTC; não seguem os filtros de fluxo,
            resultado e busca). Total: {fmtUsd(oficialTotal)}. Outros projetos
            na mesma conta: {fmtUsd(dados.openai_outros_usd)}, fora desta soma.
          </>
        }
      >
        {oficialPorDia.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem dados neste período. A importação roda de hora em hora com a
            chave de administrador da OpenAI.
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
