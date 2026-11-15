-- 15/11/2026 (aprovado pelo dono, caso Maitê): o pedido de 07/11 ficou aberto uma semana mesmo com a mãe
-- dizendo que não precisava mais, e em 14/11 o card voltou ao grupo com o texto antigo. Agora, no modo
-- ANOTAR, a Ju começa a nota com [DESISTIU] quando a família desiste do pedido aberto; a nota é anotada,
-- o pedido fecha e o card sai do grupo (mesmo caminho de fn_ju_pedidos_parados_concluir).
CREATE OR REPLACE FUNCTION public.fn_ju_anotar_pedido(p_conversa_id bigint, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
  v_desistiu boolean := coalesce(p_texto, '') ~* '\[DESISTIU\]';
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\[(DESISTIU|PROFISSIONAL|ATRASO)[^\]]*\]', '', 'gi'));
  r jsonb;
BEGIN
  IF nullif(v_texto, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT id INTO v_id FROM public.ju_solicitacoes
   WHERE conversa_id = p_conversa_id AND status = 'ABERTA'
     AND texto_card IS NOT NULL AND notificacao_msg_id IS NOT NULL
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  UPDATE public.ju_solicitacoes
     SET atualizacoes = coalesce(atualizacoes, '[]'::jsonb)
                        || jsonb_build_object('em', now(), 'resumo', left(v_texto, 600), 'origem', 'nota')
   WHERE id = v_id;

  IF v_desistiu THEN
    r := public.fn_ju_concluir(v_id, NULL, NULL, 'automático: a família desistiu do pedido');
    IF (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'ja_concluido')::boolean, false)
       AND nullif(r ->> 'aviso_msg_id', '') IS NOT NULL THEN
      INSERT INTO public.ju_grupo_apagar (msg_id, wa_chatid, etiqueta, origem)
      VALUES (r ->> 'aviso_msg_id', r ->> 'wa_chatid',
              CASE WHEN (r ->> 'tirar_etiqueta')::boolean THEN r ->> 'etiqueta' END, 'pedido:' || v_id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'fechado', true, 'solicitacao_id', v_id);
  END IF;

  RETURN public.fn_ju_card(v_id);
END;
$function$;
