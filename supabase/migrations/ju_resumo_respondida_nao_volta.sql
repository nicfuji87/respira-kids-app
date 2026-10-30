-- 30/10/2026 (caso Lígia Amorim): a linha "falta confirmar o valor e gerar o link" de 26/10 voltou 4x ao resumo
-- "Esperando resposta", embora a Lolô tenha respondido no mesmo dia e depois só houvesse confirmações e um
-- comprovante de Pix já respondidos pela Ju/automação.
-- 1. Item guardado só vale se a Lolô não respondeu depois da última vez que ele apareceu (senão a linha antiga
--    não é repassada à IA) e, ao gravar, recomeça a contagem quando a Lolô respondeu nesse meio-tempo.
-- 2. Família cuja última mensagem já teve resposta da Ju (ou da automação em até 5 min, ex.: recibo do Pix)
--    e sem pedido aberto não está esperando resposta.
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_esperando_resposta'::regproc);
  n := replace(d, 'LEFT JOIN ju_resumo_itens r ON r.conversa_id = c.id AND r.ultima_vez > now() - interval ''15 days''',
    'LEFT JOIN ju_resumo_itens r ON r.conversa_id = c.id AND r.ultima_vez > now() - interval ''15 days''
                                AND r.ultima_vez > coalesce((SELECT max(h.created_at) FROM ju_mensagens h
                                                              WHERE h.conversa_id = c.id AND h.origem = ''HUMANO''), ''-infinity''::timestamptz)');
  n := replace(n, '               AND m.created_at > coalesce(k.ult_humano, now() - interval ''15 days'')) AS esperando_desde',
    '               AND m.created_at > coalesce(k.ult_humano, now() - interval ''15 days'')) AS esperando_desde,
           (SELECT max(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem = ''CLIENTE'' AND m.tipo <> ''BOTAO''
               AND m.created_at > coalesce(k.ult_humano, now() - interval ''15 days'')) AS ult_cliente');
  n := replace(n, '  WHERE p.esperando_desde IS NOT NULL;',
    '  WHERE p.esperando_desde IS NOT NULL
    AND NOT (NOT EXISTS (SELECT 1 FROM ju_solicitacoes s WHERE s.conversa_id = p.id AND s.status = ''ABERTA'')
             AND EXISTS (SELECT 1 FROM ju_mensagens m2
                          WHERE m2.conversa_id = p.id AND m2.created_at > p.ult_cliente
                            AND (m2.origem = ''JU''
                                 OR (m2.origem = ''AUTOMACAO'' AND m2.created_at <= p.ult_cliente + interval ''5 minutes''))));');
  IF n NOT LIKE '%AS ult_cliente%' OR n NOT LIKE '%m2.origem = ''JU''%' OR n NOT LIKE '%-infinity%' THEN
    RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado';
  END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_resumo_postado'::regproc);
  n := replace(d, $a$         primeira_vez = CASE WHEN public.ju_resumo_itens.vezes = 0
                               OR public.ju_resumo_itens.ultima_vez < now() - interval '15 days'
                             THEN now() ELSE public.ju_resumo_itens.primeira_vez END;$a$,
    $a$         primeira_vez = CASE WHEN public.ju_resumo_itens.vezes = 0
                               OR public.ju_resumo_itens.ultima_vez < now() - interval '15 days'
                               OR EXISTS (SELECT 1 FROM public.ju_mensagens h
                                           WHERE h.conversa_id = public.ju_resumo_itens.conversa_id AND h.origem = 'HUMANO'
                                             AND h.created_at > public.ju_resumo_itens.ultima_vez)
                             THEN now() ELSE public.ju_resumo_itens.primeira_vez END;$a$);
  n := replace(n, $a$         vezes = public.ju_resumo_itens.vezes + 1,$a$,
    $a$         vezes = CASE WHEN EXISTS (SELECT 1 FROM public.ju_mensagens h
                                    WHERE h.conversa_id = public.ju_resumo_itens.conversa_id AND h.origem = 'HUMANO'
                                      AND h.created_at > public.ju_resumo_itens.ultima_vez)
                      THEN 1 ELSE public.ju_resumo_itens.vezes + 1 END,$a$);
  IF n = d OR n NOT LIKE '%THEN 1 ELSE public.ju_resumo_itens.vezes + 1 END%' THEN
    RAISE EXCEPTION 'fn_ju_resumo_postado: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;

-- a linha velha da Lígia (respondida em 26/10) sai da memória do resumo
DELETE FROM public.ju_resumo_itens WHERE conversa_id = 1375;
