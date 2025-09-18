import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/primitives/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Badge } from '@/components/primitives/badge';
import { supabase } from '@/lib/supabase';

// AI dev note: Componente reutilizável para filtrar por profissionais no dashboard admin
// Permite seleção múltipla, individual ou todos os profissionais

interface Professional {
  id: string;
  nome: string;
  ativo: boolean;
}

interface ProfessionalFilterProps {
  selectedProfessionals: string[];
  onSelectionChange: (professionalIds: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const ProfessionalFilter = React.memo<ProfessionalFilterProps>(
  ({
    selectedProfessionals,
    onSelectionChange,
    placeholder = 'Filtrar por profissional...',
    className,
  }) => {
    const [open, setOpen] = useState(false);
    const [professionals, setProfessionals] = useState<Professional[]>([]);
    const [loading, setLoading] = useState(false);

    // Buscar lista de profissionais ativos
    // Inclui tanto role='profissional' quanto pessoas com pode_atender=true (ex: admins habilitados)
    useEffect(() => {
      const fetchProfessionals = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('pessoas')
            .select('id, nome, ativo')
            .or('role.eq.profissional,pode_atender.eq.true')
            .eq('is_approved', true)
            .eq('ativo', true)
            .order('nome');

          if (error) throw error;
          setProfessionals(data || []);
        } catch (error) {
          console.error('Erro ao buscar profissionais:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchProfessionals();
    }, []);

    const handleSelect = (professionalId: string) => {
      const isSelected = selectedProfessionals.includes(professionalId);

      if (isSelected) {
        // Remover da seleção
        onSelectionChange(
          selectedProfessionals.filter((id) => id !== professionalId)
        );
      } else {
        // Adicionar à seleção
        onSelectionChange([...selectedProfessionals, professionalId]);
      }
    };

    const handleSelectAll = () => {
      if (selectedProfessionals.length === professionals.length) {
        // Desselecionar todos
        onSelectionChange([]);
      } else {
        // Selecionar todos
        onSelectionChange(professionals.map((p) => p.id));
      }
    };

    const getSelectedNames = () => {
      if (selectedProfessionals.length === 0) {
        return 'Todos os profissionais';
      }

      if (selectedProfessionals.length === professionals.length) {
        return 'Todos os profissionais';
      }

      if (selectedProfessionals.length === 1) {
        const professional = professionals.find(
          (p) => p.id === selectedProfessionals[0]
        );
        return professional?.nome || 'Profissional selecionado';
      }

      return `${selectedProfessionals.length} profissionais selecionados`;
    };

    const isAllSelected = selectedProfessionals.length === professionals.length;

    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="justify-between min-w-[200px]"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{getSelectedNames()}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0">
            <Command>
              <CommandInput placeholder={placeholder} />
              <CommandList>
                <CommandEmpty>
                  {loading
                    ? 'Carregando...'
                    : 'Nenhum profissional encontrado.'}
                </CommandEmpty>
                <CommandGroup>
                  {/* Opção "Todos" */}
                  <CommandItem
                    onSelect={handleSelectAll}
                    className="font-medium"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        isAllSelected || selectedProfessionals.length === 0
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    Todos os profissionais
                  </CommandItem>

                  {/* Lista de profissionais */}
                  {professionals.map((professional) => (
                    <CommandItem
                      key={professional.id}
                      onSelect={() => handleSelect(professional.id)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedProfessionals.includes(professional.id)
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      {professional.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Badges dos selecionados (quando há seleção específica) */}
        {selectedProfessionals.length > 0 &&
          selectedProfessionals.length < professionals.length && (
            <div className="flex flex-wrap gap-1">
              {selectedProfessionals.slice(0, 3).map((id) => {
                const professional = professionals.find((p) => p.id === id);
                return professional ? (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {professional.nome}
                  </Badge>
                ) : null;
              })}
              {selectedProfessionals.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{selectedProfessionals.length - 3} mais
                </Badge>
              )}
            </div>
          )}
      </div>
    );
  }
);

ProfessionalFilter.displayName = 'ProfessionalFilter';
