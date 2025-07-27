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

// Prompts especializados para cada ação
const PROMPTS = {
  improve: `Você é um assistente especializado em fisioterapia respiratória pediátrica. 
Melhore o seguinte texto de evolução médica mantendo:
- Terminologia médica apropriada
- Clareza e objetividade
- Estrutura profissional
- Todas as informações clínicas importantes
- Tom profissional e técnico

Texto a melhorar:`,

  summarize: `Você é um assistente especializado em fisioterapia respiratória pediátrica.
Crie um resumo conciso do seguinte texto de evolução médica mantendo:
- Informações clínicas essenciais
- Terminologia médica precisa
- Estrutura clara e objetiva
- Principais intervenções e resultados

Texto a resumir:`,

  medical_format: `Você é um assistente especializado em fisioterapia respiratória pediátrica.
Formate o seguinte texto seguindo padrões médicos profissionais:
- Use terminologia técnica apropriada
- Organize em seções lógicas (quando aplicável)
- Mantenha objetividade científica
- Use formatação médica padrão
- Preserve todas as informações clínicas

Texto a formatar:`,
};

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

    // Buscar prompt de melhoria de evolução do banco
    const { data: promptData, error: promptError } = await supabase
      .from('ai_prompts')
      .select('prompt_content, openai_model')
      .eq('prompt_name', 'evolution_improve')
      .eq('is_active', true)
      .single();

    if (promptError || !promptData?.prompt_content) {
      throw new Error('Evolution improve prompt not found or inactive');
    }

    const improvePrompt = promptData.prompt_content;
    const openaiModel = promptData.openai_model || 'gpt-3.5-turbo';

    // Parse request
    const { text, action }: EnhanceRequest = await req.json();

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

    if (!PROMPTS[action]) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid action. Use: improve, summarize, or medical_format',
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
      model: openaiModel, // Usar o modelo encontrado no banco
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
