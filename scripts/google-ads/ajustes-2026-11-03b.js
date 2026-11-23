/**
 * Respira Kids — correção de 03/11/2026 (tarde), depois da auditoria externa.
 *
 * 1. Negativas das listas: as listas nasceram em FRASE (criar-campanhas.js, kw()), mas
 *    os scripts de 28/10, 29/10, 30/10 e 03/11 usavam lista.addNegativeKeywords('texto'),
 *    que cria AMPLA. Uma negativa ampla de várias palavras bloqueia qualquer busca com
 *    todas as palavras em qualquer ordem ("idade para", "sinais que", "tipos de" pegavam
 *    bem mais que o pretendido). Aqui cada AMPLA vira FRASE (cria a frase se faltar e
 *    remove a ampla), tudo num lote atômico: ou troca tudo, ou nada.
 * 2. "fisioterapia neonatal": frase → exata. "Neonatal" também é UTI/hospital; as buscas
 *    "fisioterapia pediátrica e neonatal" já entram pela frase "fisioterapia pediátrica".
 * 3. Só leitura: sitelinks reprovados ainda ligados (conta, campanha ou grupo).
 *
 * Confere a conta antes de mexer. Em visualização não confere o resultado (o Google
 * não aplica nada); depois de Executar, relê a conta e falha se sobrar ampla.
 */
var CONTA = '8744391492';
var GRUPO_NEONATAL = 'Fisioterapia pediátrica';
var NEONATAL = 'fisioterapia neonatal';

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();

  var ops = negativasParaFrase().concat(neonatalExata());
  if (ops.length) {
    var res = AdsApp.mutateAll(ops, { partialFailure: false });
    var erros = res
      .filter(function (x) {
        return !x.isSuccessful();
      })
      .map(function (x) {
        return x.getErrorMessages();
      });
    if (erros.length)
      throw new Error('Lote recusado (nada mudou): ' + erros.join(' / '));
    Logger.log(
      (preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + ops.length + ' operações'
    );
  } else Logger.log('OK nada a trocar');

  if (!preview) conferir();
  sitelinksReprovados();
}

function negativasParaFrase() {
  var rows = AdsApp.search(
    'SELECT shared_set.resource_name, shared_set.name, shared_criterion.resource_name, ' +
      'shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion ' +
      "WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'"
  );
  var frase = {},
    amplas = [];
  while (rows.hasNext()) {
    var r = rows.next(),
      k = r.sharedCriterion.keyword,
      chave = r.sharedSet.resourceName + '|' + k.text.toLowerCase();
    if (k.matchType === 'PHRASE') frase[chave] = 1;
    else if (k.matchType === 'BROAD')
      amplas.push({
        chave: chave,
        set: r.sharedSet.resourceName,
        lista: r.sharedSet.name,
        texto: k.text,
        rn: r.sharedCriterion.resourceName,
      });
  }
  var cria = [],
    remove = [],
    porLista = {};
  amplas.forEach(function (a) {
    if (!frase[a.chave]) {
      frase[a.chave] = 1;
      cria.push({
        sharedCriterionOperation: {
          create: {
            sharedSet: a.set,
            keyword: { text: a.texto, matchType: 'PHRASE' },
          },
        },
      });
    }
    remove.push({ sharedCriterionOperation: { remove: a.rn } });
    (porLista[a.lista] = porLista[a.lista] || []).push(a.texto);
  });
  for (var l in porLista)
    Logger.log(
      'AMPLA → FRASE em ' +
        l +
        ' (' +
        porLista[l].length +
        '): ' +
        porLista[l].join(' | ')
    );
  return cria.concat(remove);
}

function neonatalExata() {
  var rows = AdsApp.search(
    'SELECT ad_group.resource_name, ad_group_criterion.resource_name, ad_group_criterion.keyword.match_type, ' +
      "ad_group_criterion.status FROM ad_group_criterion WHERE ad_group.name = '" +
      GRUPO_NEONATAL +
      "' " +
      "AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' " +
      "AND ad_group_criterion.keyword.text = '" +
      NEONATAL +
      "'"
  );
  var ag = null,
    temExata = false,
    frases = [];
  while (rows.hasNext()) {
    var r = rows.next();
    ag = r.adGroup.resourceName;
    if (r.adGroupCriterion.keyword.matchType === 'EXACT') temExata = true;
    else frases.push(r.adGroupCriterion.resourceName);
  }
  if (!ag) {
    var g = AdsApp.search(
      "SELECT ad_group.resource_name FROM ad_group WHERE ad_group.name = '" +
        GRUPO_NEONATAL +
        "' AND ad_group.status != 'REMOVED'"
    );
    if (!g.hasNext())
      throw new Error('Grupo não encontrado: ' + GRUPO_NEONATAL);
    ag = g.next().adGroup.resourceName;
  }
  var ops = [];
  if (!temExata)
    ops.push({
      adGroupCriterionOperation: {
        create: {
          adGroup: ag,
          status: 'ENABLED',
          keyword: { text: NEONATAL, matchType: 'EXACT' },
        },
      },
    });
  frases.forEach(function (rn) {
    ops.push({ adGroupCriterionOperation: { remove: rn } });
  });
  Logger.log(
    ops.length
      ? 'NEONATAL: ' +
          (temExata ? '' : 'cria [exata]; ') +
          'remove ' +
          frases.length +
          ' outra(s)'
      : 'OK neonatal já só em exata'
  );
  return ops;
}

function conferir() {
  var rows = AdsApp.search(
    'SELECT shared_set.name, shared_criterion.keyword.match_type FROM shared_criterion ' +
      "WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'"
  );
  var n = { PHRASE: 0, BROAD: 0, EXACT: 0 };
  while (rows.hasNext()) n[rows.next().sharedCriterion.keyword.matchType]++;
  Logger.log(
    'CONFERE listas: frase ' +
      n.PHRASE +
      ', ampla ' +
      n.BROAD +
      ', exata ' +
      n.EXACT
  );
  if (n.BROAD) throw new Error('Sobrou negativa ampla nas listas: ' + n.BROAD);
  rows = AdsApp.search(
    "SELECT ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group.name = '" +
      GRUPO_NEONATAL +
      "' " +
      "AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.keyword.text = '" +
      NEONATAL +
      "'"
  );
  var tipos = [];
  while (rows.hasNext())
    tipos.push(rows.next().adGroupCriterion.keyword.matchType);
  Logger.log('CONFERE neonatal: ' + tipos.join(', '));
  if (tipos.join() !== 'EXACT')
    throw new Error('Neonatal fora do esperado: ' + tipos.join());
}

function sitelinksReprovados() {
  var fontes = [
    [
      'conta',
      "SELECT asset.id, asset.sitelink_asset.link_text, asset.policy_summary.approval_status FROM customer_asset WHERE customer_asset.field_type = 'SITELINK' AND customer_asset.status = 'ENABLED'",
    ],
    [
      'campanha',
      "SELECT campaign.name, asset.id, asset.sitelink_asset.link_text, asset.policy_summary.approval_status FROM campaign_asset WHERE campaign_asset.field_type = 'SITELINK' AND campaign_asset.status = 'ENABLED'",
    ],
    [
      'grupo',
      "SELECT ad_group.name, asset.id, asset.sitelink_asset.link_text, asset.policy_summary.approval_status FROM ad_group_asset WHERE ad_group_asset.field_type = 'SITELINK' AND ad_group_asset.status = 'ENABLED'",
    ],
  ];
  var total = 0,
    ruins = 0;
  fontes.forEach(function (f) {
    var rows = AdsApp.search(f[1]);
    while (rows.hasNext()) {
      var r = rows.next(),
        st = (r.asset.policySummary || {}).approvalStatus;
      total++;
      if (st !== 'APPROVED') {
        ruins++;
        Logger.log(
          'SITELINK ' +
            f[0] +
            ' ' +
            st +
            ': ' +
            r.asset.sitelinkAsset.linkText +
            ' (' +
            r.asset.id +
            ')'
        );
      }
    }
  });
  Logger.log('SITELINKS ligados: ' + total + ', fora de aprovado: ' + ruins);
}
