-- 28/10/2026: além da linha do resumo anterior, o resumo recebe as últimas 6 mensagens antes da última fala da
-- Lolô (até 15 dias), onde costuma estar o assunto da pendência (ex.: Fanny só mandou "bom dia" depois).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%contexto_antes_da_lolo%' THEN RETURN; END IF;
  n := replace(d, $a$'linha_no_resumo_anterior', p.linha_anterior,$a$,
                  $a$'linha_no_resumo_anterior', p.linha_anterior,
           'contexto_antes_da_lolo', (SELECT jsonb_agg(y.j ORDER BY y.created_at)
              FROM (SELECT m.created_at,
                           jsonb_build_object(
                             'quando', to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                             'quem', CASE m.origem WHEN 'CLIENTE' THEN 'familia' WHEN 'HUMANO' THEN 'lolo' ELSE 'ju' END,
                             'texto', left(regexp_replace(coalesce(m.conteudo, ''), '\s+', ' ', 'g'), 300)) AS j
                      FROM ju_mensagens m
                     WHERE m.conversa_id = p.id AND p.ult_humano IS NOT NULL
                       AND m.origem IN ('CLIENTE', 'HUMANO', 'JU')
                       AND m.created_at <= p.ult_humano
                       AND m.created_at > p.ult_humano - interval '15 days'
                     ORDER BY m.created_at DESC LIMIT 6) y),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
