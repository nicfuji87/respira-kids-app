-- =====================================================================
-- Ju: ajustes da revisão de 17/10/2026 (antes de ligar)
-- =====================================================================
-- AI dev note:
-- 1. Etiqueta "vista": tirar a etiqueta só conclui o pedido se a etiqueta já
--    apareceu na conversa num evento chat_labels. Se a uazapi falhar ao pôr a
--    etiqueta, o pedido não fecha sozinho na próxima mudança de etiqueta da
--    conversa (o botão Concluído continua valendo).
-- 2. Retomada depois da pausa só para mensagem do cliente das últimas 2 h:
--    ligar o job não faz a Ju responder conversa velha.
-- 3. Emergência num pedido CLINICO já aberto: a atualização urgente passa a
--    valer para a versão atual (fn_ju_responder libera o texto do SAMU para a
--    família mesmo com a conversa com a equipe) e marca o pedido urgente.
--    A etiqueta não muda aqui (a conversa continua com a do pedido).
-- =====================================================================

ALTER TABLE public.ju_solicitacoes ADD COLUMN etiqueta_vista boolean NOT NULL DEFAULT false;


CREATE OR REPLACE FUNCTION public.fn_ju_etiquetas_atuais(p_wa_chatid text, p_etiquetas text[], p_por text DEFAULT 'etiqueta')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r     record;
  v_out jsonb := '[]'::jsonb;
  v_et  text[] := coalesce(p_etiquetas, '{}'::text[]);
BEGIN
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
      AND s.created_at < now() - interval '2 minutes'
  LOOP
    PERFORM public.fn_ju_concluir(r.id, NULL, NULL, p_por);
    v_out := v_out || jsonb_build_object('solicitacao_id', r.id, 'tipo', r.tipo, 'citar', r.notificacao_msg_id);
  END LOOP;
  RETURN v_out;
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_ju_tarefas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_agora     timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_expediente boolean := extract(isodow FROM v_agora) BETWEEN 1 AND 5
                          AND v_agora::time >= time '08:00' AND v_agora::time < time '19:00';
  v_abertura  timestamptz := (date_trunc('day', v_agora) + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo';
  v_retomar   jsonb;
  v_lembretes jsonb;
BEGIN
  WITH r AS (
    UPDATE public.ju_conversas c
       SET retomada_versao = c.message_version
     WHERE c.status = 'PAUSADA' AND c.pause_until <= now()
       AND c.message_version > c.ultima_versao_respondida
       AND c.ultima_mensagem_cliente > coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz)
       AND c.ultima_mensagem_cliente > now() - interval '2 hours'
       AND c.retomada_versao IS DISTINCT FROM c.message_version
    RETURNING c.id, c.message_version)
  SELECT coalesce(jsonb_agg(jsonb_build_object('conversa_id', id, 'versao', message_version)), '[]'::jsonb)
    INTO v_retomar FROM r;

  WITH devidos AS (
    SELECT s.id,
           CASE WHEN s.urgente THEN now() - s.created_at
                ELSE now() - greatest(s.created_at, v_abertura) END AS parado
    FROM public.ju_solicitacoes s
    WHERE s.status = 'ABERTA' AND s.lembretes < 2
      AND (s.urgente OR v_expediente)),
  l AS (
    UPDATE public.ju_solicitacoes s
       SET lembretes = s.lembretes + 1, ultimo_lembrete_em = now()
      FROM devidos d
     WHERE s.id = d.id
       AND d.parado >= CASE WHEN s.urgente THEN (CASE WHEN s.lembretes = 0 THEN interval '5 minutes' ELSE interval '15 minutes' END)
                            ELSE (CASE WHEN s.lembretes = 0 THEN interval '10 minutes' ELSE interval '30 minutes' END) END
    RETURNING s.id, s.tipo, s.lembretes, s.urgente, s.notificacao_msg_id, d.parado, s.conversa_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'solicitacao_id', l.id,
           'citar', l.notificacao_msg_id,
           'texto', CASE WHEN l.lembretes = 1 THEN '⏰ ' ELSE '⚠️ ' END
                    || CASE WHEN l.urgente THEN 'URGENTE: ' ELSE '' END
                    || 'pedido aguardando a equipe há ' || (extract(epoch FROM l.parado) / 60)::int || ' min'
                    || CASE WHEN l.notificacao_msg_id IS NULL
                            THEN ' (' || lower(l.tipo) || ', ' || coalesce((SELECT nullif(c.telefone, '') FROM public.ju_conversas c WHERE c.id = l.conversa_id), 'sem telefone') || ')'
                            ELSE '' END
                    || '. Quando terminar, toque em Concluído ou tire a etiqueta.')), '[]'::jsonb)
    INTO v_lembretes FROM l;

  RETURN jsonb_build_object('retomar', v_retomar, 'lembretes', v_lembretes, 'notas', public.fn_ju_nf_acompanhar());
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_ju_chamar_secretaria(p_conversa_id bigint, p_versao bigint, p_tipo text, p_resumo text,
                                                          p_urgente boolean DEFAULT false, p_paciente_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c          public.ju_conversas;
  s          public.ju_solicitacoes;
  v_tipo     text := CASE WHEN upper(p_tipo) IN ('AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO','CONTRATO',
                                                 'NOTA_FISCAL','CLINICO','RECLAMACAO','HUMANO','OUTRO')
                          THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_etiqueta text;
  v_assunto  text;
  v_pac      text;
  v_ctx      jsonb;
  v_resumo   text := left(btrim(coalesce(p_resumo, '')), 1800);
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;

  v_etiqueta := CASE WHEN p_urgente THEN '27'
                     WHEN v_tipo = 'AGENDAMENTO' THEN '23'
                     WHEN v_tipo IN ('REMARCACAO','CANCELAMENTO') THEN '24'
                     WHEN v_tipo = 'FINANCEIRO' THEN '25'
                     WHEN v_tipo IN ('NOTA_FISCAL','CONTRATO') THEN '26'
                     ELSE '22' END;
  v_assunto := CASE v_tipo WHEN 'AGENDAMENTO' THEN 'Agendamento' WHEN 'REMARCACAO' THEN 'Remarcação'
                           WHEN 'CANCELAMENTO' THEN 'Cancelamento' WHEN 'FINANCEIRO' THEN 'Financeiro'
                           WHEN 'CONTRATO' THEN 'Contrato' WHEN 'NOTA_FISCAL' THEN 'Nota fiscal'
                           WHEN 'CLINICO' THEN 'Clínico' WHEN 'RECLAMACAO' THEN 'Reclamação'
                           WHEN 'HUMANO' THEN 'Pediu atendente' ELSE 'Outro' END
               || CASE WHEN p_urgente THEN ' (URGENTE)' ELSE '' END;

  v_ctx := public.fn_ju_contexto_cliente(c.id);
  SELECT x ->> 'nome' INTO v_pac FROM jsonb_array_elements(v_ctx -> 'pacientes') x
   WHERE (x ->> 'paciente_id')::uuid = p_paciente_id;
  IF v_pac IS NULL THEN p_paciente_id := NULL; END IF;
  IF v_pac IS NULL AND jsonb_array_length(v_ctx -> 'pacientes') = 1 THEN
    v_pac := v_ctx -> 'pacientes' -> 0 ->> 'nome';
  END IF;

  SELECT * INTO s FROM public.ju_solicitacoes
   WHERE conversa_id = c.id AND tipo = v_tipo AND status = 'ABERTA' FOR UPDATE;

  IF FOUND THEN
    UPDATE public.ju_solicitacoes
       SET atualizacoes = atualizacoes || jsonb_build_object('em', now(), 'resumo', v_resumo),
           urgente = urgente OR p_urgente,
           -- emergência: libera a resposta do SAMU nesta versão (fn_ju_responder)
           versao = CASE WHEN p_urgente AND p_versao IS NOT NULL THEN p_versao ELSE versao END
     WHERE id = s.id;
    RETURN jsonb_build_object(
      'ok', true, 'novo', false, 'solicitacao_id', s.id,
      'wa_chatid', c.wa_chatid, 'etiqueta', s.etiqueta, 'citar', s.notificacao_msg_id,
      'texto_grupo', CASE WHEN p_urgente THEN '🚨 *URGENTE* ' ELSE '📝 ' END || 'Atualização: ' || v_resumo,
      'resposta_ia', 'A secretaria já tinha sido avisada sobre isso; a informação nova foi acrescentada ao pedido. Avise a família que a secretaria segue com o pedido e responde por aqui.');
  END IF;

  INSERT INTO public.ju_solicitacoes (conversa_id, versao, paciente_id, tipo, setor, resumo, etiqueta, urgente)
  VALUES (c.id, p_versao, p_paciente_id, v_tipo,
          CASE WHEN v_tipo = 'CLINICO' THEN 'FISIOTERAPIA' ELSE 'SECRETARIA' END,
          v_resumo, v_etiqueta, p_urgente)
  RETURNING * INTO s;

  UPDATE public.ju_conversas SET status = 'AGUARDANDO_EQUIPE', pause_until = NULL, updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object(
    'ok', true, 'novo', true, 'solicitacao_id', s.id,
    'wa_chatid', c.wa_chatid, 'etiqueta', v_etiqueta,
    'texto_grupo',
      CASE WHEN p_urgente THEN '🚨' ELSE '🔔' END || ' *' || v_assunto || '*' || E'\n'
      || '*Paciente:* ' || coalesce(v_pac, 'não identificado') || E'\n'
      || '*Contato:* ' || coalesce(
           CASE WHEN c.telefone ~ '^\+55[0-9]{11}$'
                THEN '(' || substr(c.telefone, 4, 2) || ') ' || substr(c.telefone, 6, 5) || '-' || substr(c.telefone, 11)
                ELSE c.telefone END, 'sem telefone') || E'\n\n'
      || v_resumo || E'\n\n'
      || 'Quando terminar, toque em Concluído ou tire a etiqueta da conversa.',
    'resposta_ia', 'Pedido registrado e secretaria avisada. Diga à família, em poucas palavras, que a secretaria vai responder por aqui.');
END;
$$;
