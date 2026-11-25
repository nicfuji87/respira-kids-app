-- Evidência da origem declarada, v2 (revisão do PR #56, 25/11/2026). Aplicada em produção.
--  1) \b no regex do PostgreSQL NÃO é fronteira de palavra ("vi no insta" não casava): usa \y.
--  2) Três níveis, nas mensagens da família das últimas 2 h:
--     forte = frase que diz COMO conheceu ("vi no Instagram", "a pediatra indicou", "achei no Google",
--             "pesquisei", "uma amiga", "já fui aí", "não lembro");
--     fraco = só cita o assunto ("pediatra", "Google", "site"), que pode não ser sobre a origem
--             ("a pediatra pediu fisioterapia");
--     nenhum = registra a declaração SEM evidência textual (mensagem_id nulo), em vez de apontar
--             para a última mensagem.
--  Continua exigindo ao menos uma mensagem da família nas últimas 2 h (houve resposta).
--  Testes (transação desfeita): "vi no insta" + "a pediatra pediu fisioterapia" + "tem horário
--  quinta?" → evidência "vi no insta" (forte); só "tem horário quinta?" → sem evidência.
CREATE OR REPLACE FUNCTION public.fn_ju_origem_declarada(p_conversa_id bigint, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cat   text := lower(trim(split_part(coalesce(p_texto, ''), ':', 1)));
  v_det   text := nullif(left(trim(substr(coalesce(p_texto, ''), length(split_part(coalesce(p_texto, ''), ':', 1)) + 2)), 200), '');
  v_msg   bigint;
  v_nivel int;
  v_op    bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ju_conversas c WHERE c.id = p_conversa_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conversa_inexistente');
  END IF;
  IF v_cat NOT IN ('indicacao_profissional', 'indicacao_conhecido', 'google_busca', 'google_maps',
                   'instagram', 'facebook', 'site', 'ja_conhecia', 'outro', 'nao_lembra') THEN
    v_det := nullif(left(trim(coalesce(p_texto, '')), 200), '');
    v_cat := 'outro';
  END IF;
  SELECT x.id, x.nivel INTO v_msg, v_nivel FROM (
    SELECT m.id, m.created_at,
           CASE WHEN coalesce(m.conteudo, '') ~* ('(\yvi (no|na|o|um|uma)\y|\yachei\y|\yencontrei\y|\yconheci\y|\yindic(ou|aram|ação|acao|ada|ado)\y'
                  || '|\yrecomend|\yme pass(ou|aram)\y|\ypesquis(ei|ando)\y|\yprocurei\y|\ypelo (google|instagram|insta|site|face|facebook|maps|mapa)\y'
                  || '|\yno (google|instagram|insta|maps|mapa|face|facebook|site)\y|\yuma amiga\y|\yminha amiga\y|\youtra m[ãa]e\y|\yj[áa] (fui|levei|trouxe|era|conhecia)\y'
                  || '|\ypasso (em frente|a[ií])\y|\yn[ãa]o (me )?lembro\y)') THEN 2
                WHEN coalesce(m.conteudo, '') ~* ('(\yindic|\ypediatr|\ym[eé]dic|\ydoutor|\ydra\y|\yfono|\ygoogle\y|\yinstagram\y|\yinsta\y|\yfacebook\y|\yface\y'
                  || '|\ysite\y|\ymapa\y|\ymaps\y|\yamig|\yvizinh|\yparente|\yirm[ãa]|\yprima\y|\ym[ãa]e de\y)') THEN 1
                ELSE 0 END nivel
      FROM public.ju_mensagens m
     WHERE m.conversa_id = p_conversa_id AND m.origem = 'CLIENTE' AND m.created_at > now() - interval '2 hours'
  ) x ORDER BY x.nivel DESC, x.created_at DESC, x.id DESC LIMIT 1;
  IF v_nivel IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_mensagem_recente');
  END IF;
  IF v_nivel = 0 THEN v_msg := NULL; END IF;   -- declaração sem evidência textual confirmada
  SELECT o.id INTO v_op FROM public.atrib_oportunidades o
   WHERE o.conversa_id = p_conversa_id ORDER BY o.aberta_em DESC LIMIT 1;
  INSERT INTO public.atrib_origens_declaradas (conversa_id, oportunidade_id, categoria, detalhe, mensagem_id, fonte)
  VALUES (p_conversa_id, v_op, v_cat, v_det, v_msg, 'ju')
  ON CONFLICT (conversa_id, fonte) DO UPDATE
     SET categoria = excluded.categoria, detalhe = excluded.detalhe, mensagem_id = excluded.mensagem_id,
         oportunidade_id = excluded.oportunidade_id, registrado_em = now();
  RETURN jsonb_build_object('ok', true, 'categoria', v_cat,
           'evidencia', CASE v_nivel WHEN 2 THEN 'forte' WHEN 1 THEN 'fraca' ELSE 'sem_evidencia' END);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.atrib_erros (etapa, referencia, detalhe) VALUES ('origem_declarada', p_conversa_id::text, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'motivo', 'erro');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_origem_declarada(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_origem_declarada(bigint, text) TO service_role;
