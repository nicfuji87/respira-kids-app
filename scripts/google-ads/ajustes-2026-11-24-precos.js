/**
 * Respira Kids — preço e "Nota 5,0" nos anúncios que já estão no ar (lote atômico, idempotente).
 *
 * Decisões (23/11/2026):
 *  - "a partir de R$ 280" → "R$ 260": a Beatriz atende paciente novo por R$ 260 na respiratória e a
 *    1ª sessão já é a avaliação (conferido no sistema). Só nos grupos Respiratória, Pediátrica e Marca;
 *    se aparecer 280 em Motor/Torcicolo/Assimetria, o script só avisa (lá o certo seria 320).
 *  - "Nota 5,0 no Google" sai dos anúncios (dono: "não faz sentido").
 *
 * Anúncio responsivo: edição no próprio anúncio (mantém o histórico; volta para revisão do Google).
 * Sitelink/frase de destaque: recurso novo com o texto corrigido no mesmo nível + tira o vínculo do
 * antigo (o texto de um recurso não pode ser editado).
 * Executado em 23/11/2026 21:12 (10 alterações, conferido). Visualizar mostra cada troca "antes → depois". Depois de Executar, relê a conta e falha se sobrar
 * 280 ou "nota 5,0" onde não devia.
 */
var CONTA = '8744391492';
var DE = /R\$\s?280/g, PARA = 'R$ 260';
var NOTA = /nota\s*5,0/i;
var GRUPOS_PRECO = ['Fisioterapia respiratória infantil', 'Fisioterapia pediátrica', 'Marca e equipe'];

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  var ops = [], avisos = [];
  anuncios(ops, avisos);
  recursos(ops, avisos, cid);
  avisos.forEach(function (a) { Logger.log('AVISO ' + a); });
  if (!ops.length) { Logger.log('OK nada a mudar'); if (!preview) conferir(); return; }
  var res = AdsApp.mutateAll(ops, { partialFailure: false });
  var erros = res.filter(function (x) { return !x.isSuccessful(); }).map(function (x) { return x.getErrorMessages(); });
  if (erros.length) throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
  Logger.log((preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + ops.length + ' operações');
  if (!preview) conferir();
}

function anuncios(ops, avisos) {
  var rows = AdsApp.search('SELECT campaign.name, ad_group.name, ad_group_ad.ad.resource_name, ad_group_ad.ad.responsive_search_ad.headlines, ' +
    "ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' " +
    "AND campaign.status = 'ENABLED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'");
  while (rows.hasNext()) {
    var r = rows.next(), g = r.adGroup.name, rsa = r.adGroupAd.ad.responsiveSearchAd, mudou = false, ok = true;
    var podePreco = GRUPOS_PRECO.indexOf(g) >= 0;
    var hs = [];
    (rsa.headlines || []).forEach(function (h) {
      if (NOTA.test(h.text)) { Logger.log('TROCA ' + g + ' título "' + h.text + '" → (sai)'); mudou = true; return; }
      var t = trocaPreco(h.text, podePreco, g, avisos);
      if (t !== h.text) { Logger.log('TROCA ' + g + ' título "' + h.text + '" → "' + t + '"'); mudou = true; }
      hs.push(fixa({ text: t }, h.pinnedField));
    });
    var ds = [];
    (rsa.descriptions || []).forEach(function (d) {
      var t = d.text;
      if (NOTA.test(t)) {
        t = t.replace(/,?\s*(e\s+)?nota\s*5,0\s*no\s*Google/i, '').replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim();
        if (NOTA.test(t) || t.length < 20) { avisos.push(g + ': descrição com nota 5,0 que precisa de texto novo: "' + d.text + '"'); ok = false; }
      }
      t = trocaPreco(t, podePreco, g, avisos);
      if (t !== d.text) { Logger.log('TROCA ' + g + ' descrição "' + d.text + '" → "' + t + '"'); mudou = true; }
      ds.push(fixa({ text: t }, d.pinnedField));
    });
    if (!mudou) continue;
    if (!ok || hs.length < 3 || ds.length < 2) { avisos.push(g + ': anúncio não alterado (sobrariam ' + hs.length + ' títulos / ' + ds.length + ' descrições ou falta texto novo)'); continue; }
    hs.concat(ds).forEach(function (x) { // {KeyWord:texto} conta só o texto padrão
      if (x.text.replace(/\{KeyWord:([^}]*)\}/i, '$1').length > (hs.indexOf(x) >= 0 ? 30 : 90)) throw new Error('Texto passou do limite: ' + x.text); });
    ops.push({ adOperation: { update: { resourceName: r.adGroupAd.ad.resourceName, responsiveSearchAd: { headlines: hs, descriptions: ds } },
      updateMask: 'responsive_search_ad.headlines,responsive_search_ad.descriptions' } });
  }
}

function recursos(ops, avisos, cid) {
  var n = 0;
  [['customer_asset', 'customerAsset', null], ['campaign_asset', 'campaignAsset', 'campaign'], ['ad_group_asset', 'adGroupAsset', 'adGroup']].forEach(function (nv) {
    var extra = nv[2] === 'campaign' ? ', campaign.resource_name, campaign.status' : nv[2] === 'adGroup' ? ', ad_group.resource_name, ad_group.status' : '';
    var rows = AdsApp.search('SELECT ' + nv[0] + '.resource_name, ' + nv[0] + '.field_type, asset.resource_name, asset.final_urls, asset.final_url_suffix, ' +
      'asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.callout_asset.callout_text' + extra +
      ' FROM ' + nv[0] + ' WHERE ' + nv[0] + ".status = 'ENABLED' AND " + nv[0] + ".field_type IN ('SITELINK', 'CALLOUT')");
    while (rows.hasNext()) {
      var r = rows.next(), link = r[nv[1]], a = r.asset, dono = nv[2] ? r[nv[2]] : null;
      if (dono && dono.status === 'REMOVED') continue;
      var temNota, temPreco, novo;
      if (link.fieldType === 'SITELINK') {
        var s = a.sitelinkAsset || {}, txt = [s.linkText, s.description1 || '', s.description2 || ''];
        temNota = txt.some(function (x) { return NOTA.test(x); }); temPreco = txt.some(function (x) { return DE.test(x); }); DE.lastIndex = 0;
        if (!temNota && !temPreco) continue;
        if (temNota) { avisos.push('sitelink com nota 5,0 (decidir texto): ' + txt.join(' / ')); continue; }
        novo = { sitelinkAsset: { linkText: s.linkText, description1: (s.description1 || '').replace(DE, PARA), description2: (s.description2 || '').replace(DE, PARA) }, finalUrls: a.finalUrls };
        if (a.finalUrlSuffix) novo.finalUrlSuffix = a.finalUrlSuffix;
        Logger.log('TROCA sitelink (' + nv[0] + ') "' + txt.join(' / ') + '" → "' + [novo.sitelinkAsset.linkText, novo.sitelinkAsset.description1, novo.sitelinkAsset.description2].join(' / ') + '"');
      } else {
        var c = (a.calloutAsset || {}).calloutText || '';
        temNota = NOTA.test(c); temPreco = DE.test(c); DE.lastIndex = 0;
        if (!temNota && !temPreco) continue;
        if (temNota) { Logger.log('TROCA destaque (' + nv[0] + ') "' + c + '" → (sai)'); ops.push(remover(nv, link.resourceName)); continue; }
        novo = { calloutAsset: { calloutText: c.replace(DE, PARA) } };
        Logger.log('TROCA destaque (' + nv[0] + ') "' + c + '" → "' + novo.calloutAsset.calloutText + '"');
      }
      n++;
      var tmp = 'customers/' + cid + '/assets/-' + n;
      novo.resourceName = tmp;
      ops.push({ assetOperation: { create: novo } });
      var vinc = { asset: tmp, fieldType: link.fieldType };
      if (nv[2]) vinc[nv[2]] = dono.resourceName;
      var op = {}; op[nv[1] + 'Operation'] = { create: vinc }; ops.push(op);
      ops.push(remover(nv, link.resourceName));
    }
  });
}

function remover(nv, rn) { var op = {}; op[nv[1] + 'Operation'] = { remove: rn }; return op; }
function fixa(o, pin) { if (pin) o.pinnedField = pin; return o; }
function trocaPreco(t, pode, g, avisos) {
  DE.lastIndex = 0;
  if (!DE.test(t)) return t;
  DE.lastIndex = 0;
  if (!pode) { avisos.push(g + ': "' + t + '" tem R$ 280 num grupo motor (não trocado; o certo seria a partir de R$ 320)'); return t; }
  return t.replace(DE, PARA);
}

function conferir() {
  var sobra = [];
  var rows = AdsApp.search('SELECT ad_group.name, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad ' +
    "WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'");
  while (rows.hasNext()) {
    var r = rows.next(), rsa = r.adGroupAd.ad.responsiveSearchAd, g = r.adGroup.name;
    (rsa.headlines || []).concat(rsa.descriptions || []).forEach(function (x) {
      DE.lastIndex = 0;
      if (NOTA.test(x.text) || (GRUPOS_PRECO.indexOf(g) >= 0 && DE.test(x.text))) sobra.push(g + ': ' + x.text);
    });
  }
  Logger.log('CONFERE anúncios: ' + (sobra.length ? 'SOBROU ' + sobra.join(' | ') : 'ok'));
  if (sobra.length) throw new Error('Ainda há texto antigo nos anúncios');
}
