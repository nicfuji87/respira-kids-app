-- Grupo 🔔 Notificações menos poluído (pedido do dono, 23/10/2026):
-- 1) um pedido = uma mensagem ("card"): novidades da família entram no próprio card
--    (o n8n apaga o card antigo e posta de novo, já consolidado; editar não serve porque o
--    WhatsApp não mostra edição em mensagem com botão; pode_editar ficou sem uso);
-- 2) lembrete ⏰ só para pedido urgente (um só); o resto vai para o resumo das 12h e 17h30;
-- 3) pedido concluído: o n8n apaga o card do grupo.

ALTER TABLE public.ju_solicitacoes
  ADD COLUMN IF NOT EXISTS texto_card text,
  ADD COLUMN IF NOT EXISTS card_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_ju_solicitacao_notificada(p_solicitacao_id bigint, p_msg_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.ju_solicitacoes
     SET notificacao_msg_id = nullif(btrim(p_msg_id), ''),
         card_em = CASE WHEN nullif(btrim(p_msg_id), '') IS NOT NULL THEN now() ELSE card_em END
   WHERE id = p_solicitacao_id;
$function$;

-- Texto completo do card: base + até 6 novidades + rodapé.
CREATE OR REPLACE FUNCTION public.fn_ju_card(p_solicitacao_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN s.id IS NULL OR s.texto_card IS NULL OR s.notificacao_msg_id IS NULL OR s.status <> 'ABERTA'
      THEN jsonb_build_object('ok', false)
    ELSE jsonb_build_object(
      'ok', true,
      'solicitacao_id', s.id,
      'msg_id', s.notificacao_msg_id,
      'pode_editar', coalesce(s.card_em > now() - interval '13 minutes', false),
      'texto', s.texto_card
        || coalesce((
             SELECT E'\n\n📝 *Novidades*' || string_agg(
                      E'\n• ' || CASE WHEN (u.em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                      THEN to_char(u.em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
                                      ELSE to_char(u.em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') END
                      || ' ' || left(u.resumo, 500), '' ORDER BY u.em)
               FROM (SELECT (x ->> 'em')::timestamptz AS em, x ->> 'resumo' AS resumo
                       FROM jsonb_array_elements(coalesce(s.atualizacoes, '[]'::jsonb)) x
                      ORDER BY (x ->> 'em')::timestamptz DESC LIMIT 6) u), '')
        || E'\n\nQuando terminar, toque em Concluído ou tire a etiqueta da conversa.')
  END
  FROM (SELECT 1) d
  LEFT JOIN public.ju_solicitacoes s ON s.id = p_solicitacao_id;
$function$;

-- Nota da Ju (modo ANOTAR) vira novidade do pedido aberto mais recente que tem card.
CREATE OR REPLACE FUNCTION public.fn_ju_anotar_pedido(p_conversa_id bigint, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
BEGIN
  IF nullif(btrim(coalesce(p_texto, '')), '') IS NULL THEN
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
                        || jsonb_build_object('em', now(), 'resumo', left(btrim(p_texto), 600), 'origem', 'nota')
   WHERE id = v_id;
  RETURN public.fn_ju_card(v_id);
END;
$function$;

-- Chamar secretaria: guarda o texto-base do card; pedido repetido devolve o card atualizado.
CREATE OR REPLACE FUNCTION public.fn_ju_chamar_secretaria(p_conversa_id bigint, p_versao bigint, p_tipo text, p_resumo text, p_urgente boolean DEFAULT false, p_paciente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  c          public.ju_conversas;
  s          public.ju_solicitacoes;
  v_tipo     text := CASE WHEN upper(p_tipo) IN ('AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO','CONTRATO',
                                                 'NOTA_FISCAL','CLINICO','RECLAMACAO','HUMANO','OUTRO','EXTERNO')
                          THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_etiqueta text;
  v_assunto  text;
  v_pac      text;
  v_ctx      jsonb;
  v_resumo   text := left(btrim(coalesce(p_resumo, '')), 1800);
  v_base     text;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;
  IF c.sem_ia THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA');
  END IF;
  -- a família escreveu de novo enquanto a IA pensava: o turno novo decide
  IF p_versao IS NOT NULL AND NOT coalesce(p_urgente, false) AND c.message_version > p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA');
  END IF;

  IF v_tipo <> 'CLINICO' THEN p_urgente := false; END IF;
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
                           WHEN 'HUMANO' THEN 'Pediu atendente' WHEN 'EXTERNO' THEN 'Contato externo (baixa prioridade)' ELSE 'Outro' END
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
       SET atualizacoes = coalesce(atualizacoes, '[]'::jsonb) || jsonb_build_object('em', now(), 'resumo', v_resumo),
           urgente = urgente OR p_urgente,
           versao = CASE WHEN p_urgente AND p_versao IS NOT NULL THEN p_versao ELSE versao END
     WHERE id = s.id;
    RETURN jsonb_build_object(
      'ok', true, 'novo', false, 'solicitacao_id', s.id,
      'wa_chatid', c.wa_chatid, 'etiqueta', s.etiqueta, 'citar', s.notificacao_msg_id,
      -- urgente continua chegando como mensagem nova; o resto atualiza o card
      'card', CASE WHEN p_urgente THEN jsonb_build_object('ok', false) ELSE public.fn_ju_card(s.id) END,
      'texto_grupo', CASE WHEN p_urgente THEN '🚨 *URGENTE* ' ELSE '📝 ' END || 'Atualização: ' || v_resumo,
      'resposta_ia', 'A secretaria já tinha sido avisada sobre isso; a informação nova foi acrescentada ao pedido. Avise a família que a secretaria segue com o pedido e responde por aqui.');
  END IF;

  v_base := CASE WHEN p_urgente THEN '🚨' ELSE '🔔' END || ' *' || v_assunto || '*' || E'\n'
    || '*Paciente:* ' || coalesce(v_pac, 'não identificado') || E'\n'
    || '*Contato:* ' || coalesce(
         CASE WHEN c.telefone ~ '^\+55[0-9]{11}$'
              THEN '(' || substr(c.telefone, 4, 2) || ') ' || substr(c.telefone, 6, 5) || '-' || substr(c.telefone, 11)
              ELSE c.telefone END, 'sem telefone') || E'\n\n'
    || v_resumo;

  INSERT INTO public.ju_solicitacoes (conversa_id, versao, paciente_id, tipo, setor, resumo, etiqueta, urgente, texto_card)
  VALUES (c.id, p_versao, p_paciente_id, v_tipo,
          CASE WHEN v_tipo = 'CLINICO' THEN 'FISIOTERAPIA' ELSE 'SECRETARIA' END,
          v_resumo, v_etiqueta, p_urgente, v_base)
  RETURNING * INTO s;

  UPDATE public.ju_conversas SET status = 'AGUARDANDO_EQUIPE', pause_until = NULL, updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object(
    'ok', true, 'novo', true, 'solicitacao_id', s.id,
    'wa_chatid', c.wa_chatid, 'etiqueta', v_etiqueta,
    'texto_grupo', v_base || E'\n\n' || 'Quando terminar, toque em Concluído ou tire a etiqueta da conversa.',
    'resposta_ia', 'Pedido registrado e secretaria avisada. Diga à família, em poucas palavras, que a secretaria vai responder por aqui.');
END;
$function$;

-- Lembrete ⏰ só para pedido urgente, uma vez (o resto vai para o resumo do dia).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_tarefas()'::regprocedure); n text;
BEGIN
  IF d LIKE '%s.urgente AND s.lembretes < 1%' THEN RETURN; END IF;
  n := replace(d,
    $a$WHERE s.status = 'ABERTA' AND s.lembretes < 2 AND s.tipo <> 'EXTERNO'
      AND (s.urgente OR v_expediente)),$a$,
    $a$WHERE s.status = 'ABERTA' AND s.urgente AND s.lembretes < 1 AND s.tipo <> 'EXTERNO'),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_tarefas: filtro dos lembretes não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

REVOKE ALL ON FUNCTION public.fn_ju_card(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_anotar_pedido(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_card(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_anotar_pedido(bigint, text) TO service_role;
