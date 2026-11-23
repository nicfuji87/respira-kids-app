/**
 * Respira Kids — ajustes de 28/10/2026 (uso único, idempotente).
 *
 * 1. Pausa o grupo "Bronquiolite, catarro e aspiração (revisão clínica)": estava
 *    ATIVO, contra a decisão de esperar a revisão clínica.
 * 2. Pausa a palavra "fisioterapia asa sul" (grupo Fisioterapia pediátrica): 63
 *    impressões, 4 cliques, R$ 12,65, nenhuma conversa, só nomes de outras clínicas.
 * 3. Cria a lista "RK NEG | Concorrentes" com os nomes vistos nos termos de pesquisa
 *    e liga às campanhas Respiratória e Desenvolvimento (Marca fica de fora).
 * 4. Acrescenta "tummy time" e "jeito certo" à lista "RK NEG | Informativo e caseiro".
 * 5. Orçamentos: Desenvolvimento R$ 20 → R$ 30 (perdia 46% das impressões por
 *    orçamento); Respiratória R$ 30 → R$ 20 (já aparece em 73% e gasta ~R$ 8/dia).
 *    Total segue R$ 55/dia.
 * 6. Registra no log quem ativou o grupo de bronquiolite (histórico de alterações).
 *
 * Rodar no script "Campanhas": Visualizar (confere as alterações), depois Executar.
 * Depois, restaurar o código de criar-campanhas.js nesse script.
 */
var GRUPO_BRONQUIOLITE = 'Bronquiolite, catarro e aspiração (revisão clínica)';
var GRUPO_PEDIATRICA = 'Fisioterapia pediátrica';
var PALAVRA_PAUSAR = 'fisioterapia asa sul';
var LISTA_CONCORRENTES = 'RK NEG | Concorrentes';
var CONCORRENTES = [
  'fisiotrauma',
  'qualifisio',
  'aquafisio',
  'videre',
  'fisioclinic',
  'fisioclinica',
  'fisioquer',
  'san corp',
  'clinica recuperar',
];
var LISTA_INFORMATIVO = 'RK NEG | Informativo e caseiro';
var INFORMATIVO_NOVAS = ['tummy time', 'jeito certo'];
var CAMPANHAS_COM_CONCORRENTES = [
  'RK | Pesquisa | Respiratória | DF',
  'RK | Pesquisa | Desenvolvimento | DF',
];
var ORCAMENTOS = {
  'RK | Pesquisa | Desenvolvimento | DF': 30,
  'RK | Pesquisa | Respiratória | DF': 20,
};

function main() {
  historicoBronquiolite();

  // 1. Grupo de bronquiolite
  var g = AdsApp.adGroups()
    .withCondition("ad_group.name = '" + GRUPO_BRONQUIOLITE + "'")
    .get();
  if (!g.hasNext()) throw new Error('Grupo de bronquiolite não encontrado');
  while (g.hasNext()) {
    var grupo = g.next();
    if (grupo.isEnabled()) {
      grupo.pause();
      Logger.log('PAUSADO grupo: ' + grupo.getName());
    } else Logger.log('OK grupo já pausado: ' + grupo.getName());
  }

  // 2. Palavra "fisioterapia asa sul"
  var k = AdsApp.keywords()
    .withCondition("ad_group.name = '" + GRUPO_PEDIATRICA + "'")
    .withCondition("ad_group_criterion.keyword.text = '" + PALAVRA_PAUSAR + "'")
    .get();
  var achou = 0;
  while (k.hasNext()) {
    var kw = k.next();
    achou++;
    if (kw.isEnabled()) {
      kw.pause();
      Logger.log(
        'PAUSADA palavra: ' + kw.getText() + ' (' + kw.getMatchType() + ')'
      );
    } else Logger.log('OK palavra já pausada: ' + kw.getText());
  }
  if (!achou)
    throw new Error('Palavra "' + PALAVRA_PAUSAR + '" não encontrada');

  // 3. Lista de concorrentes
  var lista = obterLista(LISTA_CONCORRENTES, true);
  acrescentarNegativas(lista, CONCORRENTES);
  for (var i = 0; i < CAMPANHAS_COM_CONCORRENTES.length; i++) {
    var c = campanha(CAMPANHAS_COM_CONCORRENTES[i]);
    var ligadas = c.negativeKeywordLists().get(),
      ja = false;
    while (ligadas.hasNext())
      if (ligadas.next().getName() === LISTA_CONCORRENTES) ja = true;
    if (!ja) {
      c.addNegativeKeywordList(lista);
      Logger.log('LIGADA lista ' + LISTA_CONCORRENTES + ' → ' + c.getName());
    } else Logger.log('OK lista já ligada em ' + c.getName());
  }

  // 4. Informativo
  acrescentarNegativas(obterLista(LISTA_INFORMATIVO, false), INFORMATIVO_NOVAS);

  // 5. Orçamentos
  for (var nome in ORCAMENTOS) {
    var b = campanha(nome).getBudget();
    if (b.isExplicitlyShared())
      throw new Error('Orçamento compartilhado em ' + nome + ': não mexi');
    var antes = b.getAmount();
    if (antes !== ORCAMENTOS[nome]) {
      b.setAmount(ORCAMENTOS[nome]);
      Logger.log(
        'ORÇAMENTO ' + nome + ': R$ ' + antes + ' → R$ ' + ORCAMENTOS[nome]
      );
    } else Logger.log('OK orçamento ' + nome + ' já é R$ ' + antes);
  }
}

function campanha(nome) {
  var it = AdsApp.campaigns()
    .withCondition("campaign.name = '" + nome + "'")
    .get();
  if (!it.hasNext()) throw new Error('Campanha não encontrada: ' + nome);
  return it.next();
}

function obterLista(nome, criar) {
  var it = AdsApp.negativeKeywordLists()
    .withCondition("shared_set.name = '" + nome + "'")
    .get();
  if (it.hasNext()) return it.next();
  if (!criar) throw new Error('Lista não encontrada: ' + nome);
  var op = AdsApp.newNegativeKeywordListBuilder().withName(nome).build();
  if (!op.isSuccessful())
    throw new Error('Falha ao criar ' + nome + ': ' + op.getErrors());
  Logger.log('CRIADA lista ' + nome);
  return op.getResult();
}

// 03/11/2026: negativas sempre em FRASE ("texto"); só conta como existente a frase.
function acrescentarNegativas(lista, termos) {
  var existentes = {};
  var it = lista.negativeKeywords().get();
  while (it.hasNext()) {
    var kn = it.next();
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
    Logger.log('NEGATIVAS em ' + lista.getName() + ': ' + novas.join(', '));
  } else Logger.log('OK negativas já estão em ' + lista.getName());
}

function historicoBronquiolite() {
  try {
    var it = AdsApp.search(
      'SELECT change_event.change_date_time, change_event.user_email, change_event.client_type, ' +
        'change_event.resource_change_operation, change_event.changed_fields, ad_group.name ' +
        "FROM change_event WHERE change_event.change_date_time >= '2026-10-25' " +
        "AND change_event.change_date_time <= '2026-10-29' " +
        "AND change_event.change_resource_type = 'AD_GROUP' " +
        'ORDER BY change_event.change_date_time LIMIT 100'
    );
    while (it.hasNext()) {
      var r = it.next();
      if (!r.adGroup || r.adGroup.name !== GRUPO_BRONQUIOLITE) continue;
      Logger.log(
        'HISTÓRICO bronquiolite: ' +
          r.changeEvent.changeDateTime +
          ' | ' +
          r.changeEvent.userEmail +
          ' | ' +
          r.changeEvent.clientType +
          ' | ' +
          r.changeEvent.resourceChangeOperation +
          ' | ' +
          r.changeEvent.changedFields
      );
    }
  } catch (e) {
    Logger.log('HISTÓRICO indisponível: ' + e);
  }
}
