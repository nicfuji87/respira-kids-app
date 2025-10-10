// AI dev note: Edge Function para desabilitar notificações nativas do Asaas
// Usa endpoint batch: PUT /v3/notifications/batch
// IMPORTANTE: campo 'notifications' deve ser ARRAY de objetos, NÃO string JSON
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface DisableNotificationsRequest {
  apiConfig: {
    apiKey: string;
    isGlobal: boolean;
    baseUrl: string;
  };
  customerId: string;
}

interface DisableNotificationsResponse {
  success: boolean;
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Configurar CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { apiConfig, customerId }: DisableNotificationsRequest =
      await req.json();

    if (!apiConfig?.apiKey || !customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API key e customerId são obrigatórios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('🔕 Desabilitando notificações para cliente:', customerId);

    // Preparar payload para desabilitar todas as notificações usando batch
    // CORRIGIDO: notifications é um ARRAY de objetos, não JSON stringificado
    const notificationsPayload = {
      customer: customerId,
      notifications: [
        {
          enabled: false,
          emailEnabledForProvider: false,
          smsEnabledForProvider: false,
          emailEnabledForCustomer: false,
          smsEnabledForCustomer: false,
          phoneCallEnabledForCustomer: false,
          whatsappEnabledForCustomer: false,
        },
      ],
    };

    console.log(
      '📤 Payload batch:',
      JSON.stringify(notificationsPayload, null, 2)
    );

    // Atualizar notificações em batch
    const updateController = new AbortController();
    const updateTimeoutId = setTimeout(() => updateController.abort(), 15000);

    const updateResponse = await fetch(
      `${apiConfig.baseUrl}/notifications/batch`,
      {
        method: 'PUT',
        headers: {
          access_token: apiConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'RespiraKids/1.0',
        },
        body: JSON.stringify(notificationsPayload),
        signal: updateController.signal,
      }
    );

    clearTimeout(updateTimeoutId);

    if (updateResponse.ok) {
      console.log('✅ Notificações desabilitadas com sucesso via batch');

      const response: DisableNotificationsResponse = {
        success: true,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const updateError = await updateResponse.json().catch(() => ({}));
      console.error('❌ Erro ao desabilitar notificações:', updateError);

      const errorMessage =
        updateError.errors?.length > 0
          ? updateError.errors[0].description
          : `Erro ${updateResponse.status} ao desabilitar notificações`;

      const response: DisableNotificationsResponse = {
        success: false,
        error: errorMessage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Erro na Edge Function asaas-disable-notifications:', error);

    let errorMessage = 'Erro na comunicação com o Asaas';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage =
          'Timeout na desabilitação de notificações - tente novamente';
      } else {
        errorMessage = error.message;
      }
    }

    const response: DisableNotificationsResponse = {
      success: false,
      error: errorMessage,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
