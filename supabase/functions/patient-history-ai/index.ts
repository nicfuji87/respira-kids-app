import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { OpenAI } from 'https://deno.land/x/openai@v4.24.0/mod.ts';

// AI dev note: Edge Function FINAL para histórico do paciente com IA
// Query simplificada + OpenAI + salvamento no banco

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PatientHistoryRequest {
  patientId: string;
  userId: string;
  maxCharacters: number;
}

interface PatientHistoryResponse {
  success: boolean;
  history?: string;
  error?: string;
  evolutionsCount?: number;
  historyLength?: number;
}

// Rate limiting
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(clientId) || [];
  const validRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(clientId, validRequests);
  return true;
}

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
- LIMITE: máximo {maxCharacters} caracteres no resultado final

ESTRUTURA SUGERIDA:
1. Resumo da condição inicial
2. Principais intervenções realizadas
3. Evolução e progressos observados
4. Desafios e intercorrências
5. Status atual e recomendações

Evoluções a compilar:`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse request
    const { patientId, userId, maxCharacters }: PatientHistoryRequest = await req.json();

    if (!patientId || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'patientId and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const limitedMaxChars = Math.min(maxCharacters || 1500, 1500);

    // Rate limiting
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded. Maximum 5 requests per minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Environment variables
    const openaiApiKey = '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';
    const openaiOrgId = 'org-KpJ3rIctHdoHymRichWwsJtS';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    // Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[INFO] Starting history compilation for patient: ${patientId}`);

    // Buscar paciente
    const { data: patient, error: patientError } = await supabase
      .from('pessoas')
      .select('nome')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return new Response(
        JSON.stringify({ success: false, error: 'Patient not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar evoluções usando query SQL direta
    const { data: evolucoes, error: evolucaoError } = await supabase
      .rpc('get_patient_evolutions_simple', { patient_uuid: patientId });

    // Se RPC não existir, usar query manual
    let evolutions = [];
    if (evolucaoError) {
      console.log('[INFO] RPC failed, using manual query');
      
      // Query manual simplificada
      const { data: manualEvolutions, error: manualError } = await supabase
        .from('relatorio_evolucao')
        .select(`
          conteudo,
          created_at,
          id_agendamento
        `)
        .order('created_at', { ascending: true });

      if (manualError) {
        throw new Error(`Failed to fetch evolutions: ${manualError.message}`);
      }

      // Filtrar evoluções pelo paciente (verificar via agendamento)
      if (manualEvolutions) {
        for (const evo of manualEvolutions) {
          const { data: agendamento } = await supabase
            .from('agendamentos')
            .select('paciente_id')
            .eq('id', evo.id_agendamento)
            .eq('paciente_id', patientId)
            .single();
          
          if (agendamento) {
            evolutions.push({
              conteudo: evo.conteudo,
              created_at: evo.created_at
            });
          }
        }
      }
    } else {
      evolutions = evolucoes;
    }

    if (!evolutions || evolutions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhuma evolução encontrada para este paciente' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Preparar texto das evoluções
    const evolutionsText = evolutions
      .map((evo, index) => {
        const date = new Date(evo.created_at).toLocaleDateString('pt-BR');
        return `=== EVOLUÇÃO ${index + 1} (${date}) ===\n${evo.conteudo}`;
      })
      .join('\n\n');

    // Limitar tamanho
    const finalEvolutionsText = evolutionsText.length > 12000 
      ? evolutionsText.substring(0, 12000) + '\n\n[... evoluções truncadas...]'
      : evolutionsText;

    // OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      organization: openaiOrgId,
    });

    console.log(`[INFO] Compiling history for: ${patient.nome} (${evolutions.length} evolutions)`);

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Você é um fisioterapeuta respiratório pediátrico especializado com vasta experiência em análise de evolução de pacientes.',
        },
        {
          role: 'user',
          content: `${HISTORY_COMPILATION_PROMPT.replace('{maxCharacters}', limitedMaxChars.toString())}\n\nPACIENTE: ${patient.nome}\n\n${finalEvolutionsText}`,
        },
      ],
      max_tokens: Math.min(Math.ceil(limitedMaxChars * 1.3), 2000),
      temperature: 0.2,
    });

    const compiledHistory = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;

    if (!compiledHistory) {
      throw new Error('No compiled history received from OpenAI');
    }

    const finalHistory = compiledHistory.length > limitedMaxChars 
      ? compiledHistory.substring(0, limitedMaxChars - 3) + '...'
      : compiledHistory;

    console.log(`[INFO] History compilation completed in ${duration}ms (${finalHistory.length} chars)`);

    // Salvar histórico (simplificado)
    try {
      const { data: tipoRelatorio } = await supabase
        .from('relatorios_tipo')
        .select('id')
        .eq('codigo', 'historico_evolucao')
        .single();

      if (tipoRelatorio) {
        const { data: agendamento } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('paciente_id', patientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (agendamento) {
          // Tentar INSERT primeiro
          const { error: insertError } = await supabase
            .from('relatorio_evolucao')
            .insert({
              id_agendamento: agendamento.id,
              tipo_relatorio_id: tipoRelatorio.id,
              conteudo: finalHistory,
              transcricao: true,
              criado_por: userId,
              atualizado_por: userId,
            });

          if (insertError) {
            console.warn('[WARN] Insert failed, history not saved:', insertError.message);
          } else {
            console.log('[INFO] History saved successfully');
          }
        }
      }
    } catch (saveError) {
      console.warn('[WARN] Error saving history:', saveError);
    }

    const result: PatientHistoryResponse = {
      success: true,
      history: finalHistory,
      evolutionsCount: evolutions.length,
      historyLength: finalHistory.length,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ERROR] Patient history compilation error:', error);

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
