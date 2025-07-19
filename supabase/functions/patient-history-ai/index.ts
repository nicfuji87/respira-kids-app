import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { OpenAI } from 'https://deno.land/x/openai@v4.24.0/mod.ts';

// AI dev note: Edge Function para geração de histórico compilado de evoluções do paciente
// Prompt especializado para análise e síntese de múltiplas evoluções em fisioterapia respiratória pediátrica

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PatientHistoryRequest {
  patientName: string;
  evolutions: string[];
  patientId: string;
}

interface PatientHistoryResponse {
  success: boolean;
  compiledHistory?: string;
  error?: string;
  evolutionsCount?: number;
  historyLength?: number;
}

// Rate limiting simples em memória (global)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 10; // máximo 10 compilações por minuto

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

// Prompt especializado para compilação de histórico
const HISTORY_COMPILATION_PROMPT = `Você é um fisioterapeuta respiratório pediátrico experiente. 
Compile as seguintes evoluções em um histórico abrangente e estruturado do paciente.

INSTRUÇÕES:
- Organize cronologicamente quando possível
- Identifique padrões de progresso ou regressão
- Destaque marcos importantes no tratamento
- Sintetize objetivos alcançados e pendentes
- Use terminologia técnica apropriada
- Mantenha formato profissional e objetivo
- Inclua recomendações baseadas na evolução observada

ESTRUTURA SUGERIDA:
1. Resumo da condição inicial
2. Principais intervenções realizadas
3. Evolução e progressos observados
4. Desafios e intercorrências
5. Status atual e recomendações

Evoluções a compilar:`;

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
    // Verificar API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Parse request
    const { patientName, evolutions, patientId }: PatientHistoryRequest =
      await req.json();

    if (
      !patientName ||
      !evolutions ||
      !Array.isArray(evolutions) ||
      evolutions.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'patientName and evolutions array are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting baseado no IP + patient ID
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const clientId = `${clientIp}-${patientId}`;

    if (!checkRateLimit(clientId)) {
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

    // Concatenar evoluções com separadores
    const evolutionsText = evolutions
      .map((evolution, index) => `=== EVOLUÇÃO ${index + 1} ===\n${evolution}`)
      .join('\n\n');

    // Verificar tamanho total (limite razoável)
    if (evolutionsText.length > 15000) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Combined evolutions too long. Maximum length is 15,000 characters.',
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

    console.log(
      `Compiling patient history: patient=${patientName}, evolutions=${evolutions.length}`
    );

    // Fazer compilação
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'Você é um fisioterapeuta respiratório pediátrico especializado com vasta experiência em análise de evolução de pacientes.',
        },
        {
          role: 'user',
          content: `${HISTORY_COMPILATION_PROMPT}\n\nPACIENTE: ${patientName}\n\n${evolutionsText}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.2, // Baixa criatividade para manter precisão e objetividade
    });

    const compiledHistory = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;

    if (!compiledHistory) {
      throw new Error('No compiled history received from OpenAI');
    }

    console.log(`Patient history compilation completed in ${duration}ms`);

    const result: PatientHistoryResponse = {
      success: true,
      compiledHistory: compiledHistory,
      evolutionsCount: evolutions.length,
      historyLength: compiledHistory.length,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Patient history compilation error:', error);

    const response: PatientHistoryResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
