import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { OpenAI } from 'https://deno.land/x/openai@v4.24.0/mod.ts';

// AI dev note: Edge Function para melhoramento de texto médico usando OpenAI GPT
// Prompt especializado para fisioterapia respiratória pediátrica

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface EnhanceRequest {
  text: string;
  action: 'improve' | 'summarize' | 'medical_format';
}

interface EnhanceResponse {
  success: boolean;
  enhancedText?: string;
  error?: string;
  originalLength?: number;
  enhancedLength?: number;
}

// Rate limiting simples em memória (global)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 15; // máximo 15 melhoramentos por minuto

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
    console.log('[DEBUG] Starting enhance-text function');

    // Verificar API key diretamente de environment variables
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('[DEBUG] OpenAI API key found');

    // Parse request
    const { text, action }: EnhanceRequest = await req.json();
    console.log('[DEBUG] Request parsed:', { hasText: !!text, action });

    if (!text || !action) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'text and action are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validar ação - apenas 'improve' é suportada agora
    if (action !== 'improve') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid action. Only "improve" is supported.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Usar prompt padrão por enquanto
    const improvePrompt = `Você é um fisioterapeuta respiratório pediátrico experiente. 
Melhore o seguinte texto de evolução médica mantendo:
- Terminologia médica apropriada
- Clareza e objetividade
- Estrutura profissional
- Todas as informações clínicas importantes
- Tom profissional e técnico

Texto a melhorar:`;

    console.log('[DEBUG] Configuration loaded successfully');

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

    // Verificar tamanho do texto (limite razoável)
    if (text.length > 10000) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Text too long. Maximum length is 10,000 characters.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Inicializar OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      organization: Deno.env.get('OPENAI_ORG_ID'), // Opcional: Organization ID
    });

    console.log(`Enhancing text: action=${action}, length=${text.length}`);

    // Fazer enhancement
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Usar o modelo encontrado no banco
      messages: [
        {
          role: 'system',
          content:
            'Você é um assistente especializado em fisioterapia respiratória pediátrica com vasta experiência em documentação médica.',
        },
        {
          role: 'user',
          content: `${improvePrompt}\n\n${text}`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.3, // Baixa criatividade para manter precisão médica
    });

    const enhancedText = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;

    if (!enhancedText) {
      throw new Error('No enhanced text received from OpenAI');
    }

    console.log(`Text enhancement completed in ${duration}ms`);

    const result: EnhanceResponse = {
      success: true,
      enhancedText: enhancedText,
      originalLength: text.length,
      enhancedLength: enhancedText.length,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Text enhancement error:', error);

    const response: EnhanceResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
