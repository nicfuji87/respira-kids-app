import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { OpenAI } from 'https://deno.land/x/openai@v4.24.0/mod.ts';

// AI dev note: Edge Function para transcrição de áudio usando OpenAI Whisper
// Rate limiting global para controlar custos

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TranscribeRequest {
  audioBase64: string;
  audioType: string; // webm, mp3, wav, etc.
  language?: string;
}

interface TranscribeResponse {
  success: boolean;
  transcription?: string;
  error?: string;
  duration?: number;
}

// Rate limiting simples em memória (global)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 10; // máximo 10 transcrições por minuto

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(clientId) || [];

  // Remover requests antigas (fora da janela)
  const validRequests = requests.filter(
    (time) => now - time < RATE_LIMIT_WINDOW
  );

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }

  // Adicionar nova request
  validRequests.push(now);
  rateLimitMap.set(clientId, validRequests);
  return true;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Environment variables para Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables not configured');
    }

    // Criar cliente Supabase
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar chave OpenAI do banco
    const { data: apiKeyData, error: keyError } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('service_name', 'openai')
      .eq('is_active', true)
      .single();

    if (keyError || !apiKeyData?.encrypted_key) {
      throw new Error('OpenAI API key not found or inactive');
    }

    const openaiApiKey = apiKeyData.encrypted_key;

    // Parse request
    const {
      audioBase64,
      audioType,
      language = 'pt',
    }: TranscribeRequest = await req.json();

    if (!audioBase64 || !audioType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'audioBase64 and audioType are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting baseado no IP
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded. Try again in a minute.',
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Converter base64 para blob
    const audioBuffer = Uint8Array.from(atob(audioBase64), (c) =>
      c.charCodeAt(0)
    );

    // Verificar tamanho do arquivo (max 25MB para Whisper)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioBuffer.length > maxSize) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Audio file too large. Maximum size is 25MB.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Criar arquivo temporário
    const filename = `audio_${Date.now()}.${audioType === 'audio/webm' ? 'webm' : 'mp3'}`;
    const file = new File([audioBuffer], filename, { type: audioType });

    // Inicializar OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      organization: Deno.env.get('OPENAI_ORG_ID'), // Opcional: Organization ID
    });

    console.log(
      `Transcribing audio file: ${filename}, size: ${audioBuffer.length} bytes`
    );

    // Fazer transcrição
    const startTime = Date.now();
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: language,
      response_format: 'text',
      prompt:
        'Este é um relatório médico de fisioterapia respiratória pediátrica. Use terminologia médica apropriada.',
    });

    const duration = Date.now() - startTime;
    console.log(`Transcription completed in ${duration}ms`);

    const response: TranscribeResponse = {
      success: true,
      transcription: transcription.trim(),
      duration: duration,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Transcription error:', error);

    const response: TranscribeResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
