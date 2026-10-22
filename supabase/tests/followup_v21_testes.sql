-- =====================================================================
-- Testes do follow-up V2.1 (sequência FU1 IA + FU2 fixo) com dados FICTÍCIOS.
-- Rodar DEPOIS de followup_v21.sql, na mesma transação: termina em RAISE,
-- nada fica gravado. A janela é aberta só dentro do teste (00:00-23:59).
-- Números entre parênteses = itens da lista de testes obrigatórios do dono.
-- =====================================================================
DO $teste$
DECLARE
  ok text[] := '{}'; falhas text[] := '{}';
  v jsonb; v2 jsonb; s text; n bigint; i int;
  conv bigint[]; opp bigint[]; av bigint[]; ids int[];
  t uuid; t2 uuid; m1 bigint; m2 bigint; bom jsonb;
  ia_ok jsonb := '{"classificacao":"CANDIDATA","quem_deve_agir":"FAMILIA","cenario":"OPCOES_HORARIO","sinais_de_preocupacao_clinica":[],"sinais_de_desinteresse":[]}';
BEGIN
  IF NOT public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN
    RAISE EXCEPTION 'RESULTADO pulado: hoje não é dia útil (rode num dia útil)';
  END IF;
  UPDATE public.followup_config SET janela_inicio = '00:00', janela_fim = '23:59:59', envio_ativo = true, canal_autorizado = true WHERE id = 1;

  -- 9 famílias fictícias (55619990008N): conversa, oportunidade, família pede, clínica oferece há 2 h
  FOR i IN 1..9 LOOP
    DELETE FROM public.ju_conversas WHERE wa_chatid = '5561999000' || (80 + i) || '@s.whatsapp.net';
    INSERT INTO public.ju_conversas (wa_chatid, telefone)
    VALUES ('5561999000' || (80 + i) || '@s.whatsapp.net', public.fn_ju_telefone('5561999000' || (80 + i)))
    RETURNING id INTO n;
    conv := array_append(conv, n);
    INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, estado)
    VALUES (n, public.fn_atrib_tel_chave('5561999000' || (80 + i)), now() - interval '3 hours', 'primeiro_contato', 'aberta')
    RETURNING id INTO m1;
    opp := array_append(opp, m1);
    INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo, created_at) VALUES
      (n, 'V21-' || n || '-1', 'CLIENTE', 'Oi, quero agendar fisio pro meu filho', now() - interval '2 hours 30 minutes'),
      (n, 'V21-' || n || '-2', 'HUMANO', 'Temos amanhã às 10h ou às 15h. Qual prefere?', now() - interval '2 hours');
    INSERT INTO public.followup_avaliacoes (dia, avaliado_em, oportunidade_id, conversa_id, situacao, motivo, ultimo_autor,
                                            ultima_clinica_em, contexto, ia_classificacao, ia_resultado, ia_em)
    VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, now() - interval '1 minute', m1, n, 'candidato', 'familia_parou', 'HUMANO',
            now() - interval '2 hours', 'horarios', 'CANDIDATA', ia_ok, now())
    RETURNING id INTO m2;
    av := array_append(av, m2);
  END LOOP;

  ------------------------------------------------------------------ V1 decisão cria FU1 programado (real), sem texto
  v := public.fn_followup_decidir(av[1]);
  t := (v ->> 'tentativa_id')::uuid;
  IF t IS NOT NULL AND (SELECT sequencia || '/' || estado || '/' || sombra FROM public.followup_tentativas WHERE id = t) = '1/PROGRAMADA/false'
  THEN ok := array_append(ok, 'V1 decisão: FU1 programado');
  ELSE falhas := array_append(falhas, 'V1: ' || v::text); END IF;

  ------------------------------------------------------------------ V2 sem texto aprovado não sai
  v := public.fn_followup_reservar(t);
  IF v ->> 'motivo' = 'texto_pendente' AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'PROGRAMADA'
  THEN ok := array_append(ok, 'V2 sem texto aprovado: espera');
  ELSE falhas := array_append(falhas, 'V2: ' || v::text); END IF;

  ------------------------------------------------------------------ V3 lote pede a redação com a conversa atual
  v := public.fn_followup_envio_lote();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'itens') e WHERE (e ->> 'tentativa_id')::uuid = t
               AND (e ->> 'precisa_texto')::boolean AND jsonb_array_length(e -> 'redacao' -> 'conversa') = 2)
  THEN ok := array_append(ok, 'V3 lote pede a redação com a conversa atual');
  ELSE falhas := array_append(falhas, 'V3: ' || left(v::text, 300)); END IF;

  ------------------------------------------------------------------ V4 validação de texto (13, 14, 15 e outros)
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[1];
  s := concat_ws(' | ',
    public.fn_followup_validar_texto('Consegui uma vaga pra você amanhã cedo, quer que eu confirme?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Ele melhorou da tosse, quer seguir com o agendamento?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Conseguiu ver os horários? Prefere manhã? Ou tarde?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Percebemos que você não respondeu. Quer ver os horários?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Conseguiu dar uma olhadinha nos horários?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Conseguiu ver os horários que conversamos?', 'cadastro', 'OPCOES_HORARIO', ids, ids, 220),
    public.fn_followup_validar_texto('Conseguiu ver os horários que conversamos?', 'escolha_de_horario', 'OPCOES_HORARIO', ARRAY[999999999], ids, 220),
    public.fn_followup_validar_texto('Ficou alguma dúvida sobre o valor da sessão?', 'informacao_pendente', 'AGENDAMENTO_INTERROMPIDO', ids, ids, 220),
    public.fn_followup_validar_texto('Oi! Eu sou a Ju, ajudante da recepção. Quer ver os horários?', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220));
  IF s = 'promessa_de_vaga | conteudo_clinico | mais_de_uma_pergunta | cobranca_de_resposta | diminutivo | pendencia_incoerente | evidencia_invalida | valor_ou_desconto | reapresentacao'
     AND public.fn_followup_validar_texto('Conseguiu ver as opções de horário que te passei? Se quiser seguir, te ajudo por aqui.', 'escolha_de_horario', 'OPCOES_HORARIO', ids, ids, 220) IS NULL
  THEN ok := array_append(ok, 'V4 validação: reprova vaga, sintoma, 2+ perguntas, cobrança de resposta, diminutivo, pendência errada, evidência falsa, valor, reapresentação; aprova o texto bom');
  ELSE falhas := array_append(falhas, 'V4: ' || s); END IF;

  ------------------------------------------------------------------ V5 IA retorna NAO_GERAR (16)
  t2 := (public.fn_followup_decidir(av[2]) ->> 'tentativa_id')::uuid;
  v := public.fn_followup_texto_registrar(t2, '{"gerar":false,"texto":null,"tipo_pendencia":"incerta","evidencias_mensagem_ids":[],"justificativa":"x"}', 'teste');
  IF (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2) = 'SUPRIMIDA/ia_nao_gerou'
  THEN ok := array_append(ok, 'V5 NAO_GERAR: nenhum envio');
  ELSE falhas := array_append(falhas, 'V5: ' || v::text); END IF;

  ------------------------------------------------------------------ V6 IA inventa vaga (13): reprovado, sem texto genérico no lugar
  t2 := (public.fn_followup_decidir(av[3]) ->> 'tentativa_id')::uuid;
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[3];
  v := public.fn_followup_texto_registrar(t2, jsonb_build_object('gerar', true, 'texto', 'Temos vaga amanhã cedo, confirmo pra você?',
        'tipo_pendencia', 'escolha_de_horario', 'evidencias_mensagem_ids', to_jsonb(ids), 'justificativa', 'x'), 'teste');
  IF (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2) = 'SUPRIMIDA/texto_reprovado:promessa_de_vaga'
  THEN ok := array_append(ok, 'V6 IA inventou vaga: reprovado e suprimido');
  ELSE falhas := array_append(falhas, 'V6: ' || v::text); END IF;

  ------------------------------------------------------------------ V7 texto bom → dois jobs = um envio (17) → FU2 programado
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[1];
  bom := jsonb_build_object('gerar', true, 'texto', 'Conseguiu ver as opções de horário que te passei? Se quiser seguir, te ajudo por aqui.',
         'tipo_pendencia', 'escolha_de_horario', 'evidencias_mensagem_ids', to_jsonb(ids), 'justificativa', 'ofereceu horários');
  PERFORM public.fn_followup_texto_registrar(t, bom, 'teste');
  v := public.fn_followup_reservar(t); v2 := public.fn_followup_reservar(t);
  IF (v ->> 'ok')::boolean AND NOT (v ->> 'sombra')::boolean AND v ->> 'texto' LIKE 'Conseguiu ver%' AND NOT (v2 ->> 'ok')::boolean
  THEN ok := array_append(ok, 'V7 dois jobs: um único envio, com o texto aprovado');
  ELSE falhas := array_append(falhas, format('V7: %s | %s', v, v2)); END IF;
  PERFORM public.fn_followup_resultado(t, 'ENVIADA', 'prov-1', 'ok');
  SELECT id INTO t2 FROM public.followup_tentativas WHERE anterior_id = t;
  IF t2 IS NOT NULL AND (SELECT estado || '/' || mensagem_codigo FROM public.followup_tentativas WHERE id = t2) = 'PROGRAMADA/FINAL'
     AND (SELECT programada_para FROM public.followup_tentativas WHERE id = t2) >= now() + interval '23 hours 59 minutes'
  THEN ok := array_append(ok, 'V7b FU1 aceito: FU2 fixo programado para 24 h depois');
  ELSE falhas := array_append(falhas, 'V7b: FU2 não programado'); END IF;

  ------------------------------------------------------------------ V8 FU2: espera 24 h; texto exato (19); encerra (20)
  v := public.fn_followup_reservar(t2);
  IF v ->> 'motivo' IN ('cedo','fora_da_janela') AND (SELECT estado FROM public.followup_tentativas WHERE id = t2) = 'PROGRAMADA'
  THEN ok := array_append(ok, 'V8 FU2 antes de 24 h: espera');
  ELSE falhas := array_append(falhas, 'V8: ' || v::text); END IF;
  -- simula que o FU1 saiu há 25 h (a conversa inteira anda junto no tempo)
  UPDATE public.ju_mensagens SET created_at = created_at - interval '25 hours' WHERE conversa_id = conv[1];
  UPDATE public.followup_tentativas SET tentativa_em = now() - interval '25 hours', base_em = base_em - interval '25 hours' WHERE id = t;
  UPDATE public.followup_tentativas SET base_em = base_em - interval '25 hours' WHERE id = t2;
  UPDATE public.followup_tentativas SET programada_para = now() - interval '1 minute' WHERE id = t2;
  v := public.fn_followup_reservar(t2);
  PERFORM public.fn_followup_resultado(t2, 'ENVIADA', 'prov-2', 'ok');
  IF (v ->> 'ok')::boolean AND v ->> 'texto' = 'Qualquer coisa, estamos por aqui! 💚'
     AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'ENCERRADA'
     AND NOT EXISTS (SELECT 1 FROM public.followup_tentativas WHERE anterior_id = t2)
  THEN ok := array_append(ok, 'V8b FU2 com o texto fixo exato; sequência encerrada, sem 3ª mensagem');
  ELSE falhas := array_append(falhas, 'V8b: ' || v::text); END IF;
  v := public.fn_followup_decidir(av[1]);
  IF v ->> 'impedido_por' = 'oportunidade_ja_tem_tentativa' THEN ok := array_append(ok, 'V8c a mesma oportunidade não reinicia a sequência');
  ELSE falhas := array_append(falhas, 'V8c: ' || v::text); END IF;

  ------------------------------------------------------------------ V9 mesma família dentro de 30 dias (21)
  INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, estado)
  VALUES (conv[1], public.fn_atrib_tel_chave('556199900081'), now() - interval '2 hours', 'toque', 'aberta') RETURNING id INTO m1;
  INSERT INTO public.followup_avaliacoes (dia, oportunidade_id, conversa_id, situacao, motivo, ultima_clinica_em, contexto,
                                          ia_classificacao, ia_resultado, ia_em)
  VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, m1, conv[1], 'candidato', 'familia_parou', now() - interval '2 hours',
          'horarios', 'CANDIDATA', ia_ok, now()) RETURNING id INTO m2;
  v := public.fn_followup_decidir(m2);
  IF v ->> 'impedido_por' = 'limite_familia_30_dias' THEN ok := array_append(ok, 'V9 mesma família em 30 dias: sem nova sequência');
  ELSE falhas := array_append(falhas, 'V9: ' || v::text); END IF;

  ------------------------------------------------------------------ V10 família responde antes do envio (9, 23)
  t2 := (public.fn_followup_decidir(av[4]) ->> 'tentativa_id')::uuid;
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (conv[4], 'V21-R4', 'CLIENTE', 'Pode ser às 15h');
  IF (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2) = 'CANCELADA/familia_escreveu'
  THEN ok := array_append(ok, 'V10 família respondeu antes do envio: cancelado');
  ELSE falhas := array_append(falhas, 'V10: ' || coalesce((SELECT estado FROM public.followup_tentativas WHERE id = t2), '?')); END IF;

  ------------------------------------------------------------------ V11 família responde ao FU1 → FU2 cancelado (10)
  t := (public.fn_followup_decidir(av[5]) ->> 'tentativa_id')::uuid;
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[5];
  PERFORM public.fn_followup_texto_registrar(t, bom || jsonb_build_object('evidencias_mensagem_ids', to_jsonb(ids)), 'teste');
  PERFORM public.fn_followup_reservar(t);
  PERFORM public.fn_followup_resultado(t, 'ENVIADA', 'prov-5', 'ok');
  SELECT id INTO t2 FROM public.followup_tentativas WHERE anterior_id = t;
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (conv[5], 'V21-R5', 'CLIENTE', 'Quero sim, pode ser às 10h');
  IF (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'RESPONDIDA'
     AND (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2) = 'CANCELADA/familia_escreveu'
  THEN ok := array_append(ok, 'V11 família respondeu ao FU1: respondida e FU2 cancelado');
  ELSE falhas := array_append(falhas, 'V11: ' || coalesce((SELECT estado FROM public.followup_tentativas WHERE id = t2), '?')); END IF;

  ------------------------------------------------------------------ V12 Lolô escreve antes do envio (11)
  t2 := (public.fn_followup_decidir(av[6]) ->> 'tentativa_id')::uuid;
  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo) VALUES (conv[6], 'V21-L6', 'HUMANO', 'Oi! Consegui encaixar');
  IF (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2) = 'CANCELADA/lolo_conduzindo'
  THEN ok := array_append(ok, 'V12 Lolô escreveu: cancelado');
  ELSE falhas := array_append(falhas, 'V12: ' || coalesce((SELECT estado FROM public.followup_tentativas WHERE id = t2), '?')); END IF;

  ------------------------------------------------------------------ V13 agenda recebe consulta antes do envio (12)
  t2 := (public.fn_followup_decidir(av[7]) ->> 'tentativa_id')::uuid;
  UPDATE public.atrib_oportunidades SET estado = 'agendada' WHERE id = opp[7];
  PERFORM public.fn_followup_manutencao();
  IF (SELECT estado FROM public.followup_tentativas WHERE id = t2) IN ('CANCELADA','SUPRIMIDA')
  THEN ok := array_append(ok, 'V13 agendou antes do envio: não sai');
  ELSE falhas := array_append(falhas, 'V13: ' || coalesce((SELECT estado FROM public.followup_tentativas WHERE id = t2), '?')); END IF;

  ------------------------------------------------------------------ V14 timeout na uazapi: nada de reenvio nem FU2 (18)
  t := (public.fn_followup_decidir(av[8]) ->> 'tentativa_id')::uuid;
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[8];
  PERFORM public.fn_followup_texto_registrar(t, bom || jsonb_build_object('evidencias_mensagem_ids', to_jsonb(ids)), 'teste');
  PERFORM public.fn_followup_reservar(t);
  PERFORM public.fn_followup_resultado(t, 'ENTREGA_DESCONHECIDA', NULL, 'timeout');
  v := public.fn_followup_reservar(t);
  IF NOT (v ->> 'ok')::boolean AND NOT EXISTS (SELECT 1 FROM public.followup_tentativas WHERE anterior_id = t)
  THEN ok := array_append(ok, 'V14 timeout: sem reenvio e sem FU2');
  ELSE falhas := array_append(falhas, 'V14: ' || v::text); END IF;

  ------------------------------------------------------------------ V15 SEM IA e recusa bloqueiam (22)
  t2 := (public.fn_followup_decidir(av[9]) ->> 'tentativa_id')::uuid;
  UPDATE public.ju_conversas SET sem_ia = true WHERE id = conv[9];
  PERFORM public.fn_followup_manutencao();
  s := (SELECT estado || '/' || motivo FROM public.followup_tentativas WHERE id = t2);
  INSERT INTO public.followup_contatos (telefone_chave, autorizacao) VALUES (public.fn_atrib_tel_chave('556199900082'), 'recusada')
  ON CONFLICT (telefone_chave) DO UPDATE SET autorizacao = 'recusada';
  DELETE FROM public.followup_tentativas WHERE oportunidade_id = opp[2];
  v := public.fn_followup_decidir(av[2]);
  IF s = 'SUPRIMIDA/sem_ia' AND v ->> 'impedido_por' = 'contato_recusou'
  THEN ok := array_append(ok, 'V15 SEM IA suprime; contato recusado nunca programa');
  ELSE falhas := array_append(falhas, format('V15: %s | %s', s, v)); END IF;

  ------------------------------------------------------------------ V16 modo sombra: sequência inteira simulada, nada sai
  UPDATE public.followup_config SET envio_ativo = false WHERE id = 1;
  DELETE FROM public.followup_tentativas WHERE oportunidade_id = opp[3];
  t := (public.fn_followup_decidir(av[3]) ->> 'tentativa_id')::uuid;
  SELECT array_agg(id::int) INTO ids FROM public.ju_mensagens WHERE conversa_id = conv[3];
  PERFORM public.fn_followup_texto_registrar(t, bom || jsonb_build_object('evidencias_mensagem_ids', to_jsonb(ids)), 'teste');
  v := public.fn_followup_reservar(t);
  SELECT id INTO t2 FROM public.followup_tentativas WHERE anterior_id = t;
  IF (SELECT sombra FROM public.followup_tentativas WHERE id = t) AND (v ->> 'sombra')::boolean
     AND (SELECT estado FROM public.followup_tentativas WHERE id = t) = 'SIMULADA' AND v ->> 'wa_chatid' IS NULL
     AND (SELECT sombra AND estado = 'PROGRAMADA' FROM public.followup_tentativas WHERE id = t2)
  THEN ok := array_append(ok, 'V16 sombra: FU1 SIMULADA (sem envio) e FU2 de sombra programado');
  ELSE falhas := array_append(falhas, 'V16: ' || v::text); END IF;

  ------------------------------------------------------------------ V17 janela: 18h de sexta → segunda 9h; feriado pulado
  UPDATE public.followup_config SET janela_inicio = '09:00', janela_fim = '17:30' WHERE id = 1;
  s := to_char(public.fn_followup_proxima_janela('2026-10-30 18:00-03') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
       || ' ' || to_char(public.fn_followup_proxima_janela('2026-10-22 11:00-03') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI');
  IF s = '03/11 09:00 22/10 11:00' THEN ok := array_append(ok, 'V17 janela 9h-17h30: sexta 18h → terça 03/11 9h (Finados); dentro da janela = agora');
  ELSE falhas := array_append(falhas, 'V17: ' || s); END IF;

  RAISE EXCEPTION E'RESULTADO % OK, % FALHA(S)\nOK: %\nFALHAS: %',
    coalesce(array_length(ok, 1), 0), coalesce(array_length(falhas, 1), 0),
    array_to_string(ok, ' | '), coalesce(array_to_string(falhas, E'\n'), '-');
END
$teste$;
