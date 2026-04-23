// AI dev note: Edge Function para gerar PDF + upload no bucket + signed URL + enfileirar webhook contrato_gerado.
// Centraliza a lógica de "enviar/reenviar contrato" usada pelo admin/secretaria no PatientContractSection.
// Usa service role internamente para driblar limitações de RLS no bucket (secretaria só tem read).
// O n8n consome o webhook 'contrato_gerado' para disparar o fluxo de assinatura na Assinafy.

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

    console.log(
      '📤 [send-contract-webhook] Iniciando envio/reenvio do contrato:',
      contractId,
      'reenvio=',
      reenvio
    );

    // 1) Buscar contrato
    const { data: contract, error: contractError } = await supabase
      .from('user_contracts')
      .select(
        'id, pessoa_id, nome_contrato, status_contrato, variaveis_utilizadas, data_geracao, data_assinatura, ativo'
      )
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('❌ Contrato não encontrado:', contractError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Contrato não encontrado',
        }),
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
          error:
            'Contrato já está assinado; não é possível reenviar para assinatura.',
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pessoaId: string = contract.pessoa_id;
    const variaveis =
      (contract.variaveis_utilizadas as Record<string, string> | null) || {};
    const pacienteNome =
      variaveis.paciente ||
      contract.nome_contrato?.split(' - ')[1] ||
      'Paciente';

    // 2) Buscar responsável legal/financeiro (para preencher o payload do webhook)
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id, nome, email, telefone')
      .eq('id', pessoaId)
      .maybeSingle();

    // 3) Buscar paciente (para incluir no payload) - prioriza variáveis do contrato
    const pacienteId = variaveis.paciente_id || variaveis.pacienteId || null;
    let paciente: {
      id: string | null;
      nome: string;
      ativo: boolean | null;
      email: string | null;
      telefone: number | string | null;
    } = {
      id: pacienteId,
      nome: pacienteNome,
      ativo: null,
      email: null,
      telefone: null,
    };
    if (pacienteId) {
      const { data: pacienteRow } = await supabase
        .from('pessoas')
        .select('id, nome, ativo, email, telefone')
        .eq('id', pacienteId)
        .maybeSingle();
      if (pacienteRow) {
        paciente = {
          id: pacienteRow.id,
          nome: pacienteRow.nome,
          ativo: pacienteRow.ativo,
          email: pacienteRow.email ?? null,
          telefone: pacienteRow.telefone ?? null,
        };
      }
    }

    // 4) Gerar PDF via generate-contract-pdf
    console.log('📄 Gerando PDF...');
    const pdfResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-contract-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
        },
        body: JSON.stringify({
          contractId,
          patientName: pacienteNome,
        }),
      }
    );

    if (!pdfResponse.ok) {
      const errText = await pdfResponse.text();
      console.error('❌ Erro ao gerar PDF:', pdfResponse.status, errText);
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
    console.log('✅ PDF gerado:', pdfBytes.length, 'bytes');

    // 5) Upload no bucket (upsert permite substituir PDF não assinado)
    const pdfStoragePath = `${pessoaId}/${contractId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('respira-contracts')
      .upload(pdfStoragePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('❌ Erro ao fazer upload do PDF:', uploadError);
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
    console.log('✅ PDF enviado ao bucket:', pdfStoragePath);

    // 6) Gerar signed URL (24h)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('respira-contracts')
      .createSignedUrl(pdfStoragePath, PDF_URL_EXPIRES_IN);

    if (signedError || !signedData?.signedUrl) {
      console.error('❌ Erro ao gerar signed URL:', signedError);
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

    const signedUrl = signedData.signedUrl;
    console.log('✅ Signed URL gerada (24h)');

    // 7) Atualizar status_contrato para 'gerado' (caso estivesse 'rascunho')
    // AI dev note: NÃO sobrescrevemos arquivo_url aqui. Ele permanece 'Aguardando'
    // enquanto o contrato não foi assinado. Quando o n8n confirmar a assinatura,
    // ele atualiza arquivo_url com o caminho do bucket (que será o mesmo deste upload,
    // pois usamos x-upsert: true e o n8n substitui o PDF não assinado pelo assinado).
    if (contract.status_contrato !== 'gerado') {
      const { error: updateStatusError } = await supabase
        .from('user_contracts')
        .update({ status_contrato: 'gerado' })
        .eq('id', contractId);

      if (updateStatusError) {
        console.warn(
          '⚠️ Falha ao atualizar status_contrato (continuando):',
          updateStatusError
        );
      }
    }

    // 8) Enfileirar webhook contrato_gerado
    // AI dev note: payload segue o MESMO padrão do webhook `appointment_updated`
    // (gerado por trigger no banco): tudo encapsulado em `data`, com `tipo`,
    // `timestamp` e `webhook_id` no mesmo nível das demais entidades dentro de `data`.
    // Não inclua nenhum campo específico de provedor de assinatura (Assinafy etc.) —
    // o n8n é responsável por orquestrar o provedor.
    const timestamp = new Date().toISOString();
    const webhookId = crypto.randomUUID();
    const { error: queueError } = await supabase.from('webhook_queue').insert({
      evento: 'contrato_gerado',
      payload: {
        data: {
          id: contractId,
          ativo: contract.ativo ?? true,
          nome_contrato: contract.nome_contrato,
          status_contrato: 'gerado',
          data_geracao: contract.data_geracao,
          data_assinatura: contract.data_assinatura,
          paciente,
          responsavel_legal: {
            id: pessoa?.id ?? pessoaId,
            nome: pessoa?.nome ?? '',
            email: pessoa?.email ?? null,
            telefone: pessoa?.telefone ?? null,
          },
          responsavel_financeiro: {
            id: pessoa?.id ?? pessoaId,
            nome: pessoa?.nome ?? '',
          },
          pdf: {
            signed_url: signedUrl,
            expires_in_seconds: PDF_URL_EXPIRES_IN,
            storage_path: pdfStoragePath,
          },
          reenvio,
          tipo: 'contrato_gerado',
          timestamp,
          webhook_id: webhookId,
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });

    if (queueError) {
      console.error(
        '❌ Erro ao enfileirar webhook contrato_gerado:',
        queueError
      );
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

    console.log('✅ Webhook contrato_gerado enfileirado para o n8n');

    return new Response(
      JSON.stringify({
        success: true,
        contractId,
        pdfStoragePath,
        signedUrl,
        expiresInSeconds: PDF_URL_EXPIRES_IN,
        reenvio,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Erro fatal em send-contract-webhook:', error);
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
