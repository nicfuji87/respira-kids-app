// AI dev note: Gera o PDF do Termo de Estágio + upload no bucket + signed URL +
// enfileira o webhook 'contrato_estagio_gerado' (novo evento, paralelo ao
// 'contrato_gerado' dos pacientes — NÃO reaproveitar para não misturar os fluxos).
// O n8n consome esse evento e envia à Assinafy com o ESTAGIÁRIO como signatário.
// Espelha send-contract-webhook, mas o signatário/dados vêm de candidaturas_estagio.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PDF_URL_EXPIRES_IN = 60 * 60 * 24; // 24 horas

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const contractId: string | undefined = body?.contractId;
    const reenvio: boolean = Boolean(body?.reenvio);

    if (!contractId) {
      return new Response(
        JSON.stringify({ success: false, error: 'contractId é obrigatório' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1) Contrato de estágio
    const { data: contract, error: contractError } = await supabase
      .from('estagio_contratos')
      .select(
        'id, candidatura_id, nome_contrato, status_contrato, variaveis_utilizadas, data_geracao, data_assinatura, ativo'
      )
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return new Response(
        JSON.stringify({ success: false, error: 'Contrato não encontrado' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (contract.status_contrato === 'assinado') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contrato já está assinado; não é possível reenviar.',
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const variaveis =
      (contract.variaveis_utilizadas as Record<string, string> | null) || {};

    // 2) Signatário = estagiário (dados da candidatura são a fonte de verdade)
    const { data: candidatura } = await supabase
      .from('candidaturas_estagio')
      .select('id, nome, email, telefone, whatsapp_jid, cpf')
      .eq('id', contract.candidatura_id)
      .maybeSingle();

    const estagiario = {
      id: candidatura?.id ?? contract.candidatura_id,
      nome: candidatura?.nome || variaveis.estagiarioNome || '',
      email: candidatura?.email || variaveis.estagiarioEmail || null,
      telefone:
        candidatura?.whatsapp_jid ||
        candidatura?.telefone ||
        variaveis.estagiarioTelefone ||
        null,
      cpf: candidatura?.cpf || variaveis.estagiarioCpf || null,
    };

    // Guard: sem e-mail do signatário não enviamos (Assinafy atribuiria errado).
    if (!estagiario.email) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Estagiário sem e-mail. Cadastre o e-mail antes de enviar o contrato para assinatura.',
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3) Gerar PDF
    const pdfResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-estagio-contract-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
        },
        body: JSON.stringify({ contractId, estagiarioNome: estagiario.nome }),
      }
    );

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha ao gerar PDF: ${pdfResponse.status}`,
          details: errText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

    // 4) Upload no bucket (mesma bucket dos contratos, sob prefixo estagio/)
    const pdfStoragePath = `estagio/${contract.candidatura_id}/${contractId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('respira-contracts')
      .upload(pdfStoragePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha no upload do PDF: ${uploadError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 5) Signed URL (24h)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('respira-contracts')
      .createSignedUrl(pdfStoragePath, PDF_URL_EXPIRES_IN);

    if (signedError || !signedData?.signedUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha ao gerar signed URL: ${signedError?.message || 'sem URL'}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 6) status -> 'gerado' + carimba data_geracao
    if (contract.status_contrato !== 'gerado') {
      const { error: updErr } = await supabase
        .from('estagio_contratos')
        .update({
          status_contrato: 'gerado',
          data_geracao: contract.data_geracao ?? new Date().toISOString(),
        })
        .eq('id', contractId);
      if (updErr)
        console.warn('⚠️ Falha ao atualizar status (continuando):', updErr);
    }

    // 7) Enfileirar webhook contrato_estagio_gerado
    const timestamp = new Date().toISOString();
    const webhookId = crypto.randomUUID();
    const { error: queueError } = await supabase.from('webhook_queue').insert({
      evento: 'contrato_estagio_gerado',
      payload: {
        data: {
          id: contractId,
          ativo: contract.ativo ?? true,
          nome_contrato: contract.nome_contrato,
          status_contrato: 'gerado',
          data_geracao: contract.data_geracao,
          data_assinatura: contract.data_assinatura,
          candidatura_id: contract.candidatura_id,
          estagiario,
          signatario: estagiario,
          pdf: {
            signed_url: signedData.signedUrl,
            expires_in_seconds: PDF_URL_EXPIRES_IN,
            storage_path: pdfStoragePath,
          },
          reenvio,
          tipo: 'contrato_estagio_gerado',
          timestamp,
          webhook_id: webhookId,
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });

    if (queueError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha ao enfileirar webhook: ${queueError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        contractId,
        pdfStoragePath,
        signedUrl: signedData.signedUrl,
        expiresInSeconds: PDF_URL_EXPIRES_IN,
        reenvio,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro fatal em send-estagio-contract-webhook:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
