import React, { useState, useEffect } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// AI dev note: Componente para solicitar permissão de notificações push
// Aparece apenas se o usuário ainda não deu permissão

export interface PushNotificationPromptProps {
  /** Se true, força mostrar o prompt mesmo se já foi fechado */
  alwaysShow?: boolean;
  /** Callback quando permissão é concedida */
  onPermissionGranted?: () => void;
  /** Callback quando permissão é negada */
  onPermissionDenied?: () => void;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({
  alwaysShow = false,
  onPermissionGranted,
  onPermissionDenied,
}) => {
  const { permission, isSupported, requestPermission } = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(false);

  // Verificar se já foi fechado anteriormente
  useEffect(() => {
    const dismissed = localStorage.getItem(
      'push_notification_prompt_dismissed'
    );
    if (dismissed === 'true' && !alwaysShow) {
      setIsDismissed(true);
    }
  }, [alwaysShow]);

  // Não mostrar se:
  // - Já foi fechado (e não é alwaysShow)
  // - Notificações não são suportadas
  // - Já tem permissão concedida
  // - Permissão foi negada
  if (
    (isDismissed && !alwaysShow) ||
    !isSupported ||
    permission === 'granted' ||
    permission === 'denied'
  ) {
    return null;
  }

  const handleEnable = async () => {
    const granted = await requestPermission();
    if (granted) {
      onPermissionGranted?.();
      setIsDismissed(true);
    } else {
      onPermissionDenied?.();
      setIsDismissed(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('push_notification_prompt_dismissed', 'true');
  };

  return (
    <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">
          <Bell className="h-5 w-5" />
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">
            Ativar Notificações Push
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Receba notificações em tempo real sobre novos agendamentos,
            pacientes e atualizações importantes.
          </p>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleEnable} className="gap-2">
              <Bell className="h-4 w-4" />
              Ativar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="gap-2"
            >
              <BellOff className="h-4 w-4" />
              Agora não
            </Button>
          </div>
        </div>

        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};

PushNotificationPrompt.displayName = 'PushNotificationPrompt';
