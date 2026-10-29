// n8n "RK Ju - Comando": nós Code depois da IA. Cópia; manter igual ao n8n (25/10/2026).
// 29/10/2026: anotar, fechar_agenda e abrir_agenda vão para o nó "Executar no banco"
// (rpc fn_ju_comando_executar), que devolve {texto, status} para a conversa.
// 29/10/2026: reservar_agenda também vai para "Executar no banco" (compromisso categoria reserva).

// ── Nó "Ler decisão" ─────────────────────────────────────────────────────────────────────────────
// A IA só propõe. Faltou dado = vira pergunta; lista vazia em cobrar/nota = vira informação.
const r = $input.first().json;
let txt = '';
for (const o of (r.output || [])) {
  if (o.type === 'message') for (const c of (o.content || [])) if (c.type === 'output_text') txt += c.text;
}
let d = null;
try { d = JSON.parse(txt); } catch (e) { d = null; }
if (!d || !d.acao) return [{ json: { acao: 'erro', resumo: 'resposta da IA ilegível' } }];
if (d.acao === 'agendar' && !(d.paciente_id && d.data && d.hora && d.profissional_id && d.tipo_servico_id)) {
  d.acao = 'perguntar';
  d.mensagem = d.mensagem || 'Me confirma o dia, o horário e com qual fisio?';
}
if (d.acao === 'cobrar' && !(d.agendamento_ids || []).length) {
  d.acao = 'informar';
  d.mensagem = d.mensagem || 'Não há sessão pendente de cobrança para esse pedido.';
}
if (d.acao === 'nota' && !(d.fatura_ids || []).length) {
  d.acao = 'informar';
  d.mensagem = d.mensagem || 'Não há pagamento recente com nota fiscal.';
}
if (d.acao === 'anotar' && !(d.pessoa_id && String(d.anotacao || '').trim())) {
  d.acao = 'perguntar';
  d.mensagem = d.mensagem || 'O que exatamente devo anotar, e de quem?';
}
if (d.acao === 'reservar_agenda' && !(d.data && d.hora && (d.profissional || d.profissional_id))) {
  d.acao = 'perguntar';
  d.mensagem = d.mensagem || 'Qual dia, horário e de qual profissional é a reserva?';
}
if (['fechar_agenda', 'abrir_agenda'].includes(d.acao) && !(d.data && (d.profissional || d.profissional_id))) {
  d.acao = 'perguntar';
  d.mensagem = d.mensagem || 'Qual dia e de qual profissional?';
}
if (['informar', 'ajuda'].includes(d.acao) && !String(d.mensagem || '').trim()) {
  return [{ json: { ...d, acao: 'erro', resumo: 'IA sem mensagem para ' + d.acao } }];
}
return [{ json: d }];

// ── Nó "Pergunta" (perguntar, informar, ajuda, nao_suportado, erro) ──────────────────────────────
const d = $input.first().json;
const STATUS = { informar: 'informado', ajuda: 'ajuda', nao_suportado: 'nao_suportado', perguntar: 'pergunta' };
if (d.acao === 'erro') return [{ json: { texto: '', status: 'erro' } }];
const padrao = d.acao === 'nao_suportado'
  ? 'Por aqui eu consigo agendar, gerar a cobrança das sessões, cuidar da nota fiscal e contar como está o paciente.'
  : 'Me confirma o dia, o horário e com qual fisio?';
return [{ json: { texto: String(d.mensagem || padrao).trim(), status: STATUS[d.acao] || 'pergunta' } }];

// ── Nó "Resposta da execução" (cobrar e nota, depois da edge ju-comando) ─────────────────────────
// Texto montado só com o que a edge devolveu (nada da IA). A família também lê.
const r = $input.first().json;
if (r.codigo === 'JA_EXECUTADO') return []; // pedido repetido: não responde de novo
const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const lista = (xs) => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1] : (xs[0] || '');
const linhas = [];
let status = 'recusado';

if (r.acao === 'cobrar') {
  if (r.ok) {
    const quando = r.envio === 'agora' ? 'chega em seguida' : `chega ${r.envio}`;
    const ger = r.geradas || [];
    if (ger.length === 1) {
      const g = ger[0];
      linhas.push(`Pronto, gerei a cobrança de ${g.sessoes} ${g.sessoes === 1 ? 'sessão' : 'sessões'} de ${g.crianca} (${brl(g.valor)}). O link de pagamento ${quando}.`);
    } else if (ger.length > 1) {
      linhas.push(`Pronto, gerei as cobranças: ${lista(ger.map(g => `${g.sessoes} ${g.sessoes === 1 ? 'sessão' : 'sessões'} de ${g.crianca} (${brl(g.valor)})`))}. Os links de pagamento ${quando.replace('chega', 'chegam')}.`);
    }
    if (ger.length) status = 'cobrado';
    for (const e of (r.erros || [])) {
      if (e.motivo === 'CADASTRO_INCOMPLETO') {
        linhas.push(`Não consegui gerar a cobrança de ${e.crianca}: falta no cadastro do responsável financeiro ${lista(e.faltando || [])}.`);
      } else {
        linhas.push(`Não consegui gerar a cobrança de ${e.crianca} agora. A recepção vai conferir.`);
      }
    }
    const jaCob = (r.recusadas || []).filter(x => x.motivo === 'JA_COBRADA');
    if (jaCob.length) linhas.push(`${jaCob.length === 1 ? 'A sessão de' : 'As sessões de'} ${lista(jaCob.map(x => x.dia))} já ${jaCob.length === 1 ? 'tinha' : 'tinham'} cobrança.`);
  } else if (r.codigo === 'NADA_A_FAZER') {
    const jaCob = (r.recusadas || []).filter(x => x.motivo === 'JA_COBRADA');
    linhas.push(jaCob.length ? 'Essas sessões já têm cobrança.' : 'Não há sessão pendente de cobrança para esse pedido.');
  } else if (r.codigo === 'SEM_ITENS') {
    linhas.push('Não há sessão pendente de cobrança para esse pedido.');
  }
} else if (r.acao === 'nota') {
  if (r.ok) {
    const em = r.emitidas || [];
    if (em.length === 1) linhas.push(`Segue a nota fiscal: ${em[0].link}`);
    else if (em.length > 1) linhas.push('Seguem as notas fiscais:\n' + em.map(n => `${n.crianca}, pagamento de ${n.pago_em}: ${n.link}`).join('\n'));
    for (const p of (r.pedidas || [])) {
      linhas.push(`${p.reemissao ? 'Pedi a reemissão' : 'Pedi a emissão'} da nota do pagamento de ${p.pago_em}. Ela chega por aqui assim que a prefeitura autorizar.`);
    }
    for (const p of (r.processando || [])) {
      linhas.push(`A nota do pagamento de ${p.pago_em} já está sendo emitida e chega por aqui assim que a prefeitura autorizar.`);
    }
    for (const e of (r.erros || [])) {
      linhas.push(`Não consegui pedir a nota do pagamento de ${e.pago_em} agora. A recepção vai verificar.`);
    }
    if (em.length + (r.pedidas || []).length + (r.processando || []).length) status = 'nota';
  } else if (r.codigo === 'NADA_A_FAZER' || r.codigo === 'SEM_ITENS') {
    linhas.push('Não há pagamento recente com nota fiscal.');
  }
}
return [{ json: { texto: linhas.join('\n'), status } }];
