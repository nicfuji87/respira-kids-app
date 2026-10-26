-- Resumo "Esperando resposta" passa a ver as mensagens automáticas (link de pagamento, confirmação,
-- cancelamento) para não listar como pendente o que o sistema já mandou (26/10/2026).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%automatica%' THEN RETURN; END IF;
  n := replace(d, $a$'quem', CASE m.origem WHEN 'CLIENTE' THEN 'familia' ELSE 'ju' END,$a$,
                  $a$'quem', CASE m.origem WHEN 'CLIENTE' THEN 'familia' WHEN 'AUTOMACAO' THEN 'mensagem_automatica' ELSE 'ju' END,$a$);
  IF n = d THEN RAISE EXCEPTION 'quem não encontrado'; END IF;
  d := n;
  n := replace(d, $a$WHERE m.conversa_id = k.id AND m.origem IN ('CLIENTE', 'JU')$a$,
                  $a$WHERE m.conversa_id = k.id AND m.origem IN ('CLIENTE', 'JU', 'AUTOMACAO')$a$);
  IF n = d THEN RAISE EXCEPTION 'origem não encontrada'; END IF;
  EXECUTE n;
END
$mig$;
