/**
 * Respira Kids — grupos novos da campanha Respiratória (substitui ativar-bronquiolite.js).
 *
 * Plano aprovado em 23/11/2026 (revisão do plano + decisão do dono):
 *   A. "Catarro e secreções"            — grupo novo
 *   B. "Bronquiolite em bebês"          — reaproveita o grupo pausado "Bronquiolite, catarro e
 *                                         aspiração (revisão clínica)": renomeia, pausa as 9 palavras
 *                                         e o anúncio antigos, entra só bronquiolite
 *   C. "Pós-pneumonia e pós-internação" — grupo novo
 *   + negativa "sibilância" no grupo geral "Fisioterapia respiratória infantil".
 * Fora (decisão): asma, chiado, respiração bucal e aspiração. "internação" NÃO é negativada no
 * grupo geral antes de ver o Grupo C elegível. Orçamento e outras campanhas não mudam.
 *
 * TRAVA: este script NUNCA ativa grupo. A, B e C ficam pausados; a ativação é outro passo,
 * depois da aprovação da Bruna, da página no ar e da revisão do Google. Se encontrar algum dos
 * três ativo, a conferência falha e avisa.
 *
 * Antes de rodar: a Bruna aprova TITULOS/DESCRICOES abaixo e a página
 * /fisioterapia-respiratoria/ nova está publicada (ramo feat/pagina-respiratoria-grupos do site).
 *
 * Fase 1 (lote atômico): cria A e C com anúncio e negativas, renomeia B, cria o anúncio de B,
 *   pausa anúncio e palavras antigas de B, negativa "sibilância" no geral. Se algo for recusado,
 *   nada muda.
 * Fase 2 (falha parcial): palavras-chave. Palavra de saúde recusada fica no registro para pedir
 *   revisão pela tela (sem contornar a política).
 * Conferência: relê a conta e compara Desenvolvimento e Marca com a foto de antes.
 * Idempotente: rodar de novo não duplica nada. Visualizar antes de Executar.
 */
var CONTA = '8744391492';
var GRUPO_GERAL = 'Fisioterapia respiratória infantil';
var URL_FINAL = 'https://respirakids.com.br/fisioterapia-respiratoria/';
var D1 = { text: 'Atendimento particular, sem convênio. Nota fiscal para pedir reembolso ao plano.', pinning: 'DESCRIPTION_1' };
var T2 = { text: 'Atendimento Particular', pinning: 'HEADLINE_2' };
var ALERTA = 'Falta de ar, costelas afundando ou recusa da mamada: procure o pronto-socorro.';
var NEG_GERAL = ['sibilância'];

// "marca" = título que só o anúncio novo tem (é assim que o script reconhece o anúncio dele).
var GRUPOS = [
  // Textos: junção do plano de 23/11 (noite) com a versão anterior; sem "Nota 5,0 no Google" (dono, 23/11).
  // A "marca" de cada grupo não aparece no anúncio antigo do grupo B (conferido em 23/11).
  {
    chave: 'A', nome: 'Catarro e secreções', path2: 'catarro', marca: 'Secreções em Bebês',
    palavras: ['"fisioterapia para catarro"', '"fisioterapia respiratória catarro"', '"fisioterapia para bebê com catarro"',
      '"fisioterapia para secreção bebê"', '[fisioterapia para catarro bebê]'],
    // informativas restritas + ofertas que não se misturam com catarro (bronquiolite vai para o B)
    negativas: ['como fazer lavagem nasal', 'lavagem nasal passo a passo', 'como tirar catarro', 'xarope', 'remédio',
      'bronquiolite', 'asma', 'chiado', 'sibilância'],
    titulos: [{ text: 'Bebê com Catarro?' }, T2, { text: 'Fisioterapia Para Catarro' }, { text: 'Avaliação Respiratória' },
      { text: 'Secreções em Bebês' }, { text: 'Para Bebês e Crianças' }, { text: 'Clínica na Asa Sul' }, { text: 'Respira Kids Brasília' },
      { text: 'Agende pelo WhatsApp' }, { text: 'Conduta Após Avaliação' }, { text: 'Equipe Pediátrica' },
      { text: 'Técnica Suave, Sem Bater' }], // último: só com o "sim" da Bruna; senão trocar por 'Atendimento a Prematuros'
    descricoes: [D1, { text: 'Seu bebê está com catarro? Nossa equipe realiza avaliação respiratória individualizada.' },
      { text: 'Técnica manual suave, sem bater nas costas. Conduta definida após a avaliação.' }, { text: ALERTA }],
  },
  {
    chave: 'B', nome: 'Bronquiolite em bebês', nomeAntigo: 'Bronquiolite, catarro e aspiração (revisão clínica)',
    path2: 'bronquiolite', marca: 'Orientação à Família',
    // Planejador (DF, 23/11): ~10 variações de "fisioterapia + bronquiolite" com ~10 buscas/mês cada; pico mar–jul.
    palavras: ['"fisioterapia bronquiolite"', '"fisioterapia respiratória bronquiolite"', '"bronquiolite fisioterapia"', '[fisioterapia bronquiolite bebê]'],
    negativas: [], // mantém as 6 que já existem: sintomas, remédio, antibiótico, quanto tempo dura, contagioso, transmissão
    titulos: [{ text: 'Bronquiolite em Bebês' }, T2, { text: 'Avaliação Respiratória' }, { text: 'Fisioterapia Pediátrica' },
      { text: 'Conduta Após Avaliação' }, { text: 'Para Bebês e Crianças' }, { text: 'Clínica na Asa Sul' }, { text: 'Agende pelo WhatsApp' },
      { text: 'Respira Kids Brasília' }, { text: 'Orientação à Família' }, { text: 'Atendimento Individual' }, { text: 'Atendimento a Prematuros' }],
    descricoes: [D1, { text: 'Bronquiolite em bebê? Avaliação respiratória individualizada na Asa Sul.' },
      { text: 'Nem todo bebê com bronquiolite precisa de fisioterapia. A avaliação define a conduta.' }, { text: ALERTA }],
  },
  {
    chave: 'C', nome: 'Pós-pneumonia e pós-internação', path2: 'pos-internacao', marca: 'Com Liberação Médica',
    palavras: ['"fisioterapia após pneumonia"', '"fisioterapia pneumonia infantil"', '"fisioterapia respiratória pós internação"', '"fisioterapia após internação bebê"'],
    negativas: [],
    titulos: [{ text: 'Fisio Após Pneumonia' }, T2, { text: 'Recuperação Pós-Internação' }, { text: 'Avaliação Respiratória' },
      { text: 'Para Bebês e Crianças' }, { text: 'Plano Individualizado' }, { text: 'Clínica na Asa Sul' }, { text: 'Agende pelo WhatsApp' },
      { text: 'Respira Kids Brasília' }, { text: 'Conduta Após Avaliação' }, { text: 'Atendimento a Prematuros' }, { text: 'Com Liberação Médica' }],
    descricoes: [D1, { text: 'Após pneumonia ou internação, avaliamos a necessidade de acompanhamento fisioterapêutico.' },
      { text: 'Plano individual para bebês e crianças até 12 anos, prematuros e pós-cirurgia.' },
      { text: 'Consulte horários pelo WhatsApp. Plano definido após avaliação profissional.' }],
  },
];

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  if (cid !== CONTA) throw new Error('Conta errada: ' + cid);
  var preview = AdsApp.getExecutionInfo().isPreview();
  validarTextos();
  var geral = lerGrupoPorNome(GRUPO_GERAL);
  if (!geral) throw new Error('Grupo geral não encontrado: ' + GRUPO_GERAL);
  var camp = geral.campanha;
  var fotoAntes = fotoOutrasCampanhas(camp);
  var negsCamp = negativasDaCampanha(camp);
  // Negativas da campanha que podem barrar buscas de pós-alta/catarro/bronquiolite (só aviso; decidir à mão).
  var sensiveis = Object.keys(negsCamp).filter(function (n) { return /hospital|intub|alta|interna|uti|pneumon|catarr|secre|bronqui|prematur|neonat/.test(n); });
  Logger.log('NEGATIVAS SENSÍVEIS na campanha: ' + (sensiveis.map(function (n) { return n + ' ' + negsCamp[n]; }).join('; ') || 'nenhuma'));

  // ── Fase 1 — atômica ──
  var ops = [], desc = [], tmp = 0, rnGrupo = {};
  GRUPOS.forEach(function (g) {
    var atual = lerGrupoPorNome(g.nome) || (g.nomeAntigo ? lerGrupoPorNome(g.nomeAntigo) : null);
    g.atual = atual;
    var rn;
    if (!atual) {
      if (g.nomeAntigo) throw new Error('Grupo ' + g.chave + ' não encontrado (nem pelo nome antigo)');
      tmp++;
      rn = 'customers/' + cid + '/adGroups/-' + tmp;
      ops.push({ adGroupOperation: { create: { resourceName: rn, campaign: camp, name: g.nome, status: 'PAUSED', type: 'SEARCH_STANDARD' } } });
      desc.push(g.chave + ': criar grupo pausado "' + g.nome + '"');
    } else {
      rn = atual.rn;
      if (atual.nome !== g.nome) {
        ops.push({ adGroupOperation: { update: { resourceName: rn, name: g.nome }, updateMask: 'name' } });
        desc.push(g.chave + ': renomear "' + atual.nome + '" → "' + g.nome + '"');
      }
      if (atual.status === 'ENABLED') Logger.log('ATENÇÃO ' + g.chave + ' está ATIVO; o script não pausa nem ativa grupo, só avisa');
      // pausa anúncios que não são o novo
      atual.anuncios.forEach(function (a) {
        if (!a.novo && a.status === 'ENABLED') {
          ops.push({ adGroupAdOperation: { update: { resourceName: a.rn, status: 'PAUSED' }, updateMask: 'status' } });
          desc.push(g.chave + ': pausar anúncio antigo ' + a.rn.split('~')[1]);
        }
      });
      // pausa palavras ativas que não estão na lista aprovada
      var aprovadas = {};
      g.palavras.forEach(function (k) { aprovadas[chaveKw(k)] = 1; });
      atual.palavras.forEach(function (k) {
        if (k.status === 'ENABLED' && !aprovadas[k.texto + '|' + k.tipo]) {
          ops.push({ adGroupCriterionOperation: { update: { resourceName: k.rn, status: 'PAUSED' }, updateMask: 'status' } });
          desc.push(g.chave + ': pausar palavra antiga ' + k.texto + ' [' + k.tipo + ']');
        }
      });
    }
    rnGrupo[g.chave] = rn;
    if (!atual || !atual.anuncios.some(function (a) { return a.novo === g.marca; })) {
      ops.push({ adGroupAdOperation: { create: { adGroup: rn, status: 'ENABLED', ad: { finalUrls: [URL_FINAL], responsiveSearchAd: {
        headlines: g.titulos.map(fixar), descriptions: g.descricoes.map(fixar), path1: 'respiratoria', path2: g.path2 } } } } });
      desc.push(g.chave + ': criar anúncio novo (' + g.titulos.length + ' títulos, ' + g.descricoes.length + ' descrições)');
    }
    g.negativas.forEach(function (t) {
      if (atual && atual.negativas[t.toLowerCase()]) return;
      ops.push({ adGroupCriterionOperation: { create: { adGroup: rn, negative: true, keyword: { text: t, matchType: 'PHRASE' } } } });
      desc.push(g.chave + ': negativa "' + t + '"');
    });
  });
  NEG_GERAL.forEach(function (t) {
    if (geral.negativas[t.toLowerCase()]) return;
    ops.push({ adGroupCriterionOperation: { create: { adGroup: geral.rn, negative: true, keyword: { text: t, matchType: 'PHRASE' } } } });
    desc.push('Geral: negativa "' + t + '"');
  });
  desc.forEach(function (d) { Logger.log('FASE1 ' + d); });
  if (ops.length) {
    var res = AdsApp.mutateAll(ops, { partialFailure: false });
    var erros = [];
    res.forEach(function (x, i) { if (!x.isSuccessful()) erros.push((desc[i] || ('op ' + i)) + ': ' + x.getErrorMessages()); });
    if (erros.length) throw new Error('Fase 1 recusada, NADA mudou: ' + erros.join(' / '));
    Logger.log((preview ? 'VISUALIZAÇÃO ' : 'APLICADO ') + 'fase 1: ' + ops.length + ' operações');
  } else Logger.log('FASE1 nada a fazer');

  // ── Fase 2 — palavras-chave (falha parcial) ──
  var kwOps = [], kwTxt = [];
  GRUPOS.forEach(function (g) {
    var atual = preview ? g.atual : (lerGrupoPorNome(g.nome));
    var negsGrupo = atual ? atual.negativas : {};
    g.negativas.forEach(function (t) { negsGrupo[t.toLowerCase()] = 'PHRASE'; });
    g.palavras.forEach(function (k) {
      var t = textoKw(k), bloq = bloqueio(t, negsGrupo, negsCamp);
      if (bloq) Logger.log('PALAVRA BLOQUEADA ' + g.chave + ' ' + k + ' por ' + bloq);
      var existe = atual && atual.palavras.filter(function (p) { return p.texto + '|' + p.tipo === chaveKw(k); })[0];
      if (existe && existe.status === 'ENABLED') return;
      if (preview && !atual) { Logger.log('VISUALIZAÇÃO ' + g.chave + ': adicionaria ' + k); return; }
      if (existe) kwOps.push({ adGroupCriterionOperation: { update: { resourceName: existe.rn, status: 'ENABLED' }, updateMask: 'status' } });
      else kwOps.push({ adGroupCriterionOperation: { create: { adGroup: atual.rn, status: 'ENABLED', keyword: { text: t, matchType: tipoKw(k) } } } });
      kwTxt.push(g.chave + ' ' + k);
    });
  });
  if (kwOps.length) {
    var r2 = AdsApp.mutateAll(kwOps, { partialFailure: true });
    r2.forEach(function (x, i) {
      Logger.log((x.isSuccessful() ? 'PALAVRA ok ' : 'PALAVRA RECUSADA (pedir revisão pela tela) ') + kwTxt[i] + (x.isSuccessful() ? '' : ': ' + x.getErrorMessages()));
    });
  } else Logger.log('FASE2 palavras já estão nos grupos');

  if (preview) { Logger.log('VISUALIZAÇÃO: conferência completa só depois de Executar'); return; }
  conferir(camp, fotoAntes, negsCamp);
}

// ── Conferência ──
function conferir(camp, fotoAntes, negsCamp) {
  var falhas = [];
  GRUPOS.forEach(function (g) {
    var a = lerGrupoPorNome(g.nome);
    if (!a) { falhas.push(g.chave + ': grupo não existe'); return; }
    if (a.campanha !== camp) falhas.push(g.chave + ': grupo em outra campanha');
    var linha = g.chave + ' "' + g.nome + '" ' + a.status;
    if (a.status !== 'PAUSED') falhas.push(g.chave + ': grupo deveria estar PAUSADO e está ' + a.status);
    var novos = a.anuncios.filter(function (x) { return x.novo === g.marca; });
    if (novos.length !== 1) falhas.push(g.chave + ': ' + novos.length + ' anúncio(s) novo(s), esperado 1');
    novos.forEach(function (n) {
      linha += ' | anúncio ' + n.status + '/' + n.aprovacao + ' ' + n.url;
      if (n.url !== URL_FINAL) falhas.push(g.chave + ': URL do anúncio ' + n.url);
      var esperado = g.titulos.map(function (t) { return t.text; }).join('|');
      if (n.titulos.join('|') !== esperado) falhas.push(g.chave + ': títulos diferentes do aprovado');
      if (n.descricoes.join('|') !== g.descricoes.map(function (d) { return d.text; }).join('|')) falhas.push(g.chave + ': descrições diferentes do aprovado');
    });
    a.anuncios.forEach(function (x) { if (x.novo !== g.marca && x.status === 'ENABLED') falhas.push(g.chave + ': anúncio antigo ativo ' + x.rn); });
    var aprovadas = {};
    g.palavras.forEach(function (k) { aprovadas[chaveKw(k)] = k; });
    var ativas = a.palavras.filter(function (k) { return k.status === 'ENABLED'; });
    ativas.forEach(function (k) { if (!aprovadas[k.texto + '|' + k.tipo]) falhas.push(g.chave + ': palavra não aprovada ativa ' + k.texto); });
    g.palavras.forEach(function (k) {
      var p = ativas.filter(function (x) { return x.texto + '|' + x.tipo === chaveKw(k); })[0];
      var bloq = bloqueio(textoKw(k), a.negativas, negsCamp);
      linha += ' | ' + k + (p ? ' ' + p.aprovacao : ' AUSENTE') + (bloq ? ' BLOQUEADA por ' + bloq : '');
      if (bloq) falhas.push(g.chave + ': ' + k + ' bloqueada por ' + bloq);
    });
    g.negativas.forEach(function (t) { if (!a.negativas[t.toLowerCase()]) falhas.push(g.chave + ': falta negativa ' + t); });
    Logger.log('CONFERE ' + linha);
  });
  var geral = lerGrupoPorNome(GRUPO_GERAL);
  NEG_GERAL.forEach(function (t) { if (!geral.negativas[t.toLowerCase()]) falhas.push('Geral: falta negativa ' + t); });
  Logger.log('CONFERE Geral ' + geral.status + ', ' + geral.palavras.filter(function (k) { return k.status === 'ENABLED'; }).length + ' palavras ativas');
  var fotoDepois = fotoOutrasCampanhas(camp);
  Object.keys(fotoAntes).forEach(function (c) {
    if (fotoAntes[c] !== fotoDepois[c]) falhas.push('Campanha ' + c + ' mudou: antes ' + fotoAntes[c] + ' / depois ' + fotoDepois[c]);
  });
  Logger.log('CONFERE outras campanhas: ' + (Object.keys(fotoAntes).length) + ' sem mudança esperada');
  if (falhas.length) {
    falhas.forEach(function (f) { Logger.log('FALHA ' + f); });
    throw new Error(falhas.length + ' verificação(ões) falharam. O que a fase 1/2 aplicou está no registro acima; nada foi desfeito.');
  }
  Logger.log('CONFERE ok: A, B e C pausados, anúncios e palavras como aprovado, nenhuma negativa bloqueando.');
}

// ── Leitura ──
function lerGrupoPorNome(nome) {
  var rows = AdsApp.search("SELECT ad_group.resource_name, ad_group.name, ad_group.status, campaign.resource_name FROM ad_group " +
    "WHERE ad_group.name = '" + nome.replace(/'/g, "\\'") + "' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'");
  if (!rows.hasNext()) return null;
  var r = rows.next();
  var g = { rn: r.adGroup.resourceName, nome: r.adGroup.name, status: r.adGroup.status, campanha: r.campaign.resourceName, anuncios: [], palavras: [], negativas: {} };
  var marcas = GRUPOS.map(function (x) { return x.marca; });
  rows = AdsApp.search('SELECT ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.ad.final_urls, ' +
    'ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad ' +
    "WHERE ad_group.resource_name = '" + g.rn + "' AND ad_group_ad.status != 'REMOVED'");
  while (rows.hasNext()) {
    var a = rows.next().adGroupAd, rsa = a.ad.responsiveSearchAd || {};
    var hs = (rsa.headlines || []).map(function (h) { return h.text; });
    var novo = marcas.filter(function (m) { return hs.indexOf(m) >= 0; })[0] || null;
    g.anuncios.push({ rn: a.resourceName, status: a.status, aprovacao: (a.policySummary || {}).approvalStatus, url: (a.ad.finalUrls || [])[0],
      titulos: hs, descricoes: (rsa.descriptions || []).map(function (d) { return d.text; }), novo: novo });
  }
  rows = AdsApp.search('SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.negative, ad_group_criterion.status, ad_group_criterion.approval_status FROM ad_group_criterion ' +
    "WHERE ad_group.resource_name = '" + g.rn + "' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'");
  while (rows.hasNext()) {
    var k = rows.next().adGroupCriterion, t = k.keyword.text.toLowerCase();
    if (k.negative) g.negativas[t] = k.keyword.matchType;
    else g.palavras.push({ rn: k.resourceName, texto: t, tipo: k.keyword.matchType, status: k.status, aprovacao: k.approvalStatus });
  }
  return g;
}

function negativasDaCampanha(camp) {
  var n = {};
  var rows = AdsApp.search("SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion " +
    "WHERE campaign.resource_name = '" + camp + "' AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE");
  while (rows.hasNext()) { var k = rows.next().campaignCriterion.keyword; n[k.text.toLowerCase()] = k.matchType + ' (campanha)'; }
  rows = AdsApp.search("SELECT shared_set.resource_name, shared_set.name FROM campaign_shared_set WHERE campaign.resource_name = '" + camp + "' " +
    "AND campaign_shared_set.status = 'ENABLED' AND shared_set.type = 'NEGATIVE_KEYWORDS'");
  while (rows.hasNext()) {
    var s = rows.next().sharedSet;
    var ks = AdsApp.search("SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.resource_name = '" + s.resourceName + "'");
    while (ks.hasNext()) { var kk = ks.next().sharedCriterion.keyword; n[kk.text.toLowerCase()] = kk.matchType + ' (' + s.name.replace('RK NEG | ', '') + ')'; }
  }
  return n;
}

// Foto simples de cada outra campanha: status, orçamento, grupos e contagens de palavras/anúncios ativos.
function fotoOutrasCampanhas(camp) {
  var f = {};
  var rows = AdsApp.search("SELECT campaign.resource_name, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign " +
    "WHERE campaign.status != 'REMOVED' AND campaign.resource_name != '" + camp + "'");
  while (rows.hasNext()) { var r = rows.next(); f[r.campaign.name] = r.campaign.status + ' R$' + (r.campaignBudget.amountMicros / 1e6); }
  rows = AdsApp.search("SELECT campaign.name, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.status != 'REMOVED' " +
    "AND campaign.status != 'REMOVED' AND campaign.resource_name != '" + camp + "'");
  var grupos = {};
  while (rows.hasNext()) { var r2 = rows.next(); (grupos[r2.campaign.name] = grupos[r2.campaign.name] || []).push(r2.adGroup.name + ':' + r2.adGroup.status); }
  var kw = contar("SELECT campaign.name FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' " +
    "AND ad_group_criterion.negative = FALSE AND campaign.status != 'REMOVED' AND campaign.resource_name != '" + camp + "'");
  var ads = contar("SELECT campaign.name FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status != 'REMOVED' AND campaign.resource_name != '" + camp + "'");
  Object.keys(f).forEach(function (c) { f[c] += ' | ' + (grupos[c] || []).sort().join(',') + ' | kw ' + (kw[c] || 0) + ' | anúncios ' + (ads[c] || 0); });
  return f;
}
function contar(q) { var o = {}, rows = AdsApp.search(q); while (rows.hasNext()) { var n = rows.next().campaign.name; o[n] = (o[n] || 0) + 1; } return o; }

// ── Utilitários ──
function validarTextos() {
  GRUPOS.forEach(function (g) {
    if (g.titulos.length < 3 || g.titulos.length > 15) throw new Error(g.chave + ': de 3 a 15 títulos');
    if (g.descricoes.length < 2 || g.descricoes.length > 4) throw new Error(g.chave + ': de 2 a 4 descrições');
    var vistos = {};
    g.titulos.forEach(function (t) {
      if (t.text.length > 30) throw new Error(g.chave + ': título com mais de 30: ' + t.text);
      if (vistos[t.text.toLowerCase()]) throw new Error(g.chave + ': título repetido: ' + t.text);
      vistos[t.text.toLowerCase()] = 1;
    });
    g.descricoes.forEach(function (d) { if (d.text.length > 90) throw new Error(g.chave + ': descrição com mais de 90: ' + d.text); });
    if (!g.titulos.some(function (t) { return t.text === g.marca; })) throw new Error(g.chave + ': a marca precisa ser um dos títulos');
  });
}
function fixar(t) { var o = { text: t.text }; if (t.pinning) o.pinnedField = t.pinning; return o; }
function tipoKw(k) { return /^\[/.test(k) ? 'EXACT' : 'PHRASE'; }
function textoKw(k) { return k.replace(/["\[\]]/g, '').toLowerCase(); }
function chaveKw(k) { return textoKw(k) + '|' + tipoKw(k); }
// A negativa bloqueia a própria palavra-chave? (frase: sequência contida; ampla: todas as palavras; exata: igual)
function bloqueio(texto, negsGrupo, negsCamp) {
  var tk = texto.split(/\s+/), achou = null;
  function testa(neg, tipo, origem) {
    if (achou) return;
    var nt = neg.split(/\s+/), ok = false;
    if (/^EXACT/.test(tipo)) ok = neg === texto;
    else if (/^BROAD/.test(tipo)) ok = nt.every(function (w) { return tk.indexOf(w) >= 0; });
    else for (var i = 0; i + nt.length <= tk.length && !ok; i++) ok = nt.every(function (w, j) { return tk[i + j] === w; });
    if (ok) achou = '"' + neg + '" ' + origem;
  }
  Object.keys(negsGrupo).forEach(function (n) { testa(n, String(negsGrupo[n]), '(grupo)'); });
  Object.keys(negsCamp).forEach(function (n) { testa(n, negsCamp[n], negsCamp[n].replace(/^\w+ /, '')); });
  return achou;
}
