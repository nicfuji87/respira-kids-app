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
  if (!isActivity(m) && c) fmtMsgs.push(`[${fmt(d)}] ${who}: ${c}`);
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
};

const instruction = `Você é o analista de conversas da Respira Kids. Analise a conversa de WhatsApp abaixo e responda SOMENTE em JSON válido (sem markdown, sem texto fora do JSON). As métricas objetivas já foram calculadas; você preenche apenas a interpretação.
A maioria das conversas é sobre: agendamento, clientes novos, confirmação de consulta (mensagens automáticas), envio de nota fiscal, cobrança de pagamento e pesquisa de satisfação.

Regras obrigatórias:
- tipo_demanda: evite "mista" salvo duas demandas igualmente centrais; prefira administrativa|financeira|clinica|comercial|relacionamento.
- tem_conteudo_clinico: true só com discussão clínica real (sintoma, conduta, evolução) — não por cadastro/agendamento/NF.
- sintomas_mencionados e sinais_alerta_clinicos: só se tem_conteudo_clinico=true.
- pontos_de_atrito e sugestao_melhoria: só com problema real (atraso, cobrança contestada, falta de resposta, insatisfação).
- dados_sensiveis_detectados: true só para CPF, endereço completo, dados bancários ou prontuário — nome/telefone do WhatsApp = false.
- necessita_followup: true só se faltar ação humana clara para a equipe.
- status_conversa: alinhe com quem falou por último (cliente sem resposta → pendente_atendente; atendente sem resposta do cliente → pendente_cliente).
- reclamacao_identificada e requer_atencao_admin: true apenas com insatisfação relevante.

Retorne exatamente:
{
 "resumo": "máx 500 caracteres, 1 parágrafo",
 "intencao_principal": "agendamento|confirmacao|remarcacao|cancelamento|duvida_valor|duvida_clinica|financeiro|documento|nota_fiscal|avaliacao|pos_consulta|sem_atendimento|outros",
 "intencoes_secundarias": [],
 "tipo_demanda": "clinica|administrativa|financeira|comercial|relacionamento|mista|outros",
 "status_conversa": "finalizada|pendente_atendente|pendente_cliente|aguardando_equipe|aguardando_data_futura|sem_atendimento",
 "etapa_conversa": "novo_lead|paciente_ativo|pos_consulta|cobranca|recorrente|suporte|outros",
 "tem_conteudo_clinico": false,
 "idade_paciente_mencionada": null,
 "sintomas_mencionados": [],
 "sinais_alerta_clinicos": [],
 "urgencia_clinica": "baixa|media|alta|nao_aplicavel",
 "necessita_triagem_humana": false,
 "lead_quente": false,
 "cliente_novo": false,
 "perguntou_valor": false,
 "perguntou_disponibilidade": false,
 "solicitacao_mesmo_dia": false,
 "agendamento_realizado": false,
 "confirmacao_consulta": false,
 "remarcacao_solicitada": false,
 "cancelamento_detectado": false,
 "pagamento_solicitado": false,
 "pagamento_confirmado": false,
 "nota_fiscal_enviada": false,
 "pesquisa_satisfacao_enviada": false,
 "profissional_mencionado": [],
 "data_consulta_mencionada": [],
 "tipo_servico_mencionado": "respiratoria|motora|avaliacao|multiplos|nao_informado",
 "local_atendimento": "clinica|domiciliar|nao_informado",
 "valor_mencionado": null ou número decimal (ex.: 21.9) — NUNCA string formatada como "R$21,90",
 "indicacao_pediatra_mencionada": false,
 "solicitou_encaixe": false,
 "resolvido_primeiro_contato": false,
 "sentimento_cliente": "positivo|satisfeito|neutro|ansioso|preocupado|frustrado|negativo",
 "qualidade_atendimento": "otimo|bom|regular|ruim",
 "pontos_de_atrito": [],
 "sugestao_melhoria": null,
 "reclamacao_identificada": false,
 "nivel_insatisfacao": "nenhum|baixo|medio|alto",
 "motivo_insatisfacao": null,
 "requer_atencao_admin": false,
 "dados_sensiveis_detectados": false,
 "tipos_dados_sensiveis": [],
 "risco_lgpd": "nenhum|baixo|medio|alto",
 "necessita_followup": false,
 "acao_recomendada": null,
 "responsavel_sugerido": "recepcao|fisioterapeuta|financeiro|gestao|medico_ou_triagem|nao_aplicavel",
 "prazo_followup": "hoje|24h|48h|esta_semana|antes_da_consulta|sem_prazo",
 "confianca_analise": 0.0
}
Segue a conversa:`;

return [
  {
    json: {
      chatwoot_conversa_id: conversaId,
      hash_conteudo: hashConteudo,
      metricas_objetivas,
      formattedConversation: `${instruction}\n\n${fmtMsgs.join('\n')}`,
    },
  },
];
