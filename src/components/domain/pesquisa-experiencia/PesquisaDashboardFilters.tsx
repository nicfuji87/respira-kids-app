// AI dev note: Barra de filtros do dashboard da pesquisa.
// Permite filtrar respostas por data, canal, pediatra, tempo de acompanhamento,
// idade do filho, motivo principal e categoria NPS.

import React, { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon, ChevronDown, Filter, X } from 'lucide-react';
import { SURVEY_QUESTIONS } from '@/lib/pesquisa-experiencia-questions';
import type {
  DashboardFilters,
  NpsCategory,
  RankingPediatra,
} from '@/types/pesquisa-experiencia';

interface PesquisaDashboardFiltersProps {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  /** Pediatras presentes nas respostas (para mostrar nomes legíveis). */
  pediatrasDisponiveis: Array<Pick<RankingPediatra, 'pediatra_id' | 'nome'>>;
  className?: string;
}

const NPS_OPTIONS: Array<{ value: NpsCategory; label: string; color: string }> =
  [
    { value: 'promotor', label: 'Promotores (9-10)', color: 'bg-verde-pipa' },
    { value: 'neutro', label: 'Neutros (7-8)', color: 'bg-amarelo-pipa' },
    { value: 'detrator', label: 'Detratores (1-6)', color: 'bg-vermelho-kids' },
  ];

interface MultiSelectFilterProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
}

const MultiSelectFilter = React.memo<MultiSelectFilterProps>(
  ({ label, options, selected, onChange, emptyLabel = 'Nenhuma opção' }) => {
    const [open, setOpen] = useState(false);

    const toggle = useCallback(
      (value: string) => {
        if (selected.includes(value)) {
          onChange(selected.filter((v) => v !== value));
        } else {
          onChange([...selected, value]);
        }
      },
      [selected, onChange]
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 gap-2',
              selected.length > 0 && 'border-azul-respira/60 bg-azul-respira/5'
            )}
          >
            <span>{label}</span>
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 h-5">
                {selected.length}
              </Badge>
            )}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-azul-respira hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {emptyLabel}
              </p>
            ) : (
              options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/60 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(opt.value)}
                    onCheckedChange={() => toggle(opt.value)}
                  />
                  <span className="text-sm flex-1 truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
MultiSelectFilter.displayName = 'MultiSelectFilter';

export const PesquisaDashboardFilters =
  React.memo<PesquisaDashboardFiltersProps>(
    ({ filters, onChange, pediatrasDisponiveis, className }) => {
      const totalActiveFilters = useMemo(() => {
        let c = 0;
        if (filters.startDate) c++;
        if (filters.endDate) c++;
        if (filters.canais?.length) c += filters.canais.length;
        if (filters.pediatras?.length) c += filters.pediatras.length;
        if (filters.temposAcompanhamento?.length)
          c += filters.temposAcompanhamento.length;
        if (filters.idadesFilho?.length) c += filters.idadesFilho.length;
        if (filters.motivos?.length) c += filters.motivos.length;
        if (filters.npsCategorias?.length) c += filters.npsCategorias.length;
        return c;
      }, [filters]);

      const canaisOptions = useMemo(() => {
        const q = SURVEY_QUESTIONS.find((qq) => qq.id === 'como_conheceu');
        return (
          q?.options?.map((o) => ({ value: o.value, label: o.label })) || []
        );
      }, []);

      const temposOptions = useMemo(() => {
        const q = SURVEY_QUESTIONS.find(
          (qq) => qq.id === 'tempo_acompanhamento'
        );
        return (
          q?.options?.map((o) => ({ value: o.value, label: o.label })) || []
        );
      }, []);

      const idadeOptions = useMemo(() => {
        const q = SURVEY_QUESTIONS.find((qq) => qq.id === 'idade_filho');
        return (
          q?.options?.map((o) => ({ value: o.value, label: o.label })) || []
        );
      }, []);

      const motivoOptions = useMemo(() => {
        const q = SURVEY_QUESTIONS.find((qq) => qq.id === 'motivo_principal');
        return (
          q?.options?.map((o) => ({ value: o.value, label: o.label })) || []
        );
      }, []);

      const pediatraOptions = useMemo(
        () =>
          pediatrasDisponiveis.map((p) => ({
            value: p.pediatra_id,
            label: p.nome,
          })),
        [pediatrasDisponiveis]
      );

      const handleNpsToggle = useCallback(
        (value: NpsCategory) => {
          const current = filters.npsCategorias || [];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          onChange({ ...filters, npsCategorias: next });
        },
        [filters, onChange]
      );

      const handleClearAll = useCallback(() => {
        onChange({});
      }, [onChange]);

      return (
        <Card className={cn('overflow-visible', className)}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                Filtros
              </span>
              {totalActiveFilters > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {totalActiveFilters} ativo
                  {totalActiveFilters !== 1 ? 's' : ''}
                </Badge>
              )}
              {totalActiveFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="ml-auto h-8 gap-1 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* Linha 1: datas */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">De</span>
              </div>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    startDate: e.target.value || undefined,
                  })
                }
                className="h-9 w-auto"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) =>
                  onChange({ ...filters, endDate: e.target.value || undefined })
                }
                className="h-9 w-auto"
              />
              {(filters.startDate || filters.endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...filters,
                      startDate: undefined,
                      endDate: undefined,
                    })
                  }
                  className="h-9 px-2 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {/* Linha 2: multi-selects */}
            <div className="flex flex-wrap items-center gap-2">
              <MultiSelectFilter
                label="Canal"
                options={canaisOptions}
                selected={filters.canais || []}
                onChange={(next) => onChange({ ...filters, canais: next })}
              />
              <MultiSelectFilter
                label="Pediatra"
                options={pediatraOptions}
                selected={filters.pediatras || []}
                onChange={(next) => onChange({ ...filters, pediatras: next })}
                emptyLabel="Nenhum pediatra indicado ainda"
              />
              <MultiSelectFilter
                label="Tempo"
                options={temposOptions}
                selected={filters.temposAcompanhamento || []}
                onChange={(next) =>
                  onChange({ ...filters, temposAcompanhamento: next })
                }
              />
              <MultiSelectFilter
                label="Idade do filho"
                options={idadeOptions}
                selected={filters.idadesFilho || []}
                onChange={(next) => onChange({ ...filters, idadesFilho: next })}
              />
              <MultiSelectFilter
                label="Motivo"
                options={motivoOptions}
                selected={filters.motivos || []}
                onChange={(next) => onChange({ ...filters, motivos: next })}
              />
            </div>

            {/* Linha 3: NPS toggle chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">
                Categoria NPS:
              </span>
              {NPS_OPTIONS.map((opt) => {
                const selected = (filters.npsCategorias || []).includes(
                  opt.value
                );
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleNpsToggle(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                      selected
                        ? 'border-foreground/30 bg-foreground/5 text-foreground'
                        : 'border-border/50 bg-card text-muted-foreground hover:border-foreground/30'
                    )}
                  >
                    <span
                      className={cn('w-2 h-2 rounded-full', opt.color)}
                      aria-hidden
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      );
    }
  );

PesquisaDashboardFilters.displayName = 'PesquisaDashboardFilters';
