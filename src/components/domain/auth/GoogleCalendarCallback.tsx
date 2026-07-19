// AI dev note: Página de callback OAuth do Google Calendar
// Processa o código de autorização e salva os tokens

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';

export const GoogleCalendarCallback: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Evitar múltiplas execuções
    if (!isProcessing) {
      setIsProcessing(true);
      handleCallback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCallback = async () => {
    const logs: string[] = [];
    const addLog = (msg: string) => {
      console.log(msg);
      logs.push(`${new Date().toISOString()} - ${msg}`);
    };

    try {
      addLog('🔍 INICIO - Processando callback OAuth');

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const stateStr = urlParams.get('state');

      addLog(
        `📋 URL params - code: ${code ? 'presente' : 'ausente'}, state: ${stateStr ? 'presente' : 'ausente'}`
      );

      if (!code) {
        throw new Error('Código de autorização não encontrado');
      }

      if (!stateStr) {
        throw new Error('Estado de autorização não encontrado');
      }

      // Parse state data
      let stateData: { userId: string; autoEnable?: boolean };
      try {
        stateData = JSON.parse(stateStr);
        addLog(`✅ State parsed - userId: ${stateData.userId}`);
      } catch {
        stateData = { userId: stateStr };
        addLog(`⚠️ State fallback - userId: ${stateData.userId}`);
      }

      addLog('📞 Chamando Edge Function google-oauth-callback...');
      addLog(
        `   Payload: { code: [presente], userId: ${stateData.userId}, autoEnable: ${stateData.autoEnable} }`
      );

      // Chamar Edge Function para trocar código por tokens
      const { data, error: functionError } = await supabase.functions.invoke(
        'google-oauth-callback',
        {
          body: {
            code,
            userId: stateData.userId,
            autoEnable: stateData.autoEnable,
          },
        }
      );

      addLog(
        `📡 Edge Function respondeu - error: ${functionError ? 'SIM' : 'NÃO'}, data: ${JSON.stringify(data)}`
      );

      if (functionError) {
        addLog(`❌ Erro na Edge Function: ${JSON.stringify(functionError)}`);
        throw new Error(
          functionError.message || 'Erro ao processar autenticação'
        );
      }

      if (!data?.success) {
        addLog(`❌ Edge Function retornou falha: ${data?.error}`);
        throw new Error(data?.error || 'Falha ao conectar Google Calendar');
      }

      addLog('✅ Google Calendar conectado com sucesso!');
      setStatus('success');

      // Salvar logs no localStorage para debugar
      localStorage.setItem('google_oauth_logs', JSON.stringify(logs));

      // Limpar parâmetros da URL para evitar reprocessamento
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.hash
      );

      // Redirecionar após 2 segundos
      setTimeout(() => {
        navigate('/configuracoes?tab=integracao');
      }, 2000);
    } catch (err) {
      addLog(
        `❌ ERRO FINAL: ${err instanceof Error ? err.message : 'Erro desconhecido'}`
      );
      console.error('❌ Erro no callback:', err);
      console.error('📋 LOGS COMPLETOS:', logs);

      // Salvar logs no localStorage
      localStorage.setItem('google_oauth_logs', JSON.stringify(logs));
      localStorage.setItem(
        'google_oauth_error',
        err instanceof Error ? err.message : 'Erro desconhecido'
      );

      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          {status === 'loading' && (
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <div>
                <h2 className="text-xl font-semibold">
                  Conectando com Google...
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Aguarde enquanto configuramos sua integração
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
              <div>
                <h2 className="text-xl font-semibold text-green-600">
                  Conectado com Sucesso!
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Seus agendamentos serão sincronizados automaticamente
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Redirecionando para configurações...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
              <div>
                <h2 className="text-xl font-semibold text-destructive">
                  Erro na Conexão
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {error || 'Não foi possível conectar com o Google Calendar'}
                </p>
              </div>
              <Button onClick={() => navigate('/configuracoes?tab=integracao')}>
                Voltar para Configurações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
