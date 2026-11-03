-- AI dev note: reserva da Ju com confirmação (03/11/2026, caso Tayane: reservou hoje às 13h às 9h16,
-- mandou link + contrato numa mensagem só, a mãe sumiu e o horário ficou preso até depois das 13h).
--
-- 1. Reserva curta (horário a até 24 h de quando foi feita) sem resposta da família e sem cadastro cai
--    sozinha em 1 h ou 2 h antes do horário (o que vier antes). Aviso ↩️ no 🔔 e o horário volta para a
--    agenda (abre vaga da lista de espera, se alguém combina).
-- 2. A Ju confirma a reserva e pergunta o nome (ou se conseguem vir); o link vai na resposta seguinte;
--    contrato/Assinafy só depois que a família termina o cadastro.
-- 3. Lembrete 2 h antes quando ainda não há cadastro: "Te esperamos hoje às 13h com a Beatriz...".
-- 4. Reserva cujo horário passou sem consulta é encerrada como 'nao_compareceu' (aviso 🚫 no 🔔).
-- Roda dentro de fn_ju_reservas_tick (cron ju-reservas-tick, a cada 5 min).

ALTER TABLE public.ju_reserva_agenda
  ADD COLUMN IF NOT EXISTS lembrete_em timestamptz,
  ADD COLUMN IF NOT EXISTS lembrete_req_id bigint,
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberada_motivo text;

ALTER TABLE public.agenda_bloqueios DROP CONSTRAINT IF EXISTS chk_reserva_encerramento;
ALTER TABLE public.agenda_bloqueios ADD CONSTRAINT chk_reserva_encerramento
  CHECK (encerramento IS NULL OR encerramento = ANY (ARRAY['confirmada', 'vencida', 'liberada', 'nao_compareceu']));

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_vigiar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  x record; v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; v_ini timestamp; v_criada timestamp;
  v_resp boolean; v_curta boolean; v_prof text; v_quem text; v_txt text; v_tok text; c ju_conversas;
  v_lib int := 0; v_fim int := 0; v_lem int := 0;
BEGIN
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  FOR x IN SELECT m.*, b.inicio, b.profissional_id, b.paciente_id, b.observacao
             FROM ju_reserva_agenda m JOIN agenda_bloqueios b ON b.id = m.bloqueio_id
            WHERE b.ativo AND b.deleted_at IS NULL AND b.motivo = 'reserva' AND m.agendamento_id IS NULL
              AND m.solicitante = 'Ju (WhatsApp)'
              AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.reserva_id = b.id AND a.ativo)
            FOR UPDATE OF b SKIP LOCKED LOOP
    v_ini := x.inicio AT TIME ZONE 'UTC';
    v_criada := x.created_at AT TIME ZONE 'America/Sao_Paulo';
    v_curta := v_ini - v_criada <= interval '24 hours';
    v_resp := EXISTS (SELECT 1 FROM ju_mensagens mm WHERE mm.conversa_id = x.conversa_id AND mm.origem = 'CLIENTE'
                        AND mm.created_at > x.created_at);
    SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = x.profissional_id;
    v_quem := coalesce((SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = x.paciente_id), nullif(btrim(x.observacao), ''), 'a família');

    -- 4. o horário passou e ninguém criou a consulta
    IF v_ini + interval '15 minutes' < v_agora THEN
      UPDATE agenda_bloqueios SET ativo = false, deleted_at = now(), encerrada_em = now(), encerramento = 'nao_compareceu', updated_at = now()
       WHERE id = x.bloqueio_id;
      UPDATE ju_reserva_agenda SET liberada_em = now(), liberada_motivo = 'horario_passou' WHERE bloqueio_id = x.bloqueio_id;
      PERFORM fn_ju_reserva_agenda_limpar(x.bloqueio_id);
      v_txt := '🚫 *Reserva sem consulta*' || E'\n' || v_quem || ' · ' || fn_ju_quando(v_ini) || ' com a ' || v_prof || E'\n'
            || CASE WHEN x.paciente_id IS NULL THEN 'Não fez o cadastro e ninguém criou a consulta.' ELSE 'Ninguém criou a consulta.' END
            || ' A reserva saiu da agenda. Se a família veio, crie a consulta pelo app.';
      v_fim := v_fim + 1;
    -- 1. reserva curta sem resposta e sem cadastro: libera
    ELSIF v_curta AND NOT v_resp AND x.paciente_id IS NULL
          AND v_agora >= least(v_criada + interval '60 minutes', v_ini - interval '2 hours') THEN
      UPDATE agenda_bloqueios SET ativo = false, deleted_at = now(), encerrada_em = now(), encerramento = 'liberada', updated_at = now()
       WHERE id = x.bloqueio_id;
      UPDATE ju_reserva_agenda SET liberada_em = now(), liberada_motivo = 'sem_resposta' WHERE bloqueio_id = x.bloqueio_id;
      PERFORM fn_ju_reserva_agenda_limpar(x.bloqueio_id);
      v_txt := '↩️ *Reserva liberada*' || E'\n' || v_quem || ' · ' || fn_ju_quando(v_ini) || ' com a ' || v_prof || E'\n'
            || 'A família não respondeu depois da reserva e não fez o cadastro. O horário voltou para a agenda.';
      BEGIN
        PERFORM fn_le_vaga_abrir(NULL, x.profissional_id, v_ini, fn_lista_espera_tipo_servico(x.tipo_servico_id), NULL);
      EXCEPTION WHEN OTHERS THEN RAISE WARNING 'fn_ju_reserva_vigiar vaga: %', SQLERRM;
      END;
      v_lib := v_lib + 1;
    -- 3. lembrete 2 h antes, ainda sem cadastro
    ELSIF x.paciente_id IS NULL AND x.lembrete_em IS NULL AND x.conversa_id IS NOT NULL
          AND v_agora >= v_ini - interval '2 hours' AND v_agora < v_ini - interval '30 minutes'
          AND v_ini - v_criada > interval '2 hours 15 minutes' THEN
      v_txt := NULL;
      SELECT * INTO c FROM ju_conversas WHERE id = x.conversa_id;
      IF c.id IS NOT NULL AND NOT c.sem_ia AND v_tok IS NOT NULL
         AND coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz) < now() - interval '15 minutes' THEN
        v_txt := 'Te esperamos ' || fn_le_quando(v_ini) || ' com a ' || v_prof || '. Conseguiu fazer o cadastro? '
              || 'Se tiver dificuldade, me manda o nome completo e a data de nascimento da criança que a equipe adianta.';
        UPDATE ju_conversas
           SET resposta_pendente = concat_ws(E'\x1f', CASE WHEN resposta_pendente_em > now() - interval '5 minutes' THEN resposta_pendente END, v_txt),
               resposta_pendente_em = now()
         WHERE id = c.id;
        UPDATE ju_reserva_agenda SET lembrete_em = now(),
               lembrete_req_id = net.http_post(url := 'https://infuse.uazapi.com/send/text',
                 body := jsonb_build_object('number', c.wa_chatid, 'text', '*Ju:*' || E'\n' || v_txt),
                 headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
                 timeout_milliseconds := 20000)
         WHERE bloqueio_id = x.bloqueio_id;
        v_lem := v_lem + 1;
      ELSE
        UPDATE ju_reserva_agenda SET lembrete_em = now() WHERE bloqueio_id = x.bloqueio_id; -- não tenta de novo
      END IF;
      v_txt := NULL; -- o lembrete não vai para o grupo
    ELSE
      v_txt := NULL;
    END IF;

    IF v_txt IS NOT NULL AND v_tok IS NOT NULL THEN
      PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',
        body := jsonb_build_object('number', GRUPO, 'text', v_txt),
        headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('liberadas', v_lib, 'encerradas', v_fim, 'lembretes', v_lem);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ju_reserva_vigiar() FROM anon, authenticated, public;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_reservas_tick'::regproc);
  IF position($a$RETURN jsonb_build_object('cards', v_cards, 'avisos', v_avisos);$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_reservas_tick: trecho não encontrado';
  END IF;
  d := replace(d, $a$RETURN jsonb_build_object('cards', v_cards, 'avisos', v_avisos);$a$,
    $a$RETURN jsonb_build_object('cards', v_cards, 'avisos', v_avisos, 'vigia', public.fn_ju_reserva_vigiar());$a$);
  EXECUTE d;

  -- 2. a reserva da Ju confirma e pergunta; o link vai depois; sem contrato nessa hora
  d := pg_get_functiondef('public.fn_ju_reservar_horario'::regproc);
  IF position($a$v_quando text; v_rotulo text;$a$ IN d) = 0
     OR position($a$'Reservado: ' || v_quando || ', ' || v_rotulo || ', para '$a$ IN d) = 0
     OR position($a$'resposta', 'Reservado: ' || v_quando || ', ' || v_rotulo || '. Falta o cadastro para a equipe confirmar: '
                    || 'mande agora o link de pré-cadastro (PRE_CADASTRO) e diga que o horário já está reservado e que, com o cadastro pronto, '
                    || 'a equipe confirma e a confirmação chega por aqui. Não diga que está agendado.');$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_reservar_horario: trecho não encontrado';
  END IF;
  d := replace(d, $a$v_quando text; v_rotulo text;$a$, $a$v_quando text; v_rotulo text; v_fisio text;$a$);
  d := replace(d, $a$  v_quando := public.fn_ju_reserva_quando(v_dh);$a$,
    $a$  v_quando := public.fn_ju_reserva_quando(v_dh);
  SELECT split_part(btrim(nome), ' ', 1) INTO v_fisio FROM public.pessoas WHERE id = cfg.profissional_id;$a$);
  d := replace(d, $a$'Reservado: ' || v_quando || ', ' || v_rotulo || ', para '$a$,
    $a$'Reservado: ' || v_quando || ', ' || v_rotulo || ' com a ' || v_fisio || ', para '$a$);
  d := replace(d, $a$'resposta', 'Reservado: ' || v_quando || ', ' || v_rotulo || '. Falta o cadastro para a equipe confirmar: '
                    || 'mande agora o link de pré-cadastro (PRE_CADASTRO) e diga que o horário já está reservado e que, com o cadastro pronto, '
                    || 'a equipe confirma e a confirmação chega por aqui. Não diga que está agendado.');$a$,
    $a$'resposta', 'Reservado: ' || v_quando || ', ' || v_rotulo || ' com a ' || v_fisio || '. Responda numa mensagem curta: '
                    || 'o valor, se a família perguntou (só o da ' || v_fisio || '), que o horário está reservado com a ' || v_fisio
                    || ' e uma pergunta que a família precise responder para segurar o horário: o nome da criança, se ainda não disse; '
                    || 'se já disse, se conseguem vir. Algo como "me responde por aqui para eu segurar o horário". '
                    || 'Não mande o link de cadastro agora e não fale de contrato. Quando a família responder, mande o link de pré-cadastro '
                    || '(PRE_CADASTRO) numa mensagem curta. Não diga que está agendado.');$a$);
  EXECUTE d;
END $do$;

-- contrato/Assinafy só quando a família termina o cadastro (não junto com o link)
UPDATE public.ju_conhecimento
   SET texto = replace(texto,
         'Sempre que mandar o link de cadastro, a Ju avisa isso em uma frase curta, para a família não estranhar a mensagem de um número desconhecido.',
         'A Ju não fala do contrato junto com o link (a mensagem fica pesada). Quando a família disser que terminou o cadastro, a Ju avisa em uma frase curta que o contrato chega agora pela Assinafy, de um número próprio dela, para a família não estranhar.'),
       updated_at = now()
 WHERE id = 'PRE_CADASTRO'
   AND texto LIKE '%Sempre que mandar o link de cadastro, a Ju avisa isso em uma frase curta%';
