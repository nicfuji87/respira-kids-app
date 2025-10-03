// AI dev note: Edge Function para sincronizar agendamentos com Google Calendar
// APENAS para profissionais que conectaram OAuth
// Responsável Legal recebe via email/WhatsApp (n8n)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface SyncRequest {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  agendamento_id: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface AgendamentoCompleto {
  id: string;
  local_atendimento_id?: string;
  local_atendimento_tipo_local?: string;
  paciente_nome?: string;
  profissional_nome?: string;
  tipo_servico_nome?: string;
  data_hora: string;
  observacao?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders?: {
    useDefault: boolean;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { operation, agendamento_id }: SyncRequest = await req.json();

    console.log(
      `📅 Sincronizando Google Calendar: ${operation} - Agendamento: ${agendamento_id}`
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar agendamento completo
    const { data: agendamento, error: agendamentoError } = await supabase
      .from('vw_agendamentos_completos')
      .select('*')
      .eq('id', agendamento_id)
      .single();

    if (agendamentoError || !agendamento) {
      console.error('❌ Erro ao buscar agendamento:', agendamentoError);
      throw new Error('Agendamento não encontrado');
    }

    // 2. Buscar profissional com Google Calendar (OAuth)
    const { data: recipients, error: recipientsError } = await supabase.rpc(
      'get_google_calendar_recipients',
      { p_agendamento_id: agendamento_id }
    );

    if (recipientsError) {
      console.error('❌ Erro ao buscar destinatários:', recipientsError);
      throw new Error('Erro ao buscar destinatários');
    }

    if (!recipients || recipients.length === 0) {
      console.log('⚠️ Nenhum profissional com Google Calendar configurado.');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Profissional sem Google Calendar',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar endereço correto
    const location = await getEventLocation(supabase, agendamento);

    // 4. Para cada profissional, sincronizar
    const results = [];
    for (const recipient of recipients) {
      try {
        const result = await syncEventForRecipient(
          supabase,
          agendamento,
          recipient,
          location,
          operation
        );
        results.push(result);
      } catch (err) {
        console.error(`❌ Erro ao sincronizar para ${recipient.nome}:`, err);
        results.push({ recipient: recipient.nome, error: err.message });
      }
    }

    // 5. Atualizar google_synced_at
    if (operation !== 'DELETE') {
      await supabase
        .from('agendamentos')
        .update({ google_synced_at: new Date().toISOString() })
        .eq('id', agendamento_id);
    }

    console.log('✅ Sincronização concluída:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro ao sincronizar',
      }),
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

async function getEventLocation(
  supabase: SupabaseClient,
  agendamento: AgendamentoCompleto
): Promise<string> {
  const tipoLocal = agendamento.local_atendimento_tipo_local;

  // Clínica ou Externa: endereço do local
  if (tipoLocal === 'clinica' || tipoLocal === 'externa') {
    if (!agendamento.local_atendimento_id) return '';

    const { data: local } = await supabase
      .from('locais_atendimento')
      .select(
        `
        nome,
        numero_endereco,
        complemento_endereco,
        endereco:enderecos(logradouro, bairro, cidade, estado, cep)
      `
      )
      .eq('id', agendamento.local_atendimento_id)
      .single();

    if (!local || !local.endereco)
      return agendamento.local_atendimento_nome || '';

    return [
      local.endereco.logradouro,
      local.numero_endereco,
      local.complemento_endereco,
      local.endereco.bairro,
      local.endereco.cidade,
      local.endereco.estado,
      local.endereco.cep,
    ]
      .filter(Boolean)
      .join(', ');
  }

  // Domiciliar: endereço do paciente
  if (tipoLocal === 'domiciliar') {
    const { data: paciente } = await supabase
      .from('pessoas')
      .select(
        `
        id_endereco,
        numero_endereco,
        complemento_endereco,
        endereco:enderecos(logradouro, bairro, cidade, estado, cep)
      `
      )
      .eq('id', agendamento.paciente_id)
      .single();

    if (!paciente || !paciente.endereco) return 'Atendimento Domiciliar';

    return [
      paciente.endereco.logradouro,
      paciente.numero_endereco,
      paciente.complemento_endereco,
      paciente.endereco.bairro,
      paciente.endereco.cidade,
      paciente.endereco.estado,
      paciente.endereco.cep,
    ]
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

async function syncEventForRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agendamento: any,
  recipient: Recipient,
  location: string,
  operation: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // 1. Refresh token se necessário
  const accessToken = await refreshGoogleTokenIfNeeded(supabase, recipient);
  const calendarId = recipient.google_calendar_id || 'primary';

  // 2. DELETE
  if (operation === 'DELETE' || !agendamento.ativo) {
    if (agendamento.google_event_id) {
      await deleteGoogleCalendarEvent(
        accessToken,
        calendarId,
        agendamento.google_event_id
      );
      await supabase
        .from('agendamentos')
        .update({ google_event_id: null, google_synced_at: null })
        .eq('id', agendamento.id);
      return { recipient: recipient.nome, action: 'deleted' };
    }
    return { recipient: recipient.nome, action: 'skipped (no event)' };
  }

  // 3. Montar dados do evento
  const eventData = buildEventData(agendamento, location);

  // 4. UPDATE
  if (operation === 'UPDATE' && agendamento.google_event_id) {
    await updateGoogleCalendarEvent(
      accessToken,
      calendarId,
      agendamento.google_event_id,
      eventData
    );
    return { recipient: recipient.nome, action: 'updated' };
  }

  // 5. INSERT
  const eventId = await createGoogleCalendarEvent(
    accessToken,
    calendarId,
    eventData
  );
  if (!agendamento.google_event_id) {
    await supabase
      .from('agendamentos')
      .update({ google_event_id: eventId })
      .eq('id', agendamento.id);
  }

  return { recipient: recipient.nome, action: 'created', eventId };
}

// AI dev note: Mapear cores do sistema para cores do Google Calendar
// Google Calendar aceita IDs de 1 a 11 com cores específicas
function mapServiceColorToGoogleCalendar(
  colorCode: string | null | undefined
): string {
  // Mapa de cores CSS/hex para Google Calendar colorId
  const colorMap: Record<string, string> = {
    // Cores do sistema → Google Calendar ID
    blue: '9', // Azul
    green: '10', // Verde
    red: '11', // Vermelho
    orange: '6', // Laranja
    purple: '3', // Roxo
    pink: '4', // Rosa
    yellow: '5', // Amarelo
    gray: '8', // Cinza
    grey: '8', // Cinza (alternativo)

    // Códigos hex comuns do Tailwind
    '#3B82F6': '9', // blue-500
    '#22C55E': '10', // green-500
    '#EF4444': '11', // red-500
    '#F97316': '6', // orange-500
    '#8B5CF6': '3', // purple-500
    '#EC4899': '4', // pink-500
    '#F59E0B': '5', // yellow-500
    '#6B7280': '8', // gray-500
  };

  if (!colorCode) return '1'; // Lavanda (padrão)

  const normalized = colorCode.toLowerCase().trim();
  return colorMap[normalized] || '1';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEventData(agendamento: any, location: string): any {
  const startDate = new Date(agendamento.data_hora);
  const durationMinutes = agendamento.tipo_servico_duracao_minutos || 60;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  const formatWithTimezone = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
  };

  // AI dev note: Título apenas com nome do paciente (conforme solicitado)
  const summary = agendamento.paciente_nome;
  const description = buildEventDescription(agendamento, location);
  const reminders = buildReminders();

  // AI dev note: Determinar cor - priorizar status "Cancelado" = cinza
  // Se cancelado, usar cinza. Caso contrário, usar cor do tipo de serviço
  const isCancelado =
    agendamento.status_consulta_codigo?.toLowerCase() === 'cancelado';
  const colorId = isCancelado
    ? '8' // Cinza para cancelados
    : mapServiceColorToGoogleCalendar(
        agendamento.servico_cor || agendamento.tipo_servico_cor
      );

  return {
    summary,
    location,
    description,
    start: {
      dateTime: formatWithTimezone(startDate),
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: formatWithTimezone(endDate),
      timeZone: 'America/Sao_Paulo',
    },
    colorId,
    reminders,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEventDescription(agendamento: any, location: string): string {
  const startDate = new Date(agendamento.data_hora);
  const dateStr = startDate.toLocaleDateString('pt-BR');
  const timeStr = startDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // AI dev note: Buscar responsável legal (não o próprio paciente como fallback)
  const responsavelNome =
    agendamento.responsavel_legal_nome || agendamento.paciente_nome;

  // AI dev note: Usar servico_nome ou tipo_servico_nome (ambos existem na view)
  const tipoServico =
    agendamento.servico_nome || agendamento.tipo_servico_nome || 'Serviço';

  // AI dev note: Detectar status para destacar visualmente
  const statusCodigo = agendamento.status_consulta_codigo?.toLowerCase();
  const isCancelado = statusCodigo === 'cancelado';

  // AI dev note: Adicionar aviso visual se cancelado
  let description = '';
  if (isCancelado) {
    description = '❌❌❌ CONSULTA CANCELADA ❌❌❌\n\n';
  }

  // AI dev note: Descrição simplificada conforme solicitado
  // Removido: Profissional (já vai para o calendário dele)
  // Removido: Duração (redundante)
  description += `👤 Paciente: ${agendamento.paciente_nome}
👥 Responsável: ${responsavelNome}
📅 Data: ${dateStr} às ${timeStr}
🏥 Tipo de Serviço: ${tipoServico}
📍 Local: ${location}`;

  if (agendamento.observacao) {
    description += `\n\n📝 Observações: ${agendamento.observacao}`;
  }

  return description.trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildReminders(): any {
  // AI dev note: Lembrete fixo de 1 hora antes conforme solicitado
  return {
    useDefault: false,
    overrides: [{ method: 'popup', minutes: 60 }],
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

  console.log(`🔄 Refreshing token para ${recipient.nome}`);

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
  eventData: GoogleCalendarEvent
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
  console.log(`✅ Evento criado: ${event.id}`);
  return event.id;
}

async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  eventData: GoogleCalendarEvent
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

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erro ao atualizar evento:', error);
    throw new Error('Falha ao atualizar evento no Google Calendar');
  }

  console.log(`✅ Evento atualizado: ${eventId}`);
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    console.error('❌ Erro ao deletar evento:', error);
    throw new Error('Falha ao deletar evento no Google Calendar');
  }

  console.log(`✅ Evento deletado: ${eventId}`);
}
