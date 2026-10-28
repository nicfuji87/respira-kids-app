// n8n "RK Ju - Resumo do dia" (seg–sex 8h, 12h e 17h30; substitui os lembretes ⏰ de pedido não urgente). Cópia dos dois nós Code; manter igual.
// Banco (fn_ju_esperando_resposta) junta as conversas em que a família escreveu depois da última
// resposta da Lolô; a IA escolhe o que ainda precisa de resposta e escreve uma linha por conversa.

// ===== Nó "Montar pedido" =====
const conversas = $input.all().map((i) => i.json).filter((c) => c && c.conversa_id);
const agora = DateTime.now().setZone('America/Sao_Paulo').setLocale('pt-BR');

const PROMPT = `Você é a Ju, assistente da recepção da Respira Kids (fisioterapia pediátrica em Brasília). Agora: ${agora.toFormat("cccc, dd/MM/yyyy HH:mm")}.
Você recebe as conversas de WhatsApp em que a família escreveu depois da última resposta da Lolô (a secretária). Para cada uma vêm as mensagens desde a última resposta da Lolô (da família e da Ju, a assistente automática), os pedidos abertos, as crianças e as próximas consultas.
Sua tarefa: escolher só as conversas que ainda precisam de uma resposta da Lolô e escrever uma linha curta para cada uma, para ela responder no fim do dia.

Precisa de resposta: pergunta ou pedido que ninguém resolveu (horário, marcar, remarcar, cancelar, link de pagamento, nota fiscal, documento, valor que a Ju não respondeu, dúvida que a Ju passou para a Lolô), pedido aberto, reclamação, família esperando um retorno.
Não precisa: só agradecimento, "ok", "joia", emoji, despedida, aviso de que está chegando ou atrasada, "confirmado"; algo que a Ju já respondeu por completo; pedido de marcar quando a consulta já aparece em proximas_consultas; família que só avisou que não vai mais precisar; conversa de alguém da clínica.

Cada linha: quem (primeiro nome do responsável e, entre parênteses, o primeiro nome da criança; sem cadastro: o telefone e "sem cadastro"), dois-pontos, o que falta em poucas palavras e desde quando. Exemplos:
Luciana (Pedro): pediu horário amanhã (sábado) com a Flávia ou a Beatriz. Sem resposta desde 8h11.
Gabriela (João, paciente novo): quer remarcar para uma sexta de manhã em novembro. Sem resposta desde 8h23.
(61) 99649-0326, sem cadastro: perguntou o valor da respiratória para bebê de 6 meses; a Ju respondeu, falta oferecer horário. Sem resposta desde 15h51.
Mensagem de dia anterior: "desde ontem 18h03" ou "desde 21/10". Paciente novo = ja_atendido false.
Mensagens com quem "mensagem_automatica" são do sistema (link de pagamento, confirmação, lembrete, cancelamento): se a família pediu o link e depois veio a mensagem automática do link, o pedido está atendido.
Contrato: cada criança traz contrato (status e ultimo_envio, com quando, chegou_na_assinafy e erro). A Assinafy manda o link de um número próprio, então o envio não aparece na conversa. Se a família pediu o link do contrato ou disse que não recebeu e ultimo_envio é depois desse pedido, chegou na Assinafy e não tem erro, o pedido está atendido e não entra no resumo (só entra se depois do envio a família voltou a dizer que não recebeu). Status assinado resolve qualquer pedido sobre o contrato.
Assunto: cada conversa traz linha_no_resumo_anterior e contexto_antes_da_lolo (as últimas mensagens antes da última fala da Lolô). Quando as mensagens novas não trazem o assunto (só cumprimento, ok, "estou no aguardo"), use esses dois campos para dizer qual é a pendência concreta (ex.: "aguarda o valor somado das duas crianças para um Pix único"). Nunca escreva "assunto não informado" nem "verificar pendência".
Consultas: cada criança traz proximas_consultas e consultas_ultimos_dias (lançadas nos últimos 4 dias, inclusive as que já passaram, com o status). Se a família pediu uma sessão numa data e horário que aparece em qualquer uma das duas, o pedido foi atendido e não entra no resumo. Se ultimo_envio tem erro, a linha diz que o envio do contrato falhou.
Conversa com no_resumo_desde já apareceu em resumo anterior e a Lolô ainda não respondeu: mantenha a linha (só tire se a Ju resolveu por completo, se a consulta pedida já está em proximas_consultas, se o contrato pedido já foi enviado ou assinado ou se a família só agradeceu), marque urgente e termine com "No resumo desde DD/MM.". Família esperando há mais de 24 horas (horas_esperando) também é urgente.
urgente = true quando envolve hoje ou amanhã (consulta, encaixe, cancelamento de última hora), reclamação ou cobrança contestada.
Não coloque o telefone na linha de quem tem cadastro (o sistema acrescenta). Sem markdown, sem negrito, sem travessão. Português do Brasil, sem diminutivos. Ordem: urgentes primeiro, depois do mais antigo para o mais novo.`;

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
        required: ['conversa_id', 'linha', 'urgente'],
        properties: {
          conversa_id: { type: 'integer' },
          linha: { type: 'string' },
          urgente: { type: 'boolean' },
        },
      },
    },
  },
};

return [{
  json: {
    body: {
      model: 'gpt-6.1-terra',
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: JSON.stringify(conversas) },
      ],
      text: { format: { type: 'json_schema', name: 'esperando_resposta', strict: true, schema } },
    },
  },
}];

// ===== Nó "Montar mensagem" =====
// const r = $input.first().json;
// let txt = '';
// for (const o of (r.output || [])) if (o.type === 'message') for (const c of (o.content || [])) if (c.type === 'output_text') txt += c.text;
// let itens = null;
// try { itens = JSON.parse(txt).itens || []; } catch (e) { itens = null; }
// const agora = DateTime.now().setZone('America/Sao_Paulo').setLocale('pt-BR');
// const titulo = '📋 *Esperando resposta* · ' + agora.toFormat("ccc dd/MM, HH'h'mm");
// let texto;
// if (itens === null) texto = titulo + '\nNão consegui montar o resumo hoje. Vale passar pelas conversas não lidas.';
// else if (!itens.length) texto = titulo + '\nNenhuma conversa esperando resposta ✅';
// else {
//   // Telefone vem do banco (não da IA): a Lolô toca no número e abre a conversa.
//   const tel = {};
//   for (const it of $('Conversas esperando').all()) if (it.json?.conversa_id) tel[it.json.conversa_id] = it.json.telefone;
//   texto = titulo + '\n\n' + itens.map((i) => {
//     const t = tel[i.conversa_id];
//     const linha = String(i.linha || '').trim();
//     return (i.urgente ? '❗ ' : '• ') + linha + (t && !linha.includes(t) ? '\n   📞 ' + t : '');
//   }).join('\n');
// }
// // itens vão para o banco (fn_ju_resumo_postado): o que entrou volta a ser conferido nos próximos resumos
// return [{ json: { texto, itens: (itens || []).map((i) => ({ conversa_id: i.conversa_id, linha: i.linha, urgente: !!i.urgente })) } }];
