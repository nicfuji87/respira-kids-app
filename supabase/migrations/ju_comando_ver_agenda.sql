-- 01/11/2026 (caso Beatriz): "@ju abrir a agenda do dia 16 de novembro" queria VER a agenda, mas virou
-- "desbloquear" ("Não achei bloqueio…"). Agora:
-- - ação ver_agenda: mostra consultas e bloqueios do dia (ou até 7 dias);
-- - abrir_agenda sem bloqueio para desfazer, na conversa da própria profissional, mostra a agenda.
-- Privacidade: o @ju responde na própria conversa. A agenda só aparece na conversa de uma profissional
-- da equipe e só a dela (nunca em conversa de família, que veria nomes de outros pacientes).

CREATE OR REPLACE FUNCTION public.fn_ju_agenda_texto(p_r jsonb, p_dono text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO '' AS $f$
DECLARE d date; v_txt text := ''; v_dia text; v_lin text;
  dias text[] := ARRAY['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
BEGIN
  FOR d IN SELECT generate_series((p_r ->> 'de')::date, (p_r ->> 'ate')::date, interval '1 day')::date LOOP
    SELECT string_agg((c ->> 'hora') || ' · ' || split_part(c ->> 'paciente', ' ', 1)
                      || coalesce(' ' || nullif(split_part(c ->> 'paciente', ' ', 2), ''), '')
                      || ' (' || regexp_replace(coalesce(c ->> 'servico', ''), '\s*-\s*(DU|FDS)$', '') || ')'
                      || CASE WHEN c ->> 'status' NOT IN ('agendado', 'confirmado') THEN ' [' || (c ->> 'status') || ']' ELSE '' END,
                      E'\n' ORDER BY c ->> 'hora')
      INTO v_lin
      FROM jsonb_array_elements(coalesce(p_r -> 'consultas', '[]'::jsonb)) c
     WHERE c ->> 'dia' = to_char(d, 'YYYY-MM-DD');
    SELECT coalesce(v_lin || E'\n', '') || coalesce(string_agg('🔒 ' || CASE WHEN (b ->> 'dia_inteiro')::boolean THEN 'dia todo'
                                                                     ELSE split_part(b ->> 'de', ' ', 2) || '–' || split_part(b ->> 'ate', ' ', 2) END
                                                               || coalesce(' ' || nullif(b ->> 'titulo', ''), ''), E'\n'), '')
      INTO v_lin
      FROM jsonb_array_elements(coalesce(p_r -> 'bloqueios', '[]'::jsonb)) b
     WHERE to_date(split_part(b ->> 'de', ' ', 1) || '/' || extract(year FROM d)::int, 'DD/MM/YYYY') <= d
       AND to_date(split_part(b ->> 'ate', ' ', 1) || '/' || extract(year FROM d)::int, 'DD/MM/YYYY') >= d;
    v_dia := '*' || dias[extract(dow FROM d)::int + 1] || ' ' || to_char(d, 'DD/MM') || '*';
    v_txt := v_txt || CASE WHEN v_txt = '' THEN '' ELSE E'\n\n' END || v_dia || E'\n'
             || coalesce(nullif(btrim(v_lin, E'\n'), ''), 'Nenhuma consulta marcada.');
  END LOOP;
  RETURN 'Sua agenda:' || E'\n\n' || v_txt;
END $f$;

DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_comando_executar(bigint, bigint, jsonb)'::regprocedure);

  -- ver_agenda (antes de fechar/abrir)
  n := replace(d, $a$  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN$a$,
    $a$  IF v_acao = 'ver_agenda' THEN
    v_conv_dono := public.fn_ju_equipe_por_telefone((SELECT telefone FROM public.ju_conversas WHERE id = p_conversa_id)) ->> 'nome';
    IF v_conv_dono IS NULL THEN
      RETURN jsonb_build_object('texto', 'Por aqui eu não mostro agenda, porque a família veria. Confira no app ou no grupo da agenda.', 'status', 'pergunta');
    END IF;
    v_prof := nullif(d ->> 'profissional', '');
    IF v_prof IS NOT NULL AND lower(split_part(public.unaccent(btrim(v_prof)), ' ', 1)) <> lower(split_part(public.unaccent(btrim(v_conv_dono)), ' ', 1)) THEN
      RETURN jsonb_build_object('texto', 'Por aqui eu mostro só a sua agenda. As outras ficam no app ou no grupo da agenda.', 'status', 'pergunta');
    END IF;
    v_r := public.fn_ju_agenda_consultar(v_conv_dono, (d ->> 'data')::date, (d ->> 'data_fim')::date, false);
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui ver a agenda agora.'), 'status', 'pergunta');
    END IF;
    RETURN jsonb_build_object('texto', public.fn_ju_agenda_texto(v_r, v_conv_dono), 'status', 'agenda');
  END IF;

  IF v_acao IN ('fechar_agenda', 'abrir_agenda') THEN$a$);

  -- abrir_agenda sem bloqueio, na conversa da própria profissional: era para ver
  n := replace(n, $a$    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui mexer na agenda agora.'), 'status', 'pergunta');
    END IF;$a$,
    $a$    IF v_acao = 'abrir_agenda'
       AND (NOT coalesce((v_r ->> 'ok')::boolean, false) OR jsonb_array_length(coalesce(v_r -> 'removidos', '[]'::jsonb)) = 0) THEN
      v_conv_dono := public.fn_ju_equipe_por_telefone((SELECT telefone FROM public.ju_conversas WHERE id = p_conversa_id)) ->> 'nome';
      IF v_conv_dono IS NOT NULL
         AND lower(split_part(public.unaccent(btrim(v_prof)), ' ', 1)) = lower(split_part(public.unaccent(btrim(v_conv_dono)), ' ', 1)) THEN
        v_r := public.fn_ju_agenda_consultar(v_conv_dono, (d ->> 'data')::date, (d ->> 'data_fim')::date, false);
        IF coalesce((v_r ->> 'ok')::boolean, false) THEN
          RETURN jsonb_build_object('texto', 'Não tinha bloqueio para abrir, então te mostro como está. ' || public.fn_ju_agenda_texto(v_r, v_conv_dono), 'status', 'agenda');
        END IF;
      END IF;
    END IF;
    IF NOT coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object('texto', coalesce(v_r ->> 'erro', 'Não consegui mexer na agenda agora.'), 'status', 'pergunta');
    END IF;$a$);

  n := replace(n, $a$v_periodo text; v_dono text;$a$, $a$v_periodo text; v_dono text; v_conv_dono text;$a$);

  IF n NOT LIKE '%v_acao = ''ver_agenda''%' OR n NOT LIKE '%Não tinha bloqueio para abrir%' OR n NOT LIKE '%v_conv_dono text;%' THEN
    RAISE EXCEPTION 'fn_ju_comando_executar: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;
