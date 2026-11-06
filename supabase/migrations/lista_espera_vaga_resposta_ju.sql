-- AI dev note: 06/11/2026 (pedido do dono, caso Pat/Laura). Vaga da lista de espera oferecida pelo botão
-- "📲 Oferecer horário":
-- 1) Texto para a família menos robótico: "Esse horário ficaria bom para vocês?" (sai o "é só responder por
--    aqui que a equipe confirma").
-- 2) Família ACEITOU → a Ju marca direto (fn_ju_agendar, mesmo caminho do @ju) e avisa no 🩺 Agenda. Serviço =
--    última consulta da criança do mesmo tipo (avaliação motora vira sessão; SOCIAL vira o normal). Sem cadastro,
--    sem consulta anterior desse tipo ou domiciliar → não marca: avisa no grupo e a Ju chama a secretaria.
--    Troca (criança já marcada) continua pelo card de troca (fn_ju_troca_pedir).
-- 3) Família RECUSOU → avisa no 🩺 Agenda e a vaga passa para o próximo da lista (fn_le_vaga_avancar).
-- Entrada: ação RESPONDER_VAGA em fn_ju_acao_fixo (ferramenta responder_vaga_oferecida no Atendimento) e
-- também a ferramenta já existente agendar_horario_oferecido (AGENDAR_OFERTA), que agora cai aqui quando a
-- oferta mais recente da conversa é uma vaga da lista.

CREATE OR REPLACE FUNCTION public.fn_le_vaga_da_conversa(p_conversa_id bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT v.id FROM lista_espera_vagas v
   WHERE v.oferta_conversa_id = p_conversa_id AND v.status = 'oferecida' AND v.oferta_em > now() - interval '24 hours'
     AND v.data_hora > now() AT TIME ZONE 'America/Sao_Paulo'
   ORDER BY v.oferta_em DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_vaga_responder(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  c ju_conversas; v lista_espera_vagas; le lista_espera; t tipo_servicos;
  v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_aceitou boolean; v_motivo text := nullif(btrim(coalesce(p ->> 'motivo', p ->> 'resumo', '')), '');
  v_prof text; v_quando text; v_cab text; v_msg bigint; v_serv uuid; r jsonb; v_por_equipe text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;
  SELECT * INTO v FROM lista_espera_vagas WHERE id = fn_le_vaga_da_conversa(c.id) FOR UPDATE;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Não há horário da lista de espera oferecido em aberto nesta conversa; nada foi feito. Se a família quer agendar, chame a secretaria (AGENDAMENTO) e diga que a Lolô confirma por aqui.');
  END IF;
  SELECT * INTO le FROM lista_espera WHERE id = v.candidato_id;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = v.profissional_id;
  v_quando := fn_ju_quando(v.data_hora);
  v_cab := v_quando || coalesce(' · ' || v_prof, '') || ' · ' || CASE v.tipo WHEN 'respiratoria' THEN 'respiratória' ELSE 'motora' END;
  BEGIN v_aceitou := (p ->> 'aceitou')::boolean; EXCEPTION WHEN others THEN v_aceitou := NULL; END;
  IF v_aceitou IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Diga se a família aceitou (aceitou=true) ou recusou (aceitou=false) o horário; nada foi feito.');
  END IF;

  -- Recusou: avisa o grupo e a vaga vai para o próximo da lista
  IF NOT v_aceitou THEN
    PERFORM fn_le_card('❌ *Não quis o horário*' || E'\n' || v_cab || E'\n\n'
      || 'A família de *' || le.nome || '* recusou' || coalesce(' (' || left(v_motivo, 150) || ')', '')
      || '. Continua na lista de espera.', '{}');
    PERFORM fn_le_vaga_avancar(v.id, 'Ju (família recusou)');
    RETURN jsonb_build_object('ok', true, 'resposta',
      'A família recusou; a equipe já foi avisada e a criança continua na lista de espera. Responda em uma frase, sem oferecer outros horários: tudo bem, e a gente avisa se abrir outro horário.');
  END IF;

  -- Aceitou, mas é troca de uma consulta já marcada: segue o card de troca de sempre
  IF le.agendamento_atual_id IS NOT NULL THEN
    RETURN fn_ju_troca_pedir(p || jsonb_build_object('acao', 'TROCAR_HORARIO', 'agendamento_id', le.agendamento_atual_id,
                                                     'data', to_char(v.data_hora, 'YYYY-MM-DD'), 'hora', to_char(v.data_hora, 'HH24:MI')));
  END IF;

  IF fn_le_vaga_ocupada(v) THEN
    PERFORM fn_le_card('⚠️ *Aceitou, mas o horário já foi ocupado*' || E'\n' || v_cab || E'\n\n'
      || 'A família de *' || le.nome || '* aceitou. Continua na lista de espera.', '{}');
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Esse horário acabou de ser ocupado; nada foi agendado. Peça desculpas em uma frase e diga que continua na lista e a gente avisa se abrir outro.');
  END IF;

  -- Serviço: última consulta da criança do mesmo tipo
  IF le.paciente_id IS NOT NULL THEN
    SELECT ts.* INTO t FROM agendamentos a JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.paciente_id = le.paciente_id AND a.ativo AND fn_lista_espera_tipo_servico(a.tipo_servico_id) = v.tipo
     ORDER BY a.data_hora DESC LIMIT 1;
    IF t.id IS NOT NULL THEN
      SELECT coalesce((SELECT t2.id FROM tipo_servicos t2
                        WHERE t2.ativo AND lower(regexp_replace(t2.nome, '\s+', ' ', 'g')) =
                              CASE WHEN t.nome ~* '^avalia.*motora.*domiciliar' THEN 'fisioterapia motora - domiciliar - du'
                                   WHEN t.nome ~* '^avalia.*motora' THEN 'fisioterapia motora - du'
                                   WHEN t.nome ~* '- social$' THEN lower(regexp_replace(regexp_replace(t.nome, '\s+', ' ', 'g'), ' - social$', ' - du', 'i'))
                              END LIMIT 1), t.id) INTO v_serv;
    END IF;
  END IF;
  v_por_equipe := CASE WHEN le.paciente_id IS NULL THEN 'sem cadastro'
                       WHEN v_serv IS NULL THEN 'sem consulta anterior desse tipo'
                       WHEN t.nome ~* 'domic' THEN 'atendimento domiciliar' END;

  IF v_por_equipe IS NULL THEN
    SELECT m.id INTO v_msg FROM ju_mensagens m WHERE m.conversa_id = c.id AND m.origem = 'CLIENTE'
     ORDER BY m.created_at DESC LIMIT 1;
    IF v_msg IS NULL THEN v_por_equipe := 'sem mensagem da família'; END IF;
  END IF;

  IF v_por_equipe IS NULL THEN
    INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)
    VALUES (c.id, v_msg, 'Vaga #' || v.id || ' da lista de espera aceita pela família', 'executando')
    ON CONFLICT (mensagem_id) DO NOTHING;
    r := fn_ju_agendar(c.id, v_msg, le.paciente_id, v.data_hora::date, to_char(v.data_hora, 'HH24:MI'), v.profissional_id, v_serv);
    IF coalesce((r ->> 'ok')::boolean, false) THEN
      UPDATE agendamentos SET observacao = 'Agendado pela Ju: a família aceitou o horário da lista de espera oferecido pela recepção.'
       WHERE id = (r ->> 'agendamento_id')::uuid AND (r ->> 'codigo') = 'AGENDADO';
      PERFORM fn_le_apagar(v.card_msg_id, v.card_req_id);
      UPDATE lista_espera_vagas SET status = 'preenchida', resolvido_por = 'Ju (família aceitou)', resolvido_em = now(),
             card_req_id = NULL, card_msg_id = NULL
       WHERE id = v.id;
      PERFORM fn_le_card('✅ *Agendado pela Ju*' || E'\n' || v_cab || E'\n\n'
        || '*' || le.nome || '*: a família aceitou o horário da lista de espera'
        || coalesce('. Serviço: ' || (r ->> 'servico'), '') || '.', '{}');
      RETURN jsonb_build_object('ok', true, 'resposta', CASE WHEN r ->> 'codigo' = 'JA_AGENDADO'
        THEN 'Esse horário já estava marcado para a criança; nada novo foi agendado. Diga só que já está marcado.'
        ELSE 'Agendado: ' || v_quando || ' com a ' || v_prof || '. Diga à família, em uma frase, que está marcado e que a confirmação chega em seguida por aqui.' END);
    END IF;
    IF r ->> 'codigo' = 'HORARIO_OCUPADO' THEN
      PERFORM fn_le_card('⚠️ *Aceitou, mas o horário já foi ocupado*' || E'\n' || v_cab || E'\n\n'
        || 'A família de *' || le.nome || '* aceitou. Continua na lista de espera.', '{}');
      RETURN jsonb_build_object('ok', false, 'resposta',
        'Esse horário acabou de ser ocupado; nada foi agendado. Peça desculpas em uma frase e diga que continua na lista e a gente avisa se abrir outro.');
    END IF;
    v_por_equipe := 'o sistema não deixou marcar: ' || coalesce(r ->> 'codigo', 'erro');
  END IF;

  -- Não deu para marcar sozinha: a equipe marca
  PERFORM fn_le_card('📲 *Aceitou o horário: marcar na agenda*' || E'\n' || v_cab || E'\n\n'
    || 'A família de *' || le.nome || '* aceitou. Não marquei sozinha (' || v_por_equipe || ').', '{}');
  RETURN jsonb_build_object('ok', false, 'resposta',
    'A família aceitou, mas a marcação fica com a equipe (' || v_por_equipe || '). Chame a secretaria (AGENDAMENTO) dizendo que aceitou '
    || v_quando || ' com a ' || v_prof || ' e diga à família, em uma frase, que a Lolô confirma por aqui.');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_vaga_responder(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_le_vaga_da_conversa(bigint) FROM PUBLIC, anon, authenticated;

-- Texto da oferta
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_le_vaga_oferecer(bigint,text)'::regprocedure); n text;
BEGIN
  n := replace(d, $a$'. Quer trocar para esse horário? É só me responder por aqui.'$a$, $a$'. Esse horário ficaria melhor para vocês?'$a$);
  n := replace(n, $a$'. Quer esse horário? É só me responder por aqui que a equipe confirma.'$a$, $a$'. Esse horário ficaria bom para vocês?'$a$);
  IF n = d OR position('É só me responder' IN n) > 0 THEN RAISE EXCEPTION 'fn_le_vaga_oferecer: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;

-- Instrução da Ju quando a família responde à vaga
CREATE OR REPLACE FUNCTION public.fn_lista_espera_oferta(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT jsonb_build_object(
           'quando', fn_ju_quando(v.data_hora), 'data', to_char(v.data_hora, 'YYYY-MM-DD'), 'hora', to_char(v.data_hora, 'HH24:MI'),
           'fisio', split_part(btrim(p.nome), ' ', 1), 'paciente', c.nome, 'agendamento_id', c.agendamento_atual_id,
           'instrucao',
           'A equipe ofereceu à família o horário que vagou (' || fn_ju_quando(v.data_hora) || ' com a ' || split_part(btrim(p.nome), ' ', 1) || ')'
           || CASE WHEN c.agendamento_atual_id IS NOT NULL
                   THEN ' no lugar da consulta de ' || fn_ju_quando(a.data_hora AT TIME ZONE 'UTC') || '.' ELSE '.' END
           || ' Quando a família responder, use responder_vaga_oferecida: aceitou=true se aceitou, aceitou=false se recusou ou disse que não dá'
           || ' (em motivo, o que ela disse em poucas palavras). O resultado diz o que responder. Se a família só perguntou algo'
           || ' sobre o horário, responda e não use a ferramenta ainda. Não ofereça outros horários.')
    FROM lista_espera_vagas v
    JOIN lista_espera c ON c.id = v.candidato_id
    JOIN pessoas p ON p.id = v.profissional_id
    LEFT JOIN agendamentos a ON a.id = c.agendamento_atual_id
   WHERE v.id = fn_le_vaga_da_conversa(p_conversa_id);
$$;

-- Despacho
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_acao_fixo(jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%RESPONDER_VAGA%' THEN RETURN; END IF;
  n := replace(d, $a$  IF v_acao = 'AGENDAR_OFERTA' THEN RETURN public.fn_ju_oferta_agendar(p); END IF;$a$,
                  $a$  IF v_acao = 'AGENDAR_OFERTA' THEN RETURN public.fn_ju_oferta_agendar(p); END IF;
  IF v_acao = 'RESPONDER_VAGA' THEN RETURN public.fn_ju_vaga_responder(p); END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_acao_fixo: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;

-- agendar_horario_oferecido também serve para a vaga (quando é a oferta mais recente da conversa)
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_oferta_agendar(jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%fn_le_vaga_da_conversa%' THEN RETURN; END IF;
  n := replace(d, $a$  SELECT * INTO o FROM ju_ofertas_horario
   WHERE conversa_id = c.id AND status = 'aberta' AND criado_em > now() - interval '3 days'
   ORDER BY criado_em DESC LIMIT 1 FOR UPDATE;$a$,
  $a$  SELECT * INTO o FROM ju_ofertas_horario
   WHERE conversa_id = c.id AND status = 'aberta' AND criado_em > now() - interval '3 days'
   ORDER BY criado_em DESC LIMIT 1 FOR UPDATE;
  IF fn_le_vaga_da_conversa(c.id) IS NOT NULL
     AND (o.id IS NULL OR (SELECT oferta_em FROM lista_espera_vagas WHERE id = fn_le_vaga_da_conversa(c.id)) > o.criado_em) THEN
    RETURN fn_ju_vaga_responder(p || jsonb_build_object('aceitou', true));
  END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_oferta_agendar: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;
