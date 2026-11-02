// AI dev note: Escolha da frequência do paciente fixo (lista e ficha):
// as frequências padrão + "A cada N dias" (7 a 120), para quem vem, por
// exemplo, a cada 20 dias. "A cada N dias" não é alterado pela evolução.

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  FREQUENCIAS_ESCOLHA,
  alterarFrequenciaFixo,
  frequenciaValida,
  type FrequenciaFixo,
  type FrequenciaValor,
} from '@/lib/pacientes-fixos-api';

interface FrequenciaEditorProps {
  valor: FrequenciaValor;
  onChange: (v: FrequenciaValor) => void;
  disabled?: boolean;
}

export const FrequenciaEditor: React.FC<FrequenciaEditorProps> = ({
  valor,
  onChange,
  disabled,
}) => {
  const personalizada = valor.frequencia === 'personalizada';
  const diasInvalidos =
    personalizada &&
    !!valor.intervaloDias &&
    (valor.intervaloDias < 7 || valor.intervaloDias > 120);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {FREQUENCIAS_ESCOLHA.map((f) => (
          <Button
            key={f.valor}
            type="button"
            size="sm"
            disabled={disabled}
            variant={valor.frequencia === f.valor ? 'default' : 'outline'}
            onClick={() =>
              onChange({ frequencia: f.valor, intervaloDias: null })
            }
          >
            {f.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          variant={personalizada ? 'default' : 'outline'}
          onClick={() =>
            onChange({
              frequencia: 'personalizada',
              intervaloDias: valor.intervaloDias ?? 20,
            })
          }
        >
          A cada N dias
        </Button>
      </div>
      {personalizada && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>A cada</span>
          <Input
            type="number"
            inputMode="numeric"
            min={7}
            max={120}
            value={valor.intervaloDias ?? ''}
            onChange={(e) =>
              onChange({
                frequencia: 'personalizada',
                intervaloDias: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={cn('h-9 w-20', diasInvalidos && 'border-destructive')}
            aria-label="Intervalo em dias"
            disabled={disabled}
          />
          <span>dias</span>
          <span
            className={cn(
              'text-xs',
              diasInvalidos ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            (de 7 a 120; a evolução não muda este intervalo)
          </span>
        </div>
      )}
    </div>
  );
};

// Diálogo da lista de fixos: troca só a frequência
interface FrequenciaDialogProps {
  paciente: {
    paciente_id: string;
    paciente_nome: string;
    frequencia: FrequenciaFixo;
    intervalo_dias: number | null;
  } | null;
  onClose: () => void;
  onDone: () => void;
}

export const FrequenciaDialog: React.FC<FrequenciaDialogProps> = ({
  paciente,
  onClose,
  onDone,
}) => {
  const { toast } = useToast();
  const [valor, setValor] = useState<FrequenciaValor>({
    frequencia: null,
    intervaloDias: null,
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (paciente)
      setValor({
        frequencia: paciente.frequencia,
        intervaloDias: paciente.intervalo_dias,
      });
  }, [paciente]);

  const salvar = async () => {
    if (!paciente || !valor.frequencia || !frequenciaValida(valor)) return;
    setSalvando(true);
    try {
      await alterarFrequenciaFixo(
        paciente.paciente_id,
        valor.frequencia,
        valor.intervaloDias
      );
      toast({ title: 'Frequência alterada' });
      onDone();
    } catch (e) {
      toast({
        title: 'Não foi possível alterar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!paciente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Frequência de {paciente?.paciente_nome.split(' ')[0]}
          </DialogTitle>
          <DialogDescription>
            A próxima semana prevista passa a contar a partir da última sessão.
          </DialogDescription>
        </DialogHeader>
        <FrequenciaEditor
          valor={valor}
          onChange={setValor}
          disabled={salvando}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!frequenciaValida(valor) || salvando}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
