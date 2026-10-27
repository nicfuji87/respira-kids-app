-- Sessão de valor zero (serviço SOCIAL, cortesia) aparece marcada para a Ju (27/10/2026, ok do dono).
-- Caso Lígia/Iolanda: a família pediu o valor do primeiro atendimento e a Ju respondeu que a cobrança
-- "ainda não foi gerada" e chamou a Lolô; as sessões eram cortesia. Agora a Ju responde com simpatia que
-- não há nada a pagar, sem explicar o motivo (a família pediu discrição).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%''cortesia''%' THEN RETURN; END IF;
  n := replace(d, $a$'agendamento_id', a.id,$a$, $a$'agendamento_id', a.id, 'cortesia', coalesce(a.valor_servico, 0) = 0,$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: agendamento_id não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo) VALUES
('SESSAO_CORTESIA', 'FINANCEIRO',
 'Consulta marcada com cortesia=true (valor zero, como as de serviço SOCIAL) não tem cobrança. Se a família perguntar o valor ou como pagar essa sessão, a Ju responde com carinho e leveza que não há nada a pagar, por exemplo: "Pode ficar tranquila, essa sessão não tem nenhum valor pra vocês 😊" ou "Essa fica por nossa conta, não precisa pagar nada 💙". Não explica o motivo, não fala em cortesia, desconto ou em quem decidiu, e não chama a secretaria por isso. Se a família agradecer ou ficar sem graça, a Ju responde com simpatia, em uma frase.',
 true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();
