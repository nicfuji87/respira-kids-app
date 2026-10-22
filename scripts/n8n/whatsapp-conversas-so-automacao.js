/* eslint-disable */
// AI dev note: corpo do nó "Só automação?" do workflow "[RK] Analise Conversacional" (n8n editori NHaGytlvhVuGDd0t).
// Vem depois do Supabase1 (rpc fn_whatsapp_estado_analise) e decide o IF "Pula IA?":
// true -> "Supabase sem IA" (métricas + hash + flags, mantém a análise anterior) -> Etiquetas;
// false -> GPT-5.5 (raciocínio baixo). Os tipos vêm de classificarAutomatica() no Code3.

// Decide se a conversa pode pular a IA: desde a última análise só chegaram mensagens
// automáticas do sistema. Nesse caso a análise anterior continua valendo e as flags das
// mensagens (ex.: "Pagamento Recebido" zera pagamento_a_conferir) são gravadas por regra.
// Fatura, loja e aviso de cancelamento são disparados pela secretária, às vezes em resposta
// ao cliente: só pulam se a conversa não estava pendente com a equipe.

const SEMPRE_PULA = [
  'pagamento_recebido',
  'nota_fiscal',
  'lembrete_fatura',
  'lembrete_consulta',
  'contrato_pendente',
  'contrato_assinado',
  'botao_confirmar',
];
const PULA_SE_NADA_PENDENTE = ['fatura', 'loja', 'cancelamento_auto'];

const estado = $input.first().json;
const meta = $('Code3').first().json.mensagens_meta || [];
const anterior = estado.ultima_mensagem_em
  ? new Date(estado.ultima_mensagem_em).getTime()
  : null;
const pendenteEquipe = ['pendente_atendente', 'aguardando_equipe'].includes(
  estado.status_conversa
);

const novas =
  anterior == null
    ? []
    : meta.filter((m) => m.em && new Date(m.em).getTime() > anterior);

const soAuto =
  estado.ja_analisada === true &&
  novas.length > 0 &&
  novas.every(
    (m) =>
      m.auto &&
      (SEMPRE_PULA.includes(m.tipo) ||
        (!pendenteEquipe && PULA_SE_NADA_PENDENTE.includes(m.tipo)))
  );

const flags = soAuto
  ? Object.assign({}, ...novas.map((m) => m.flags || {}))
  : {};

return [
  {
    json: {
      so_auto: soAuto,
      flags,
      novas: novas.length,
      tipos: novas.map((m) => m.tipo || 'humana'),
    },
  },
];
