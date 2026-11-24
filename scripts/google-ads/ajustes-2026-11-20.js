/**
 * Respira Kids — ajustes de 20/11/2026 (idempotente, lote atômico).
 *
 * 1. Orçamento de Desenvolvimento R$ 30 → R$ 35/dia. Perdia 13% das impressões por
 *    orçamento na semana de 16/11 (29% em 17/11) e gastava R$ 43–68/dia. Respiratória fica
 *    em R$ 20: gasta ~R$ 16 por dia útil e quase nunca perde por orçamento.
 * 2. Negativas em FRASE:
 *    - Concorrentes: "heads" (clínica de capacete craniano; R$ 13,38 em 3 cliques).
 *    - Informativo e caseiro: "guideline", "artigo" (busca técnica/acadêmica).
 *    - Adulto e outras áreas: "fratura", "gesso" (a clínica não atende pós-fratura).
 *    Ficam de fora de propósito: "é normal", "o que fazer", "tem cura" (podem ser pais
 *    que agendariam).
 *
 * Confere a conta. Em visualização não confere o resultado; depois de Executar, relê a
 * conta e falha se algo não ficou como esperado.
 */
var CONTA = '8744391492';
var ORCAMENTO = { 'RK | Pesquisa | Desenvolvimento | DF': 35 };
var NEGATIVAS = {
  'RK NEG | Concorrentes': ['heads'],
  'RK NEG | Informativo e caseiro': ['guideline', 'artigo'],
  'RK NEG | Adulto e outras áreas': ['fratura', 'gesso'],
};

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  var ops = orcamentos().concat(negativas());
  if (ops.length) {
    var res = AdsApp.mutateAll(ops, { partialFailure: false });
    var erros = res.filter(function (x) { return !x.isSuccessful(); }).map(function (x) { return x.getErrorMessages(); });
    if (erros.length) throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
    Logger.log((preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + ops.length + ' operações');
  } else Logger.log('OK nada a mudar');
  if (!preview) conferir();
}

function orcamentos() {
  var ops = [];
  for (var nome in ORCAMENTO) {
    var rows = AdsApp.search("SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.reference_count " +
      "FROM campaign WHERE campaign.name = '" + nome + "'");
    if (!rows.hasNext()) throw new Error('Campanha não encontrada: ' + nome);
    var b = rows.next().campaignBudget, atual = Number(b.amountMicros) / 1e6, novo = ORCAMENTO[nome];
    if (Number(b.referenceCount) > 1) throw new Error('Orçamento compartilhado em ' + nome + ' (' + b.referenceCount + ' campanhas)');
    if (atual === novo) { Logger.log('OK orçamento já é R$ ' + novo + ' em ' + nome); continue; }
    ops.push({ campaignBudgetOperation: { update: { resourceName: b.resourceName, amountMicros: String(Math.round(novo * 1e6)) }, updateMask: 'amount_micros' } });
    Logger.log('ORÇAMENTO ' + nome + ': R$ ' + atual + ' → R$ ' + novo);
  }
  return ops;
}

function negativas() {
  var ops = [];
  for (var nome in NEGATIVAS) {
    var rows = AdsApp.search("SELECT shared_set.resource_name FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS' " +
      "AND shared_set.status = 'ENABLED' AND shared_set.name = '" + nome + "'");
    if (!rows.hasNext()) throw new Error('Lista não encontrada: ' + nome);
    var set = rows.next().sharedSet.resourceName, frase = {};
    var ks = AdsApp.search("SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion " +
      "WHERE shared_set.resource_name = '" + set + "'");
    while (ks.hasNext()) { var k = ks.next().sharedCriterion.keyword; if (k.matchType === 'PHRASE') frase[k.text.toLowerCase()] = 1; }
    var novas = NEGATIVAS[nome].filter(function (t) { return !frase[t.toLowerCase()]; });
    novas.forEach(function (t) { ops.push({ sharedCriterionOperation: { create: { sharedSet: set, keyword: { text: t, matchType: 'PHRASE' } } } }); });
    Logger.log(novas.length ? 'NEGATIVAS em ' + nome + ': ' + novas.join(', ') : 'OK negativas já estão em ' + nome);
  }
  return ops;
}

function conferir() {
  for (var nome in ORCAMENTO) {
    var b = AdsApp.search("SELECT campaign_budget.amount_micros FROM campaign WHERE campaign.name = '" + nome + "'").next().campaignBudget;
    var v = Number(b.amountMicros) / 1e6;
    Logger.log('CONFERE orçamento ' + nome + ': R$ ' + v);
    if (v !== ORCAMENTO[nome]) throw new Error('Orçamento fora do esperado em ' + nome + ': ' + v);
  }
  for (var lista in NEGATIVAS) {
    var achou = {};
    var ks = AdsApp.search("SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion " +
      "WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.name = '" + lista + "'");
    while (ks.hasNext()) { var k = ks.next().sharedCriterion.keyword; if (k.matchType === 'PHRASE') achou[k.text.toLowerCase()] = 1; }
    var falta = NEGATIVAS[lista].filter(function (t) { return !achou[t]; });
    Logger.log('CONFERE ' + lista + ': ' + (falta.length ? 'FALTA ' + falta.join(', ') : 'ok'));
    if (falta.length) throw new Error('Negativas faltando em ' + lista + ': ' + falta.join(', '));
  }
}
