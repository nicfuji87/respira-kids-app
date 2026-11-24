/**
 * Respira Kids — conversão "Conversa iniciada (WhatsApp)" → Google Ads
 *
 * O que faz: de hora em hora, busca no Supabase do SITE os cliques vindos de
 * anúncio (gclid, guardado só com consentimento) cujo código RK chegou numa
 * mensagem de WhatsApp de verdade, e sobe cada um como conversão off-line.
 * Nada de paciente, agendamento, telefone ou saúde: só "houve conversa".
 *
 * Onde colar: Google Ads (conta 874-439-1492) → Ferramentas → Ações em massa →
 * Scripts → "+" → colar tudo → Autorizar → Visualizar → Executar.
 * Frequência: A cada hora.
 *
 * Pré-requisito: a ação de conversão "Conversa iniciada (WhatsApp)" (tipo
 * importação de cliques) criada no Ads com EXATAMENTE este nome, há pelo menos
 * algumas horas (o Google recusa upload para ação recém-criada).
 *
 * TOKEN: no Supabase do SITE (projeto obhimiwxpnwcjpgqfail), SQL Editor:
 *   select decrypted_secret from vault.decrypted_secrets where name = 'ads_conversoes_token';
 * Para trocar: vault.update_secret(...) + atualizar o hash em privado.app_tokens
 * (nome 'ads_conversoes') e colar o novo aqui.
 *
 * Em "Visualizar" o script só mostra o que enviaria: não sobe nada e não marca
 * nada como enviado. Upload repetido do mesmo clique o Google recusa como
 * duplicado. O resultado de cada lote aparece em Metas → Conversões → Uploads.
 * A cada execução, antes de enviar, confere se o Google contou o que já foi mandado
 * (ver conferir()). Execução manual no editor: "Executar" abre "Visualizar antes de
 * executar?" → "Executar sem visualizar".
 * Lado do banco: respirakids-site/docs/atribuicao/sql/site_03_conversa_iniciada.sql
 * e site_05_conversoes_confirmacao.sql
 */
var CONFIG = {
  BASE: 'https://obhimiwxpnwcjpgqfail.supabase.co/rest/v1/rpc/',
  // chave pública (anon) do Supabase do site: sem o token não lê nada
  CHAVE_PUBLICA:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaGltaXd4cG53Y2pwZ3FmYWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTM3NjEsImV4cCI6MjA5ODMyOTc2MX0.HngBebwbZL3QnxWCpdEeXrH7fCASNHleq-7qFw9XdQU',
  TOKEN: 'COLE_AQUI_O_TOKEN_DO_VAULT',
  NOME_CONVERSAO: 'Conversa iniciada (WhatsApp)',
  FUSO: 'America/Sao_Paulo',
  LIMITE: 500,
  EMAIL_ALERTA: '', // opcional: e-mail para avisar se falhar
};

function main() {
  if (CONFIG.TOKEN.indexOf('COLE_AQUI') === 0)
    throw new Error('Configure o TOKEN antes de executar.');
  try {
    // Conferência com problema não pode travar o envio: registra e acusa no fim.
    var falharam = [],
      erroConferencia = null;
    try {
      falharam = conferir();
    } catch (e) {
      erroConferencia = e;
      Logger.log('Conferência falhou: ' + e);
    }
    executar();
    if (erroConferencia) throw erroConferencia;
    if (falharam.length)
      throw new Error(
        'O Google não contou estas conversões mesmo após 3 envios: ' +
          falharam.join(', ') +
          '. Ver Metas → Conversões → Uploads (erros) e privado.cliques_ads.falhou_em.'
      );
  } catch (e) {
    if (CONFIG.EMAIL_ALERTA)
      MailApp.sendEmail(
        CONFIG.EMAIL_ALERTA,
        'Respira Kids: falha no envio de conversas iniciadas ao Google Ads',
        String(e && e.stack ? e.stack : e)
      );
    throw e;
  }
}

// "20261027 211001" (hora de Brasília, vinda do banco) →
// "2026-10-27 21:10:01 America/Sao_Paulo" (formato "yyyy-MM-dd HH:mm:ss zzzz"
// da ajuda do Google, support.google.com/google-ads/answer/7014069).
// O Google recusou "20261027 211001 America/Sao_Paulo" e "...21:10:01-03:00"
// (offset com dois-pontos): "Conversion Time inválido", 27–28/10/2026.
function horaGoogle(h) {
  return (
    h.slice(0, 4) +
    '-' +
    h.slice(4, 6) +
    '-' +
    h.slice(6, 8) +
    ' ' +
    h.slice(9, 11) +
    ':' +
    h.slice(11, 13) +
    ':' +
    h.slice(13, 15) +
    ' ' +
    CONFIG.FUSO
  );
}

// Confirmação (28/10/2026, banco: respirakids-site site_05_conversoes_confirmacao.sql).
// apply() não devolve resultado, então compara, por dia do clique, quantas conversões
// mandamos com quantas o Google contou na ação (all_conversions, que fica no dia do
// clique). Tolerância de ±1 dia (o clique no anúncio pode cair no dia anterior ao clique
// no WhatsApp). Dia coberto → confirma. Dia faltando → as não confirmadas enviadas há
// mais de 24 h voltam para a fila (reenvio do que já entrou só dá "duplicado"); após 2
// reenvios o banco marca "falhou" e a execução acusa erro.
function conferir() {
  var enviadas = rpc('conversoes_ads_enviadas', {
    p_token: CONFIG.TOKEN,
    p_dias: 35,
  });
  if (!enviadas || !enviadas.length) return [];

  var nossas = {},
    primeiro = null;
  enviadas.forEach(function (e) {
    nossas[e.dia] = (nossas[e.dia] || 0) + 1;
    if (!primeiro || e.dia < primeiro) primeiro = e.dia;
  });

  var google = {};
  var it = AdsApp.search(
    'SELECT segments.date, segments.conversion_action_name, metrics.all_conversions ' +
      "FROM customer WHERE segments.date BETWEEN '" +
      diaMenos(primeiro, 1) +
      "' AND '" +
      Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd') +
      "'"
  );
  while (it.hasNext()) {
    var r = it.next();
    if (r.segments.conversionActionName !== CONFIG.NOME_CONVERSAO) continue;
    google[r.segments.date] =
      (google[r.segments.date] || 0) +
      Math.round(Number(r.metrics.allConversions) || 0);
  }

  var confirmar = [],
    reenviar = [];
  enviadas.forEach(function (e) {
    if (e.confirmado) return;
    var d = e.dia,
      a = diaMenos(d, 1),
      b = diaMenos(d, -1);
    var g = (google[a] || 0) + (google[d] || 0) + (google[b] || 0);
    var n = (nossas[a] || 0) + (nossas[d] || 0) + (nossas[b] || 0);
    if ((google[d] || 0) >= nossas[d] || g >= n) confirmar.push(e.ref);
    else if (e.horas_desde_envio >= 24) reenviar.push(e.ref);
  });

  Logger.log(
    'Conferência: Google contou ' +
      JSON.stringify(google) +
      ', enviadas por dia ' +
      JSON.stringify(nossas) +
      ' → confirmar ' +
      confirmar.length +
      ', reenviar ' +
      reenviar.length
  );
  if (!confirmar.length && !reenviar.length) return [];
  if (AdsApp.getExecutionInfo().isPreview()) {
    Logger.log('VISUALIZAÇÃO: conferência não gravada.');
    return [];
  }
  var res = rpc('conversoes_ads_conferir', {
    p_token: CONFIG.TOKEN,
    p_confirmar: confirmar,
    p_reenviar: reenviar,
  });
  Logger.log('Banco: ' + JSON.stringify(res));
  return (res && res.falharam) || [];
}

// "2026-10-28", 1 → "2026-10-27" (n negativo soma). Meio-dia evita virada de fuso.
function diaMenos(dia, n) {
  var d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function executar() {
  var pendentes = rpc('conversoes_ads_pendentes', {
    p_token: CONFIG.TOKEN,
    p_limite: CONFIG.LIMITE,
  });
  if (!pendentes || !pendentes.length) {
    Logger.log('Nenhuma conversa iniciada pendente.');
    return;
  }

  var preview = AdsApp.getExecutionInfo().isPreview();
  var lote =
    'ads-script ' +
    Utilities.formatDate(new Date(), CONFIG.FUSO, "yyyy-MM-dd'T'HH:mm");
  var upload = AdsApp.bulkUploads().newCsvUpload(
    ['Google Click ID', 'Conversion Name', 'Conversion Time'],
    { moneyInMicros: false }
  );
  upload.forOfflineConversions();
  upload.setFileName('conversa-iniciada ' + lote);

  var refs = [];
  for (var i = 0; i < pendentes.length; i++) {
    var p = pendentes[i];
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(p.gclid || '')) continue;
    if (!/^\d{8} \d{6}$/.test(p.hora || '')) continue;
    upload.append({
      'Google Click ID': p.gclid,
      'Conversion Name': CONFIG.NOME_CONVERSAO,
      'Conversion Time': horaGoogle(p.hora),
    });
    refs.push(p.ref);
  }
  if (!refs.length) {
    Logger.log('Nada válido para enviar.');
    return;
  }

  if (preview) {
    upload.preview();
    Logger.log(
      'VISUALIZAÇÃO: enviaria ' + refs.length + ' conversões. Nada marcado.'
    );
    return;
  }

  upload.apply();
  var marcadas = rpc('conversoes_ads_marcar', {
    p_token: CONFIG.TOKEN,
    p_refs: refs,
    p_lote: lote,
  });
  Logger.log(
    'Enviadas ' + refs.length + ' conversões; marcadas no banco: ' + marcadas
  );
}

function rpc(nome, corpo) {
  var resp = UrlFetchApp.fetch(CONFIG.BASE + nome, {
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
  var txt = resp.getContentText();
  if (code < 200 || code >= 300)
    throw new Error(nome + ' respondeu ' + code + ': ' + txt.slice(0, 300));
  return JSON.parse(txt);
}
