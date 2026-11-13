// AI dev note: aba "Acompanhamento" da Rotina (só admin). Cada ocorrência conta no dia do
// prazo: no prazo, atrasada (feita depois) ou não feita. Diária não feita não passa para o
// dia seguinte, então aparece aqui como perdida. Período: últimos 7, 30 ou o mês atual.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Progress } from '@/components/primitives/progress';
import { cn } from '@/lib/utils';
import {
  BLOCOS,
  dataCurta,
  fetchRotinaHistorico,
  type RotinaHistorico,
} from '@/lib/rotina-api';

type Periodo = '7' | '30' | 'mes';

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function intervalo(p: Periodo): [string, string] {
  const hoje = new Date();
  if (p === 'mes')
    return [
      isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      isoLocal(hoje),
    ];
  const ini = new Date(hoje);
  ini.setDate(ini.getDate() - (Number(p) - 1));
  return [isoLocal(ini), isoLocal(hoje)];
}

export function RotinaAcompanhamento() {
  const [periodo, setPeriodo] = useState<Periodo>('7');
  const [dados, setDados] = useState<RotinaHistorico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [i, f] = intervalo(periodo);
      setDados(await fetchRotinaHistorico(i, f));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totais = useMemo(() => {
    const d = dados?.dias ?? [];
    const soma = (
      k: 'total' | 'no_prazo' | 'atrasadas' | 'nao_feitas' | 'pendentes'
    ) => d.reduce((s, x) => s + x[k], 0);
    const fechadas = soma('total') - soma('pendentes');
    return {
      fechadas,
      noPrazo: soma('no_prazo'),
      atrasadas: soma('atrasadas'),
      naoFeitas: soma('nao_feitas'),
      pct:
        fechadas > 0 ? Math.round((soma('no_prazo') / fechadas) * 100) : null,
    };
  }, [dados]);

  const tituloBloco = (b: string) =>
    BLOCOS.find((x) => x.valor === b)?.titulo ?? b;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['7', 'Últimos 7 dias'],
            ['30', 'Últimos 30 dias'],
            ['mes', 'Este mês'],
          ] as Array<[Periodo, string]>
        ).map(([v, l]) => (
          <Button
            key={v}
            size="sm"
            variant={periodo === v ? 'default' : 'outline'}
            onClick={() => setPeriodo(v)}
          >
            {l}
          </Button>
        ))}
        {carregando && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {dados && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Numero
              titulo="Feitas no prazo"
              valor={totais.pct === null ? '—' : `${totais.pct}%`}
            />
            <Numero titulo="No prazo" valor={totais.noPrazo} />
            <Numero titulo="Feitas com atraso" valor={totais.atrasadas} />
            <Numero
              titulo="Não feitas"
              valor={totais.naoFeitas}
              ruim={totais.naoFeitas > 0}
            />
          </div>

          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="text-sm font-semibold">Por dia</p>
              {dados.dias.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há dias no período (a rotina começou em 09/11/2026).
                </p>
              ) : (
                <ul className="divide-y">
                  {dados.dias.map((d) => {
                    const fechadas = d.total - d.pendentes;
                    const pct =
                      fechadas > 0 ? (d.no_prazo / fechadas) * 100 : 0;
                    return (
                      <li
                        key={d.dia}
                        className="flex items-center gap-3 py-2 text-sm"
                      >
                        <span className="w-24 shrink-0 capitalize">
                          {dataCurta(d.dia)}
                        </span>
                        <Progress
                          value={d.pendentes === d.total ? 0 : pct}
                          className="h-2 flex-1"
                        />
                        <span className="w-56 shrink-0 text-right text-xs text-muted-foreground">
                          {d.pendentes === d.total
                            ? `${d.total} em andamento`
                            : `${d.no_prazo} no prazo · ${d.atrasadas} com atraso · `}
                          {d.pendentes !== d.total && (
                            <span
                              className={cn(
                                d.nao_feitas > 0 &&
                                  'font-medium text-destructive'
                              )}
                            >
                              {d.nao_feitas} não feitas
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="text-sm font-semibold">O que mais fica para trás</p>
              {dados.tarefas.filter((t) => t.nao_feitas + t.atrasadas > 0)
                .length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nada atrasado ou perdido no período.
                </p>
              ) : (
                <ul className="divide-y">
                  {dados.tarefas
                    .filter((t) => t.nao_feitas + t.atrasadas > 0)
                    .map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          {t.titulo}{' '}
                          <span className="text-xs text-muted-foreground">
                            · {tituloBloco(t.bloco)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              t.nao_feitas > 0 && 'font-medium text-destructive'
                            )}
                          >
                            {t.nao_feitas} de {t.total} não feitas
                          </span>
                          {t.atrasadas > 0 && ` · ${t.atrasadas} com atraso`}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Numero({
  titulo,
  valor,
  ruim,
}: {
  titulo: string;
  valor: number | string;
  ruim?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums',
            ruim && 'text-destructive'
          )}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
