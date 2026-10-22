/* eslint-disable */
// AI dev note: Cole este código no nó Code3 do workflow "[RK] Analise Conversacional".
// Arquivo de referência no repo — o n8n executa o corpo como script, não como módulo Node.
// Métricas objetivas + paginação Chatwoot (últimas 50 msgs) + prompt calibrado para a IA.
// Upsert Supabase (nó HTTP): spread metricas_objetivas + hash + itens da IA + processado_em.
// NÃO enviar: formattedConversation, analise_completa, colunas removidas (no_show, avaliacao_google).

const TIME_ZONE = 'America/Sao_Paulo';
const TARGET_MSGS = 50;

const raw = $input.first().json;
const meta = raw.meta || {};
const contact = meta.contact || {};
const ca = contact.custom_attributes || {};

const conversaId = String(
  raw.id ?? meta.conversation_id ?? raw.conversation_id ?? contact.id ?? ''
);
const contactName = contact.name || 'Desconhecido';
const contactPhone = String(contact.phone_number || '').replace(/\D/g, '');

const toDate = (m) => {
  const v = m.created_at;
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (d) =>
  d ? d.toLocaleString('pt-BR', { timeZone: TIME_ZONE }) : '';
const diffMin = (a, b) => (a && b ? Math.round((b - a) / 60000) : null);
const isNote = (m) => m.private === true;
const isClient = (m) => m.message_type === 0 || m.message_type === 'incoming';
const isStaff = (m) =>
  (m.message_type === 1 || m.message_type === 'outgoing') && !isNote(m);
const isActivity = (m) => m.message_type === 2 || m.message_type === 'activity';
const AUTO_RE =
  /(confirma(r|ção).*consulta|é um lembrete|mensagem autom|não responda|link de pagamento|nota fiscal|pesquisa de satisfação|avalie nosso)/i;
const isAuto = (m) => isStaff(m) && AUTO_RE.test(m.content || '');
const content = (m) =>
  (m.content && String(m.content).trim()) ||
  ((m.attachments || []).length
    ? `[${(m.attachments || []).length} anexo(s)]`
    : '');
const count = (re, s) => ((s || '').match(re) || []).length;

// Reconhece as mensagens automáticas do sistema (cobrança, NF, lembrete, contrato, loja)
// e as respostas de botão. Devolve null para mensagem que não é automática.
// curto: versão compacta que vai para a IA. flags: o que a mensagem resolve por regra.
function classificarAutomatica(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const pega = (re) => {
    const m = t.match(re);
    return m ? m[1].trim() : '';
  };
  const valor = pega(/Valor:\s*\*?\s*(R\$\s?[\d.,]+)/i);
  const descricao = pega(/(?:Descrição da Fatura|Fatura):\s*\*([^*]+)\*/i)
    .replace(/,?\s*CPF[^,.)]*/gi, '')
    .replace(/,?\s*CREFITO[^,.)]*/gi, '')
    .replace(/\s*Atendimentos realizados ao paciente[^.]*\.?/i, '')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
  const junta = (...p) => p.filter(Boolean).join(' – ');

  if (/^\[Pagamento Recebido\]/i.test(t))
    return {
      tipo: 'pagamento_recebido',
      curto: junta('[Automático] Pagamento recebido', descricao, valor),
      flags: { pagamento_a_conferir: false, pagamento_confirmado: true },
    };
  if (/^Segue a nota fiscal referente/i.test(t))
    return {
      tipo: 'nota_fiscal',
      curto: junta('[Automático] Nota fiscal enviada', descricao),
      flags: { nota_fiscal_pendente: false, nota_fiscal_enviada: true },
    };
  if (/Segue o link da fatura/i.test(t) && /Detalhes da Fatura/i.test(t))
    return {
      tipo: 'fatura',
      curto: junta('[Automático] Fatura enviada', descricao, valor),
      flags: { pagamento_solicitado: true },
    };
  if (
    /Estamos escrevendo apenas para lembrar/i.test(t) &&
    /fatura em aberto/i.test(t)
  )
    return {
      tipo: 'lembrete_fatura',
      curto: junta(
        '[Automático] Lembrete de fatura em aberto',
        descricao,
        pega(/Dias Vencidos:\s*\*?(\d+)/i) &&
          `${pega(/Dias Vencidos:\s*\*?(\d+)/i)} dias vencidos`,
        valor
      ),
      flags: { pagamento_solicitado: true },
    };
  if (/sua compra na Respira Kids está separada/i.test(t))
    return {
      tipo: 'loja',
      curto: junta(
        '[Automático] Cobrança de produto',
        pega(/separada:\s*\*([^*]+)\*/i),
        valor
      ),
      flags: {},
    };
  if (/^\*?\[Lembrete de Consulta\]/i.test(t))
    return {
      tipo: 'lembrete_consulta',
      curto: junta(
        '[Automático] Lembrete de consulta',
        pega(/Data:\s*\*([^*]+)\*/i),
        pega(/Hora:\s*\*([^*]+)\*/i),
        pega(/Profissional:\s*\*([^*]+)\*/i)
      ),
      flags: {},
    };
  if (/Sua consulta foi \*?cancelada/i.test(t))
    return {
      tipo: 'cancelamento_auto',
      curto: '[Automático] Aviso de consulta cancelada',
      flags: {},
    };
  if (/Não identificamos a assinatura do contrato/i.test(t))
    return {
      tipo: 'contrato_pendente',
      curto: '[Automático] Aviso de contrato não assinado',
      flags: {},
    };
  if (/^✅?\s*Contrato assinado com sucesso/i.test(t))
    return {
      tipo: 'contrato_assinado',
      curto: '[Automático] Contrato assinado',
      flags: {},
    };
  if (
    /^confirmar\.[0-9a-f-]{36}$/i.test(t) ||
    /^\(\d+\):\s*Confirmar$/i.test(t)
  )
    return {
      tipo: 'botao_confirmar',
      curto: '[Botão] Confirmou a consulta',
      flags: { confirmacao_consulta: true },
    };
  return null;
}

/** Horário comercial: seg–sex 8h–18h (America/Sao_Paulo). */
function isForaHorarioComercial(d) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(d);
  if (wd === 'Sat' || wd === 'Sun') return true;
  const hm = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(hm.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(
    hm.find((p) => p.type === 'minute')?.value || '0',
    10
  );
  const mins = hour * 60 + minute;
  return mins < 8 * 60 || mins >= 18 * 60;
}

// --- Paginação: Chatwoot retorna no máx 20 msgs/página (recentes). before= traz anteriores.
let messages = Array.isArray(raw.payload) ? raw.payload.slice() : [];
try {
  if (messages.length >= 20) {
    const _convoId = $('Loop Over Items2').item.json.conversationId;
    const _emp = $('Empresa').first().json;
    const _url = `${_emp.cht_url}/api/v1/accounts/${_emp.cht_account}/conversations/${_convoId}/messages`;
    let _oldest = Math.min(
      ...messages.map((m) => Number(m.id)).filter((n) => !isNaN(n))
    );
    let _guard = 0;
    while (messages.length < TARGET_MSGS && _guard < 4) {
      _guard++;
      const _resp = await this.helpers.httpRequest({
        method: 'GET',
        url: _url,
        qs: { before: _oldest },
        headers: { api_access_token: _emp.cht_apiKey },
        json: true,
      });
      const _older = Array.isArray(_resp.payload) ? _resp.payload : [];
      if (!_older.length) break;
      const _seen = new Set(messages.map((m) => m.id));
      const _novos = _older.filter((m) => !_seen.has(m.id));
      if (!_novos.length) break;
      messages = _novos.concat(messages);
      const _newOldest = Math.min(
        ..._older.map((m) => Number(m.id)).filter((n) => !isNaN(n))
      );
      if (!isFinite(_newOldest) || _newOldest >= _oldest) break;
      _oldest = _newOldest;
      if (_older.length < 20) break;
    }
  }
} catch (_e) {
  /* mantém janela já obtida */
}
messages.sort((a, b) => {
  const da = toDate(a)?.getTime() ?? 0;
  const db = toDate(b)?.getTime() ?? 0;
  return da !== db ? da - db : Number(a.id || 0) - Number(b.id || 0);
});
if (messages.length > TARGET_MSGS) messages = messages.slice(-TARGET_MSGS);

let mCli = 0,
  mAtd = 0,
  mAuto = 0,
  notas = 0,
  anexos = 0,
  img = 0,
  aud = 0,
  vid = 0,
  doc = 0,
  links = 0,
  valores = 0;
let firstAt = null,
  lastAt = null,
  lastSender = null,
  firstCli = null,
  respIni = null,
  maiorGap = 0,
  lastCli = null;
let foraHorario = false;
const gaps = [];
const fmtMsgs = [];
// Uma entrada por mensagem enviada à IA: o nó "Só automação?" usa para decidir se pula a IA.
const mensagensMeta = [];
let hashBase = `${conversaId}|${messages.length}|`;

for (const m of messages) {
  const d = toDate(m);
  if (d) {
    if (!firstAt || d < firstAt) firstAt = d;
    if (!lastAt || d > lastAt) {
      lastAt = d;
      lastSender = isClient(m)
        ? 'cliente'
        : isStaff(m)
          ? 'atendente'
          : 'sistema';
    }
    if (isClient(m) && isForaHorarioComercial(d)) foraHorario = true;
  }
  const c = content(m);
  hashBase += `${m.id || ''}:${m.message_type || ''}:${(m.content || '').length};`;
  for (const a of m.attachments || []) {
    anexos++;
    const t = (a.file_type || a.type || '').toLowerCase();
    if (t.includes('image')) img++;
    else if (t.includes('audio')) aud++;
    else if (t.includes('video')) vid++;
    else doc++;
  }
  links += count(/https?:\/\/\S+/gi, c);
  valores += count(/r\$\s?\d/gi, c);
  if (isNote(m)) notas++;
  else if (isClient(m)) {
    mCli++;
    if (d && !firstCli) firstCli = d;
    if (d) lastCli = d;
  } else if (isStaff(m)) {
    mAtd++;
    if (isAuto(m)) mAuto++;
    if (d && firstCli && respIni == null) respIni = diffMin(firstCli, d);
    if (d && lastCli) {
      const g = diffMin(lastCli, d);
      if (g != null) {
        gaps.push(g);
        if (g > maiorGap) maiorGap = g;
      }
      lastCli = null;
    }
  }
  const who = isNote(m)
    ? 'NOTA INTERNA'
    : isClient(m)
      ? contactName
      : isStaff(m)
        ? 'Atendente'
        : 'Sistema';
  if (!isActivity(m) && c) {
    // Mensagem automática vai resumida para a IA (economia de tokens); o hash não muda.
    const auto = isNote(m) ? null : classificarAutomatica(m.content);
    fmtMsgs.push(`[${fmt(d)}] ${who}: ${auto ? auto.curto : c}`);
    mensagensMeta.push({
      em: d ? d.toISOString() : null,
      auto: !!auto,
      tipo: auto ? auto.tipo : null,
      flags: auto ? auto.flags : null,
    });
  }
}
const tMedio = gaps.length
  ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  : null;

let h = 0x811c9dc5;
for (let i = 0; i < hashBase.length; i++) {
  h ^= hashBase.charCodeAt(i);
  h = Math.imul(h, 0x01000193);
}
const hashConteudo = (h >>> 0).toString(16);

const metricas_objetivas = {
  chatwoot_conversa_id: conversaId,
  contato_nome: contactName,
  contato_telefone: contactPhone,
  total_mensagens: messages.length,
  ultima_mensagem_em: lastAt ? lastAt.toISOString() : null,
  ultima_mensagem_remetente: lastSender,
  iniciada_em: firstAt ? firstAt.toISOString() : null,
  encerrada_em: lastAt ? lastAt.toISOString() : null,
  duracao_minutos: diffMin(firstAt, lastAt),
  mensagens_cliente: mCli,
  mensagens_atendente: mAtd,
  mensagens_automaticas: mAuto,
  notas_internas: notas,
  anexos,
  imagens: img,
  audios: aud,
  videos: vid,
  documentos: doc,
  links,
  valores_monetarios_detectados: valores,
  tempo_resposta_inicial_minutos: respIni,
  tempo_medio_resposta_minutos: tMedio,
  maior_tempo_resposta_minutos: maiorGap || null,
  mensagens_cliente_pendentes: lastCli ? 1 : 0,
  fora_horario_comercial: foraHorario,
  whatsapp_jid: String(contact.identifier || '').endsWith('@s.whatsapp.net')
    ? String(contact.identifier)
    : null,
};

const instruction = `Você é o analista de conversas da Respira Kids. Analise a conversa de WhatsApp abaixo e responda SOMENTE em JSON válido (sem markdown, sem texto fora do JSON). As métricas objetivas já foram calculadas; você preenche apenas a interpretação.
A maioria das conversas é sobre: agendamento, clientes novos, confirmação de consulta (mensagens automáticas), envio de nota fiscal, cobrança de pagamento e pesquisa de satisfação.

Regras obrigatórias:
- tipo_demanda: evite "mista" salvo duas demandas igualmente centrais; prefira administrativa|financeira|clinica|comercial|relacionamento.
- tem_conteudo_clinico: true só com discussão clínica real (sintoma, conduta, evolução) — não por cadastro/agendamento/NF.
- pontos_de_atrito e sugestao_melhoria: só com problema real (atraso, cobrança contestada, falta de resposta, insatisfação).
- necessita_followup: true só se faltar ação humana clara para a equipe.
- status_conversa: alinhe com quem falou por último (cliente sem resposta → pendente_atendente; atendente sem resposta do cliente → pendente_cliente).
- reclamacao_identificada e requer_atencao_admin: true apenas com insatisfação relevante.
- data_consulta_mencionada: SEMPRE datas em formato ISO "YYYY-MM-DD" (ex.: "2025-06-06"). Converta expressões relativas ("amanhã", "segunda", "dia 6") para a data absoluta com base na data/hora da própria mensagem. Use [] se nenhuma data de consulta for citada. NÃO inclua horários.
- valor_mencionado: número decimal (ex.: 21.9) ou null — NUNCA string formatada como "R$21,90".
- profissional_mencionado: array com nomes próprios de profissionais citados (vazio se nenhum).
- Os 5 campos abaixo viram etiquetas no WhatsApp da secretária. Marque true só quando a pendência AINDA estiver aberta no fim da conversa; se já foi resolvida, false. Na dúvida, false.
- encaixe_urgente: criança com sintoma agudo (febre, muita secreção, chiado, piora) e pedido de atendimento para hoje ou amanhã, ainda sem horário marcado.
- pagamento_a_conferir: cliente diz que já pagou (manda comprovante, pagou em dinheiro, Pix direto para a profissional, fora do link) e a equipe ainda não confirmou a baixa, ou lembrete automático de cobrança chegou depois do pagamento.
- cobranca_contestada: cliente questiona valor, cobrança duplicada ou indevida, cobrança de sessão cancelada, ou pede parcelamento/desconto, sem resposta final da equipe.
- nota_fiscal_pendente: cliente pediu NF ou segunda via, ou houve erro na emissão, e a nota ainda não foi entregue.
- documento_pendente: cliente pediu relatório, atestado ou declaração (ex.: para reembolso) e ainda não recebeu.

Retorne exatamente:
{
 "resumo": "máx 500 caracteres, 1 parágrafo",
 "intencao_principal": "agendamento|confirmacao|remarcacao|cancelamento|duvida_valor|duvida_clinica|financeiro|documento|nota_fiscal|avaliacao|pos_consulta|sem_atendimento|outros",
 "tipo_demanda": "clinica|administrativa|financeira|comercial|relacionamento|mista|outros",
 "status_conversa": "finalizada|pendente_atendente|pendente_cliente|aguardando_equipe|aguardando_data_futura|sem_atendimento",
 "tem_conteudo_clinico": false,
 "lead_quente": false,
 "cliente_novo": false,
 "perguntou_valor": false,
 "perguntou_disponibilidade": false,
 "agendamento_realizado": false,
 "confirmacao_consulta": false,
 "remarcacao_solicitada": false,
 "cancelamento_detectado": false,
 "pagamento_solicitado": false,
 "pagamento_confirmado": false,
 "nota_fiscal_enviada": false,
 "profissional_mencionado": [],
 "data_consulta_mencionada": [],
 "tipo_servico_mencionado": "respiratoria|motora|avaliacao|multiplos|nao_informado",
 "local_atendimento": "clinica|domiciliar|nao_informado",
 "valor_mencionado": null,
 "resolvido_primeiro_contato": false,
 "sentimento_cliente": "positivo|satisfeito|neutro|ansioso|preocupado|frustrado|negativo",
 "pontos_de_atrito": [],
 "sugestao_melhoria": null,
 "reclamacao_identificada": false,
 "nivel_insatisfacao": "nenhum|baixo|medio|alto",
 "motivo_insatisfacao": null,
 "requer_atencao_admin": false,
 "necessita_followup": false,
 "acao_recomendada": null,
 "responsavel_sugerido": "recepcao|fisioterapeuta|financeiro|gestao|medico_ou_triagem|nao_aplicavel",
 "prazo_followup": "hoje|24h|48h|esta_semana|antes_da_consulta|sem_prazo",
 "encaixe_urgente": false,
 "pagamento_a_conferir": false,
 "cobranca_contestada": false,
 "nota_fiscal_pendente": false,
 "documento_pendente": false
}
Segue a conversa:`;

return [
  {
    json: {
      chatwoot_conversa_id: conversaId,
      hash_conteudo: hashConteudo,
      metricas_objetivas,
      mensagens_meta: mensagensMeta,
      formattedConversation: `${instruction}\n\n${fmtMsgs.join('\n')}`,
    },
  },
];
