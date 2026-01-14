import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { OpenAI } from 'https://deno.land/x/openai@v4.24.0/mod.ts';

// AI dev note: Edge Function para histórico do paciente com IA
// Suporta contexto completo do paciente (anamnese, observações, pediatra)
// para gerar relatórios clínicos narrativos profissionais

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// AI dev note: Contexto adicional do paciente para enriquecer o relatório
interface PatientContext {
  nome?: string;
  dataNascimento?: string;
  responsavel?: string;
  pediatra?: string;
  anamnese?: string;
  observacoes?: string;
}

interface PatientHistoryRequest {
  patientId: string;
  userId: string;
  maxCharacters: number;
  patientContext?: PatientContext;
  evolutionIds?: string[]; // IDs específicos de evoluções para incluir
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
  const validRequests = requests.filter(
    (time) => now - time < RATE_LIMIT_WINDOW
  );

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(clientId, validRequests);
  return true;
}

Deno.serve(async (req: Request) => {
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
    // Parse request
    const {
      patientId,
      userId,
      maxCharacters,
      patientContext,
      evolutionIds,
    }: PatientHistoryRequest = await req.json();

    if (!patientId || !userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'patientId and userId are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // AI dev note: Permitir limite maior para relatórios clínicos completos
    const limitedMaxChars = Math.min(maxCharacters || 1500, 6000);

    // Rate limiting
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded. Maximum 5 requests per minute.',
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Required environment variables missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'
      );
    }

    // Supabase client
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
    const openaiOrgId = Deno.env.get('OPENAI_ORG_ID'); // Mantém opcional

    // Buscar prompt de histórico do banco
    const { data: promptData, error: promptError } = await supabase
      .from('ai_prompts')
      .select('prompt_content, openai_model')
      .eq('prompt_name', 'patient_history')
      .eq('is_active', true)
      .single();

    if (promptError || !promptData?.prompt_content) {
      throw new Error('Patient history prompt not found or inactive');
    }

    const historyPrompt = promptData.prompt_content;
    const openaiModel = promptData.openai_model || 'gpt-3.5-turbo';

    console.log(
      `[INFO] Starting history compilation for patient: ${patientId}`
    );

    // Buscar paciente
    const { data: patient, error: patientError } = await supabase
      .from('pessoas')
      .select('nome')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return new Response(
        JSON.stringify({ success: false, error: 'Patient not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Buscar evoluções usando query SQL direta
    const { data: evolucoes, error: evolucaoError } = await supabase.rpc(
      'get_patient_evolutions_simple',
      { patient_uuid: patientId }
    );

    // Se RPC não existir, usar query manual
    let evolutions = [];
    if (evolucaoError) {
      console.log('[INFO] RPC failed, using manual query');

      // Query manual com JOIN para pegar data da consulta
      const { data: manualEvolutions, error: manualError } = await supabase
        .from('relatorio_evolucao')
        .select(
          `
          id,
          conteudo,
          created_at,
          tipo_evolucao,
          id_agendamento,
          agendamentos!inner(
            paciente_id,
            data_hora
          )
        `
        )
        .eq('agendamentos.paciente_id', patientId)
        .order('created_at', { ascending: true });

      if (manualError) {
        throw new Error(`Failed to fetch evolutions: ${manualError.message}`);
      }

      if (manualEvolutions) {
        evolutions = manualEvolutions.map((evo) => ({
          id: evo.id,
          conteudo: evo.conteudo,
          created_at: evo.created_at,
          tipo_evolucao: evo.tipo_evolucao,
          consulta_data: evo.agendamentos?.data_hora || evo.created_at,
        }));
      }
    } else {
      evolutions = evolucoes;
    }

    // AI dev note: Filtrar por IDs específicos se fornecidos
    if (evolutionIds && evolutionIds.length > 0) {
      console.log(
        `[INFO] Filtering ${evolutions.length} evolutions to ${evolutionIds.length} selected`
      );
      evolutions = evolutions.filter((evo: { id: string }) =>
        evolutionIds.includes(evo.id)
      );
    }

    if (!evolutions || evolutions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhuma evolução encontrada para este paciente',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Preparar texto das evoluções com data e tipo
    const evolutionsText = evolutions
      .map(
        (
          evo: {
            conteudo: string;
            created_at: string;
            consulta_data?: string;
            tipo_evolucao?: string;
          },
          index: number
        ) => {
          const date = new Date(
            evo.consulta_data || evo.created_at
          ).toLocaleDateString('pt-BR');
          const tipo =
            evo.tipo_evolucao === 'respiratoria'
              ? 'Fisioterapia Respiratória'
              : evo.tipo_evolucao === 'motora_assimetria'
                ? 'Fisioterapia Motora'
                : 'Atendimento';
          return `=== EVOLUÇÃO ${index + 1} - ${date} (${tipo}) ===\n${evo.conteudo}`;
        }
      )
      .join('\n\n');

    // Limitar tamanho (aumentado para relatórios completos)
    const finalEvolutionsText =
      evolutionsText.length > 20000
        ? evolutionsText.substring(0, 20000) +
          '\n\n[... evoluções truncadas...]'
        : evolutionsText;

    // AI dev note: Construir contexto adicional do paciente para enriquecer o relatório
    let contextSection = '';
    if (patientContext) {
      const contextParts = [];

      if (patientContext.dataNascimento) {
        contextParts.push(
          `Data de Nascimento: ${patientContext.dataNascimento}`
        );
      }
      if (patientContext.responsavel) {
        contextParts.push(`Responsável: ${patientContext.responsavel}`);
      }
      if (patientContext.pediatra) {
        contextParts.push(`Pediatra acompanhante: ${patientContext.pediatra}`);
      }
      if (patientContext.anamnese) {
        contextParts.push(
          `\n=== ANAMNESE/HISTÓRICO INICIAL ===\n${patientContext.anamnese}`
        );
      }
      if (patientContext.observacoes) {
        contextParts.push(
          `\n=== OBSERVAÇÕES GERAIS ===\n${patientContext.observacoes}`
        );
      }

      if (contextParts.length > 0) {
        contextSection = `\n\nINFORMAÇÕES DO PACIENTE:\n${contextParts.join('\n')}`;
      }
    }

    // OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      organization: openaiOrgId,
    });

    console.log(
      `[INFO] Compiling history for: ${patient.nome} (${evolutions.length} evolutions, context: ${contextSection ? 'yes' : 'no'})`
    );

    const startTime = Date.now();

    // AI dev note: GPT-5.2 usa max_completion_tokens em vez de max_tokens
    const maxCompletionTokens = Math.min(
      Math.ceil(limitedMaxChars * 1.5),
      4000
    );

    const response = await openai.chat.completions.create({
      model: openaiModel,
      messages: [
        {
          role: 'system',
          content:
            'Você é um fisioterapeuta respiratório e motor pediátrico especializado com vasta experiência em análise e documentação de evolução de pacientes. Você gera relatórios clínicos profissionais e detalhados para fins de documentação médica e convênios.',
        },
        {
          role: 'user',
          content: `${historyPrompt.replace('{maxCharacters}', limitedMaxChars.toString())}\n\nPACIENTE: ${patient.nome}${contextSection}\n\n=== EVOLUÇÕES CLÍNICAS ===\n${finalEvolutionsText}`,
        },
      ],
      // Usar max_completion_tokens para GPT-5.x (max_tokens para modelos mais antigos)
      ...(openaiModel.startsWith('gpt-5')
        ? { max_completion_tokens: maxCompletionTokens }
        : { max_tokens: maxCompletionTokens }),
      temperature: 0.3,
    });

    const compiledHistory = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;

    if (!compiledHistory) {
      throw new Error('No compiled history received from OpenAI');
    }

    const finalHistory =
      compiledHistory.length > limitedMaxChars
        ? compiledHistory.substring(0, limitedMaxChars - 3) + '...'
        : compiledHistory;

    console.log(
      `[INFO] History compilation completed in ${duration}ms (${finalHistory.length} chars)`
    );

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
            console.warn(
              '[WARN] Insert failed, history not saved:',
              insertError.message
            );
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
