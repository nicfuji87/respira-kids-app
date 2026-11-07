// n8n "RK Conferência de agenda" → nó "Ler resposta" (Code, Run Once for All Items, dentro do loop).
// Resposta fora do contrato ou erro = nenhuma sessão gravada; a conversa volta a ser lida
// quando a família escrever de novo (a janela de contexto é de 10 dias).
const pedido = $('Montar pedido').first().json;
const r = $input.first().json;
let sessoes = [];
let erro = null;
try {
  const txt = r?.choices?.[0]?.message?.content;
  if (txt) sessoes = JSON.parse(txt).sessoes || [];
  else erro = JSON.stringify(r ?? {}).slice(0, 200);
} catch (e) {
  erro = 'json_invalido: ' + String(e.message).slice(0, 150);
}
const p_sessoes = sessoes.map((s) => ({
  ...s,
  mensagem_em: pedido.horarios[s.mensagem_id] || null,
}));
return [
  {
    json: {
      p_conversa_id: pedido.conversa_id,
      p_caixa: pedido.caixa,
      p_telefone: pedido.telefone,
      p_sessoes,
      p_modelo:
        String(r?.model || 'gpt-6-luna') + (erro ? ' | ERRO ' + erro : ''),
    },
  },
];
