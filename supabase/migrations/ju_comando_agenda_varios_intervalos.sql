-- AI dev note: 05/11/2026 (caso Bruna: "fechar 8h às 9h e 17h às 18h no dia 10/11" e a Ju só conseguia um intervalo):
-- fechar_agenda/abrir_agenda com d.intervalos [{hora, hora_fim}, ...] executa um por um e junta as respostas.
-- O Comando (Montar pedido) preenche "intervalos" quando o pedido traz mais de um.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_executar'::regproc);
  a text := $a$  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN
    v_prof := coalesce($a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, $a$  IF v_acao IN ('fechar_agenda', 'abrir_agenda') AND jsonb_typeof(d -> 'intervalos') = 'array'
     AND jsonb_array_length(d -> 'intervalos') > 1 THEN
    RETURN (SELECT jsonb_build_object(
              'texto', string_agg(r ->> 'texto', E'\n' ORDER BY n),
              'status', CASE WHEN bool_and(r ->> 'status' = 'agenda') THEN 'agenda' ELSE 'pergunta' END)
              FROM (SELECT n, public.fn_ju_comando_executar(p_conversa_id, p_mensagem_id,
                              (d - 'intervalos') || jsonb_build_object('hora', i ->> 'hora', 'hora_fim', i ->> 'hora_fim')) r
                      FROM jsonb_array_elements(d -> 'intervalos') WITH ORDINALITY AS t(i, n)) x);
  END IF;

  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN
    v_prof := coalesce($a$);
END $do$;
