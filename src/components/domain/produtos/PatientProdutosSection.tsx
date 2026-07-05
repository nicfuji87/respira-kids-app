// AI dev note: Seção de Produtos no detalhe do paciente (admin/secretaria).
// Fluxo simples: escolhe produto → adiciona ao carrinho → Finalizar. Finalizar cria a
// venda (produto_vendas + itens) e enfileira o webhook 'venda_produto_criada' para o
// n8n criar a cobrança ASAAS (origem=produto) e tocar o fluxo Nubank. A baixa de
// estoque acontece sozinha quando a venda vira 'pago' (trigger).

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
} from 'lucide-react';
import { ProdutoThumb } from './ProdutoThumb';
import {
  fetchProdutos,
  fetchResponsavelCobranca,
  finalizarVendaProduto,
  formatBRL,
  type ResponsavelCobranca,
} from '@/lib/produtos-api';
import { CATEGORIA_LABELS, type Produto } from '@/types/produtos';

interface PatientProdutosSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const PatientProdutosSection = React.memo<PatientProdutosSectionProps>(
  ({ patientId, userRole }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const userId = user?.pessoa?.id ?? '';
    const canManage = userRole === 'admin' || userRole === 'secretaria';

    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [responsavel, setResponsavel] = useState<ResponsavelCobranca | null>(
      null
    );
    const [loading, setLoading] = useState(true);
    const [carrinho, setCarrinho] = useState<Record<string, number>>({});
    const [finalizando, setFinalizando] = useState(false);

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

    useEffect(() => {
      if (canManage) void loadData();
    }, [canManage, loadData]);

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
            {totalItens > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalItens} no carrinho
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {!responsavel && (
                <Alert className="border-amarelo-pipa/40 bg-amarelo-pipa/10">
                  <AlertTriangle className="h-4 w-4 text-amarelo-pipa" />
                  <AlertDescription>
                    Defina o responsável de cobrança do paciente para vender
                    produtos.
                  </AlertDescription>
                </Alert>
              )}

              {/* Produtos disponíveis */}
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
                        onClick={() => add(p.id)}
                        className="gap-1 shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Adicionar</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Carrinho */}
              {itensCarrinho.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShoppingCart className="h-4 w-4" /> Carrinho
                  </div>
                  {itensCarrinho.map(({ produto: p, quantidade }) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {p.nome}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setQtd(p.id, quantidade - 1)}
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
                          onClick={() => setQtd(p.id, quantidade + 1)}
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
                        onClick={() => setQtd(p.id, 0)}
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
                    onClick={handleFinalizar}
                    disabled={finalizando || !responsavel}
                    className={cn('w-full gap-2')}
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
            </>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientProdutosSection.displayName = 'PatientProdutosSection';
