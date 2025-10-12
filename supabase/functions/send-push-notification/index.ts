// Edge Function: send-push-notification
// Responsável por processar a fila de notificações push e enviar via Firebase
// AI dev note: Usa Firebase Cloud Messaging API V1 com OAuth2

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';

// Tipos
interface PushNotification {
  id: string;
  user_id: string;
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  event_type: string;
  event_id?: string;
  attempts: number;
  max_attempts: number;
}

interface SendResult {
  success: boolean;
  notification_id: string;
  error?: string;
}

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// Configuração CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializar Supabase client com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firebaseServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!;

    if (!firebaseServiceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT não configurado');
    }

    const serviceAccount = JSON.parse(firebaseServiceAccount);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔔 Processando fila de notificações push...');

    // Buscar notificações pendentes
    const { data: notifications, error: fetchError } = await supabase
      .from('push_notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .lt('attempts', supabase.rpc('max_attempts'))
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Erro ao buscar notificações:', fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      console.log('✅ Nenhuma notificação pendente');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhuma notificação pendente',
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(
      `📨 Encontradas ${notifications.length} notificações para enviar`
    );

    // Processar cada notificação
    const results: SendResult[] = [];

    // Obter access token OAuth2
    const accessToken = await getFirebaseAccessToken(serviceAccount);

    for (const notification of notifications) {
      try {
        // Enviar via Firebase Cloud Messaging (FCM) v1 API
        const result = await sendFCMNotification(
          notification,
          accessToken,
          serviceAccount.project_id
        );

        results.push(result);

        // Atualizar status no banco
        if (result.success) {
          // Sucesso: marcar como enviado
          await supabase
            .from('push_notification_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', notification.id);

          // Log de sucesso
          await supabase.from('push_notification_logs').insert({
            user_id: notification.user_id,
            token: notification.token,
            title: notification.title,
            body: notification.body,
            data: notification.data,
            event_type: notification.event_type,
            event_id: notification.event_id,
            success: true,
            response_data: { sent: true },
          });

          console.log(`✅ Notificação ${notification.id} enviada com sucesso`);
        } else {
          // Falha: incrementar tentativas
          const newAttempts = notification.attempts + 1;
          const isFinalAttempt = newAttempts >= notification.max_attempts;

          await supabase
            .from('push_notification_queue')
            .update({
              status: isFinalAttempt ? 'failed' : 'pending',
              attempts: newAttempts,
              error_message: result.error,
              next_retry_at: isFinalAttempt
                ? null
                : new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutos
              updated_at: new Date().toISOString(),
            })
            .eq('id', notification.id);

          // Log de erro
          await supabase.from('push_notification_logs').insert({
            user_id: notification.user_id,
            token: notification.token,
            title: notification.title,
            body: notification.body,
            data: notification.data,
            event_type: notification.event_type,
            event_id: notification.event_id,
            success: false,
            error_message: result.error,
          });

          console.error(
            `❌ Falha ao enviar notificação ${notification.id}:`,
            result.error
          );
        }
      } catch (error) {
        console.error(
          `❌ Erro ao processar notificação ${notification.id}:`,
          error
        );

        // Marcar como falha
        await supabase
          .from('push_notification_queue')
          .update({
            status: 'failed',
            error_message:
              error instanceof Error ? error.message : 'Erro desconhecido',
            updated_at: new Date().toISOString(),
          })
          .eq('id', notification.id);
      }
    }

    // Resumo
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `📊 Processamento concluído: ${successCount} sucesso, ${failureCount} falhas`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: notifications.length,
        sent: successCount,
        failed: failureCount,
        results: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Erro geral:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================
// Função: Obter Access Token OAuth2
// ============================================
async function getFirebaseAccessToken(
  serviceAccount: ServiceAccount
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Criar JWT
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // Importar chave privada
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    new TextEncoder().encode(
      serviceAccount.private_key
        .replace(/\\n/g, '\n')
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .trim()
    ).buffer as ArrayBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Criar assinatura
  const jwt = await create({ alg: 'RS256', typ: 'JWT' }, payload, privateKey);

  // Trocar JWT por access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(`Erro ao obter access token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// ============================================
// Função auxiliar: Enviar notificação via FCM V1
// ============================================
async function sendFCMNotification(
  notification: PushNotification,
  accessToken: string,
  projectId: string
): Promise<SendResult> {
  try {
    // Usar FCM V1 API (moderna)
    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const payload = {
      message: {
        token: notification.token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...notification.data,
          notification_id: notification.id,
          event_type: notification.event_type,
          event_id: notification.event_id || '',
        },
        webpush: {
          notification: {
            icon: '/images/logos/icone-respira-kids.png',
            badge: '/images/logos/icone-respira-kids.png',
            tag: notification.event_type,
            requireInteraction: false,
            vibrate: [200, 100, 200],
          },
        },
        android: {
          priority: 'high',
          ttl: '86400s',
        },
      },
    };

    const response = await fetch(fcmEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (response.ok) {
      return {
        success: true,
        notification_id: notification.id,
      };
    } else {
      // FCM retornou erro
      const errorMessage =
        responseData.error?.message || 'Erro desconhecido do FCM';

      return {
        success: false,
        notification_id: notification.id,
        error: errorMessage,
      };
    }
  } catch (error) {
    return {
      success: false,
      notification_id: notification.id,
      error: error instanceof Error ? error.message : 'Erro ao enviar via FCM',
    };
  }
}
