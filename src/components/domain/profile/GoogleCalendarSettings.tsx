// AI dev note: Componente para gerenciar sincronização com Google Calendar
// Permite usuário conectar/desconectar sua conta Google

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/primitives/button';
import { Switch } from '@/components/primitives/switch';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/primitives/use-toast';

export const GoogleCalendarSettings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // AI dev note: Profissionais e Admin tem controle manual (checkbox)
  // Pacientes e responsáveis (sem acesso) recebem automaticamente se conectarem
  const canToggle =
    user?.pessoa?.role === 'profissional' || user?.pessoa?.role === 'admin';

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadSettings = async () => {
    if (!user?.pessoa?.id) return;

    try {
      const { data, error } = await supabase
        .from('pessoas')
        .select('google_calendar_enabled, google_refresh_token')
        .eq('id', user.pessoa.id)
        .single();

      if (error) throw error;

      setEnabled(data?.google_calendar_enabled || false);
      setIsConnected(!!data?.google_refresh_token);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectGoogle = () => {
    // AI dev note: Usar VITE_APP_URL para garantir consistência com a Edge Function
    console.log('🚀 INICIANDO OAUTH DEBUG');
    console.log('📍 window.location:', window.location.href);
    console.log('🔑 VITE_APP_URL:', import.meta.env.VITE_APP_URL);
    console.log(
      '🔑 VITE_GOOGLE_CLIENT_ID:',
      import.meta.env.VITE_GOOGLE_CLIENT_ID
    );
    console.log(
      '🔢 CLIENT_ID LENGTH:',
      import.meta.env.VITE_GOOGLE_CLIENT_ID?.length
    );
    const clientIdString: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    console.log(
      '🔤 CLIENT_ID CHAR CODES:',
      clientIdString.split('').map((c: string) => c.charCodeAt(0))
    );

    // WORKAROUND: Garantir que o client_id está correto
    const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    let clientId = rawClientId;

    // Se o client_id não começar com "7", adicionar (bug de truncamento)
    if (clientId && !clientId.startsWith('7')) {
      console.log('⚠️ CLIENT_ID TRUNCADO DETECTADO! Corrigindo...');
      clientId = '7' + clientId;
    }

    console.log('✅ CLIENT_ID FINAL:', clientId);

    const redirectUri = `${import.meta.env.VITE_APP_URL}/api/oauth-callback`;
    console.log('🎯 redirectUri construída:', redirectUri);

    const stateData = {
      userId: user?.pessoa?.id || '',
      autoEnable: !canToggle, // Auto-ativar para pacientes/responsáveis
    };
    console.log('📦 State data:', stateData);

    const params = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify(stateData),
    };
    console.log('🔧 OAuth params:', params);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params)}`;
    console.log('🌐 URL final do Google OAuth:', googleAuthUrl);

    // Salvar logs no localStorage para análise posterior
    localStorage.setItem(
      'oauth_debug',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        redirectUri,
        params,
        googleAuthUrl,
        windowLocation: window.location.href,
        env: {
          VITE_APP_URL: import.meta.env.VITE_APP_URL,
          VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        },
      })
    );

    console.log('💾 Logs salvos em localStorage["oauth_debug"]');
    console.log('🔗 Redirecionando em 2 segundos...');

    // Delay para permitir ver os logs
    setTimeout(() => {
      window.location.href = googleAuthUrl;
    }, 2000);
  };

  const handleDisconnect = async () => {
    if (!user?.pessoa?.id) return;

    try {
      const { error } = await supabase
        .from('pessoas')
        .update({
          google_refresh_token: null,
          google_access_token: null,
          google_calendar_enabled: false,
          google_token_expires_at: null,
        })
        .eq('id', user.pessoa.id);

      if (error) throw error;

      setIsConnected(false);
      setEnabled(false);

      toast({
        title: 'Desconectado',
        description: 'Google Calendar desconectado com sucesso',
      });
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível desconectar',
        variant: 'destructive',
      });
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (checked && !isConnected) {
      handleConnectGoogle();
      return;
    }

    if (!user?.pessoa?.id) return;

    try {
      const { error } = await supabase
        .from('pessoas')
        .update({ google_calendar_enabled: checked })
        .eq('id', user.pessoa.id);

      if (error) throw error;

      setEnabled(checked);

      toast({
        title: checked ? 'Ativado' : 'Desativado',
        description: checked
          ? 'Agendamentos serão sincronizados com seu Google Calendar'
          : 'Sincronização pausada',
      });
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a configuração',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <CardTitle>Sincronização com Google Calendar</CardTitle>
        </div>
        <CardDescription>
          Seus agendamentos aparecerão automaticamente no seu Google Calendar
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status da Conexão */}
        {isConnected ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-700 dark:text-green-300 font-medium">
              Conectado ao Google Calendar
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              Não conectado
            </span>
          </div>
        )}

        {/* Toggle de Ativação - Apenas para profissionais e admin */}
        {canToggle && (
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <p className="font-medium">Sincronização Automática</p>
              <p className="text-sm text-muted-foreground">
                {enabled
                  ? 'Novos agendamentos serão adicionados automaticamente'
                  : 'Ative para sincronizar agendamentos'}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={!isConnected}
            />
          </div>
        )}

        {/* Info para pacientes/responsáveis - sincronização sempre ativa */}
        {!canToggle && isConnected && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              ✓ <strong>Sincronização ativa!</strong> Você receberá
              automaticamente os agendamentos no seu Google Calendar.
            </p>
          </div>
        )}

        {/* Botão de Conexão/Desconexão */}
        {!isConnected ? (
          <Button
            onClick={handleConnectGoogle}
            variant="outline"
            className="w-full gap-2"
          >
            <img
              src="/images/logos/icone-google.png"
              alt="Google"
              className="w-5 h-5"
            />
            Conectar com Google
          </Button>
        ) : (
          <Button
            onClick={handleDisconnect}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            Desconectar Google Calendar
          </Button>
        )}

        {/* Informações sobre Responsáveis */}
        {user?.pessoa?.role === 'profissional' && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Dica:</strong> Os responsáveis legais dos pacientes
              também podem conectar suas contas Google para receber
              automaticamente os agendamentos de seus filhos em seus
              calendários.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
