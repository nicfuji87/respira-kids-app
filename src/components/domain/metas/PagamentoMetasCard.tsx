// AI dev note: Aba "Pagamento" da tela de Metas (só admin). Responde três
// perguntas do dono: quantas evoluções saíram por tipo (respiratória x motora),
// quem bateu a meta e quanto pagar a cada uma. A regra inteira vem do servidor
// (fn_metas_pagamentos); aqui não se calcula bônus.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Progress } from '@/components/primitives/progress';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  Wallet,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchEvolucoesProgresso,
  fetchMetasPagamentos,
  NOME_GRUPO,
  type MetasPagamentos,
} from '@/lib/metas-pagamentos-api';
import { EvolucoesProgresso } from '@/components/domain/processo-seletivo/EvolucoesProgresso';
import type { EvolucoesCelular } from '@/lib/estagio-celular-api';

const brl = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const pct = (v: number | null | undefined) =>
  `${Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const dataBR = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split('-').reverse().join('/') : '—';

export interface PagamentoMetasCardProps {
  mes: number;
  ano: number;
}

export const PagamentoMetasCard: React.FC<PagamentoMetasCardProps> = ({
  mes,
  ano,
}) => {
  const [dados, setDados] = useState<MetasPagamentos | null>(null);
  // AI dev note: mesma tela do celular da estagiária (calendário + pendências)
  const [progresso, setProgresso] = useState<{
    dados: EvolucoesCelular;
    recebidoEm: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [pag, prog] = await Promise.all([
        fetchMetasPagamentos(mes, ano),
        fetchEvolucoesProgresso(mes, ano),
      ]);
      setDados(pag);
      setProgresso({ dados: prog, recebidoEm: Date.now() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading && !dados) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (erro) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="flex-1 text-sm">Não foi possível carregar: {erro}</p>
          <Button variant="ghost" size="sm" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!dados) return null;

  const { regras, secretaria } = dados;
  const mesCorrente =
    dados.mes ===
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      {/* Total + contexto da regra */}
      <Card className="border-verde-pipa/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5 text-azul-respira" />
              Total a pagar no mês
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => void carregar()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
          <div className="text-3xl font-bold tabular-nums mt-1">
            {brl(dados.total_a_pagar)}
          </div>
          {mesCorrente && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              Mês em andamento: o valor ainda pode cair se aparecerem evoluções
              fora do prazo.
            </p>
          )}
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            Estagiárias: {brl(regras.bonus_base)} por mês, menos{' '}
            {brl(regras.desconto_por_perdida)} por sessão sem evolução no prazo
            (24h; fim de semana vence segunda). Domiciliar fica de fora
            {dados.domiciliares_fora > 0 &&
              ` (${dados.domiciliares_fora} no mês)`}
            . O bônus é da dupla: as duas recebem o mesmo valor.
          </p>
          {regras.proporcional && (
            <p className="text-foreground">
              Mês proporcional: a regra valeu {regras.dias_vigentes} dos{' '}
              {regras.dias_mes} dias (a partir de{' '}
              {dataBR(regras.vigencia_inicio)}), então a base do mês é{' '}
              {brl(regras.base_do_mes)} em vez de {brl(regras.bonus_base)}.
            </p>
          )}
          {!regras.conta_motora && (
            <p>
              A motora ainda não entra no bônus: passa a contar em{' '}
              {dataBR(regras.motora_desde)}, com a evolução motora nova já
              rodando.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Evoluções por tipo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evoluções por tipo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sessões realizadas no mês cujo prazo já venceu.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Tipo
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Sessões
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Com evolução
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    No prazo
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Perdidas
                  </th>
                </tr>
              </thead>
              <tbody>
                {dados.por_tipo.map((t) => (
                  <tr key={t.grupo} className="border-t">
                    <td className="px-3 py-2">
                      <span className="font-medium">
                        {NOME_GRUPO[t.grupo] ?? t.grupo}
                      </span>
                      {!t.conta_no_bonus && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          fora do bônus
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.sessoes}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.com_evolucao}{' '}
                      <span className="text-muted-foreground">
                        ({pct(t.pct_cobertura)})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.no_prazo}{' '}
                      <span className="text-muted-foreground">
                        ({pct(t.pct_no_prazo)})
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        t.perdidas > 0 && t.conta_no_bonus && 'text-destructive'
                      )}
                    >
                      {t.perdidas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Entram na conta do bônus {dados.contadas} sessões, com{' '}
            {dados.perdidas} perdidas.
          </p>
        </CardContent>
      </Card>

      {/* Progresso do mês: a mesma tela que a estagiária vê no celular */}
      {progresso && (
        <EvolucoesProgresso
          dados={progresso.dados}
          recebidoEm={progresso.recebidoEm}
        />
      )}

      {/* Estagiárias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estagiárias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dados.estagiarias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma estagiária com ponto registrado neste mês.
            </p>
          ) : (
            dados.estagiarias.map((e) => (
              <div
                key={e.nome}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {e.nome}
                    <Badge variant="outline" className="text-[10px]">
                      {e.turno === 'manha' ? 'Manhã' : 'Tarde'}
                    </Badge>
                    {e.bateu ? (
                      <Badge className="text-[10px] gap-1 bg-verde-pipa text-roxo-titulo hover:bg-verde-pipa">
                        <CheckCircle2 className="h-3 w-3" />
                        Bateu
                      </Badge>
                    ) : (
                      <Badge
                        variant="destructive"
                        className="text-[10px] gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        Não bateu
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {e.dias_trabalhados} dias de ponto · {e.perdidas_do_turno}{' '}
                    perdidas no turno dela (de {e.sessoes_do_turno} sessões)
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums">
                    {brl(e.a_pagar)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    a pagar
                  </div>
                </div>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            As perdidas do mês inteiro são somadas e o valor é o mesmo para as
            duas ({dados.perdidas} perdidas × {brl(regras.desconto_por_perdida)}{' '}
            sobre {brl(regras.base_do_mes)}). O número por turno fica aqui só
            para a conversa individual.
          </p>
        </CardContent>
      </Card>

      {/* Secretaria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Secretaria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!secretaria?.nome ? (
            <p className="text-sm text-muted-foreground">
              Não há metas de reativação cadastradas para este mês.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {secretaria.nome}
                    {secretaria.requisito_ok &&
                    Number(secretaria.bonus_nivel) > 0 ? (
                      <Badge className="text-[10px] gap-1 bg-verde-pipa text-roxo-titulo hover:bg-verde-pipa">
                        <CheckCircle2 className="h-3 w-3" />
                        Bateu
                      </Badge>
                    ) : (
                      <Badge
                        variant="destructive"
                        className="text-[10px] gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        Não bateu
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Contatos (libera o bônus)</span>
                      <span className="tabular-nums">
                        {Number(secretaria.contatos ?? 0)} /{' '}
                        {Number(secretaria.contatos_meta ?? 0)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        (Number(secretaria.contatos ?? 0) /
                          Math.max(1, Number(secretaria.contatos_meta ?? 0))) *
                          100
                      )}
                      className="h-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Pacientes reativados</span>
                      <span className="tabular-nums">
                        {Number(secretaria.reativacoes ?? 0)}
                        {secretaria.proximo_nivel
                          ? ` · próximo nível: ${Number(secretaria.proximo_nivel)}`
                          : ''}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        (Number(secretaria.reativacoes ?? 0) /
                          Math.max(
                            1,
                            Number(secretaria.reativacoes_meta ?? 0)
                          )) *
                          100
                      )}
                      className="h-2"
                    />
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Pesquisa de experiência:{' '}
                    {Number(secretaria.convites_pesquisa ?? 0)} convites e{' '}
                    {Number(secretaria.respostas_pesquisa ?? 0)} respostas (sem
                    bônus no piloto).
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums">
                    {brl(dados.secretaria_a_pagar)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    a pagar
                  </div>
                </div>
              </div>

              {!secretaria.requisito_ok && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />O bônus por
                  reativação só é liberado com{' '}
                  {Number(secretaria.contatos_meta ?? 0)} contatos registrados
                  no mês.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

PagamentoMetasCard.displayName = 'PagamentoMetasCard';
