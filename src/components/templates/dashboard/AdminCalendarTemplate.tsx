import React, { useState, useEffect, useMemo } from 'react';
import { CalendarTemplate } from './CalendarTemplate';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarView } from '@/types/calendar';
import { PatientSelect } from '@/components/composed/PatientSelect';
import { fetchProfissionais } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';
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
    const [profissionais, setProfissionais] = useState<SupabasePessoa[]>([]);
    const [isLoadingProfissionais, setIsLoadingProfissionais] = useState(false);
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
          filtros: { selectedProfessional, selectedPatient },
        });
      }

      return filteredEvents;
    }, [
      events,
      selectedProfessional,
      selectedPatient,
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
    };

    // Função para lidar com mudança de paciente
    const handlePatientChange = (patientId: string) => {
      setSelectedPatient(patientId);
    };

    // Verificar se há filtros ativos
    const hasActiveFilters =
      selectedProfessional !== 'all' || selectedPatient !== '';

    return (
      <div
        className={cn(
          'admin-calendar-template w-full h-full flex flex-col gap-4',
          className
        )}
      >
        {/* AI dev note: Seção de filtros para admin */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Filtro por profissional */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Profissional</label>
                <Select
                  value={selectedProfessional}
                  onValueChange={setSelectedProfessional}
                  disabled={isLoadingProfissionais}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os profissionais</SelectItem>
                    {profissionais.map((prof) => (
                      <SelectItem key={prof.id} value={prof.id}>
                        {prof.nome}
                        {prof.especialidade && ` - ${prof.especialidade}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por paciente */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Paciente</label>
                <PatientSelect
                  value={selectedPatient}
                  onValueChange={handlePatientChange}
                  placeholder="Buscar paciente..."
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
            </div>
          )}
        </Card>

        {/* Main Calendar */}
        <div className="flex-1">
          {getFilteredEvents.length === 0 && hasActiveFilters ? (
            <Card className="h-full flex items-center justify-center">
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
              className="w-full max-w-none h-full"
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
