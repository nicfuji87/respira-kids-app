// AI dev note: a família confirmou um horário que a equipe ofereceu? (07/11/2026)
// Chamada pelo cron ju-escolhas (fn_ju_escolhas_tick), x-cron-token = Vault email_boletos_token.
// A IA só EXTRAI a oferta da equipe e a escolha da família; quem decide e marca é o banco
// (fn_ju_escolha_aplicar), com regras fixas e conferência do texto. Nunca manda mensagem daqui.
// 09/11/2026 (caso Pedro): a IA diz se a oferta substitui uma consulta já marcada ("substitui"); aí o banco remarca
// essa consulta em vez de criar outra.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// deno-lint-ignore no-explicit-any
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MODELOS = ['gpt-6.1-sol', 'gpt-4o-mini'];

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const SISTEMA = `Você ajuda a recepção de uma clínica de fisioterapia infantil. Abaixo está a conversa de WhatsApp (mais antiga primeiro). FAMILIA é a família; EQUIPE é a secretária ou uma fisioterapeuta escrevendo à mão (mensagens "Áudio:" são áudios transcritos); JU é a assistente virtual; SISTEMA são mensagens automáticas.
A última mensagem da família está marcada com [ULTIMA DA FAMILIA]. Diga se, nessa resposta (ou nas mensagens da família logo antes dela, depois da oferta), a família ESCOLHEU com certeza um dos horários que a EQUIPE ofereceu.

Regras:
- Só conta oferta da EQUIPE (não da JU), com dia e hora claros, nas últimas 24 horas antes da escolha. Ex.: "amanhã 9h", "Terça: 09/12/13 Quarta 10/12/13/14" (= terça 9h, 12h, 13h; quarta 10h, 12h, 13h, 14h), "tem o horário das 11h disponível com a Beatriz" (dia = o que a família pediu, ex. hoje).
- Resolva dias relativos pela data da mensagem da oferta: "amanhã" = dia seguinte à oferta; "quarta" = a próxima quarta a partir da oferta (se a oferta foi numa quarta e fala "quarta", é a da semana seguinte, a não ser que diga "hoje").
- A família escolheu com certeza só com palavras firmes: "quero", "aceito", "pode ser", "pode marcar", "fechado", "combinado", "sim" respondendo a UMA opção, ou repetindo claramente o dia e a hora de uma opção ("quarta às 12h"). NÃO é certeza: "acho que", "posso tentar", "vou ver", "talvez", "vou confirmar", "depois te falo", pergunta, condição ("se for de manhã"), pedido de outro horário.
- Se a família disse só "sim"/"quero" e havia mais de uma opção, não há escolha (escolha_e_de_uma_opcao = false).
- fisio: primeiro nome da fisioterapeuta da opção escolhida, se a oferta disser; senão deixe vazio e preencha fisio_historico com a fisio que a conversa indica para este atendimento (pedido da família, reserva, oferta anterior). Só use nomes da lista de fisios.
- tipo: "respiratoria" ou "motora", pelo que a conversa diz deste atendimento; vazio se não der para saber.
- domiciliar: true só se a escolha for atendimento em casa.
- crianca: nome da criança deste atendimento, se a conversa disser.
- substitui: se a oferta da equipe era para TROCAR, ADIANTAR, ENCAIXAR ou REMARCAR uma consulta que a criança já tem (veja "Consultas já marcadas"), e não para marcar uma sessão a mais, informe o dia e a hora dessa consulta antiga; senão null. Ex.: a criança tem consulta hoje às 14h e a equipe escreve "preciso encaixar um bebê, vocês conseguiriam vir às 11h?" = substitui a das 14h.

Responda só JSON:
{"oferta_da_equipe": true|false,
 "opcoes": [{"data": "AAAA-MM-DD", "hora": "HH:MM", "fisio": "primeiro nome ou vazio"}],
 "escolha": {"data": "AAAA-MM-DD", "hora": "HH:MM", "fisio": "primeiro nome ou vazio"} ou null,
 "familia_certa": true|false,
 "escolha_e_de_uma_opcao": true|false,
 "fisio_historico": "primeiro nome ou vazio",
 "tipo": "respiratoria" | "motora" | "",
 "domiciliar": true|false,
 "crianca": "nome ou vazio",
 "substitui": {"data": "AAAA-MM-DD", "hora": "HH:MM"} ou null,
 "trecho_oferta": "trecho curto da oferta da equipe, até 120 caracteres",
 "trecho_escolha": "o que a família escreveu, até 100 caracteres",
 "motivo": "uma frase curta"}`;

async function perguntar(chave: string, usuario: string) {
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
          { role: 'system', content: SISTEMA },
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
    return { ...(JSON.parse(texto) as Json), modelo: model };
  }
  throw new Error(ultimoErro || 'sem resposta da IA');
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
    const { id } = await req.json();
    const { data: chave } = await admin
      .from('api_keys')
      .select('encrypted_key')
      .eq('service_name', 'openai')
      .eq('is_active', true)
      .maybeSingle();
    if (!chave?.encrypted_key) throw new Error('Chave da OpenAI não cadastrada');

    const { data: d, error } = await admin.rpc('fn_ju_escolha_dados', { p_id: id });
    if (error) throw new Error(error.message);
    const usuario = [
      `Agora: ${d.agora}`,
      `Fisios da clínica: ${(d.fisios ?? []).join(', ')}`,
      `Crianças desta família no cadastro: ${(d.criancas ?? []).map((c: Json) => c.nome).join(', ') || 'nenhuma ainda'}`,
      `Consultas já marcadas: ${(d.consultas_marcadas ?? []).join('; ') || 'nenhuma'}`,
      'Conversa:',
      ...(d.mensagens ?? []),
    ].join('\n');

    const extracao = await perguntar(chave.encrypted_key, usuario);
    const { data: res, error: e2 } = await admin.rpc('fn_ju_escolha_aplicar', {
      p_id: id,
      r: extracao,
    });
    if (e2) throw new Error(e2.message);
    return json({ ok: true, id, extracao, resultado: res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ju-escolha-horario]', msg);
    return json({ error: msg }, 500);
  }
});
