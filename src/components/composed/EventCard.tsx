import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Clock, Users } from 'lucide-react';

import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';

import { cn } from '@/lib/utils';
import type { CalendarEvent, EventColor } from '@/types/calendar';

import { eventColorMap } from '@/types/calendar';

// AI dev note: EventCard combina Card e Badge primitives
// Componente reutilizável para exibir eventos em diferentes vistas do calendário

export interface EventCardProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
  variant?: 'default' | 'compact' | 'detailed' | 'month' | 'week' | 'eventList';
  className?: string;
  showTime?: boolean;
  showLocation?: boolean;
  showAttendees?: boolean;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

export const EventCard = React.memo<EventCardProps>(
  ({
    event,
    onClick,
    variant = 'default',
    className,
    showTime = true,
    showLocation = false,
    showAttendees = false,
    userRole,
  }) => {
    const handleClick = () => {
      onClick?.(event);
    };

    const getColorClasses = (color: EventColor = 'blue') => {
      return eventColorMap[color];
    };

    const formatTime = (date: Date) => {
      return format(date, 'HH:mm', { locale: ptBR });
    };

    const formatDuration = () => {
      const start = event.start;
      const end = event.end;

      if (event.allDay) {
        return 'Dia inteiro';
      }

      return `${formatTime(start)} - ${formatTime(end)}`;
    };

    // Variante compacta para vista mensal
    if (variant === 'compact') {
      return (
        <Badge
          className={cn(
            'cursor-pointer truncate text-xs font-medium border',
            getColorClasses(event.color),
            'hover:opacity-80 transition-opacity',
            className
          )}
          onClick={handleClick}
          title={event.title}
        >
          {showTime && !event.allDay && (
            <span className="mr-1">{formatTime(event.start)}</span>
          )}
          {event.title}
        </Badge>
      );
    }

    // Variante compacta para vista mensal
    if (variant === 'month') {
      // Extrair nome do paciente do título (formato: "Tipo Servico - Nome Paciente")
      const pacienteNome = event.title.includes(' - ')
        ? event.title.split(' - ')[1]
        : event.title;

      // Usar cor hex diretamente do metadata se disponível, senão mapear a cor do evento
      const corHex =
        (event.metadata?.tipoServicoCor as string) ||
        (event.color ? `var(--${event.color}-500)` : '#3B82F6');

      return (
        <div
          className={cn(
            'flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity py-0.5',
            className
          )}
          onClick={handleClick}
          title={event.title}
        >
          {/* Bolinha colorida */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: corHex }}
          />

          {/* Horário */}
          {!event.allDay && (
            <span className="text-xs font-medium flex-shrink-0">
              {formatTime(event.start)}
            </span>
          )}

          {/* Nome do paciente */}
          <span className="text-xs truncate flex-1">{pacienteNome}</span>
        </div>
      );
    }

    // Variante para vista semanal
    if (variant === 'week') {
      // Extrair dados do evento
      const pacienteNome = event.title.includes(' - ')
        ? event.title.split(' - ')[1]
        : event.title;

      const tipoServicoNome = event.title.includes(' - ')
        ? event.title.split(' - ')[0]
        : 'Serviço não informado';

      const profissionalNome =
        (event.metadata?.profissionalNome as string) ||
        'Profissional não informado';
      const statusConsulta =
        (event.metadata?.statusConsulta as string) || 'Status não informado';

      // Usar cor hex diretamente do metadata se disponível, senão mapear a cor do evento
      const corHex =
        (event.metadata?.tipoServicoCor as string) ||
        (event.color ? `var(--${event.color}-500)` : '#3B82F6');

      // Verificar se há erro nos dados
      const hasError = !event.metadata || !pacienteNome;

      // Renderizar baseado no role e altura disponível
      let content;
      if (hasError) {
        content = (
          <div className="truncate text-center">
            Erro de dados no agendamento
          </div>
        );
      } else if (userRole === 'profissional') {
        content = (
          <div className="space-y-0.5 overflow-hidden">
            <div className="truncate font-medium">{pacienteNome}</div>
            <div className="truncate text-xs opacity-90">{tipoServicoNome}</div>
            <div className="truncate text-xs opacity-75">{statusConsulta}</div>
          </div>
        );
      } else if (userRole === 'admin' || userRole === 'secretaria') {
        content = (
          <div className="space-y-0.5 overflow-hidden">
            <div className="truncate font-medium">{pacienteNome}</div>
            <div className="truncate text-xs opacity-90">
              {profissionalNome}
            </div>
          </div>
        );
      } else {
        // Fallback para role não definido
        content = <div className="truncate font-medium">{pacienteNome}</div>;
      }

      // Tooltip com informações completas
      const tooltipContent = hasError
        ? 'Erro de dados no agendamento'
        : userRole === 'profissional'
          ? `${pacienteNome} - ${tipoServicoNome} - ${statusConsulta}`
          : userRole === 'admin' || userRole === 'secretaria'
            ? `${pacienteNome} - ${profissionalNome}`
            : pacienteNome;

      return (
        <div
          className={cn(
            'w-full h-full rounded-md p-2 cursor-pointer hover:opacity-90 transition-opacity',
            'border border-white/20 shadow-sm text-white text-xs',
            className
          )}
          style={{ backgroundColor: corHex }}
          onClick={handleClick}
          title={tooltipContent}
        >
          {content}
        </div>
      );
    }

    // Variante para lista de eventos do modal
    if (variant === 'eventList') {
      // Extrair dados do metadata
      const profissionalNome =
        (event.metadata?.profissionalNome as string) || '';
      const responsavelLegalNome =
        (event.metadata?.responsavelLegalNome as string) || null;
      const statusConsulta = (event.metadata?.statusConsulta as string) || '';
      const statusPagamento = (event.metadata?.statusPagamento as string) || '';
      const statusConsultaCor =
        (event.metadata?.statusConsultaCor as string) || '#3B82F6';
      const statusPagamentoCor =
        (event.metadata?.statusPagamentoCor as string) || '#3B82F6';
      const possuiEvolucao =
        (event.metadata?.possuiEvolucao as string) || 'não';
      const tipoServicoCor =
        (event.metadata?.tipoServicoCor as string) || '#3B82F6';

      // Extrair nome do paciente do título
      const pacienteNome = event.title.includes(' - ')
        ? event.title.split(' - ')[1]
        : event.title;

      // Extrair nome do serviço do título
      const tipoServicoNome = event.title.includes(' - ')
        ? event.title.split(' - ')[0]
        : event.title;

      const isValidHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);

      return (
        <Card
          className={cn(
            'cursor-pointer border-l-4 hover:shadow-md transition-shadow p-4',
            className
          )}
          onClick={handleClick}
          style={{
            borderLeftColor: isValidHexColor(tipoServicoCor)
              ? tipoServicoCor
              : '#3B82F6',
          }}
        >
          <div className="space-y-3">
            {/* Linha 1: Nome do paciente */}
            <div className="font-semibold text-foreground">{pacienteNome}</div>

            {/* Linha 2: Responsável legal (se existir) */}
            {responsavelLegalNome && (
              <div className="text-sm text-muted-foreground">
                {responsavelLegalNome}
              </div>
            )}

            {/* Linha 3: Horário e Serviço com badges inline */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {showTime && !event.allDay && formatTime(event.start)}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-sm text-muted-foreground">
                  {tipoServicoNome}
                </span>

                {/* Badges de status - empilhados no mobile, inline no desktop */}
                <div className="flex flex-wrap gap-1">
                  {/* Status da consulta */}
                  <Badge
                    className="text-xs px-1.5 py-0.5 h-5"
                    style={{
                      backgroundColor: isValidHexColor(statusConsultaCor)
                        ? statusConsultaCor
                        : '#3B82F6',
                      color: '#FFFFFF',
                      border: 'none',
                    }}
                  >
                    {statusConsulta}
                  </Badge>

                  {/* Status do pagamento */}
                  <Badge
                    className="text-xs px-1.5 py-0.5 h-5"
                    style={{
                      backgroundColor: isValidHexColor(statusPagamentoCor)
                        ? statusPagamentoCor
                        : '#3B82F6',
                      color: '#FFFFFF',
                      border: 'none',
                    }}
                  >
                    {statusPagamento}
                  </Badge>

                  {/* Badge de evolução - apenas se não possui */}
                  {possuiEvolucao === 'não' && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0.5 h-5 bg-yellow-50 text-yellow-800 border-yellow-200"
                    >
                      Evoluir
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Linha 4: Profissional */}
            <div className="text-sm text-muted-foreground">
              Dr(a). {profissionalNome}
            </div>

            {/* Linha 5: Local */}
            {showLocation && event.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{event.location}</span>
              </div>
            )}
          </div>
        </Card>
      );
    }

    // Variante detalhada para vista de agenda
    if (variant === 'detailed') {
      return (
        <Card
          className={cn(
            'cursor-pointer border-l-4 hover:shadow-md transition-shadow',
            className
          )}
          onClick={handleClick}
          style={{
            borderLeftColor: event.color
              ? `var(--${event.color}-500)`
              : 'var(--blue-500)',
          }}
        >
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm">{event.title}</h3>
                {showTime && (
                  <Badge variant="outline" className="text-xs">
                    {formatDuration()}
                  </Badge>
                )}
              </div>

              {event.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {event.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {showLocation && event.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{event.location}</span>
                  </div>
                )}

                {showAttendees &&
                  event.attendees &&
                  event.attendees.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{event.attendees.length} participantes</span>
                    </div>
                  )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Variante padrão para vistas semanal e diária
    return (
      <Card
        className={cn(
          'cursor-pointer border transition-all hover:shadow-sm',
          getColorClasses(event.color),
          className
        )}
        onClick={handleClick}
      >
        <CardContent className="p-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm truncate">{event.title}</h4>
              {showTime && !event.allDay && (
                <Clock className="h-3 w-3 flex-shrink-0 ml-1" />
              )}
            </div>

            {showTime && (
              <p className="text-xs opacity-75">{formatDuration()}</p>
            )}

            {showLocation && event.location && (
              <div className="flex items-center gap-1 text-xs opacity-75">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

EventCard.displayName = 'EventCard';
