-- 29/10/2026 (ok do dono):
-- 1) O bloqueio que a Ju criou para "@ju reservar ... 16h às 17h de amanhã da Beatriz" vira reserva
--    (compromisso categoria 'reserva', ver reserva_agenda.sql), em nome da Isadora Mesquita.
UPDATE public.agenda_bloqueios
   SET motivo = 'reserva',
       observacao = 'Isadora Mesquita (WhatsApp)',
       expira_em = ((inicio AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC',
       updated_at = now()
 WHERE id = '41252808-06f5-44c9-9060-a6ea2ad60ade' AND motivo = 'outro' AND ativo AND deleted_at IS NULL;

-- 2) A Ju não envia se a Lolô respondeu depois da última mensagem da família (vale também quando a Ju
--    acabou de abrir o pedido no mesmo turno — era por aí que ela atropelava a Lolô: Clara, Isadora, Michelle).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_responder(bigint, bigint, text, text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%LOLO_RESPONDEU%' THEN RETURN; END IF;
  n := replace(d, $a$IF NOT v_pode THEN
    RETURN jsonb_build_object('pode', false, 'motivo', c.status);
  END IF;$a$,
$a$IF NOT v_pode THEN
    RETURN jsonb_build_object('pode', false, 'motivo', c.status);
  END IF;
  -- a Lolô falou depois da última mensagem da família: a Ju não fala por cima (29/10/2026).
  IF p_modo = 'RESPONDER' AND EXISTS (
       SELECT 1 FROM public.ju_mensagens m WHERE m.conversa_id = c.id AND m.origem = 'HUMANO'
          AND m.created_at > (SELECT max(x.created_at) FROM public.ju_mensagens x WHERE x.conversa_id = c.id AND x.origem = 'CLIENTE')) THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'LOLO_RESPONDEU');
  END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- 3) "@ju reservar": cria o compromisso de reserva (não um bloqueio).
CREATE OR REPLACE FUNCTION public.fn_ju_agenda_reservar(p_profissional text, p_data date, p_hora_inicio time, p_hora_fim time DEFAULT NULL,
                                                       p_observacao text DEFAULT NULL, p_paciente_id uuid DEFAULT NULL, p_solicitante text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_prof jsonb; v_hf time := coalesce(p_hora_fim, p_hora_inicio + interval '1 hour'); v_b public.agenda_bloqueios; v_obs text;
BEGIN
  IF p_data IS NULL OR p_hora_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Qual dia e horário da reserva?');
  END IF;
  IF v_hf <= p_hora_inicio THEN RETURN jsonb_build_object('ok', false, 'erro', 'O horário de fim precisa ser depois do início.'); END IF;
  IF public.fn_ju_eh_clinica(p_profissional) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A reserva é na agenda de uma profissional. De quem é a agenda?');
  END IF;
  v_prof := public.fn_ju_resolver_profissional(p_profissional);
  IF NOT (v_prof ->> 'ok')::boolean THEN RETURN v_prof; END IF;
  v_obs := left(nullif(btrim(coalesce(p_observacao, '')), ''), 200);
  IF v_obs IS NULL AND p_paciente_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Para quem é a reserva?');
  END IF;
  BEGIN
    INSERT INTO public.agenda_bloqueios (profissional_id, inicio, fim, dia_inteiro, motivo, observacao, paciente_id)
    VALUES ((v_prof ->> 'id')::uuid, (p_data + p_hora_inicio) AT TIME ZONE 'UTC', (p_data + v_hf) AT TIME ZONE 'UTC', false,
            'reserva', coalesce(v_obs, 'pela @ju'), p_paciente_id)
    RETURNING * INTO v_b;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
  END;
  RETURN jsonb_build_object('ok', true, 'id', v_b.id, 'profissional', v_prof ->> 'nome', 'titulo', v_b.titulo,
                            'de', to_char(p_data, 'DD/MM'), 'hora_inicio', to_char(p_hora_inicio, 'HH24:MI'), 'hora_fim', to_char(v_hf, 'HH24:MI'),
                            'vence', CASE WHEN v_b.expira_em IS NOT NULL THEN to_char((v_b.expira_em AT TIME ZONE 'UTC') - interval '1 minute', 'DD/MM') END);
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_agenda_reservar(text, date, time, time, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_agenda_reservar(text, date, time, time, text, uuid, text) TO service_role;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_executar(bigint, bigint, jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%reservar_agenda%' THEN RETURN; END IF;
  n := replace(d, $a$  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN$a$,
$a$  IF v_acao = 'reservar_agenda' THEN
    v_prof := coalesce(nullif(d ->> 'profissional', ''),
                       (SELECT btrim(nome) FROM public.pessoas WHERE id::text = d ->> 'profissional_id'));
    IF v_prof IS NULL THEN
      RETURN jsonb_build_object('texto', 'Reservo na agenda de qual profissional?', 'status', 'pergunta');
    END IF;
    SELECT (x ->> 'paciente_id')::uuid INTO v_pessoa
      FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x
     WHERE x ->> 'paciente_id' = d ->> 'pessoa_id' LIMIT 1;
    v_r := public.fn_ju_agenda_reservar(v_prof, (d ->> 'data')::date, (d ->> 'hora')::time, (d ->> 'hora_fim')::time,
             coalesce(nullif(d ->> 'motivo', ''),
                      nullif((SELECT btrim(nome_whatsapp) FROM public.ju_conversas WHERE id = p_conversa_id), '')),
             v_pessoa, v_quem);
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', 'Não consegui reservar: ' || coalesce(v_r ->> 'erro', 'tente de novo.'), 'status', 'pergunta');
    END IF;
    v_dono := CASE WHEN lower(split_part(btrim(v_quem), ' ', 1)) = lower(split_part(btrim(v_r ->> 'profissional'), ' ', 1))
                   THEN 'sua agenda' ELSE 'agenda de ' || split_part(btrim(v_r ->> 'profissional'), ' ', 1) END;
    RETURN jsonb_build_object('status', 'agenda',
      'texto', 'Pronto, reservei a ' || v_dono || ' em ' || (v_r ->> 'de') || ', das ' || (v_r ->> 'hora_inicio') || ' às ' || (v_r ->> 'hora_fim')
               || coalesce(' (' || regexp_replace(v_r ->> 'titulo', '^Reserva: ', '') || ')', '') || '.'
               || CASE WHEN v_r ->> 'vence' IS NOT NULL THEN ' Se não virar consulta até o fim do dia ' || (v_r ->> 'vence') || ', ela sai da agenda.' ELSE '' END);
  END IF;

  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- 4) Aviso de contrato: nome com inicial maiúscula (cadastro às vezes está todo em minúscula).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_aviso_contrato_reservar(text, text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%initcap%' THEN RETURN; END IF;
  n := replace(d, $a$SELECT btrim(x ->> 'nome') AS nome, i,$a$, $a$SELECT initcap(btrim(x ->> 'nome')) AS nome, i,$a$);
  n := replace(n, $a$v_nomes := ARRAY[nullif(split_part(btrim(coalesce(p_paciente_nome, '')), ' ', 1), '')];$a$,
                  $a$v_nomes := ARRAY[nullif(initcap(split_part(btrim(coalesce(p_paciente_nome, '')), ' ', 1)), '')];$a$);
  IF n NOT LIKE '%initcap(btrim(x%' OR n NOT LIKE '%initcap(split_part%' THEN RAISE EXCEPTION 'fn_aviso_contrato_reservar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
