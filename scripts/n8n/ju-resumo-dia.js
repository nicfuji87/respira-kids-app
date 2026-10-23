// n8n "RK Ju - Resumo do dia" (seg–sex 12h e 17h30; substitui os lembretes ⏰ de pedido não urgente). Cópia dos dois nós Code; manter igual.
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
urgente = true quando envolve hoje ou amanhã (consulta, encaixe, cancelamento de última hora), reclamação ou cobrança contestada.
Sem markdown, sem negrito, sem travessão. Português do Brasil, sem diminutivos. Ordem: urgentes primeiro, depois do mais antigo para o mais novo.`;

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
      model: 'gpt-6.1-sol',
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
// else texto = titulo + '\n\n' + itens.map((i) => (i.urgente ? '❗ ' : '• ') + i.linha).join('\n');
// return [{ json: { texto } }];
