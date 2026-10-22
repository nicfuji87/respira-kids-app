-- =====================================================================
-- Testes do motor de follow-up (camada C) com dados FICTÍCIOS.
-- Rodar DEPOIS de supabase/migrations/followup_motor.sql, na mesma transação:
-- termina sempre em RAISE EXCEPTION, nada fica gravado.
-- Telefones fictícios 556199900009N (faixa das conversas de teste da Ju).
-- =====================================================================
DO $teste$
DECLARE
  ok text[] := '{}'; falhas text[] := '{}';
  v jsonb; v2 jsonb; t uuid; t2 uuid; n int; s text;
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; o1 bigint; o1b bigint; o2 bigint; o3 bigint; o4 bigint;
  a1 bigint; a1b bigint; a2 bigint; a3 bigint; a4 bigint;
BEGIN
  -- ambiente liberado só dentro do teste
  UPDATE public.followup_config SET envio_ativo = true, canal_autorizado = true, canal = 'teste' WHERE id = 1;
  UPDATE public.followup_mensagens SET aprovado_canal = true;

  -- helper inline: 4 famílias fictícias
  FOR n IN 1..4 LOOP
    DELETE FROM public.ju_conversas WHERE wa_chatid = '55619990009' || n || '@s.whatsapp.net';
  END LOOP;

  INSERT INTO public.ju_conversas (wa_chatid, telefone) VALUES ('556199900091@s.whatsapp.net', public.fn_ju_telefone('556199900091')) RETURNING id INTO c1;
  INSERT INTO public.ju_conversas (wa_chatid, telefone) VALUES ('556199900092@s.whatsapp.net', public.fn_ju_telefone('556199900092')) RETURNING id INTO c2;
  INSERT INTO public.ju_conversas (wa_chatid, telefone) VALUES ('556199900093@s.whatsapp.net', public.fn_ju_telefone('556199900093')) RETURNING id INTO c3;
  INSERT INTO public.ju_conversas (wa_chatid, telefone) VALUES ('556199900094@s.whatsapp.net', public.fn_ju_telefone('556199900094')) RETURNING id INTO c4;

  INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, estado)
  SELECT c, public.fn_atrib_tel_chave('5561999000' || (90 + i)), now() - interval '3 days', 'primeiro_contato', 'aberta'
    FROM (VALUES (c1, 1), (c2, 2), (c3, 3), (c4, 4)) z(c, i);
  SELECT id INTO o1 FROM public.atrib_oportunidades WHERE conversa_id = c1;
  SELECT id INTO o2 FROM public.atrib_oportunidades WHERE conversa_id = c2;
  SELECT id INTO o3 FROM public.atrib_oportunidades WHERE conversa_id = c3;
  SELECT id INTO o4 FROM public.atrib_oportunidades WHERE conversa_id = c4;

  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo, created_at)
  SELECT c, 'FUP-' || c || '-' || k, origem, txt, now() - d
    FROM (VALUES (c1), (c2), (c3), (c4)) cc(c)
    CROSS JOIN (VALUES (1, 'CLIENTE', 'Oi, quero agendar fisio respiratória pro meu filho', interval '2 days 2 hours'),
                       (2, 'HUMANO',  'Temos terça 10h ou quinta 14h. Qual prefere?',      interval '1 day 1 hour')) m(k, origem, txt, d);

  INSERT INTO public.followup_avaliacoes (dia, avaliado_em, oportunidade_id, conversa_id, situacao, motivo, ultimo_autor,
                                          ultima_clinica_em, dias_uteis, contexto, texto_sugerido)
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date, now() - interval '1 minute', o, c, 'candidato', 'familia_parou', 'HUMANO',
         now() - interval '1 day 1 hour', 1, 'horarios', 'x'
    FROM (VALUES (o1, c1), (o2, c2), (o3, c3), (o4, c4)) z(o, c);
  SELECT id INTO a1 FROM public.followup_avaliacoes WHERE oportunidade_id = o1;
  SELECT id INTO a2 FROM public.followup_avaliacoes WHERE oportunidade_id = o2;
  SELECT id INTO a3 FROM public.followup_avaliacoes WHERE oportunidade_id = o3;
  SELECT id INTO a4 FROM public.followup_avaliacoes WHERE oportunidade_id = o4;

  ------------------------------------------------------------------ T1 sem autorização: decide, mas não programa
  v := public.fn_followup_ia_registrar(a1, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"OPCOES_HORARIO","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
  IF v ->> 'decisao' = 'ENVIARIA' AND v ->> 'impedido_por' = 'autorizacao_nao_confirmada' AND v ->> 'tentativa_id' IS NULL
  THEN ok := array_append(ok, 'T1 sem autorização confirmada: nenhuma tentativa');
  ELSE falhas := array_append(falhas, 'T1: ' || v::text); END IF;

  ------------------------------------------------------------------ T2 IA discorda: não envia
  v := public.fn_followup_ia_registrar(a2, '{"classificacao":"INCERTA","quem_deve_agir":"INCERTO","cenario":"NENHUM","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
  IF v ->> 'decisao' = 'NAO_ENVIA' AND v ->> 'motivo' = 'ia:INCERTA' THEN ok := array_append(ok, 'T2 IA incerta: não envia');
  ELSE falhas := array_append(falhas, 'T2: ' || v::text); END IF;

  ------------------------------------------------------------------ T3 resposta fora do contrato vira INCERTA
  v := public.fn_followup_ia_registrar(a2, '{"classificacao":"MANDA_AGORA"}', 'teste');
  IF v ->> 'decisao' = 'NAO_ENVIA' AND (SELECT ia_erro FROM public.followup_avaliacoes WHERE id = a2) = 'resposta_invalida'
  THEN ok := array_append(ok, 'T3 resposta inválida da IA = não envia');
  ELSE falhas := array_append(falhas, 'T3: ' || v::text); END IF;

  ------------------------------------------------------------------ T4 preocupação clínica apontada pela IA bloqueia
  v := public.fn_followup_ia_registrar(a2, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"OPCOES_HORARIO","sinais_de_preocupacao_clinica":["foi ao hospital"],"sinais_de_desinteresse":[]}', 'teste');
  IF v ->> 'motivo' = 'ia:preocupacao_clinica' THEN ok := array_append(ok, 'T4 sinal clínico da IA bloqueia');
  ELSE falhas := array_append(falhas, 'T4: ' || v::text); END IF;

  ------------------------------------------------------------------ T5 com autorização: programa uma tentativa
  INSERT INTO public.followup_contatos (telefone_chave, autorizacao, origem)
  SELECT public.fn_atrib_tel_chave('5561999000' || x), 'confirmada', 'teste' FROM generate_series(91, 94) x;
  v := public.fn_followup_decidir(a1);
  t := (v ->> 'tentativa_id')::uuid;
  IF t IS NOT NULL AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'PROGRAMADA'
     AND (SELECT mensagem_codigo FROM public.followup_tentativas WHERE id = t) = 'C'
  THEN ok := array_append(ok, 'T5 autorizado: tentativa PROGRAMADA com a mensagem C');
  ELSE falhas := array_append(falhas, 'T5: ' || v::text); END IF;

  ------------------------------------------------------------------ T6 decidir de novo não duplica
  v := public.fn_followup_decidir(a1);
  SELECT count(*) INTO n FROM public.followup_tentativas WHERE oportunidade_id = o1;
  IF n = 1 AND v ->> 'impedido_por' = 'oportunidade_ja_tem_tentativa' THEN ok := array_append(ok, 'T6 reprocessar não cria 2ª tentativa');
  ELSE falhas := array_append(falhas, format('T6: n=%s %s', n, v)); END IF;

  ------------------------------------------------------------------ T7 fora da janela: continua programada
  UPDATE public.followup_tentativas SET programada_para = now() + interval '2 hours' WHERE id = t;
  v := public.fn_followup_reservar(t);
  IF v ->> 'motivo' = 'fora_da_janela' AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'PROGRAMADA'
  THEN ok := array_append(ok, 'T7 antes da janela: não sai, continua programada');
  ELSE falhas := array_append(falhas, 'T7: ' || v::text); END IF;

  ------------------------------------------------------------------ T8 chave geral desligada
  UPDATE public.followup_tentativas SET programada_para = now() - interval '1 minute' WHERE id = t;
  UPDATE public.followup_config SET envio_ativo = false WHERE id = 1;
  v := public.fn_followup_reservar(t);
  IF v ->> 'motivo' = 'envio_desligado' AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'PROGRAMADA'
  THEN ok := array_append(ok, 'T8 chave geral desligada: nada sai');
  ELSE falhas := array_append(falhas, 'T8: ' || v::text); END IF;
  UPDATE public.followup_config SET envio_ativo = true WHERE id = 1;

  ------------------------------------------------------------------ T9 reserva atômica: só uma passa
  IF public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN
    v := public.fn_followup_reservar(t);
    v2 := public.fn_followup_reservar(t);
    IF (v ->> 'ok')::boolean AND v ->> 'texto' LIKE 'Oi!%' AND NOT (v2 ->> 'ok')::boolean AND v2 ->> 'motivo' = 'estado_EM_ENVIO'
    THEN ok := array_append(ok, 'T9 duas reservas da mesma tentativa: só uma envia');
    ELSE falhas := array_append(falhas, format('T9: %s | %s', v, v2)); END IF;

    -------------------------------------------------------------- T10 timeout: entrega desconhecida não reenvia
    v := public.fn_followup_resultado(t, 'ENTREGA_DESCONHECIDA', NULL, 'timeout');
    v2 := public.fn_followup_reservar(t);
    IF (v ->> 'ok')::boolean AND v2 ->> 'motivo' = 'estado_ENTREGA_DESCONHECIDA'
    THEN ok := array_append(ok, 'T10 timeout: não reenvia sozinho');
    ELSE falhas := array_append(falhas, format('T10: %s | %s', v, v2)); END IF;

    -------------------------------------------------------------- T11 família responde PARAR: respondida + recusa
    INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (c1, 'FUP-PARAR-' || c1, 'CLIENTE', 'PARAR');
    IF (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'RESPONDIDA'
       AND (SELECT autorizacao FROM public.followup_contatos WHERE telefone_chave = public.fn_atrib_tel_chave('556199900091')) = 'recusada'
    THEN ok := array_append(ok, 'T11 PARAR: respondida e contato recusado');
    ELSE falhas := array_append(falhas, 'T11: ' || (SELECT estado FROM public.followup_tentativas WHERE id = t)); END IF;

    -------------------------------------------------------------- T12 nova oportunidade da mesma família depois do PARAR
    INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, estado)
    VALUES (c1, public.fn_atrib_tel_chave('556199900091'), now() - interval '2 days', 'toque', 'aberta') RETURNING id INTO o1b;
    INSERT INTO public.followup_avaliacoes (dia, avaliado_em, oportunidade_id, conversa_id, situacao, motivo, ultima_clinica_em, contexto)
    VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, now(), o1b, c1, 'candidato', 'familia_parou', now() - interval '1 day 1 hour', 'horarios')
    RETURNING id INTO a1b;
    v := public.fn_followup_ia_registrar(a1b, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"OPCOES_HORARIO","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
    IF v ->> 'impedido_por' = 'contato_recusou' THEN ok := array_append(ok, 'T12 depois do PARAR: nunca mais programa');
    ELSE falhas := array_append(falhas, 'T12: ' || v::text); END IF;
  ELSE
    ok := array_append(ok, 'T9-T12 pulados: hoje não é dia útil');
  END IF;

  ------------------------------------------------------------------ T13 família escreve antes do envio: cancela
  v := public.fn_followup_ia_registrar(a2, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"AGENDAMENTO_INTERROMPIDO","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
  t2 := (v ->> 'tentativa_id')::uuid;
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (c2, 'FUP-RESP-' || c2, 'CLIENTE', 'Oi, ainda quero sim');
  s := (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2);
  IF s = 'CANCELADA/familia_escreveu' THEN ok := array_append(ok, 'T13 família escreveu antes: cancelada');
  ELSE falhas := array_append(falhas, 'T13: ' || coalesce(s, 'sem tentativa ' || v::text)); END IF;

  ------------------------------------------------------------------ T14 Lolô reassume: cancela
  v := public.fn_followup_ia_registrar(a3, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"AGENDAMENTO_INTERROMPIDO","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
  t2 := (v ->> 'tentativa_id')::uuid;
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (c3, 'FUP-LOLO-' || c3, 'HUMANO', 'Oi! Consegui um horário pra amanhã');
  s := (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2);
  IF s = 'CANCELADA/lolo_conduzindo' THEN ok := array_append(ok, 'T14 Lolô reassumiu: cancelada');
  ELSE falhas := array_append(falhas, 'T14: ' || coalesce(s, 'sem tentativa ' || v::text)); END IF;

  ------------------------------------------------------------------ T15 SEM IA aplicada antes do envio: suprime
  v := public.fn_followup_ia_registrar(a4, '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"CADASTRO_PENDENTE","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}', 'teste');
  t2 := (v ->> 'tentativa_id')::uuid;
  IF (SELECT mensagem_codigo FROM public.followup_tentativas WHERE id = t2) = 'B' THEN ok := array_append(ok, 'T15a cadastro pendente usa a mensagem B');
  ELSE falhas := array_append(falhas, 'T15a: ' || v::text); END IF;
  UPDATE public.followup_tentativas SET programada_para = now() - interval '1 minute' WHERE id = t2;
  UPDATE public.ju_conversas SET sem_ia = true WHERE id = c4;
  v := public.fn_followup_reservar(t2);
  s := (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2);
  IF s = 'SUPRIMIDA/sem_ia' THEN ok := array_append(ok, 'T15 SEM IA antes do envio: suprimida');
  ELSE falhas := array_append(falhas, 'T15: ' || coalesce(s, '?') || ' ' || v::text); END IF;

  ------------------------------------------------------------------ T16 oportunidade agendada antes do envio: cancela/suprime
  UPDATE public.ju_conversas SET sem_ia = false WHERE id = c4;
  UPDATE public.followup_tentativas SET estado = 'PROGRAMADA', motivo = 'teste' WHERE id = t2;
  UPDATE public.atrib_oportunidades SET estado = 'agendada' WHERE id = o4;
  v := public.fn_followup_reservar(t2);
  IF v ->> 'motivo' = 'oportunidade_agendada' AND (SELECT estado FROM public.followup_tentativas WHERE id = t2) = 'SUPRIMIDA'
  THEN ok := array_append(ok, 'T16 agendou antes do envio: não sai');
  ELSE falhas := array_append(falhas, 'T16: ' || v::text); END IF;

  ------------------------------------------------------------------ T17 manutenção: sem resposta em 7 dias → encerrada
  UPDATE public.followup_tentativas SET estado = 'EM_ENVIO' WHERE id = t2;
  PERFORM public.fn_followup_resultado(t2, 'ENVIADA', 'prov-1', 'ok');
  UPDATE public.followup_tentativas SET tentativa_em = now() - interval '8 days' WHERE id = t2;
  v := public.fn_followup_manutencao();
  IF (SELECT estado FROM public.followup_tentativas WHERE id = t2) = 'ENCERRADA'
  THEN ok := array_append(ok, 'T17 sem resposta: encerrada, sem 2ª tentativa');
  ELSE falhas := array_append(falhas, 'T17: ' || v::text); END IF;

  ------------------------------------------------------------------ T18 histórico de transições e imutável
  SELECT count(*) INTO n FROM public.followup_transicoes WHERE tentativa_id = t2;
  BEGIN
    UPDATE public.followup_transicoes SET motivo = 'x' WHERE tentativa_id = t2;
    falhas := array_append(falhas, 'T18 histórico aceitou UPDATE');
  EXCEPTION WHEN others THEN
    IF n >= 5 THEN ok := array_append(ok, format('T18 %s transições registradas, histórico imutável', n));
    ELSE falhas := array_append(falhas, 'T18 transições: ' || n); END IF;
  END;

  ------------------------------------------------------------------ T19 trigger nunca quebra o recebimento
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (c4, 'FUP-OK-' || c4, 'CLIENTE', NULL);
  ok := array_append(ok, 'T19 mensagem sem texto não quebra o gatilho');

  ------------------------------------------------------------------ T20 próxima janela cai em dia útil, 10h ou 15h
  s := to_char(public.fn_followup_proxima_janela('2026-10-31 12:00-03') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI');
  IF s = '03/11 10:00' THEN ok := array_append(ok, 'T20 sábado + feriado de Finados: próxima janela 03/11 10h');
  ELSE falhas := array_append(falhas, 'T20: ' || s); END IF;

  RAISE EXCEPTION E'RESULTADO % OK, % FALHA(S)\nOK: %\nFALHAS: %',
    coalesce(array_length(ok, 1), 0), coalesce(array_length(falhas, 1), 0),
    array_to_string(ok, ' | '), coalesce(array_to_string(falhas, E'\n'), '-');
END
$teste$;
