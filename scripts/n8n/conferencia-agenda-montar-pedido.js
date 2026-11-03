// n8n "RK Conferência de agenda" → nó "Montar pedido" (Code, Run Once for All Items, dentro do loop).
// Junta a conversa com os pacientes da família (fn_conferencia_contexto) e monta o pedido ao
// gpt-6-luna. A IA só LÊ as sessões; quem compara com a agenda é o banco
// (fn_conferencia_agenda_rodar), sem IA.

const conv = $('Um por vez').first().json;
const ctx = $input.first().json || {};
const pacientes = Array.isArray(ctx.pacientes) ? ctx.pacientes : [];

const AGENDA =
  /(sess[aã]o|consulta|hor[aá]rio|agend|marc|remarc|desmarc|encaix|amanh[aã]|hoje|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|\b\d{1,2}\s?h\b|\b\d{1,2}:\d{2}\b|atend|avalia|fisio|aspira|laser|vaga)/i;
const temAgenda = conv.mensagens.some((m) => AGENDA.test(m.texto));

let pular = null;
if (ctx.ignorar) pular = 'equipe_ou_teste';
else if (!pacientes.length && !temAgenda)
  pular = 'sem_paciente_e_sem_assunto_de_agenda';
if (pular) return [{ json: { pular, conversa_id: conv.conversa_id } }];

const agora = DateTime.now().setZone('America/Sao_Paulo');
const DIAS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const linhas = conv.mensagens.map((m) => {
  const d = DateTime.fromISO(m.em).setZone('America/Sao_Paulo');
  return `${m.id} | ${d.toFormat('dd/MM')} ${DIAS[d.weekday]} ${d.toFormat('HH:mm')} | ${m.quem}: ${m.texto}`;
});

const PROMPT = `Você lê conversas de WhatsApp de uma clínica de fisioterapia pediátrica (Respira Kids, Brasília) e lista as SESSÕES com data definida que a conversa mostra. Outra etapa vai comparar com a agenda do sistema; você só extrai, com fidelidade.

Para cada sessão (atendimento de uma criança numa data), dê a situação FINAL daquela data:
- combinada: agendada, confirmada, encaixe aceito pelos dois lados, ou família confirmou um lembrete (ex.: lembrete automático da clínica citando a consulta + família responde "Sim"/"Confirmar").
- realizada: a conversa mostra que a sessão aconteceu (família a caminho/chegou, relata como foi, pede valor "da que já fiz").
- cancelada: desmarcada sem nova data.
- remarcada: era nesta data e mudou para outra. Liste a data antiga como "remarcada" e a nova como "combinada".
- falta: a criança não foi sem avisar, ou avisou depois do horário.

Regras:
- Só sessões de fisioterapia com a equipe da Respira Kids (Bruna, Beatriz/Bia, Flávia, estagiárias). Consulta ou terapia com fono, médico, psicóloga ou outro profissional de fora NÃO entra.
- Marcar a PRÓXIMA sessão não muda a sessão atual. "remarcada" é só quando uma sessão já marcada muda de dia ou horário ("trocar", "passar para", "não vai dar, pode ser..."). Mensagem automática "Consulta agendada" de uma data nova não remarca nenhuma outra.
- Para cancelada, remarcada e falta, mensagem_id é a PRIMEIRA mensagem em que a família (ou a clínica) avisou. A mensagem automática "Sua consulta foi cancelada" só vale quando não houver aviso antes dela.
- Resolva datas relativas ("amanhã", "segunda", "dia 15") pela data da mensagem. Use só datas entre ${agora.minus({ days: 40 }).toISODate()} e ${agora.plus({ days: 14 }).toISODate()}.
- Pedido de horário sem fechamento, ou oferta da clínica sem aceite da família, NÃO é sessão.
- Conversa pessoal, de fornecedor, de cobrança ou nota fiscal sem sessão: devolva sessoes vazia.
- paciente_id: só um id da lista de pacientes da família. Se a criança não está na lista ou não dá para saber qual é, use null e escreva o nome como foi dito em paciente_nome.
- hora no formato HH:MM (24h), ou null se não foi dita. profissional: primeiro nome (Bruna, Beatriz/Bia, Flávia...) ou null.
- mensagem_id: o id da mensagem que decide a situação final daquela data.
- evidencia: trecho curto (até 20 palavras) dessa mensagem.
- Não invente: na dúvida sobre se a sessão foi fechada, não liste; se listar com incerteza, confianca "baixa".`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sessoes'],
  properties: {
    sessoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'paciente_id',
          'paciente_nome',
          'data',
          'hora',
          'profissional',
          'situacao',
          'mensagem_id',
          'confianca',
          'evidencia',
        ],
        properties: {
          paciente_id: { type: ['string', 'null'] },
          paciente_nome: { type: ['string', 'null'] },
          data: { type: 'string', description: 'YYYY-MM-DD' },
          hora: { type: ['string', 'null'] },
          profissional: { type: ['string', 'null'] },
          situacao: {
            type: 'string',
            enum: ['combinada', 'realizada', 'cancelada', 'remarcada', 'falta'],
          },
          mensagem_id: { type: 'integer' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          evidencia: { type: 'string' },
        },
      },
    },
  },
};

const entrada = {
  hoje: `${agora.toISODate()} (${DIAS[agora.weekday]})`,
  caixa:
    conv.caixa === 38
      ? 'celular da fisioterapeuta Bruna'
      : 'recepção da clínica',
  contato: conv.contato,
  pacientes_da_familia: pacientes,
  responsaveis: ctx.responsaveis || [],
  mensagens: linhas.join('\n'),
};

return [
  {
    json: {
      pular: null,
      conversa_id: conv.conversa_id,
      caixa: conv.caixa,
      telefone: conv.telefone,
      horarios: Object.fromEntries(conv.mensagens.map((m) => [m.id, m.em])),
      corpo: {
        model: 'gpt-6-luna',
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify(entrada) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'sessoes_conversa',
            strict: true,
            schema: SCHEMA,
          },
        },
      },
    },
  },
];
