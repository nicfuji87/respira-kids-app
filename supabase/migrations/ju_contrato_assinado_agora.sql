-- AI dev note: 04/11/2026 (caso Joyce): a família assinou o contrato 8 s antes de a Ju responder "Pedi o
-- reenvio!". A ferramenta já recusa contrato assinado, mas a resposta foi gerada antes da assinatura.
-- fn_ju_responder troca o texto quando ele fala em reenvio/Assinafy e um contrato de criança da conversa
-- foi assinado nos últimos 15 min; o n8n ("Dividir mensagens") envia texto_substituto quando vier.

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_responder'::regproc);
BEGIN
  IF position($a$  v_pode   boolean;$a$ IN d) = 0
     OR position($a$    RETURN jsonb_build_object('pode', false, 'motivo', 'LOLO_RESPONDEU');
  END IF;$a$ IN d) = 0
     OR position($a$public.fn_ju_partes(p_texto))$a$ IN d) = 0
     OR position($a$    'pode', true,
    'wa_chatid', c.wa_chatid,$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_responder: trecho não encontrado';
  END IF;
  d := replace(d, $a$  v_pode   boolean;$a$, $a$  v_pode   boolean;
  v_texto  text := p_texto;$a$);
  d := replace(d, $a$    RETURN jsonb_build_object('pode', false, 'motivo', 'LOLO_RESPONDEU');
  END IF;$a$, $a$    RETURN jsonb_build_object('pode', false, 'motivo', 'LOLO_RESPONDEU');
  END IF;
  -- 04/11/2026 (caso Joyce): o contrato foi assinado enquanto a Ju escrevia que ia reenviar.
  IF p_modo IN ('RESPONDER', 'RESPONDER_SIMPLES') AND coalesce(p_texto, '') ~* '(reenvi|assinafy)'
     AND EXISTS (SELECT 1 FROM public.user_contracts u
                  WHERE u.pessoa_id = ANY (public.fn_le_pacientes_da_conversa(c.id)) AND u.ativo
                    AND u.status_contrato = 'assinado' AND u.data_assinatura > now() - interval '15 minutes') THEN
    v_texto := 'Vi aqui que o contrato já foi assinado. Obrigada! 😊';
  END IF;$a$);
  d := replace(d, $a$public.fn_ju_partes(p_texto))$a$, $a$public.fn_ju_partes(v_texto))$a$);
  d := replace(d, $a$    'pode', true,
    'wa_chatid', c.wa_chatid,$a$, $a$    'pode', true,
    'texto_substituto', CASE WHEN v_texto IS DISTINCT FROM p_texto THEN v_texto END,
    'wa_chatid', c.wa_chatid,$a$);
  EXECUTE d;
END $do$;
