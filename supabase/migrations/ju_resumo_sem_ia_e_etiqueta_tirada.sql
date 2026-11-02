-- 02/11/2026 (pedido do dono):
-- 1. Conversa SEM IA não entra no resumo "Esperando resposta".
-- 2. Quando a secretaria tira uma etiqueta da Ju (22 a 27) da conversa, a família sai do resumo
--    e só volta se mandar mensagem nova. Para saber o que foi tirado, a conversa guarda as etiquetas atuais.

ALTER TABLE public.ju_conversas
  ADD COLUMN IF NOT EXISTS etiquetas_atuais text[],
  ADD COLUMN IF NOT EXISTS resumo_dispensado_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_ju_etiquetas_atuais(p_wa_chatid text, p_etiquetas text[], p_por text DEFAULT 'etiqueta'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r       record;
  v_out   jsonb := '[]'::jsonb;
  v_et    text[] := coalesce(p_etiquetas, '{}'::text[]);
  v_antes text[];
  v_disp  boolean := false;
  JU      constant text[] := ARRAY['22', '23', '24', '25', '26', '27'];
BEGIN
  PERFORM public.fn_ju_sem_ia_sync(p_wa_chatid, v_et);
  SELECT etiquetas_atuais INTO v_antes FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid;

  UPDATE public.ju_solicitacoes s
     SET etiqueta_vista = true
    FROM public.ju_conversas c
   WHERE c.id = s.conversa_id AND c.wa_chatid = p_wa_chatid
     AND s.status = 'ABERTA' AND NOT s.etiqueta_vista AND s.etiqueta = ANY (v_et);

  FOR r IN
    SELECT s.id, s.tipo, s.notificacao_msg_id
    FROM public.ju_solicitacoes s
    JOIN public.ju_conversas c ON c.id = s.conversa_id
    WHERE c.wa_chatid = p_wa_chatid AND s.status = 'ABERTA'
      AND s.etiqueta IS NOT NULL AND s.etiqueta_vista
      AND NOT (s.etiqueta = ANY (v_et))
  LOOP
    PERFORM public.fn_ju_concluir(r.id, NULL, NULL, p_por);
    v_out := v_out || jsonb_build_object('solicitacao_id', r.id, 'tipo', r.tipo, 'citar', r.notificacao_msg_id);
    v_disp := true;
  END LOOP;

  -- alguma etiqueta da Ju estava na conversa e saiu: a equipe deu o assunto por tratado
  IF v_antes IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_antes) e WHERE e = ANY (JU) AND NOT (e = ANY (v_et))) THEN
    v_disp := true;
  END IF;

  UPDATE public.ju_conversas
     SET etiquetas_atuais = v_et,
         resumo_dispensado_em = CASE WHEN v_disp THEN now() ELSE resumo_dispensado_em END
   WHERE wa_chatid = p_wa_chatid;
  RETURN v_out;
END;
$function$;

DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure);
        f text := $$      AND NOT public.fn_ju_eh_equipe(c.telefone)$$;
BEGIN
  IF (length(d) - length(replace(d, f, ''))) / length(f) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado';
  END IF;
  EXECUTE replace(d, f, f || $$
      AND NOT coalesce(c.sem_ia, false)
      AND (c.resumo_dispensado_em IS NULL OR c.ultima_mensagem_cliente > c.resumo_dispensado_em)$$);
END $m$;
