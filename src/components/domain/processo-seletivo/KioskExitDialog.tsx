// AI dev note: Gate de saída do quiosque (lockdown). Quando há PIN configurado, sair
// da tela cheia exige o PIN — impede a estagiária de cair no painel admin. Valida no
// servidor (estagio_kiosk_check_pin, RPC). Não tem "esqueci o PIN"/redirect (isso
// seria uma brecha de escape). Só o botão Cancelar volta ao quiosque.

import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { PinInput } from '@/components/primitives/pin-input';
import { kioskCheckPin } from '@/lib/estagio-pontos-api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const KioskExitDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  const validar = async (value: string) => {
    if (value.length !== 4 || loading) return;
    setLoading(true);
    setError('');
    try {
      const ok = await kioskCheckPin(value);
      if (ok) {
        onSuccess();
      } else {
        setError('PIN incorreto.');
        setPin('');
      }
    } catch {
      setError('Não consegui validar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-roxo-titulo" />
            PIN para sair do quiosque
          </DialogTitle>
          <DialogDescription>
            Digite o PIN do quiosque para voltar ao painel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={validar}
            disabled={loading}
            error={!!error}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void validar(pin)}
            disabled={loading || pin.length !== 4}
          >
            Sair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

KioskExitDialog.displayName = 'KioskExitDialog';
