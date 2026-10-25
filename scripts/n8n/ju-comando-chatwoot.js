// n8n "RK Ju - Comando (Chatwoot)": @ju escrito por uma fisio no WhatsApp dela, que só está ligado ao
// Chatwoot (Bruna: caixa 38, conta 5). Cópia dos dois nós Code; manter igual ao n8n.
// Privacidade (decisão do dono, 25/10/2026): tudo o que não é @ju da própria fisio morre no primeiro nó,
// e o fluxo não guarda execução bem-sucedida.

// ── Nó "Filtrar @ju da fisio" ────────────────────────────────────────────────────────────────────
const CAIXAS = { 38: 'Bruna' };
const out = [];
for (const it of $input.all()) {
  try {
    const b = it.json.body || {};
    if (b.event !== 'message_created') continue;
    const inbox = Number((b.inbox && b.inbox.id) || (b.conversation && b.conversation.inbox_id));
    if (!CAIXAS[inbox]) continue;
    if (!(b.message_type === 'outgoing' || b.message_type === 1)) continue;
    const texto = String(b.content || '').trim();
    if (!/^@ju(?![\p{L}\p{N}])/iu.test(texto)) continue;
    const conv = Number(b.conversation && (b.conversation.display_id || b.conversation.id));
    if (!conv || !b.id) continue;
    out.push({ json: { inbox, quem: CAIXAS[inbox], cw_conversa_id: conv, cw_msg_id: Number(b.id), texto } });
  } catch (e) {
    // payload estranho: descarta
  }
}
return out;

// ── Nó "Conferir e montar" ───────────────────────────────────────────────────────────────────────
// Não confia no payload: confere no próprio Chatwoot (caixa, autoria e texto) e tira de lá o telefone e
// o histórico. O histórico vai só para o fluxo do @ju; não é gravado no banco.
const f = $('Filtrar @ju da fisio').first().json;
const conv = $('Conversa no Chatwoot').first().json;
const lista = [].concat($('Mensagens').first().json.payload || [], $('Mensagens anteriores').first().json.payload || []);
const vistos = new Set();
const msgs = lista.filter(m => m && !vistos.has(m.id) && vistos.add(m.id));
if (Number(conv.inbox_id) !== f.inbox) return [];
const alvo = msgs.find(m => Number(m.id) === f.cw_msg_id);
if (!alvo || Number(alvo.message_type) !== 1 || String(alvo.content || '').trim() !== f.texto) return [];

const s = (conv.meta && conv.meta.sender) || {};
let tel = String(s.phone_number || '').replace(/\D/g, '');
if (tel.length < 12) {
  const src = String((conv.contact_inbox && conv.contact_inbox.source_id) || s.identifier || '');
  if (/^\d+(@s\.whatsapp\.net)?$/.test(src)) tel = src.replace(/\D/g, '');
}
if (!/^55\d{10,11}$/.test(tel)) return [];

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const limite = alvo.created_at - 5 * 86400;
const historico = msgs
  .filter(m => m.created_at >= limite && m.created_at <= alvo.created_at && !m.private
            && (m.message_type === 0 || m.message_type === 1) && String(m.content || '').trim())
  .sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  .slice(-40)
  .map(m => {
    const dt = DateTime.fromSeconds(m.created_at, { zone: 'America/Sao_Paulo' });
    let txt = String(m.content).replace(/\s+/g, ' ').trim();
    let quem = m.message_type === 0 ? 'Família' : f.quem;
    if (m.message_type === 1 && /^\*Ju:\*/.test(txt)) { quem = 'Ju'; txt = txt.replace(/^\*Ju:\*\s*/, ''); }
    return `${DIAS[dt.weekday % 7]} ${dt.toFormat('dd/MM HH:mm')} ${quem}: ${txt.slice(0, 400)}`;
  });

return [{ json: { ...f, telefone: tel, historico: JSON.stringify(historico) } }];
