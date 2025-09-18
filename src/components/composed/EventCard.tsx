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
    // AI dev note: userRole será usado para controlar visualizações específicas por role no futuro
    void userRole;

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
      // AI dev note: CORREÇÃO - Usar nome do paciente direto do metadata
      // Evita problema com tipos de serviço que já contêm traços (ex: "Fisio - DU")
      const pacienteNome =
        (event.metadata?.pacienteNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(-1)[0] // Pegar último elemento após split
          : event.title);

      // Cor do tipo de serviço (evento)
      const corEventoHex =
        (event.metadata?.tipoServicoCor as string) ||
        (event.color ? `var(--${event.color}-500)` : '#3B82F6');

      // Cor do status de pagamento
      const corPagamentoHex =
        (event.metadata?.statusPagamentoCor as string) || '#6B7280';

      return (
        <div
          className={cn(
            'flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity py-0.5 px-1',
            className
          )}
          onClick={handleClick}
          title={`${event.title} - ${event.metadata?.statusPagamento || 'Status não definido'}`}
        >
          {/* Bolinha do tipo de serviço (evento) */}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm"
            style={{ backgroundColor: corEventoHex }}
            title={`Tipo: ${event.metadata?.statusConsulta || 'Não definido'}`}
          />

          {/* Bolinha do status de pagamento */}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm"
            style={{ backgroundColor: corPagamentoHex }}
            title={`Pagamento: ${event.metadata?.statusPagamento || 'Não definido'}`}
          />

          {/* Horário */}
          {!event.allDay && (
            <span className="text-xs font-medium flex-shrink-0 text-gray-700">
              {formatTime(event.start)}
            </span>
          )}

          {/* Nome do paciente */}
          <span className="text-xs truncate flex-1 font-medium text-gray-900">
            {pacienteNome}
          </span>
        </div>
      );
    }

    // Variante para vista semanal
    if (variant === 'week') {
      // AI dev note: CORREÇÃO - Usar dados do metadata ao invés de parsing do título
      const pacienteNome =
        (event.metadata?.pacienteNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(-1)[0] // Último elemento (nome do paciente)
          : event.title);

      const tipoServicoNome =
        (event.metadata?.tipoServicoNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(0, -1).join(' - ') // Tudo exceto último (tipo de serviço)
          : 'Serviço não informado');

      const profissionalNome =
        (event.metadata?.profissionalNome as string) ||
        'Profissional não informado';
      const statusConsulta =
        (event.metadata?.statusConsulta as string) || 'Status não informado';
      const statusPagamento =
        (event.metadata?.statusPagamento as string) || 'Pendente';

      // Cor do tipo de serviço (evento)
      const corEventoHex =
        (event.metadata?.tipoServicoCor as string) ||
        (event.color ? `var(--${event.color}-500)` : '#3B82F6');

      // Cor do status de pagamento
      const corPagamentoHex =
        (event.metadata?.statusPagamentoCor as string) || '#F59E0B';

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
      } else {
        // Vista semanal limpa e simples
        content = (
          <div className="h-full flex flex-col justify-center p-1 space-y-0.5">
            {/* Nome do paciente com bolinha */}
            <div className="flex items-center gap-1">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: corPagamentoHex }}
              />
              <div className="truncate font-medium text-[11px] leading-tight">
                {pacienteNome}
              </div>
            </div>

            {/* Tipo de serviço */}
            <div className="truncate text-[9px] opacity-85 ml-2.5">
              {tipoServicoNome}
            </div>

            {/* Profissional */}
            <div className="truncate text-[9px] opacity-75 ml-2.5">
              {profissionalNome}
            </div>
          </div>
        );
      }

      // Tooltip com informações completas
      const tooltipContent = hasError
        ? 'Erro de dados no agendamento'
        : `${pacienteNome}\n${tipoServicoNome}\n${formatTime(event.start)} - ${formatTime(event.end)}\nStatus: ${statusConsulta}\nPagamento: ${statusPagamento}\nProfissional: ${profissionalNome}\nLocal: ${event.location}`;

      return (
        <div
          className={cn(
            'w-full h-full rounded-sm cursor-pointer hover:opacity-90 transition-opacity',
            'text-white border border-white/10',
            className
          )}
          style={{ backgroundColor: corEventoHex }}
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

      // AI dev note: CORREÇÃO - Usar dados do metadata ao invés de parsing do título
      const pacienteNome =
        (event.metadata?.pacienteNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(-1)[0] // Último elemento (nome do paciente)
          : event.title);

      const tipoServicoNome =
        (event.metadata?.tipoServicoNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(0, -1).join(' - ') // Tudo exceto último (tipo de serviço)
          : 'Serviço não identificado');

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
            {/* Linha 1: Nome do paciente (DESTAQUE) */}
            <div className="text-lg font-bold text-foreground leading-tight">
              {pacienteNome}
            </div>

            {/* Linha 2: Tipo de serviço (EMBAIXO) */}
            <div className="text-sm font-medium text-muted-foreground">
              {tipoServicoNome}
            </div>

            {/* Linha 3: Horário */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {showTime && !event.allDay
                  ? formatTime(event.start)
                  : 'Dia inteiro'}
              </span>
            </div>

            {/* Linha 4: Status badges */}
            <div className="flex flex-wrap gap-2">
              {/* Status da consulta */}
              <Badge
                className="text-xs px-2 py-1"
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
                className="text-xs px-2 py-1"
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

              {/* Badge de evolução pendente */}
              {possuiEvolucao === 'não' && (
                <Badge variant="destructive" className="text-xs px-2 py-1">
                  Evoluir
                </Badge>
              )}
            </div>

            {/* Linha 5: Profissional */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Dr(a). {profissionalNome}
              </span>
            </div>

            {/* Linha 6: Local */}
            {showLocation && event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {event.location}
                </span>
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
