import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// AI dev note: Edge Function para validação de WhatsApp
// Envia webhook DIRETAMENTE (sem fila) para resposta imediata

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// URL do webhook para envio do código
const WEBHOOK_URL =
  'https://webhooks-i.infusecomunicacao.online/webhook/webhookRK2';

interface SendCodeRequest {
  action: 'send_code' | 'validate_code';
  whatsappJid: string;
  code?: string;
}

// Gerar código de 6 dígitos
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash simples para o código (SHA-256 seria melhor em produção)
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SendCodeRequest = await req.json();
    const { action, whatsappJid, code: userCode } = body;

    console.log(
      `📱 [validate-whatsapp-code] Action: ${action}, JID: ${whatsappJid}`
    );

    // Extrair número do JID (remover @s.whatsapp.net se presente)
    const phoneNumber = whatsappJid.replace('@s.whatsapp.net', '');

    if (action === 'send_code') {
      // ========== ENVIAR CÓDIGO ==========

      // 1. Gerar código
      const code = generateCode();
      const codeHash = await hashCode(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

      console.log(`🔢 [validate-whatsapp-code] Código gerado: ${code}`);

      // 2. Salvar no banco (opcional - para validação posterior)
      // AI dev note: phone_number é bigint no banco, inserir como número
      const { error: insertError } = await supabase
        .from('whatsapp_validation_attempts')
        .insert({
          phone_number: parseInt(phoneNumber, 10),
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
          validated: false,
          webhook_sent: true,
          webhook_id: crypto.randomUUID(),
        });

      if (insertError) {
        console.error('❌ Erro ao salvar validação:', insertError);
        // Continuar mesmo com erro - prioridade é enviar o código
      }

      // 3. ENVIAR WEBHOOK DIRETAMENTE (sem fila!)
      const webhookPayload = {
        tipo: 'validar_whatsapp',
        timestamp: new Date().toISOString(),
        data: {
          whatsapp: phoneNumber,
          codigo: code,
          created_at: new Date().toISOString(),
        },
        webhook_id: crypto.randomUUID(),
      };

      console.log(
        `📤 [validate-whatsapp-code] Enviando webhook para ${WEBHOOK_URL}`
      );

      try {
        const webhookResponse = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Source': 'RespiraKids-EHR',
            'User-Agent': 'RespiraKids-Webhook/1.0',
          },
          body: JSON.stringify(webhookPayload),
        });

        if (!webhookResponse.ok) {
          console.error(`❌ Webhook falhou: ${webhookResponse.status}`);
          // Tentar inserir na fila como fallback
          await supabase.from('webhook_queue').insert({
            evento: 'validar_whatsapp',
            payload: webhookPayload,
            status: 'pendente',
            tentativas: 0,
            max_tentativas: 3,
            proximo_retry: new Date().toISOString(),
          });
        } else {
          console.log(
            `✅ [validate-whatsapp-code] Webhook enviado com sucesso!`
          );
        }
      } catch (webhookError) {
        console.error('❌ Erro ao enviar webhook:', webhookError);
        // Fallback: inserir na fila
        await supabase.from('webhook_queue').insert({
          evento: 'validar_whatsapp',
          payload: webhookPayload,
          status: 'pendente',
          tentativas: 0,
          max_tentativas: 3,
          proximo_retry: new Date().toISOString(),
        });
      }

      // 4. Retornar sucesso
      return new Response(
        JSON.stringify({
          success: true,
          action: 'code_sent',
          expiresAt,
          debug_code: code, // TODO: Remover em produção!
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (action === 'validate_code' && userCode) {
      // ========== VALIDAR CÓDIGO ==========

      const userCodeHash = await hashCode(userCode);

      // Buscar validação mais recente para este número
      // AI dev note: phone_number é bigint no banco
      const { data: validation, error: selectError } = await supabase
        .from('whatsapp_validation_attempts')
        .select('*')
        .eq('phone_number', parseInt(phoneNumber, 10))
        .eq('validated', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (selectError || !validation) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Código expirado ou não encontrado. Solicite um novo código.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Verificar tentativas
      if (validation.attempts >= 3) {
        return new Response(
          JSON.stringify({
            success: false,
            action: 'blocked',
            error:
              'Número bloqueado por excesso de tentativas. Aguarde 15 minutos.',
            blocked: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Verificar código
      if (validation.code_hash === userCodeHash) {
        // Código correto!
        await supabase
          .from('whatsapp_validation_attempts')
          .update({
            validated: true,
            validated_at: new Date().toISOString(),
          })
          .eq('id', validation.id);

        return new Response(
          JSON.stringify({
            success: true,
            action: 'code_validated',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } else {
        // Código incorreto
        const newAttempts = validation.attempts + 1;
        await supabase
          .from('whatsapp_validation_attempts')
          .update({ attempts: newAttempts })
          .eq('id', validation.id);

        const attemptsRemaining = 3 - newAttempts;

        return new Response(
          JSON.stringify({
            success: false,
            error: `Código incorreto. ${attemptsRemaining} tentativas restantes.`,
            attemptsRemaining,
            blocked: attemptsRemaining <= 0,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Ação inválida',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ [validate-whatsapp-code] Erro:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Erro interno do servidor',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
