import React from 'react';
import { Calendar, Users, Clock, Link2, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import type { AgendaCompartilhadaStats } from '@/types/shared-schedule';

// AI dev note: ScheduleCard - Composed
// Combina Card + Badge + Button para exibir agenda compartilhada
// Mostra título, período, progresso de slots, e ações

export interface ScheduleCardProps {
  agenda: AgendaCompartilhadaStats;
  onCopyLink?: (token: string) => void;
  onEdit?: (agendaId: string) => void;
  onDelete?: (agendaId: string) => void;
  className?: string;
}

export const ScheduleCard = React.memo<ScheduleCardProps>(
  ({ agenda, onCopyLink, onEdit, onDelete, className }) => {
    const dataInicio = new Date(agenda.data_inicio + 'T00:00:00');
    const dataFim = new Date(agenda.data_fim + 'T00:00:00');

    const periodoFormatado = `${format(dataInicio, 'dd MMM', { locale: ptBR })} a ${format(dataFim, 'dd MMM', { locale: ptBR })}`;

    const progresso =
      agenda.total_slots > 0
        ? (agenda.slots_ocupados / agenda.total_slots) * 100
        : 0;

    const cor = agenda.ativo
      ? progresso === 100
        ? 'bg-red-500'
        : progresso > 70
          ? 'bg-yellow-500'
          : 'bg-green-500'
      : 'bg-gray-400';

    return (
      <Card className={cn('hover:shadow-lg transition-shadow', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">
                {agenda.titulo}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Calendar className="w-3 h-3" />
                <span className="text-xs">{periodoFormatado}</span>
              </CardDescription>
            </div>
            <Badge variant={agenda.ativo ? 'default' : 'secondary'}>
              {agenda.ativo ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progresso de Slots */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-4 h-4" />
                Slots ocupados
              </span>
              <span className="font-semibold">
                {agenda.slots_ocupados} de {agenda.total_slots}
              </span>
            </div>

            {/* Barra de progresso */}
            <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full transition-all duration-300', cor)}
                style={{ width: `${progresso}%` }}
              />
            </div>

            {/* Slots disponíveis */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {agenda.slots_disponiveis} slot
                {agenda.slots_disponiveis !== 1 ? 's' : ''} disponíve
                {agenda.slots_disponiveis !== 1 ? 'is' : 'l'}
              </span>
            </div>
          </div>

          {/* Opções disponibilizadas */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {agenda.total_servicos > 0 && (
              <span>
                {agenda.total_servicos} serviço
                {agenda.total_servicos !== 1 ? 's' : ''}
              </span>
            )}
            {agenda.total_locais > 0 && (
              <span>
                • {agenda.total_locais} local
                {agenda.total_locais !== 1 ? 'is' : ''}
              </span>
            )}
            {agenda.total_empresas > 0 && (
              <span>
                • {agenda.total_empresas} empresa
                {agenda.total_empresas !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-2 border-t">
            {onCopyLink && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopyLink(agenda.token)}
                className="flex-1"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Copiar Link
              </Button>
            )}

            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(agenda.id)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}

            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(agenda.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

ScheduleCard.displayName = 'ScheduleCard';


