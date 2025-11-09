import React, { useState, useEffect, useCallback } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
} from '@/components/primitives';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// AI dev note: Componente híbrido de seleção de produto
// Permite buscar produto do catálogo OU digitar descrição livre
// Quando seleciona produto, preenche automaticamente quantidade, valor unitário e categoria

export interface ProdutoData {
  produto_id?: string | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  unidade_medida?: string;
  categoria_contabil_id?: string;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade_medida: string;
  preco_referencia: number;
  categoria_contabil_id: string | null;
}

interface ProdutoSelectProps {
  value?: string; // produto_id ou descrição livre
  onSelect: (produto: ProdutoData) => void;
  placeholder?: string;
  className?: string;
}

export const ProdutoSelect = React.memo<ProdutoSelectProps>(
  ({ value, onSelect, placeholder = 'Buscar produto...', className }) => {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Buscar produtos do catálogo
    const searchProdutos = useCallback(async (term: string) => {
      if (!term || term.length < 2) {
        setProdutos([]);
        return;
      }

      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from('produtos_servicos')
          .select('*')
          .eq('ativo', true)
          .or(
            `nome.ilike.%${term}%,codigo.ilike.%${term}%,descricao.ilike.%${term}%`
          )
          .order('nome')
          .limit(10);

        if (error) throw error;
        setProdutos(data || []);
      } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        setProdutos([]);
      } finally {
        setIsLoading(false);
      }
    }, []);

    useEffect(() => {
      const timer = setTimeout(() => {
        searchProdutos(searchTerm);
      }, 300);

      return () => clearTimeout(timer);
    }, [searchTerm, searchProdutos]);

    const handleSelectProduto = (produto: Produto) => {
      onSelect({
        produto_id: produto.id,
        descricao: produto.nome,
        quantidade: 1,
        valor_unitario: produto.preco_referencia,
        unidade_medida: produto.unidade_medida,
        categoria_contabil_id: produto.categoria_contabil_id || undefined,
      });
      setOpen(false);
      setSearchTerm('');
    };

    const handleUsarDescricaoLivre = () => {
      if (!searchTerm || searchTerm.trim().length < 3) return;

      onSelect({
        produto_id: null,
        descricao: searchTerm.trim(),
        quantidade: 1,
        valor_unitario: 0,
      });
      setOpen(false);
      setSearchTerm('');
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between', className)}
          >
            {value || placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Digite para buscar ou criar..."
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandEmpty>
              {isLoading ? (
                <div className="p-4 text-sm text-center text-muted-foreground">
                  Buscando...
                </div>
              ) : searchTerm.length >= 3 ? (
                <div className="p-4">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-left"
                    onClick={handleUsarDescricaoLivre}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Usar "{searchTerm}"
                  </Button>
                </div>
              ) : (
                <div className="p-4 text-sm text-center text-muted-foreground">
                  Digite pelo menos 3 caracteres para buscar
                </div>
              )}
            </CommandEmpty>
            {produtos.length > 0 && (
              <>
                <CommandGroup heading="Produtos no catálogo">
                  {produtos.map((produto) => (
                    <CommandItem
                      key={produto.id}
                      value={produto.id}
                      onSelect={() => handleSelectProduto(produto)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === produto.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{produto.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            ({produto.codigo})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{produto.unidade_medida}</span>
                          <span>•</span>
                          <span>
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(produto.preco_referencia)}
                          </span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {searchTerm.length >= 3 && (
                  <CommandGroup>
                    <CommandItem onSelect={handleUsarDescricaoLivre}>
                      <Plus className="mr-2 h-4 w-4" />
                      Usar descrição livre: "{searchTerm}"
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);

ProdutoSelect.displayName = 'ProdutoSelect';
