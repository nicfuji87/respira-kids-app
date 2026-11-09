-- 09/11/2026 (caso Mariana, ok do dono): o relógio do resumo PENDÊNCIAS começava no "Muito obrigada" mandado
-- logo depois da resposta da Lolô. Agora agradecimento/ok/emoji solto não inicia a espera, e a espera só conta
-- depois de resumo_dispensado_em. Só muda esperando_desde; o resto da função fica igual.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure);
  v_new := replace(v_def,
    'SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia, r.primeira_vez',
    'SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia, c.resumo_dispensado_em, r.primeira_vez');
  v_new := replace(v_new,
$s$           (SELECT min(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem = 'CLIENTE' AND m.tipo <> 'BOTAO'
               AND m.created_at > coalesce(k.ult_humano, now() - interval '15 days')) AS esperando_desde,$s$,
$s$           (SELECT min(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem = 'CLIENTE' AND m.tipo <> 'BOTAO'
               AND m.created_at > greatest(coalesce(k.ult_humano, now() - interval '15 days'),
                                           coalesce(k.resumo_dispensado_em, '-infinity'::timestamptz))
               AND NOT (m.tipo = 'TEXT' AND (
                     coalesce(m.conteudo, '') !~ '[[:alnum:]]'
                  OR m.conteudo ~* '^\s*(ok+|okay|blz|beleza|j[oó]ia|perfeito|certo|combinado|show|[oó]timo|tudo bem|t[aá] bom|valeu|amei|maravilha|entendi|obrigad[oa]s?|muito obrigad[oa]|obg|brigad[oa]|ok,? muito obrigad[oa]|de nada)\s*[!.,]*\s*[^\w\s]*\s*$'))) AS esperando_desde,$s$);
  IF v_new = v_def OR position('resumo_dispensado_em, r.primeira_vez' in v_new) = 0 OR position('muito obrigad' in v_new) = 0 THEN
    RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado';
  END IF;
  EXECUTE v_new;
END $mig$;
