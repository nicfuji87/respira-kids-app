// AI dev note (22/10/2026): antes o fluxo buscava o signatário por busca parcial,
// nunca atualizava um signatário existente (WhatsApp nulo/antigo → 400 no
// assignment, sem aviso) e cada reenvio criava um documento novo sem cancelar o
// antigo. Aqui: (1) acha o signatário pelo e-mail exato, (2) exclui documentos
// antigos deste contrato (nome = {contrato}.pdf), (3) cria ou atualiza o WhatsApp.
// 01/11/2026: excluir um documento já enviado faz a Assinafy mandar "Documento
// cancelado… você não precisa mais assinar" para quem assina (caso Leandra: chegou
// junto com o contrato novo e confundiu). Agora:
//   - reenvio para o MESMO contato: o documento pendente fica (os dois links valem);
//     só sai o que nunca foi enviado. A limpeza das sobras é feita depois da
//     assinatura (nó "Limpar pendentes").
//   - contato mudou (telefone, nome ou outra pessoa): exclui os pendentes ANTES de
//     atualizar o signatário, para o aviso de cancelamento ir para o contato antigo.
const cred = $('Credenciais').first().json;
const d = $('Default').first().json.defautl;
const base = 'https://api.assinafy.com.br/v1';
const ws = cred.assinafyWS;
const H = { 'X-Api-Key': cred.assinafyToken, Accept: 'application/json' };
const req = (method, path, body) => this.helpers.httpRequest({
  method, url: base + path, headers: H, body, json: true,
  returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000,
});
const msg = (r) => String(r?.body?.message ?? '').slice(0, 200);

// Mesma regra da edge send-contract-webhook: +55 DDD 9 número.
const e164 = (v) => {
  let x = String(v ?? '').replace(/\D/g, '');
  if ((x.length === 12 || x.length === 13) && x.startsWith('55')) x = x.slice(2);
  if (x.length === 11 && x.startsWith('0')) x = x.slice(1);
  if (x.length !== 10 && x.length !== 11) return null;
  const ddd = x.slice(0, 2);
  let n = x.slice(2);
  if (ddd.startsWith('0')) return null;
  if (n.length === 8 && /^[6-9]/.test(n)) n = '9' + n;
  if (n.length !== 9 || !n.startsWith('9')) return null;
  return '+55' + ddd + n;
};

const contrato = String(d.contrato_id || '').trim();
const email = String(d.signatario_email || '').trim().toLowerCase();
const nome = String(d.signatario_nome || '').trim();
const fone = e164(d.signatario_telefone);
if (!contrato) throw new Error('Contrato sem id no webhook');
if (!email) throw new Error('Quem assina está sem e-mail no cadastro');
if (!fone) throw new Error('WhatsApp de quem assina inválido (final ' + String(d.signatario_telefone || '').replace(/\D/g, '').slice(-4) + ')');

// 1) signatário pelo e-mail exato e o que mudou nele
const lista = await req('GET', `/accounts/${ws}/signers?search=${encodeURIComponent(email)}&per-page=100`);
if (lista.statusCode >= 300) throw new Error(`Assinafy (buscar signatário) ${lista.statusCode}: ${msg(lista)}`);
let s = (lista.body?.data || []).find((x) => String(x.email || '').trim().toLowerCase() === email);
const mudar = {};
if (s) {
  if (s.whatsapp_phone_number !== fone) mudar.whatsapp_phone_number = fone;
  // quem assina mudou no cadastro mas o e-mail é o mesmo (ex.: era a mãe, agora o pai):
  // atualiza também o nome, senão a assinatura sai no nome antigo
  if (nome && String(s.full_name || '').trim().toLowerCase() !== nome.toLowerCase()) mudar.full_name = nome;
}
const contatoMudou = !s || Object.keys(mudar).length > 0;

// 2) documentos antigos deste contrato
const NUNCA_ENVIADOS = ['metadata_ready', 'failed'];
const DELETAVEIS = ['metadata_ready', 'expired', 'rejected_by_signer', 'pending_signature', 'rejected_by_user', 'failed'];
const apagar = contatoMudou ? DELETAVEIS : NUNCA_ENVIADOS;
let cancelados = 0;
let mantidos = 0;
const busca = await req('GET', `/accounts/${ws}/documents/search?search=${encodeURIComponent(contrato)}&per-page=100`);
for (const doc of (busca.body?.data || [])) {
  if (!String(doc.name || '').startsWith(contrato) || !DELETAVEIS.includes(doc.status)) continue;
  if (!apagar.includes(doc.status)) { mantidos++; continue; }
  const del = await req('DELETE', `/documents/${doc.id}`);
  if (del.statusCode < 300) cancelados++;
}

// 3) cria ou atualiza o WhatsApp (sempre depois de excluir, ver nota acima)
let acao = 'existente';
if (!s) {
  const c = await req('POST', `/accounts/${ws}/signers`, { full_name: nome || email, email, whatsapp_phone_number: fone });
  if (c.statusCode >= 300 || !c.body?.data?.id) throw new Error(`Assinafy (criar signatário) ${c.statusCode}: ${msg(c)}`);
  s = c.body.data;
  acao = 'criado';
} else if (Object.keys(mudar).length) {
  const u = await req('PUT', `/accounts/${ws}/signers/${s.id}`, mudar);
  if (u.statusCode >= 300) throw new Error(`Assinafy (atualizar signatário) ${u.statusCode}: ${msg(u)}`);
  acao = Object.keys(mudar).map((k) => (k === 'full_name' ? 'nome' : 'whatsapp')).join('+') + '_atualizado';
}
return [{ json: { signer_id: s.id, whatsapp: fone, acao, cancelados, mantidos }, pairedItem: { item: 0 } }];
