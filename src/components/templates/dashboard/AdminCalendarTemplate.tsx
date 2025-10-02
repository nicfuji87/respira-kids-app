import React, { useState, useEffect, useMemo } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';
import { PatientSelect } from '@/components/composed/PatientSelect';
import { fetchProfissionais } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';
import { supabase } from '@/lib/supabase';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { Filter, X } from 'lucide-react';

// AI dev note: Template específico para admins - sem painéis de estatísticas
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin';
}

export interface AdminCalendarTemplateProps {
  currentUser: AdminUser;
  events: CalendarEvent[];
  onEventSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  initialView?: 'month' | 'week' | 'day' | 'agenda';
  initialDate?: Date;
  className?: string;
  showAllProfessionals?: boolean;
  showSystemEvents?: boolean;

  // AI dev note: External state control (repassado do CalendarTemplateWithData)
  externalCurrentDate?: Date;
  externalCurrentView?: CalendarView;
  onExternalDateChange?: (date: Date) => void;
  onExternalViewChange?: (view: CalendarView) => void;

  // Permissions - passed from parent to avoid hardcoded overrides
  canCreateEvents?: boolean;
  canEditEvents?: boolean;
  canDeleteEvents?: boolean;
  canViewAllEvents?: boolean;

  // Navigation handlers
  onPatientClick?: (patientId: string | null) => void;
  onProfessionalClick?: (professionalId: string) => void;
}

export const AdminCalendarTemplate = React.memo<AdminCalendarTemplateProps>(
  ({
    currentUser,
    events,
    onEventSave,
    initialView = 'month',
    initialDate = new Date(),
    className,
    showAllProfessionals = true,
    showSystemEvents = true,
    // AI dev note: External state control
    externalCurrentDate,
    externalCurrentView,
    onExternalDateChange,
    onExternalViewChange,
    canCreateEvents = true,
    canEditEvents = true,
    canDeleteEvents = true,
    canViewAllEvents = true,
    onPatientClick,
    onProfessionalClick,
  }) => {
    // AI dev note: Estados para filtros do admin
    const [selectedProfessional, setSelectedProfessional] =
      useState<string>('all');
    const [selectedPatient, setSelectedPatient] = useState<string>('');
    const [selectedTipoServico, setSelectedTipoServico] =
      useState<string>('all');
    const [selectedStatusConsulta, setSelectedStatusConsulta] =
      useState<string>('all');
    const [selectedStatusPagamento, setSelectedStatusPagamento] =
      useState<string>('all');
    const [profissionais, setProfissionais] = useState<SupabasePessoa[]>([]);
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
    const [showFilters, setShowFilters] = useState(true); // Mostrar filtros por padrão

    // Carregar lista de profissionais
    useEffect(() => {
      const loadProfissionais = async () => {
        setIsLoadingProfissionais(true);
        try {
          const data = await fetchProfissionais();
          setProfissionais(data);
        } catch (error) {
          console.error('Erro ao carregar profissionais:', error);
        } finally {
          setIsLoadingProfissionais(false);
        }
      };

      loadProfissionais();
    }, []);

    // AI dev note: Carregar tipos de serviço, status consulta e status pagamento
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

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG: AdminCalendarTemplate - FILTROS', {
        selectedProfessional,
        selectedPatient,
        'profissionais carregados': profissionais.length,
        'eventos totais': events.length,
      });
    }
    const getFilteredEvents = useMemo(() => {
      let filteredEvents = [...events];

      // AI dev note: Filtrar por profissional se selecionado
      if (selectedProfessional && selectedProfessional !== 'all') {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as { profissionalId?: string };
          return metadata?.profissionalId === selectedProfessional;
        });
      }

      // AI dev note: Filtrar por paciente se selecionado
      if (selectedPatient) {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as { pacienteId?: string };
          return metadata?.pacienteId === selectedPatient;
        });
      }

      // AI dev note: Filtrar por tipo de serviço
      if (selectedTipoServico && selectedTipoServico !== 'all') {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as { tipoServicoId?: string };
          return metadata?.tipoServicoId === selectedTipoServico;
        });
      }

      // AI dev note: Filtrar por status de consulta
      if (selectedStatusConsulta && selectedStatusConsulta !== 'all') {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { status_consulta_id?: string };
          };
          return (
            metadata?.appointmentData?.status_consulta_id ===
            selectedStatusConsulta
          );
        });
      }

      // AI dev note: Filtrar por status de pagamento
      if (selectedStatusPagamento && selectedStatusPagamento !== 'all') {
        filteredEvents = filteredEvents.filter((event) => {
          const metadata = event.metadata as {
            appointmentData?: { status_pagamento_id?: string };
          };
          return (
            metadata?.appointmentData?.status_pagamento_id ===
            selectedStatusPagamento
          );
        });
      }

      if (!showAllProfessionals) {
        // Filter to specific professionals if needed
        // Implementation would depend on specific requirements
      }

      if (!showSystemEvents) {
        // Filter out system events if needed
        filteredEvents = filteredEvents.filter(
          (event) => !event.metadata?.isSystemEvent
        );
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 DEBUG: AdminCalendarTemplate - EVENTOS FILTRADOS', {
          'eventos antes': events.length,
          'eventos depois': filteredEvents.length,
          filtros: {
            selectedProfessional,
            selectedPatient,
            selectedTipoServico,
            selectedStatusConsulta,
            selectedStatusPagamento,
          },
        });
      }

      return filteredEvents;
    }, [
      events,
      selectedProfessional,
      selectedPatient,
      selectedTipoServico,
      selectedStatusConsulta,
      selectedStatusPagamento,
      showAllProfessionals,
      showSystemEvents,
    ]);

    const handleEventSave = (
      event: Omit<CalendarEvent, 'id'> & { id?: string }
    ) => {
      const adminEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          createdBy: currentUser.id,
          createdAt: new Date(),
        },
      };

      onEventSave(adminEvent);
    };

    // AI dev note: Função para limpar todos os filtros
    const clearFilters = () => {
      setSelectedProfessional('all');
      setSelectedPatient('');
      setSelectedTipoServico('all');
      setSelectedStatusConsulta('all');
      setSelectedStatusPagamento('all');
    };

    // Função para lidar com mudança de paciente
    const handlePatientChange = (patientId: string) => {
      setSelectedPatient(patientId);
    };

    // Verificar se há filtros ativos
    const hasActiveFilters =
      selectedProfessional !== 'all' ||
      selectedPatient !== '' ||
      selectedTipoServico !== 'all' ||
      selectedStatusConsulta !== 'all' ||
      selectedStatusPagamento !== 'all';

    return (
      <div className={cn('admin-calendar-template w-full', className)}>
        {/* AI dev note: Seção de filtros para admin */}
        <Card className="p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Filtros</h3>
              </div>
              <div className="text-sm text-muted-foreground">
                {getFilteredEvents.length}{' '}
                {getFilteredEvents.length === 1 ? 'evento' : 'eventos'}
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
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
              {/* Primeira linha - Filtros de select AUMENTADOS */}
              <div className="flex flex-wrap gap-3">
                {/* Filtro por profissional */}
                <Select
                  value={selectedProfessional}
                  onValueChange={setSelectedProfessional}
                  disabled={isLoadingProfissionais}
                >
                  <SelectTrigger className="w-[390px]">
                    <SelectValue placeholder="Profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os profissionais</SelectItem>
                    {profissionais.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Filtro por tipo de serviço */}
                <Select
                  value={selectedTipoServico}
                  onValueChange={setSelectedTipoServico}
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
                  onValueChange={setSelectedStatusConsulta}
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
                  onValueChange={setSelectedStatusPagamento}
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

              {/* Segunda linha - Busca de paciente SEPARADA */}
              <div className="w-full">
                <PatientSelect
                  value={selectedPatient}
                  onValueChange={handlePatientChange}
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
                      profissionais.find((p) => p.id === selectedProfessional)
                        ?.nome
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
                    {
                      tiposServico.find((t) => t.id === selectedTipoServico)
                        ?.nome
                    }
                  </span>
                </div>
              )}
              {selectedStatusConsulta !== 'all' && (
                <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-xs">
                  <span>Status Consulta:</span>
                  <span className="font-medium">
                    {
                      statusConsulta.find(
                        (s) => s.id === selectedStatusConsulta
                      )?.descricao
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

        {/* Main Calendar */}
        <div>
          {getFilteredEvents.length === 0 && hasActiveFilters ? (
            <Card className="flex items-center justify-center">
              <div className="text-center space-y-4 p-8">
                <Filter className="h-12 w-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-medium">
                    Nenhum evento encontrado
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Não há eventos que correspondam aos filtros selecionados.
                  </p>
                </div>
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Limpar filtros
                </Button>
              </div>
            </Card>
          ) : (
            <CalendarTemplate
              events={getFilteredEvents}
              onEventSave={handleEventSave}
              initialView={initialView}
              initialDate={initialDate}
              externalCurrentDate={externalCurrentDate}
              externalCurrentView={externalCurrentView}
              onExternalDateChange={onExternalDateChange}
              onExternalViewChange={onExternalViewChange}
              className="w-full max-w-none"
              userRole={currentUser.role}
              onPatientClick={onPatientClick}
              onProfessionalClick={onProfessionalClick}
              canCreateEvents={canCreateEvents}
              canEditEvents={canEditEvents}
              canDeleteEvents={canDeleteEvents}
              canViewAllEvents={canViewAllEvents}
            />
          )}
        </div>
      </div>
    );
  }
);
