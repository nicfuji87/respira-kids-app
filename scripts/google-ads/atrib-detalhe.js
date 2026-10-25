/**
 * Respira Kids — custo por palavra-chave + termos de pesquisa → sistema da clínica
 *
 * Alimenta a aba Marketing → Otimização: custo/cliques por grupo e palavra-chave
 * (cruzado com conversas, agendamentos, pacientes e receita) e os termos que as
 * pessoas digitaram, marcando os que citam convênio/operadora.
 *
 * Onde colar: Google Ads (874-439-1492) → Ferramentas → Ações em massa → Scripts →
 * "+" → colar tudo → Autorizar → Visualizar → Salvar → frequência "Diariamente"
 * (ex.: 7h, depois do script de custos).
 *
 * TOKEN: o MESMO do script de custos. No Supabase do SISTEMA, SQL Editor:
 *   select decrypted_secret from vault.decrypted_secrets where name = 'atrib_custos_token';
 *
 * Cada envio SUBSTITUI os dias que traz (repetir não duplica). Nada de dado de
 * paciente sai daqui. O Google já esconde termos de volume muito baixo.
 */
var CONFIG = {
  ENDPOINT:
    'https://jqegoentcusnbcykgtxg.supabase.co/rest/v1/rpc/fn_atrib_ads_detalhe_receber',
  // chave pública (anon) do sistema: a mesma do script de custos
  CHAVE_PUBLICA:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
  TOKEN: 'COLE_AQUI_O_TOKEN_DO_VAULT',
  DIAS: 7, // janela reprocessada (máx. 31; na 1ª vez pode usar 31)
  EMAIL_ALERTA: '',
};

function main() {
  if (CONFIG.TOKEN.indexOf('COLE_AQUI') === 0)
    throw new Error('Configure o TOKEN antes de executar.');
  try {
    executar();
  } catch (e) {
    if (CONFIG.EMAIL_ALERTA)
      MailApp.sendEmail(
        CONFIG.EMAIL_ALERTA,
        'Respira Kids: falha no detalhe do Google Ads',
        String(e && e.stack ? e.stack : e)
      );
    throw e;
  }
}

function executar() {
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

  var palavras = [];
  var it = AdsApp.search(
    'SELECT segments.date, campaign.id, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ' +
      'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
      'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
      'FROM keyword_view WHERE ' +
      periodo
  );
  while (it.hasNext()) {
    var r = it.next();
    palavras.push({
      data: r.segments.date,
      campanha_id: String(r.campaign.id),
      grupo_id: String(r.adGroup.id),
      grupo_nome: r.adGroup.name,
      criterio_id: String(r.adGroupCriterion.criterionId),
      palavra: r.adGroupCriterion.keyword.text,
      correspondencia: r.adGroupCriterion.keyword.matchType,
      impressoes: String(r.metrics.impressions || 0),
      cliques: String(r.metrics.clicks || 0),
      custo_micros: String(r.metrics.costMicros || 0),
      conversoes: String(r.metrics.conversions || 0),
    });
  }

  var termos = [];
  var it2 = AdsApp.search(
    'SELECT segments.date, campaign.id, ad_group.id, search_term_view.search_term, ' +
      'segments.keyword.info.text, segments.keyword.info.match_type, ' +
      'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
      'FROM search_term_view WHERE ' +
      periodo
  );
  while (it2.hasNext()) {
    var t = it2.next();
    termos.push({
      data: t.segments.date,
      campanha_id: String(t.campaign.id),
      grupo_id: String(t.adGroup.id),
      termo: t.searchTermView.searchTerm,
      palavra:
        t.segments.keyword && t.segments.keyword.info
          ? t.segments.keyword.info.text
          : null,
      correspondencia:
        t.segments.keyword && t.segments.keyword.info
          ? t.segments.keyword.info.matchType
          : null,
      impressoes: String(t.metrics.impressions || 0),
      cliques: String(t.metrics.clicks || 0),
      custo_micros: String(t.metrics.costMicros || 0),
      conversoes: String(t.metrics.conversions || 0),
    });
  }

  var corpo = {
    p_token: CONFIG.TOKEN,
    p: {
      conta_id: conta.getCustomerId(),
      de: de,
      ate: ate,
      palavras: palavras,
      termos: termos,
    },
  };
  if (AdsApp.getExecutionInfo().isPreview()) {
    Logger.log(
      'VISUALIZAÇÃO: ' +
        palavras.length +
        ' linhas de palavra-chave e ' +
        termos.length +
        ' termos de ' +
        de +
        ' a ' +
        ate +
        ' (enviando mesmo assim: só leitura no Ads).'
    );
  }
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
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300)
    throw new Error(
      'Sistema respondeu ' + code + ': ' + resp.getContentText().slice(0, 300)
    );
  Logger.log('OK: ' + resp.getContentText());
}
