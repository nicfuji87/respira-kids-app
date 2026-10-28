-- 28/10/2026 (ok do dono): o resumo "Esperando resposta" só vê as mensagens depois da última fala da Lolô.
-- Quando a família só responde "bom dia" ou "estou no aguardo", o assunto ficava de fora ("assunto não
-- informado"). Agora a função entrega a linha que a pendência teve no resumo anterior.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%linha_no_resumo_anterior%' THEN RETURN; END IF;
  n := replace(d, $a$r.primeira_vez AS no_resumo_desde, r.vezes,$a$,
                  $a$r.primeira_vez AS no_resumo_desde, r.vezes, r.linha AS linha_anterior,$a$);
  n := replace(n, $a$'vezes_no_resumo', coalesce(p.vezes, 0),$a$,
                  $a$'vezes_no_resumo', coalesce(p.vezes, 0),
           'linha_no_resumo_anterior', p.linha_anterior,$a$);
  IF n NOT LIKE '%r.linha AS linha_anterior%' OR n NOT LIKE '%linha_no_resumo_anterior%' THEN
    RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;
