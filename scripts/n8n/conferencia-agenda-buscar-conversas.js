// n8n "RK Conferência de agenda" → nó "Buscar conversas" (Code, Run Once for All Items).
// Busca no Chatwoot as conversas com mensagem da FAMÍLIA nas últimas `horas` (padrão 26) nas
// caixas 39 (recepção) e 38 (celular da Bruna) e devolve uma conversa por item, com as
// mensagens dos últimos 10 dias (contexto para "amanhã", "segunda" etc.).
// O token do Chatwoot vem do nó "Chatwoot" (mesmo padrão do [RK] Analise Conversacional).

const cw = $('Chatwoot').first().json;
const body = $('Webhook do banco').first().json.body || {};
const horas = Math.min(Math.max(Number(body.horas) || 26, 1), 24 * 45);
const CAIXAS = [38, 39];
const agora = Date.now();
const desde = agora - horas * 3600e3;
const contextoIni = Math.min(desde, agora - 10 * 86400e3);
const base = `${cw.url}/api/v1/accounts/${cw.conta}`;
const H = { api_access_token: cw.token };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, qs) => {
  for (let i = 0; i < 4; i++) {
    try {
      return await this.helpers.httpRequest({
        method: 'GET',
        url,
        qs,
        headers: H,
        json: true,
        timeout: 30000,
      });
    } catch (e) {
      if (i === 3) throw e;
      await esperar(1500 * (i + 1));
    }
  }
};

// 1) conversas com atividade na janela (lista vem da mais recente para a mais antiga)
const convs = [];
for (let page = 1; page <= 80; page++) {
  const d = await get(`${base}/conversations`, {
    status: 'all',
    page,
    sort_by: 'last_activity_at_desc',
  });
  const itens = d?.data?.payload || [];
  if (!itens.length) break;
  let passou = false;
  for (const c of itens) {
    const ultima = (c.last_activity_at || c.timestamp || 0) * 1000;
    if (ultima < desde) {
      passou = true;
      continue;
    }
    const ident = c.meta?.sender?.identifier || '';
    if (!CAIXAS.includes(Number(c.inbox_id)) || ident.includes('@g.us'))
      continue;
    convs.push(c);
  }
  if (passou) break;
}

// 2) mensagens de cada conversa (paginando para trás até o início do contexto)
const lerMensagens = async (cid) => {
  let todas = [];
  let antes;
  for (let i = 0; i < 8; i++) {
    const d = await get(
      `${base}/conversations/${cid}/messages`,
      antes ? { before: antes } : {}
    );
    const p = d?.payload || [];
    if (!p.length) break;
    todas = p.concat(todas);
    const maisAntigaTs = Math.min(...p.map((m) => m.created_at)) * 1000;
    const maisAntigaId = Math.min(...p.map((m) => m.id));
    if (maisAntigaTs < contextoIni || p.length < 20 || maisAntigaId === antes)
      break;
    antes = maisAntigaId;
  }
  const vistos = new Set();
  return todas
    .filter((m) => (vistos.has(m.id) ? false : vistos.add(m.id)))
    .filter(
      (m) =>
        m.message_type !== 2 && !m.private && m.created_at * 1000 >= contextoIni
    )
    .sort((a, b) => a.created_at - b.created_at || a.id - b.id);
};

const saida = [];
for (let i = 0; i < convs.length; i += 4) {
  const lote = convs.slice(i, i + 4);
  const res = await Promise.all(
    lote.map(async (c) => ({ c, ms: await lerMensagens(c.id) }))
  );
  for (const { c, ms } of res) {
    const temFamiliaNaJanela = ms.some(
      (m) => m.message_type === 0 && m.created_at * 1000 >= desde
    );
    if (!temFamiliaNaJanela) continue;
    const sender = c.meta?.sender || {};
    const mensagens = ms
      .slice(-120)
      .map((m) => {
        let texto = (m.content || '').trim();
        if (!texto && m.attachments?.length)
          texto =
            '<' +
            m.attachments.map((a) => a.file_type || 'anexo').join(',') +
            '>';
        const quem =
          m.message_type === 0
            ? 'FAMILIA'
            : m.sender?.type === 'user'
              ? 'JU'
              : 'CLINICA';
        if (quem === 'CLINICA' && texto.length > 300)
          texto = texto.slice(0, 300) + '…';
        return {
          id: m.id,
          em: new Date(m.created_at * 1000).toISOString(),
          quem,
          texto: texto.replace(/\n+/g, ' / '),
        };
      })
      .filter((m) => m.texto);
    saida.push({
      json: {
        conversa_id: c.id,
        caixa: Number(c.inbox_id),
        telefone:
          sender.phone_number || (sender.identifier || '').split('@')[0],
        contato: sender.name || '',
        mensagens,
      },
    });
  }
}

return saida;
