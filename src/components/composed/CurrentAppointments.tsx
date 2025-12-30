import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Clock,
  MapPin,
  User,
  Play,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCog,
  Zap,
  Users,
  FileText,
  Calendar,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CurrentWindowAppointment,
  EvolucaoHistorico,
  UpcomingAppointment,
} from '@/lib/professional-dashboard-api';

// AI dev note: CurrentAppointments - Exibe janela de 3 atendimentos (anterior, atual, próximo)
// Para acesso rápido aos atendimentos do momento atual
// Usado no topo do dashboard de profissional e admin
// Inclui opção de expandir para ver mais atendimentos

interface CurrentAppointmentsProps {
  appointments: CurrentWindowAppointment[];
  upcomingAppointments?: UpcomingAppointment[];
  loading?: boolean;
  error?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAppointmentClick?: (appointment: any) => void;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

const formatTime = (dateString: string) => {
  // Parse manual para evitar conversão automática de timezone
  const [datePart, timePart] =
    dateString.split('T').length > 1
      ? dateString.split('T')
      : dateString.split(' ');

  const [, , ,] = datePart.split('-');
  const [hour, minute] = timePart.split('+')[0].split(':');

  return `${hour}:${minute}`;
};

const CurrentAppointmentCard = React.memo<{
  appointment: CurrentWindowAppointment;
  onClick?: (appointment: CurrentWindowAppointment) => void;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}>(({ appointment, onClick, userRole }) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const getPositionStyles = () => {
    switch (appointment.position) {
      case 'previous':
        return {
          border: 'border-muted-foreground/30',
          bg: 'bg-muted/30',
          icon: <ChevronLeft className="h-4 w-4" />,
          label: 'Anterior',
          labelColor: 'text-muted-foreground',
        };
      case 'current':
        return {
          border: appointment.isInProgress
            ? 'border-verde-pipa ring-2 ring-verde-pipa/20'
            : 'border-azul-respira ring-2 ring-azul-respira/20',
          bg: appointment.isInProgress
            ? 'bg-verde-pipa/5'
            : 'bg-azul-respira/5',
          icon: appointment.isInProgress ? (
            <Play className="h-4 w-4 fill-current" />
          ) : (
            <Clock className="h-4 w-4" />
          ),
          label: appointment.isInProgress ? 'Em Andamento' : 'Atual',
          labelColor: appointment.isInProgress
            ? 'text-verde-pipa'
            : 'text-azul-respira',
        };
      case 'next':
        return {
          border: 'border-roxo-titulo/30',
          bg: 'bg-roxo-titulo/5',
          icon: <ChevronRight className="h-4 w-4" />,
          label: 'Próximo',
          labelColor: 'text-roxo-titulo',
        };
    }
  };

  const styles = getPositionStyles();
  const shouldShowProfessional =
    userRole === 'admin' || userRole === 'secretaria';

  const handleCardClick = (e: React.MouseEvent) => {
    // Não disparar onClick se clicar no botão de histórico
    if ((e.target as HTMLElement).closest('[data-history-toggle]')) {
      return;
    }
    onClick?.(appointment);
  };

  return (
    <div
      className={cn(
        'flex flex-col p-3 md:p-4 border-2 rounded-xl transition-all duration-200',
        styles.border,
        styles.bg,
        'hover:shadow-lg hover:scale-[1.02]',
        onClick && 'cursor-pointer'
      )}
      onClick={handleCardClick}
    >
      {/* Header com posição e horário */}
      <div className="flex items-center justify-between mb-2">
        <div className={cn('flex items-center gap-1.5', styles.labelColor)}>
          {styles.icon}
          <span className="text-xs font-semibold uppercase tracking-wide">
            {styles.label}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-mono',
            appointment.position === 'current' && appointment.isInProgress
              ? 'bg-verde-pipa text-white border-verde-pipa'
              : 'bg-background'
          )}
        >
          {formatTime(appointment.dataHora)}
        </Badge>
      </div>

      {/* Paciente */}
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-4 w-4 text-foreground/70 flex-shrink-0" />
        <span className="font-semibold text-sm md:text-base text-foreground truncate">
          {appointment.pacienteNome}
        </span>
      </div>

      {/* Responsável Legal */}
      {appointment.responsavelLegalNome && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Users className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            Resp: {appointment.responsavelLegalNome}
          </span>
        </div>
      )}

      {/* Serviço */}
      <div className="text-xs md:text-sm text-muted-foreground mb-1.5 truncate">
        {appointment.tipoServico}
      </div>

      {/* Local */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{appointment.local}</span>
      </div>

      {/* Profissional (apenas para admin/secretaria) */}
      {shouldShowProfessional && appointment.profissionalNome && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <UserCog className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{appointment.profissionalNome}</span>
        </div>
      )}

      {/* Badge Evoluir para atendimentos anterior e atual */}
      {(appointment.position === 'previous' ||
        appointment.position === 'current') && (
        <div className="mt-2 flex justify-end">
          <Badge
            variant="outline"
            className="bg-amarelo-crianca/10 text-amarelo-crianca border-amarelo-crianca/30 text-[10px] font-semibold gap-1"
          >
            <FileText className="h-3 w-3" />
            Evoluir
          </Badge>
        </div>
      )}

      {/* Última Evolução + Ver outras */}
      {appointment.evolucoes && appointment.evolucoes.length > 0 && (
        <EvolucoesSection
          evolucoes={appointment.evolucoes}
          showOthers={isHistoryOpen}
          onToggleOthers={() => setIsHistoryOpen(!isHistoryOpen)}
        />
      )}
    </div>
  );
});

// AI dev note: Componente para exibir evoluções - última visível, outras expandíveis
const EvolucoesSection = React.memo<{
  evolucoes: EvolucaoHistorico[];
  showOthers: boolean;
  onToggleOthers: () => void;
}>(({ evolucoes, showOthers, onToggleOthers }) => {
  // Primeira evolução (mais recente) sempre visível
  const ultimaEvolucao = evolucoes[0];
  const outrasEvolucoes = evolucoes.slice(1);
  const hasOthers = outrasEvolucoes.length > 0;

  return (
    <div className="mt-2 space-y-2">
      {/* Última evolução - sempre visível e completa */}
      <div className="rounded-md border bg-muted/20 overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 border-b">
          <FileText className="h-3 w-3 text-azul-respira flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">
            Última Evolução
          </span>
          <span className="text-[10px] text-muted-foreground">
            • {ultimaEvolucao.data}
          </span>
          {ultimaEvolucao.profissionalNome && (
            <span className="text-[10px] text-muted-foreground truncate">
              • {ultimaEvolucao.profissionalNome}
            </span>
          )}
        </div>
        <div className="p-2">
          <div
            className="text-xs text-foreground leading-relaxed prose prose-xs prose-slate dark:prose-invert max-w-none [&>div]:my-1 [&_br]:content-[''] [&_br]:block [&_br]:my-1"
            dangerouslySetInnerHTML={{ __html: ultimaEvolucao.conteudo }}
          />
        </div>
      </div>

      {/* Botão para ver outras evoluções */}
      {hasOthers && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-xs gap-1.5 justify-center hover:bg-muted/50 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOthers();
            }}
            data-history-toggle
          >
            <span>
              {showOthers
                ? 'Ocultar outras evoluções'
                : `Ver outras ${outrasEvolucoes.length} evolução(ões)`}
            </span>
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200',
                showOthers && 'rotate-180'
              )}
            />
          </Button>

          {/* Outras evoluções - expandível */}
          {showOthers && (
            <ScrollArea className="max-h-48 rounded-md border bg-background/50">
              <div className="p-2 space-y-2">
                {outrasEvolucoes.map((evolucao) => (
                  <div
                    key={evolucao.id}
                    className="rounded-md border bg-background overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 border-b">
                      <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground">
                        {evolucao.data}
                      </span>
                      {evolucao.profissionalNome && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          • {evolucao.profissionalNome}
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <div
                        className="text-xs text-foreground leading-relaxed prose prose-xs prose-slate dark:prose-invert max-w-none [&>div]:my-1 [&_br]:content-[''] [&_br]:block [&_br]:my-1"
                        dangerouslySetInnerHTML={{ __html: evolucao.conteudo }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
});

EvolucoesSection.displayName = 'EvolucoesSection';

CurrentAppointmentCard.displayName = 'CurrentAppointmentCard';

const CurrentAppointmentSkeleton = React.memo(() => (
  <div className="flex flex-col p-4 border-2 rounded-xl border-muted">
    <div className="flex items-center justify-between mb-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-14" />
    </div>
    <Skeleton className="h-5 w-32 mb-1.5" />
    <Skeleton className="h-4 w-24 mb-1.5" />
    <Skeleton className="h-3 w-20" />
  </div>
));

CurrentAppointmentSkeleton.displayName = 'CurrentAppointmentSkeleton';

// AI dev note: Card simplificado para lista de "Ver mais atendimentos"
const UpcomingAppointmentRow = React.memo<{
  appointment: UpcomingAppointment;
  onClick?: (appointment: UpcomingAppointment) => void;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}>(({ appointment, onClick, userRole }) => {
  const shouldShowProfessional =
    (userRole === 'admin' || userRole === 'secretaria') &&
    appointment.profissionalNome;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onClick?.(appointment)}
    >
      <div className="flex items-center gap-2 min-w-[70px]">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {formatTime(appointment.dataHora)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-azul-respira flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {appointment.pacienteNome}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span className="truncate">{appointment.tipoServico}</span>
          {shouldShowProfessional && (
            <>
              <span>•</span>
              <span className="truncate">{appointment.profissionalNome}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        <span className="truncate max-w-[100px]">{appointment.local}</span>
      </div>
    </div>
  );
});

UpcomingAppointmentRow.displayName = 'UpcomingAppointmentRow';

export const CurrentAppointments = React.memo<CurrentAppointmentsProps>(
  ({
    appointments,
    upcomingAppointments = [],
    loading = false,
    error,
    onAppointmentClick,
    className,
    userRole,
  }) => {
    const [showMore, setShowMore] = useState(false);

    // Filtrar atendimentos futuros que não estão na janela atual
    const currentWindowIds = new Set(appointments.map((a) => a.id));
    const additionalAppointments = upcomingAppointments.filter(
      (a) => !currentWindowIds.has(a.id)
    );
    const hasMoreAppointments = additionalAppointments.length > 0;

    // Não mostrar nada se não houver atendimentos e não estiver carregando
    if (!loading && appointments.length === 0) {
      return null;
    }

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-amarelo-crianca" />
            Atendimentos Agora
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="text-center py-4">
              <div className="text-destructive text-sm mb-1">
                Erro ao carregar atendimentos
              </div>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <CurrentAppointmentSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {appointments.map((appointment) => (
                  <CurrentAppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onClick={onAppointmentClick}
                    userRole={userRole}
                  />
                ))}
              </div>

              {/* Botão Ver mais atendimentos */}
              {hasMoreAppointments && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-9 text-sm gap-2 justify-center hover:bg-muted/50"
                    onClick={() => setShowMore(!showMore)}
                  >
                    <CalendarDays className="h-4 w-4" />
                    <span>
                      {showMore
                        ? 'Ocultar atendimentos'
                        : `Ver mais ${additionalAppointments.length} atendimento(s)`}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        showMore && 'rotate-180'
                      )}
                    />
                  </Button>

                  {/* Lista expandida de atendimentos */}
                  {showMore && (
                    <div className="mt-3 space-y-2">
                      <ScrollArea className="max-h-[300px]">
                        <div className="space-y-2 pr-2">
                          {additionalAppointments.map((appointment) => (
                            <UpcomingAppointmentRow
                              key={appointment.id}
                              appointment={appointment}
                              onClick={onAppointmentClick}
                              userRole={userRole}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }
);

CurrentAppointments.displayName = 'CurrentAppointments';
