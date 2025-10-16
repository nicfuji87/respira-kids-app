// AI dev note: Edge Function para logging do processo de cadastro público
// Insere logs de forma não-bloqueante nas tabelas:
// - public_registration_logs (eventos gerais)
// - public_registration_form_data (dados do formulário anonimizados)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Types
interface BrowserInfo {
  browser: string;
  screenResolution: string;
  language: string;
  timezone: string;
}

interface LogEventRequest {
  sessionId: string;
  eventType:
    | 'step_started'
    | 'step_completed'
    | 'validation_error'
    | 'api_error'
    | 'success';
  stepName?: string;
  formData?: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  userAgent?: string;
  browserInfo?: BrowserInfo;
}

interface LogEventResponse {
  success: boolean;
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializar Supabase client com service role (bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const requestData: LogEventRequest = await req.json();

    console.log(
      `📋 [log-registration-event] Evento: ${requestData.eventType} | Session: ${requestData.sessionId} | Step: ${requestData.stepName || 'N/A'}`
    );

    // Extrair IP do cliente
    const ipAddress =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'unknown';

    // Inserir log geral
    const { error: logError } = await supabase
      .from('public_registration_logs')
      .insert({
        session_id: requestData.sessionId,
        event_type: requestData.eventType,
        step_name: requestData.stepName || null,
        error_message: requestData.errorMessage || null,
        error_stack: requestData.errorStack || null,
        ip_address: ipAddress,
        user_agent: requestData.userAgent || null,
        browser_info: requestData.browserInfo || {},
      });

    if (logError) {
      console.error(
        '❌ [log-registration-event] Erro ao inserir log:',
        logError
      );
      throw logError;
    }

    // Se houver dados de formulário, inserir também
    if (requestData.formData && requestData.stepName) {
      const { error: formError } = await supabase
        .from('public_registration_form_data')
        .insert({
          session_id: requestData.sessionId,
          step_name: requestData.stepName,
          form_data: requestData.formData,
          is_valid: requestData.eventType === 'step_completed',
          validation_errors:
            requestData.eventType === 'validation_error'
              ? requestData.formData
              : null,
        });

      if (formError) {
        console.error(
          '❌ [log-registration-event] Erro ao inserir form data:',
          formError
        );
        // Não falhar se não conseguir inserir form data
      }
    }

    console.log('✅ [log-registration-event] Log salvo com sucesso');

    const response: LogEventResponse = { success: true };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ [log-registration-event] Erro fatal:', error);

    // Sempre retornar 200 para não afetar UX
    // Logging nunca deve falhar a aplicação
    const response: LogEventResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // ⚠️ SEMPRE 200 - logging não deve bloquear UX
    });
  }
});
