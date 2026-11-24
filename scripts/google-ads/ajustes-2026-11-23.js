/**
 * Respira Kids — ajustes de 23/11/2026: escopo clínico nos anúncios (idempotente, lote atômico).
 *
 * Definição do dono (21 e 23/11/2026): atende crianças ATÉ 12 ANOS em respiratória,
 * desenvolvimento motor, assimetria craniana e torcicolo congênito; prematuros e
 * pós-cirúrgico (cardíaca/torácica) sim; respiração bucal entra como respiratória;
 * ortopedia/pós-fratura NÃO. A Ju já foi ajustada (ESCOPO_ATENDIMENTO, commit 0109924).
 *
 * 1. Lista "RK NEG | Adulto e outras áreas" (FRASE):
 *    + "entorse", "luxação", "ortopedia", "adolescente", "adolescentes"
 *    ("fratura" e "gesso" já entraram em 20/11; "ortopédica", "joelho", "ombro", "coluna" já existiam).
 *    − "uti" → troca por "uti adulto" e "intensivista": o "uti" sozinho barrava famílias de
 *      prematuros que saíram da UTI neonatal (público da clínica).
 * 2. Frases de destaque (conta): "Crianças até 12 anos" e "Prematuros e pós-cirurgia".
 *
 * Confere a conta. Em visualização não confere o resultado; depois de Executar, relê a
 * conta e falha se algo não ficou como esperado.
 */
var CONTA = '8744391492';
var LISTA = 'RK NEG | Adulto e outras áreas';
var ADICIONAR = ['entorse', 'luxação', 'ortopedia', 'adolescente', 'adolescentes', 'uti adulto', 'intensivista'];
var REMOVER = ['uti'];
var DESTAQUES = ['Crianças até 12 anos', 'Prematuros e pós-cirurgia'];

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  var ops = negativas().concat(destaques(cid));
  if (ops.length) {
    var res = AdsApp.mutateAll(ops, { partialFailure: false });
    var erros = res.filter(function (x) { return !x.isSuccessful(); }).map(function (x) { return x.getErrorMessages(); });
    if (erros.length) throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
    Logger.log((preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + ops.length + ' operações');
  } else Logger.log('OK nada a mudar');
  if (!preview) conferir();
}

function lerLista() {
  var rows = AdsApp.search("SELECT shared_set.resource_name FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS' " +
    "AND shared_set.status = 'ENABLED' AND shared_set.name = '" + LISTA + "'");
  if (!rows.hasNext()) throw new Error('Lista não encontrada: ' + LISTA);
  var set = rows.next().sharedSet.resourceName, frase = {};
  var ks = AdsApp.search("SELECT shared_criterion.resource_name, shared_criterion.keyword.text, shared_criterion.keyword.match_type " +
    "FROM shared_criterion WHERE shared_set.resource_name = '" + set + "'");
  while (ks.hasNext()) {
    var r = ks.next().sharedCriterion;
    if (r.keyword.matchType === 'PHRASE') frase[r.keyword.text.toLowerCase()] = r.resourceName;
  }
  return { set: set, frase: frase };
}

function negativas() {
  var l = lerLista(), ops = [];
  var novas = ADICIONAR.filter(function (t) { return !l.frase[t.toLowerCase()]; });
  novas.forEach(function (t) { ops.push({ sharedCriterionOperation: { create: { sharedSet: l.set, keyword: { text: t, matchType: 'PHRASE' } } } }); });
  var sai = REMOVER.filter(function (t) { return l.frase[t.toLowerCase()]; });
  sai.forEach(function (t) { ops.push({ sharedCriterionOperation: { remove: l.frase[t.toLowerCase()] } }); });
  Logger.log('NEGATIVAS em ' + LISTA + ': + ' + (novas.join(', ') || 'nada') + ' | − ' + (sai.join(', ') || 'nada'));
  return ops;
}

function destaques(cid) {
  var rows = AdsApp.search("SELECT asset.callout_asset.callout_text FROM customer_asset WHERE customer_asset.field_type = 'CALLOUT' " +
    "AND customer_asset.status = 'ENABLED'");
  var tem = {};
  while (rows.hasNext()) tem[rows.next().asset.calloutAsset.calloutText] = 1;
  var ops = [], n = 0;
  DESTAQUES.forEach(function (t) {
    if (tem[t]) { Logger.log('OK destaque já existe: ' + t); return; }
    if (t.length > 25) throw new Error('Destaque com mais de 25 caracteres: ' + t);
    n++;
    var tmp = 'customers/' + cid + '/assets/-' + n;
    ops.push({ assetOperation: { create: { resourceName: tmp, calloutAsset: { calloutText: t } } } });
    ops.push({ customerAssetOperation: { create: { asset: tmp, fieldType: 'CALLOUT' } } });
    Logger.log('DESTAQUE novo: ' + t);
  });
  return ops;
}

function conferir() {
  var l = lerLista();
  var falta = ADICIONAR.filter(function (t) { return !l.frase[t.toLowerCase()]; });
  var sobra = REMOVER.filter(function (t) { return l.frase[t.toLowerCase()]; });
  Logger.log('CONFERE ' + LISTA + ': ' + (falta.length || sobra.length ? 'FALTA ' + falta.join(', ') + ' SOBRA ' + sobra.join(', ') : 'ok'));
  if (falta.length || sobra.length) throw new Error('Lista fora do esperado');
  var rows = AdsApp.search("SELECT asset.callout_asset.callout_text FROM customer_asset WHERE customer_asset.field_type = 'CALLOUT' " +
    "AND customer_asset.status = 'ENABLED'");
  var tem = {};
  while (rows.hasNext()) tem[rows.next().asset.calloutAsset.calloutText] = 1;
  var semDestaque = DESTAQUES.filter(function (t) { return !tem[t]; });
  Logger.log('CONFERE destaques: ' + (semDestaque.length ? 'FALTA ' + semDestaque.join(', ') : 'ok'));
  if (semDestaque.length) throw new Error('Destaques faltando');
}
