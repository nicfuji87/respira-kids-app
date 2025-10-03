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
import { PatientSelect } from '@/components/composed/PatientSelect';
import { Filter, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchProfissionais } from '@/lib/calendar-services';

// AI dev note: Componente reutilizável de filtros de agenda para todos os roles
// AI dev note: Interface para profissionais normalizados
interface NormalizedProfessional {
  id: string;
  name: string;
}

export interface CalendarFiltersProps {
  // Valores atuais dos filtros
  selectedProfessional: string;
  selectedPatient: string;
  selectedTipoServico: string;
  selectedStatusConsulta: string;
  selectedStatusPagamento: string;

  // Callbacks para mudança de filtros
  onProfessionalChange: (value: string) => void;
  onPatientChange: (value: string) => void;
  onTipoServicoChange: (value: string) => void;
  onStatusConsultaChange: (value: string) => void;
  onStatusPagamentoChange: (value: string) => void;
  onClearFilters: () => void;

  // Configurações
  showProfessionalFilter?: boolean;
  availableProfessionals?: Array<{ id: string; name: string }>;
  eventCount?: number;
  className?: string;
}

export const CalendarFilters = React.memo<CalendarFiltersProps>(
  ({
    selectedProfessional,
    selectedPatient,
    selectedTipoServico,
    selectedStatusConsulta,
    selectedStatusPagamento,
    onProfessionalChange,
    onPatientChange,
    onTipoServicoChange,
    onStatusConsultaChange,
    onStatusPagamentoChange,
    onClearFilters,
    showProfessionalFilter = true,
    availableProfessionals,
    eventCount,
    className = '',
  }) => {
    const [showFilters, setShowFilters] = useState(true);
    const [profissionais, setProfissionais] = useState<
      NormalizedProfessional[]
    >([]);
    const [isLoadingProfissionais, setIsLoadingProfissionais] = useState(false);
    const [tiposServico, setTiposServico] = useState<
      Array<{ id: string; nome: string }>
    >([]);
    const [statusConsulta, setStatusConsulta] = useState<
      Array<{ id: string; descricao: string; cor: string }>
    >([]);
    const [statusPagamento, setStatusPagamento] = useState<
      Array<{ id: string; descricao: string; cor: string }>
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

    // Carregar tipos de serviço, status consulta e status pagamento
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
        } catch (error) {
          console.error('Erro ao carregar dados de filtros:', error);
        }
      };

      loadFilterData();
    }, []);

    // Verificar se há filtros ativos
    const hasActiveFilters =
      selectedProfessional !== 'all' ||
      selectedPatient !== '' ||
      selectedTipoServico !== 'all' ||
      selectedStatusConsulta !== 'all' ||
      selectedStatusPagamento !== 'all';

    // Lista de profissionais a exibir
    const professionalsList = availableProfessionals || profissionais;

    return (
      <Card className={`p-3 mb-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Filtros</h3>
            </div>
            {eventCount !== undefined && (
              <div className="text-sm text-muted-foreground">
                {eventCount} {eventCount === 1 ? 'evento' : 'eventos'}
              </div>
            )}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-7 px-2 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Ocultar' : 'Mostrar'} filtros
          </Button>
        </div>

        {showFilters && (
          <div className="space-y-2">
            {/* Primeira linha - Filtros de select */}
            <div className="flex flex-wrap gap-3">
              {/* Filtro por profissional */}
              {showProfessionalFilter && (
                <Select
                  value={selectedProfessional}
                  onValueChange={onProfessionalChange}
                  disabled={isLoadingProfissionais && !availableProfessionals}
                >
                  <SelectTrigger className="w-[390px]">
                    <SelectValue placeholder="Profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os profissionais</SelectItem>
                    {professionalsList.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Filtro por tipo de serviço */}
              <Select
                value={selectedTipoServico}
                onValueChange={onTipoServicoChange}
              >
                <SelectTrigger className="w-[390px]">
                  <SelectValue placeholder="Tipo de Serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {tiposServico.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id}>
                      {tipo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por status de consulta */}
              <Select
                value={selectedStatusConsulta}
                onValueChange={onStatusConsultaChange}
              >
                <SelectTrigger className="w-[390px]">
                  <SelectValue placeholder="Status da Consulta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {statusConsulta.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por status de pagamento */}
              <Select
                value={selectedStatusPagamento}
                onValueChange={onStatusPagamentoChange}
              >
                <SelectTrigger className="w-[390px]">
                  <SelectValue placeholder="Status do Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {statusPagamento.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Segunda linha - Busca de paciente */}
            <div className="w-full">
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
              <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
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
              <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
                <span>Paciente selecionado</span>
              </div>
            )}
            {selectedTipoServico !== 'all' && (
              <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
                <span>Tipo:</span>
                <span className="font-medium">
                  {tiposServico.find((t) => t.id === selectedTipoServico)?.nome}
                </span>
              </div>
            )}
            {selectedStatusConsulta !== 'all' && (
              <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
                <span>Status Consulta:</span>
                <span className="font-medium">
                  {
                    statusConsulta.find((s) => s.id === selectedStatusConsulta)
                      ?.descricao
                  }
                </span>
              </div>
            )}
            {selectedStatusPagamento !== 'all' && (
              <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
                <span>Status Pagamento:</span>
                <span className="font-medium">
                  {
                    statusPagamento.find(
                      (s) => s.id === selectedStatusPagamento
                    )?.descricao
                  }
                </span>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }
);

CalendarFilters.displayName = 'CalendarFilters';
