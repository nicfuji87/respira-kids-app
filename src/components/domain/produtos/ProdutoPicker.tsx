// AI dev note: Seletor de produto da venda. Substitui a lista inline que crescia com o
// catálogo — aqui a tela tem altura fixa e o catálogo vive dentro de uma busca.
// Mostra saldo por produto e bloqueia o que não tem estoque (considerando o que já
// está no carrinho). fn_criar_venda_produto revalida no servidor.

import React, { useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { ProdutoThumb } from './ProdutoThumb';
import { formatBRL, restanteParaAdicionar } from '@/lib/produtos-api';
import { CATEGORIA_LABELS, type ProdutoVendavel } from '@/types/produtos';

interface ProdutoPickerProps {
  produtos: ProdutoVendavel[];
  // quantidades já no carrinho, para não oferecer além do saldo
  carrinho: Record<string, number>;
  onAdd: (produto: ProdutoVendavel) => void;
  disabled?: boolean;
}

export const ProdutoPicker: React.FC<ProdutoPickerProps> = ({
  produtos,
  carrinho,
  onAdd,
  disabled,
}) => {
  const [open, setOpen] = useState(false);

  // agrupa por categoria para dar navegação sem precisar de filtro separado
  const grupos = useMemo(() => {
    const mapa = new Map<string, ProdutoVendavel[]>();
    for (const p of produtos) {
      const chave = p.categoria_venda
        ? CATEGORIA_LABELS[p.categoria_venda]
        : 'Sem categoria';
      const lista = mapa.get(chave);
      if (lista) lista.push(p);
      else mapa.set(chave, [p]);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [produtos]);

  const handleSelect = (produto: ProdutoVendavel) => {
    onAdd(produto);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || produtos.length === 0}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <Search className="h-4 w-4 shrink-0" />
          {produtos.length === 0
            ? 'Nenhum produto cadastrado'
            : 'Buscar produto para adicionar…'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Nome ou código do produto…" />
          <CommandList className="max-h-72">
            <CommandEmpty>
              <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </div>
            </CommandEmpty>
            {grupos.map(([categoria, itens]) => (
              <CommandGroup key={categoria} heading={categoria}>
                {itens.map((p) => {
                  const restante = restanteParaAdicionar(
                    p,
                    carrinho[p.id] ?? 0
                  );
                  const esgotado = restante !== null && restante <= 0;
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.nome} ${p.codigo}`}
                      disabled={esgotado}
                      onSelect={() => handleSelect(p)}
                      className={cn(
                        'gap-3',
                        esgotado ? 'opacity-50' : 'cursor-pointer'
                      )}
                    >
                      <ProdutoThumb
                        url={p.foto_url}
                        alt={p.nome}
                        className="h-8 w-8 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {p.nome}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatBRL(p.preco_venda)}
                        </div>
                      </div>
                      <EstoqueBadge produto={p} restante={restante} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const EstoqueBadge: React.FC<{
  produto: ProdutoVendavel;
  restante: number | null;
}> = ({ produto, restante }) => {
  if (restante === null) {
    return (
      <Badge variant="outline" className="shrink-0 text-xs">
        <Package className="mr-1 h-3 w-3" />
        sob encomenda
      </Badge>
    );
  }

  if (restante <= 0) {
    return (
      <Badge variant="outline" className="shrink-0 text-xs text-destructive">
        {produto.eh_kit && produto.disponivel === 0
          ? 'sem componentes'
          : 'sem estoque'}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 text-xs',
        restante <= produto.estoque_minimo && 'text-amarelo-pipa'
      )}
    >
      {restante} {produto.unidade_medida}
    </Badge>
  );
};
