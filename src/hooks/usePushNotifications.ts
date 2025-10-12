import { useState, useEffect, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging, vapidKey } from '@/lib/firebase-config';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: Hook para gerenciar notificações push
// Handles: permissão, registro de token, foreground messages

export interface PushNotificationState {
  permission: NotificationPermission;
  token: string | null;
  isSupported: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    permission: 'default',
    token: null,
    isSupported: false,
    isLoading: true,
    error: null,
  });

  // Verificar suporte e inicializar
  useEffect(() => {
    checkSupportAndInitialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkSupportAndInitialize = async () => {
    try {
      // Verificar se notificações são suportadas
      if (!('Notification' in window)) {
        setState((prev) => ({
          ...prev,
          isSupported: false,
          isLoading: false,
          error: 'Notificações não suportadas neste navegador',
        }));
        return;
      }

      // Verificar se service worker é suportado
      if (!('serviceWorker' in navigator)) {
        setState((prev) => ({
          ...prev,
          isSupported: false,
          isLoading: false,
          error: 'Service Worker não suportado',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        isSupported: true,
        permission: Notification.permission,
        isLoading: false,
      }));

      // Se já tem permissão, registrar token
      if (Notification.permission === 'granted') {
        await registerToken();
      }

      // Setup listener para mensagens em foreground
      setupForegroundMessageListener();
    } catch (error) {
      console.error('Erro ao inicializar notificações:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }));
    }
  };

  // Solicitar permissão e registrar token
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!state.isSupported) {
        toast({
          title: 'Não Suportado',
          description: 'Seu navegador não suporta notificações push',
          variant: 'destructive',
        });
        return false;
      }

      // Solicitar permissão
      const permission = await Notification.requestPermission();

      setState((prev) => ({ ...prev, permission }));

      if (permission === 'granted') {
        await registerToken();

        toast({
          title: 'Notificações Ativadas! 🔔',
          description: 'Você receberá notificações de eventos importantes',
        });

        return true;
      } else if (permission === 'denied') {
        toast({
          title: 'Permissão Negada',
          description:
            'Você não receberá notificações. Ative nas configurações do navegador se mudar de ideia.',
          variant: 'destructive',
        });
        return false;
      }

      return false;
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível solicitar permissão para notificações',
        variant: 'destructive',
      });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isSupported]);

  // Registrar token FCM no Firebase e salvar no banco
  const registerToken = async () => {
    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        throw new Error('Firebase Messaging não disponível');
      }

      // Registrar Service Worker
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );

      console.log('✅ Service Worker registrado');

      // Aguardar SW estar pronto
      await navigator.serviceWorker.ready;

      // Obter token FCM
      const currentToken = await getToken(messaging, {
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (currentToken) {
        console.log(
          '✅ Token FCM obtido:',
          currentToken.substring(0, 20) + '...'
        );

        // Salvar no banco de dados
        await saveTokenToDatabase(currentToken);

        setState((prev) => ({ ...prev, token: currentToken }));
      } else {
        console.warn('⚠️ Não foi possível obter token FCM');
        throw new Error('Token FCM não disponível');
      }
    } catch (error) {
      console.error('Erro ao registrar token:', error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : 'Erro ao registrar token',
      }));
      throw error;
    }
  };

  // Salvar token no Supabase
  const saveTokenToDatabase = async (token: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Buscar pessoa_id
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('pessoa_id')
        .eq('user_id', user.id)
        .single();

      // Inserir ou atualizar token
      const { error } = await supabase.from('user_push_tokens').upsert(
        {
          user_id: user.id,
          pessoa_id: usuario?.pessoa_id,
          token: token,
          device_type: 'web',
          device_info: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
          },
          user_agent: navigator.userAgent,
          active: true,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'token',
          ignoreDuplicates: false,
        }
      );

      if (error) throw error;

      console.log('✅ Token salvo no banco de dados');
    } catch (error) {
      console.error('Erro ao salvar token no banco:', error);
      throw error;
    }
  };

  // Listener para mensagens em foreground (quando app está aberto)
  const setupForegroundMessageListener = async () => {
    try {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;

      onMessage(messaging, (payload) => {
        console.log('📱 Mensagem recebida em foreground:', payload);

        // Exibir notificação usando o toast do app
        toast({
          title: payload.notification?.title || 'Nova Notificação',
          description: payload.notification?.body || '',
          duration: 5000,
        });

        // Também exibir notificação nativa se permitido
        if (Notification.permission === 'granted') {
          const notification = new Notification(
            payload.notification?.title || 'Respira Kids',
            {
              body: payload.notification?.body || '',
              icon: '/images/logos/icone-respira-kids.png',
              badge: '/images/logos/icone-respira-kids.png',
              data: payload.data,
              tag: payload.data?.event_type || 'notification',
            }
          );

          // Handler para clique na notificação
          notification.onclick = () => {
            window.focus();
            notification.close();

            // Navegar baseado no tipo de evento
            if (payload.data?.event_type === 'appointment_created') {
              window.location.hash = '/agenda';
            } else if (
              payload.data?.event_type === 'patient_created' &&
              payload.data?.paciente_id
            ) {
              window.location.hash = `/pacientes/${payload.data.paciente_id}`;
            }
          };
        }
      });

      console.log('✅ Listener de mensagens foreground configurado');
    } catch (error) {
      console.error('Erro ao configurar listener de mensagens:', error);
    }
  };

  // Desabilitar notificações (remover token)
  const disableNotifications = useCallback(async () => {
    try {
      if (!state.token) return;

      // Marcar token como inativo no banco
      const { error } = await supabase
        .from('user_push_tokens')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('token', state.token);

      if (error) throw error;

      setState((prev) => ({ ...prev, token: null }));

      toast({
        title: 'Notificações Desativadas',
        description: 'Você não receberá mais notificações push',
      });
    } catch (error) {
      console.error('Erro ao desativar notificações:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível desativar notificações',
        variant: 'destructive',
      });
    }
  }, [state.token]);

  // Atualizar last_used_at do token periodicamente
  useEffect(() => {
    if (!state.token) return;

    const updateTokenActivity = async () => {
      try {
        await supabase
          .from('user_push_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('token', state.token);
      } catch (error) {
        console.error('Erro ao atualizar atividade do token:', error);
      }
    };

    // Atualizar a cada 24 horas
    const interval = setInterval(updateTokenActivity, 24 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [state.token]);

  return {
    ...state,
    requestPermission,
    disableNotifications,
    refreshToken: registerToken,
  };
}
