-- 29/10/2026 (pedido do dono): toda reserva avisa o grupo 🔔 E a profissional, com botão para virar consulta.
--  * "@ju reservar" (compromisso categoria 'reserva' em agenda_bloqueios): card com ✅ Agendar / ❌ Liberar horário.
--    O serviço vem do pedido (tipo_servico_id) e a criança do cadastro (na hora do clique, se ainda não havia).
--  * Reserva da própria Ju (ju_reservas, contato novo): a profissional passa a receber o card com botões também.
--  * Os cliques valem no grupo e no privado da profissional da reserva.

CREATE TABLE IF NOT EXISTS public.ju_reserva_agenda (
  bloqueio_id uuid PRIMARY KEY REFERENCES public.agenda_bloqueios(id),
  conversa_id bigint REFERENCES public.ju_conversas(id),
  tipo_servico_id uuid REFERENCES public.tipo_servicos(id),
  solicitante text,
  grupo_req_id bigint,
  agendamento_id uuid REFERENCES public.agendamentos(id),
  decidida_por text,
  decidida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_reserva_agenda ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_reserva_agenda FROM anon, authenticated;

-- Manda o card de uma reserva de agenda para o grupo e para a profissional.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_avisar(p_bloqueio_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE b public.agenda_bloqueios; m public.ju_reserva_agenda; v_txt text; v_tok text; v_req bigint; v_tel text; v_choices jsonb;
BEGIN
  SELECT * INTO b FROM public.agenda_bloqueios WHERE id = p_bloqueio_id;
  SELECT * INTO m FROM public.ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  IF NOT FOUND OR b.motivo <> 'reserva' OR NOT b.ativo OR b.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  SELECT '📌 *Reserva na agenda*'
         || E'\n*Para:* ' || coalesce(btrim(pac.nome), regexp_replace(coalesce(b.titulo, ''), '^Reserva: ', ''))
         || E'\n*Serviço:* ' || coalesce(regexp_replace(btrim(ts.nome), '\s+', ' ', 'g'), 'a definir')
         || E'\n*Quando:* ' || public.fn_ju_reserva_quando(b.inicio)
         || E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)
         || coalesce(E'\n*Contato:* ' || coalesce(nullif(c.nome_whatsapp, '') || ' · ', '')
                     || coalesce(regexp_replace(c.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'), c.wa_chatid), '')
         || CASE WHEN b.expira_em IS NOT NULL
                 THEN E'\n*Vence:* fim do dia ' || to_char((b.expira_em AT TIME ZONE 'UTC') - interval '1 minute', 'DD/MM') ELSE '' END
         || E'\n\nQuando a família estiver pronta (com cadastro), toque em ✅ Agendar: a consulta é criada e a família recebe a confirmação.',
         nullif(regexp_replace(coalesce(pr.telefone::text, ''), '\D', '', 'g'), '')
    INTO v_txt, v_tel
    FROM public.pessoas pr
    LEFT JOIN public.pessoas pac ON pac.id = b.paciente_id
    LEFT JOIN public.tipo_servicos ts ON ts.id = m.tipo_servico_id
    LEFT JOIN public.ju_conversas c ON c.id = m.conversa_id
   WHERE pr.id = b.profissional_id;
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_txt IS NULL OR v_tok IS NULL THEN RETURN NULL; END IF;
  v_choices := jsonb_build_array('✅ Agendar|ju_rag_ok:' || b.id, '❌ Liberar horário|ju_rag_nao:' || b.id);
  v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
    body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button', 'text', v_txt, 'choices', v_choices),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
  UPDATE public.ju_reserva_agenda SET grupo_req_id = v_req WHERE bloqueio_id = b.id;
  IF v_tel IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', v_tel, 'type', 'button', 'text', v_txt, 'choices', v_choices),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN v_req;
END $f$;

-- Clique no card da reserva de agenda.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_decidir(p_bloqueio_id uuid, p_aceitar boolean, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE b public.agenda_bloqueios; m public.ju_reserva_agenda; v_msg text; v_quem text := coalesce(nullif(btrim(p_quem), ''), 'alguém');
        v_pac uuid; v_n int; ctx jsonb; ts public.tipo_servicos; v_serv uuid; v_base text; v_alvo text; v_fds boolean;
        v_prof text; v_local uuid; v_emp uuid; v_valor numeric; v_id uuid; v_quando text; erro text;
BEGIN
  SELECT * INTO b FROM public.agenda_bloqueios WHERE id = p_bloqueio_id FOR UPDATE;
  SELECT * INTO m FROM public.ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  v_msg := (SELECT nullif(coalesce(h.content::jsonb ->> 'messageid', h.content::jsonb ->> 'id'), '')
              FROM net._http_response h WHERE h.id = m.grupo_req_id);
  IF b.id IS NULL OR b.motivo <> 'reserva' THEN RETURN jsonb_build_object('ok', false, 'texto', 'Reserva não encontrada.', 'msg_id', v_msg); END IF;
  IF NOT b.ativo OR b.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', coalesce(b.encerramento, 'encerrada'), 'msg_id', v_msg,
      'texto', 'Essa reserva já estava ' || CASE coalesce(b.encerramento, '') WHEN 'confirmada' THEN 'confirmada (virou consulta)'
                                                   WHEN 'vencida' THEN 'vencida' ELSE 'encerrada' END || '.');
  END IF;
  v_quando := public.fn_ju_reserva_quando(b.inicio);
  IF NOT p_aceitar THEN
    UPDATE public.agenda_bloqueios SET ativo = false, deleted_at = now(), updated_at = now() WHERE id = b.id;
    UPDATE public.ju_reserva_agenda SET decidida_por = v_quem, decidida_em = now() WHERE bloqueio_id = b.id;
    RETURN jsonb_build_object('ok', true, 'aceita', false, 'msg_id', v_msg,
      'texto', '❌ Reserva de ' || v_quando || ' liberada por ' || v_quem || '. O horário voltou para a agenda.');
  END IF;

  -- criança: a da reserva; senão a única do cadastro da conversa
  v_pac := b.paciente_id;
  IF v_pac IS NULL AND m.conversa_id IS NOT NULL THEN
    ctx := public.fn_ju_contexto_cliente(m.conversa_id);
    SELECT count(*), min((x ->> 'paciente_id'))::uuid INTO v_n, v_pac
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END) x
     WHERE coalesce((x ->> 'acesso_agenda')::boolean, false);
    IF v_n <> 1 THEN v_pac := NULL; END IF;
  END IF;
  IF v_pac IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'pendente', 'msg_id', v_msg,
      'texto', '⚠️ Ainda não dá para agendar: ' || CASE WHEN coalesce(v_n, 0) > 1 THEN 'a família tem mais de uma criança no cadastro. Agende pelo app.'
                                                     ELSE 'a família ainda não terminou o cadastro. Quando terminar, toque de novo em ✅ Agendar (ou agende pelo app).' END);
  END IF;
  IF m.tipo_servico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 'pendente', 'msg_id', v_msg,
      'texto', '⚠️ A reserva não tem o serviço definido. Agende pelo app (a reserva sai sozinha quando a consulta for criada).');
  END IF;

  -- serviço dia útil / fim de semana, sala e empresa (mesmas regras do @ju agendar)
  SELECT * INTO ts FROM public.tipo_servicos WHERE id = m.tipo_servico_id;
  v_fds := extract(isodow FROM (b.inicio AT TIME ZONE 'UTC')::date) IN (6, 7)
           OR EXISTS (SELECT 1 FROM public.followup_feriados WHERE dia = (b.inicio AT TIME ZONE 'UTC')::date);
  v_base := lower(regexp_replace(ts.nome, '\s+', ' ', 'g')); v_serv := ts.id;
  IF v_fds AND v_base ~ ' - du$' THEN v_alvo := regexp_replace(v_base, ' - du$', ' - fds');
  ELSIF NOT v_fds AND v_base ~ ' - fds$' THEN v_alvo := regexp_replace(v_base, ' - fds$', ' - du'); END IF;
  IF v_alvo IS NOT NULL THEN
    SELECT id INTO v_serv FROM public.tipo_servicos WHERE ativo AND lower(regexp_replace(nome, '\s+', ' ', 'g')) = v_alvo LIMIT 1;
    v_serv := coalesce(v_serv, ts.id);
  END IF;
  SELECT lower(unaccent(split_part(btrim(nome), ' ', 1))) INTO v_prof FROM public.pessoas WHERE id = b.profissional_id;
  v_local := (SELECT id FROM public.locais_atendimento WHERE ativo AND nome = CASE v_prof WHEN 'bruna' THEN 'Sala 2' WHEN 'flavia' THEN 'Sala 1' ELSE 'Sala 3' END LIMIT 1);
  v_emp := CASE WHEN v_prof = 'flavia' THEN 'd80f8659-8220-4e0a-ba7d-9645436205b7'::uuid ELSE 'e02b9107-894f-4578-989f-4e8663f2dcca'::uuid END;
  v_valor := coalesce(public.fn_valor_servico(v_serv, b.profissional_id, v_pac), (SELECT valor FROM public.tipo_servicos WHERE id = v_serv));
  BEGIN
    INSERT INTO public.agendamentos (data_hora, paciente_id, profissional_id, tipo_servico_id, local_id, status_consulta_id,
                                     status_pagamento_id, valor_servico, agendado_por, empresa_fatura, observacao, ativo, reserva_id)
    VALUES (b.inicio, v_pac, b.profissional_id, v_serv, v_local, (SELECT id FROM public.consulta_status WHERE codigo = 'agendado'),
            (SELECT id FROM public.pagamento_status WHERE codigo = 'pendente'), v_valor, 'df8ed2ab-867d-47b3-97a2-b05891fae798', v_emp,
            'Reserva convertida em consulta pelo botão do WhatsApp (' || v_quem || ').', true, b.id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    RETURN jsonb_build_object('ok', false, 'status', 'pendente', 'msg_id', v_msg, 'texto', '⚠️ Não consegui criar a consulta: ' || left(erro, 200));
  END;
  UPDATE public.ju_reserva_agenda SET agendamento_id = v_id, decidida_por = v_quem, decidida_em = now() WHERE bloqueio_id = b.id;
  RETURN jsonb_build_object('ok', true, 'aceita', true, 'msg_id', v_msg, 'agendamento_id', v_id,
    'texto', '✅ Consulta criada por ' || v_quem || ': ' || (SELECT split_part(btrim(nome), ' ', 1) FROM public.pessoas WHERE id = v_pac)
             || ', ' || v_quando || '. A família recebe a confirmação.');
END $f$;

-- Porta única dos botões de reserva (grupo ou privado da profissional da reserva).
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_botao(p_reserva_id bigint, p_bloqueio_id uuid, p_aceitar boolean, p_quem text, p_chatid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_prof uuid; v_tel text;
BEGIN
  v_prof := CASE WHEN p_reserva_id IS NOT NULL THEN (SELECT profissional_id FROM public.ju_reservas WHERE id = p_reserva_id)
                 ELSE (SELECT profissional_id FROM public.agenda_bloqueios WHERE id = p_bloqueio_id) END;
  IF coalesce(p_chatid, '') <> '120363433073436578@g.us' THEN
    SELECT telefone::text INTO v_tel FROM public.pessoas WHERE id = v_prof;
    IF public.fn_atrib_tel_chave(split_part(coalesce(p_chatid, ''), '@', 1)) IS DISTINCT FROM public.fn_atrib_tel_chave(v_tel) THEN
      RETURN jsonb_build_object('ok', false, 'texto', 'Esse botão só vale no grupo ou para a profissional da reserva.');
    END IF;
  END IF;
  IF p_reserva_id IS NOT NULL THEN RETURN public.fn_ju_reserva_decidir(p_reserva_id, p_aceitar, p_quem); END IF;
  RETURN public.fn_ju_reserva_agenda_decidir(p_bloqueio_id, p_aceitar, p_quem);
END $f$;

-- Reserva da própria Ju (contato novo): a profissional também recebe o card com botões.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_reserva_avisar_grupo(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%ju_res_ok:'' || r.id)) END%' OR d LIKE '%Reserva na sua agenda (Ju)*'' || v_base || v_contato%' THEN RETURN; END IF;
  n := replace(d, $a$      url := 'https://infuse.uazapi.com/send/text',
      body := jsonb_build_object('number', v_tel_prof,
                                 'text', '📅 *Reserva na sua agenda (Ju)*' || v_base
                                         || E'\n\nA recepção ainda vai confirmar. Quando confirmar, a consulta aparece na sua agenda.'),$a$,
$a$      url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', v_tel_prof, 'type', 'button',
                                 'text', '📅 *Reserva na sua agenda (Ju)*' || v_base || v_contato
                                         || E'\n\nPode confirmar por aqui ou a recepção confirma pelo grupo. Ao confirmar, a consulta é criada e a família recebe a confirmação.',
                                 'choices', jsonb_build_array('✅ Confirmar|ju_res_ok:' || r.id, '❌ Recusar|ju_res_nao:' || r.id)),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reserva_avisar_grupo: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- "@ju reservar" grava o serviço/conversa e manda o card.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_executar(bigint, bigint, jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%fn_ju_reserva_agenda_avisar%' THEN RETURN; END IF;
  n := replace(d, $a$    v_dono := CASE WHEN lower(split_part(btrim(v_quem), ' ', 1)) = lower(split_part(btrim(v_r ->> 'profissional'), ' ', 1))
                   THEN 'sua agenda' ELSE 'agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) END;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', 'Pronto, reservei a '$a$,
$a$    INSERT INTO public.ju_reserva_agenda (bloqueio_id, conversa_id, tipo_servico_id, solicitante)
    VALUES ((v_r ->> 'id')::uuid, p_conversa_id,
            (SELECT id FROM public.tipo_servicos WHERE ativo AND id::text = d ->> 'tipo_servico_id'), v_quem)
    ON CONFLICT (bloqueio_id) DO NOTHING;
    PERFORM public.fn_ju_reserva_agenda_avisar((v_r ->> 'id')::uuid);
    v_dono := CASE WHEN lower(split_part(btrim(v_quem), ' ', 1)) = lower(split_part(btrim(v_r ->> 'profissional'), ' ', 1))
                   THEN 'sua agenda' ELSE 'agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) END;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', 'Pronto, reservei a '$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

DO $grant$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_ju_reserva_agenda_avisar(uuid)', 'fn_ju_reserva_agenda_decidir(uuid, boolean, text)',
                           'fn_ju_reserva_botao(bigint, uuid, boolean, text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $grant$;
