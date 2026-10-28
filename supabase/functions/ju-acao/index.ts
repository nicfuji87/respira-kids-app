// AI dev note: ações da Ju (n8n "RK Ju - Ações"), uma chamada por ação.
// Só aceita a service_role. Cada ação passa primeiro pela RPC do banco, que
// confere escopo do telefone, versão do turno e limites (ju_acoes); só então
// chama o serviço externo e registra o resultado. Devolve:
//   { ok, resultado }               texto para o agente repassar à família
//   { ok:false, escalar:{tipo,resumo}, resultado }  o n8n chama a secretaria
//   { ok:false, parar:true }         a conversa mudou (cliente escreveu de novo
//                                    ou humano assumiu): o agente não insiste
// Ações: REENVIAR_CONTRATO, CORRIGIR_CONTATO_CONTRATO, EMITIR_NOTA, RENOVAR_LINK,
// GERAR_ATESTADO, SUSPENDER_COBRANCA.
// GERAR_ATESTADO devolve também { documento: { url, nome, legenda } }: o n8n
// manda o PDF como arquivo na conversa (a família não recebe link).
// 22/10/2026: o contrato chega só pelo WhatsApp da Assinafy (o fluxo n8n usa
// notification_methods ["Whatsapp"]); os textos não falam mais em e-mail.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GATE = [
  'MENSAGEM_NOVA',
  'PAUSADA',
  'AGUARDANDO_EQUIPE',
  'CONVERSA_INEXISTENTE',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST')
    return json({ ok: false, resultado: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (
    !serviceKey ||
    req.headers.get('Authorization') !== `Bearer ${serviceKey}`
  ) {
    return json({ ok: false, resultado: 'Não autorizado' }, 401);
  }
  const supabase = createClient(url, serviceKey);
  const b = await req.json().catch(() => ({}));
  const conversa = Number(b.conversa_id);
  const versao = Number(b.versao);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const funcao = async (nome: string, corpo: unknown) => {
    try {
      const res = await fetch(`${url}/functions/v1/${nome}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(90000),
      });
      return await res
        .json()
        .catch(() => ({ success: false, error: `HTTP ${res.status}` }));
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };
  const parar = (motivo: string) =>
    json({
      ok: false,
      parar: true,
      resultado: `Não execute: a conversa mudou (${motivo}). Não responda nada sobre isso agora.`,
    });
  const escalar = (tipo: string, resumo: string, resultado: string) =>
    json({ ok: false, escalar: { tipo, resumo }, resultado });

  try {
    switch (String(b.acao)) {
      case 'REENVIAR_CONTRATO': {
        const r = await rpc('fn_ju_contrato_reenviar', {
          p_conversa_id: conversa,
          p_versao: versao,
          p_paciente_id: b.paciente_id,
        });
        if (!r?.ok) {
          if (GATE.includes(r?.motivo)) return parar(r.motivo);
          if (r?.motivo === 'JA_ASSINADO')
            return json({
              ok: true,
              resultado:
                'O contrato deste paciente já consta como assinado. Tranquilize a família: aviso que tenha chegado pode desconsiderar.',
            });
          if (
            r?.motivo === 'REENVIADO_HA_POUCO' ||
            r?.motivo === 'JA_SOLICITADO'
          )
            return json({
              ok: true,
              resultado:
                'O contrato já foi reenviado há pouco. Oriente a procurar a mensagem da Assinafy no WhatsApp (número próprio dela, não o da clínica).',
            });
          return escalar(
            'CONTRATO',
            `Não foi possível reenviar o contrato (${r?.motivo ?? 'sem motivo'}).`,
            'Não foi possível reenviar o contrato. A secretaria foi chamada; avise a família que ela vai verificar.'
          );
        }
        const e = await funcao('send-contract-webhook', {
          contractId: r.contrato_id,
          reenvio: true,
        });
        await rpc('fn_ju_acao_resultado', {
          p_acao_id: r.acao_id,
          p_ok: e?.success === true,
          p_detalhe: e?.success ? null : String(e?.error ?? 'falha'),
        });
        if (e?.success === true)
          return json({
            ok: true,
            resultado:
              'Pedido de reenvio feito. Em alguns minutos chega uma mensagem da Assinafy no WhatsApp, de um número próprio dela (não é o da clínica). Não diga que já chegou.',
          });
        return escalar(
          'CONTRATO',
          `A Ju tentou reenviar o contrato e falhou: ${e?.error ?? 'sem detalhe'}.`,
          'O reenvio falhou. A secretaria foi chamada; avise a família que ela vai reenviar.'
        );
      }

      case 'CORRIGIR_CONTATO_CONTRATO': {
        // A família confirmou que o e-mail e/ou o WhatsApp do contrato está errado
        // e passou o certo. O banco confere se quem conversa é quem assina, grava
        // no contrato (e o e-mail na ficha) e só então reenviamos.
        const r = await rpc('fn_ju_contrato_corrigir_contato', {
          p_conversa_id: conversa,
          p_versao: versao,
          p_paciente_id: b.paciente_id,
          p_email: b.email ?? null,
          p_whatsapp: b.whatsapp ?? null,
        });
        if (!r?.ok) {
          if (GATE.includes(r?.motivo)) return parar(r.motivo);
          const recado: Record<string, string> = {
            JA_ASSINADO:
              'O contrato deste paciente já consta como assinado. Tranquilize a família.',
            EMAIL_INVALIDO:
              'Esse e-mail não parece válido. Peça para a família conferir e escrever de novo.',
            WHATSAPP_INVALIDO:
              'Esse número não parece um celular válido. Peça o WhatsApp com DDD.',
            DADOS_IGUAIS:
              'Esses já são os dados do contrato. Se a família confirma que estão certos, use reenviar_contrato.',
            NADA_PARA_CORRIGIR:
              'Nenhum dado novo foi informado. Peça o e-mail ou o WhatsApp certo.',
          };
          if (recado[r?.motivo])
            return json({ ok: false, resultado: recado[r.motivo] });
          return escalar(
            'CONTRATO',
            r?.motivo === 'SIGNATARIO_OUTRA_PESSOA'
              ? 'A família quer corrigir o contato do contrato, mas quem conversa não é quem assina. Conferir com ela quem deve assinar e os dados.'
              : `Não foi possível corrigir o contato do contrato (${r?.motivo ?? 'sem motivo'}).`,
            'Não consegui corrigir por aqui. A secretaria foi chamada; avise a família que ela vai ajustar o contrato.'
          );
        }
        const e = await funcao('send-contract-webhook', {
          contractId: r.contrato_id,
          reenvio: true,
        });
        await rpc('fn_ju_contrato_contato_resultado', {
          p_acao_id: r.acao_id,
          p_ok: e?.success === true,
          p_detalhe: e?.success ? null : String(e?.error ?? 'falha'),
        });
        if (e?.success === true)
          return json({
            ok: true,
            resultado: `Dados corrigidos (${r.detalhe}) e contrato reenviado. Em alguns minutos chega uma mensagem da Assinafy no WhatsApp${r.whatsapp_final ? ` com final ${r.whatsapp_final}` : ''}, de um número próprio dela (não é o da clínica). Não diga que já chegou.`,
          });
        return escalar(
          'CONTRATO',
          `A Ju corrigiu o contato do contrato (${r.detalhe}), mas o reenvio falhou: ${e?.error ?? 'sem detalhe'}.`,
          'Os dados foram corrigidos, mas o reenvio falhou. A secretaria foi chamada; avise a família que ela vai reenviar.'
        );
      }

      case 'EMITIR_NOTA': {
        const r = await rpc('fn_ju_nf_emitir', {
          p_conversa_id: conversa,
          p_versao: versao,
          p_fatura_id: b.fatura_id,
        });
        if (!r?.ok) {
          if (GATE.includes(r?.motivo)) return parar(r.motivo);
          if (r?.motivo === 'NOTA_PROCESSANDO')
            return json({
              ok: true,
              resultado:
                'Essa nota já está sendo emitida e chega por aqui quando a prefeitura autorizar.',
            });
          if (r?.motivo === 'NOTA_EMITIDA')
            return json({
              ok: true,
              resultado:
                'Essa nota já foi emitida: envie o link_nota dela que está nos dados.',
            });
          return escalar(
            'NOTA_FISCAL',
            `A Ju não pôde pedir a emissão da nota (${r?.motivo ?? 'sem motivo'}).`,
            'Não foi possível pedir a emissão. A secretaria foi chamada; avise a família que ela vai verificar a nota.'
          );
        }
        const e = await funcao('nfe-emitir-fatura', { faturaId: b.fatura_id });
        const deu = e?.success === true || e?.jaEmitida === true;
        await rpc('fn_ju_acao_resultado', {
          p_acao_id: r.acao_id,
          p_ok: deu,
          p_detalhe: deu ? null : String(e?.error ?? 'falha'),
        });
        if (e?.success === true)
          return json({
            ok: true,
            resultado:
              'Emissão pedida. A nota chega por aqui assim que a prefeitura autorizar; não prometa prazo.',
          });
        if (e?.jaEmitida === true)
          return json({
            ok: true,
            resultado:
              'A nota já tinha sido emitida e está terminando de sincronizar; chega por aqui em breve.',
          });
        return escalar(
          'NOTA_FISCAL',
          `A Ju pediu a emissão da nota e voltou erro: ${e?.error ?? 'sem detalhe'}.`,
          'A emissão deu erro. A secretaria foi chamada; avise a família que ela vai resolver.'
        );
      }

      case 'RENOVAR_LINK': {
        const r = await rpc('fn_ju_renovar_link_pagamento', {
          p_conversa_id: conversa,
          p_versao: versao,
          p_pagamento_link_id: b.pagamento_link_id,
        });
        if (r?.ok)
          return json({
            ok: true,
            link: r.link,
            resultado: `Link renovado, válido até ${r.valido_ate}, mesmo valor (${r.valor}). Envie exatamente este link: ${r.link}`,
          });
        if (GATE.includes(r?.motivo)) return parar(r.motivo);
        return escalar(
          'FINANCEIRO',
          `Link de pagamento vencido que não pôde ser renovado (${r?.motivo ?? 'sem motivo'}).`,
          'O link não pôde ser renovado. A secretaria foi chamada; avise a família que ela vai mandar o link.'
        );
      }

      case 'GERAR_ATESTADO': {
        const r = await funcao('ju-atestado-pdf', {
          conversa_id: conversa,
          versao,
          agendamento_id: b.agendamento_id,
          responsavel_id: b.responsavel_id,
        });
        // O n8n (RK Ju - Ações) envia o PDF como arquivo e só depois devolve o
        // resultado para a Ju; a IA nunca recebe o link.
        if (r?.ok && (r?.arquivo_url || r?.link))
          return json({
            ok: true,
            documento: {
              url: r.arquivo_url ?? r.link,
              nome: r.doc_nome ?? 'Atestado_RK.pdf',
              legenda: `Atestado de comparecimento (${r.data_consulta})`,
            },
            resultado: `Atestado gerado (${r.data_consulta}, acompanhante ${r.responsavel_nome}).`,
          });
        if (GATE.includes(r?.motivo)) return parar(r.motivo);
        return escalar(
          'OUTRO',
          `Atestado de comparecimento não gerado (${r?.motivo ?? r?.erro ?? 'sem detalhe'}).`,
          'Não foi possível gerar o atestado. A secretaria foi chamada; avise a família que ela vai preparar.'
        );
      }

      case 'SUSPENDER_COBRANCA': {
        // A família diz que já pagou (ou contesta). A Ju NÃO confirma pagamento:
        // só pausa os lembretes automáticos e o Financeiro confere. O próprio
        // banco avisa o grupo de Notificações; não precisa escalar de novo.
        const r = await rpc('fn_ju_cobranca_suspender', {
          p_conversa_id: conversa,
          p_versao: versao,
          p_paciente_id: b.paciente_id,
          p_motivo: b.motivo ?? 'pagamento_informado',
          p_detalhe:
            typeof b.detalhe === 'string' ? b.detalhe.slice(0, 500) : null,
        });
        if (r?.ok && Number(r.pausadas) > 0)
          return json({
            ok: true,
            resultado:
              'Os lembretes automáticos de cobrança deste paciente foram pausados e o financeiro vai conferir. Diga à família que a equipe vai conferir o pagamento e retorna. Não confirme que o pagamento foi recebido.',
          });
        if (r?.ok)
          return json({
            ok: true,
            resultado:
              'Não há cobrança em aberto no sistema para este paciente. Pode tranquilizar a família: não há pendência registrada.',
          });
        if (GATE.includes(r?.motivo)) return parar(r.motivo);
        if (r?.motivo === 'JA_SOLICITADO')
          return json({
            ok: true,
            resultado:
              'A cobrança já foi pausada para conferência. Diga que a equipe está conferindo e retorna.',
          });
        return escalar(
          'FINANCEIRO',
          `A família informou pagamento e a Ju não conseguiu pausar a cobrança (${r?.motivo ?? 'sem motivo'}).`,
          'Não consegui registrar isso agora. A secretaria foi chamada; avise a família que ela vai conferir o pagamento.'
        );
      }

      default:
        return json(
          { ok: false, resultado: `Ação desconhecida: ${b.acao}` },
          400
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return escalar(
      'OUTRO',
      `Erro ao executar ${b.acao}: ${msg}`.slice(0, 500),
      'Deu um problema ao executar. A secretaria foi chamada; avise a família que ela vai verificar.'
    );
  }
});
