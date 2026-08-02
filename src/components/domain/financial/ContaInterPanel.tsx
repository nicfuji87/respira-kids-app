// AI dev note: Painel da conta do Banco Inter na aba Financeiro.
// Saldo + extrato (admin e secretaria). O extrato é a base da conciliação:
// mostra o que caiu de verdade na conta, contra o que o sistema registrou.
//
// Pagamento NÃO fica aqui de propósito — está em ContaInterPagamento, separado,
// só para admin. Misturar "ver o saldo" com "mandar dinheiro" na mesma tela é
// como um clique errado vira prejuízo.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Landmark,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchContaInter,
  type ContaInterResposta,
} from '@/lib/inter-conta-api';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtrasISO = (dias: number) =>
  new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

function formatarDia(iso: string): string {
  // vem como YYYY-MM-DD; montar Date direto viraria UTC e podia voltar um dia
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}` : iso;
}

export const ContaInterPanel: React.FC = () => {
  const [dados, setDados] = useState<ContaInterResposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [inicio, setInicio] = useState(diasAtrasISO(30));
  const [fim, setFim] = useState(hojeISO());

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fetchContaInter({ dataInicio: inicio, dataFim: fim }));
    } catch (e) {
      console.error('[ContaInterPanel]', e);
      setErro(
        e instanceof Error ? e.message : 'Não conseguimos consultar a conta.'
      );
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim]);

  useEffect(() => {
    void carregar();
    // recarrega só quando o usuário pedir ou mudar o período
  }, [carregar]);

  const saldo = dados?.saldo;
  const transacoes = dados?.extrato?.transacoes ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-azul-respira/30">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Landmark className="h-5 w-5 text-roxo-titulo" />
              Conta Banco Inter
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void carregar()}
              disabled={carregando}
              className="gap-2 self-start md:self-auto"
            >
              <RefreshCw
                className={cn('h-4 w-4', carregando && 'animate-spin')}
              />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {carregando && !dados ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : erro ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">{erro}</p>
            </div>
          ) : saldo ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-verde-pipa/30 bg-verde-pipa/10 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Disponível
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-roxo-titulo">
                  {formatBRL(Number(saldo.disponivel ?? 0))}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Limite
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {formatBRL(Number(saldo.limite ?? 0))}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Bloqueado
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {formatBRL(
                    Number(saldo.bloqueadoJudicialmente ?? 0) +
                      Number(saldo.bloqueadoAdministrativo ?? 0) +
                      Number(saldo.bloqueadoCheque ?? 0)
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="extrato-inicio" className="text-xs">
                De
              </Label>
              <Input
                id="extrato-inicio"
                type="date"
                value={inicio}
                max={fim}
                onChange={(e) => setInicio(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extrato-fim" className="text-xs">
                Até
              </Label>
              <Input
                id="extrato-fim"
                type="date"
                value={fim}
                min={inicio}
                max={hojeISO()}
                onChange={(e) => setFim(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O Inter aceita no máximo 90 dias por consulta.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Extrato
            {dados?.extrato?.totalElementos ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {dados.extrato.totalElementos} lançamento
                {dados.extrato.totalElementos === 1 ? '' : 's'}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : transacoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma movimentação no período.
            </p>
          ) : (
            <div className="space-y-1.5">
              {transacoes.map((t) => {
                const entrada = t.tipoOperacao === 'C';
                return (
                  <div
                    key={t.idTransacao}
                    className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        entrada
                          ? 'bg-verde-pipa/20 text-verde-pipa'
                          : 'bg-destructive/10 text-destructive'
                      )}
                    >
                      {entrada ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {t.titulo || t.tipoTransacao}
                      </p>
                      {t.descricao && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.descricao}
                        </p>
                      )}
                    </div>

                    <Badge variant="outline" className="shrink-0 text-xs">
                      {formatarDia(t.dataTransacao)}
                    </Badge>

                    <span
                      className={cn(
                        'w-28 shrink-0 text-right text-sm font-semibold tabular-nums',
                        entrada ? 'text-verde-pipa' : 'text-foreground'
                      )}
                    >
                      {entrada ? '+' : '−'}
                      {formatBRL(Math.abs(Number(t.valor)))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
