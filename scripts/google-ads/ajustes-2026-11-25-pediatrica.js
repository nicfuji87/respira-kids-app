/**
 * Respira Kids — 25/11/2026: teste de pausar as palavras genéricas do grupo "Fisioterapia pediátrica".
 *
 * Por quê: o grupo gastou ~R$ 457 de 26/10 a 23/11 com 1 paciente (19 conversas até 21/11: 7 convênio,
 * 4 fora do escopo). As buscas genéricas trazem quem procura convênio/ortopedia. Decisão do dono (25/11):
 * pausar as 3 de FRASE mais genéricas e comparar 14–30 dias de conversas qualificadas.
 * Ficam ativas: [fisioterapia infantil] exata (controle), "fisioterapia para bebê", "fisioterapia bebê",
 * "fisioterapia pediátrica", "fisioterapia infantil brasília" etc.
 * Para desfazer: trocar PAUSAR por ATIVAR abaixo (mesmo script).
 */
var CONTA = '8744391492';
var GRUPO = 'Fisioterapia pediátrica';
var PALAVRAS = ['fisioterapia infantil', 'fisioterapeuta infantil', 'fisioterapia para criança']; // só correspondência de FRASE
var ACAO = 'PAUSAR'; // 'PAUSAR' ou 'ATIVAR'

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  var alvo = ACAO === 'PAUSAR' ? 'PAUSED' : 'ENABLED';
  var k = ler(), ops = [];
  PALAVRAS.forEach(function (p) {
    var x = k[p];
    if (!x) throw new Error('Palavra de frase não encontrada no grupo: ' + p);
    if (x.status === alvo) { Logger.log('OK já ' + alvo + ': "' + p + '"'); return; }
    ops.push({ adGroupCriterionOperation: { update: { resourceName: x.rn, status: alvo }, updateMask: 'status' } });
    Logger.log((preview ? 'VISUALIZAÇÃO ' : '') + ACAO + ' "' + p + '" [frase] (estava ' + x.status + ')');
  });
  if (ops.length) {
    var res = AdsApp.mutateAll(ops, { partialFailure: false });
    var erros = res.filter(function (r) { return !r.isSuccessful(); }).map(function (r) { return r.getErrorMessages(); });
    if (erros.length) throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
  }
  if (preview) return;
  var depois = ler(), falha = PALAVRAS.filter(function (p) { return depois[p].status !== alvo; });
  var ativas = Object.keys(depois).filter(function (p) { return depois[p].status === 'ENABLED'; }).length;
  Logger.log('CONFERE ' + (falha.length ? 'FALHA ' + falha.join(', ') : 'ok') + ' — ' + ativas + ' palavras de frase seguem ativas no grupo (fora as exatas)');
  if (falha.length) throw new Error('Status fora do esperado');
}

function ler() {
  var rows = AdsApp.search("SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.status FROM ad_group_criterion " +
    "WHERE ad_group.name = '" + GRUPO + "' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED' AND ad_group_criterion.type = 'KEYWORD' " +
    "AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.keyword.match_type = 'PHRASE'");
  var o = {};
  while (rows.hasNext()) { var c = rows.next().adGroupCriterion; o[c.keyword.text.toLowerCase()] = { rn: c.resourceName, status: c.status }; }
  return o;
}
