// AI dev note: Seção de Produtos no detalhe do paciente (admin/secretaria), com duas
// abas: "Venda" (busca produto → carrinho → Finalizar cria a cobrança Pix no Banco
// Inter) e "Histórico" (vendas anteriores, com QR para escanear na recepção, link
// para copiar e cancelamento).
//
// Venda de produto NÃO passa por `faturas` nem gera nota fiscal — a cobrança mora
// na própria venda (ver produtos_cobranca_inter.sql). A baixa de estoque acontece
// sozinha quando o Pix cai: webhook do Inter → fn_registrar_pix_recebido → trigger.

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
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
  RotateCw,
  QrCode,
  Ban,
  Link as LinkIcon,
} from 'lucide-react';
import { ProdutoThumb } from './ProdutoThumb';
import { ProdutoPicker } from './ProdutoPicker';
import { PixCobrancaCard } from './PixCobrancaCard';
import {
  restanteParaAdicionar,
  fetchProdutosParaVenda,
  fetchResponsavelCobranca,
  fetchVendasPaciente,
  fetchEmpresasCobranca,
  finalizarVendaProduto,
  reenviarCobrancaVenda,
  cancelarVendaProduto,
  linkPagamentoProduto,
  formatBRL,
  type ResponsavelCobranca,
  type EmpresaCobranca,
} from '@/lib/produtos-api';
import {
  STATUS_VENDA_LABELS,
  type ProdutoVendavel,
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
    // quem criou a venda vem do JWT no servidor (fn_criar_venda_produto), não daqui
    const canManage = userRole === 'admin' || userRole === 'secretaria';

    const [tab, setTab] = useState<'venda' | 'historico'>('venda');
    const [produtos, setProdutos] = useState<ProdutoVendavel[]>([]);
    const [responsavel, setResponsavel] = useState<ResponsavelCobranca | null>(
      null
    );
    const [loading, setLoading] = useState(true);
    const [carrinho, setCarrinho] = useState<Record<string, number>>({});
    const [finalizando, setFinalizando] = useState(false);

    const [vendas, setVendas] = useState<VendaProdutoResumo[]>([]);
    const [loadingVendas, setLoadingVendas] = useState(true);

    const [empresas, setEmpresas] = useState<EmpresaCobranca[]>([]);
    const [empresaId, setEmpresaId] = useState<string>('');

    const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const [prods, resp, emps] = await Promise.all([
          fetchProdutosParaVenda(),
          fetchResponsavelCobranca(patientId),
          fetchEmpresasCobranca(),
        ]);
        setProdutos(prods);
        setResponsavel(resp);
        setEmpresas(emps);
        setEmpresaId((prev) => prev || emps[0]?.id || '');
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
      const map = new Map<string, ProdutoVendavel>();
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
          .filter((i): i is { produto: ProdutoVendavel; quantidade: number } =>
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

    // nunca deixa o carrinho passar do saldo — o servidor recusaria a venda depois
    const setQtd = (id: string, qtd: number) =>
      setCarrinho((prev) => {
        const next = { ...prev };
        const disponivel = produtoById.get(id)?.disponivel ?? null;
        const teto = disponivel === null ? qtd : Math.min(qtd, disponivel);
        if (teto <= 0) delete next[id];
        else next[id] = teto;
        return next;
      });

    const add = (produto: ProdutoVendavel) =>
      setQtd(produto.id, (carrinho[produto.id] ?? 0) + 1);

    const handleFinalizar = async () => {
      if (!responsavel) return;
      if (itensCarrinho.length === 0) {
        toast({ title: 'Carrinho vazio', variant: 'destructive' });
        return;
      }
      if (!empresaId) {
        toast({
          title: 'Selecione a empresa de faturamento',
          variant: 'destructive',
        });
        return;
      }
      setFinalizando(true);
      try {
        await finalizarVendaProduto({
          paciente_id: patientId,
          responsavel_cobranca_id: responsavel.id,
          empresa_id: empresaId || null,
          itens: itensCarrinho,
        });
        toast({
          title: 'Cobrança Pix gerada',
          description: `${formatBRL(total)} para ${responsavel.nome}. O link foi enviado no WhatsApp — o QR está no histórico.`,
        });
        setCarrinho({});
        await loadVendas();
        await loadData();
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

    const handleReenviar = async (vendaId: string) => {
      try {
        await reenviarCobrancaVenda(vendaId);
        toast({
          title: 'Cobrança reenviada',
          description: 'O link foi enviado de novo no WhatsApp.',
        });
        await loadVendas();
      } catch (err) {
        toast({
          title: 'Erro ao reenviar cobrança',
          description: err instanceof Error ? err.message : 'Tente novamente.',
          variant: 'destructive',
        });
      }
    };

    // Cancelar NUNCA devolve dinheiro por aqui: o estorno é uma ação separada,
    // deliberada, para não transformar um clique errado numa transferência.
    const handleCancelar = async (vendaId: string) => {
      const venda = vendas.find((v) => v.id === vendaId);
      const eraPaga = venda?.status === 'pago';
      const confirmacao = eraPaga
        ? 'Esta venda já foi paga. Cancelar devolve os produtos ao estoque, mas NÃO estorna o dinheiro — a devolução do Pix precisa ser feita separadamente. Continuar?'
        : 'Cancelar esta venda? A cobrança Pix será cancelada.';
      if (!window.confirm(confirmacao)) return;

      try {
        const r = await cancelarVendaProduto(vendaId, {
          motivo: 'Cancelada pela recepção',
        });
        toast({
          title: 'Venda cancelada',
          description: r.era_paga
            ? 'Produtos devolvidos ao estoque. O estorno do Pix não foi feito.'
            : 'A cobrança Pix foi cancelada.',
        });
        await loadVendas();
        await loadData();
      } catch (err) {
        toast({
          title: 'Erro ao cancelar venda',
          description: err instanceof Error ? err.message : 'Tente novamente.',
          variant: 'destructive',
        });
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
              carrinho={carrinho}
              responsavel={responsavel}
              itensCarrinho={itensCarrinho}
              total={total}
              finalizando={finalizando}
              empresas={empresas}
              empresaId={empresaId}
              onEmpresaChange={setEmpresaId}
              onAdd={add}
              onSetQtd={setQtd}
              onFinalizar={handleFinalizar}
            />
          ) : (
            <HistoricoTab
              loading={loadingVendas}
              vendas={vendas}
              onReenviar={handleReenviar}
              onCancelar={handleCancelar}
              isAdmin={userRole === 'admin'}
            />
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
  produtos: ProdutoVendavel[];
  carrinho: Record<string, number>;
  responsavel: ResponsavelCobranca | null;
  itensCarrinho: { produto: ProdutoVendavel; quantidade: number }[];
  total: number;
  finalizando: boolean;
  empresas: EmpresaCobranca[];
  empresaId: string;
  onEmpresaChange: (id: string) => void;
  onAdd: (produto: ProdutoVendavel) => void;
  onSetQtd: (id: string, qtd: number) => void;
  onFinalizar: () => void;
}

const VendaTab: React.FC<VendaTabProps> = ({
  loading,
  produtos,
  carrinho,
  responsavel,
  itensCarrinho,
  total,
  finalizando,
  empresas,
  empresaId,
  onEmpresaChange,
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
        <ProdutoPicker
          produtos={produtos}
          carrinho={carrinho}
          onAdd={onAdd}
          disabled={!responsavel}
        />
      )}

      {itensCarrinho.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShoppingCart className="h-4 w-4" /> Carrinho
          </div>
          {itensCarrinho.map(({ produto: p, quantidade }) => (
            <div key={p.id} className="flex items-center gap-2">
              <ProdutoThumb
                url={p.foto_url}
                alt={p.nome}
                className="h-8 w-8 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{p.nome}</span>
                  {p.eh_kit && (
                    <Boxes className="h-3.5 w-3.5 shrink-0 text-azul-respira" />
                  )}
                </div>
                {p.disponivel !== null && (
                  <span className="text-xs text-muted-foreground">
                    {p.disponivel} em estoque
                  </span>
                )}
              </div>
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
                  disabled={restanteParaAdicionar(p, quantidade) === 0}
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

          {empresas.length > 1 && (
            <div className="flex items-center gap-2 border-t pt-2">
              <span className="shrink-0 text-sm text-muted-foreground">
                Faturar por
              </span>
              <Select value={empresaId} onValueChange={onEmpresaChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div
            className={cn(
              'flex items-center justify-between',
              empresas.length > 1 ? '' : 'border-t pt-2'
            )}
          >
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
            disabled={finalizando || !responsavel || !empresaId}
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
  onReenviar: (vendaId: string) => Promise<void>;
  onCancelar: (vendaId: string) => Promise<void>;
  isAdmin: boolean;
}> = ({ loading, vendas, onReenviar, onCancelar, isAdmin }) => {
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [pixAbertoId, setPixAbertoId] = useState<string | null>(null);

  const handleReenviarClick = async (vendaId: string) => {
    setReenviandoId(vendaId);
    try {
      await onReenviar(vendaId);
    } finally {
      setReenviandoId(null);
    }
  };

  const handleCancelarClick = async (vendaId: string) => {
    setCancelandoId(vendaId);
    try {
      await onCancelar(vendaId);
    } finally {
      setCancelandoId(null);
    }
  };

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
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {v.status !== 'pago' && v.status !== 'cancelado' && (
                <>
                  {v.pix_copia_cola && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        setPixAbertoId(pixAbertoId === v.id ? null : v.id)
                      }
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      {pixAbertoId === v.id ? 'Fechar Pix' : 'Mostrar Pix'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={reenviandoId === v.id}
                    onClick={() => void handleReenviarClick(v.id)}
                  >
                    {reenviandoId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="h-3.5 w-3.5" />
                    )}
                    {v.pix_copia_cola ? 'Reenviar' : 'Gerar cobrança'}
                  </Button>
                </>
              )}
              {v.status !== 'cancelado' && (v.status !== 'pago' || isAdmin) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={cancelandoId === v.id}
                  onClick={() => void handleCancelarClick(v.id)}
                >
                  {cancelandoId === v.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  Cancelar
                </Button>
              )}
            </div>
            <span className="text-sm font-bold text-foreground">
              {formatBRL(v.valor_total)}
            </span>
          </div>

          {pixAbertoId === v.id && v.pix_copia_cola && (
            <div className="mt-3 space-y-2">
              <PixCobrancaCard
                copiaCola={v.pix_copia_cola}
                valor={formatBRL(v.valor_total)}
                expiraEm={v.pix_expira_em}
                tamanhoQr={168}
              />
              {v.cobranca_token && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      linkPagamentoProduto(v.cobranca_token!)
                    );
                  }}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Copiar link de pagamento
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
