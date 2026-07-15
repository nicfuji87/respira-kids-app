// AI dev note: Config do PIN do quiosque (lockdown) — SÓ admin. Define/troca/remove
// o PIN usado para sair da tela cheia do ponto. Definir chama estagio_kiosk_set_pin
// (RPC valida admin no servidor). Fica no topo da aba "Ponto eletrônico", junto do
// GeofenceConfig. onChange avisa o pai para reavaliar se o lockdown está ligado.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Label } from '@/components/primitives/label';
import { PinInput } from '@/components/primitives/pin-input';
import { useToast } from '@/components/primitives/use-toast';
import {
  kioskHasPin,
  kioskSetPin,
  kioskClearPin,
} from '@/lib/estagio-pontos-api';

interface Props {
  onChange?: () => void;
}

export const KioskPinConfig: React.FC<Props> = ({ onChange }) => {
  const { toast } = useToast();
  const [hasPin, setHasPin] = useState(false);
  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setHasPin(await kioskHasPin());
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = useCallback(async () => {
    if (novo.length !== 4) {
      toast({ title: 'O PIN deve ter 4 dígitos', variant: 'destructive' });
      return;
    }
    if (novo !== confirmar) {
      toast({ title: 'Os PINs não coincidem', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await kioskSetPin(novo);
      setNovo('');
      setConfirmar('');
      await carregar();
      onChange?.();
      toast({ title: 'PIN do quiosque salvo' });
    } catch {
      toast({ title: 'Falha ao salvar o PIN', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [novo, confirmar, carregar, onChange, toast]);

  const remover = useCallback(async () => {
    setSaving(true);
    try {
      await kioskClearPin();
      await carregar();
      onChange?.();
      toast({ title: 'PIN removido (lockdown desligado)' });
    } catch {
      toast({ title: 'Falha ao remover o PIN', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [carregar, onChange, toast]);

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="w-4 h-4 text-azul-respira shrink-0" />
          <span className="text-sm font-medium text-foreground">
            PIN do quiosque (sair da tela cheia)
          </span>
          <Badge variant={hasPin ? 'default' : 'secondary'}>
            {hasPin ? 'Ativo' : 'Sem PIN'}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Com um PIN definido, sair da tela cheia do ponto exige o PIN — assim
            a estagiária não acessa o painel. Deixe sem PIN para não travar.
          </p>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {hasPin ? 'Novo PIN' : 'PIN'} (4 dígitos)
              </Label>
              <PinInput value={novo} onChange={setNovo} error={false} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirmar</Label>
              <PinInput
                value={confirmar}
                onChange={setConfirmar}
                error={false}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            {hasPin ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-vermelho-kids"
                onClick={() => void remover()}
                disabled={saving}
              >
                Remover PIN
              </Button>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              onClick={() => void salvar()}
              disabled={saving || novo.length !== 4}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {hasPin ? 'Trocar PIN' : 'Definir PIN'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

KioskPinConfig.displayName = 'KioskPinConfig';
