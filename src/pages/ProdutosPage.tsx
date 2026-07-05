// AI dev note: Página Produtos (admin + secretaria) — CATÁLOGO do que a clínica vende
// (espaçadores, brinquedos, kits). O controle de quantidade/estoque fica na aba Estoque
// (mesmo banco: produtos_servicos). Venda + cobrança ASAAS entram na Fase 2.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Switch } from '@/components/primitives/switch';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Package,
  ShoppingBag,
  Plus,
  Pencil,
  RefreshCw,
  Boxes,
  AlertTriangle,
} from 'lucide-react';
import {
  ProdutoFormDialog,
  StatCard,
  ProdutoThumb,
} from '@/components/domain/produtos';
import { fetchProdutos, setProdutoAtivo, formatBRL } from '@/lib/produtos-api';
import {
  CATEGORIA_LABELS,
  type CategoriaVenda,
  type Produto,
} from '@/types/produtos';

export const ProdutosPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.pessoa?.id ?? '';

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incluirInativos, setIncluirInativos] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProdutos(await fetchProdutos({ incluirInativos }));
    } catch (err) {
      console.error('[ProdutosPage] erro ao carregar:', err);
      setError('Não conseguimos carregar os produtos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [incluirInativos]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const kpis = useMemo(() => {
    const porCategoria = (c: CategoriaVenda) =>
      produtos.filter((p) => p.categoria_venda === c).length;
    return {
      total: produtos.length,
      espacadores: porCategoria('espacador'),
      brinquedos: porCategoria('brinquedo'),
    };
  }, [produtos]);

  const handleNovo = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const handleEditar = (p: Produto) => {
    setEditing(p);
    setFormOpen(true);
  };
  const handleToggleAtivo = async (p: Produto) => {
    try {
      await setProdutoAtivo(p.id, !p.ativo, userId);
      toast({ title: p.ativo ? 'Produto inativado' : 'Produto reativado' });
      void loadData();
    } catch (err) {
      toast({
        title: 'Erro ao atualizar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Produtos
          </h1>
          <p className="text-muted-foreground mt-1">
            Catálogo de espaçadores, brinquedos e kits vendidos na clínica. O
            estoque fica na aba Estoque.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" onClick={handleNovo} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo produto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={ShoppingBag}
          tone="roxo"
          label="Produtos ativos"
          value={loading ? '—' : kpis.total}
        />
        <StatCard
          icon={Package}
          tone="azul"
          label="Espaçadores"
          value={loading ? '—' : kpis.espacadores}
        />
        <StatCard
          icon={Boxes}
          tone="verde"
          label="Brinquedos"
          value={loading ? '—' : kpis.brinquedos}
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

      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch
            checked={incluirInativos}
            onCheckedChange={setIncluirInativos}
          />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : produtos.length === 0 ? (
        <EmptyState onNovo={handleNovo} />
      ) : (
        <div className="space-y-2">
          {produtos.map((p) => (
            <ProdutoRow
              key={p.id}
              produto={p}
              onEditar={() => handleEditar(p)}
              onToggleAtivo={() => handleToggleAtivo(p)}
            />
          ))}
        </div>
      )}

      <ProdutoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        produto={editing}
        produtosDisponiveis={produtos}
        userId={userId}
        onSaved={loadData}
      />
    </div>
  );
};

interface ProdutoRowProps {
  produto: Produto;
  onEditar: () => void;
  onToggleAtivo: () => void;
}

const ProdutoRow: React.FC<ProdutoRowProps> = ({
  produto: p,
  onEditar,
  onToggleAtivo,
}) => (
  <div
    className={cn(
      'rounded-xl border bg-card p-4 flex items-center gap-4 flex-wrap',
      !p.ativo && 'opacity-60',
      'border-border/60'
    )}
  >
    <ProdutoThumb url={p.foto_url} alt={p.nome} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-foreground truncate">{p.nome}</span>
        {p.categoria_venda && (
          <Badge variant="outline" className="text-xs">
            {CATEGORIA_LABELS[p.categoria_venda]}
          </Badge>
        )}
        {p.eh_kit && (
          <Badge
            variant="secondary"
            className="text-xs bg-azul-respira/15 text-azul-respira border-azul-respira/20"
          >
            <Boxes className="w-3 h-3 mr-1" /> Kit
          </Badge>
        )}
        {!p.ativo && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Inativo
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
        <span className="font-medium text-foreground">
          {formatBRL(p.preco_venda)}
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono text-xs">{p.codigo}</span>
        {p.controla_estoque && !p.eh_kit && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-xs">{p.estoque_atual} em estoque</span>
          </>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={onEditar}
        title="Editar produto"
      >
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleAtivo}
        className="text-xs"
      >
        {p.ativo ? 'Inativar' : 'Reativar'}
      </Button>
    </div>
  </div>
);

const EmptyState: React.FC<{ onNovo: () => void }> = ({ onNovo }) => (
  <Card className="bg-bege-fundo/30 border-azul-respira/20">
    <CardContent className="p-8 text-center space-y-3">
      <Package className="w-12 h-12 text-azul-respira mx-auto" />
      <p className="text-base text-foreground font-medium">
        Nenhum produto cadastrado
      </p>
      <p className="text-sm text-muted-foreground">
        Cadastre espaçadores, brinquedos e kits para vender na clínica.
      </p>
      <Button onClick={onNovo} className="gap-2">
        <Plus className="w-4 h-4" /> Novo produto
      </Button>
    </CardContent>
  </Card>
);

export default ProdutosPage;
