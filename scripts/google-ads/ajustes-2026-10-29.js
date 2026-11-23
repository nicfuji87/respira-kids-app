/**
 * Respira Kids — ajustes de 29/10/2026 (uso único, idempotente).
 *
 * Acrescenta à lista "RK NEG | Informativo e caseiro" (Respiratória + Desenvolvimento)
 * buscas de "como fazer" que a Desenvolvimento motor pagou ou mostrou em 28/10
 * (10 cliques, R$ 22,19, nenhuma conversa): "psicomotricidade educação infantil",
 * "como desenvolver a coordenação motora fina", "ate qual idade o bebe tem que andar",
 * "sinais que o bebê vai andar", "como ensinar o bebê a andar mais rápido",
 * "marcos motores do desenvolvimento infantil", "como tratar assimetria craniana em casa".
 * "em casa" sozinho fica de fora de propósito (ver a lista "Atendimento em casa").
 *
 * Rodar no script "Campanhas": Visualizar, depois Executar; restaurar criar-campanhas.js.
 */
var LISTA = 'RK NEG | Informativo e caseiro';
var NOVAS = [
  'como desenvolver',
  'como ensinar',
  'como tratar',
  'sinais que',
  'qual idade',
  'marcos motores',
  'coordenação motora fina',
  'educação infantil',
  'psicomotricidade',
];

function main() {
  var it = AdsApp.negativeKeywordLists()
    .withCondition("shared_set.name = '" + LISTA + "'")
    .get();
  if (!it.hasNext()) throw new Error('Lista não encontrada: ' + LISTA);
  var lista = it.next();
  var existentes = {};
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
  var novas = NOVAS.filter(function (t) {
    return !existentes[t.toLowerCase()];
  });
  if (novas.length) {
    lista.addNegativeKeywords(
      novas.map(function (t) {
        return '"' + t + '"';
      })
    );
    Logger.log('NEGATIVAS em ' + LISTA + ': ' + novas.join(', '));
  } else Logger.log('OK negativas já estão em ' + LISTA);

  var cs = lista.campaigns().get(),
    nomes = [];
  while (cs.hasNext()) nomes.push(cs.next().getName());
  Logger.log('Lista ligada a: ' + nomes.join(' | '));
}
