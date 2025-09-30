// AI dev note: Edge Function para processar callback OAuth do Google
// Troca código de autorização por tokens e salva no banco
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface CallbackRequest {
  code: string;
  userId: string;
  autoEnable?: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, userId, autoEnable }: CallbackRequest = await req.json();

    console.log('📞 Processando callback OAuth do Google para usuário:', userId, 'autoEnable:', autoEnable);

    // 1. Trocar código por tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
        redirect_uri: `${Deno.env.get('APP_URL')}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('❌ Erro ao trocar código por tokens:', error);
      throw new Error('Falha ao obter tokens do Google');
    }

    const tokens = await tokenResponse.json();
    console.log('✅ Tokens obtidos com sucesso');

    // 2. Obter informações do calendário primário do usuário
    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      }
    );

    let calendarId = 'primary';
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      calendarId = calendarData.id || 'primary';
    }

    // 3. Salvar tokens no banco de dados
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // AI dev note: google_calendar_enabled sempre true ao conectar
    // Profissionais/admin podem desativar manualmente depois
    const { error: updateError } = await supabase
      .from('pessoas')
      .update({
        google_refresh_token: tokens.refresh_token,
        google_access_token: tokens.access_token,
        google_calendar_id: calendarId,
        google_calendar_enabled: true,
        google_token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Erro ao salvar tokens no banco:', updateError);
      throw new Error('Erro ao salvar configurações');
    }

    console.log('✅ Google Calendar conectado com sucesso para usuário:', userId);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro no callback OAuth:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro ao processar callback'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
