// AI dev note: "Adiar" um paciente fixo (família viajando, doença, vacina...).
// A frequência não muda: ele sai da lista até a semana escolhida e, depois
// da próxima sessão, o ritmo volta a contar a partir dela.

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { useToast } from '@/components/primitives/use-toast';
import {
  adiarPacienteFixo,
  rotuloSemana,
  segundaDaSemana,
  somarDias,
  type PacienteFixoSemana,
} from '@/lib/pacientes-fixos-api';

interface AdiarFixoDialogProps {
  paciente: PacienteFixoSemana | null;
  /** Segunda-feira da semana que está na tela */
  semana: string;
  onClose: () => void;
  onDone: () => void;
}

const MOTIVOS = ['Viagem', 'Doente', 'Vacina', 'Pediu para pular'];

export const AdiarFixoDialog: React.FC<AdiarFixoDialogProps> = ({
  paciente,
  semana,
  onClose,
  onDone,
}) => {
  const { toast } = useToast();
  const [volta, setVolta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Primeira opção: a semana seguinte à que está na tela
  const opcoes = [1, 2, 3, 4].map((n) => somarDias(semana, 7 * n));
  const hoje = segundaDaSemana();

  useEffect(() => {
    if (paciente) {
      setVolta(opcoes[0]);
      setMotivo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente, semana]);

  const salvar = async () => {
    if (!paciente || !volta) return;
    setSalvando(true);
    try {
      await adiarPacienteFixo(paciente.paciente_id, volta, motivo);
      toast({
        title: 'Adiado',
        description: `${paciente.paciente_nome} volta na semana de ${rotuloSemana(segundaDaSemana(volta))}.`,
      });
      onDone();
    } catch (e) {
      toast({
        title: 'Não foi possível adiar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!paciente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Adiar {paciente?.paciente_nome.split(' ')[0]}
          </DialogTitle>
          <DialogDescription>
            Sai da lista e do envio do link até a semana escolhida. A frequência
            continua a mesma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Volta na semana de</Label>
            <div className="grid grid-cols-2 gap-2">
              {opcoes
                .filter((o) => o > hoje)
                .map((o) => (
                  <Button
                    key={o}
                    type="button"
                    size="sm"
                    variant={
                      segundaDaSemana(volta) === o ? 'default' : 'outline'
                    }
                    onClick={() => setVolta(o)}
                  >
                    {rotuloSemana(o)}
                  </Button>
                ))}
            </div>
            <Input
              type="date"
              value={volta}
              min={somarDias(hoje, 7)}
              onChange={(e) => setVolta(e.target.value)}
              className="h-10"
              aria-label="Outra data"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adiar-motivo">Motivo (opcional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={motivo === m ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMotivo(motivo === m ? '' : m)}
                >
                  {m}
                </Button>
              ))}
            </div>
            <Input
              id="adiar-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ou escreva"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!volta || salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
