-- =====================================================================
-- Testes da base do painel (rodar depois de atribuicao_v2_painel.sql, na
-- mesma transação; termina sempre em RAISE EXCEPTION = nada fica gravado).
-- 1) rateio em centavos fecha a fatura exatamente (fictício + toda a base real)
-- 2) acesso: secretaria/profissional pela API veem zero linhas e as RPCs
--    recusam; admin vê; anon nem tem permissão.
-- =====================================================================
DO $painel$
DECLARE
  ok text[] := '{}'; falhas text[] := '{}';
  v_resp uuid; v_pac uuid; f1 uuid; f2 uuid; v int; v_txt text; v_num numeric;
  u_sec uuid; u_prof uuid; u_adm uuid; v_view text; v_op bigint;
  emp uuid := (SELECT empresa_id FROM public.faturas WHERE empresa_id IS NOT NULL LIMIT 1);
  prof uuid := (SELECT profissional_id FROM public.agendamentos WHERE ativo LIMIT 1);
  serv uuid := (SELECT tipo_servico_id FROM public.agendamentos WHERE ativo LIMIT 1);
  empf uuid := (SELECT empresa_fatura FROM public.agendamentos WHERE ativo LIMIT 1);
  st_fin uuid := (SELECT id FROM public.consulta_status WHERE codigo = 'finalizado');
  st_pago uuid := (SELECT id FROM public.pagamento_status WHERE codigo = 'pago');
BEGIN
  ---------------------------------------------------------------- 1) centavos
  INSERT INTO public.pessoas (id_tipo_pessoa, nome, ativo) VALUES ((SELECT id FROM public.pessoa_tipos WHERE codigo = 'responsavel'), '[TESTE painel] resp', true) RETURNING id INTO v_resp;
  INSERT INTO public.pessoas (id_tipo_pessoa, nome, ativo) VALUES ((SELECT id FROM public.pessoa_tipos WHERE codigo = 'paciente'), '[TESTE painel] criança', true) RETURNING id INTO v_pac;
  -- R$ 100,00 em 3 sessões iguais → 33,34 + 33,33 + 33,33
  INSERT INTO public.faturas (id_asaas, empresa_id, responsavel_cobranca_id, paciente_id, valor_total, valor_servico, status, pago_em, ativo)
  VALUES ('teste-painel-1', emp, v_resp, v_pac, 100, 100, 'pago', now(), true) RETURNING id INTO f1;
  -- R$ 500,00 em sessões de 260, 260 e 180 (desconto) → rateio proporcional
  INSERT INTO public.faturas (id_asaas, empresa_id, responsavel_cobranca_id, paciente_id, valor_total, valor_servico, status, pago_em, ativo)
  VALUES ('teste-painel-2', emp, v_resp, v_pac, 500, 500, 'pago', now(), true) RETURNING id INTO f2;
  INSERT INTO public.agendamentos (data_hora, paciente_id, profissional_id, tipo_servico_id, status_consulta_id, status_pagamento_id,
                                   agendado_por, empresa_fatura, valor_servico, fatura_id, ativo)
  SELECT date_trunc('day', now()) - (g || ' days')::interval + interval '3 hours', v_pac, prof, serv, st_fin, st_pago, prof, empf, x.valor, x.fat, true
    FROM (VALUES (1, 50::numeric, f1), (2, 50, f1), (3, 50, f1), (4, 260, f2), (5, 260, f2), (6, 180, f2)) x(g, valor, fat);
  PERFORM public.fn_atrib_atualizar_receita();
  SELECT string_agg(m.receita_recebida::text, '+' ORDER BY m.receita_recebida DESC) || '=' || sum(m.receita_recebida) INTO v_txt
    FROM interno.mv_atrib_receita_sessao m WHERE m.fatura_id = f1;
  IF v_txt = '33.34+33.33+33.33=100.00' THEN ok := array_append(ok, 'R$ 100 em 3: ' || v_txt);
  ELSE falhas := array_append(falhas, 'centavos f1: ' || coalesce(v_txt, 'null')); END IF;
  SELECT sum(m.receita_recebida) INTO v_num FROM interno.mv_atrib_receita_sessao m WHERE m.fatura_id = f2;
  IF v_num = 500 THEN ok := array_append(ok, 'R$ 500 com desconto fecha exato');
  ELSE falhas := array_append(falhas, 'centavos f2: ' || v_num); END IF;

  -- toda fatura paga real cujas sessões estão todas "recebida" fecha no centavo
  SELECT count(*) INTO v FROM (
    SELECT f.id FROM public.faturas f JOIN interno.mv_atrib_receita_sessao m ON m.fatura_id = f.id
     WHERE f.ativo AND f.status = 'pago' AND f.id_asaas NOT LIKE 'teste-painel%'
     GROUP BY f.id, f.valor_servico, f.valor_total
    HAVING bool_and(m.situacao = 'recebida')
       AND sum(m.receita_recebida) <> round(coalesce(f.valor_servico, f.valor_total, 0), 2)) z;
  SELECT count(*) INTO v_num FROM public.faturas f WHERE f.ativo AND f.status = 'pago';
  IF v = 0 THEN ok := array_append(ok, format('todas as %s faturas pagas reais fecham no centavo', v_num));
  ELSE falhas := array_append(falhas, v || ' faturas reais não fecham'); END IF;
  SELECT string_agg(to_char(z.mes, 'MM/YY') || ' ' || (z.valor - z.rateada), ', ' ORDER BY z.mes) INTO v_txt FROM (
    SELECT date_trunc('month', f.pago_em)::date mes, sum(coalesce(f.valor_servico, f.valor_total)) valor,
           sum((SELECT coalesce(sum(m.receita_recebida), 0) FROM interno.mv_atrib_receita_sessao m WHERE m.fatura_id = f.id)) rateada
      FROM public.faturas f WHERE f.ativo AND f.status = 'pago' AND f.pago_em >= '2026-07-01' AND f.pago_em < '2026-10-01' GROUP BY 1) z;
  IF v_txt = '07/26 0.00, 08/26 0.00, 09/26 0.00' THEN ok := array_append(ok, 'jul–set: diferença ' || v_txt);
  ELSE falhas := array_append(falhas, 'jul–set: ' || coalesce(v_txt, 'null')); END IF;

  ---------------------------------------------------------------- 2) acesso
  SELECT p.auth_user_id INTO u_sec FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
   WHERE p.ativo AND t.codigo = 'secretaria' AND p.auth_user_id IS NOT NULL AND p.role IS DISTINCT FROM 'admin' LIMIT 1;
  SELECT p.auth_user_id INTO u_prof FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
   WHERE p.ativo AND t.codigo = 'profissional' AND p.auth_user_id IS NOT NULL AND p.role IS DISTINCT FROM 'admin' LIMIT 1;
  SELECT p.auth_user_id INTO u_adm FROM public.pessoas p
   WHERE p.ativo AND p.role = 'admin' AND p.is_approved AND NOT p.bloqueado AND p.auth_user_id IS NOT NULL LIMIT 1;
  SELECT min(id) INTO v_op FROM public.atrib_oportunidades;

  -- secretaria e profissional: zero linhas em tudo, RPCs recusam
  FOR v_txt IN SELECT unnest(ARRAY[u_sec::text, u_prof::text]) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_txt, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    FOREACH v_view IN ARRAY ARRAY['vw_atrib_receita_sessao','vw_atrib_aquisicoes','vw_atrib_oportunidades','vw_atrib_oportunidades_painel',
                                  'vw_atrib_oportunidade_pacientes','vw_atrib_funil_mensal','vw_atrib_campanhas_mensal',
                                  'vw_atrib_cobertura_mensal','vw_atrib_custos_status','atrib_oportunidades','atrib_toques',
                                  'atrib_eventos','atrib_custos_diarios','atrib_custos_importacoes'] LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v;
      IF v > 0 THEN falhas := array_append(falhas, format('não-admin vê %s linhas em %s', v, v_view)); END IF;
    END LOOP;
    BEGIN
      PERFORM public.fn_atrib_painel_qualidade();
      falhas := array_append(falhas, 'não-admin chamou fn_atrib_painel_qualidade');
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.fn_atrib_jornada(v_op);
      falhas := array_append(falhas, 'não-admin chamou fn_atrib_jornada');
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET role;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM unnest(falhas) f WHERE f LIKE 'não-admin%') AND u_sec IS NOT NULL AND u_prof IS NOT NULL THEN
    ok := array_append(ok, 'secretaria e profissional: zero linhas em 14 visões/tabelas e RPCs recusadas');
  END IF;

  -- admin enxerga
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v FROM public.vw_atrib_oportunidades_painel;
  v_txt := (public.fn_atrib_painel_qualidade()->>'gerado_em');
  v_num := jsonb_array_length(public.fn_atrib_jornada(v_op)->'eventos');
  RESET role;
  IF v > 0 AND v_txt IS NOT NULL AND v_num > 0 THEN ok := array_append(ok, format('admin vê %s oportunidades, qualidade e jornada', v));
  ELSE falhas := array_append(falhas, format('admin: oportunidades=%s qualidade=%s eventos=%s', v, v_txt, v_num)); END IF;

  -- anon: nem permissão
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
  BEGIN
    SELECT count(*) INTO v FROM public.vw_atrib_aquisicoes;
    falhas := array_append(falhas, 'anon leu vw_atrib_aquisicoes');
  EXCEPTION WHEN insufficient_privilege THEN ok := array_append(ok, 'anon sem permissão nas visões');
  END;
  RESET role;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION E'RESULTADO % OK, % FALHA(S)\nOK: %\nFALHAS: %',
    coalesce(array_length(ok, 1), 0), coalesce(array_length(falhas, 1), 0),
    array_to_string(ok, ' | '), coalesce(array_to_string(falhas, E'\n'), '-');
END
$painel$;
