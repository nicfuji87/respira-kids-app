// AI dev note: Barra de filtros do dashboard de Análise de Conversas (WhatsApp).
// Filtra por período, status, intenção, tipo de demanda, sentimento, tipo de serviço,
// busca livre e atalhos (follow-up pendente / reclamações / clínico).

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
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Filter,
  Search,
  X,
} from 'lucide-react';
import type { WhatsAppDashboardFilters as Filters } from '@/types/whatsapp-conversas';
import {
  INTENCAO_LABELS,
  SENTIMENTO_LABELS,
  STATUS_LABELS,
  TIPO_DEMANDA_LABELS,
  TIPO_SERVICO_LABELS,
} from '@/lib/whatsapp-conversas-api';

interface WhatsAppDashboardFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  className?: string;
}

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

function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

interface ToggleChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: 'azul' | 'vermelho' | 'amarelo';
}

const ToggleChip = React.memo<ToggleChipProps>(
  ({ active, label, onClick, tone = 'azul' }) => {
    const activeTone =
      tone === 'vermelho'
        ? 'border-vermelho-kids/60 bg-vermelho-kids/10 text-vermelho-kids'
        : tone === 'amarelo'
          ? 'border-amarelo-pipa/60 bg-amarelo-pipa/15 text-roxo-titulo'
          : 'border-azul-respira/60 bg-azul-respira/10 text-azul-respira';
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
          active
            ? activeTone
            : 'border-border/50 bg-card text-muted-foreground hover:border-foreground/30'
        )}
      >
        {label}
      </button>
    );
  }
);
ToggleChip.displayName = 'ToggleChip';

export const WhatsAppDashboardFilters =
  React.memo<WhatsAppDashboardFiltersProps>(
    ({ filters, onChange, className }) => {
      const totalActiveFilters = useMemo(() => {
        let c = 0;
        if (filters.startDate) c++;
        if (filters.endDate) c++;
        if (filters.search) c++;
        c += filters.status?.length || 0;
        c += filters.intencoes?.length || 0;
        c += filters.tiposDemanda?.length || 0;
        c += filters.sentimentos?.length || 0;
        c += filters.tiposServico?.length || 0;
        if (filters.apenasFollowup) c++;
        if (filters.apenasReclamacoes) c++;
        if (filters.apenasClinico) c++;
        if (filters.cadastro) c++;
        if (filters.apenasDivergencias) c++;
        return c;
      }, [filters]);

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
                  onClick={() => onChange({})}
                  className="ml-auto h-8 gap-1 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone ou resumo..."
                value={filters.search || ''}
                onChange={(e) =>
                  onChange({ ...filters, search: e.target.value || undefined })
                }
                className="pl-10"
              />
            </div>

            {/* Datas */}
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

            {/* Multi-selects */}
            <div className="flex flex-wrap items-center gap-2">
              <MultiSelectFilter
                label="Status"
                options={toOptions(STATUS_LABELS)}
                selected={filters.status || []}
                onChange={(next) => onChange({ ...filters, status: next })}
              />
              <MultiSelectFilter
                label="Intenção"
                options={toOptions(INTENCAO_LABELS)}
                selected={filters.intencoes || []}
                onChange={(next) => onChange({ ...filters, intencoes: next })}
              />
              <MultiSelectFilter
                label="Tipo de demanda"
                options={toOptions(TIPO_DEMANDA_LABELS)}
                selected={filters.tiposDemanda || []}
                onChange={(next) =>
                  onChange({ ...filters, tiposDemanda: next })
                }
              />
              <MultiSelectFilter
                label="Sentimento"
                options={toOptions(SENTIMENTO_LABELS)}
                selected={filters.sentimentos || []}
                onChange={(next) => onChange({ ...filters, sentimentos: next })}
              />
              <MultiSelectFilter
                label="Tipo de serviço"
                options={toOptions(TIPO_SERVICO_LABELS)}
                selected={filters.tiposServico || []}
                onChange={(next) =>
                  onChange({ ...filters, tiposServico: next })
                }
              />
            </div>

            {/* Atalhos */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">
                Atalhos:
              </span>
              <ToggleChip
                active={Boolean(filters.apenasFollowup)}
                label="Follow-up pendente"
                tone="amarelo"
                onClick={() =>
                  onChange({
                    ...filters,
                    apenasFollowup: filters.apenasFollowup ? undefined : true,
                  })
                }
              />
              <ToggleChip
                active={Boolean(filters.apenasReclamacoes)}
                label="Reclamações"
                tone="vermelho"
                onClick={() =>
                  onChange({
                    ...filters,
                    apenasReclamacoes: filters.apenasReclamacoes
                      ? undefined
                      : true,
                  })
                }
              />
              <ToggleChip
                active={Boolean(filters.apenasClinico)}
                label="Conteúdo clínico"
                tone="azul"
                onClick={() =>
                  onChange({
                    ...filters,
                    apenasClinico: filters.apenasClinico ? undefined : true,
                  })
                }
              />
              <ToggleChip
                active={filters.cadastro === 'cadastrados'}
                label="Cadastrados"
                tone="azul"
                onClick={() =>
                  onChange({
                    ...filters,
                    cadastro:
                      filters.cadastro === 'cadastrados'
                        ? undefined
                        : 'cadastrados',
                  })
                }
              />
              <ToggleChip
                active={filters.cadastro === 'nao_cadastrados'}
                label="Não cadastrados"
                tone="azul"
                onClick={() =>
                  onChange({
                    ...filters,
                    cadastro:
                      filters.cadastro === 'nao_cadastrados'
                        ? undefined
                        : 'nao_cadastrados',
                  })
                }
              />
              <ToggleChip
                active={Boolean(filters.apenasDivergencias)}
                label="Com divergência"
                tone="vermelho"
                onClick={() =>
                  onChange({
                    ...filters,
                    apenasDivergencias: filters.apenasDivergencias
                      ? undefined
                      : true,
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      );
    }
  );

WhatsAppDashboardFilters.displayName = 'WhatsAppDashboardFilters';
