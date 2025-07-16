import React, { useState } from 'react';
import { format } from 'date-fns';

import { Save, Trash2, X } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { DatePicker, ColorPicker } from '@/components/composed';
import { cn } from '@/lib/utils';
import type { CalendarEvent, EventColor } from '@/types/calendar';

// AI dev note: EventManager combina Dialog e outros primitives para CRUD
// Gerenciador completo de eventos com formulário e validações

export interface EventManagerProps {
  isOpen: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  initialDate?: Date;
  initialTime?: string;
  onSave: (event: Omit<CalendarEvent, 'id'> & { id?: string }) => void;
  onDelete?: (eventId: string) => void;
  className?: string;
}

interface EventFormData {
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  color: EventColor;
}

export const EventManager = React.memo<EventManagerProps>(
  ({
    isOpen,
    onClose,
    event,
    initialDate,
    initialTime,
    onSave,
    onDelete,
    className,
  }) => {
    const isEditing = !!event;

    const getInitialFormData = React.useCallback((): EventFormData => {
      if (event) {
        return {
          title: event.title,
          description: event.description || '',
          startDate: format(event.start, 'yyyy-MM-dd'),
          startTime: format(event.start, 'HH:mm'),
          endDate: format(event.end, 'yyyy-MM-dd'),
          endTime: format(event.end, 'HH:mm'),
          allDay: event.allDay || false,
          location: event.location || '',
          color: event.color || 'blue',
        };
      }

      const defaultDate = initialDate || new Date();
      const defaultTime = initialTime || '09:00';
      const defaultEndTime = initialTime
        ? format(
            new Date(`2000-01-01 ${initialTime}`).getTime() + 60 * 60 * 1000,
            'HH:mm'
          )
        : '10:00';

      return {
        title: '',
        description: '',
        startDate: format(defaultDate, 'yyyy-MM-dd'),
        startTime: defaultTime,
        endDate: format(defaultDate, 'yyyy-MM-dd'),
        endTime: defaultEndTime,
        allDay: false,
        location: '',
        color: 'blue',
      };
    }, [event, initialDate, initialTime]);

    const [formData, setFormData] = useState<EventFormData>(getInitialFormData);

    // Reset form quando dialog abre/fecha ou evento muda
    React.useEffect(() => {
      if (isOpen) {
        setFormData(getInitialFormData());
      }
    }, [isOpen, getInitialFormData]);

    const handleInputChange = (
      field: keyof EventFormData,
      value: string | boolean
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
      const startDateTime = new Date(
        `${formData.startDate}T${formData.startTime}`
      );
      const endDateTime = formData.allDay
        ? new Date(startDateTime)
        : new Date(`${formData.endDate}T${formData.endTime}`);

      // Se for dia inteiro, ajustar horários
      if (formData.allDay) {
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime.setHours(23, 59, 59, 999);
      }

      const eventData: Omit<CalendarEvent, 'id'> & { id?: string } = {
        ...(event?.id && { id: event.id }),
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        start: startDateTime,
        end: endDateTime,
        allDay: formData.allDay,
        color: formData.color,
        location: formData.location.trim() || undefined,
      };

      onSave(eventData);
      onClose();
    };

    const handleDelete = () => {
      if (event?.id && onDelete) {
        onDelete(event.id);
        onClose();
      }
    };

    const isValid = formData.title.trim().length > 0;

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn(
            'max-w-[95vw] sm:max-w-[500px] lg:max-w-[600px]',
            className
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Evento' : 'Novo Evento'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Faça as alterações necessárias no evento.'
                : 'Preencha os dados para criar um novo evento.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Título */}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Título do evento"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange('description', e.target.value)
                }
                placeholder="Descrição opcional do evento"
                rows={3}
              />
            </div>

            {/* Datas e horários */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data início</Label>
                <DatePicker
                  value={formData.startDate}
                  onChange={(value) => handleInputChange('startDate', value)}
                />
              </div>

              {!formData.allDay && (
                <div className="space-y-2">
                  <Label htmlFor="startTime">Horário início</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) =>
                      handleInputChange('startTime', e.target.value)
                    }
                  />
                </div>
              )}
            </div>

            {!formData.allDay && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="endDate">Data fim</Label>
                  <DatePicker
                    value={formData.endDate}
                    onChange={(value) => handleInputChange('endDate', value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">Horário fim</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) =>
                      handleInputChange('endTime', e.target.value)
                    }
                  />
                </div>
              </div>
            )}

            {/* Localização */}
            <div className="space-y-2">
              <Label htmlFor="location">Localização</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="Local do evento"
              />
            </div>

            {/* Cor */}
            <div className="space-y-2">
              <Label htmlFor="color">Cor</Label>
              <ColorPicker
                value={formData.color}
                onChange={(color) => handleInputChange('color', color)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {isEditing && onDelete && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            )}

            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>

            <Button onClick={handleSave} disabled={!isValid}>
              <Save className="h-4 w-4 mr-2" />
              {isEditing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

EventManager.displayName = 'EventManager';
