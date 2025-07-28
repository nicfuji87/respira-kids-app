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
import {
  Clock,
  MapPin,
  User,
  Calendar,
  DollarSign,
  ArrowRight,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpcomingAppointment } from '@/lib/professional-dashboard-api';

// AI dev note: AppointmentsList - Lista de próximos agendamentos combinando primitives
// Responsivo com skeleton states e cores da Respira Kids
// Inclui profissional responsável quando disponível

interface AppointmentsListProps {
  appointments: UpcomingAppointment[];
  loading?: boolean;
  error?: string | null;
  onAppointmentClick?: (appointment: UpcomingAppointment) => void;
  maxItems?: number;
  className?: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

const AppointmentItem = React.memo<{
  appointment: UpcomingAppointment;
  onClick?: (appointment: UpcomingAppointment) => void;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}>(({ appointment, onClick, userRole }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'agendado':
        return 'bg-azul-respira/10 text-azul-respira border-azul-respira/20';
      case 'confirmado':
        return 'bg-verde-pipa/10 text-verde-pipa border-verde-pipa/20';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const showProfessionalField =
    userRole === 'admin' || userRole === 'secretaria';

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border rounded-lg transition-all duration-200',
        'hover:shadow-md hover:border-primary/20',
        onClick && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => onClick?.(appointment)}
    >
      <div className="flex-1 space-y-2">
        {/* Linha 1: Paciente e Horário */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {appointment.pacienteNome}
            </span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(appointment.dataHora)}
          </div>
        </div>

        {/* Linha 2: Serviço e Local */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {appointment.tipoServico}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {appointment.local}
          </div>
        </div>

        {/* Linha 3: Profissional (apenas para admin/secretaria) */}
        {showProfessionalField && appointment.profissionalNome && (
          <div className="flex items-center text-sm">
            <div className="flex items-center gap-1 text-muted-foreground">
              <UserCog className="h-3 w-3" />
              <span>{appointment.profissionalNome}</span>
            </div>
          </div>
        )}

        {/* Linha 4: Status e Valor */}
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              getStatusColor(appointment.statusConsulta)
            )}
          >
            {appointment.statusConsulta}
          </Badge>
          <div className="flex items-center gap-1 text-sm font-medium text-verde-pipa">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(appointment.valor)}
          </div>
        </div>
      </div>

      {onClick && <ArrowRight className="h-4 w-4 text-muted-foreground ml-3" />}
    </div>
  );
});

AppointmentItem.displayName = 'AppointmentItem';

const AppointmentSkeleton = React.memo(() => (
  <div className="flex items-center justify-between p-4 border rounded-lg">
    <div className="flex-1 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  </div>
));

AppointmentSkeleton.displayName = 'AppointmentSkeleton';

export const AppointmentsList = React.memo<AppointmentsListProps>(
  ({
    appointments,
    loading = false,
    error,
    onAppointmentClick,
    maxItems = 3,
    className,
    userRole,
  }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const displayedAppointments = isExpanded
      ? appointments
      : appointments.slice(0, maxItems);
    const hasMore = appointments.length > maxItems;

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-azul-respira" />
            Próximos Agendamentos
          </CardTitle>
          {!loading && hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-azul-respira hover:text-azul-respira/80"
            >
              {isExpanded ? 'Ver menos' : 'Ver mais agendamentos'}
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <div className="text-destructive mb-2">
                Erro ao carregar agendamentos
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <AppointmentSkeleton key={i} />
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="font-medium text-foreground mb-2">
                Nenhum agendamento próximo
              </div>
              <p className="text-sm text-muted-foreground">
                Você não tem consultas agendadas para os próximos dias.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedAppointments.map((appointment) => (
                <AppointmentItem
                  key={appointment.id}
                  appointment={appointment}
                  onClick={onAppointmentClick}
                  userRole={userRole}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

AppointmentsList.displayName = 'AppointmentsList';
