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

    // AI dev note: Verificar tamanho do áudio (limite do Whisper é 25MB)
    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (audioBlob.size > MAX_SIZE) {
      console.error(
        `❌ Arquivo muito grande: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `Arquivo de áudio muito grande (${(audioBlob.size / 1024 / 1024).toFixed(1)}MB). O limite é 25MB. Tente gravar um áudio mais curto ou com menor qualidade.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(
      `📊 Tamanho do áudio: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB, Tipo: ${audioType}`
    );

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

    // AI dev note: Default para gpt-4o-transcribe (melhor qualidade disponível)
    let promptContent =
      'A fisioterapeuta está gravando uma evolução clínica de um paciente pediátrico com terminologia médica especializada.';
    let openaiModel = 'gpt-4o-transcribe';

    if (promptData && !promptError) {
      promptContent = promptData.prompt_content || promptContent;
      openaiModel = promptData.openai_model || openaiModel;
    }

    // AI dev note: Determinar extensão correta baseada no tipo MIME
    // OpenAI Whisper funciona melhor com formatos padrão
    let fileExtension = 'webm';
    let fileName = 'audio.webm';

    if (audioType.includes('webm')) {
      fileExtension = 'webm';
      fileName = 'audio.webm';
    } else if (audioType.includes('mp4') || audioType.includes('m4a')) {
      fileExtension = 'mp4';
      fileName = 'audio.mp4';
    } else if (audioType.includes('mp3') || audioType.includes('mpeg')) {
      fileExtension = 'mp3';
      fileName = 'audio.mp3';
    } else if (audioType.includes('wav')) {
      fileExtension = 'wav';
      fileName = 'audio.wav';
    } else if (audioType.includes('ogg')) {
      fileExtension = 'ogg';
      fileName = 'audio.ogg';
    }

    console.log(
      `📝 Arquivo para Whisper: ${fileName}, Extensão: ${fileExtension}`
    );
    console.log(
      `📝 Prompt configurado: ${promptContent ? `"${promptContent.substring(0, 100)}..."` : 'Nenhum'}`
    );

    // Prepare OpenAI FormData
    const openaiFormData = new FormData();
    const audioFile = new File([audioBlob], fileName, {
      type: audioType,
    });
    openaiFormData.append('file', audioFile);
    openaiFormData.append('model', openaiModel);
    openaiFormData.append('response_format', 'json');
    openaiFormData.append('language', 'pt');

    // AI dev note: Comportamento do prompt varia por modelo:
    // - whisper-1: Aceita apenas exemplos de texto/vocabulário (224 tokens max)
    // - gpt-4o-mini-transcribe/gpt-4o-transcribe: Aceita contexto descritivo
    if (promptContent && promptContent.trim() !== '') {
      console.log(`✅ Adicionando prompt ao modelo ${openaiModel}`);
      console.log(
        `📝 Tipo de prompt: ${openaiModel.includes('whisper') ? 'exemplo de texto' : 'contexto descritivo'}`
      );
      openaiFormData.append('prompt', promptContent);
    }

    // Call OpenAI API
    console.log('🚀 Iniciando chamada para OpenAI Whisper...');
    const startTime = Date.now();

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

    const duration = Date.now() - startTime;
    console.log(`⏱️ Tempo de resposta do Whisper: ${duration}ms`);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`❌ OpenAI API Error: Status ${openaiResponse.status}`);
      console.error(`❌ Detalhes do erro: ${errorText.substring(0, 500)}`);
      throw new Error(
        `OpenAI API Error: ${openaiResponse.status} - ${errorText.substring(0, 200)}`
      );
    }

    const openaiData = await openaiResponse.json();
    const transcription = openaiData.text?.trim();

    console.log(
      `📊 Resposta do Whisper recebida. Tamanho da transcrição: ${transcription?.length || 0} caracteres`
    );
    console.log(
      `📝 Primeiros 100 caracteres: ${transcription?.substring(0, 100) || '(vazio)'}`
    );

    if (!transcription) {
      console.error('❌ Transcrição vazia ou não encontrada na resposta');
      console.error(
        '📋 Resposta completa do OpenAI:',
        JSON.stringify(openaiData, null, 2)
      );
      throw new Error('Transcrição não encontrada na resposta da OpenAI');
    }

    console.log('✅ Transcrição bem-sucedida!');

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
