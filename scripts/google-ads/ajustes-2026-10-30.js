/**
 * Respira Kids — ajustes de 30/10/2026 (idempotente; pode rodar mais de uma vez).
 *
 * Contexto: metade das conversas pagas (e ~1 em 4 de todas as conversas novas) pergunta
 * de convênio; nenhuma busca citou convênio — a pessoa só pergunta no WhatsApp, e 5 de 7
 * toques vieram do botão flutuante no celular, sem ler o "sem convênio" da página.
 *
 * 1. Anúncio novo "particular" em 4 grupos (Respiratória infantil, Fisioterapia
 *    pediátrica, Desenvolvimento motor, Assimetria craniana): copia o anúncio atual,
 *    troca o título "Nota Fiscal Para Reembolso" por "Atendimento Particular" FIXADO na
 *    posição 2 e a descrição de pagamento por uma que diz "sem convênio", FIXADA na 1.
 *    Torcicolo fica de fora (contestação em andamento) e Marca também.
 * 2. Quando o anúncio novo estiver APROVADO, pausa o antigo do grupo (rodar de novo
 *    depois da revisão do Google; até lá os dois rodam e o grupo não fica sem anúncio).
 * 3. Negativas: operadoras + "convênio"/"plano de saúde" na lista de convênio (vira
 *    NEGAR_OPERADORAS = true); "como fazer" no Informativo; capacete/órtese em Produtos.
 * 4. Pausa "desenvolvimento motor bebê" e "desenvolvimento motor infantil" (frase):
 *    R$ 16,55, 7 cliques, 0 conversa, quase só buscas de curiosidade.
 *
 * Rodar no script "Campanhas": Visualizar, depois Executar; restaurar criar-campanhas.js.
 */
var GRUPOS = [
  'Fisioterapia respiratória infantil',
  'Fisioterapia pediátrica',
  'Desenvolvimento motor',
  'Assimetria craniana',
];
var TITULO_PARTICULAR = 'Atendimento Particular';
var TITULO_SAI = 'Nota Fiscal Para Reembolso';
var TITULO_SOBRA = 'Acolhimento de Verdade'; // sai se passar de 15 títulos
var DESC_COM_PRECO =
  'Atendimento particular (sem convênio), a partir de R$ 280. Nota para reembolso.';
var DESC_SEM_PRECO =
  'Atendimento particular, sem convênio. Nota fiscal para pedir reembolso ao plano.';

var NEGATIVAS = {
  'RK NEG | Convênio e planos': [
    'convênio',
    'convenio',
    'convênios',
    'convenios',
    'plano de saúde',
    'plano de saude',
    'planos de saúde',
    'planos de saude',
    'unimed',
    'central nacional unimed',
    'amil',
    'bradesco',
    'sulamérica',
    'sulamerica',
    'sul america',
    'porto seguro saúde',
    'porto saúde',
    'care plus',
    'omint',
    'allianz saúde',
    'golden cross',
    'mediservice',
    'hapvida',
    'notredame',
    'notre dame',
    'intermédica',
    'intermedica',
    'prevent senior',
    'cassi',
    'geap',
    'capesesp',
    'e-vida',
    'saúde caixa',
    'postal saúde',
    'inas',
    'gdf saúde',
    'fusex',
    'fusma',
    'funsa',
    'plan-assiste',
    'plan assiste',
    'pro-social',
    'stf-med',
    'tst saúde',
    'trt saúde',
    'serpro saúde',
    'pas serpro',
    'life empresarial',
    'qualicorp',
  ],
  'RK NEG | Informativo e caseiro': [
    'como estimular',
    'como ajudar',
    'exercícios',
    'exercicios',
    'exercício',
    'exercicio',
    'estímulos para',
    'estimulos para',
    'idade para',
    'pode sentar',
    'pode ficar sentado',
  ],
  'RK NEG | Produtos e compras': ['capacete', 'órtese', 'ortese'],
};
var PAUSAR_PALAVRAS = [
  ['Desenvolvimento motor', 'desenvolvimento motor bebê'],
  ['Desenvolvimento motor', 'desenvolvimento motor infantil'],
];

function main() {
  GRUPOS.forEach(anuncioParticular);
  for (var nome in NEGATIVAS) acrescentar(nome, NEGATIVAS[nome]);
  PAUSAR_PALAVRAS.forEach(function (p) {
    var it = AdsApp.keywords()
      .withCondition("ad_group.name = '" + p[0] + "'")
      .withCondition("ad_group_criterion.keyword.text = '" + p[1] + "'")
      .get();
    var achou = false;
    while (it.hasNext()) {
      var k = it.next();
      achou = true;
      if (k.isEnabled()) {
        k.pause();
        Logger.log('PAUSADA palavra: ' + p[1] + ' (' + k.getMatchType() + ')');
      } else Logger.log('OK palavra já pausada: ' + p[1]);
    }
    if (!achou) Logger.log('ATENÇÃO palavra não encontrada: ' + p[1]);
  });
}

function anuncioParticular(grupo) {
  var rows = AdsApp.search(
    'SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ' +
      'ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ' +
      'ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ' +
      'ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad ' +
      "WHERE ad_group.name = '" +
      grupo +
      "' AND ad_group_ad.status != 'REMOVED' " +
      "AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'"
  );
  var novo = null,
    antigos = [],
    agId = null;
  while (rows.hasNext()) {
    var r = rows.next(),
      a = r.adGroupAd.ad,
      rsa = a.responsiveSearchAd;
    agId = r.adGroup.id;
    var eNovo = (rsa.headlines || []).some(function (h) {
      return h.text === TITULO_PARTICULAR;
    });
    var item = {
      id: a.id,
      status: r.adGroupAd.status,
      aprov: r.adGroupAd.policySummary.approvalStatus,
      rsa: rsa,
      url: (a.finalUrls || [])[0],
    };
    if (eNovo) novo = item;
    else antigos.push(item);
  }
  if (!agId) {
    Logger.log('ATENÇÃO grupo sem anúncio: ' + grupo);
    return;
  }

  if (!novo) {
    var base =
      antigos.filter(function (x) {
        return x.status === 'ENABLED';
      })[0] || antigos[0];
    if (!base) {
      Logger.log('ATENÇÃO sem anúncio-base em ' + grupo);
      return;
    }
    var titulos = (base.rsa.headlines || [])
      .filter(function (h) {
        return h.text !== TITULO_SAI && h.text !== TITULO_PARTICULAR;
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
          return h.text !== TITULO_SOBRA;
        })
        .slice(0, 15);
    var descs = (base.rsa.descriptions || []).map(function (d) {
      return { text: d.text };
    });
    var i = -1;
    descs.forEach(function (d, j) {
      if (i < 0 && /reembolso|nota fiscal/i.test(d.text)) i = j;
    });
    var temPreco =
      descs.some(function (d) {
        return /R\$ ?280/.test(d.text);
      }) ||
      titulos.some(function (h) {
        return /R\$ ?280/.test(h.text);
      });
    var nova = {
      text: temPreco ? DESC_COM_PRECO : DESC_SEM_PRECO,
      pinning: 'DESCRIPTION_1',
    };
    if (i >= 0) descs.splice(i, 1);
    else if (descs.length >= 4) descs.pop();
    descs.unshift(nova);
    // {KeyWord:texto padrão} conta só o texto padrão
    titulos.forEach(function (h) {
      if (h.text.replace(/\{KeyWord:([^}]*)\}/i, '$1').length > 30)
        throw new Error('Título > 30: ' + h.text);
    });
    descs.forEach(function (d) {
      if (d.text.length > 90) throw new Error('Descrição > 90: ' + d.text);
    });

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
      throw new Error(
        'Falha ao criar anúncio em ' + grupo + ': ' + op.getErrors()
      );
    Logger.log(
      'CRIADO anúncio particular em ' +
        grupo +
        ' (' +
        titulos.length +
        ' títulos, ' +
        descs.length +
        ' descrições; desc 1: ' +
        nova.text +
        ')'
    );
    return;
  }

  if (novo.aprov === 'APPROVED' || novo.aprov === 'APPROVED_LIMITED') {
    antigos.forEach(function (x) {
      if (x.status !== 'ENABLED') return;
      var it = AdsApp.ads()
        .withCondition('ad_group_ad.ad.id = ' + x.id)
        .withCondition('ad_group.id = ' + agId)
        .get();
      if (it.hasNext()) {
        it.next().pause();
        Logger.log('PAUSADO anúncio antigo ' + x.id + ' em ' + grupo);
      }
    });
  } else {
    Logger.log(
      'AGUARDANDO revisão do anúncio particular em ' +
        grupo +
        ' (' +
        novo.aprov +
        '); o antigo segue ativo. Rodar de novo depois.'
    );
  }
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
    Logger.log(
      'NEGATIVAS em ' +
        nomeLista +
        ' (' +
        novas.length +
        '): ' +
        novas.join(', ')
    );
  } else Logger.log('OK negativas já estão em ' + nomeLista);
}
