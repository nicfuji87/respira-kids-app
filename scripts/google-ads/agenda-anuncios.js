/**
 * Respira Kids — programação dos anúncios (30/10/2026, decisão do dono). Idempotente.
 *
 * Só dias úteis: a recepção não fecha agendamento no fim de semana (sábado alternado,
 * domingo nunca). A Ju responde a qualquer hora, mas quem chega no sábado esfria até
 * segunda. Sexta para às 18h (quem clicasse sexta à noite esperaria ~60 h); segunda
 * volta às 6h. Vale para as 3 campanhas. O orçamento diário não muda: o Google
 * redistribui o gasto pelos dias em que o anúncio roda.
 * Horário = fuso da conta (Brasília). Próximo teste sugerido: domingo 18h–22h.
 *
 * Rodar no script "Campanhas": Visualizar, depois Executar; restaurar criar-campanhas.js.
 */
var CAMPANHAS = [
  'RK | Pesquisa | Respiratória | DF',
  'RK | Pesquisa | Desenvolvimento | DF',
  'RK | Pesquisa | Marca',
];
var AGENDA = [
  {
    dayOfWeek: 'MONDAY',
    startHour: 6,
    startMinute: 0,
    endHour: 24,
    endMinute: 0,
  },
  {
    dayOfWeek: 'TUESDAY',
    startHour: 0,
    startMinute: 0,
    endHour: 24,
    endMinute: 0,
  },
  {
    dayOfWeek: 'WEDNESDAY',
    startHour: 0,
    startMinute: 0,
    endHour: 24,
    endMinute: 0,
  },
  {
    dayOfWeek: 'THURSDAY',
    startHour: 0,
    startMinute: 0,
    endHour: 24,
    endMinute: 0,
  },
  {
    dayOfWeek: 'FRIDAY',
    startHour: 0,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
  },
];

function chave(s) {
  return [s.dayOfWeek, s.startHour, s.startMinute, s.endHour, s.endMinute].join(
    '|'
  );
}

function main() {
  Logger.log('Fuso da conta: ' + AdsApp.currentAccount().getTimeZone());
  var alvo = AGENDA.map(chave).sort().join(';');
  CAMPANHAS.forEach(function (nome) {
    var it = AdsApp.campaigns()
      .withCondition("campaign.name = '" + nome + "'")
      .get();
    if (!it.hasNext()) throw new Error('Campanha não encontrada: ' + nome);
    var c = it.next();
    var atuais = [],
      sel = c.targeting().adSchedules().get();
    while (sel.hasNext()) {
      var a = sel.next();
      atuais.push({
        obj: a,
        k: chave({
          dayOfWeek: a.getDayOfWeek(),
          startHour: a.getStartHour(),
          startMinute: a.getStartMinute(),
          endHour: a.getEndHour(),
          endMinute: a.getEndMinute(),
        }),
      });
    }
    if (
      atuais
        .map(function (x) {
          return x.k;
        })
        .sort()
        .join(';') === alvo
    ) {
      Logger.log('OK já programada: ' + nome);
      return;
    }
    atuais.forEach(function (x) {
      x.obj.remove();
    });
    AGENDA.forEach(function (s) {
      var op = c.addAdSchedule(s);
      if (!op.isSuccessful())
        throw new Error(
          'Falha em ' + nome + ' ' + chave(s) + ': ' + op.getErrors()
        );
    });
    Logger.log(
      'PROGRAMADA ' +
        nome +
        ': seg 6h–24h, ter–qui o dia todo, sex até 18h' +
        (atuais.length
          ? ' (removidas ' + atuais.length + ' faixas antigas)'
          : '')
    );
  });
}
