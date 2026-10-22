/* eslint-disable */
// AI dev note: corpo do nó "Etiquetas" do workflow "[RK] Analise Conversacional" (n8n editori NHaGytlvhVuGDd0t).
// Roda depois do upsert em whatsapp_conversas; o nó seguinte ("Salva etiquetas") grava etiquetas_aplicadas.
// Ids das etiquetas da instância uazapi "respirakids": 22 Responder, 23 Lead sem agendar,
// 24 Remarcar/cancelar, 25 Revisar cobrança, 26 NF pendente, 27 Encaixe urgente (5 Enviar relatorio e 6 Importante são manuais).

// Etiquetas do WhatsApp da recepção (uazapi) a partir da análise já gravada.
// Regra fixa aqui; a IA só preenche os campos, nunca escolhe a etiqueta.
// 22-27 são do fluxo: entram e saem. 5 e 6 são manuais: o fluxo só adiciona.
// 3 e 7 (fluxo do Asaas) e as demais manuais nunca são tocadas.
// Falha na uazapi não para o loop: devolve o erro e segue.

const UAZ_URL = 'https://infuse.uazapi.com';
const token = $('Empresa').first().json.tokenUazapi;
const c = $input.first().json;

const ETQ = {
  responder: '22',
  lead: '23',
  agenda: '24',
  cobranca: '25',
  nf: '26',
  urgente: '27',
  relatorio: '5',
  importante: '6',
};
// 22/10/2026 (Ju no ar): as 22-27 passaram a ser da Ju (ela coloca ao abrir o pedido e tirar = concluído).
// Esta análise não coloca nem tira mais essas; só adiciona 5 e 6.
const GERIDAS = [];
const SO_ADICIONA = ['5', '6'];

const pendenteEquipe =
  c.status_conversa === 'aguardando_equipe' ||
  (c.status_conversa === 'pendente_atendente' &&
    c.ultima_mensagem_remetente === 'cliente');

const quer = new Set();
if (pendenteEquipe) quer.add(ETQ.responder);
if (
  c.cliente_novo &&
  (c.perguntou_valor || c.perguntou_disponibilidade) &&
  !c.agendamento_realizado
)
  quer.add(ETQ.lead);
if (
  (c.remarcacao_solicitada || c.cancelamento_detectado) &&
  ['pendente_atendente', 'aguardando_equipe'].includes(c.status_conversa)
)
  quer.add(ETQ.agenda);
if (c.pagamento_a_conferir || c.cobranca_contestada) quer.add(ETQ.cobranca);
if (c.nota_fiscal_pendente) quer.add(ETQ.nf);
if (c.encaixe_urgente) quer.add(ETQ.urgente);
if (c.documento_pendente) quer.add(ETQ.relatorio);
if (
  ['medio', 'alto'].includes(c.nivel_insatisfacao) ||
  c.reclamacao_identificada
)
  quer.add(ETQ.importante);

const base = { id: c.id, chatwoot_conversa_id: c.chatwoot_conversa_id };

const jid = String(c.whatsapp_jid || '');
const numeroBase = jid.endsWith('@s.whatsapp.net')
  ? jid.split('@')[0]
  : String(c.contato_telefone || '').replace(/\D/g, '');
// O WhatsApp guarda muitos números de 55+DDD sem o 9; o telefone salvo costuma ter.
const variante = (n) =>
  n.length === 13 && n.startsWith('55') && n[4] === '9'
    ? n.slice(0, 4) + n.slice(5)
    : n.length === 12 && n.startsWith('55')
      ? n.slice(0, 4) + '9' + n.slice(4)
      : null;
let numero = numeroBase;
if (!numero || !token) {
  return [{ json: { ...base, etiquetas: null, etiquetas_erro: 'sem numero' } }];
}

const uaz = (path, body) =>
  this.helpers.httpRequest({
    method: 'POST',
    url: `${UAZ_URL}${path}`,
    headers: { token, 'Content-Type': 'application/json' },
    body,
    json: true,
    timeout: 20000,
  });

try {
  const buscar = async (n) => {
    const r = await uaz('/chat/find', {
      wa_chatid: `=${n}@s.whatsapp.net`,
      compact: true,
      limit: 1,
    });
    return (r && r.chats && r.chats[0]) || null;
  };
  let chat = await buscar(numero);
  if (!chat && variante(numero)) {
    numero = variante(numero);
    chat = await buscar(numero);
  }
  if (!chat) {
    return [
      {
        json: {
          ...base,
          etiquetas: null,
          etiquetas_erro: 'chat nao encontrado',
        },
      },
    ];
  }
  const tem = new Set(
    (chat.wa_label || []).map((l) => String(l).split(':').pop())
  );

  const adicionar = [];
  const remover = [];
  for (const id of GERIDAS) {
    if (quer.has(id) && !tem.has(id)) adicionar.push(id);
    if (!quer.has(id) && tem.has(id)) remover.push(id);
  }
  for (const id of SO_ADICIONA) {
    if (quer.has(id) && !tem.has(id)) adicionar.push(id);
  }

  for (const id of adicionar) {
    await uaz('/chat/labels', { number: numero, add_labelid: id });
  }
  for (const id of remover) {
    await uaz('/chat/labels', { number: numero, remove_labelid: id });
  }

  const final = new Set(tem);
  adicionar.forEach((id) => final.add(id));
  remover.forEach((id) => final.delete(id));
  const etiquetas = [...GERIDAS, ...SO_ADICIONA].filter((id) => final.has(id));

  return [
    {
      json: {
        ...base,
        etiquetas,
        adicionadas: adicionar,
        removidas: remover,
        etiquetas_erro: null,
      },
    },
  ];
} catch (e) {
  return [
    {
      json: {
        ...base,
        etiquetas: null,
        etiquetas_erro: String((e && e.message) || e).slice(0, 300),
      },
    },
  ];
}
