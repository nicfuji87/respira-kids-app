// n8n "RK Ju - Resumo do dia" (LbvRzMa24xrFJx29). Cópia dos dois nós Code; manter igual ao n8n.
// Desde 06/11/2026: formato "RESPIRA KIDS | PENDÊNCIAS", de 2 em 2 h (8h–17h30), fixado no 🔔.

// ── Nó "Montar pedido" ─────────────────────────────────────────────────────────────
// Cópia: scripts/n8n/ju-resumo-dia.js (nó "Montar pedido")
// 06/11/2026: resumo virou "PENDÊNCIAS" (quem espera resposta + pedidos abertos no 🔔). A IA só escolhe e descreve;
// tempos, telefone, seções e contagens são do código (nó "Montar mensagem").
const conversas = $input
  .all()
  .map((i) => i.json)
  .filter((c) => c && c.conversa_id);
const agora = DateTime.now().setZone('America/Sao_Paulo').setLocale('pt-BR');

const PROMPT = `Você é a Ju, assistente da recepção da Respira Kids (fisioterapia pediátrica em Brasília). Agora: ${agora.toFormat('cccc, dd/MM/yyyy HH:mm')}.
Você recebe conversas de WhatsApp que podem precisar da Lolô (a secretária): famílias que escreveram depois da última resposta dela e conversas com pedido aberto no grupo de avisos (pedidos_abertos), mesmo quando a família não voltou a escrever (familia_esperando false). Para cada uma vêm as mensagens desde a última resposta da Lolô (da família, da Ju e automáticas), o contexto antes da última fala da Lolô, os pedidos abertos, as crianças e as consultas.
Sua tarefa: escolher só o que ainda precisa de uma ação da equipe e devolver um item por conversa, para a lista de pendências da recepção.

Precisa de ação: pergunta ou pedido que ninguém resolveu (horário, marcar, remarcar, cancelar, link de pagamento, nota fiscal, documento, valor que a Ju não respondeu, dúvida que a Ju passou para a Lolô), pedido aberto ainda não resolvido, reclamação, família esperando um retorno.
Não precisa: só agradecimento, "ok", "joia", emoji, despedida, aviso de que está chegando ou atrasada, "confirmado"; algo que a Ju já respondeu por completo; pedido de marcar quando a consulta já aparece em proximas_consultas ou consultas_ultimos_dias; família que só avisou que não vai mais precisar; conversa de alguém da clínica.
Pedido aberto (pedidos_abertos) é pendência enquanto não estiver resolvido pelas mensagens ou pela agenda; se já foi resolvido (consulta lançada, link enviado, contrato assinado ou reenviado depois do pedido), não inclua.
Mensagens com quem "mensagem_automatica" são do sistema (link de pagamento, confirmação, lembrete, cancelamento): se a família pediu o link e depois veio a mensagem automática do link, o pedido está atendido.
Contrato: cada criança traz contrato (status e ultimo_envio, com quando, chegou_na_assinafy e erro). A Assinafy manda o link de um número próprio, então o envio não aparece na conversa. Pedido do contrato com ultimo_envio depois dele, chegado e sem erro, está atendido (só volta se a família disser de novo que não recebeu). Status assinado resolve qualquer pedido sobre o contrato. Se ultimo_envio tem erro, diga que o envio do contrato falhou.
Assunto: use linha_no_resumo_anterior e contexto_antes_da_lolo quando as mensagens novas não trazem o assunto (só cumprimento, ok, "estou no aguardo"). Nunca escreva "assunto não informado" nem "verificar pendência".

Campos de cada item:
- quem: primeiro nome do responsável (responsavel ou responsaveis). Sem cadastro de família: "Contato novo" se for alguém procurando atendimento; quem não é família, pelo papel (ex.: "Fornecedor", "Contabilidade", "Médico").
- categoria: agendamento (marcar, encaixe, remarcar, horário, lista de espera), cancelamento, pagamento (link, cobrança, nota fiscal, comprovante, reembolso, compra da loja), contrato (contrato, cadastro, documento, atestado, relatório), orientacao (dúvida sobre serviço, domiciliar, como funciona, dúvida clínica), outro.
- urgente: true quando envolve hoje ou amanhã (consulta, encaixe, cancelamento ou remarcação de última hora), reclamação, cobrança contestada, ou oportunidade_em_risco true.
- resumo: uma frase curta com o que falta, com o dado concreto (serviço, fisio, dia, horário, valor). Use *negrito* só em HOJE, AMANHÃ e horário crítico (ex.: "Cancelamento da sessão *HOJE às 11h*."). Sem telefone, sem tempo de espera e sem "no resumo desde": o sistema acrescenta.
- acao: o próximo passo da equipe, curto e começando com verbo (ex.: "Oferecer horário.", "Enviar link de pagamento.", "Confirmar cancelamento e informar a política.").
Português do Brasil, sem diminutivos, sem travessão, sem outro markdown.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['itens'],
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'conversa_id',
          'quem',
          'categoria',
          'urgente',
          'resumo',
          'acao',
        ],
        properties: {
          conversa_id: { type: 'integer' },
          quem: { type: 'string' },
          categoria: {
            type: 'string',
            enum: [
              'agendamento',
              'cancelamento',
              'pagamento',
              'contrato',
              'orientacao',
              'outro',
            ],
          },
          urgente: { type: 'boolean' },
          resumo: { type: 'string' },
          acao: { type: 'string' },
        },
      },
    },
  },
};

return [
  {
    json: {
      body: {
        model: 'gpt-6.1-terra',
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify(conversas) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'pendencias',
            strict: true,
            schema,
          },
        },
      },
    },
  },
];

// ── Nó "Montar mensagem" ───────────────────────────────────────────────────────────
// Cópia: scripts/n8n/ju-resumo-dia.js (nó "Montar mensagem")
// 06/11/2026: formato "RESPIRA KIDS | PENDÊNCIAS" (pedido do dono). Seções: prioridade imediata (urgente ou contato
// novo esperando), pendências antigas (mais de 24 h), depois por assunto. Tempo, telefone e contagens vêm do banco.
// No resumo das 17h30 entra o bloco "Atendimento de hoje" (fn_ju_atendimento_dia, só SQL).
const r = $('Resumir').first().json;
let txt = '';
for (const o of r.output || [])
  if (o.type === 'message')
    for (const c of o.content || [])
      if (c.type === 'output_text') txt += c.text;
let itens = null;
try {
  itens = JSON.parse(txt).itens || [];
} catch (e) {
  itens = null;
}

const tz = 'America/Sao_Paulo';
const agora = DateTime.now().setZone(tz);
const DIAS = [
  '',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
];
const hm = (d) => d.toFormat("HH'h'mm");
const titulo =
  '📋 *RESPIRA KIDS | PENDÊNCIAS*\n🕗 ' +
  DIAS[agora.weekday] +
  ', ' +
  agora.toFormat('dd/MM') +
  ' • ' +
  hm(agora);
const SEP = '━━━━━━━━━━━━━━━━';

// próximo resumo: 8h, 10h, 12h, 14h, 16h e 17h30, seg a sex
const HORAS = [
  [8, 0],
  [10, 0],
  [12, 0],
  [14, 0],
  [16, 0],
  [17, 30],
];
let prox = null;
for (let d = 0; d < 8 && !prox; d++) {
  const dia = agora.plus({ days: d }).startOf('day');
  if (dia.weekday > 5) continue;
  for (const [h, m] of HORAS) {
    const t = dia.set({ hour: h, minute: m });
    if (t > agora.plus({ minutes: 5 })) {
      prox = t;
      break;
    }
  }
}
const proxTxt = !prox
  ? ''
  : prox.hasSame(agora, 'day')
    ? hm(prox)
    : (prox.hasSame(agora.plus({ days: 1 }), 'day')
        ? 'amanhã, '
        : DIAS[prox.weekday].toLowerCase() + ', ') + hm(prox);

const dur = (min) => {
  if (min < 60) return Math.max(1, Math.round(min)) + ' min';
  if (min < 24 * 60) {
    const h = Math.floor(min / 60),
      m = Math.round(min % 60);
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  }
  const d = Math.floor(min / (24 * 60));
  return d + (d === 1 ? ' dia' : ' dias');
};
const desde = (iso) => {
  const d = DateTime.fromISO(iso).setZone(tz);
  const min = agora.diff(d, 'minutes').minutes;
  if (d.hasSame(agora, 'day'))
    return 'desde ' + d.toFormat('HH:mm') + '. *(' + dur(min) + ')*';
  if (d.hasSame(agora.minus({ days: 1 }), 'day'))
    return 'desde ontem, ' + hm(d) + '. *(' + dur(min) + ')*';
  return 'desde *' + d.toFormat('dd/MM') + ' (' + dur(min) + ')*';
};

let texto;
let linhas = [];
if (itens === null) {
  texto =
    titulo +
    '\n\nNão consegui montar a lista agora. Vale passar pelas conversas não lidas.';
} else {
  const dados = {};
  for (const it of $('Conversas esperando').all())
    if (it.json?.conversa_id) dados[it.json.conversa_id] = it.json;
  const CAT = {
    agendamento: {
      emoji: '📅',
      titulo: 'AGENDAMENTOS AGUARDANDO',
      um: 'agendamento',
      varios: 'agendamentos',
      cor: '🟠',
    },
    cancelamento: {
      emoji: '❌',
      titulo: 'CANCELAMENTOS E REMARCAÇÕES',
      um: 'cancelamento',
      varios: 'cancelamentos',
      cor: '🟠',
    },
    pagamento: {
      emoji: '💳',
      titulo: 'PAGAMENTO',
      um: 'cobrança',
      varios: 'cobranças',
      cor: '🟡',
    },
    contrato: {
      emoji: '✍️',
      titulo: 'CONTRATO E DOCUMENTOS',
      um: 'documento',
      varios: 'documentos',
      cor: '🟡',
    },
    orientacao: {
      emoji: '🔎',
      titulo: 'ORIENTAÇÃO',
      um: 'orientação',
      varios: 'orientações',
      cor: '🟡',
    },
    outro: {
      emoji: '📌',
      titulo: 'OUTROS',
      um: 'outro',
      varios: 'outros',
      cor: '🟡',
    },
  };
  const lista = itens
    .map((i) => {
      const d = dados[i.conversa_id] || {};
      const iso = d.pendente_desde_iso || null;
      const min = iso
        ? agora.diff(DateTime.fromISO(iso).setZone(tz), 'minutes').minutes
        : 0;
      const risco = d.oportunidade_em_risco === true;
      const urgente = !!i.urgente || risco;
      const antiga = !urgente && min >= 24 * 60;
      const cat = CAT[i.categoria] ? i.categoria : 'outro';
      return { ...i, cat, d, iso, min, urgente, antiga };
    })
    .sort((a, b) => b.min - a.min);

  const bloco = (i, cor) => {
    const tel = i.d.telefone ? ' • ' + i.d.telefone : '';
    const quem =
      String(i.quem || '').trim() ||
      (i.d.contato_novo ? 'Contato novo' : 'Família');
    const espera = i.iso
      ? '⏱️ ' +
        (i.d.familia_esperando === false ? 'Pedido aberto ' : 'Aguarda ') +
        desde(i.iso)
      : '';
    return [
      cor + ' *' + quem + '*' + tel,
      String(i.resumo || '').trim(),
      espera,
      '➡️ ' + String(i.acao || '').trim(),
    ]
      .filter(Boolean)
      .join('\n');
  };

  const urg = lista.filter((i) => i.urgente);
  const ant = lista.filter((i) => i.antiga);
  const resto = lista.filter((i) => !i.urgente && !i.antiga);

  const cont = {};
  for (const i of lista) cont[i.cat] = (cont[i.cat] || 0) + 1;
  const partesCat = Object.keys(CAT)
    .filter((k) => cont[k])
    .map(
      (k) =>
        CAT[k].emoji +
        ' ' +
        cont[k] +
        ' ' +
        (cont[k] === 1 ? CAT[k].um : CAT[k].varios)
    );

  if (!lista.length) {
    texto = titulo + '\n\n*Nenhuma pendência aberta* ✅';
  } else {
    const cab = [
      '*' +
        lista.length +
        (lista.length === 1 ? ' pendência aberta*' : ' pendências abertas*'),
    ];
    const alertas = [];
    if (urg.length) alertas.push('🚨 ' + urg.length + ' com prioridade');
    if (ant.length)
      alertas.push(
        '⏳ ' + ant.length + (ant.length === 1 ? ' antiga' : ' antigas')
      );
    if (alertas.length) cab.push(alertas.join(' • '));
    cab.push(partesCat.join(' • '));
    const secoes = [];
    if (urg.length)
      secoes.push(
        '🚨 *PRIORIDADE IMEDIATA*\n\n' +
          urg.map((i) => bloco(i, '🔴')).join('\n\n')
      );
    if (ant.length)
      secoes.push(
        '⏳ *PENDÊNCIAS ANTIGAS*\n\n' +
          ant.map((i) => bloco(i, '🔴')).join('\n\n')
      );
    for (const k of Object.keys(CAT)) {
      const g = resto.filter((i) => i.cat === k);
      if (g.length)
        secoes.push(
          CAT[k].emoji +
            ' *' +
            CAT[k].titulo +
            '*\n\n' +
            g.map((i) => bloco(i, CAT[k].cor)).join('\n\n')
        );
    }
    texto =
      titulo +
      '\n\n' +
      cab.join('\n') +
      '\n\n' +
      SEP +
      '\n\n' +
      secoes.join('\n\n' + SEP + '\n\n');
  }
  linhas = lista.map((i) => ({
    conversa_id: i.conversa_id,
    linha: String(i.resumo || '').trim() + ' ➡️ ' + String(i.acao || '').trim(),
    urgente: i.urgente,
  }));
}

// 17h30: números do dia (só SQL)
const at = $('Atendimento do dia').isExecuted
  ? $('Atendimento do dia').first().json || {}
  : {};
if (agora.hour === 17 && agora.minute >= 25 && at && at.pedidos !== undefined) {
  const l = ['📊 *ATENDIMENTO DE HOJE*'];
  if (!at.pedidos) l.push('Nenhum pedido passado pela Ju hoje.');
  else {
    l.push(
      '1. Velocidade: ' +
        (at.respondidos
          ? 'mediana de ' +
            at.mediana_min +
            ' min e pior 10% em ' +
            at.p90_min +
            ' min (' +
            at.respondidos +
            ' de ' +
            at.pedidos +
            ' pedidos respondidos).'
          : 'nenhum pedido respondido ainda.')
    );
    l.push(
      '2. Horário mais lento: ' +
        (at.gargalo
          ? at.gargalo.faixa +
            ', mediana de ' +
            at.gargalo.mediana_min +
            ' min em ' +
            at.gargalo.pedidos +
            ' pedidos.'
          : 'sem faixa com volume suficiente.') +
        (at.pendentes
          ? ' ' +
            at.pendentes +
            (at.pendentes === 1
              ? ' pedido ainda sem resposta'
              : ' pedidos ainda sem resposta') +
            ', o mais antigo há ' +
            dur(at.pendente_mais_antigo_min || 0) +
            ' de expediente.'
          : '')
    );
    l.push(
      '3. Contatos novos: ' +
        (at.novos
          ? at.novos +
            (at.novos === 1 ? ' pedido' : ' pedidos') +
            '; ' +
            at.novos_mais_15 +
            (at.novos_mais_15 === 1 ? ' esperou' : ' esperaram') +
            ' mais de 15 min e ' +
            at.novos_mais_30 +
            ' mais de 30 min' +
            (at.novos_sem_resposta
              ? ', ' + at.novos_sem_resposta + ' ainda sem resposta.'
              : '.')
          : 'nenhum hoje.')
    );
    l.push('_Tempo contado só no expediente (seg a sex, 8h às 18h)._');
  }
  texto += '\n\n' + SEP + '\n\n' + l.join('\n');
}

texto +=
  '\n\n' +
  SEP +
  '\n\n🔔 *Próximo resumo: ' +
  proxTxt +
  '*\nPendências resolvidas saem sozinhas da lista. Casos críticos ficam em destaque.';

// itens vão para o banco (fn_ju_resumo_postado): o que entrou volta a ser conferido nos próximos resumos
return [{ json: { texto, itens: linhas } }];
