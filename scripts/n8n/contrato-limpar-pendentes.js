// 01/11/2026: depois da assinatura, exclui as outras cópias pendentes do mesmo contrato
// (sobras de reenvio para o mesmo contato, que ficaram valendo até agora). O aviso
// "não precisa mais assinar" da Assinafy chega depois de assinado, quando já faz sentido.
// Nunca falha o fluxo: erro aqui não pode atrapalhar a assinatura.
const cred = $('Credenciais1').first().json;
const obj = $('Webhook').first().json.body?.object || {};
const assinado = String(obj.id || '');
const contrato = String(obj.name || '').split('.')[0];
const base = 'https://api.assinafy.com.br/v1';
const H = { 'X-Api-Key': cred.assinafyToken, Accept: 'application/json' };
const req = (method, path) => this.helpers.httpRequest({
  method, url: base + path, headers: H, json: true,
  returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000,
});
const PENDENTES = ['metadata_ready', 'expired', 'pending_signature', 'failed'];
let excluidos = 0;
if (/^[0-9a-f-]{36}$/i.test(contrato)) {
  const busca = await req('GET', `/accounts/${cred.assinafyWS}/documents/search?search=${encodeURIComponent(contrato)}&per-page=100`);
  for (const doc of (busca.body?.data || [])) {
    if (doc.id === assinado || !String(doc.name || '').startsWith(contrato) || !PENDENTES.includes(doc.status)) continue;
    const del = await req('DELETE', `/documents/${doc.id}`);
    if (del.statusCode < 300) excluidos++;
  }
}
return [{ json: { contrato, excluidos }, pairedItem: { item: 0 } }];
