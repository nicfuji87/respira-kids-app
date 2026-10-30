-- 30/10/2026 (pedido do dono):
-- 1) Reserva SEM cadastro: só um aviso (sem botão) no grupo e para a profissional. Quando o cadastro fica pronto,
--    o aviso é apagado e chega o card com ✅ Agendar / ❌ Liberar. Com cadastro, o card com botão vai direto.
--    (A Beatriz recebeu o card da Alice antes do cadastro e perguntou se podia clicar.)
-- 2) "@ju agendar" no horário reservado para a mesma família usa a reserva (antes respondia "horário ocupado").

ALTER TABLE public.ju_reserva_agenda
  ADD COLUMN IF NOT EXISTS aviso_reqs bigint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS aviso_ids text[] NOT NULL DEFAULT '{}';

-- ids das mensagens: cards (msg_ids) e avisos sem botão (aviso_ids)
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_resolver_msgs(p_bloqueio_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE m public.ju_reserva_agenda; v_cards text[]; v_avisos text[];
BEGIN
  SELECT * INTO m FROM public.ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_cards FROM (
    SELECT unnest(m.msg_ids) x
    UNION SELECT nullif(h.content::jsonb ->> 'messageid', '') FROM net._http_response h
     WHERE h.id = ANY (m.msg_reqs || coalesce(m.grupo_req_id, 0)) AND h.status_code = 200) s WHERE x IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_avisos FROM (
    SELECT unnest(m.aviso_ids) x
    UNION SELECT nullif(h.content::jsonb ->> 'messageid', '') FROM net._http_response h
     WHERE h.id = ANY (m.aviso_reqs) AND h.status_code = 200) s WHERE x IS NOT NULL;
  IF v_cards IS DISTINCT FROM m.msg_ids OR v_avisos IS DISTINCT FROM m.aviso_ids THEN
    UPDATE public.ju_reserva_agenda SET msg_ids = v_cards, aviso_ids = v_avisos WHERE bloqueio_id = p_bloqueio_id;
  END IF;
  RETURN v_cards || v_avisos;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_apagar_msgs(p_ids text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_tok text := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token'; v_id text; v_n int := 0;
BEGIN
  IF v_tok IS NULL OR p_ids IS NULL THEN RETURN 0; END IF;
  FOREACH v_id IN ARRAY p_ids LOOP
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete', body := jsonb_build_object('id', v_id),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_limpar(p_bloqueio_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_n int;
BEGIN
  v_n := public.fn_ju_reserva_agenda_apagar_msgs(public.fn_ju_reserva_agenda_resolver_msgs(p_bloqueio_id));
  UPDATE public.ju_reserva_agenda SET limpo_em = now() WHERE bloqueio_id = p_bloqueio_id;
  RETURN v_n;
END $f$;

-- Sem cadastro: aviso sem botão. Com cadastro: card com botões.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_avisar(p_bloqueio_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE b public.agenda_bloqueios; m public.ju_reserva_agenda; v_base text; v_tok text; v_req bigint; v_greq bigint; v_tel text;
        v_choices jsonb; v_txt text; v_tem_cadastro boolean;
BEGIN
  SELECT * INTO b FROM public.agenda_bloqueios WHERE id = p_bloqueio_id;
  SELECT * INTO m FROM public.ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  IF NOT FOUND OR b.motivo <> 'reserva' OR NOT b.ativo OR b.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  v_tem_cadastro := b.paciente_id IS NOT NULL;
  SELECT '📌 *Reserva na agenda*'
         || E'\n*Para:* ' || coalesce(btrim(pac.nome), regexp_replace(coalesce(b.titulo, ''), '^Reserva: ', ''))
         || E'\n*Serviço:* ' || coalesce(regexp_replace(btrim(ts.nome), '\s+', ' ', 'g'), 'a definir')
         || E'\n*Quando:* ' || public.fn_ju_reserva_quando(b.inicio)
         || E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)
         || coalesce(E'\n*Reservado por:* ' || nullif(m.solicitante, ''), '')
         || coalesce(E'\n*Contato:* ' || coalesce(nullif(c.nome_whatsapp, '') || ' · ', '')
                     || coalesce(regexp_replace(c.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'), c.wa_chatid), ''),
         nullif(regexp_replace(coalesce(pr.telefone::text, ''), '\D', '', 'g'), '')
    INTO v_base, v_tel
    FROM public.pessoas pr
    LEFT JOIN public.pessoas pac ON pac.id = b.paciente_id
    LEFT JOIN public.tipo_servicos ts ON ts.id = m.tipo_servico_id
    LEFT JOIN public.ju_conversas c ON c.id = m.conversa_id
   WHERE pr.id = b.profissional_id;
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_base IS NULL OR v_tok IS NULL THEN RETURN NULL; END IF;

  IF NOT v_tem_cadastro THEN
    v_txt := v_base || E'\n\n⏳ Aguardando o cadastro da família. Quando ficar pronto, este aviso some e chega o card para confirmar.';
    v_greq := net.http_post(url := 'https://infuse.uazapi.com/send/text',
      body := jsonb_build_object('number', '120363433073436578@g.us', 'text', v_txt),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    UPDATE public.ju_reserva_agenda SET aviso_reqs = aviso_reqs || v_greq WHERE bloqueio_id = b.id;
    IF v_tel IS NOT NULL THEN
      v_req := net.http_post(url := 'https://infuse.uazapi.com/send/text',
        body := jsonb_build_object('number', v_tel, 'text', v_txt),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
      UPDATE public.ju_reserva_agenda SET aviso_reqs = aviso_reqs || v_req WHERE bloqueio_id = b.id;
    END IF;
    RETURN v_greq;
  END IF;

  v_txt := v_base || E'\n\nToque em ✅ Agendar para criar a consulta (a família recebe a confirmação) ou em ❌ Liberar horário.';
  v_choices := jsonb_build_array('✅ Agendar|ju_rag_ok:' || b.id, '❌ Liberar horário|ju_rag_nao:' || b.id);
  v_greq := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
    body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button', 'text', v_txt, 'choices', v_choices),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
  UPDATE public.ju_reserva_agenda SET grupo_req_id = v_greq, msg_reqs = msg_reqs || v_greq WHERE bloqueio_id = b.id;
  IF v_tel IS NOT NULL THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',
      body := jsonb_build_object('number', v_tel, 'type', 'button', 'text', v_txt, 'choices', v_choices),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    UPDATE public.ju_reserva_agenda SET msg_reqs = msg_reqs || v_req WHERE bloqueio_id = b.id;
  END IF;
  RETURN v_greq;
END $f$;

-- Cron de 5 min: guarda ids; reserva sem nada enviado recebe o aviso; cadastro pronto → apaga o aviso
-- (e card antigo, se houver) e manda o card com botão.
CREATE OR REPLACE FUNCTION public.fn_ju_reservas_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE x record; ctx jsonb; v_n int; v_pac uuid; v_cards int := 0; v_avisos int := 0;
BEGIN
  PERFORM public.fn_ju_reserva_agenda_resolver_msgs(m.bloqueio_id)
     FROM public.ju_reserva_agenda m WHERE m.limpo_em IS NULL AND m.created_at > now() - interval '60 days';

  FOR x IN SELECT m.*, b.paciente_id AS pac_atual FROM public.ju_reserva_agenda m JOIN public.agenda_bloqueios b ON b.id = m.bloqueio_id
            WHERE b.ativo AND b.deleted_at IS NULL AND m.agendamento_id IS NULL AND m.limpo_em IS NULL
            FOR UPDATE OF b SKIP LOCKED LOOP
    IF x.pac_atual IS NULL THEN
      IF x.conversa_id IS NOT NULL THEN
        ctx := public.fn_ju_contexto_cliente(x.conversa_id);
        SELECT count(*), min(y ->> 'paciente_id')::uuid INTO v_n, v_pac
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ctx -> 'pacientes') = 'array' THEN ctx -> 'pacientes' ELSE '[]'::jsonb END) y
         WHERE coalesce((y ->> 'acesso_agenda')::boolean, false);
      ELSE
        v_n := 0;
      END IF;
      IF v_n = 1 THEN
        UPDATE public.agenda_bloqueios SET paciente_id = v_pac, updated_at = now() WHERE id = x.bloqueio_id;
        PERFORM public.fn_ju_reserva_agenda_apagar_msgs(public.fn_ju_reserva_agenda_resolver_msgs(x.bloqueio_id));
        UPDATE public.ju_reserva_agenda SET aviso_reqs = '{}', aviso_ids = '{}', msg_reqs = '{}', msg_ids = '{}', grupo_req_id = NULL
         WHERE bloqueio_id = x.bloqueio_id;
        PERFORM public.fn_ju_reserva_agenda_avisar(x.bloqueio_id);
        v_cards := v_cards + 1;
      ELSIF x.grupo_req_id IS NULL AND cardinality(x.aviso_reqs) = 0 THEN
        PERFORM public.fn_ju_reserva_agenda_avisar(x.bloqueio_id);
        v_avisos := v_avisos + 1;
      END IF;
    ELSIF x.grupo_req_id IS NULL THEN
      -- tem cadastro mas ainda não recebeu o card (ex.: só tinha o aviso)
      PERFORM public.fn_ju_reserva_agenda_apagar_msgs(public.fn_ju_reserva_agenda_resolver_msgs(x.bloqueio_id));
      UPDATE public.ju_reserva_agenda SET aviso_reqs = '{}', aviso_ids = '{}' WHERE bloqueio_id = x.bloqueio_id;
      PERFORM public.fn_ju_reserva_agenda_avisar(x.bloqueio_id);
      v_cards := v_cards + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('cards', v_cards, 'avisos', v_avisos);
END $f$;

-- Reserva da Ju: manda o aviso (sem cadastro) ou o card (com cadastro) na hora
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_reservar_horario(bigint, bigint, date, text, text, uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%PERFORM public.fn_ju_reserva_agenda_avisar(v_bid);
    IF v_pac IS NOT NULL THEN%' THEN RETURN; END IF;
  n := replace(d, $a$IF v_pac IS NOT NULL THEN
      PERFORM public.fn_ju_reserva_agenda_avisar(v_bid);$a$, $a$PERFORM public.fn_ju_reserva_agenda_avisar(v_bid);
    IF v_pac IS NOT NULL THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_reservar_horario: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- "@ju agendar" usa a reserva da mesma família no horário
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_agendar'::regproc); n text;
BEGIN
  IF d LIKE '%v_reserva%' THEN RETURN; END IF;
  n := replace(d, $a$  r        jsonb;
  erro     text;$a$, $a$  r        jsonb;
  erro     text;
  v_reserva uuid;$a$);
  n := replace(n, $a$  IF r IS NULL AND NOT fn_horario_disponivel(p_profissional_id, v_dh, v_dh + make_interval(mins => v_dur)) THEN$a$,
$a$  -- reserva desta família nesse horário: a consulta ocupa a reserva (e o banco encerra a reserva)
  IF r IS NULL THEN
    SELECT b.id INTO v_reserva
      FROM agenda_bloqueios b LEFT JOIN ju_reserva_agenda ra ON ra.bloqueio_id = b.id
     WHERE b.motivo = 'reserva' AND b.ativo AND b.deleted_at IS NULL AND b.profissional_id = p_profissional_id
       AND b.periodo && tstzrange(v_dh, v_dh + make_interval(mins => v_dur))
       AND (b.paciente_id = p_paciente_id OR (b.paciente_id IS NULL AND ra.conversa_id = p_conversa_id))
     LIMIT 1;
  END IF;
  IF r IS NULL AND NOT fn_horario_disponivel(p_profissional_id, v_dh, v_dh + make_interval(mins => v_dur), NULL, v_reserva) THEN$a$);
  n := replace(n, $a$empresa_fatura, observacao, ativo)$a$, $a$empresa_fatura, observacao, ativo, reserva_id)$a$);
  n := replace(n, $a$ELSE 'Agendado pela Ju a pedido da recepção (@ju).' END, true)$a$,
                  $a$ELSE 'Agendado pela Ju a pedido da recepção (@ju).' END, true, v_reserva)$a$);
  IF n NOT LIKE '%v_reserva uuid;%' OR n NOT LIKE '%NULL, v_reserva) THEN%' OR n NOT LIKE '%ativo, reserva_id)%' OR n NOT LIKE '%END, true, v_reserva)%' THEN
    RAISE EXCEPTION 'fn_ju_agendar: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;

DO $grant$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_ju_reserva_agenda_resolver_msgs(uuid)', 'fn_ju_reserva_agenda_apagar_msgs(text[])', 'fn_ju_reserva_agenda_limpar(uuid)',
                           'fn_ju_reserva_agenda_avisar(uuid)', 'fn_ju_reservas_tick()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $grant$;
