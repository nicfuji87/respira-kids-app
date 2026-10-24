-- Dúvida simples com a equipe por perto (decisão do dono, 24/10/2026):
-- endereço, valor, convênio, horário, pagamento, pacote... a Ju responde sempre. Se alguém da equipe
-- está na conversa (pausa da Lolô ou mensagem dela há pouco), o n8n espera 5 min e o banco só libera
-- o envio se ninguém da equipe respondeu depois da pergunta e a família não escreveu de novo.

-- 1) fn_ju_turno: a pausa da Lolô não barra mais o turno (a IA roda, mas só pode responder dúvida
--    simples com [FAMILIA]); novo campo equipe_por_perto.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%equipe_por_perto%' THEN RETURN; END IF;
  n := replace(d, $a$    WHEN c.status = 'PAUSADA' AND c.pause_until > now() THEN 'PAUSADA'
$a$, '');
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: barreira da pausa não encontrada'; END IF;
  d := n;
  n := replace(d, $a$    'so_cumprimento', public.fn_ju_so_cumprimento(c.id),$a$,
    $a$    'so_cumprimento', public.fn_ju_so_cumprimento(c.id),
    'equipe_por_perto', (c.status = 'PAUSADA' AND c.pause_until > now())
       OR EXISTS (SELECT 1 FROM public.ju_mensagens h
                   WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                     AND (h.created_at > now() - interval '30 minutes'
                          OR (h.created_at > now() - interval '90 minutes'
                              AND extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                              AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 17))),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: so_cumprimento não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- 2) fn_ju_responder: RESPONDER_SIMPLES vale em qualquer status (menos SEM IA) e só passa se nenhuma
--    mensagem da equipe chegou depois da última mensagem da família; não tira a conversa da pausa.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_responder(bigint,bigint,text,text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%depois da pergunta%' THEN RETURN; END IF;
  n := regexp_replace(d,
    'WHEN p_modo = ''RESPONDER_SIMPLES'' THEN.*?(\n    ELSE false END;)',
    E'WHEN p_modo = ''RESPONDER_SIMPLES'' THEN  -- ninguém da equipe respondeu depois da pergunta\n      c.status IN (''AGUARDANDO_EQUIPE'', ''PAUSADA'', ''ATIVA'')\n      AND NOT EXISTS (\n        SELECT 1 FROM public.ju_mensagens m\n         WHERE m.conversa_id = c.id AND m.origem = ''HUMANO''\n           AND m.created_at > (SELECT max(x.created_at) FROM public.ju_mensagens x\n                                WHERE x.conversa_id = c.id AND x.origem = ''CLIENTE''))\\1', 's');
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: RESPONDER_SIMPLES não encontrado'; END IF;
  d := n;
  n := replace(d, $a$status = CASE WHEN status = 'PAUSADA' THEN 'ATIVA' ELSE status END,$a$,
                  $a$status = CASE WHEN status = 'PAUSADA' AND p_modo = 'RESPONDER' THEN 'ATIVA' ELSE status END,$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: retomada do status não encontrada'; END IF;
  d := n;
  n := replace(d, $a$pause_until = CASE WHEN status = 'PAUSADA' THEN NULL ELSE pause_until END,$a$,
                  $a$pause_until = CASE WHEN status = 'PAUSADA' AND p_modo = 'RESPONDER' THEN NULL ELSE pause_until END,$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: pause_until não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
