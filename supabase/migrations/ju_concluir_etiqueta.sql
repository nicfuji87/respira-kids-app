-- =====================================================================
-- Ju: concluir pedido quando a Lolô tira a etiqueta no celular
-- =====================================================================
-- AI dev note: o evento chat_labels da uazapi traz o chat com as etiquetas
-- ATUAIS. Pedido aberto cuja etiqueta não está mais na conversa = concluído.
-- Comparar com o estado atual (e não com "o que saiu") funciona qualquer que
-- seja o formato exato do evento, e é idempotente.
-- Proteção: pedido criado há menos de 2 min não conta (a Ju põe a etiqueta
-- logo depois de criar o pedido; um evento nesse intervalo não pode fechá-lo).
-- =====================================================================
CREATE FUNCTION public.fn_ju_etiquetas_atuais(p_wa_chatid text, p_etiquetas text[], p_por text DEFAULT 'etiqueta')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r     record;
  v_out jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT s.id, s.tipo, s.notificacao_msg_id
    FROM public.ju_solicitacoes s
    JOIN public.ju_conversas c ON c.id = s.conversa_id
    WHERE c.wa_chatid = p_wa_chatid AND s.status = 'ABERTA'
      AND s.etiqueta IS NOT NULL AND NOT (s.etiqueta = ANY (coalesce(p_etiquetas, '{}'::text[])))
      AND s.created_at < now() - interval '2 minutes'
  LOOP
    PERFORM public.fn_ju_concluir(r.id, NULL, NULL, p_por);
    v_out := v_out || jsonb_build_object('solicitacao_id', r.id, 'tipo', r.tipo, 'citar', r.notificacao_msg_id);
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_etiquetas_atuais(text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_etiquetas_atuais(text, text[], text) TO service_role;
