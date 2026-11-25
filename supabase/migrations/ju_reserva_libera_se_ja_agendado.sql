-- 24/11/2026: reserva da Ju virou segunda consulta (caso Danilo, conversa 22832).
-- A Ju reservou qua 13h; a família quis ir no mesmo dia e a Lolô agendou hoje 13h pelo app. O cadastro
-- ficou pronto, o card "✅ Agendar" chegou ao grupo, alguém tocou e criou a consulta de quarta; a família
-- recebeu confirmação e depois "Desmarcamos".
--
-- Regra nova: se a criança já tiver consulta ativa criada DEPOIS da reserva (e que não seja a própria
-- conversão dela), a reserva é liberada sozinha: sem card de agendar, sem consulta nova, a vaga vai para a
-- lista de espera e o 🔔 Notificações recebe uma linha explicando. Vale em três pontos:
--   fn_ju_reserva_agenda_avisar (antes de mandar o card), fn_ju_reserva_agenda_decidir (no toque em
--   ✅ Agendar de um card antigo) e fn_ju_reservas_tick (a cada 5 min, para cards já enviados).

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_liberar_se_ja_agendado(
  p_bloqueio_id uuid, p_paciente_id uuid DEFAULT NULL, p_avisar boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  b agenda_bloqueios; m ju_reserva_agenda; v_pac uuid; a record; v_txt text; v_tok text; v_ini timestamp;
BEGIN
  SELECT * INTO b FROM agenda_bloqueios WHERE id = p_bloqueio_id;
  SELECT * INTO m FROM ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  IF b.id IS NULL OR m.bloqueio_id IS NULL OR b.motivo <> 'reserva' OR NOT b.ativo OR b.deleted_at IS NOT NULL
     OR m.agendamento_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  v_pac := coalesce(p_paciente_id, b.paciente_id);
  IF v_pac IS NULL THEN RETURN NULL; END IF;

  SELECT ag.data_hora, split_part(btrim(pr.nome), ' ', 1) AS prof, split_part(btrim(pac.nome), ' ', 1) AS crianca
    INTO a
    FROM agendamentos ag
    JOIN consulta_status cs ON cs.id = ag.status_consulta_id
    JOIN pessoas pr ON pr.id = ag.profissional_id
    JOIN pessoas pac ON pac.id = ag.paciente_id
   WHERE ag.paciente_id = v_pac AND ag.ativo
     AND cs.codigo NOT IN ('cancelado', 'erro')
     AND ag.created_at > m.created_at
     AND ag.reserva_id IS DISTINCT FROM b.id
   ORDER BY ag.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_ini := b.inicio AT TIME ZONE 'UTC';
  UPDATE agenda_bloqueios SET ativo = false, deleted_at = now(), encerrada_em = now(), encerramento = 'liberada', updated_at = now()
   WHERE id = b.id;
  UPDATE ju_reserva_agenda SET liberada_em = now(), liberada_motivo = 'ja_agendado' WHERE bloqueio_id = b.id;
  PERFORM fn_ju_reserva_agenda_limpar(b.id);
  BEGIN
    PERFORM fn_le_vaga_abrir(NULL, b.profissional_id, v_ini, fn_lista_espera_tipo_servico(m.tipo_servico_id), NULL);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'fn_ju_reserva_liberar_se_ja_agendado vaga: %', SQLERRM;
  END;

  v_txt := '↩️ *Reserva liberada*' || E'\n' || a.crianca || ' · ' || fn_ju_quando(v_ini) || ' com a '
        || (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = b.profissional_id) || E'\n'
        || 'Já tem consulta marcada para ' || fn_ju_quando(a.data_hora AT TIME ZONE 'UTC') || ' com a ' || a.prof
        || ', então não criei outra. O horário da reserva voltou para a agenda.';

  IF p_avisar THEN
    v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
    IF v_tok IS NOT NULL THEN
      PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
        body := jsonb_build_object('number', GRUPO, 'text', v_txt),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
    END IF;
  END IF;
  RETURN v_txt;
END $function$;

REVOKE ALL ON FUNCTION public.fn_ju_reserva_liberar_se_ja_agendado(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Pontos de chamada (patch cirúrgico; falha se o trecho original não existir)
DO $$
DECLARE d text; n text;
BEGIN
  -- 1) avisar: antes de montar o card de agendar
  d := pg_get_functiondef('public.fn_ju_reserva_agenda_avisar(uuid)'::regprocedure);
  n := replace(d, '  v_tem_cadastro := b.paciente_id IS NOT NULL;',
    '  v_tem_cadastro := b.paciente_id IS NOT NULL;
  IF v_tem_cadastro AND public.fn_ju_reserva_liberar_se_ja_agendado(b.id) IS NOT NULL THEN RETURN NULL; END IF;');
  IF n = d THEN RAISE EXCEPTION 'avisar: trecho não encontrado'; END IF;
  EXECUTE n;

  -- 2) decidir: toque em ✅ Agendar
  d := pg_get_functiondef('public.fn_ju_reserva_agenda_decidir(uuid,boolean,text)'::regprocedure);
  n := replace(d, '  IF m.tipo_servico_id IS NULL THEN',
    '  v_ja := public.fn_ju_reserva_liberar_se_ja_agendado(b.id, v_pac, false);
  IF v_ja IS NOT NULL THEN
    UPDATE public.ju_reserva_agenda SET decidida_por = v_quem, decidida_em = now() WHERE bloqueio_id = b.id;
    RETURN jsonb_build_object(''ok'', true, ''aceita'', false, ''status'', ''ja_agendado'', ''msg_id'', v_msg, ''texto'', v_ja);
  END IF;
  IF m.tipo_servico_id IS NULL THEN');
  n := replace(n, 'v_id uuid; v_quando text; erro text;', 'v_id uuid; v_quando text; erro text; v_ja text;');
  IF n = d OR strpos(n, 'v_ja text;') = 0 OR strpos(n, 'liberar_se_ja_agendado') = 0 THEN
    RAISE EXCEPTION 'decidir: trecho não encontrado';
  END IF;
  EXECUTE n;

  -- 3) tick: cards já enviados
  d := pg_get_functiondef('public.fn_ju_reservas_tick()'::regprocedure);
  n := replace(d, '            FOR UPDATE OF b SKIP LOCKED LOOP
    IF x.pac_atual IS NULL THEN',
    '            FOR UPDATE OF b SKIP LOCKED LOOP
    IF x.pac_atual IS NOT NULL AND public.fn_ju_reserva_liberar_se_ja_agendado(x.bloqueio_id) IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF x.pac_atual IS NULL THEN');
  IF n = d THEN RAISE EXCEPTION 'tick: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;
