// AI dev note: Seção de Produtos no detalhe do paciente (admin/secretaria), com duas
// abas: "Venda" (carrinho simples → Finalizar dispara o webhook padrão
// 'venda_produto_criada' p/ o n8n criar a cobrança ASAAS + fluxo Nubank) e "Histórico"
// (vendas anteriores do paciente). A baixa de estoque ocorre quando a venda vira 'pago'.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Loader2,
  AlertTriangle,
  Boxes,
  ShoppingCart,
  Send,
  Receipt,
} from 'lucide-react';
import { ProdutoThumb } from './ProdutoThumb';
import {
  fetchProdutos,
  fetchResponsavelCobranca,
  fetchVendasPaciente,
  finalizarVendaProduto,
  formatBRL,
  type ResponsavelCobranca,
} from '@/lib/produtos-api';
import {
  CATEGORIA_LABELS,
  STATUS_VENDA_LABELS,
  type Produto,
  type StatusVenda,
  type VendaProdutoResumo,
} from '@/types/produtos';

interface PatientProdutosSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_STYLE: Record<StatusVenda, string> = {
  pago: 'bg-verde-pipa/20 text-roxo-titulo border-verde-pipa/30',
  aguardando_pagamento:
    'bg-amarelo-pipa/20 text-amarelo-pipa border-amarelo-pipa/30',
  cancelado: 'bg-muted text-muted-foreground border-border',
  rascunho: 'bg-muted text-muted-foreground border-border',
};

export const PatientProdutosSection = React.memo<PatientProdutosSectionProps>(
  ({ patientId, userRole }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const userId = user?.pessoa?.id ?? '';
    const canManage = userRole === 'admin' || userRole === 'secretaria';

    const [tab, setTab] = useState<'venda' | 'historico'>('venda');
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [responsavel, setResponsavel] = useState<ResponsavelCobranca | null>(
      null
    );
    const [loading, setLoading] = useState(true);
    const [carrinho, setCarrinho] = useState<Record<string, number>>({});
    const [finalizando, setFinalizando] = useState(false);

    const [vendas, setVendas] = useState<VendaProdutoResumo[]>([]);
    const [loadingVendas, setLoadingVendas] = useState(true);

    const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const [prods, resp] = await Promise.all([
          fetchProdutos(),
          fetchResponsavelCobranca(patientId),
        ]);
        setProdutos(prods);
        setResponsavel(resp);
      } catch (err) {
        console.error('[PatientProdutosSection] erro:', err);
      } finally {
        setLoading(false);
      }
    }, [patientId]);

    const loadVendas = useCallback(async () => {
      setLoadingVendas(true);
      try {
        setVendas(await fetchVendasPaciente(patientId));
      } catch (err) {
        console.error('[PatientProdutosSection] erro vendas:', err);
      } finally {
        setLoadingVendas(false);
      }
    }, [patientId]);

    useEffect(() => {
      if (canManage) {
        void loadData();
        void loadVendas();
      }
    }, [canManage, loadData, loadVendas]);

    const produtoById = useMemo(() => {
      const map = new Map<string, Produto>();
      produtos.forEach((p) => map.set(p.id, p));
      return map;
    }, [produtos]);

    const itensCarrinho = useMemo(
      () =>
        Object.entries(carrinho)
          .map(([id, qtd]) => ({
            produto: produtoById.get(id),
            quantidade: qtd,
          }))
          .filter((i): i is { produto: Produto; quantidade: number } =>
            Boolean(i.produto)
          ),
      [carrinho, produtoById]
    );

    const total = useMemo(
      () =>
        itensCarrinho.reduce(
          (acc, i) => acc + (i.produto.preco_venda ?? 0) * i.quantidade,
          0
        ),
      [itensCarrinho]
    );

    const totalItens = useMemo(
      () => Object.values(carrinho).reduce((a, b) => a + b, 0),
      [carrinho]
    );

    const setQtd = (id: string, qtd: number) =>
      setCarrinho((prev) => {
        const next = { ...prev };
        if (qtd <= 0) delete next[id];
        else next[id] = qtd;
        return next;
      });

    const add = (id: string) => setQtd(id, (carrinho[id] ?? 0) + 1);

    const handleFinalizar = async () => {
      if (!responsavel) return;
      if (itensCarrinho.length === 0) {
        toast({ title: 'Carrinho vazio', variant: 'destructive' });
        return;
      }
      setFinalizando(true);
      try {
        await finalizarVendaProduto(
          {
            paciente_id: patientId,
            responsavel_cobranca_id: responsavel.id,
            itens: itensCarrinho,
          },
          userId
        );
        toast({
          title: 'Cobrança enviada',
          description: `Venda de ${formatBRL(total)} registrada para ${responsavel.nome}.`,
        });
        setCarrinho({});
        await loadVendas();
        setTab('historico');
      } catch (err) {
        toast({
          title: 'Erro ao finalizar venda',
          description: err instanceof Error ? err.message : 'Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setFinalizando(false);
      }
    };

    if (!canManage) return null;

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingBag className="h-5 w-5 text-roxo-titulo" />
            Produtos
            {totalItens > 0 && tab === 'venda' && (
              <Badge variant="secondary" className="ml-1">
                {totalItens} no carrinho
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="venda">Venda</TabsTrigger>
              <TabsTrigger value="historico">
                Histórico{vendas.length > 0 ? ` (${vendas.length})` : ''}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === 'venda' ? (
            <VendaTab
              loading={loading}
              produtos={produtos}
              responsavel={responsavel}
              itensCarrinho={itensCarrinho}
              total={total}
              finalizando={finalizando}
              onAdd={add}
              onSetQtd={setQtd}
              onFinalizar={handleFinalizar}
            />
          ) : (
            <HistoricoTab loading={loadingVendas} vendas={vendas} />
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientProdutosSection.displayName = 'PatientProdutosSection';

// =====================================================
// Aba Venda (carrinho)
// =====================================================

interface VendaTabProps {
  loading: boolean;
  produtos: Produto[];
  responsavel: ResponsavelCobranca | null;
  itensCarrinho: { produto: Produto; quantidade: number }[];
  total: number;
  finalizando: boolean;
  onAdd: (id: string) => void;
  onSetQtd: (id: string, qtd: number) => void;
  onFinalizar: () => void;
}

const VendaTab: React.FC<VendaTabProps> = ({
  loading,
  produtos,
  responsavel,
  itensCarrinho,
  total,
  finalizando,
  onAdd,
  onSetQtd,
  onFinalizar,
}) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!responsavel && (
        <Alert className="border-amarelo-pipa/40 bg-amarelo-pipa/10">
          <AlertTriangle className="h-4 w-4 text-amarelo-pipa" />
          <AlertDescription>
            Defina o responsável de cobrança do paciente para vender produtos.
          </AlertDescription>
        </Alert>
      )}

      {produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum produto cadastrado. Cadastre na aba Produtos.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {produtos.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 p-2"
            >
              <ProdutoThumb
                url={p.foto_url}
                alt={p.nome}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {p.nome}
                  </span>
                  {p.eh_kit && (
                    <Boxes className="h-3.5 w-3.5 text-azul-respira" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatBRL(p.preco_venda)}
                  {p.categoria_venda
                    ? ` · ${CATEGORIA_LABELS[p.categoria_venda]}`
                    : ''}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAdd(p.id)}
                className="gap-1 shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Adicionar</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      {itensCarrinho.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </div>
          {itensCarrinho.map(({ produto: p, quantidade }) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onSetQtd(p.id, quantidade - 1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">
                  {quantidade}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onSetQtd(p.id, quantidade + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <span className="w-20 text-right text-sm font-medium tabular-nums">
                {formatBRL((p.preco_venda ?? 0) * quantidade)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onSetQtd(p.id, 0)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm text-muted-foreground">
              {responsavel
                ? `Cobrança: ${responsavel.nome}`
                : 'Sem responsável de cobrança'}
            </span>
            <span className="text-base font-bold text-foreground">
              {formatBRL(total)}
            </span>
          </div>

          <Button
            onClick={onFinalizar}
            disabled={finalizando || !responsavel}
            className="w-full gap-2"
          >
            {finalizando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Finalizar e enviar cobrança
          </Button>
        </div>
      )}
    </div>
  );
};

// =====================================================
// Aba Histórico
// =====================================================

const HistoricoTab: React.FC<{
  loading: boolean;
  vendas: VendaProdutoResumo[];
}> = ({ loading, vendas }) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (vendas.length === 0) {
    return (
      <div className="py-6 text-center">
        <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Nenhuma venda registrada para este paciente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vendas.map((v) => (
        <div
          key={v.id}
          className="rounded-lg border border-border/60 bg-card p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {formatDateTime(v.created_at)}
            </span>
            <Badge
              variant="outline"
              className={cn('text-xs', STATUS_STYLE[v.status])}
            >
              {STATUS_VENDA_LABELS[v.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {v.itens.length > 0
              ? v.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(' · ')
              : 'Sem itens'}
          </p>
          <div className="mt-1 text-right text-sm font-bold text-foreground">
            {formatBRL(v.valor_total)}
          </div>
        </div>
      ))}
    </div>
  );
};
