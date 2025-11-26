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

    const handleClick = (e?: React.MouseEvent) => {
      e?.stopPropagation(); // AI dev note: Evitar propagação do evento para containers pais
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
          onClick={(e) => handleClick(e)}
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

      // AI dev note: Detectar se agendamento está cancelado
      const statusConsulta = (event.metadata?.statusConsulta as string) || '';
      const isCancelado = statusConsulta.toLowerCase() === 'cancelado';

      // Mapa de cores para hex
      const colorToHex: Record<string, string> = {
        blue: '#3B82F6',
        green: '#22C55E',
        orange: '#F97316',
        red: '#EF4444',
        purple: '#8B5CF6',
        pink: '#EC4899',
        gray: '#6B7280',
      };

      // Cor do tipo de serviço (evento)
      const corEventoHex = event.color
        ? colorToHex[event.color] || '#3B82F6'
        : '#3B82F6';

      // Cor do status de pagamento vinda do metadata
      const corPagamentoHex =
        (event.metadata?.statusPagamentoCor as string) || '#6B7280';

      return (
        <div
          className={cn(
            'flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity py-0.5 px-1 rounded',
            // AI dev note: Aplicar background cinza translúcido para cancelados
            isCancelado && 'bg-gray-200/60',
            className
          )}
          onClick={(e) => handleClick(e)}
          title={`${event.title} - ${event.metadata?.statusPagamento || 'Status não definido'}`}
        >
          {/* Bolinha do tipo de serviço (evento) */}
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm',
              // AI dev note: Reduzir opacidade da bolinha se cancelado
              isCancelado && 'opacity-40'
            )}
            style={{ backgroundColor: corEventoHex }}
            title={`Tipo: ${event.metadata?.statusConsulta || 'Não definido'}`}
          />

          {/* Bolinha do status de pagamento - Ocultar se cancelado */}
          {!isCancelado && (
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm"
              style={{ backgroundColor: corPagamentoHex }}
              title={`Pagamento: ${event.metadata?.statusPagamento || 'Não definido'}`}
            />
          )}

          {/* Horário */}
          {!event.allDay && (
            <span
              className={cn(
                'text-xs font-medium flex-shrink-0',
                // AI dev note: Texto cinza se cancelado
                isCancelado ? 'text-gray-500' : 'text-gray-700'
              )}
            >
              {formatTime(event.start)}
            </span>
          )}

          {/* Nome do paciente */}
          <span
            className={cn(
              'text-xs truncate flex-1 font-medium',
              // AI dev note: Texto cinza com line-through se cancelado
              isCancelado ? 'text-gray-500 line-through' : 'text-gray-900'
            )}
          >
            {pacienteNome}
          </span>
        </div>
      );
    }

    // Variante para vista semanal - SIMPLIFICADA conforme modelo Google Agenda
    // AI dev note: Mostra apenas nome do paciente + profissional
    // A cor indica tipo de serviço, bolinha indica status pagamento, horário é pelo grid
    if (variant === 'week') {
      const pacienteNome =
        (event.metadata?.pacienteNome as string) ||
        (event.title.includes(' - ')
          ? event.title.split(' - ').slice(-1)[0]
          : event.title);

      const profissionalNome =
        (event.metadata?.profissionalNome as string) || '';
      const statusConsulta = (event.metadata?.statusConsulta as string) || '';
      const statusPagamento =
        (event.metadata?.statusPagamento as string) || 'Pendente';
      const tipoServicoNome = (event.metadata?.tipoServicoNome as string) || '';

      const isCancelado = statusConsulta.toLowerCase() === 'cancelado';

      // Mapa de cores para hex
      const colorToHex: Record<string, string> = {
        blue: '#3B82F6',
        green: '#22C55E',
        orange: '#F97316',
        red: '#EF4444',
        purple: '#8B5CF6',
        pink: '#EC4899',
        gray: '#6B7280',
      };

      const corEventoHex = isCancelado
        ? '#9CA3AF'
        : event.color
          ? colorToHex[event.color] || '#3B82F6'
          : '#3B82F6';

      const corPagamentoHex =
        (event.metadata?.statusPagamentoCor as string) || '#6B7280';

      // Tooltip com todas as informações para quando clicar/hover
      const tooltipContent = `${pacienteNome}\n${tipoServicoNome}\n${formatTime(event.start)} - ${formatTime(event.end)}\nStatus: ${statusConsulta}\nPagamento: ${statusPagamento}\nProfissional: ${profissionalNome}\nLocal: ${event.location}`;

      return (
        <div
          className={cn(
            'w-full h-full rounded-sm cursor-pointer hover:opacity-90 transition-opacity overflow-hidden',
            'text-white border border-white/10',
            isCancelado && 'opacity-70',
            className
          )}
          style={{ backgroundColor: corEventoHex }}
          onClick={(e) => handleClick(e)}
          title={tooltipContent}
        >
          {/* Conteúdo simplificado: paciente + profissional */}
          <div className="h-full flex flex-col justify-start p-1 overflow-hidden">
            {/* Nome do paciente com bolinha de status pagamento */}
            <div className="flex items-start gap-1 min-w-0">
              {!isCancelado && (
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: corPagamentoHex }}
                />
              )}
              <div
                className={cn(
                  'font-medium text-[10px] leading-tight break-words',
                  isCancelado && 'line-through opacity-75'
                )}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {pacienteNome}
              </div>
            </div>

            {/* Nome do profissional - apenas primeiro nome */}
            {profissionalNome && (
              <div
                className={cn(
                  'text-[8px] leading-tight opacity-80 truncate mt-0.5',
                  isCancelado && 'opacity-50'
                )}
              >
                {profissionalNome.split(' ')[0]}
              </div>
            )}
          </div>
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

      // AI dev note: Detectar se agendamento está cancelado
      const isCancelado = statusConsulta.toLowerCase() === 'cancelado';

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
            // AI dev note: Background cinza claro para cancelados
            isCancelado && 'bg-gray-100/80',
            className
          )}
          onClick={(e) => handleClick(e)}
          style={{
            // AI dev note: Borda cinza para cancelados, cor do serviço para demais
            borderLeftColor: isCancelado
              ? '#9CA3AF'
              : isValidHexColor(tipoServicoCor)
                ? tipoServicoCor
                : '#3B82F6',
          }}
        >
          <div className="space-y-3">
            {/* Linha 1: Nome do paciente (DESTAQUE) */}
            <div
              className={cn(
                'text-lg font-bold leading-tight',
                // AI dev note: Line-through e cinza se cancelado
                isCancelado ? 'text-gray-500 line-through' : 'text-foreground'
              )}
            >
              {pacienteNome}
            </div>

            {/* Linha 1.5: Nome do responsável legal */}
            {(() => {
              const responsavelLegalNome = event.metadata
                ?.responsavelLegalNome as string;
              if (responsavelLegalNome) {
                return (
                  <div
                    className={cn(
                      'text-sm italic',
                      isCancelado ? 'text-gray-400' : 'text-muted-foreground'
                    )}
                  >
                    ({responsavelLegalNome})
                  </div>
                );
              }
              return null;
            })()}

            {/* Linha 2: Tipo de serviço (EMBAIXO) */}
            <div
              className={cn(
                'text-sm font-medium',
                isCancelado ? 'text-gray-500' : 'text-muted-foreground'
              )}
            >
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

              {/* AI dev note: Badge de evolução pendente - exibir quando não tem evolução e não está cancelado */}
              {possuiEvolucao === 'não' && !isCancelado && (
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
      // Extrair dados do metadata
      const statusConsulta = (event.metadata?.statusConsulta as string) || '';
      const statusPagamento = (event.metadata?.statusPagamento as string) || '';
      const statusConsultaCor =
        (event.metadata?.statusConsultaCor as string) || '#3B82F6';
      const statusPagamentoCor =
        (event.metadata?.statusPagamentoCor as string) || '#3B82F6';
      const tipoServicoCor =
        (event.metadata?.tipoServicoCor as string) || '#3B82F6';
      const possuiEvolucao =
        (event.metadata?.possuiEvolucao as string) || 'não';

      // AI dev note: Detectar se agendamento está cancelado
      const isCancelado = statusConsulta.toLowerCase() === 'cancelado';

      const isValidHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);

      return (
        <Card
          className={cn(
            'cursor-pointer border-l-4 hover:shadow-md transition-shadow',
            // AI dev note: Background cinza claro para cancelados
            isCancelado && 'bg-gray-100/80',
            className
          )}
          onClick={(e) => handleClick(e)}
          style={{
            // AI dev note: Borda cinza para cancelados, cor do serviço para demais
            borderLeftColor: isCancelado
              ? '#9CA3AF'
              : isValidHexColor(tipoServicoCor)
                ? tipoServicoCor
                : '#3B82F6',
          }}
        >
          <CardContent className="p-3 md:p-4">
            <div className="space-y-1.5 md:space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={cn(
                    'font-semibold text-sm flex-1',
                    // AI dev note: Line-through e cinza se cancelado
                    isCancelado && 'line-through text-gray-500'
                  )}
                >
                  {event.title}
                </h3>
                {showTime && (
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {formatDuration()}
                  </Badge>
                )}
              </div>

              {event.description && (
                <p
                  className={cn(
                    'text-xs md:text-sm line-clamp-2',
                    isCancelado ? 'text-gray-500' : 'text-muted-foreground'
                  )}
                >
                  {event.description}
                </p>
              )}

              {/* Status badges com cores corretas */}
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {statusConsulta && (
                  <Badge
                    className="text-xs px-1.5 py-0.5 md:px-2 md:py-1"
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
                )}

                {statusPagamento && (
                  <Badge
                    className="text-xs px-1.5 py-0.5 md:px-2 md:py-1"
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
                )}

                {/* AI dev note: Badge de evolução pendente - exibir quando não tem evolução e não está cancelado */}
                {possuiEvolucao === 'não' && !isCancelado && (
                  <Badge
                    variant="destructive"
                    className="text-xs px-1.5 py-0.5 md:px-2 md:py-1"
                  >
                    Evoluir
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 md:gap-4 text-xs text-muted-foreground flex-wrap">
                {showLocation && event.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}

                {showAttendees &&
                  event.attendees &&
                  event.attendees.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 flex-shrink-0" />
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
        onClick={(e) => handleClick(e)}
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
