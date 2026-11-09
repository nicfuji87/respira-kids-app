-- 09/11/2026 (conversa do dono com a Lolô):
-- 1) Caso Pedro: a Lolô ofereceu 11h para trocar a sessão das 14h ("preciso encaixar um bebê"); a mãe aceitou e a
--    Ju CRIOU uma sessão nova às 11h, deixando a criança marcada 2x. Agora, quando a escolha substitui uma consulta
--    que a criança já tem (a IA indica qual, ou é no mesmo dia e do mesmo tipo), a Ju REMARCA essa consulta
--    (fn_ju_comando_remarcar) em vez de criar outra.
-- 2) A Ju tem cadastro próprio: o que ela marca aparece como "agendado por Ju", não pela Lolô.

-- Cadastro da Ju (sem login, sem telefone, sem role: não entra em listas da equipe nem pode entrar no app).
INSERT INTO public.pessoas (id, id_tipo_pessoa, nome, ativo, is_approved, profile_complete)
SELECT '7a1e0000-0000-4000-8000-000000000001', 'fd1dea0e-7d48-4145-9a58-acfc6a2b4620', 'Ju (assistente virtual)', true, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.pessoas WHERE id = '7a1e0000-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION public.fn_ju_pessoa_id()
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '7a1e0000-0000-4000-8000-000000000001'::uuid $$;

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  -- fn_ju_agendar: agendado_por = Ju.
  v_def := pg_get_functiondef('public.fn_ju_agendar(bigint,bigint,uuid,date,text,uuid,uuid)'::regprocedure);
  v_new := replace(v_def, $s$v_valor, 'df8ed2ab-867d-47b3-97a2-b05891fae798', v_emp,$s$, $s$v_valor, public.fn_ju_pessoa_id(), v_emp,$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_agendar: agendado_por não encontrado'; END IF;
  EXECUTE v_new;

  -- fn_ju_escolha_dados: consultas já marcadas de cada criança (para a IA saber se é troca).
  v_def := pg_get_functiondef('public.fn_ju_escolha_dados(bigint)'::regprocedure);
  v_new := replace(v_def, $s$    'fisios', (SELECT$s$, $s$    'consultas_marcadas', (SELECT coalesce(jsonb_agg(
                    split_part(btrim(pac.nome), ' ', 1) || ': ' || to_char(a.data_hora AT TIME ZONE 'UTC', 'TMDy DD/MM HH24:MI')
                    || ' com ' || split_part(btrim(pr.nome), ' ', 1) || ' (' || regexp_replace(ts.nome, '\s+', ' ', 'g') || ')'
                    ORDER BY a.data_hora), '[]'::jsonb)
                 FROM e, jsonb_array_elements(coalesce(fn_ju_contexto_cliente(e.conversa_id) -> 'pacientes', '[]'::jsonb)) x
                 JOIN agendamentos a ON a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
                 JOIN consulta_status cs ON cs.id = a.status_consulta_id AND cs.codigo IN ('agendado', 'confirmado')
                 JOIN pessoas pac ON pac.id = a.paciente_id
                 JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
                 LEFT JOIN pessoas pr ON pr.id = a.profissional_id
                WHERE (x ->> 'acesso_agenda')::boolean
                  AND (a.data_hora AT TIME ZONE 'UTC') > (now() AT TIME ZONE 'America/Sao_Paulo') - interval '2 hours'
                  AND (a.data_hora AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'America/Sao_Paulo') + interval '30 days'),
    'fisios', (SELECT$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_escolha_dados: fisios não encontrado'; END IF;
  EXECUTE v_new;

  -- fn_ju_escolha_aplicar: troca em vez de consulta nova.
  v_def := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure);
  v_new := replace(v_def, $s$v_quando_txt text; v_tipo_txt text;$s$, $s$v_quando_txt text; v_tipo_txt text;
  v_sub uuid; v_sub_quando timestamp; v_rem jsonb;$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_escolha_aplicar: DECLARE não encontrado'; END IF;
  v_def := v_new;
  v_new := replace(v_def, $s$  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)
  VALUES (c.id, e.mensagem_id, 'Escolha de horário da família (oferta da equipe) #' || e.id, 'executando')$s$,
  $s$  -- Troca: a IA diz qual consulta a oferta substitui; senão, consulta do mesmo tipo no mesmo dia = troca.
  BEGIN
    v_sub_quando := ((r -> 'substitui' ->> 'data')::date + (r -> 'substitui' ->> 'hora')::time);
  EXCEPTION WHEN others THEN v_sub_quando := NULL;
  END;
  IF v_sub_quando IS NOT NULL THEN
    SELECT a.id INTO v_sub FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo IN ('agendado', 'confirmado')
       AND (a.data_hora AT TIME ZONE 'UTC') = v_sub_quando
     LIMIT 1;
  END IF;
  IF v_sub IS NULL THEN
    SELECT a.id INTO v_sub FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.paciente_id = v_pac AND a.ativo AND cs.codigo IN ('agendado', 'confirmado')
       AND (a.data_hora AT TIME ZONE 'UTC')::date = v_data
       AND (a.data_hora AT TIME ZONE 'UTC') > v_agora
       AND fn_lista_espera_tipo_servico(a.tipo_servico_id) IS NOT DISTINCT FROM v_tipo
     ORDER BY a.data_hora LIMIT 1;
  END IF;
  IF v_sub IS NOT NULL THEN
    SELECT a.data_hora AT TIME ZONE 'UTC' INTO v_sub_quando FROM agendamentos a WHERE a.id = v_sub;
    v_rem := fn_ju_comando_remarcar(c.id, 'Ju (a família aceitou o horário que a equipe ofereceu)',
               jsonb_build_object('agendamento_ids', jsonb_build_array(v_sub), 'data', v_data,
                                  'hora', to_char(v_hora, 'HH24:MI'), 'profissional_id', v_prof));
    IF v_rem ->> 'status' = 'agendado' THEN
      UPDATE ju_escolhas_horario SET status = 'agendado', agendamento_id = v_sub,
             resultado = v_rem || jsonb_build_object('troca', true) WHERE id = p_id;
      PERFORM fn_le_card('🔁 *Remarcado pela Ju*' || E'\n' || fn_ju_quando(v_sub_quando) || ' → ' || v_quando_txt
        || ' · ' || v_prof_nome || ' · ' || v_tipo_txt || E'\n\n'
        || '*' || v_pac_nome || '*: a família aceitou trocar para o horário que a equipe ofereceu'
        || coalesce(' ("' || left(regexp_replace(nullif(btrim(r ->> 'trecho_escolha'), ''), '\s+', ' ', 'g'), 100) || '")', '')
        || '.', '{}');
      RETURN jsonb_build_object('ok', true, 'codigo', 'REMARCADO', 'agendamento_id', v_sub);
    END IF;
    UPDATE ju_escolhas_horario SET status = 'avisado', resultado = v_rem || jsonb_build_object('troca', true) WHERE id = p_id;
    PERFORM fn_ju_escolha_aviso(c.id, '*' || v_pac_nome || '*: a família aceitou trocar a consulta de ' || fn_ju_quando(v_sub_quando)
      || ' para ' || v_quando_txt || ' com a ' || v_prof_nome || ', mas não consegui remarcar ('
      || coalesce(v_rem ->> 'texto', 'erro') || '). Confira e remarque.');
    RETURN jsonb_build_object('ok', false, 'motivo', 'troca_nao_feita');
  END IF;

  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)
  VALUES (c.id, e.mensagem_id, 'Escolha de horário da família (oferta da equipe) #' || e.id, 'executando')$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_ju_escolha_aplicar: INSERT ju_comandos não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_ju_pessoa_id() FROM PUBLIC, anon;
