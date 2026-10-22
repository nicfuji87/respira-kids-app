-- =====================================================================
-- Ju: entrada pela uazapi (sai o Chatwoot) e as regras novas de estado
-- =====================================================================
-- AI dev note: decisão do dono em 16/10/2026. A Ju é a primeira linha:
-- responde já (buffer de 10 s no Atendimento), e a Lolô só entra quando quer
-- ou quando a Ju chama.
--
-- Quem escreveu (vem do webhook da uazapi):
--   CLIENTE    fromMe = false
--   HUMANO     fromMe e NÃO enviada pela API (= a Lolô digitando no celular)
--   AUTOMACAO  fromMe e enviada pela API (régua, lembretes, botões...)
--   JU         gravada pelo próprio Atendimento com o id que a uazapi devolve;
--              o eco do webhook chega depois e é descartado como duplicado.
--
-- Estados da conversa:
--   ATIVA              a Ju responde
--   PAUSADA            a Lolô entrou espontaneamente; pausa de 15 min que se
--                      renova a cada mensagem dela. Mensagem do cliente nesse
--                      intervalo fica pendente (AGUARDAR) e é retomada quando
--                      a pausa vence (fluxo de tarefas).
--   AGUARDANDO_EQUIPE  a Ju chamou a secretaria; não tem timeout. Só sai com
--                      o "Concluído" (mensagem da Lolô NÃO encerra). Nesse
--                      estado a Ju só anota para a equipe (ANOTAR).
-- =====================================================================

-- A conversa passa a ser identificada pelo chat do WhatsApp.
ALTER TABLE public.ju_conversas
  ADD COLUMN wa_chatid text UNIQUE,
  ALTER COLUMN chatwoot_conversation_id DROP NOT NULL;

ALTER TABLE public.ju_mensagens
  ADD COLUMN wa_message_id text UNIQUE,
  ALTER COLUMN chatwoot_message_id DROP NOT NULL;

-- AUTOMACAO entra como origem; BOTAO = clique do cliente num botão de
-- mensagem automática (o fluxo do botão responde; a Ju não).
ALTER TABLE public.ju_mensagens DROP CONSTRAINT ju_mensagens_origem_check;
ALTER TABLE public.ju_mensagens ADD CONSTRAINT ju_mensagens_origem_check
  CHECK (origem IN ('CLIENTE','JU','HUMANO','AUTOMACAO'));
ALTER TABLE public.ju_mensagens DROP CONSTRAINT ju_mensagens_tipo_check;
ALTER TABLE public.ju_mensagens ADD CONSTRAINT ju_mensagens_tipo_check
  CHECK (tipo IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO','BOTAO','OUTRO'));

-- A entrada antiga (Chatwoot) sai; nada a usa em produção.
DROP FUNCTION public.fn_ju_registrar_mensagem(bigint, bigint, text, bigint, bigint, text, text, text, integer);


-- ---------------------------------------------------------------------
-- 1. Registra uma mensagem do webhook e decide o que fazer.
--    Uma chamada por mensagem. Devolve:
--      acao  PROCESSAR  chamar o Atendimento (a Ju responde)
--            ANOTAR     chamar o Atendimento (a Ju só anota para a equipe)
--            AGUARDAR   Lolô na conversa: fica pendente até a pausa vencer
--            NADA       duplicada, da Lolô, da Ju, automação ou botão
--      midia true quando é áudio/imagem/documento do cliente a processar
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_receber(
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
  -- botão de mensagem automática não é conversa com a Ju
  v_conta  boolean := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO';
  v_msg    bigint;
BEGIN
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, public.fn_ju_telefone(p_telefone))
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;

  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo, versao)
  VALUES (c.id, p_wa_message_id, v_origem, v_tipo, nullif(btrim(p_conteudo), ''),
          CASE WHEN v_conta THEN c.message_version + 1 END)
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN                      -- reenvio do webhook ou eco da Ju
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'DUPLICADA');
  END IF;

  IF v_origem = 'HUMANO' THEN
    -- Lolô entrou: pausa de 15 min, renovada a cada mensagem dela.
    -- No handoff (AGUARDANDO_EQUIPE) nada muda: só o "Concluído" encerra.
    UPDATE public.ju_conversas
       SET status = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN status ELSE 'PAUSADA' END,
           pause_until = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN NULL ELSE now() + interval '15 minutes' END,
           ultima_mensagem_humano = now(), updated_at = now()
     WHERE id = c.id;
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id);
  ELSIF NOT v_conta THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', v_origem || ':' || v_tipo, 'conversa_id', c.id);
  END IF;

  -- CLIENTE: soma a versão (o buffer do Atendimento compara com ela).
  -- Pausa vencida volta a ATIVA aqui mesmo.
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


-- ---------------------------------------------------------------------
-- 2. Conteúdo de mídia (transcrição do áudio, descrição da imagem, resumo do
--    documento). Gravado depois, pelo mesmo fluxo da Entrada.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_midia(p_wa_message_id text, p_conteudo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ju_mensagens
     SET conteudo = left(nullif(btrim(p_conteudo), ''), 4000)
   WHERE wa_message_id = p_wa_message_id;
$$;


REVOKE ALL ON FUNCTION
  public.fn_ju_receber(text, text, text, boolean, boolean, text, text),
  public.fn_ju_midia(text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_receber(text, text, text, boolean, boolean, text, text),
  public.fn_ju_midia(text, text)
TO service_role;
