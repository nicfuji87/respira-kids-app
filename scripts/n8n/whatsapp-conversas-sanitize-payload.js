/* eslint-disable */
// AI dev note: Referência para sanitizar payload antes do POST em whatsapp_conversas.
// Pode ser colado no jsonBody do nó Supabase (IIFE) ou em um nó Code entre "itens" e "Supabase".

function parseValorMencionado(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  let s = String(v)
    .trim()
    .replace(/^R\$\s?/i, '')
    .trim();
  if (!s) return null;
  // Formato BR: 1.234,56 ou 21,90
  if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const code3 = $('Code3').item.json;
const itens = $('itens').item.json.itens || {};

const payload = {
  ...code3.metricas_objetivas,
  hash_conteudo: code3.hash_conteudo,
  ...itens,
  processado_em: new Date().toISOString(),
};

payload.valor_mencionado = parseValorMencionado(payload.valor_mencionado);

return [{ json: payload }];
