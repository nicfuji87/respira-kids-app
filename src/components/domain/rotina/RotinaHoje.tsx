// AI dev note: visão "Hoje" da Rotina da recepção. A secretária usa no computador da
// recepção. Ordem da tela: metas do mês (cota de hoje e quando fazer) → atrasadas (semana
// e mês que passaram do prazo) → blocos do dia, com o bloco da hora atual destacado.
// Tarefa "auto" não tem caixa para marcar: o banco marca sozinho quando o número fica certo
// (sessões sem status zeradas, cota batida). O admin vê a mesma tela, com as metas da secretária.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import { Progress } from '@/components/primitives/progress';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  BLOCOS,
  dataCurta,
  fetchRotinaDia,
  marcarTarefa,
  type BlocoRotina,
  type MetaDoDia,
  type RotinaDia,
  type TarefaDoDia,
} from '@/lib/rotina-api';

const ATUALIZAR_MS = 5 * 60 * 1000;

function blocoDaHora(hhmm: string): BlocoRotina {
  if (hhmm < '08:00') return 'abertura';
  if (hhmm < '12:00') return 'manha';
  if (hhmm < '13:00') return 'almoco';
  if (hhmm < '17:30') return 'tarde';
  return 'fechamento';
}

function horaCurta(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function horario(h: string | null): string {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return mm === '00' ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
}

export function RotinaHoje() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RotinaDia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await fetchRotinaDia());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const alternar = async (t: TarefaDoDia, feito: boolean) => {
    setSalvando(t.id);
    try {
      await marcarTarefa(t.id, t.data_ref, feito);
      await carregar();
    } catch (e) {
      toast({
        title: 'Não deu para marcar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSalvando(null);
    }
  };

  const agoraBloco = dados ? blocoDaHora(dados.agora.slice(11, 16)) : null;

  const { atrasadas, porBloco, feitas, total } = useMemo(() => {
    const ts = dados?.tarefas ?? [];
    const atrasadas = ts.filter((t) => t.atrasada);
    const doDia = ts.filter((t) => !t.atrasada);
    const porBloco = new Map<BlocoRotina, TarefaDoDia[]>();
    for (const b of BLOCOS) porBloco.set(b.valor, []);
    for (const t of doDia) porBloco.get(t.bloco)?.push(t);
    for (const lista of porBloco.values())
      lista.sort((a, b) => (a.horario ?? '').localeCompare(b.horario ?? ''));
    return {
      atrasadas,
      porBloco,
      feitas: ts.filter((t) => t.feito).length,
      total: ts.length,
    };
  }, [dados]);

  if (!dados && !erro) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <span className="text-sm text-destructive">
            Não foi possível carregar a rotina: {erro}
          </span>
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!dados) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold capitalize">
            {dataCurta(dados.dia)}
          </p>
          <p className="text-sm text-muted-foreground">
            {total === 0 ? 'Nada para hoje.' : `${feitas} de ${total} feitas`}
            {atrasadas.length > 0 &&
              ` · ${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <Progress
              value={(feitas / total) * 100}
              className="h-2 w-40"
              aria-label="Tarefas feitas"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={carregar}
            disabled={carregando}
          >
            <RefreshCw className={cn(carregando && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {dados.metas.length > 0 && (
        <MetasDoMes metas={dados.metas} nome={dados.secretaria?.nome} />
      )}

      {!dados.dia_util && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            Hoje não é dia útil. Aparecem só as tarefas que ficaram atrasadas.
          </CardContent>
        </Card>
      )}

      {atrasadas.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="space-y-1 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Passaram do prazo
            </p>
            <ul className="divide-y divide-destructive/15">
              {atrasadas.map((t) => (
                <LinhaTarefa
                  key={t.id + t.data_ref}
                  t={t}
                  salvando={salvando === t.id}
                  onMarcar={alternar}
                  onAbrir={(l) => navigate(l)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {BLOCOS.map((b) => {
          const lista = porBloco.get(b.valor) ?? [];
          if (lista.length === 0) return null;
          const agora = dados.dia_util && b.valor === agoraBloco;
          const feitasBloco = lista.filter((t) => t.feito).length;
          return (
            <Card
              key={b.valor}
              className={cn(agora && 'border-primary ring-1 ring-primary/30')}
            >
              <CardContent className="space-y-1 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {b.titulo}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {b.faixa}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    {agora && <Badge>Agora</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {feitasBloco}/{lista.length}
                    </span>
                  </div>
                </div>
                <ul className="divide-y">
                  {lista.map((t) => (
                    <LinhaTarefa
                      key={t.id + t.data_ref}
                      t={t}
                      salvando={salvando === t.id}
                      onMarcar={alternar}
                      onAbrir={(l) => navigate(l)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LinhaTarefa({
  t,
  salvando,
  onMarcar,
  onAbrir,
}: {
  t: TarefaDoDia;
  salvando: boolean;
  onMarcar: (t: TarefaDoDia, feito: boolean) => void;
  onAbrir: (link: string) => void;
}) {
  const ind = t.indicador_valor;
  const indRuim = ind && ind.ok !== true && (ind.valor ?? 0) > 0;
  const idCheck = `rotina-${t.id}-${t.data_ref}`;

  return (
    <li className="flex gap-3 py-2.5">
      <div className="pt-0.5">
        {t.auto ? (
          t.feito ? (
            <CheckCircle2
              className="h-5 w-5 text-verde-pipa"
              aria-label="Feito pelo sistema"
            />
          ) : (
            <Sparkles
              className="h-5 w-5 text-muted-foreground"
              aria-label="O sistema marca sozinho"
            />
          )
        ) : salvando ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Checkbox
            id={idCheck}
            checked={t.feito}
            onCheckedChange={(v) => onMarcar(t, v === true)}
            className="h-5 w-5"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label
            htmlFor={t.auto ? undefined : idCheck}
            className={cn(
              'text-sm font-medium',
              !t.auto && 'cursor-pointer',
              t.feito && 'text-muted-foreground line-through'
            )}
          >
            {t.titulo}
          </label>
          {t.horario && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {horario(t.horario)}
            </span>
          )}
          {t.frequencia === 'semanal' && (
            <Badge variant="secondary">Da semana</Badge>
          )}
          {t.frequencia === 'mensal' && (
            <Badge variant="secondary">
              Do mês
              {t.prazo !== t.data_ref && ` · prazo ${dataCurta(t.prazo)}`}
            </Badge>
          )}
          {t.atrasada && (
            <Badge variant="destructive">Era para {dataCurta(t.prazo)}</Badge>
          )}
        </div>
        {t.detalhe && !t.feito && (
          <p className="text-xs text-muted-foreground">{t.detalhe}</p>
        )}
        {ind && !t.feito && (
          <p
            className={cn(
              'text-xs font-medium',
              indRuim ? 'text-destructive' : 'text-verde-pipa'
            )}
          >
            {ind.texto}
          </p>
        )}
        {t.feito && (
          <p className="text-xs text-muted-foreground">
            {t.feito_por === 'Sistema'
              ? `Conferido pelo sistema às ${horaCurta(t.feito_em)}`
              : `Feito${t.feito_por ? ` por ${t.feito_por}` : ''} às ${horaCurta(t.feito_em)}`}
          </p>
        )}
      </div>
      {t.link && !t.feito && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onAbrir(t.link as string)}
        >
          Abrir
          <ExternalLink />
        </Button>
      )}
    </li>
  );
}

function fmt(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function MetasDoMes({ metas, nome }: { metas: MetaDoDia[]; nome?: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Metas do mês
          {nome && (
            <span className="font-normal text-muted-foreground">
              · {nome.split(' ')[0]}
            </span>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metas.map((m) => (
            <MetaTile key={m.id} m={m} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetaTile({ m }: { m: MetaDoDia }) {
  const pct =
    m.valor_meta > 0 ? Math.min(100, (m.valor_atual / m.valor_meta) * 100) : 0;
  const temCota = m.cota_hoje !== null;
  const cotaBatida = temCota && (m.hoje ?? 0) >= (m.cota_hoje ?? 0);
  const proximo = m.niveis?.find((n) => m.valor_atual < n.valor) ?? null;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{m.titulo}</p>
        {m.valor_atual >= m.valor_meta ? (
          <Badge variant="success">Batida</Badge>
        ) : m.no_ritmo ? (
          <Badge variant="secondary">No ritmo</Badge>
        ) : (
          <Badge variant="destructive">Atrasada</Badge>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        {fmt(m.valor_atual)}
        <span className="text-sm font-normal text-muted-foreground">
          {' '}
          / {fmt(m.valor_meta)} {m.unidade}
        </span>
      </p>
      <Progress value={pct} className="h-1.5" />
      {temCota && (
        <p
          className={cn(
            'text-sm font-medium',
            cotaBatida ? 'text-verde-pipa' : 'text-foreground'
          )}
        >
          {m.cota_hoje === 0
            ? 'Nada a fazer hoje.'
            : `Hoje: ${fmt(m.hoje)} de ${m.cota_hoje}`}
        </p>
      )}
      {!m.no_ritmo && m.valor_atual < m.valor_meta && (
        <p className="text-xs text-destructive">
          Até hoje o esperado era {fmt(m.esperado_ate_hoje)}.
        </p>
      )}
      {proximo && (
        <p className="text-xs text-muted-foreground">
          Próximo nível: {proximo.valor} → bônus de R$ {proximo.bonus}
          {m.requisito_ok === false && m.requisito_titulo
            ? ` (só vale com a meta de ${m.requisito_titulo.toLowerCase()} batida)`
            : ''}
        </p>
      )}
      {m.quando && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Quando: </span>
          {m.quando}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {m.dias_uteis_restantes} dia{m.dias_uteis_restantes === 1 ? '' : 's'}{' '}
        úte{m.dias_uteis_restantes === 1 ? 'il' : 'is'} até o fim do mês
      </p>
    </div>
  );
}
