// AI dev note: Edge Function para sincronizar BLOQUEIOS de agenda com Google
// Calendar. Espelha sync-google-calendar, mas para agenda_bloqueios.
// - profissional_id != null: evento na agenda daquele profissional.
// - profissional_id == null (clínica inteira): replica em CADA profissional
//   com OAuth (pode_atender = true).
// O mapeamento bloqueio→evento por profissional fica em
// agenda_bloqueio_google_events (um google_event_id por profissional).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface SyncRequest {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  bloqueio_id: string;
}

interface Recipient {
  id: string;
  nome: string;
  email: string;
  google_calendar_id: string;
  google_refresh_token: string;
  google_access_token: string;
  google_token_expires_at: string;
}

interface Bloqueio {
  id: string;
  profissional_id: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  motivo: string | null;
  observacao: string | null;
  ativo: boolean;
  deleted_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MOTIVO_LABELS: Record<string, string> = {
  almoco: 'Almoço',
  ferias: 'Férias',
  feriado: 'Feriado',
  reuniao: 'Reunião',
  pessoal: 'Pessoal',
  outro: 'Outro',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { operation, bloqueio_id }: SyncRequest = await req.json();
    console.log(
      `🔒 Sincronizando bloqueio Google Calendar: ${operation} - ${bloqueio_id}`
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar bloqueio
    const { data: bloqueio, error: bloqueioError } = await supabase
      .from('agenda_bloqueios')
      .select(
        'id, profissional_id, inicio, fim, dia_inteiro, motivo, observacao, ativo, deleted_at'
      )
      .eq('id', bloqueio_id)
      .single();

    if (bloqueioError || !bloqueio) {
      console.error('❌ Bloqueio não encontrado:', bloqueioError);
      throw new Error('Bloqueio não encontrado');
    }

    const isRemocao =
      operation === 'DELETE' ||
      bloqueio.ativo === false ||
      bloqueio.deleted_at !== null;

    // 2. Destinatários (profissional específico OU todos com OAuth se clínica)
    const { data: recipients, error: recipientsError } = await supabase.rpc(
      'get_google_calendar_recipients_bloqueio',
      { p_bloqueio_id: bloqueio_id }
    );

    if (recipientsError) {
      console.error('❌ Erro ao buscar destinatários:', recipientsError);
      throw new Error('Erro ao buscar destinatários');
    }

    // 3. Mapeamentos existentes (bloqueio → evento por profissional)
    const { data: mapeamentos } = await supabase
      .from('agenda_bloqueio_google_events')
      .select('id, profissional_id, google_event_id, google_calendar_id')
      .eq('bloqueio_id', bloqueio_id);

    const mapByProf = new Map<
      string,
      { id: string; google_event_id: string; google_calendar_id: string | null }
    >();
    for (const m of mapeamentos || []) {
      mapByProf.set(m.profissional_id, {
        id: m.id,
        google_event_id: m.google_event_id,
        google_calendar_id: m.google_calendar_id,
      });
    }

    const results = [];

    // Caso remoção: apagar todos os eventos mapeados
    if (isRemocao) {
      for (const m of mapeamentos || []) {
        const recipient = (recipients || []).find(
          (r: Recipient) => r.id === m.profissional_id
        );
        try {
          if (recipient) {
            const accessToken = await refreshGoogleTokenIfNeeded(
              supabase,
              recipient
            );
            await deleteGoogleCalendarEvent(
              accessToken,
              m.google_calendar_id || 'primary',
              m.google_event_id
            );
          }
        } catch (err) {
          console.error('❌ Erro ao deletar evento de bloqueio:', err);
        }
        await supabase
          .from('agenda_bloqueio_google_events')
          .delete()
          .eq('id', m.id);
        results.push({ profissional_id: m.profissional_id, action: 'deleted' });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!recipients || recipients.length === 0) {
      console.log(
        '⚠️ Nenhum profissional com Google Calendar para o bloqueio.'
      );
      return new Response(
        JSON.stringify({ success: true, message: 'Sem destinatários OAuth' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventData = buildBlockEvent(bloqueio);

    // 4. Criar/atualizar por destinatário
    for (const recipient of recipients as Recipient[]) {
      try {
        const accessToken = await refreshGoogleTokenIfNeeded(
          supabase,
          recipient
        );
        const calendarId = recipient.google_calendar_id || 'primary';
        const existente = mapByProf.get(recipient.id);

        if (existente) {
          await updateGoogleCalendarEvent(
            accessToken,
            existente.google_calendar_id || calendarId,
            existente.google_event_id,
            eventData
          );
          await supabase
            .from('agenda_bloqueio_google_events')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', existente.id);
          results.push({ profissional_id: recipient.id, action: 'updated' });
        } else {
          const eventId = await createGoogleCalendarEvent(
            accessToken,
            calendarId,
            eventData
          );
          await supabase.from('agenda_bloqueio_google_events').insert({
            bloqueio_id,
            profissional_id: recipient.id,
            google_event_id: eventId,
            google_calendar_id: calendarId,
          });
          results.push({
            profissional_id: recipient.id,
            action: 'created',
            eventId,
          });
        }
      } catch (err) {
        console.error(`❌ Erro ao sincronizar para ${recipient.nome}:`, err);
        results.push({ profissional_id: recipient.id, error: String(err) });
      }
    }

    // 5. Marcar sincronizado
    await supabase
      .from('agenda_bloqueios')
      .update({ google_synced_at: new Date().toISOString() })
      .eq('id', bloqueio_id);

    console.log('✅ Sincronização de bloqueio concluída:', results);
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro na sincronização de bloqueio:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ====================================================================
// AUXILIARES
// ====================================================================

function formatWithTimezone(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBlockEvent(b: Bloqueio): any {
  const motivoLabel = b.motivo
    ? MOTIVO_LABELS[b.motivo] || b.motivo
    : 'Bloqueado';
  const summary = `🔒 Indisponível${motivoLabel ? ` - ${motivoLabel}` : ''}`;
  let description = 'Bloqueio de agenda (Respira Kids)';
  if (b.observacao) description += `\n\n📝 ${b.observacao}`;

  return {
    summary,
    description,
    start: {
      dateTime: formatWithTimezone(new Date(b.inicio)),
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: formatWithTimezone(new Date(b.fim)),
      timeZone: 'America/Sao_Paulo',
    },
    colorId: '8', // cinza
    transparency: 'opaque', // ocupado
    reminders: { useDefault: false },
  };
}

async function refreshGoogleTokenIfNeeded(
  supabase: SupabaseClient,
  recipient: Recipient
): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(recipient.google_token_expires_at);
  if (now < expiresAt && recipient.google_access_token) {
    return recipient.google_access_token;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
      refresh_token: recipient.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erro ao fazer refresh:', error);
    throw new Error('Falha ao atualizar token do Google');
  }

  const tokens = await response.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await supabase
    .from('pessoas')
    .update({
      google_access_token: tokens.access_token,
      google_token_expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', recipient.id);

  return tokens.access_token;
}

async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: any
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }
  );
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erro ao criar evento:', error);
    throw new Error('Falha ao criar evento no Google Calendar');
  }
  const event = await response.json();
  return event.id;
}

async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: any
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }
  );
  // 404: evento sumiu do Google; recria na próxima. Não falhar aqui.
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    console.error('❌ Erro ao atualizar evento:', error);
    throw new Error('Falha ao atualizar evento no Google Calendar');
  }
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    console.error('❌ Erro ao deletar evento:', error);
    throw new Error('Falha ao deletar evento no Google Calendar');
  }
}
