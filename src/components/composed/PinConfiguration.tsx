import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { PinInput } from '@/components/primitives/pin-input';
import { Label } from '@/components/primitives/label';
import { Shield, Check, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/primitives/use-toast';

// AI dev note: Componente para configurar/alterar PIN financeiro
// Armazena o PIN no metadata do usuário no Supabase
// Requer confirmação do PIN para evitar erros

interface PinConfigurationProps {
  onSuccess?: () => void;
  showCard?: boolean;
}

export const PinConfiguration: React.FC<PinConfigurationProps> = ({
  onSuccess,
  showCard = true,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hasExistingPin, setHasExistingPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'info' | 'current' | 'new' | 'confirm'>(
    'info'
  );
  const [errors, setErrors] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  useEffect(() => {
    checkExistingPin();

    // Verificar parâmetros da URL
    const action = searchParams.get('action');
    if (action === 'create-pin' && !hasExistingPin) {
      // Iniciar fluxo de criação de PIN
      setStep('new');
      toast({
        title: 'Configure seu PIN',
        description: 'Crie um PIN de 4 dígitos para acessar áreas restritas.',
      });
    } else if (action === 'reset-pin') {
      // Iniciar fluxo de redefinição de PIN
      if (hasExistingPin) {
        setStep('current');
      } else {
        setStep('new');
      }
      toast({
        title: 'Redefinir PIN',
        description: hasExistingPin
          ? 'Digite seu PIN atual para continuar.'
          : 'Crie um PIN de 4 dígitos.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, searchParams]); // AI dev note: checkExistingPin usa user, mas não precisa re-executar a cada mudança

  const checkExistingPin = async () => {
    if (!user?.id) return;

    try {
      // Usar os metadados do usuário diretamente do auth
      const userMetadata = user.user_metadata || {};

      if (userMetadata.financial_pin) {
        setHasExistingPin(true);
        setStep('info');
      } else {
        setHasExistingPin(false);
        setStep('info');
      }
    } catch (error) {
      console.error('Erro ao verificar PIN existente:', error);
      setHasExistingPin(false);
      setStep('info');
    }
  };

  const validateCurrentPin = async (): Promise<boolean> => {
    if (!hasExistingPin) return true;

    try {
      // Obter PIN do user metadata
      const userMetadata = user?.user_metadata || {};
      const storedPin = userMetadata.financial_pin;

      if (currentPin === storedPin) {
        return true;
      } else {
        setErrors({ ...errors, current: 'PIN atual incorreto' });
        return false;
      }
    } catch (error) {
      console.error('Erro ao validar PIN atual:', error);
      setErrors({ ...errors, current: 'Erro ao validar PIN' });
      return false;
    }
  };

  const handleSavePin = async () => {
    setLoading(true);
    setErrors({ current: '', new: '', confirm: '' });

    // Validações
    if (hasExistingPin && !currentPin) {
      setErrors({ ...errors, current: 'Digite o PIN atual' });
      setLoading(false);
      return;
    }

    if (newPin.length !== 4) {
      setErrors({ ...errors, new: 'O PIN deve ter 4 dígitos' });
      setLoading(false);
      return;
    }

    if (newPin !== confirmPin) {
      setErrors({ ...errors, confirm: 'Os PINs não coincidem' });
      setLoading(false);
      return;
    }

    // Validar PIN atual se existir
    if (hasExistingPin) {
      const isValid = await validateCurrentPin();
      if (!isValid) {
        setLoading(false);
        return;
      }
    }

    try {
      // Atualizar user metadata no auth.users
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user?.user_metadata,
          financial_pin: newPin,
          financial_pin_updated_at: new Date().toISOString(),
        },
      });

      if (updateError) throw updateError;

      // Recarregar dados do usuário para atualizar o user_metadata
      await supabase.auth.getUser();

      toast({
        title: hasExistingPin
          ? 'PIN alterado com sucesso!'
          : 'PIN configurado com sucesso!',
        description: 'O PIN foi salvo com segurança.',
      });

      // Reset form
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setHasExistingPin(true);
      setStep('info');

      onSuccess?.();
    } catch (error) {
      console.error('Erro ao salvar PIN:', error);
      toast({
        title: 'Erro ao salvar PIN',
        description: 'Ocorreu um erro ao salvar o PIN. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStepChange = (
    nextStep: 'info' | 'current' | 'new' | 'confirm'
  ) => {
    setErrors({ current: '', new: '', confirm: '' });
    setStep(nextStep);
  };

  const content = (
    <>
      <div className="space-y-6">
        {step === 'info' && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {hasExistingPin
                  ? 'Use este PIN para acessar a área financeira. Guarde-o em local seguro.'
                  : 'Configure um PIN de 4 dígitos para proteger o acesso à área financeira.'}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {hasExistingPin && step === 'current' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>PIN Atual</Label>
              <PinInput
                value={currentPin}
                onChange={setCurrentPin}
                onComplete={() => handleStepChange('new')}
                error={!!errors.current}
                autoFocus
              />
              {errors.current && (
                <p className="text-sm text-destructive">{errors.current}</p>
              )}
            </div>
          </div>
        )}

        {step === 'new' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{hasExistingPin ? 'Novo PIN' : 'Criar PIN'}</Label>
              <PinInput
                value={newPin}
                onChange={setNewPin}
                onComplete={() => handleStepChange('confirm')}
                error={!!errors.new}
                autoFocus
              />
              {errors.new && (
                <p className="text-sm text-destructive">{errors.new}</p>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Confirmar PIN</Label>
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                onComplete={handleSavePin}
                error={!!errors.confirm}
                autoFocus
              />
              {errors.confirm && (
                <p className="text-sm text-destructive">{errors.confirm}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {step !== 'info' && step !== 'new' && step !== 'current' && (
            <Button
              variant="outline"
              onClick={() =>
                handleStepChange(hasExistingPin ? 'current' : 'new')
              }
              disabled={loading}
            >
              Voltar
            </Button>
          )}

          {step === 'info' ? (
            <Button
              onClick={() =>
                handleStepChange(hasExistingPin ? 'current' : 'new')
              }
              disabled={loading}
              className="ml-auto"
            >
              {hasExistingPin ? 'Alterar PIN' : 'Configurar PIN'}
            </Button>
          ) : step === 'confirm' ? (
            <Button
              onClick={handleSavePin}
              disabled={loading || confirmPin.length !== 4}
              className="ml-auto"
            >
              {loading ? (
                <>Salvando...</>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Salvar PIN
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() =>
                handleStepChange(step === 'current' ? 'new' : 'confirm')
              }
              disabled={
                loading ||
                (step === 'new' && newPin.length !== 4) ||
                (step === 'current' && currentPin.length !== 4)
              }
              className="ml-auto"
            >
              {step === 'current' ? 'Próximo' : 'Confirmar PIN'}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-roxo-titulo" />
          PIN de Segurança - Área Financeira
        </CardTitle>
        <CardDescription>
          {hasExistingPin
            ? 'Altere seu PIN de acesso à área financeira'
            : 'Configure um PIN para proteger o acesso à área financeira'}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};
