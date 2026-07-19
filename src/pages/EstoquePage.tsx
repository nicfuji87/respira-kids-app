// AI dev note: Página Estoque (admin + secretaria) — POSIÇÃO e movimentação de estoque
// dos produtos controlados (mesmo banco da aba Produtos: produtos_servicos +
// estoque_movimentos). Kits não aparecem aqui (não têm estoque próprio; consomem
// componentes). Cadastro do produto em si fica na aba Produtos.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Boxes,
  AlertTriangle,
  TrendingUp,
  ArrowLeftRight,
  RefreshCw,
  PackageOpen,
} from 'lucide-react';
import {
  EstoqueMovimentoDialog,
  StatCard,
  MovimentacoesList,
} from '@/components/domain/produtos';
import {
  fetchProdutos,
  fetchMovimentos,
  isEstoqueBaixo,
  formatBRL,
} from '@/lib/produtos-api';
import { CATEGORIA_LABELS, type Produto } from '@/types/produtos';
import type { EstoqueMovimento } from '@/types/produtos';

export const EstoquePage: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.pessoa?.id ?? '';

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentos, setMovimentos] = useState<EstoqueMovimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'posicao' | 'movimentacoes'>('posicao');

  const [movOpen, setMovOpen] = useState(false);
  const [movProduto, setMovProduto] = useState<Produto | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prods, movs] = await Promise.all([
        fetchProdutos(),
        fetchMovimentos({ limit: 80 }),
      ]);
      setProdutos(prods);
      setMovimentos(movs);
    } catch (err) {
      console.error('[EstoquePage] erro ao carregar:', err);
      setError('Não conseguimos carregar o estoque. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // apenas itens que controlam estoque próprio (kits ficam de fora)
  const itensEstoque = useMemo(
    () => produtos.filter((p) => p.controla_estoque && !p.eh_kit),
    [produtos]
  );

  const kpis = useMemo(() => {
    const valorEstoque = itensEstoque.reduce(
      (acc, p) => acc + p.estoque_atual * (p.preco_venda ?? 0),
      0
    );
    return {
      itens: itensEstoque.length,
      baixo: itensEstoque.filter((p) => isEstoqueBaixo(p)).length,
      valor: valorEstoque,
    };
  }, [itensEstoque]);

  const handleMovimentar = (p: Produto) => {
    setMovProduto(p);
    setMovOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Estoque
          </h1>
          <p className="text-muted-foreground mt-1">
            Posição e movimentação dos produtos. O cadastro fica na aba
            Produtos.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Boxes}
          tone="roxo"
          label="Itens controlados"
          value={loading ? '—' : kpis.itens}
        />
        <StatCard
          icon={AlertTriangle}
          tone="amarelo"
          label="Estoque baixo"
          value={loading ? '—' : kpis.baixo}
        />
        <StatCard
          icon={TrendingUp}
          tone="verde"
          label="Valor em estoque"
          value={loading ? '—' : formatBRL(kpis.valor)}
        />
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="flex-1 text-sm text-foreground">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => void loadData()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="posicao">Posição</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tab === 'posicao' ? (
        itensEstoque.length === 0 ? (
          <Card className="bg-bege-fundo/30 border-azul-respira/20">
            <CardContent className="p-8 text-center space-y-2">
              <PackageOpen className="w-10 h-10 text-azul-respira mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nenhum produto com controle de estoque. Ative "Controla estoque"
                no cadastro do produto.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {itensEstoque.map((p) => (
              <EstoqueRow
                key={p.id}
                produto={p}
                onMovimentar={() => handleMovimentar(p)}
              />
            ))}
          </div>
        )
      ) : (
        <MovimentacoesList movimentos={movimentos} />
      )}

      <EstoqueMovimentoDialog
        open={movOpen}
        onOpenChange={setMovOpen}
        produto={movProduto}
        userId={userId}
        onSaved={loadData}
      />
    </div>
  );
};

const EstoqueRow: React.FC<{ produto: Produto; onMovimentar: () => void }> = ({
  produto: p,
  onMovimentar,
}) => {
  const baixo = isEstoqueBaixo(p);
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 flex items-center gap-4',
        baixo ? 'border-amarelo-pipa/50' : 'border-border/60'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground truncate">
            {p.nome}
          </span>
          {p.categoria_venda && (
            <Badge variant="outline" className="text-xs">
              {CATEGORIA_LABELS[p.categoria_venda]}
            </Badge>
          )}
          {baixo && (
            <Badge variant="warning" className="text-xs">
              Estoque baixo
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          mínimo {p.estoque_minimo} {p.unidade_medida}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div
          className={cn(
            'text-xl font-bold',
            baixo ? 'text-roxo-titulo' : 'text-foreground'
          )}
        >
          {p.estoque_atual}
        </div>
        <div className="text-xs text-muted-foreground">{p.unidade_medida}</div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onMovimentar}
        className="gap-2 shrink-0"
      >
        <ArrowLeftRight className="w-4 h-4" />
        <span className="hidden sm:inline">Movimentar</span>
      </Button>
    </div>
  );
};

export default EstoquePage;
