-- =====================================================================
-- Ju: envios automáticos que saem pelo QuePasa (reserva da uazapi)
-- =====================================================================
-- AI dev note: mensagem enviada pelo QuePasa chega na uazapi como se alguém
-- tivesse digitado no celular (fromMe sem wasSentByApi), e a Entrada a
-- trataria como a Lolô (pausa de 15 min na Ju). Os fluxos que usam o QuePasa
-- para cliente registram o envio aqui um instante antes de enviar
-- (fn_ju_registrar_envio_automatico); quando a mensagem "da Lolô" chega e
-- bate com um envio registrado (mesmo telefone, mesmo texto, até 5 min),
-- fn_ju_receber grava como AUTOMACAO e não pausa.
-- =====================================================================
CREATE TABLE public.ju_envios_automaticos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telefone    text NOT NULL,          -- canônico (+55DD9XXXXXXXX)
  texto       text NOT NULL,
  origem      text,                   -- fluxo que enviou (para auditoria)
  usado_em    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ju_envios_automaticos_busca ON public.ju_envios_automaticos (telefone, created_at DESC) WHERE usado_em IS NULL;
ALTER TABLE public.ju_envios_automaticos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_envios_automaticos FROM anon, authenticated;

-- limpeza: só interessa por alguns minutos
SELECT cron.schedule('ju-limpar-envios-automaticos', '15 4 * * *',
  $$DELETE FROM public.ju_envios_automaticos WHERE created_at < now() - interval '2 days'$$);


CREATE FUNCTION public.fn_ju_registrar_envio_automatico(p_numero text, p_texto text, p_origem text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.ju_envios_automaticos (telefone, texto, origem)
  SELECT t, btrim(p_texto), left(p_origem, 100)
  FROM (SELECT public.fn_ju_telefone(regexp_replace(coalesce(p_numero, ''), '@.*$', '')) AS t) x
  WHERE t IS NOT NULL AND nullif(btrim(p_texto), '') IS NOT NULL;
$$;


-- Entrada: "mensagem da Lolô" que bate com envio automático registrado = AUTOMACAO.
CREATE OR REPLACE FUNCTION public.fn_ju_receber(
  p_wa_message_id text, p_wa_chatid text, p_telefone text,
  p_from_me boolean, p_via_api boolean, p_tipo text, p_conteudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_origem text := CASE WHEN NOT p_from_me THEN 'CLIENTE'
                        WHEN p_via_api THEN 'AUTOMACAO'
                        ELSE 'HUMANO' END;
  v_tipo   text := CASE WHEN upper(p_tipo) IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO','BOTAO')
                        THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_conta  boolean;
  v_msg    bigint;
  v_env    bigint;
BEGIN
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, public.fn_ju_telefone(p_telefone))
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;

  IF v_origem = 'AUTOMACAO' AND c.resposta_pendente IS NOT NULL
     AND c.resposta_pendente_em > now() - interval '5 minutes'
     AND btrim(coalesce(p_conteudo, '')) = c.resposta_pendente THEN
    v_origem := 'JU';
    UPDATE public.ju_conversas SET resposta_pendente = NULL, resposta_pendente_em = NULL WHERE id = c.id;
  END IF;

  -- envio automático pelo QuePasa (parece digitado no celular)
  IF v_origem = 'HUMANO' THEN
    SELECT e.id INTO v_env FROM public.ju_envios_automaticos e
     WHERE e.telefone = coalesce(c.telefone, public.fn_ju_telefone(p_telefone))
       AND e.usado_em IS NULL AND e.created_at > now() - interval '5 minutes'
       AND e.texto = btrim(coalesce(p_conteudo, ''))
     ORDER BY e.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF v_env IS NOT NULL THEN
      v_origem := 'AUTOMACAO';
      UPDATE public.ju_envios_automaticos SET usado_em = now() WHERE id = v_env;
    END IF;
  END IF;

  v_conta := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO';

  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo, versao)
  VALUES (c.id, p_wa_message_id, v_origem, v_tipo, nullif(btrim(p_conteudo), ''),
          CASE WHEN v_conta THEN c.message_version + 1 END)
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'DUPLICADA');
  END IF;

  IF v_origem = 'HUMANO' THEN
    UPDATE public.ju_conversas
       SET status = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN status ELSE 'PAUSADA' END,
           pause_until = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN NULL ELSE now() + interval '15 minutes' END,
           ultima_mensagem_humano = now(), updated_at = now()
     WHERE id = c.id;
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id);
  ELSIF NOT v_conta THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', v_origem || ':' || v_tipo, 'conversa_id', c.id);
  END IF;

  UPDATE public.ju_conversas
     SET message_version = message_version + 1,
         telefone = coalesce(public.fn_ju_telefone(p_telefone), telefone),
         ultima_mensagem_cliente = now(),
         status = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN 'ATIVA' ELSE status END,
         pause_until = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN NULL ELSE pause_until END,
         updated_at = now()
   WHERE id = c.id
  RETURNING * INTO c;

  RETURN jsonb_build_object(
    'acao', CASE c.status WHEN 'ATIVA' THEN 'PROCESSAR'
                          WHEN 'AGUARDANDO_EQUIPE' THEN 'ANOTAR'
                          ELSE 'AGUARDAR' END,
    'motivo', c.status,
    'conversa_id', c.id,
    'versao', c.message_version,
    'midia', v_tipo IN ('AUDIO','IMAGE','DOCUMENT'));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_registrar_envio_automatico(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_registrar_envio_automatico(text, text, text) TO service_role;
