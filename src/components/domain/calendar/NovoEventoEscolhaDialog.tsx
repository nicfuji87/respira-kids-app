import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarClock, CalendarPlus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';

// AI dev note: Clique num horário vazio da agenda → escolher entre consulta e
// compromisso, já com data e hora preenchidas.

interface NovoEventoEscolhaDialogProps {
  slot: { date: Date; time: string } | null;
  onClose: () => void;
  onAgendamento: (date: Date, time: string) => void;
  onCompromisso: (date: Date, time: string) => void;
}

const Opcao: React.FC<{
  icon: React.ReactNode;
  iconClass: string;
  titulo: string;
  texto: string;
  onClick: () => void;
}> = ({ icon, iconClass, titulo, texto, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-roxo-titulo ${iconClass}`}
    >
      {icon}
    </span>
    <span>
      <span className="block font-medium text-roxo-titulo dark:text-foreground">
        {titulo}
      </span>
      <span className="block text-sm text-muted-foreground">{texto}</span>
    </span>
  </button>
);

export const NovoEventoEscolhaDialog = React.memo<NovoEventoEscolhaDialogProps>(
  ({ slot, onClose, onAgendamento, onCompromisso }) => (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
          {slot && (
            <DialogDescription className="first-letter:uppercase">
              {format(slot.date, "EEEE, dd 'de' MMMM", { locale: ptBR })} às{' '}
              {slot.time}
            </DialogDescription>
          )}
        </DialogHeader>
        {slot && (
          <div className="space-y-2">
            <Opcao
              icon={<CalendarPlus className="h-5 w-5" />}
              iconClass="bg-verde-pipa/40"
              titulo="Novo agendamento"
              texto="Atendimento de um paciente"
              onClick={() => onAgendamento(slot.date, slot.time)}
            />
            <Opcao
              icon={<CalendarClock className="h-5 w-5" />}
              iconClass="bg-roxo-titulo/10"
              titulo="Novo compromisso"
              texto="Almoço, reunião, terapia, férias, assuntos pessoais…"
              onClick={() => onCompromisso(slot.date, slot.time)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
);

NovoEventoEscolhaDialog.displayName = 'NovoEventoEscolhaDialog';
