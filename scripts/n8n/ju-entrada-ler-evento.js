/* eslint-disable */
// AI dev note: corpo do nó "Ler evento" do workflow "RK Ju - Entrada" (n8n
// flows-principal HTMfhokzkqGu7D68). Modo: Run Once for All Items.
// Autentica a uazapi pelo SHA-256 do token (mesmo hash do RK Notas; atualizar
// se o token da instância respirakids for rotacionado), filtra só conversa 1:1
// e entrega os campos que o banco precisa. Nunca repassa o payload (tem o token).

const TK_SHA256 =
  'e7dd383d71927d2ec3cf7dab1b068dd18076c81831f4cdd60b047e4b685ef7fb';
const IGNORAR =
  /^(ReactionMessage|ProtocolMessage|PollUpdateMessage|EditedMessage|KeepInChatMessage|PinInChatMessage)$/;
const BOTAO =
  /^(ButtonsResponseMessage|TemplateButtonReplyMessage|ListResponseMessage|InteractiveResponseMessage)$/;

const j = $input.first()?.json ?? {};
const b = j.body && typeof j.body === 'object' ? j.body : {};
if (j.tk_sha256 !== TK_SHA256) {
  // Diagnóstico temporário (observação): evento sem token não é processado, mas
  // registra só o tipo e os nomes dos campos, para saber se a uazapi manda o
  // chat_labels sem token. Nenhum conteúdo é guardado.
  if (!b.token && b.EventType) {
    return [
      {
        json: {
          evento: 'sem_token:' + String(b.EventType).slice(0, 40),
          bruto: JSON.stringify(Object.keys(b)).slice(0, 500),
        },
      },
    ];
  }
  return [];
}
// Etiquetas da conversa mudaram (chat_labels): a Entrada compara as etiquetas
// ATUAIS com os pedidos abertos (tirou a etiqueta = concluído). O evento cru
// também é guardado, sem o token, até o formato estar confirmado.
if (b.EventType && b.EventType !== 'messages') {
  const { token, ...semToken } = b;
  const ch = b.chat && typeof b.chat === 'object' ? b.chat : {};
  const lista = ch.wa_label ?? b.labels ?? ch.labels;
  return [
    {
      json: {
        evento: String(b.EventType),
        bruto: JSON.stringify(semToken).slice(0, 4000),
        wa_chatid: String(ch.wa_chatid || ch.id || b.chatid || ''),
        etiquetas: Array.isArray(lista)
          ? lista.map((l) =>
              String(l?.id ?? l)
                .split(':')
                .pop()
            )
          : null,
      },
    },
  ];
}
if (b.EventType !== 'messages') return [];
const m = b.message && typeof b.message === 'object' ? b.message : {};

const chatid = String(m.chatid ?? '');
// Botão "✅ Concluído" de um aviso da Ju no grupo 🔔 RK · Notificações.
const GRUPO_NOTIFICACOES = '120363433073436578@g.us';
const botao = String(m.buttonOrListid ?? '');
if (chatid === GRUPO_NOTIFICACOES && botao.startsWith('ju_concluir:')) {
  return [
    {
      json: {
        evento: 'concluir',
        solicitacao_id: Number(botao.split(':')[1]) || null,
        quem: String(m.senderName || 'alguém').split(' ')[0],
        wa_message_id: String(m.messageid ?? ''),
      },
    },
  ];
}
// 23/10/2026: aviso automático da clínica no grupo (pedido, lembrete, aviso) sai do próprio número
// que a secretaria usa, então não notifica ela. Marca o grupo como não lido. Reação e mensagem apagada (card concluído) não.
if (chatid === GRUPO_NOTIFICACOES && m.fromMe === true && m.wasSentByApi === true
    && !/Reaction|Protocol|Revoke|Delete/i.test(String(m.messageType ?? ''))) {
  return [{ json: { evento: 'grupo_nao_lido' } }];
}
if (!/@(s\.whatsapp\.net|lid)$/.test(chatid)) return []; // grupo, status, canal, transmissão
const messageType = String(m.messageType ?? '');
if (!m.messageid || IGNORAR.test(messageType)) return [];

let content = m.content;
if (typeof content === 'string') {
  try {
    content = JSON.parse(content);
  } catch (e) {
    content = {};
  }
}
content = content && typeof content === 'object' ? content : {};

const fromMe = m.fromMe === true;
const tipo = /Audio|Ptt/i.test(messageType)
  ? 'AUDIO'
  : messageType === 'ImageMessage'
    ? 'IMAGE'
    : /^Document(WithCaption)?Message$/.test(messageType)
      ? 'DOCUMENT'
      : messageType === 'VideoMessage'
        ? 'VIDEO'
        : BOTAO.test(messageType)
          ? 'BOTAO'
          : /^(Conversation|ExtendedTextMessage)$/.test(messageType)
            ? 'TEXT'
            : 'OUTRO';

const texto = String(m.text || content.caption || content.Caption || '').trim();
// Mídia do cliente entra sem conteúdo: a legenda vai junto com a transcrição ou a
// descrição (fn_ju_midia). Assim o turno espera a leitura da mídia (conteudo NULL).
const midiaCliente = !fromMe && ['AUDIO', 'IMAGE', 'DOCUMENT'].includes(tipo);
const conteudo =
  tipo === 'BOTAO'
    ? texto || String(m.buttonOrListid ?? '')
    : tipo === 'OUTRO'
      ? `[${messageType || 'mensagem'}]`
      : midiaCliente
        ? ''
        : texto;

// Telefone: do chatid quando é número; em chat @lid, do remetente (só vem em mensagem do cliente).
const digitos = (s) => String(s ?? '').replace(/\D/g, '');
const telefone = chatid.endsWith('@s.whatsapp.net')
  ? digitos(chatid.split('@')[0])
  : !fromMe
    ? digitos(m.sender_pn)
    : digitos(b.chat?.phone);

return [
  {
    json: {
      wa_message_id: String(m.messageid),
      wa_chatid: chatid,
      telefone: telefone || null,
      from_me: fromMe,
      via_api: m.wasSentByApi === true,
      tipo,
      conteudo,
      legenda: tipo === 'TEXT' ? '' : texto,
    },
  },
];
