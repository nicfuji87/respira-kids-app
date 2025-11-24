import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { PinInput } from '@/components/primitives/pin-input';
import { Shield, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// AI dev note: Componente para validação de PIN ao acessar área restrita
// Valida o PIN armazenado no user metadata do Supabase
// Inclui opção de recuperação de PIN
// IMPORTANTE: O controle de abertura/fechamento é feito EXCLUSIVAMENTE pela prop isOpen
// O componente NÃO deve tentar fechar a si mesmo - apenas chama onSuccess e o pai fecha

interface PinValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export const PinValidationDialog: React.FC<PinValidationDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Área Restrita',
  description = 'Digite seu PIN de 4 dígitos para acessar esta área.',
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Ref para evitar chamadas duplicadas de onSuccess
  const successCalledRef = useRef(false);

  const maxAttempts = 3;
  const blockDuration = 5 * 60 * 1000; // 5 minutos

  // Reset state quando abrir
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setLoading(false);
      successCalledRef.current = false;
      checkBlockStatus();
      checkPinExists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const checkPinExists = async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) return;

      const userMetadata = currentUser.user_metadata || {};
      const storedPin = userMetadata.financial_pin;

      if (!storedPin) {
        // Redirecionar para configuração de PIN
        setTimeout(() => {
          window.location.href =
            '/configuracoes?tab=seguranca&action=create-pin';
        }, 500);
      }
    } catch (error) {
      console.error('Erro ao verificar PIN:', error);
    }
  };

  const checkBlockStatus = () => {
    const lastBlockTime = localStorage.getItem('pin_block_time');
    if (lastBlockTime) {
      const timeSinceBlock = Date.now() - parseInt(lastBlockTime);
      if (timeSinceBlock < blockDuration) {
        setIsBlocked(true);
        const remainingTime = Math.ceil(
          (blockDuration - timeSinceBlock) / 1000 / 60
        );
        setError(
          `Muitas tentativas. Tente novamente em ${remainingTime} minutos.`
        );
      } else {
        localStorage.removeItem('pin_block_time');
        localStorage.removeItem('pin_attempts');
        setIsBlocked(false);
        setAttempts(0);
      }
    } else {
      const savedAttempts = localStorage.getItem('pin_attempts');
      if (savedAttempts) {
        setAttempts(parseInt(savedAttempts));
      }
    }
  };

  const validatePin = async (enteredPin: string) => {
    if (isBlocked || successCalledRef.current) return;

    setLoading(true);
    setError('');

    try {
      // Recarregar dados do usuário para garantir que temos o metadata atualizado
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        setError('Erro ao obter dados do usuário.');
        setLoading(false);
        return;
      }

      const userMetadata = currentUser.user_metadata || {};
      const storedPin = userMetadata.financial_pin;

      if (!storedPin) {
        // Redirecionar para configuração de PIN
        setLoading(false);
        window.location.href = '/configuracoes?tab=seguranca&action=create-pin';
        return;
      }

      if (enteredPin === storedPin) {
        // PIN correto - marcar como sucesso para evitar chamadas duplicadas
        successCalledRef.current = true;
        localStorage.removeItem('pin_attempts');
        localStorage.removeItem('pin_block_time');

        // Chamar onSuccess IMEDIATAMENTE - o pai vai setar isPinValidated=true
        // e isso vai fazer isOpen=false, fechando o dialog
        onSuccess();

        // Limpar estado local
        setPin('');
        setError('');
        setAttempts(0);
        setLoading(false);
        return;
      } else {
        // PIN incorreto
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem('pin_attempts', newAttempts.toString());

        if (newAttempts >= maxAttempts) {
          // Bloquear após 3 tentativas
          localStorage.setItem('pin_block_time', Date.now().toString());
          setIsBlocked(true);
          setError('Muitas tentativas. Tente novamente em 5 minutos.');
        } else {
          setError(
            `PIN incorreto. ${maxAttempts - newAttempts} tentativas restantes.`
          );
        }
        setPin('');
        setLoading(false);
      }
    } catch (error) {
      console.error('Erro ao validar PIN:', error);
      setError('Erro ao validar PIN. Tente novamente.');
      setLoading(false);
    }
  };

  const handlePinComplete = (value: string) => {
    validatePin(value);
  };

  const handleForgotPin = () => {
    // Redirecionar para configurações para redefinir o PIN
    window.location.href = '/configuracoes?tab=seguranca&action=reset-pin';
  };

  // Handler para quando o dialog tenta fechar (pelo X ou clicando fora)
  const handleOpenChange = (open: boolean) => {
    // Se está tentando fechar E não foi por sucesso, chamar onClose
    if (!open && !successCalledRef.current) {
      onClose();
    }
    // Se foi sucesso, não fazer nada - o pai já vai fechar via isOpen=false
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-roxo-titulo" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={handlePinComplete}
            disabled={loading || isBlocked}
            error={!!error}
            autoFocus
          />

          {error && (
            <Alert variant="destructive" className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isBlocked && attempts > 0 && attempts < maxAttempts && (
            <p className="text-sm text-muted-foreground">
              {maxAttempts - attempts} tentativas restantes
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            onClick={() => validatePin(pin)}
            disabled={loading || isBlocked || pin.length !== 4}
            className="w-full"
          >
            {loading ? 'Validando...' : 'Validar PIN'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleForgotPin}
            disabled={loading}
            className="w-full"
          >
            Esqueceu seu PIN?
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="w-full"
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
