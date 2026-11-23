/**
 * Respira Kids — 23/11/2026 (2): bloquear buscas sobre autismo nas campanhas de serviço.
 *
 * Decisão do dono (23/11): o público é de bebês e prematuros, fase em que o autismo raramente é
 * diagnosticado; a clínica não tem oferta para TEA. Antes só o grupo Motor negava "autismo"/"tea",
 * e "autismo" não pega "autistas" (caso: "fisioterapia em crianças autistas" entrou pela Pediátrica).
 *
 * Lista "RK NEG | Adulto e outras áreas" (vinculada a Respiratória e Desenvolvimento), FRASE:
 *   + autismo, autista, autistas, tea
 * Idempotente; lote atômico; confere a conta depois de Executar.
 */
var CONTA = '8744391492';
var LISTA = 'RK NEG | Adulto e outras áreas';
var ADICIONAR = ['autismo', 'autista', 'autistas', 'tea'];

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  var l = lerLista();
  var novas = ADICIONAR.filter(function (t) { return !l.frase[t]; });
  Logger.log('NEGATIVAS em ' + LISTA + ': + ' + (novas.join(', ') || 'nada (já estavam)'));
  if (novas.length) {
    var res = AdsApp.mutateAll(novas.map(function (t) {
      return { sharedCriterionOperation: { create: { sharedSet: l.set, keyword: { text: t, matchType: 'PHRASE' } } } };
    }), { partialFailure: false });
    var erros = res.filter(function (x) { return !x.isSuccessful(); }).map(function (x) { return x.getErrorMessages(); });
    if (erros.length) throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
    Logger.log((preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + novas.length + ' operações');
  }
  if (preview) return;
  var falta = ADICIONAR.filter(function (t) { return !lerLista().frase[t]; });
  Logger.log('CONFERE ' + LISTA + ': ' + (falta.length ? 'FALTA ' + falta.join(', ') : 'ok'));
  if (falta.length) throw new Error('Lista fora do esperado');
  var vinc = [], rows = AdsApp.search("SELECT campaign.name FROM campaign_shared_set WHERE shared_set.resource_name = '" + l.set + "' AND campaign_shared_set.status = 'ENABLED'");
  while (rows.hasNext()) vinc.push(rows.next().campaign.name);
  Logger.log('CONFERE lista vinculada a: ' + vinc.join(', '));
}

function lerLista() {
  var rows = AdsApp.search("SELECT shared_set.resource_name FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS' " +
    "AND shared_set.status = 'ENABLED' AND shared_set.name = '" + LISTA + "'");
  if (!rows.hasNext()) throw new Error('Lista não encontrada: ' + LISTA);
  var set = rows.next().sharedSet.resourceName, frase = {};
  var ks = AdsApp.search("SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.resource_name = '" + set + "'");
  while (ks.hasNext()) { var k = ks.next().sharedCriterion.keyword; if (k.matchType === 'PHRASE') frase[k.text.toLowerCase()] = 1; }
  return { set: set, frase: frase };
}
