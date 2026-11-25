-- Evidência da origem declarada: prefere a mensagem da família (últimas 2 h) que FALA da origem
-- (indicação, pediatra, Google, Instagram, site, mapa, amiga...). Sem nenhuma assim, usa a última.
-- Revisão de 25/11/2026: a última mensagem pode ser sobre outro assunto (ex.: horário).
-- Aplicada em produção em 25/11/2026. Teste (transação desfeita): "foi a pediatra que indicou"
-- seguida de "tem horário quinta?" → a evidência ficou na primeira.
CREATE OR REPLACE FUNCTION public.fn_ju_origem_declarada(p_conversa_id bigint, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cat text := lower(trim(split_part(coalesce(p_texto, ''), ':', 1)));
  v_det text := nullif(left(trim(substr(coalesce(p_texto, ''), length(split_part(coalesce(p_texto, ''), ':', 1)) + 2)), 200), '');
  v_msg bigint;
  v_op  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ju_conversas c WHERE c.id = p_conversa_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conversa_inexistente');
  END IF;
  IF v_cat NOT IN ('indicacao_profissional', 'indicacao_conhecido', 'google_busca', 'google_maps',
                   'instagram', 'facebook', 'site', 'ja_conhecia', 'outro', 'nao_lembra') THEN
    v_det := nullif(left(trim(coalesce(p_texto, '')), 200), '');
    v_cat := 'outro';
  END IF;
  SELECT m.id INTO v_msg FROM public.ju_mensagens m
   WHERE m.conversa_id = p_conversa_id AND m.origem = 'CLIENTE' AND m.created_at > now() - interval '2 hours'
   ORDER BY (coalesce(m.conteudo, '') ~* '(indic|pediatr|m[eé]dic|doutor|dra\.?\s|fono|google|pesquis|instagram|\binsta\b|facebook|\bface\b|site|mapa|maps|amig|vizinh|parente|irm[ãa]|prima|m[ãa]e de|conheci|conhe[cç]o|j[áa] (fui|levei|trouxe)|passo em frente|n[ãa]o lembro)') DESC,
            m.created_at DESC, m.id DESC
   LIMIT 1;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_mensagem_recente');
  END IF;
  SELECT o.id INTO v_op FROM public.atrib_oportunidades o
   WHERE o.conversa_id = p_conversa_id ORDER BY o.aberta_em DESC LIMIT 1;
  INSERT INTO public.atrib_origens_declaradas (conversa_id, oportunidade_id, categoria, detalhe, mensagem_id, fonte)
  VALUES (p_conversa_id, v_op, v_cat, v_det, v_msg, 'ju')
  ON CONFLICT (conversa_id, fonte) DO UPDATE
     SET categoria = excluded.categoria, detalhe = excluded.detalhe, mensagem_id = excluded.mensagem_id,
         oportunidade_id = excluded.oportunidade_id, registrado_em = now();
  RETURN jsonb_build_object('ok', true, 'categoria', v_cat);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.atrib_erros (etapa, referencia, detalhe) VALUES ('origem_declarada', p_conversa_id::text, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'motivo', 'erro');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_origem_declarada(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_origem_declarada(bigint, text) TO service_role;
