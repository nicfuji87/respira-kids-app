/**
 * Respira Kids — custo diário do Google Ads → sistema da clínica (atribuição v2)
 *
 * Onde colar: Google Ads (conta 874-439-1492) → Ferramentas → Ações em massa →
 * Scripts → "+" → colar tudo → Autorizar → Visualizar → Executar.
 * Frequência: Diariamente, de manhã (ex.: 6h). Pode rodar várias vezes: cada
 * envio SUBSTITUI os dias que traz, então nada duplica.
 *
 * O que envia: por dia e campanha, custo (cost_micros), impressões, cliques,
 * nome e status; e o total da conta por dia, para o sistema conferir
 * (conciliação). Nada de dado de paciente sai ou entra aqui.
 *
 * TOKEN: no Supabase do sistema, SQL Editor:
 *   select decrypted_secret from vault.decrypted_secrets where name = 'atrib_custos_token';
 * Para trocar o token: vault.update_secret(...) e colar o novo aqui.
 *
 * Primeira execução: para trazer o histórico, mude DIAS para 31 uma vez,
 * execute, e volte para 7.
 */
var CONFIG = {
  ENDPOINT:
    'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/rpc/fn_atrib_custos_receber',
  // chave pública (anon) do sistema: a mesma que já está no app; não dá acesso a dados
  CHAVE_PUBLICA:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
  TOKEN: 'COLE_AQUI_O_TOKEN_DO_VAULT',
  DIAS: 7, // janela reprocessada a cada execução (máximo 31)
  EMAIL_ALERTA: '', // opcional: e-mail para avisar se o envio falhar
};

function main() {
  if (CONFIG.TOKEN.indexOf('COLE_AQUI') === 0)
    throw new Error('Configure o TOKEN antes de executar.');
  var conta = AdsApp.currentAccount();
  var fuso = conta.getTimeZone();
  var hoje = new Date();
  var ate = Utilities.formatDate(hoje, fuso, 'yyyy-MM-dd');
  var de = Utilities.formatDate(
    new Date(hoje.getTime() - CONFIG.DIAS * 86400000),
    fuso,
    'yyyy-MM-dd'
  );
  var periodo = "segments.date BETWEEN '" + de + "' AND '" + ate + "'";

  // Campanhas (todas, inclusive pausadas/removidas, para bater com o total da conta)
  var linhas = [];
  var it = AdsApp.search(
    'SELECT campaign.id, campaign.name, campaign.status, segments.date, ' +
      'metrics.cost_micros, metrics.impressions, metrics.clicks ' +
      'FROM campaign WHERE ' +
      periodo
  );
  while (it.hasNext()) {
    var r = it.next();
    linhas.push({
      data: r.segments.date,
      campanha_id: String(r.campaign.id),
      campanha_nome: r.campaign.name,
      status: r.campaign.status,
      impressoes: String(r.metrics.impressions || 0),
      cliques: String(r.metrics.clicks || 0),
      custo_micros: String(r.metrics.costMicros || 0),
    });
  }

  // Total da conta por dia (conciliação)
  var totais = [];
  var it2 = AdsApp.search(
    'SELECT segments.date, metrics.cost_micros FROM customer ' +
      'WHERE ' +
      periodo
  );
  while (it2.hasNext()) {
    var t = it2.next();
    totais.push({
      data: t.segments.date,
      custo_micros: String(t.metrics.costMicros || 0),
    });
  }

  var corpo = {
    p: {
      plataforma: 'google_ads',
      conta_id: conta.getCustomerId(),
      moeda: conta.getCurrencyCode(),
      fuso: fuso,
      periodo_de: de,
      periodo_ate: ate,
      execucao:
        'ads-script ' + Utilities.formatDate(hoje, fuso, "yyyy-MM-dd'T'HH:mm"),
      linhas: linhas,
      totais_conta: totais,
    },
    p_token: CONFIG.TOKEN,
  };

  var resp = UrlFetchApp.fetch(CONFIG.ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: CONFIG.CHAVE_PUBLICA,
      Authorization: 'Bearer ' + CONFIG.CHAVE_PUBLICA,
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });
  var codigo = resp.getResponseCode();
  var texto = resp.getContentText();
  Logger.log('HTTP ' + codigo + ' — ' + texto);

  var resultado = {};
  try {
    resultado = JSON.parse(texto);
  } catch (e) {}
  if (codigo !== 200 || resultado.ok !== true) {
    var msg =
      'Custos do Google Ads NÃO importados (' +
      de +
      ' a ' +
      ate +
      '): HTTP ' +
      codigo +
      ' — ' +
      texto;
    if (CONFIG.EMAIL_ALERTA)
      MailApp.sendEmail(
        CONFIG.EMAIL_ALERTA,
        'Respira Kids: falha na importação de custos',
        msg
      );
    throw new Error(msg);
  }
  if (resultado.status === 'divergente') {
    var aviso =
      'Importação com divergência entre campanhas e total da conta: R$ ' +
      resultado.diferenca;
    Logger.log(aviso);
    if (CONFIG.EMAIL_ALERTA)
      MailApp.sendEmail(
        CONFIG.EMAIL_ALERTA,
        'Respira Kids: custos com divergência',
        aviso
      );
  }
  Logger.log(
    'OK: ' +
      resultado.linhas +
      ' linhas, R$ ' +
      resultado.custo +
      ' de ' +
      de +
      ' a ' +
      ate
  );
}
