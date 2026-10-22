-- =====================================================================
-- Ju: mídia termina de processar → a Ju é chamada com a versão ATUAL
-- =====================================================================
-- AI dev note: áudio leva alguns segundos para ser transcrito. Se o cliente
-- manda áudio e logo depois um texto, o turno do texto pode rodar antes da
-- transcrição existir. Regra:
--   - o turno do Atendimento não responde enquanto houver mídia do cliente
--     sem conteúdo há menos de 2 min (fn_ju_turno, próxima etapa);
--   - quando a mídia fica pronta, fn_ju_midia devolve a ação e a versão
--     atuais da conversa, e a Entrada chama o Atendimento com elas.
--     Assim a Ju responde uma vez só, já lendo texto + transcrição.
-- =====================================================================
DROP FUNCTION public.fn_ju_midia(text, text);

CREATE FUNCTION public.fn_ju_midia(p_wa_message_id text, p_conteudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.ju_conversas;
BEGIN
  UPDATE public.ju_mensagens
     SET conteudo = left(nullif(btrim(p_conteudo), ''), 4000)
   WHERE wa_message_id = p_wa_message_id;

  SELECT cv.* INTO c
  FROM public.ju_mensagens m JOIN public.ju_conversas cv ON cv.id = m.conversa_id
  WHERE m.wa_message_id = p_wa_message_id
  FOR UPDATE OF cv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'MENSAGEM_INEXISTENTE');
  END IF;

  -- pausa da Lolô vencida enquanto a mídia processava: a Ju volta
  IF c.status = 'PAUSADA' AND c.pause_until <= now() THEN
    UPDATE public.ju_conversas SET status = 'ATIVA', pause_until = NULL, updated_at = now()
     WHERE id = c.id RETURNING * INTO c;
  END IF;

  RETURN jsonb_build_object(
    'acao', CASE c.status WHEN 'ATIVA' THEN 'PROCESSAR'
                          WHEN 'AGUARDANDO_EQUIPE' THEN 'ANOTAR'
                          ELSE 'AGUARDAR' END,
    'conversa_id', c.id,
    'versao', c.message_version);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_midia(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_midia(text, text) TO service_role;
