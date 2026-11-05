-- AI dev note: 05/11/2026 (caso Ana Paula, conv 7352, pedido 255): o pedido de AGENDAMENTO foi concluído no botão
-- sem nenhuma resposta da equipe na conversa e sem consulta na agenda. A família ficou sem retorno.
-- fn_ju_pedido_sem_retorno (dentro de fn_lista_espera_tick, 1/min) avisa no 🔔, 30 min depois da conclusão,
-- quando um pedido de AGENDAMENTO/REMARCACAO/ENCAIXE fechado à mão (botão ou etiqueta) não teve mensagem da
-- equipe depois do pedido, nem consulta criada/alterada da família, nem reserva, nem outro pedido aberto.
-- Botões: "↩️ Reabrir" (reabre o pedido e reposta o card) e "👍 Está certo" (só apaga o aviso).
-- O aviso some sozinho se a equipe responder ou a consulta aparecer. Só posta seg a sáb, 8h às 19h59.
-- Reaberto: etiqueta_vista = false, para o sincronismo de etiquetas não concluir de novo (a etiqueta não volta).

CREATE TABLE IF NOT EXISTS public.ju_pedido_sem_retorno (
  solicitacao_id bigint PRIMARY KEY REFERENCES public.ju_solicitacoes(id) ON DELETE CASCADE,
  conversa_id    bigint NOT NULL,
  req_id         bigint,
  msg_id         text,
  card_req       bigint,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  decisao        text,
  decidido_por   text,
  decidido_em    timestamptz
);
ALTER TABLE public.ju_pedido_sem_retorno ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_pedido_sem_retorno FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_sem_retorno_resolvido(p_solicitacao_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM ju_mensagens m WHERE m.conversa_id = s.conversa_id AND m.origem = 'HUMANO'
                    AND m.created_at > s.created_at)
      OR EXISTS (SELECT 1 FROM agendamentos a
                  WHERE a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id))
                    AND (a.created_at > s.created_at - interval '10 minutes' OR a.updated_at > s.created_at - interval '10 minutes'))
      OR EXISTS (SELECT 1 FROM ju_reserva_agenda r JOIN agenda_bloqueios b ON b.id = r.bloqueio_id
                  WHERE r.conversa_id = s.conversa_id AND b.ativo AND b.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM ju_solicitacoes o WHERE o.conversa_id = s.conversa_id AND o.status = 'ABERTA' AND o.id <> s.id)
      OR coalesce(c.sem_ia, false)
    FROM ju_solicitacoes s JOIN ju_conversas c ON c.id = s.conversa_id
   WHERE s.id = p_solicitacao_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_pedido_sem_retorno()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  x record; v_tok text; v_txt text; v_msg text; v_n int := 0; v_fim int := 0;
BEGIN
  -- reaberto: o card novo ganha o id quando a uazapi responder
  FOR x IN SELECT * FROM ju_pedido_sem_retorno WHERE card_req IS NOT NULL LOOP
    v_msg := fn_le_msg_id(x.card_req);
    IF v_msg IS NOT NULL OR x.decidido_em < now() - interval '10 minutes' THEN
      UPDATE ju_solicitacoes SET notificacao_msg_id = coalesce(v_msg, notificacao_msg_id), card_em = now()
       WHERE id = x.solicitacao_id AND status = 'ABERTA' AND v_msg IS NOT NULL;
      UPDATE ju_pedido_sem_retorno SET card_req = NULL WHERE solicitacao_id = x.solicitacao_id;
    END IF;
  END LOOP;

  -- aviso pendente que se resolveu sozinho (equipe respondeu, consulta criada, novo pedido)
  FOR x IN SELECT * FROM ju_pedido_sem_retorno WHERE decisao IS NULL LOOP
    IF x.msg_id IS NULL AND x.req_id IS NOT NULL THEN
      v_msg := fn_le_msg_id(x.req_id);
      UPDATE ju_pedido_sem_retorno SET msg_id = v_msg WHERE solicitacao_id = x.solicitacao_id;
      x.msg_id := v_msg;
    END IF;
    IF fn_ju_sem_retorno_resolvido(x.solicitacao_id) OR x.criado_em < now() - interval '3 days' THEN
      UPDATE ju_pedido_sem_retorno SET decisao = 'resolvido', decidido_em = now() WHERE solicitacao_id = x.solicitacao_id;
      PERFORM fn_le_apagar(x.msg_id, x.req_id);
      v_fim := v_fim + 1;
    END IF;
  END LOOP;

  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL OR extract(isodow FROM v_agora) = 7 OR v_agora::time < time '08:00' OR v_agora::time >= time '20:00' THEN
    RETURN jsonb_build_object('avisos', 0, 'resolvidos', v_fim);
  END IF;

  FOR x IN
    SELECT s.*, c.telefone, c.nome_whatsapp
      FROM ju_solicitacoes s JOIN ju_conversas c ON c.id = s.conversa_id
     WHERE s.tipo IN ('AGENDAMENTO', 'REMARCACAO', 'ENCAIXE') AND s.status = 'RESOLVIDA'
       AND s.resolvida_em BETWEEN now() - interval '16 hours' AND now() - interval '30 minutes'
       AND (s.resolvida_por LIKE 'botão%' OR s.resolvida_por = 'etiqueta tirada')
       AND NOT EXISTS (SELECT 1 FROM ju_pedido_sem_retorno k WHERE k.solicitacao_id = s.id)
       AND NOT fn_ju_sem_retorno_resolvido(s.id)
     ORDER BY s.resolvida_em LIMIT 3
  LOOP
    v_txt := '⚠️ *Pedido concluído sem resposta*' || E'\n'
          || coalesce(nullif(btrim(x.nome_whatsapp), ''), 'Contato')
          || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(x.telefone)), '') || E'\n'
          || 'O pedido de ' || CASE x.tipo WHEN 'REMARCACAO' THEN 'remarcação' WHEN 'ENCAIXE' THEN 'encaixe' ELSE 'agendamento' END
          || ' foi concluído ' || CASE WHEN x.resolvida_por = 'etiqueta tirada' THEN 'pela etiqueta'
                                      ELSE 'no ' || x.resolvida_por END
          || ' às ' || to_char(x.resolvida_em AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI')
          || ', mas ninguém da equipe escreveu na conversa e não há consulta nova na agenda.'
          || CASE WHEN nullif(btrim(x.resumo), '') IS NOT NULL
                  THEN E'\n' || 'Pedido: ' || CASE WHEN length(btrim(x.resumo)) > 260 THEN left(btrim(x.resumo), 257) || '...' ELSE btrim(x.resumo) END
                  ELSE '' END
          || E'\n\n' || '_Se ficou pendente, toque em Reabrir. Se foi resolvido por fora (ligação, outro número), toque em Está certo._';
    INSERT INTO ju_pedido_sem_retorno (solicitacao_id, conversa_id, req_id)
    VALUES (x.id, x.conversa_id,
            net.http_post(url := 'https://infuse.uazapi.com/send/menu',
              body := jsonb_build_object('number', GRUPO, 'type', 'button', 'text', v_txt,
                                         'choices', jsonb_build_array('↩️ Reabrir|ju_reab_sim:' || x.id, '👍 Está certo|ju_reab_ok:' || x.id)),
              headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
              timeout_milliseconds := 20000));
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_fim);
END $$;

CREATE OR REPLACE FUNCTION public.fn_ju_reabrir_botao(p_botao text, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  m text[]; k ju_pedido_sem_retorno; s ju_solicitacoes; v_quem text; v_tok text; v_card text; v_req bigint;
BEGIN
  m := regexp_match(coalesce(p_botao, ''), '^ju_reab_(sim|ok):(\d+)$');
  IF m IS NULL THEN RETURN jsonb_build_object('ok', false, 'texto', 'Botão não reconhecido.'); END IF;
  SELECT * INTO k FROM ju_pedido_sem_retorno WHERE solicitacao_id = m[2]::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'texto', 'Aviso não encontrado.'); END IF;
  k.msg_id := coalesce(k.msg_id, fn_le_msg_id(k.req_id));
  PERFORM fn_le_apagar(k.msg_id, k.req_id);
  IF k.decisao IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', 'Aviso já resolvido.');
  END IF;

  v_quem := nullif(btrim(coalesce(p_quem, '')), '');
  IF v_quem IS NULL OR v_quem ~* '^(alguém|alguem|recep|respira)' THEN v_quem := 'Recepção'; END IF;

  IF m[1] = 'ok' THEN
    UPDATE ju_pedido_sem_retorno SET decisao = 'ok', decidido_por = v_quem, decidido_em = now(), msg_id = k.msg_id
     WHERE solicitacao_id = k.solicitacao_id;
    RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', 'Aviso dispensado.');
  END IF;

  UPDATE ju_solicitacoes
     SET status = 'ABERTA', resolvida_em = NULL, resolvida_por = NULL, etiqueta_vista = false,
         verificando_por = NULL, verificando_em = NULL, ultimo_lembrete_em = now(),
         atualizacoes = coalesce(atualizacoes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'em', now(), 'origem', 'reabertura',
           'resumo', 'Reaberto por ' || v_quem || ' (tinha sido concluído sem resposta à família).'))
   WHERE id = k.solicitacao_id AND status = 'RESOLVIDA'
  RETURNING * INTO s;
  IF s.id IS NULL THEN
    UPDATE ju_pedido_sem_retorno SET decisao = 'ja_aberto', decidido_por = v_quem, decidido_em = now() WHERE solicitacao_id = k.solicitacao_id;
    RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', 'O pedido já estava aberto.');
  END IF;
  UPDATE ju_conversas SET status = 'AGUARDANDO_EQUIPE', updated_at = now()
   WHERE id = s.conversa_id AND status = 'ATIVA';

  v_card := '↩️ *Reaberto por ' || v_quem || '*' || E'\n\n' || coalesce(fn_ju_card(s.id) ->> 'texto', s.texto_card, s.resumo);
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NOT NULL THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', GRUPO, 'type', 'button', 'text', v_card,
                                 'choices', jsonb_build_array('👀 Estou verificando|ju_verif:' || s.id, '✅ Concluído|ju_concluir:' || s.id)),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  UPDATE ju_pedido_sem_retorno SET decisao = 'reaberto', decidido_por = v_quem, decidido_em = now(), msg_id = k.msg_id, card_req = v_req
   WHERE solicitacao_id = k.solicitacao_id;
  RETURN jsonb_build_object('ok', true, 'silencioso', true, 'texto', 'Pedido reaberto.');
END $$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_reserva_botao'::regproc);
  IF position($a$  IF p_prof LIKE 'ju_lecmd:%' THEN$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$  IF p_prof LIKE 'ju_lecmd:%' THEN$a$,
    $a$  IF p_prof LIKE 'ju_reab_%' THEN
    IF coalesce(p_chatid, '') <> '120363433073436578@g.us' THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo.');
    END IF;
    RETURN public.fn_ju_reabrir_botao(p_prof, p_quem);
  END IF;
  IF p_prof LIKE 'ju_lecmd:%' THEN$a$);

  d := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
  IF position($a$'pedidos_parados', public.fn_ju_pedidos_parados_concluir());$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$'pedidos_parados', public.fn_ju_pedidos_parados_concluir());$a$,
    $a$'pedidos_parados', public.fn_ju_pedidos_parados_concluir(),
                            'sem_retorno', public.fn_ju_pedido_sem_retorno());$a$);
END $do$;
