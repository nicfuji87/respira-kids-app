// AI dev note: Aba Vendas da página Produtos (admin + secretaria) — histórico de TODAS
// as vendas da loja (espaçadores, brinquedos e outros): quem comprou, quando, o que
// levou e como pagou. Vender, reenviar a cobrança e cancelar continuam no detalhe do
// paciente; aqui é consulta.
//
// Carrega o histórico inteiro uma vez e filtra em memória (produto-vendas-historico):
// são dezenas de vendas por mês, então "desde a primeira venda" é o padrão e trocar
// filtro não volta ao banco. Se o volume um dia pesar, os filtros descem para uma RPC.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  Wallet,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Skeleton } from '@/components/primitives/skeleton';
import { cn } from '@/lib/utils';
import { fetchHistoricoVendas, formatBRL } from '@/lib/produtos-api';
import {
  FILTROS_VENDAS_VAZIOS,
  PERIODOS_RAPIDOS,
  dataNoFusoDaClinica,
  filtrarVendas,
  intervaloDoPeriodo,
  itemCasaComFiltro,
  resumirVendas,
  temFiltroDeItem,
  type FiltroStatusVenda,
  type FiltrosVendas,
} from '@/lib/produto-vendas-historico';
import {
  CATEGORIA_LABELS,
  type CategoriaVenda,
  type VendaHistorico,
  type VendaHistoricoItem,
} from '@/types/produtos';
import { StatCard } from './StatCard';
import { VendaHistoricoCard } from './VendaHistoricoCard';

const TODOS = '__todos__';
const POR_PAGINA = 50;

const FILTROS_STATUS: { value: FiltroStatusVenda; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pagas', label: 'Pagas' },
  { value: 'em_aberto', label: 'Aguardando pagamento' },
  { value: 'canceladas', label: 'Canceladas' },
];

const CATEGORIAS = Object.keys(CATEGORIA_LABELS) as CategoriaVenda[];

export const HistoricoVendas: React.FC = () => {
  const [vendas, setVendas] = useState<VendaHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "agora" da última carga: base dos períodos rápidos e do Pix expirado
  const [agora, setAgora] = useState(() => Date.now());
  const [filtros, setFiltros] = useState<FiltrosVendas>(FILTROS_VENDAS_VAZIOS);
  const [visiveis, setVisiveis] = useState(POR_PAGINA);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVendas(await fetchHistoricoVendas());
      setAgora(Date.now());
    } catch (err) {
      console.error('[HistoricoVendas] erro ao carregar:', err);
      setError('Não conseguimos carregar as vendas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // mudar o recorte sempre volta para o começo da lista
  const atualizarFiltros = (parcial: Partial<FiltrosVendas>) => {
    setFiltros((prev) => ({ ...prev, ...parcial }));
    setVisiveis(POR_PAGINA);
  };

  const limparFiltros = () => {
    setFiltros(FILTROS_VENDAS_VAZIOS);
    setVisiveis(POR_PAGINA);
  };

  // opções saem das próprias vendas: não há por que oferecer produto nunca vendido
  const produtosVendidos = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; categoria: CategoriaVenda | null }
    >();
    for (const v of vendas) {
      for (const i of v.itens) {
        if (i.produto_id) {
          mapa.set(i.produto_id, { nome: i.nome, categoria: i.categoria });
        }
      }
    }
    return mapa;
  }, [vendas]);

  const opcoesProduto = useMemo(
    () =>
      [...produtosVendidos.entries()]
        .filter(
          ([, p]) =>
            filtros.categoria === null || p.categoria === filtros.categoria
        )
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR')),
    [produtosVendidos, filtros.categoria]
  );

  const lista = useMemo(
    () => filtrarVendas(vendas, filtros),
    [vendas, filtros]
  );
  const resumo = useMemo(() => resumirVendas(lista, filtros), [lista, filtros]);

  const destacarItem = useMemo(
    () =>
      temFiltroDeItem(filtros)
        ? (item: VendaHistoricoItem) => itemCasaComFiltro(item, filtros)
        : undefined,
    [filtros]
  );

  const hoje = dataNoFusoDaClinica(agora);
  const periodoAtivo = PERIODOS_RAPIDOS.find((p) => {
    const intervalo = intervaloDoPeriodo(p.value, hoje);
    return intervalo.de === filtros.de && intervalo.ate === filtros.ate;
  })?.value;

  const filtrosAtivos =
    filtros.busca.trim() !== '' ||
    filtros.status !== 'todas' ||
    filtros.de !== '' ||
    filtros.ate !== '' ||
    temFiltroDeItem(filtros);

  const periodoInvertido =
    filtros.de !== '' && filtros.ate !== '' && filtros.de > filtros.ate;

  const handleCategoria = (valor: string) => {
    const categoria = valor === TODOS ? null : (valor as CategoriaVenda);
    const produtoAtual = filtros.produtoId
      ? produtosVendidos.get(filtros.produtoId)
      : undefined;
    atualizarFiltros({
      categoria,
      // produto de outra categoria some das opções e deixaria o filtro preso
      produtoId:
        categoria && produtoAtual && produtoAtual.categoria !== categoria
          ? null
          : filtros.produtoId,
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Todas as vendas da loja, desde a primeira. Para vender, reenviar a
        cobrança ou cancelar, use o detalhe do paciente.
      </p>

      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={CheckCircle2}
            tone="verde"
            label="Vendas pagas"
            value={loading ? '—' : resumo.vendasPagas}
          />
          <StatCard
            icon={Wallet}
            tone="roxo"
            label="Recebido"
            value={loading ? '—' : formatBRL(resumo.recebido)}
          />
          <StatCard
            icon={PackageCheck}
            tone="azul"
            label="Itens vendidos"
            value={loading ? '—' : resumo.unidadesVendidas}
          />
          <StatCard
            icon={Clock}
            tone="amarelo"
            label={
              !loading && resumo.vendasEmAberto > 0
                ? `Aguardando pagamento (${resumo.vendasEmAberto})`
                : 'Aguardando pagamento'
            }
            value={loading ? '—' : formatBRL(resumo.emAberto)}
          />
        </div>
        {!loading && filtrosAtivos && (
          <p className="text-xs text-muted-foreground">
            Os totais seguem os filtros.
            {temFiltroDeItem(filtros) &&
              ' Com categoria ou produto escolhido, cada venda conta só os itens filtrados.'}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filtros.busca}
                onChange={(e) => atualizarFiltros({ busca: e.target.value })}
                placeholder="Buscar por paciente, responsável ou produto..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS_STATUS.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={filtros.status === s.value ? 'default' : 'outline'}
                  onClick={() => atualizarFiltros({ status: s.value })}
                >
                  {s.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadData()}
                disabled={loading}
                title="Recarregar as vendas"
                aria-label="Recarregar as vendas"
              >
                <RefreshCw
                  className={cn('h-4 w-4', loading && 'animate-spin')}
                />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vendas-de" className="text-xs">
                Vendas de
              </Label>
              <Input
                id="vendas-de"
                type="date"
                value={filtros.de}
                onChange={(e) => atualizarFiltros({ de: e.target.value })}
                className="h-10 w-full bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendas-ate" className="text-xs">
                até
              </Label>
              <Input
                id="vendas-ate"
                type="date"
                value={filtros.ate}
                onChange={(e) => atualizarFiltros({ ate: e.target.value })}
                className="h-10 w-full bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={filtros.categoria ?? TODOS}
                onValueChange={handleCategoria}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORIA_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select
                value={filtros.produtoId ?? TODOS}
                onValueChange={(v) =>
                  atualizarFiltros({ produtoId: v === TODOS ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {opcoesProduto.map(([id, p]) => (
                    <SelectItem key={id} value={id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">
                Período:
              </span>
              {PERIODOS_RAPIDOS.map((p) => (
                <Button
                  key={p.value}
                  size="sm"
                  variant={periodoAtivo === p.value ? 'secondary' : 'ghost'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() =>
                    atualizarFiltros(intervaloDoPeriodo(p.value, hoje))
                  }
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {filtrosAtivos && (
              <Button
                size="sm"
                variant="ghost"
                onClick={limparFiltros}
                className="gap-1.5 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>

          {periodoInvertido && (
            <p className="text-xs text-destructive">
              A data inicial está depois da final, então nenhuma venda aparece.
            </p>
          )}
        </CardContent>
      </Card>

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

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? null : lista.length === 0 ? (
        <Card className="bg-bege-fundo/30 border-azul-respira/20">
          <CardContent className="p-8 text-center space-y-3">
            <ShoppingCart className="w-10 h-10 text-azul-respira mx-auto" />
            <p className="text-sm text-muted-foreground">
              {vendas.length === 0
                ? 'Nenhuma venda registrada ainda. As vendas são feitas no detalhe do paciente.'
                : 'Nenhuma venda bate com os filtros.'}
            </p>
            {vendas.length > 0 && (
              <Button variant="outline" size="sm" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {lista.length === 1 ? '1 venda' : `${lista.length} vendas`}
            {filtrosAtivos ? ` de ${vendas.length}` : ''}, das mais recentes
            para as mais antigas
          </p>
          {lista.slice(0, visiveis).map((v) => (
            <VendaHistoricoCard
              key={v.id}
              venda={v}
              agora={agora}
              destacarItem={destacarItem}
            />
          ))}
          {lista.length > visiveis && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                onClick={() => setVisiveis((n) => n + POR_PAGINA)}
              >
                Mostrar mais ({lista.length - visiveis} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
