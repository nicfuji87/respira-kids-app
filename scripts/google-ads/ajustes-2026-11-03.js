/**
 * Respira Kids — ajustes de 03/11/2026 (idempotente).
 *
 * 1. Negativas novas de "como fazer" (termos de 30/10–03/11) e 3 concorrentes.
 * 2. Palavras novas para buscas que já chegavam sem palavra própria:
 *    "fisioterapia pulmonar infantil/bebê" (Respiratória) e "fisioterapia neonatal"
 *    (Fisioterapia pediátrica; lead de 02/11 pediu "fisioterapia neonatal").
 * 3. Teto de CPC do Maximizar cliques: R$ 3,50 → R$ 5,00 em Respiratória e
 *    Desenvolvimento. Elas perdem 50–90% das impressões por CLASSIFICAÇÃO (não por
 *    orçamento: 0%) e não gastam o orçamento do dia. CPC médio hoje R$ 2,70–3,40.
 * 4. Torcicolo: o site não tem mais "vira" (respirakids-site#29). Anúncio e sitelink
 *    reprovados por "VIRA A" são recriados (cópia com "Atendimento Particular", como os
 *    outros grupos) para passar por revisão nova; os reprovados saem.
 *
 * Rodar no script "Campanhas": Visualizar, depois Executar; restaurar criar-campanhas.js.
 */
var NEGATIVAS = {
  'RK NEG | Informativo e caseiro': [
    'atividades',
    'alto contraste',
    'como incentivar',
    'como deixar',
    'tipos de',
    'sensoriais',
    'sensorial',
    'hidroterapia',
  ],
  'RK NEG | Concorrentes': ['cardiopulmonary', 'respicare', 'fisioemov'],
};
var PALAVRAS = [
  ['Fisioterapia respiratória infantil', '"fisioterapia pulmonar infantil"'],
  ['Fisioterapia respiratória infantil', '"fisioterapia pulmonar bebê"'],
  // Exata desde a correção de 03/11 à tarde (ajustes-2026-11-03b.js): "neonatal" também é UTI.
  ['Fisioterapia pediátrica', '[fisioterapia neonatal]'],
];
var CONTA = '8744391492';
var TETO_CPC = {
  'RK | Pesquisa | Respiratória | DF': 5.0,
  'RK | Pesquisa | Desenvolvimento | DF': 5.0,
};
var GRUPO_TORCICOLO = 'Torcicolo congênito';
var TITULO_PARTICULAR = 'Atendimento Particular';
var DESC_SEM_PRECO =
  'Atendimento particular, sem convênio. Nota fiscal para pedir reembolso ao plano.';
var SITELINK_TORCICOLO = 'Torcicolo em Bebês';

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  for (var nome in NEGATIVAS) acrescentar(nome, NEGATIVAS[nome]);
  PALAVRAS.forEach(function (p) {
    palavra(p[0], p[1]);
  });
  for (var c in TETO_CPC) tetoCpc(cid, c, TETO_CPC[c]);
  torcicoloAnuncio();
  torcicoloSitelink(cid);
}

// 03/11/2026: negativas sempre em FRASE ("texto"); só conta como existente a frase.
function acrescentar(nomeLista, termos) {
  var it = AdsApp.negativeKeywordLists()
    .withCondition("shared_set.name = '" + nomeLista + "'")
    .get();
  if (!it.hasNext()) throw new Error('Lista não encontrada: ' + nomeLista);
  var lista = it.next(),
    existentes = {};
  var ks = lista.negativeKeywords().get();
  while (ks.hasNext()) {
    var kn = ks.next();
    if (kn.getMatchType() === 'PHRASE')
      existentes[
        kn
          .getText()
          .replace(/["\[\]]/g, '')
          .toLowerCase()
      ] = 1;
  }
  var novas = termos.filter(function (t) {
    return !existentes[t.toLowerCase()];
  });
  if (novas.length) {
    lista.addNegativeKeywords(
      novas.map(function (t) {
        return '"' + t + '"';
      })
    );
    Logger.log('NEGATIVAS em ' + nomeLista + ': ' + novas.join(', '));
  } else Logger.log('OK negativas já estão em ' + nomeLista);
}

// Existe = mesmo grupo + texto + tipo de correspondência (frase "x", exata [x], ampla x).
// Recusa do Google derruba o script (não fica só no registro).
function palavra(grupo, texto) {
  var limpo = texto.replace(/["\[\]]/g, '');
  var tipo = /^\[/.test(texto)
    ? 'EXACT'
    : /^"/.test(texto)
      ? 'PHRASE'
      : 'BROAD';
  var ex = AdsApp.keywords()
    .withCondition("ad_group.name = '" + grupo + "'")
    .withCondition("ad_group_criterion.keyword.text = '" + limpo + "'")
    .withCondition("ad_group_criterion.keyword.match_type = '" + tipo + "'")
    .get();
  if (ex.hasNext()) {
    Logger.log('OK palavra já existe: ' + texto + ' em ' + grupo);
    return;
  }
  var gs = AdsApp.adGroups()
    .withCondition("ad_group.name = '" + grupo + "'")
    .get();
  if (gs.totalNumEntities() !== 1)
    throw new Error(
      'Grupo ' + grupo + ': ' + gs.totalNumEntities() + ' encontrados'
    );
  var op = gs.next().newKeywordBuilder().withText(texto).build();
  if (!op.isSuccessful())
    throw new Error(
      'RECUSADA palavra ' + texto + ' em ' + grupo + ': ' + op.getErrors()
    );
  Logger.log('PALAVRA nova ' + texto + ' em ' + grupo);
}

function tetoCpc(cid, nome, reais) {
  var rows = AdsApp.search(
    'SELECT campaign.resource_name, campaign.bidding_strategy_type, ' +
      "campaign.target_spend.cpc_bid_ceiling_micros FROM campaign WHERE campaign.name = '" +
      nome +
      "'"
  );
  if (!rows.hasNext()) throw new Error('Campanha não encontrada: ' + nome);
  var r = rows.next(),
    atual =
      Number((r.campaign.targetSpend || {}).cpcBidCeilingMicros || 0) / 1e6;
  if (r.campaign.biddingStrategyType !== 'TARGET_SPEND') {
    Logger.log(
      'ATENÇÃO ' +
        nome +
        ' não está em Maximizar cliques: ' +
        r.campaign.biddingStrategyType
    );
    return;
  }
  if (atual === reais) {
    Logger.log('OK teto já é R$ ' + reais + ' em ' + nome);
    return;
  }
  var res = AdsApp.mutate({
    campaignOperation: {
      update: {
        resourceName: r.campaign.resourceName,
        targetSpend: { cpcBidCeilingMicros: Math.round(reais * 1e6) },
      },
      updateMask: 'target_spend.cpc_bid_ceiling_micros',
    },
  });
  if (!res.isSuccessful())
    throw new Error('Falha no teto de ' + nome + ': ' + res.getErrorMessages());
  Logger.log('TETO CPC ' + nome + ': R$ ' + atual + ' → R$ ' + reais);
}

function torcicoloAnuncio() {
  var rows = AdsApp.search(
    'SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ' +
      'ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ' +
      'ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad ' +
      "WHERE ad_group.name = '" +
      GRUPO_TORCICOLO +
      "' AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'"
  );
  var novo = null,
    velhos = [],
    agId = null;
  while (rows.hasNext()) {
    var r = rows.next(),
      a = r.adGroupAd.ad,
      rsa = a.responsiveSearchAd;
    agId = r.adGroup.id;
    var item = {
      id: a.id,
      status: r.adGroupAd.status,
      aprov: r.adGroupAd.policySummary.approvalStatus,
      rsa: rsa,
      url: (a.finalUrls || [])[0],
    };
    if (
      (rsa.headlines || []).some(function (h) {
        return h.text === TITULO_PARTICULAR;
      })
    )
      novo = item;
    else velhos.push(item);
  }
  if (!agId) {
    Logger.log('ATENÇÃO sem anúncio em ' + GRUPO_TORCICOLO);
    return;
  }
  if (!novo) {
    var base = velhos[0];
    var titulos = (base.rsa.headlines || [])
      .filter(function (h) {
        return h.text !== 'Nota Fiscal Para Reembolso';
      })
      .map(function (h) {
        var o = { text: h.text };
        if (h.pinnedField) o.pinning = h.pinnedField;
        return o;
      });
    titulos.splice(1, 0, { text: TITULO_PARTICULAR, pinning: 'HEADLINE_2' });
    if (titulos.length > 15)
      titulos = titulos
        .filter(function (h) {
          return h.text !== 'Acolhimento de Verdade';
        })
        .slice(0, 15);
    var descs = (base.rsa.descriptions || []).map(function (d) {
      return { text: d.text };
    });
    var i = -1;
    descs.forEach(function (d, j) {
      if (i < 0 && /reembolso|nota fiscal/i.test(d.text)) i = j;
    });
    if (i >= 0) descs.splice(i, 1);
    else if (descs.length >= 4) descs.pop();
    descs.unshift({ text: DESC_SEM_PRECO, pinning: 'DESCRIPTION_1' });
    var txt = titulos
      .map(function (h) {
        return h.text;
      })
      .concat(
        descs.map(function (d) {
          return d.text;
        })
      )
      .join(' ');
    if (/\bvira\b/i.test(txt))
      throw new Error('Texto do anúncio ainda tem "vira": ' + txt);
    var g = AdsApp.adGroups().withIds([agId]).get().next();
    var b = g
      .newAd()
      .responsiveSearchAdBuilder()
      .withHeadlines(titulos)
      .withDescriptions(descs)
      .withFinalUrl(base.url);
    if (base.rsa.path1) b = b.withPath1(base.rsa.path1);
    if (base.rsa.path2) b = b.withPath2(base.rsa.path2);
    var op = b.build();
    if (!op.isSuccessful())
      throw new Error('Falha ao criar anúncio de torcicolo: ' + op.getErrors());
    Logger.log(
      'CRIADO anúncio de torcicolo (' +
        titulos.length +
        ' títulos) → ' +
        base.url
    );
  } else if (novo.aprov === 'APPROVED' || novo.aprov === 'APPROVED_LIMITED') {
    Logger.log(
      'OK anúncio novo de torcicolo ' +
        novo.id +
        ' aprovado (' +
        novo.aprov +
        ', ' +
        novo.status +
        ')'
    );
  } else if (
    novo.aprov === 'DISAPPROVED' ||
    novo.aprov === 'AREA_OF_INTEREST_ONLY'
  ) {
    // Criar outra cópia seria contornar a revisão: o caminho é contestar/abrir chamado.
    Logger.log(
      'ATENÇÃO anúncio novo de torcicolo ' +
        novo.id +
        ' REPROVADO (' +
        novo.aprov +
        '): não recriar; contestar no suporte'
    );
  } else
    Logger.log(
      'AGUARDANDO revisão do anúncio novo de torcicolo ' +
        novo.id +
        ' (' +
        novo.aprov +
        ')'
    );
  // Criado não é aprovado: confira a linha acima numa execução seguinte (03/11: APPROVED às 16h).
  velhos.forEach(function (x) {
    if (x.status !== 'ENABLED' || x.aprov !== 'DISAPPROVED') return;
    var it = AdsApp.ads()
      .withCondition('ad_group_ad.ad.id = ' + x.id)
      .withCondition('ad_group.id = ' + agId)
      .get();
    if (it.hasNext()) {
      it.next().pause();
      Logger.log('PAUSADO anúncio reprovado de torcicolo ' + x.id);
    }
  });
}

function torcicoloSitelink(cid) {
  // Reprovado = decisão de política do recurso (asset.policy_summary), não primary_status:
  // NOT_ELIGIBLE também pode ser campanha pausada, agenda etc.
  var rows = AdsApp.search(
    'SELECT customer_asset.resource_name, customer_asset.status, customer_asset.primary_status, ' +
      'asset.resource_name, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, ' +
      'asset.sitelink_asset.description2, asset.policy_summary.approval_status FROM customer_asset ' +
      "WHERE customer_asset.field_type = 'SITELINK' AND customer_asset.status = 'ENABLED'"
  );
  var velho = null,
    novoOk = false,
    novoRuim = null;
  while (rows.hasNext()) {
    var r = rows.next(),
      aprov = (r.asset.policySummary || {}).approvalStatus;
    if (r.asset.sitelinkAsset.linkText !== SITELINK_TORCICOLO) continue;
    var recriado =
      r.asset.sitelinkAsset.description1 === 'Avaliação desde o 1º mês';
    if (aprov !== 'DISAPPROVED') novoOk = true;
    else if (recriado) novoRuim = r;
    else velho = r;
  }
  if (novoRuim)
    Logger.log(
      'ATENÇÃO sitelink recriado de torcicolo REPROVADO: não recriar; contestar no suporte'
    );
  if (!velho) {
    Logger.log(
      'OK sitelink de torcicolo sem reprovado ativo' +
        (novoOk ? ' (novo ligado)' : '')
    );
    return;
  }
  var s = velho.asset.sitelinkAsset,
    url = (velho.asset.finalUrls || [])[0];
  Logger.log('Sitelink reprovado: ' + s.linkText + ' → ' + url);
  var ops = [];
  if (!novoOk) {
    var tmp = 'customers/' + cid + '/assets/-1';
    ops.push({
      assetOperation: {
        create: {
          resourceName: tmp,
          finalUrls: [url],
          // textos levemente diferentes: o Google deduplica recurso idêntico (voltaria o reprovado)
          sitelinkAsset: {
            linkText: s.linkText,
            description1: 'Avaliação desde o 1º mês',
            description2: 'Orientação para a família',
          },
        },
      },
    });
    ops.push({
      customerAssetOperation: { create: { asset: tmp, fieldType: 'SITELINK' } },
    });
  }
  ops.push({
    customerAssetOperation: { remove: velho.customerAsset.resourceName },
  });
  var res = AdsApp.mutateAll(ops, { partialFailure: false });
  res.forEach(function (x) {
    if (!x.isSuccessful())
      throw new Error('Falha no sitelink: ' + x.getErrorMessages());
  });
  Logger.log(
    'SITELINK de torcicolo recriado (' +
      ops.length +
      ' operações) e o reprovado desligado da conta'
  );
}
