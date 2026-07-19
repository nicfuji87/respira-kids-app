import React, { useState, useEffect } from 'react';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Checkbox } from '@/components/primitives/checkbox';
import { PatientSelect } from '@/components/composed/PatientSelect';
import { Filter, X, Check, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchProfissionais } from '@/lib/calendar-services';
import { cn } from '@/lib/utils';

// AI dev note: Componente reutilizável de filtros de agenda para todos os roles
// AI dev note: Interface para profissionais normalizados
interface NormalizedProfessional {
  id: string;
  name: string;
}

export interface CalendarFiltersProps {
  // Valores atuais dos filtros - agora arrays para multi-seleção
  selectedProfessional: string; // Mantém string por compatibilidade para admin
  selectedPatient: string;
  selectedTipoServico: string | string[]; // Pode ser string (legado) ou array
  selectedLocal: string | string[]; // Novo filtro de local
  selectedStatusConsulta: string | string[]; // Pode ser string (legado) ou array
  selectedStatusPagamento: string | string[]; // Pode ser string (legado) ou array
  // AI dev note: Novo filtro multi-seleção por Empresa de Faturamento
  selectedEmpresa?: string | string[];

  // Callbacks para mudança de filtros
  onProfessionalChange: (value: string) => void;
  onPatientChange: (value: string) => void;
  onTipoServicoChange: (value: string | string[]) => void;
  onLocalChange: (value: string | string[]) => void; // Novo callback
  onStatusConsultaChange: (value: string | string[]) => void;
  onStatusPagamentoChange: (value: string | string[]) => void;
  // AI dev note: Callback opcional para o novo filtro de Empresa
  onEmpresaChange?: (value: string | string[]) => void;
  onClearFilters: () => void;

  // Configurações
  showProfessionalFilter?: boolean;
  availableProfessionals?: Array<{ id: string; name: string }>;
  eventCount?: number;
  className?: string;
}

// AI dev note: Componente auxiliar para filtro multi-seleção
interface MultiSelectFilterProps {
  items: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  allLabel?: string;
}

const MultiSelectFilter = React.memo<MultiSelectFilterProps>(
  ({ items, selectedIds, onSelectionChange, allLabel = 'Todos' }) => {
    const [open, setOpen] = useState(false);

    const toggleItem = (itemId: string) => {
      const newSelection = selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId];
      onSelectionChange(newSelection);
    };

    const selectAll = () => {
      onSelectionChange([]);
    };

    const isAllSelected = selectedIds.length === 0;

    const getButtonText = () => {
      if (isAllSelected) return allLabel;
      if (selectedIds.length === 1) {
        const item = items.find((i) => i.id === selectedIds[0]);
        return item?.label || allLabel;
      }
      return `${selectedIds.length} selecionados`;
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full h-9 justify-between font-normal text-sm',
              !isAllSelected && 'border-primary'
            )}
          >
            <span className="truncate">{getButtonText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto">
            {/* Opção "Todos" */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer',
                isAllSelected && 'bg-accent'
              )}
              onClick={selectAll}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  isAllSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input'
                )}
              >
                {isAllSelected && <Check className="h-3 w-3" />}
              </div>
              <span className="text-sm font-medium">{allLabel}</span>
            </div>

            {/* Lista de itens */}
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer',
                    isSelected && 'bg-accent/50'
                  )}
                  onClick={() => toggleItem(item.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{item.label}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

MultiSelectFilter.displayName = 'MultiSelectFilter';

export const CalendarFilters = React.memo<CalendarFiltersProps>(
  ({
    selectedProfessional,
    selectedPatient,
    selectedTipoServico,
    selectedLocal,
    selectedStatusConsulta,
    selectedStatusPagamento,
    selectedEmpresa,
    onProfessionalChange,
    onPatientChange,
    onTipoServicoChange,
    onLocalChange,
    onStatusConsultaChange,
    onStatusPagamentoChange,
    onEmpresaChange,
    onClearFilters,
    showProfessionalFilter = true,
    availableProfessionals,
    eventCount,
    className = '',
  }) => {
    // AI dev note: Estado puramente visual — filtros começam RECOLHIDOS para a
    // agenda abrir limpa; os valores dos filtros em si ficam intactos no pai.
    const [showFilters, setShowFilters] = useState(false);
    const [profissionais, setProfissionais] = useState<
      NormalizedProfessional[]
    >([]);
    const [isLoadingProfissionais, setIsLoadingProfissionais] = useState(false);
    const [tiposServico, setTiposServico] = useState<
      Array<{ id: string; nome: string }>
    >([]);
    const [locaisAtendimento, setLocaisAtendimento] = useState<
      Array<{ id: string; nome: string }>
    >([]);
    const [statusConsulta, setStatusConsulta] = useState<
      Array<{ id: string; descricao: string; cor: string }>
    >([]);
    const [statusPagamento, setStatusPagamento] = useState<
      Array<{ id: string; descricao: string; cor: string }>
    >([]);
    // AI dev note: Lista de empresas de faturamento para o novo filtro
    const [empresas, setEmpresas] = useState<
      Array<{ id: string; nome: string }>
    >([]);

    // Carregar lista de profissionais se necessário
    useEffect(() => {
      if (showProfessionalFilter && !availableProfessionals) {
        const loadProfissionais = async () => {
          setIsLoadingProfissionais(true);
          try {
            const data = await fetchProfissionais();
            // AI dev note: Normalizar profissionais para ter sempre 'name'
            const normalized: NormalizedProfessional[] = data.map((prof) => ({
              id: prof.id,
              name: prof.nome,
            }));
            setProfissionais(normalized);
          } catch (error) {
            console.error('Erro ao carregar profissionais:', error);
          } finally {
            setIsLoadingProfissionais(false);
          }
        };

        loadProfissionais();
      }
    }, [showProfessionalFilter, availableProfessionals]);

    // Carregar tipos de serviço, locais, status consulta e status pagamento
    useEffect(() => {
      const loadFilterData = async () => {
        try {
          // Carregar tipos de serviço
          const { data: tipos } = await supabase
            .from('tipo_servicos')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
          if (tipos) setTiposServico(tipos);

          // Carregar locais de atendimento
          const { data: locais } = await supabase
            .from('locais_atendimento')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
          if (locais) setLocaisAtendimento(locais);

          // Carregar status de consulta
          const { data: statusC } = await supabase
            .from('consulta_status')
            .select('id, descricao, cor')
            .order('descricao');
          if (statusC) setStatusConsulta(statusC);

          // Carregar status de pagamento
          const { data: statusP } = await supabase
            .from('pagamento_status')
            .select('id, descricao, cor')
            .order('descricao');
          if (statusP) setStatusPagamento(statusP);

          // AI dev note: Carregar empresas de faturamento ativas.
          // Preferimos exibir nome_fantasia (ex.: "BC FISIO", "FS PACHECO");
          // caso não exista, caímos para razao_social.
          const { data: empresasData } = await supabase
            .from('pessoa_empresas')
            .select('id, razao_social, nome_fantasia')
            .eq('ativo', true)
            .order('nome_fantasia');
          if (empresasData) {
            setEmpresas(
              empresasData.map((e) => ({
                id: e.id,
                nome: e.nome_fantasia || e.razao_social || 'Empresa sem nome',
              }))
            );
          }
        } catch (error) {
          console.error('Erro ao carregar dados de filtros:', error);
        }
      };

      loadFilterData();
    }, []);

    // Funções auxiliares para trabalhar com arrays e strings
    const isFilterActive = (filter: string | string[]) => {
      if (Array.isArray(filter)) {
        return filter.length > 0;
      }
      return filter !== 'all' && filter !== '';
    };

    const toArray = (value: string | string[]): string[] => {
      if (Array.isArray(value)) return value;
      if (value === 'all' || value === '') return [];
      return [value];
    };

    // Verificar se há filtros ativos
    const hasActiveFilters =
      selectedProfessional !== 'all' ||
      selectedPatient !== '' ||
      isFilterActive(selectedTipoServico) ||
      isFilterActive(selectedLocal) ||
      isFilterActive(selectedStatusConsulta) ||
      isFilterActive(selectedStatusPagamento) ||
      isFilterActive(selectedEmpresa ?? []);

    // Lista de profissionais a exibir
    const professionalsList = availableProfessionals || profissionais;

    // Converter filtros para arrays
    const tipoServicoArray = toArray(selectedTipoServico);
    const localArray = toArray(selectedLocal);
    const statusConsultaArray = toArray(selectedStatusConsulta);
    const statusPagamentoArray = toArray(selectedStatusPagamento);
    const empresaArray = toArray(selectedEmpresa ?? []);
    // AI dev note: O filtro de Empresa só aparece quando o pai passa onEmpresaChange.
    // Mantém retrocompatibilidade com qualquer consumidor existente do CalendarFilters.
    const showEmpresaFilter = !!onEmpresaChange;

    // AI dev note: Contagem puramente visual de grupos de filtro ativos
    // (badge no botão "Filtros")
    const activeFilterCount =
      (selectedProfessional !== 'all' ? 1 : 0) +
      (selectedPatient !== '' ? 1 : 0) +
      (tipoServicoArray.length > 0 ? 1 : 0) +
      (localArray.length > 0 ? 1 : 0) +
      (statusConsultaArray.length > 0 ? 1 : 0) +
      (statusPagamentoArray.length > 0 ? 1 : 0) +
      (showEmpresaFilter && empresaArray.length > 0 ? 1 : 0);

    return (
      <Card className={`p-3 mb-3 ${className}`}>
        {/* Linha compacta: botão Filtros (com contador) + Limpar + contagem de eventos */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className="h-9 px-3 text-sm"
          >
            <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 ml-1.5 opacity-50 transition-transform',
                showFilters && 'rotate-180'
              )}
            />
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-roxo-titulo"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpar
            </Button>
          )}

          {eventCount !== undefined && (
            <span className="ml-auto text-xs text-muted-foreground">
              {eventCount} {eventCount === 1 ? 'evento' : 'eventos'}
            </span>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 space-y-2">
            {/* Grid responsivo de filtros com rótulos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Filtro por profissional */}
              {showProfessionalFilter && (
                <div className="space-y-1">
                  <span className="block text-xs text-muted-foreground">
                    Profissional
                  </span>
                  <Select
                    value={selectedProfessional}
                    onValueChange={onProfessionalChange}
                    disabled={isLoadingProfissionais && !availableProfessionals}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        Todos os profissionais
                      </SelectItem>
                      {professionalsList.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Filtro por tipo de serviço - MULTI-SELECT */}
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Serviços
                </span>
                <MultiSelectFilter
                  allLabel="Todos os serviços"
                  items={tiposServico.map((tipo) => ({
                    id: tipo.id,
                    label: tipo.nome,
                  }))}
                  selectedIds={tipoServicoArray}
                  onSelectionChange={onTipoServicoChange}
                />
              </div>

              {/* Filtro por local - MULTI-SELECT */}
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Locais
                </span>
                <MultiSelectFilter
                  allLabel="Todos os locais"
                  items={locaisAtendimento.map((local) => ({
                    id: local.id,
                    label: local.nome,
                  }))}
                  selectedIds={localArray}
                  onSelectionChange={onLocalChange}
                />
              </div>

              {/* Filtro por status de consulta - MULTI-SELECT */}
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Status da consulta
                </span>
                <MultiSelectFilter
                  allLabel="Todos os status"
                  items={statusConsulta.map((status) => ({
                    id: status.id,
                    label: status.descricao,
                  }))}
                  selectedIds={statusConsultaArray}
                  onSelectionChange={onStatusConsultaChange}
                />
              </div>

              {/* Filtro por status de pagamento - MULTI-SELECT */}
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Status do pagamento
                </span>
                <MultiSelectFilter
                  allLabel="Todos os status"
                  items={statusPagamento.map((status) => ({
                    id: status.id,
                    label: status.descricao,
                  }))}
                  selectedIds={statusPagamentoArray}
                  onSelectionChange={onStatusPagamentoChange}
                />
              </div>

              {/* AI dev note: Filtro por Empresa de Faturamento - MULTI-SELECT.
                  Só é renderizado quando o componente pai fornece onEmpresaChange. */}
              {showEmpresaFilter && (
                <div className="space-y-1">
                  <span className="block text-xs text-muted-foreground">
                    Empresa de faturamento
                  </span>
                  <MultiSelectFilter
                    allLabel="Todas as empresas"
                    items={empresas.map((empresa) => ({
                      id: empresa.id,
                      label: empresa.nome,
                    }))}
                    selectedIds={empresaArray}
                    onSelectionChange={(ids) => onEmpresaChange?.(ids)}
                  />
                </div>
              )}
            </div>

            {/* Busca de paciente */}
            <div className="w-full space-y-1">
              <span className="block text-xs text-muted-foreground">
                Paciente
              </span>
              <PatientSelect
                value={selectedPatient}
                onValueChange={onPatientChange}
                placeholder="Buscar paciente pelo nome completo..."
              />
            </div>
          </div>
        )}

        {/* Resumo dos filtros ativos */}
        {hasActiveFilters && !showFilters && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedProfessional !== 'all' && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Profissional:</span>
                <span className="font-medium">
                  {
                    professionalsList.find((p) => p.id === selectedProfessional)
                      ?.name
                  }
                </span>
              </div>
            )}
            {selectedPatient && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Paciente selecionado</span>
              </div>
            )}
            {tipoServicoArray.length > 0 && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Serviços:</span>
                <span className="font-medium">{tipoServicoArray.length}</span>
              </div>
            )}
            {localArray.length > 0 && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Locais:</span>
                <span className="font-medium">{localArray.length}</span>
              </div>
            )}
            {statusConsultaArray.length > 0 && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Status Consulta:</span>
                <span className="font-medium">
                  {statusConsultaArray.length}
                </span>
              </div>
            )}
            {statusPagamentoArray.length > 0 && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Status Pagamento:</span>
                <span className="font-medium">
                  {statusPagamentoArray.length}
                </span>
              </div>
            )}
            {showEmpresaFilter && empresaArray.length > 0 && (
              <div className="flex items-center gap-1 bg-primary/15 text-roxo-titulo px-2 py-0.5 rounded-full text-xs">
                <span>Empresas:</span>
                <span className="font-medium">{empresaArray.length}</span>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }
);

CalendarFilters.displayName = 'CalendarFilters';
