// AI dev note: a Ju lê conversas para a lista de espera (03/11/2026).
//
// O banco enfileira análises em lista_espera_analises (gatilho ao marcar/remarcar consulta e o tique
// fn_lista_espera_tick para pedido de agendamento urgente parado). O tique chama esta função
// (x-cron-token = Vault email_boletos_token). Aqui só entra a IA: pega as análises vencidas
// (fn_lista_espera_analises_pegar), pergunta ao modelo e devolve o JSON para
// fn_lista_espera_analise_registrar, que decide e posta o card no grupo da agenda.
// Nunca manda mensagem para família.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, 'public', any>;
// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODELOS = ['gpt-6.1-sol', 'gpt-4o-mini'];

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PREFERENCIA = `Você ajuda a recepção de uma clínica de fisioterapia infantil. Uma consulta acabou de ser marcada (ou remarcada) e abaixo está a conversa de WhatsApp com a família.
Diga se a família QUERIA OUTRO dia ou horário e ficou com este porque o que ela pediu não estava livre (a equipe disse que já tinha paciente, que não tinha vaga, ou ofereceu outro e a família aceitou por falta de opção).
Marque true só quando a família pediu de forma clara um dia ou horário diferente do que ficou marcado e esse pedido não foi atendido. Marque false quando a família escolheu livremente entre as opções, quando o horário pedido foi o marcado, quando o pedido era para um dia que já passou, ou quando a conversa não fala disso.
Responda só JSON:
{"quer_outro_horario": true|false,
 "preferencia_texto": "como a recepção anotaria, curto: 'qui 05/11 às 9h30', 'terças às 9h30', 'manhã, antes das 10h'",
 "data": "AAAA-MM-DD quando for um dia específico, senão vazio",
 "dias_semana": [números de 1=segunda a 7=domingo quando a família falou de dias da semana em geral],
 "hora_ini": "HH:MM ou vazio",
 "hora_fim": "HH:MM ou vazio (igual a hora_ini quando for um horário só; manhã = 07:00 a 12:00, tarde = 12:00 a 18:00, fim da tarde = 16:00 a 19:00)",
 "profissional": "primeiro nome da fisio que a família pediu, ou vazio",
 "mesma_fisio": true se a família quer com a mesma fisio da consulta ou não falou de fisio,
 "evidencia": "trecho curto do que a família escreveu, até 120 caracteres"}`;

const URGENTE = `Você ajuda a recepção de uma clínica de fisioterapia infantil. Um pedido de agendamento está parado há mais de 30 minutos sem consulta marcada. Leia a conversa de WhatsApp e diga se é um caso urgente.
Urgente: bebê com menos de 6 meses com sintoma respiratório, bronquiolite, asma ou chiado em crise, encaminhamento de pronto-socorro ou hospital pedindo fisioterapia logo, piora da respiração. Não urgente: asma ou rinite sem crise, rotina, acompanhamento, fisioterapia motora sem pressa.
Responda só JSON:
{"urgente": true|false, "motivo": "curto",
 "nome": "nome da criança como a família escreveu (vazio se não disseram)",
 "idade": "como a família disse, ex. '5 meses'", "idade_meses": número inteiro ou null,
 "queixa": "curta, ex. 'bronquiolite'", "pediatra": "nome ou vazio",
 "tipo": "respiratoria" ou "motora",
 "preferencia_texto": "dias e horários que a família disse que pode, curto, ou vazio",
 "data": "AAAA-MM-DD ou vazio", "dias_semana": [], "hora_ini": "HH:MM ou vazio", "hora_fim": "HH:MM ou vazio", "profissional": ""}`;

async function perguntar(chave: string, sistema: string, usuario: string) {
  let ultimoErro = '';
  for (const model of MODELOS) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
      }),
    });
    if (!r.ok) {
      ultimoErro = `${model}: HTTP ${r.status}`;
      continue;
    }
    const corpo = await r.json();
    const texto = corpo.choices?.[0]?.message?.content ?? '{}';
    return { modelo: model, resposta: JSON.parse(texto) as Json };
  }
  throw new Error(ultimoErro || 'sem resposta da IA');
}

function montarPergunta(a: Json): string {
  const partes = [`Agora: ${a.agora}`];
  if (a.consulta) {
    const c = a.consulta;
    partes.push(
      `Consulta ${a.motivo === 'remarcou' ? 'remarcada' : 'marcada'}: ${c.paciente}, ${c.servico ?? ''}, com a ${c.fisio}, ${c.quando}` +
        (c.antes ? ` (antes estava ${c.antes})` : '')
    );
  }
  if (a.pedido) partes.push(`Pedido aberto para a equipe: ${a.pedido.resumo}`);
  partes.push('Conversa (mais antiga primeiro):');
  partes.push(...(a.mensagens ?? []));
  return partes.join('\n');
}

async function processar(admin: Admin) {
  const { data: chave } = await admin
    .from('api_keys')
    .select('encrypted_key')
    .eq('service_name', 'openai')
    .eq('is_active', true)
    .maybeSingle();
  if (!chave?.encrypted_key) throw new Error('Chave da OpenAI não cadastrada');

  const { data: fila, error } = await admin.rpc(
    'fn_lista_espera_analises_pegar',
    { p_limite: 5 }
  );
  if (error) throw new Error(error.message);

  const resumo: Json[] = [];
  for (const a of (fila ?? []) as Json[]) {
    try {
      if (!(a.mensagens ?? []).length) {
        const { data } = await admin.rpc('fn_lista_espera_analise_registrar', {
          p_id: a.id,
          p_res: { sem_conversa: true },
        });
        resumo.push({ id: a.id, ...(data as Json) });
        continue;
      }
      const { modelo, resposta } = await perguntar(
        chave.encrypted_key,
        a.motivo === 'urgente' ? URGENTE : PREFERENCIA,
        montarPergunta(a)
      );
      const { data, error: e2 } = await admin.rpc(
        'fn_lista_espera_analise_registrar',
        { p_id: a.id, p_res: { ...resposta, modelo } }
      );
      if (e2) throw new Error(e2.message);
      resumo.push({ id: a.id, ...(data as Json) });
    } catch (err) {
      // a análise volta para a fila (até 3 tentativas)
      resumo.push({
        id: a.id,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return resumo;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const tokenCron = req.headers.get('x-cron-token');
  const { data: esperado } = await admin.rpc('fn_email_boletos_token');
  if (!tokenCron || !esperado || tokenCron !== esperado)
    return json({ error: 'Token inválido' }, 401);
  try {
    return json({ ok: true, analises: await processar(admin) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[lista-espera-ju]', msg);
    return json({ error: msg }, 500);
  }
});
