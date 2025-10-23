import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// AI dev note: Edge Function para transcrição de áudio usando OpenAI Whisper
// Busca prompt e configurações da tabela ai_prompts no banco

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TranscribeRequest {
  audioBase64: string;
  audioType: string;
  language?: string;
}

interface TranscribeResponse {
  success: boolean;
  transcription?: string;
  error?: string;
  audioSize?: number;
  metadata?: {
    model: string;
    promptSource: string;
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Parse request
    const body = await req.json();
    const { audioBase64, audioType = 'audio/webm' }: TranscribeRequest = body;

    if (!audioBase64) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Audio base64 não fornecido',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Convert base64 to Blob
    const base64Data = audioBase64.includes(',')
      ? audioBase64.split(',')[1]
      : audioBase64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: audioType });

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis de ambiente do Supabase não encontradas');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch OpenAI key from Supabase
    const { data: apiKeys, error: apiError } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('service_name', 'openai')
      .eq('is_active', true)
      .single();

    if (apiError || !apiKeys?.encrypted_key) {
      throw new Error('Chave OpenAI não encontrada');
    }

    const openaiKey = apiKeys.encrypted_key;

    // Fetch transcription prompt and model from ai_prompts table
    const { data: promptData, error: promptError } = await supabase
      .from('ai_prompts')
      .select('prompt_content, openai_model')
      .eq('prompt_name', 'audio_transcription')
      .eq('is_active', true)
      .single();

    let promptContent = 'Transcreva o áudio de forma clara e precisa.';
    let openaiModel = 'whisper-1';

    if (promptData && !promptError) {
      promptContent = promptData.prompt_content || promptContent;
      openaiModel = promptData.openai_model || openaiModel;
    }

    // Prepare OpenAI FormData
    const openaiFormData = new FormData();
    const audioFile = new File([audioBlob], 'audio.webm', {
      type: audioType,
    });
    openaiFormData.append('file', audioFile);
    openaiFormData.append('model', openaiModel);
    openaiFormData.append('response_format', 'json');
    openaiFormData.append('language', 'pt');

    if (promptContent && promptContent.trim() !== '') {
      openaiFormData.append('prompt', promptContent);
    }

    // Call OpenAI API
    const openaiResponse = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: openaiFormData,
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(
        `OpenAI API Error: ${openaiResponse.status} - ${errorText.substring(0, 200)}`
      );
    }

    const openaiData = await openaiResponse.json();
    const transcription = openaiData.text?.trim();

    if (!transcription) {
      throw new Error('Transcrição não encontrada na resposta da OpenAI');
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription: transcription,
        audioSize: audioBlob.size,
        metadata: {
          model: openaiModel,
          promptSource: 'supabase',
        },
      } as TranscribeResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Transcribe Audio Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno do servidor',
      } as TranscribeResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
