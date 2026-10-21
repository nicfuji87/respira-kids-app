-- =====================================================================
-- Teste da atribuição v2 com dados FICTÍCIOS. Rodar DEPOIS do conteúdo de
-- supabase/migrations/atribuicao_v2_ju.sql, na MESMA transação: o bloco final
-- sempre termina em RAISE EXCEPTION, então nada fica gravado (nem a migração).
-- Telefones fictícios: +55 61 97700-00NN (conferido que não existem).
-- Como rodar sem colar 90 KB: subir migração+teste para public.zz_rascunho_sql
-- (PostgREST com a service role) e executar com
--   DO $x$ BEGIN EXECUTE (SELECT sql FROM public.zz_rascunho_sql WHERE id='teste'); END $x$;
-- Rodar DEPOIS das migrações atribuicao_v2_ju.sql e atribuicao_v2_custos.sql.
-- Resultado de 21/10/2026: fase 1 (27) + custos/coorte (9).
-- =====================================================================

-- Os gatilhos da agenda/pessoas/faturas ficam LIGADOS (este acesso não pode usar
-- o modo réplica). É seguro porque tudo é desfeito no fim: as filas de webhook e
-- os pedidos do pg_net só saem depois do COMMIT, e nenhum gatilho usa HTTP
-- síncrono (conferido em 21/10/2026). Sessões fictícias às 3h da manhã para não
-- colidir com horários reais da agenda.
CREATE FUNCTION pg_temp.rep(p boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END $$;

-- os cenários vão até 58 dias atrás
UPDATE public.atrib_config SET inicio = (now() - interval '400 days')::date WHERE id = 1;

CREATE FUNCTION pg_temp.tel(n int) RETURNS bigint LANGUAGE sql AS $$ SELECT (5561977000000 + n)::bigint $$;

CREATE FUNCTION pg_temp.pessoa(p_tipo text, p_nome text, p_tel bigint, p_em timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  PERFORM pg_temp.rep(true);
  INSERT INTO public.pessoas (id_tipo_pessoa, nome, telefone, ativo, created_at, updated_at)
  VALUES ((SELECT id FROM public.pessoa_tipos WHERE codigo = p_tipo), '[TESTE atrib] ' || p_nome, p_tel, true, p_em, p_em)
  RETURNING id INTO v;
  PERFORM pg_temp.rep(false);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.liga(p_pac uuid, p_resp uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.rep(true);
  INSERT INTO public.pessoa_responsaveis (id_pessoa, id_responsavel, tipo_responsabilidade, ativo) VALUES (p_pac, p_resp, 'ambos', true);
  PERFORM pg_temp.rep(false);
END $$;

CREATE FUNCTION pg_temp.fatura(p_resp uuid, p_pac uuid, p_valor numeric, p_status text, p_pago timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  PERFORM pg_temp.rep(true);
  INSERT INTO public.faturas (id_asaas, empresa_id, responsavel_cobranca_id, paciente_id, valor_total, valor_servico, status, pago_em, ativo)
  VALUES ('teste-atrib-' || gen_random_uuid(), (SELECT empresa_id FROM public.faturas WHERE empresa_id IS NOT NULL LIMIT 1),
          p_resp, p_pac, p_valor, p_valor, p_status, p_pago, true)
  RETURNING id INTO v;
  PERFORM pg_temp.rep(false);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.ag(p_pac uuid, p_criado timestamptz, p_data timestamptz, p_cons text, p_pag text, p_valor numeric, p_fat uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid; v_prof uuid;
BEGIN
  SELECT profissional_id INTO v_prof FROM public.agendamentos WHERE ativo LIMIT 1;
  PERFORM pg_temp.rep(true);
  INSERT INTO public.agendamentos (data_hora, paciente_id, profissional_id, tipo_servico_id, status_consulta_id, status_pagamento_id,
                                   agendado_por, empresa_fatura, valor_servico, fatura_id, ativo, created_at, updated_at)
  VALUES (date_trunc('day', p_data) + interval '3 hours', p_pac, v_prof, (SELECT tipo_servico_id FROM public.agendamentos WHERE ativo LIMIT 1),
          (SELECT id FROM public.consulta_status WHERE codigo = p_cons), (SELECT id FROM public.pagamento_status WHERE codigo = p_pag),
          v_prof, (SELECT empresa_fatura FROM public.agendamentos WHERE ativo LIMIT 1), p_valor, p_fat, true, p_criado, p_criado)
  RETURNING id INTO v;
  PERFORM pg_temp.rep(false);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.ag_status(p_ag uuid, p_cons text, p_pag text, p_em timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.rep(true);
  UPDATE public.agendamentos
     SET status_consulta_id = coalesce((SELECT id FROM public.consulta_status WHERE codigo = p_cons), status_consulta_id),
         status_pagamento_id = coalesce((SELECT id FROM public.pagamento_status WHERE codigo = p_pag), status_pagamento_id),
         updated_at = p_em
   WHERE id = p_ag;
  PERFORM pg_temp.rep(false);
END $$;

CREATE FUNCTION pg_temp.conversa(p_tel bigint) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO public.ju_conversas (wa_chatid, telefone) VALUES (p_tel || '@s.whatsapp.net', '+' || p_tel) RETURNING id
$$;

CREATE FUNCTION pg_temp.msg(p_conv bigint, p_txt text, p_em timestamptz) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo, created_at)
  VALUES (p_conv, 'teste-atrib-' || gen_random_uuid(), 'CLIENTE', 'TEXT', p_txt, p_em) RETURNING id INTO v;
  UPDATE public.ju_conversas SET ultima_mensagem_cliente = greatest(coalesce(ultima_mensagem_cliente, p_em), p_em) WHERE id = p_conv;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.pedido(p_conv bigint, p_tipo text, p_em timestamptz, p_pac uuid) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO public.ju_solicitacoes (conversa_id, tipo, setor, resumo, status, created_at, paciente_id)
  VALUES (p_conv, p_tipo, 'SECRETARIA', '[TESTE atrib]', 'ABERTA', p_em, p_pac) RETURNING id
$$;

-- clique registrado no site (simula a resposta do Supabase do site)
CREATE FUNCTION pg_temp.clique(p_ref text, p_source text, p_medium text, p_campanha_id text, p_campanha text, p_em timestamptz)
RETURNS void LANGUAGE sql AS $$
  SELECT public.fn_atrib_aplicar_clique((SELECT id FROM public.atrib_toques WHERE ref = p_ref),
    jsonb_build_object('utm_source', p_source, 'utm_medium', p_medium, 'utm_id', p_campanha_id,
                       'utm_campaign', p_campanha, 'criado_em', p_em, 'utm_term', 'fisioterapia respiratoria',
                       'rk_adgroup', 'g' || p_campanha_id))
$$;

CREATE FUNCTION pg_temp.aq(p_pac uuid) RETURNS public.vw_atrib_aquisicoes LANGUAGE sql AS $$
  SELECT * FROM public.vw_atrib_aquisicoes WHERE paciente_id = p_pac
$$;


DO $teste$
DECLARE
  n0 timestamptz := now();
  ok text[] := '{}'; falhas text[] := '{}';
  -- pessoas
  rA uuid; rB uuid; rC uuid; rD uuid; rE uuid; rF uuid; rG uuid; rH uuid; rJ uuid; rK uuid; rM uuid; rN uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid; p11 uuid;
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint; c7 bigint; c8 bigint; c9 bigint; c10 bigint;
  c10b bigint; c11 bigint; c12 bigint; cx bigint;
  a1 uuid; a1b uuid; a2 uuid; a4 uuid; a5a uuid; a5b uuid; a6a uuid; a6b uuid; a7 uuid; a8a uuid; a8b uuid; a8c uuid; a9 uuid; a10 uuid; a11 uuid;
  f1 uuid; f8 uuid; v_fat uuid;
  T1 timestamptz := n0 - interval '50 days';
  T2 timestamptz := n0 - interval '20 days';
  T3 timestamptz := n0 - interval '30 days';
  T4 timestamptz := n0 - interval '25 days';
  T5 timestamptz := n0 - interval '40 days';
  T6 timestamptz := n0 - interval '45 days';
  T7 timestamptz := n0 - interval '35 days';
  T8 timestamptz := n0 - interval '58 days';
  T9 timestamptz := n0 - interval '30 days';
  T10 timestamptz := n0 - interval '15 days';
  T11 timestamptz := n0 - interval '12 days';
  T12 timestamptz := n0 - interval '10 days';
  x record; v int; v2 int; v_txt text; ev1 int; ev2 int; snap1 text; snap2 text;
  v_tok text; v_base jsonb; v_lin jsonb; v_tot jsonb; r jsonb; r2 jsonb; r3 jsonb; d1 date; v_num numeric;
  p13 uuid; c13 bigint;
  T13 timestamptz := date_trunc('month', now()) - interval '3 days' + interval '15 hours';
BEGIN
  -- os telefones fictícios não podem existir de verdade
  IF EXISTS (SELECT 1 FROM public.pessoas WHERE public.fn_atrib_tel_chave(telefone::text) LIKE '617700%') THEN
    RAISE EXCEPTION 'faixa de telefone fictícia em uso';
  END IF;

  ---------------------------------------------------------------- S1
  -- 1ª criança adquirida pelo Google: código → pedido → cadastro → agenda → atendida e paga
  c1 := pg_temp.conversa(pg_temp.tel(11));
  PERFORM pg_temp.msg(c1, 'Olá! Vim pelo site e gostaria de agendar uma avaliação.' || chr(10) || chr(10) || 'Referência: RK-TSTA2222', T1);
  PERFORM pg_temp.pedido(c1, 'AGENDAMENTO', T1 + interval '10 min', NULL);
  rA := pg_temp.pessoa('responsavel', 'Mãe A', pg_temp.tel(11), T1 + interval '1 hour');
  p1 := pg_temp.pessoa('paciente', 'Criança A1', NULL, T1 + interval '1 hour');
  PERFORM pg_temp.liga(p1, rA);
  f1 := pg_temp.fatura(rA, p1, 260, 'pago', T1 + interval '3 days');
  a1 := pg_temp.ag(p1, T1 + interval '2 hours', T1 + interval '3 days', 'finalizado', 'pago', 260, f1);
  -- o registro do clique chega DEPOIS da mensagem (como na vida real)
  PERFORM public.fn_atrib_processar();
  PERFORM pg_temp.clique('RK-TSTA2222', 'google', 'cpc', '111', 'Respiratória Brasília', T1 - interval '2 min');

  ---------------------------------------------------------------- S10 (cedo, contato novo sem origem)
  c10 := pg_temp.conversa(pg_temp.tel(20));
  PERFORM pg_temp.msg(c10, 'Oi, vocês atendem bebê com bronquiolite?', T10);
  rK := pg_temp.pessoa('responsavel', 'Mãe K', pg_temp.tel(20), T10 + interval '20 hours');
  p10 := pg_temp.pessoa('paciente', 'Criança K', NULL, T10 + interval '20 hours');
  PERFORM pg_temp.liga(p10, rK);
  a10 := pg_temp.ag(p10, T10 + interval '1 day', T10 + interval '2 days', 'finalizado', 'pago', 260,
                    pg_temp.fatura(rK, p10, 260, 'pago', T10 + interval '2 days'));
  -- contato novo que some sem agendar
  c10b := pg_temp.conversa(pg_temp.tel(21));
  PERFORM pg_temp.msg(c10b, 'Quanto custa a sessão?', n0 - interval '40 days');

  ---------------------------------------------------------------- S3 dois responsáveis para uma criança
  c2 := pg_temp.conversa(pg_temp.tel(13));   -- pai, veio do anúncio
  c3 := pg_temp.conversa(pg_temp.tel(14));   -- mãe, escreveu sem código
  PERFORM pg_temp.msg(c2, 'Vim pelo site. Referência: RK-TSTC3333', T3);
  PERFORM pg_temp.msg(c3, 'Oi, meu marido falou com vocês, queria marcar pro nosso filho', T3 + interval '1 day');
  rB := pg_temp.pessoa('responsavel', 'Pai C', pg_temp.tel(13), T3 + interval '1 day');
  rC := pg_temp.pessoa('responsavel', 'Mãe C', pg_temp.tel(14), T3 + interval '1 day');
  p3 := pg_temp.pessoa('paciente', 'Criança C', NULL, T3 + interval '1 day');
  PERFORM pg_temp.liga(p3, rB); PERFORM pg_temp.liga(p3, rC);
  PERFORM pg_temp.ag(p3, T3 + interval '1 day 2 hours', T3 + interval '5 days', 'finalizado', 'pago', 260,
                     pg_temp.fatura(rC, p3, 260, 'pago', T3 + interval '5 days'));
  PERFORM pg_temp.clique('RK-TSTC3333', 'google', 'cpc', '333', 'Motor', T3 - interval '1 min');

  ---------------------------------------------------------------- S4 paciente antigo voltando por outra campanha
  rD := pg_temp.pessoa('responsavel', 'Mãe D', pg_temp.tel(15), n0 - interval '320 days');
  p4 := pg_temp.pessoa('paciente', 'Criança D', NULL, n0 - interval '320 days');
  PERFORM pg_temp.liga(p4, rD);
  PERFORM pg_temp.ag(p4, n0 - interval '305 days', n0 - interval '300 days', 'finalizado', 'pago', 260,
                     pg_temp.fatura(rD, p4, 260, 'pago', n0 - interval '300 days'));
  c4 := pg_temp.conversa(pg_temp.tel(15));
  PERFORM pg_temp.msg(c4, 'Referência: RK-TSTD4444', T4);
  a4 := pg_temp.ag(p4, T4 + interval '1 hour', T4 + interval '3 days', 'finalizado', 'pago', 280,
                   pg_temp.fatura(rD, p4, 280, 'pago', T4 + interval '3 days'));
  PERFORM pg_temp.clique('RK-TSTD4444', 'google', 'cpc', '444', 'Reativação', T4 - interval '1 min');

  ---------------------------------------------------------------- S5 remarcação
  c5 := pg_temp.conversa(pg_temp.tel(16));
  PERFORM pg_temp.msg(c5, 'Referência: RK-TSTE5555', T5);
  rE := pg_temp.pessoa('responsavel', 'Mãe E', pg_temp.tel(16), T5 + interval '1 hour');
  p5 := pg_temp.pessoa('paciente', 'Criança E', NULL, T5 + interval '1 hour');
  PERFORM pg_temp.liga(p5, rE);
  a5a := pg_temp.ag(p5, T5 + interval '2 hours', T5 + interval '5 days', 'agendado', 'pendente', 260, NULL);
  PERFORM pg_temp.ag_status(a5a, 'reagendado', 'cancelado', T5 + interval '4 days');
  a5b := pg_temp.ag(p5, T5 + interval '4 days', T5 + interval '10 days', 'finalizado', 'pago', 260,
                    pg_temp.fatura(rE, p5, 260, 'pago', T5 + interval '10 days'));
  PERFORM pg_temp.clique('RK-TSTE5555', 'google', 'cpc', '555', 'Torcicolo', T5 - interval '1 min');

  ---------------------------------------------------------------- S6 cancelamento (recuperação vem depois)
  c6 := pg_temp.conversa(pg_temp.tel(17));
  PERFORM pg_temp.msg(c6, 'Referência: RK-TSTF6666', T6);
  rF := pg_temp.pessoa('responsavel', 'Mãe F', pg_temp.tel(17), T6 + interval '1 hour');
  p6 := pg_temp.pessoa('paciente', 'Criança F', NULL, T6 + interval '1 hour');
  PERFORM pg_temp.liga(p6, rF);
  a6a := pg_temp.ag(p6, T6 + interval '2 hours', T6 + interval '6 days', 'agendado', 'pendente', 260, NULL);
  PERFORM pg_temp.ag_status(a6a, 'cancelado', 'cancelado', T6 + interval '2 days');
  PERFORM pg_temp.clique('RK-TSTF6666', 'google', 'cpc', '666', 'Respiratória Brasília', T6 - interval '1 min');

  ---------------------------------------------------------------- S7 falta cobrada
  c7 := pg_temp.conversa(pg_temp.tel(18));
  PERFORM pg_temp.msg(c7, 'Referência: RK-TSTG7777', T7);
  rG := pg_temp.pessoa('responsavel', 'Mãe G', pg_temp.tel(18), T7 + interval '1 hour');
  p7 := pg_temp.pessoa('paciente', 'Criança G', NULL, T7 + interval '1 hour');
  PERFORM pg_temp.liga(p7, rG);
  a7 := pg_temp.ag(p7, T7 + interval '2 hours', T7 + interval '3 days', 'faltou', 'pago', 260,
                   pg_temp.fatura(rG, p7, 260, 'pago', T7 + interval '3 days'));

  ---------------------------------------------------------------- S8 fatura de 2 sessões com desconto + 3ª sessão não paga
  c8 := pg_temp.conversa(pg_temp.tel(19));
  PERFORM pg_temp.msg(c8, 'Referência: RK-TSTH8888', T8);
  rH := pg_temp.pessoa('responsavel', 'Mãe H', pg_temp.tel(19), T8 + interval '1 hour');
  p8 := pg_temp.pessoa('paciente', 'Criança H', NULL, T8 + interval '1 hour');
  PERFORM pg_temp.liga(p8, rH);
  f8 := pg_temp.fatura(rH, p8, 400, 'pago', T8 + interval '3 days');
  a8a := pg_temp.ag(p8, T8 + interval '2 hours', T8 + interval '3 days', 'finalizado', 'pago', 260, f8);
  a8b := pg_temp.ag(p8, T8 + interval '2 hours', T8 + interval '10 days', 'finalizado', 'pago', 260, f8);
  a8c := pg_temp.ag(p8, T8 + interval '9 days', T8 + interval '17 days', 'finalizado', 'cobranca_gerada', 260,
                    pg_temp.fatura(rH, p8, 260, 'pendente', NULL));
  PERFORM pg_temp.clique('RK-TSTH8888', 'google', 'cpc', '111', 'Respiratória Brasília', T8 - interval '1 min');

  ---------------------------------------------------------------- S9 estorno
  c9 := pg_temp.conversa(pg_temp.tel(22));
  PERFORM pg_temp.msg(c9, 'Referência: RK-TSTJ9999', T9);
  rJ := pg_temp.pessoa('responsavel', 'Mãe J', pg_temp.tel(22), T9 + interval '1 hour');
  p9 := pg_temp.pessoa('paciente', 'Criança J', NULL, T9 + interval '1 hour');
  PERFORM pg_temp.liga(p9, rJ);
  a9 := pg_temp.ag(p9, T9 + interval '2 hours', T9 + interval '3 days', 'finalizado', 'estornado', 260,
                   pg_temp.fatura(rJ, p9, 260, 'pago', T9 + interval '3 days'));
  PERFORM pg_temp.clique('RK-TSTJ9999', 'google', 'cpc', '999', 'Teste estorno', T9 - interval '1 min');

  ---------------------------------------------------------------- S11 fora de ordem: agendamento gravado ANTES da mensagem
  rM := pg_temp.pessoa('responsavel', 'Mãe M', pg_temp.tel(23), T11 + interval '1 hour');
  p11 := pg_temp.pessoa('paciente', 'Criança M', NULL, T11 + interval '1 hour');
  PERFORM pg_temp.liga(p11, rM);
  a11 := pg_temp.ag(p11, T11 + interval '2 hours', T11 + interval '4 days', 'agendado', 'pendente', 260, NULL);
  PERFORM public.fn_atrib_processar();
  c11 := pg_temp.conversa(pg_temp.tel(23));
  PERFORM pg_temp.msg(c11, 'Referência: RK-TSTM2345', T11);   -- chega depois, com data anterior

  ---------------------------------------------------------------- S12 fora de ordem: pedido antigo registrado depois do código
  c12 := pg_temp.conversa(pg_temp.tel(24));
  PERFORM pg_temp.msg(c12, 'Referência: RK-TSTN2345', T12);
  PERFORM public.fn_atrib_processar();
  PERFORM pg_temp.pedido(c12, 'AGENDAMENTO', T12 - interval '2 days', NULL);

  ---------------------------------------------------------------- S13 coorte: clique num mês, atendimento no seguinte
  c13 := pg_temp.conversa(pg_temp.tel(25));
  PERFORM pg_temp.msg(c13, 'Referência: RK-TSTP2345', T13);
  rN := pg_temp.pessoa('responsavel', 'Mãe P', pg_temp.tel(25), T13 + interval '1 hour');
  p13 := pg_temp.pessoa('paciente', 'Criança P', NULL, T13 + interval '1 hour');
  PERFORM pg_temp.liga(p13, rN);
  PERFORM pg_temp.ag(p13, T13 + interval '2 hours', date_trunc('month', n0) + interval '2 days', 'finalizado', 'pago', 260,
                     pg_temp.fatura(rN, p13, 260, 'pago', date_trunc('month', n0) + interval '2 days'));
  PERFORM pg_temp.clique('RK-TSTP2345', 'google', 'cpc', '777', 'Coorte', T13 - interval '1 min');

  ---------------------------------------------------------------- exclusões
  cx := pg_temp.conversa(5561999000099);       -- faixa das conversas fictícias da Ju
  PERFORM pg_temp.msg(cx, 'Referência: RK-TSTX2345', n0 - interval '1 day');

  -- rodadas de processamento
  PERFORM public.fn_atrib_processar();
  PERFORM public.fn_atrib_processar();

  ---------------------------------------------------------------- S2 segundo filho (depois de a 1ª oportunidade fechar)
  p2 := pg_temp.pessoa('paciente', 'Criança A2', NULL, T2);
  PERFORM pg_temp.liga(p2, rA);
  PERFORM pg_temp.msg(c1, 'Agora queria marcar pro meu outro filho. Referência: RK-TSTB2222', T2);
  a2 := pg_temp.ag(p2, T2 + interval '1 hour', T2 + interval '2 days', 'finalizado', 'pago', 260,
                   pg_temp.fatura(rA, p2, 260, 'pago', T2 + interval '2 days'));
  -- a 1ª criança segue em tratamento: sessão de rotina na mesma janela NÃO entra na oportunidade nova
  a1b := pg_temp.ag(p1, T2 + interval '3 hours', T2 + interval '4 days', 'finalizado', 'pago', 260,
                    pg_temp.fatura(rA, p1, 260, 'pago', T2 + interval '4 days'));
  PERFORM pg_temp.clique('RK-TSTB2222', 'google', 'cpc', '222', 'Irmãos', T2 - interval '1 min');

  ---------------------------------------------------------------- S6 recuperação: novo agendamento depois do cancelamento
  PERFORM public.fn_atrib_processar();
  SELECT estado INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c6;
  IF v_txt = 'perdida' THEN ok := array_append(ok, ('S6 cancelou → perdida')::text); ELSE falhas := array_append(falhas, (('S6 antes da recuperação: ' || coalesce(v_txt, 'null')))::text); END IF;
  a6b := pg_temp.ag(p6, T6 + interval '20 days', n0 + interval '3 days', 'agendado', 'pendente', 260, NULL);

  PERFORM public.fn_atrib_processar();
  SELECT count(*) INTO ev1 FROM public.atrib_eventos;
  SELECT string_agg(id || estado || etapa_atual || etapa_maxima || coalesce(motivo_perda, ''), ',' ORDER BY id) INTO snap1 FROM public.atrib_oportunidades;
  -- reprocessar não muda nada nem duplica eventos
  PERFORM public.fn_atrib_processar();
  UPDATE public.atrib_oportunidades SET processada_em = NULL;  -- força recalcular tudo
  PERFORM public.fn_atrib_processar();
  SELECT count(*) INTO ev2 FROM public.atrib_eventos;
  SELECT string_agg(id || estado || etapa_atual || etapa_maxima || coalesce(motivo_perda, ''), ',' ORDER BY id) INTO snap2 FROM public.atrib_oportunidades;
  IF ev1 = ev2 AND snap1 = snap2 THEN ok := array_append(ok, ('reprocessamento idempotente')::text);
  ELSE falhas := array_append(falhas, (format('reprocessamento: eventos %s→%s, estado igual=%s', ev1, ev2, snap1 = snap2))::text); END IF;

  ---------------------------------------------------------------- VERIFICAÇÕES
  PERFORM public.fn_atrib_atualizar_receita();   -- receita por sessão é pré-calculada (fase 3)
  -- S1
  x := pg_temp.aq(p1);
  IF x.campanha_id = '111' AND x.canal = 'google_ads' AND x.familia_nova AND x.contato_novo AND x.receita_primeira_sessao = 260
     AND x.tipo_origem = 'site_completa' THEN ok := array_append(ok, ('S1 1ª criança pelo Google')::text);
  ELSE falhas := array_append(falhas, (format('S1: %s', row_to_json(x)))::text); END IF;
  SELECT estado || '/' || etapa_maxima INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c1 ORDER BY aberta_em LIMIT 1;
  IF v_txt = 'convertida/pago' THEN ok := array_append(ok, ('S1 oportunidade convertida e paga')::text); ELSE falhas := array_append(falhas, (('S1 op: ' || v_txt))::text); END IF;

  -- S2
  x := pg_temp.aq(p2);
  IF x.campanha_id = '222' AND NOT x.familia_nova AND NOT x.contato_novo THEN ok := array_append(ok, ('S2 2º filho: paciente novo, família antiga')::text);
  ELSE falhas := array_append(falhas, (format('S2: %s', row_to_json(x)))::text); END IF;
  SELECT count(*) INTO v FROM public.atrib_oportunidades WHERE conversa_id = c1;
  IF v = 2 THEN ok := array_append(ok, ('S2 nova oportunidade na mesma conversa')::text); ELSE falhas := array_append(falhas, (('S2 oportunidades na conversa: ' || v))::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.atrib_oportunidade_agendamentos WHERE agendamento_id = a1b) THEN
    ok := array_append(ok, ('S2 sessão de rotina do irmão fora da oportunidade')::text);
  ELSE falhas := array_append(falhas, ('S2 sessão de rotina do irmão entrou na oportunidade')::text); END IF;
  x := pg_temp.aq(p1);
  IF x.campanha_id = '111' THEN ok := array_append(ok, ('S2 1ª criança continua creditada à campanha dela')::text);
  ELSE falhas := array_append(falhas, (('S2 crédito da 1ª criança mudou: ' || coalesce(x.campanha_id, 'null')))::text); END IF;

  -- S3
  SELECT count(*) INTO v FROM public.vw_atrib_aquisicoes WHERE paciente_id = p3;
  x := pg_temp.aq(p3);
  IF v = 1 AND x.campanha_id = '333' THEN ok := array_append(ok, ('S3 dois responsáveis: 1 aquisição, crédito ao anúncio')::text);
  ELSE falhas := array_append(falhas, (format('S3: linhas=%s %s', v, row_to_json(x)))::text); END IF;
  SELECT count(*) INTO v FROM public.atrib_oportunidade_agendamentos oa JOIN public.agendamentos a ON a.id = oa.agendamento_id WHERE a.paciente_id = p3;
  IF v = 2 THEN ok := array_append(ok, ('S3 agendamento ligado às duas conversas (sem dupla contagem)')::text); ELSE falhas := array_append(falhas, (('S3 vínculos: ' || v))::text); END IF;

  -- S4
  x := pg_temp.aq(p4);
  SELECT tipo_paciente INTO v_txt FROM public.vw_atrib_oportunidade_pacientes op
    JOIN public.atrib_oportunidades o ON o.id = op.oportunidade_id WHERE o.conversa_id = c4 AND op.paciente_id = p4;
  IF x.tipo_vinculo = 'sem_vinculo' AND v_txt = 'recorrente' THEN ok := array_append(ok, ('S4 paciente antigo = retenção, fora do CAC')::text);
  ELSE falhas := array_append(falhas, (format('S4: vinculo=%s tipo=%s', x.tipo_vinculo, v_txt))::text); END IF;
  SELECT novos_pacientes INTO v FROM public.vw_atrib_campanhas_mensal WHERE campanha_id = '444';
  IF coalesce(v, 0) = 0 THEN ok := array_append(ok, ('S4 campanha 444 sem paciente novo')::text); ELSE falhas := array_append(falhas, (('S4 novos na 444: ' || v))::text); END IF;

  -- S5
  x := pg_temp.aq(p5);
  IF x.campanha_id = '555' AND x.primeiro_atendimento_id = a5b THEN ok := array_append(ok, ('S5 remarcação: aquisição no atendimento realizado')::text);
  ELSE falhas := array_append(falhas, (format('S5: %s', row_to_json(x)))::text); END IF;

  -- S6
  SELECT estado INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c6;
  SELECT count(*) INTO v FROM public.atrib_eventos e JOIN public.atrib_oportunidades o ON o.id = e.oportunidade_id
   WHERE o.conversa_id = c6 AND e.tipo = 'estado' AND e.valor_anterior = 'perdida' AND e.valor_novo = 'agendada';
  IF v_txt = 'agendada' AND v = 1 THEN ok := array_append(ok, ('S6 recuperação registrada no histórico')::text);
  ELSE falhas := array_append(falhas, (format('S6: estado=%s recuperacoes=%s', v_txt, v))::text); END IF;

  -- S7
  SELECT estado || '/' || coalesce(motivo_perda, '-') INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c7;
  SELECT count(*) INTO v FROM public.vw_atrib_aquisicoes WHERE paciente_id = p7;
  SELECT situacao INTO snap1 FROM public.vw_atrib_receita_sessao WHERE agendamento_id = a7;
  IF v_txt = 'perdida/faltou' AND v = 0 AND snap1 = 'recebida' THEN ok := array_append(ok, ('S7 falta cobrada: receita sim, paciente adquirido não')::text);
  ELSE falhas := array_append(falhas, (format('S7: op=%s aquisicoes=%s receita=%s', v_txt, v, snap1))::text); END IF;

  -- S8
  x := pg_temp.aq(p8);
  SELECT situacao INTO snap1 FROM public.vw_atrib_receita_sessao WHERE agendamento_id = a8c;
  IF x.receita_30d = 400 AND x.receita_primeira_sessao = 200 AND x.sessoes_30d = 3 AND snap1 = 'pendente'
  THEN ok := array_append(ok, ('S8 fatura com desconto rateada, sessão não paga fora da receita')::text);
  ELSE falhas := array_append(falhas, (format('S8: r1=%s r30=%s s30=%s a8c=%s', x.receita_primeira_sessao, x.receita_30d, x.sessoes_30d, snap1))::text); END IF;

  -- S9
  x := pg_temp.aq(p9);
  SELECT situacao INTO snap1 FROM public.vw_atrib_receita_sessao WHERE agendamento_id = a9;
  SELECT etapa_maxima INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c9;
  IF x.receita_primeira_sessao = 0 AND snap1 = 'estornada' AND v_txt = 'atendido' THEN ok := array_append(ok, ('S9 estorno zera a receita')::text);
  ELSE falhas := array_append(falhas, (format('S9: r1=%s sit=%s etapa=%s', x.receita_primeira_sessao, snap1, v_txt))::text); END IF;

  -- S10
  x := pg_temp.aq(p10);
  IF x.canal = 'nao_atribuido' AND x.tipo_origem = 'nao_atribuida' AND x.contato_novo THEN ok := array_append(ok, ('S10 sem origem = não atribuída')::text);
  ELSE falhas := array_append(falhas, (format('S10: %s', row_to_json(x)))::text); END IF;
  SELECT estado || '/' || coalesce(motivo_perda, '-') INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c10b;
  IF v_txt = 'perdida/sem_agendamento' THEN ok := array_append(ok, ('S10 contato que sumiu = perdida sem agendamento')::text);
  ELSE falhas := array_append(falhas, (('S10b: ' || coalesce(v_txt, 'sem oportunidade')))::text); END IF;

  -- S11 / S12 fora de ordem
  SELECT count(*) INTO v FROM public.atrib_oportunidade_agendamentos WHERE agendamento_id = a11;
  IF v = 1 THEN ok := array_append(ok, ('S11 agendamento gravado antes da mensagem foi ligado')::text);
  ELSE falhas := array_append(falhas, (('S11 vínculos: ' || v))::text); END IF;
  SELECT count(*) INTO v FROM public.atrib_oportunidades WHERE conversa_id = c12;
  SELECT min(aberta_em) = T12 - interval '2 days' INTO v_txt FROM public.atrib_oportunidades WHERE conversa_id = c12;
  IF v = 1 AND v_txt = 'true' THEN ok := array_append(ok, ('S12 pedido antigo registrado depois entrou na mesma oportunidade')::text);
  ELSE falhas := array_append(falhas, (format('S12: oportunidades=%s abertura_ajustada=%s', v, v_txt))::text); END IF;

  -- exclusões e garantias
  IF NOT EXISTS (SELECT 1 FROM public.atrib_toques WHERE ref = 'RK-TSTX2345') THEN ok := array_append(ok, ('conversa fictícia/equipe fora da atribuição')::text);
  ELSE falhas := array_append(falhas, ('conversa excluída gerou toque')::text); END IF;
  BEGIN
    UPDATE public.atrib_eventos SET valor_novo = 'x' WHERE id = (SELECT min(id) FROM public.atrib_eventos);
    falhas := array_append(falhas, ('histórico aceitou UPDATE')::text);
  EXCEPTION WHEN OTHERS THEN ok := array_append(ok, ('histórico imutável')::text);
  END;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name LIKE 'atrib_%'
                  AND column_name ~ '(gclid|gbraid|wbraid|fbclid|telefone$)') THEN ok := array_append(ok, ('sem gclid/telefone nas tabelas')::text);
  ELSE falhas := array_append(falhas, ('coluna proibida em atrib_*')::text); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.atrib_erros) THEN ok := array_append(ok, ('nenhum erro de captura')::text);
  ELSE falhas := array_append(falhas, ((SELECT string_agg(etapa || ': ' || detalhe, ' | ') FROM public.atrib_erros))::text); END IF;

  ---------------------------------------------------------------- CUSTOS (fase 2)
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'atrib_custos_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'atrib_custos_token');
  END IF;
  SELECT decrypted_secret INTO v_tok FROM vault.decrypted_secrets WHERE name = 'atrib_custos_token';
  d1 := date_trunc('month', T1)::date;            -- mês inteiro do S1
  v_base := jsonb_build_object('plataforma', 'google_ads', 'conta_id', '874-439-1492', 'moeda', 'BRL',
              'fuso', 'America/Sao_Paulo', 'periodo_de', d1, 'periodo_ate', (d1 + interval '1 month - 1 day')::date, 'execucao', 'teste');
  v_lin := jsonb_build_array(
    jsonb_build_object('data', d1, 'campanha_id', '111', 'campanha_nome', 'Respiratória Brasília', 'status', 'ENABLED', 'impressoes', 1000, 'cliques', 40, 'custo_micros', 300000000),
    jsonb_build_object('data', d1, 'campanha_id', '112', 'campanha_nome', 'Motor', 'status', 'ENABLED', 'impressoes', 200, 'cliques', 5, 'custo_micros', 50000000),
    jsonb_build_object('data', d1 + 1, 'campanha_id', '111', 'campanha_nome', 'Respiratória Brasília', 'status', 'ENABLED', 'impressoes', 300, 'cliques', 9, 'custo_micros', 100000000));
  v_tot := jsonb_build_array(jsonb_build_object('data', d1, 'custo_micros', 350000000), jsonb_build_object('data', d1 + 1, 'custo_micros', 100000000));

  -- C1 importação válida / C2 repetir não duplica
  r := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin, 'totais_conta', v_tot), v_tok);
  r2 := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin, 'totais_conta', v_tot), v_tok);
  SELECT count(*), sum(custo) INTO v, v_num FROM public.atrib_custos_diarios WHERE conta_id = '8744391492' AND data BETWEEN d1 AND d1 + 1;
  IF (r->>'status') = 'ok' AND (r2->>'status') = 'ok' AND v = 3 AND v_num = 450 THEN ok := array_append(ok, 'C1/C2 custo importado e reimportado sem duplicar (R$ 450)'::text);
  ELSE falhas := array_append(falhas, format('C1/C2: %s %s linhas=%s soma=%s', r, r2, v, v_num)); END IF;

  -- C3 reprocessamento: ajuste do Google e campanha que sumiu da janela
  v_lin := jsonb_build_array(
    jsonb_build_object('data', d1, 'campanha_id', '111', 'campanha_nome', 'Respiratória Brasília', 'status', 'ENABLED', 'impressoes', 1000, 'cliques', 40, 'custo_micros', 310000000),
    jsonb_build_object('data', d1 + 1, 'campanha_id', '111', 'campanha_nome', 'Respiratória Brasília', 'status', 'ENABLED', 'impressoes', 300, 'cliques', 9, 'custo_micros', 100000000));
  v_tot := jsonb_build_array(jsonb_build_object('data', d1, 'custo_micros', 310000000), jsonb_build_object('data', d1 + 1, 'custo_micros', 100000000));
  r := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin, 'totais_conta', v_tot), v_tok);
  SELECT count(*), sum(custo) INTO v, v_num FROM public.atrib_custos_diarios WHERE conta_id = '8744391492' AND data BETWEEN d1 AND d1 + 1;
  IF (r->>'ok')::boolean AND v = 2 AND v_num = 410 THEN ok := array_append(ok, 'C3 reprocessamento substitui a janela (R$ 410)'::text);
  ELSE falhas := array_append(falhas, format('C3: %s linhas=%s soma=%s', r, v, v_num)); END IF;

  -- C4 conciliação divergente: entra, mas fica marcada
  r := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin,
         'totais_conta', jsonb_build_array(jsonb_build_object('data', d1, 'custo_micros', 310000000), jsonb_build_object('data', d1 + 1, 'custo_micros', 120000000))), v_tok);
  SELECT ultimo_status INTO v_txt FROM public.vw_atrib_custos_status WHERE plataforma = 'google_ads';
  IF (r->>'status') = 'divergente' AND (r->>'diferenca')::numeric = 20 AND v_txt = 'divergente' THEN ok := array_append(ok, 'C4 divergência de R$ 20 detectada e sinalizada'::text);
  ELSE falhas := array_append(falhas, format('C4: %s status=%s', r, v_txt)); END IF;
  r := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin, 'totais_conta', v_tot), v_tok);   -- volta ao certo

  -- C5 moeda / C6 conta / C8 linha malformada: rejeitados, nada muda
  r := public.fn_atrib_custos_receber(v_base || jsonb_build_object('moeda', 'USD', 'linhas', v_lin, 'totais_conta', v_tot), v_tok);
  r2 := public.fn_atrib_custos_receber(v_base || jsonb_build_object('conta_id', '111-222-3333', 'linhas', v_lin, 'totais_conta', v_tot), v_tok);
  r3 := public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', jsonb_build_array(jsonb_build_object('data', 'ontem', 'campanha_id', '111', 'custo_micros', 1)), 'totais_conta', v_tot), v_tok);
  SELECT count(*), sum(custo) INTO v, v_num FROM public.atrib_custos_diarios WHERE conta_id = '8744391492' AND data BETWEEN d1 AND d1 + 1;
  IF NOT (r->>'ok')::boolean AND NOT (r2->>'ok')::boolean AND NOT (r3->>'ok')::boolean AND v = 2 AND v_num = 410
     AND (SELECT count(*) FROM public.atrib_custos_importacoes WHERE status = 'rejeitada') >= 3
  THEN ok := array_append(ok, format('C5/C6/C8 rejeitados sem mexer nos custos (%s | %s | %s)', r->>'motivo', r2->>'motivo', r3->>'motivo'));
  ELSE falhas := array_append(falhas, format('C5/C6/C8: %s %s %s linhas=%s soma=%s', r, r2, r3, v, v_num)); END IF;

  -- C7 token errado
  BEGIN
    PERFORM public.fn_atrib_custos_receber(v_base || jsonb_build_object('linhas', v_lin, 'totais_conta', v_tot), 'token-errado-com-mais-de-32-caracteres!!');
    falhas := array_append(falhas, 'C7 token errado foi aceito'::text);
  EXCEPTION WHEN insufficient_privilege THEN ok := array_append(ok, 'C7 token errado recusado'::text);
  END;

  -- C9 custo completo → CAC/ROAS; importação parada → "não disponível"
  SELECT custo_status || '/' || investimento || '/' || novos_pacientes || '/' || coalesce(cac_midia::text, 'null') INTO v_txt
    FROM public.vw_atrib_campanhas_mensal WHERE campanha_id = '111' AND mes = d1;
  UPDATE public.atrib_custos_importacoes SET recebido_em = recebido_em - interval '3 days';
  SELECT custo_status || '/' || coalesce(cac_midia::text, 'null') || '/' || coalesce(roas_30d::text, 'null') INTO snap1
    FROM public.vw_atrib_campanhas_mensal WHERE campanha_id = '111' AND mes = d1;
  SELECT desatualizado::text INTO snap2 FROM public.vw_atrib_custos_status WHERE plataforma = 'google_ads';
  IF v_txt = 'completo/410.00/1/410.00' AND snap1 = 'desatualizado/null/null' AND snap2 = 'true'
  THEN ok := array_append(ok, 'C9 CAC só com custo completo; importação parada = não disponível'::text);
  ELSE falhas := array_append(falhas, format('C9: completo=%s parado=%s desatualizado=%s', v_txt, snap1, snap2)); END IF;

  -- C10 campanha paga sem custo importado: investimento NULL, não zero
  SELECT custo_status || '/' || coalesce(investimento::text, 'null') || '/' || coalesce(roas_30d::text, 'null') INTO v_txt
    FROM public.vw_atrib_campanhas_mensal WHERE campanha_id = '222';
  IF v_txt = 'sem_dados/null/null' THEN ok := array_append(ok, 'C10 campanha sem custo = não disponível (nunca zero)'::text);
  ELSE falhas := array_append(falhas, ('C10: ' || coalesce(v_txt, 'sem linha'))::text); END IF;

  -- S13 coorte: clicou num mês, atendido no seguinte → conta no mês do clique, receita uma vez só
  SELECT string_agg(mes || ':' || novos_pacientes || ':' || receita_acumulada, ',' ORDER BY mes) INTO v_txt
    FROM public.vw_atrib_campanhas_mensal WHERE campanha_id = '777';
  SELECT (mes_origem = date_trunc('month', T13)::date AND mes = date_trunc('month', n0)::date)::text INTO snap1
    FROM public.vw_atrib_aquisicoes WHERE paciente_id = p13;
  IF v_txt = date_trunc('month', T13)::date || ':1:260.00' AND snap1 = 'true'
  THEN ok := array_append(ok, 'S13 coorte no mês do clique, atendido no mês seguinte, receita sem duplicar'::text);
  ELSE falhas := array_append(falhas, format('S13: linhas=%s mes_origem_ok=%s', v_txt, snap1)); END IF;

  -- Reconstrução do zero: apaga tudo o que é derivado (vínculos, estados e o
  -- histórico calculado) e recalcula de uma vez. Tem de dar o mesmo resultado
  -- que a construção incremental, fora de ordem.
  SELECT string_agg(concat_ws(':', paciente_id, campanha_id, tipo_vinculo, receita_30d, familia_nova), ',' ORDER BY paciente_id)
    INTO snap1 FROM public.vw_atrib_aquisicoes WHERE paciente_id IN (p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11);
  SELECT string_agg(concat_ws(':', id, estado, etapa_atual, etapa_maxima, motivo_perda), ',' ORDER BY id) INTO v_txt FROM public.atrib_oportunidades;
  PERFORM set_config('atrib.permitir_apagar', 'on', true);
  DELETE FROM public.atrib_eventos WHERE tipo IN ('estado','etapa','motivo','vinculo');
  PERFORM set_config('atrib.permitir_apagar', 'off', true);
  DELETE FROM public.atrib_oportunidade_agendamentos;
  UPDATE public.atrib_oportunidades SET estado = 'aberta', etapa_atual = 'contato', etapa_maxima = 'contato',
         motivo_perda = NULL, motivo_fonte = NULL, motivo_evidencia = NULL, estado_em = aberta_em, processada_em = NULL;
  PERFORM public.fn_atrib_processar();
  PERFORM public.fn_atrib_processar();
  SELECT string_agg(concat_ws(':', paciente_id, campanha_id, tipo_vinculo, receita_30d, familia_nova), ',' ORDER BY paciente_id)
    INTO snap2 FROM public.vw_atrib_aquisicoes WHERE paciente_id IN (p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11);
  IF snap1 = snap2 AND v_txt = (SELECT string_agg(concat_ws(':', id, estado, etapa_atual, etapa_maxima, motivo_perda), ',' ORDER BY id)
                                  FROM public.atrib_oportunidades)
  THEN ok := array_append(ok, 'reconstrução do zero = mesmo resultado');
  ELSE falhas := array_append(falhas, format(E'reconstrução diferente:\n antes %s\n depois %s', snap1, snap2)); END IF;

  RAISE EXCEPTION E'RESULTADO % OK, % FALHA(S)\nOK: %\nFALHAS: %',
    coalesce(array_length(ok, 1), 0), coalesce(array_length(falhas, 1), 0),
    array_to_string(ok, ' | '), coalesce(array_to_string(falhas, E'\n'), '-');
END
$teste$;
