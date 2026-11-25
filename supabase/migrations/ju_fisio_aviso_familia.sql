-- 25/11/2026: "@ju avisar essa mãe que vou chegar 10 min atrasada" (Beatriz, respondendo à confirmação da
-- consulta). Antes só existia a volta de um recado que a família mandou; um aviso que parte da fisio caía no
-- @ju comum e a Ju respondia que não conseguia.
--
-- Agora fn_ju_recado_rotear reconhece o pedido de aviso (verbo avisar/falar/dizer/mandar/informar/lembrar +
-- citação de uma mensagem com "Paciente:" ou menção a mãe/pai/família/responsável/paciente), acha a criança
-- entre as consultas da fisio (−1 a +14 dias) pelo nome citado ou pelo primeiro nome no texto, acha a conversa
-- da família (telefone normalizado ou últimos 8 dígitos, porque há telefones sem 55 no cadastro) e cria um
-- ju_recados com status 'aviso'. Daí segue o mesmo caminho da resposta a recado: o Comando escreve o texto
-- humano em 3ª pessoa para a família (bloco AVISO DA FISIO no "Montar pedido") e fn_ju_comando_resposta
-- confirma para a fisio "✅ Passei para a família de X". A recepção vê uma linha no 🔔.
-- Status 'aviso' não entra nas buscas de recado aberto, então um @ju seguinte da fisio não cai nessa família.

ALTER TABLE public.ju_recados DROP CONSTRAINT IF EXISTS ju_recados_status_check;
ALTER TABLE public.ju_recados ADD CONSTRAINT ju_recados_status_check
  CHECK (status = ANY (ARRAY['fila', 'enviado', 'respondido', 'expirado', 'falhou', 'aviso']));

CREATE OR REPLACE FUNCTION public.fn_ju_fisio_aviso_alvo(p_prof uuid, p_q text, p_norm text)
 RETURNS TABLE(paciente_id uuid, conversa_id bigint, crianca text, familia text, consulta text, candidatos int)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agora timestamptz := (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC';  -- data_hora é hora de parede
  v_nome text; v_pac uuid; v_n int; v_dh timestamptz;
BEGIN
  -- regex do Postgres herda a gulodice do 1º quantificador; por isso corta em dois passos
  v_nome := substring(coalesce(p_q, '') FROM 'Paciente:(.*)$');
  v_nome := regexp_replace(coalesce(v_nome, ''), '\s*(Respons|Data|Hora|Profiss|Servi|Local|Endere|\n).*$', '');
  v_nome := nullif(btrim(replace(v_nome, '*', '')), '');

  WITH cand AS (
    SELECT ag.paciente_id, ag.data_hora, pac.nome
      FROM agendamentos ag
      JOIN consulta_status cs ON cs.id = ag.status_consulta_id
      JOIN pessoas pac ON pac.id = ag.paciente_id
     WHERE ag.profissional_id = p_prof AND ag.ativo
       AND cs.codigo NOT IN ('cancelado', 'erro')
       AND ag.data_hora BETWEEN v_agora - interval '1 day' AND v_agora + interval '14 days'
       AND CASE WHEN nullif(v_nome, '') IS NOT NULL
                THEN lower(unaccent(btrim(pac.nome))) LIKE lower(unaccent(v_nome)) || '%'
                ELSE coalesce(p_norm, '') ~ ('\m' || lower(unaccent(split_part(btrim(pac.nome), ' ', 1))) || '\M')
           END
  )
  SELECT count(DISTINCT c.paciente_id),
         (array_agg(c.paciente_id ORDER BY abs(extract(epoch FROM c.data_hora - v_agora))))[1],
         (array_agg(c.data_hora ORDER BY abs(extract(epoch FROM c.data_hora - v_agora))))[1]
    INTO v_n, v_pac, v_dh
    FROM cand c;

  IF coalesce(v_n, 0) <> 1 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, NULL::text, NULL::text, NULL::text, coalesce(v_n, 0);
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_pac,
         (SELECT jc.id
            FROM pessoa_responsaveis pr
            JOIN pessoas r ON r.id = pr.id_responsavel AND r.ativo AND r.telefone IS NOT NULL
            JOIN ju_conversas jc ON jc.wa_chatid NOT LIKE '%@g.us'
                 AND (fn_ju_telefone(jc.telefone) = fn_ju_telefone(r.telefone::text)
                      OR (length(regexp_replace(r.telefone::text, '\D', '', 'g')) >= 8
                          AND right(regexp_replace(coalesce(jc.telefone, ''), '\D', '', 'g'), 8)
                            = right(regexp_replace(r.telefone::text, '\D', '', 'g'), 8)))
           WHERE pr.id_pessoa = v_pac AND pr.ativo AND (pr.data_fim IS NULL OR pr.data_fim >= current_date)
           ORDER BY (pr.tipo_responsabilidade IN ('legal', 'ambos')) DESC, jc.updated_at DESC NULLS LAST
           LIMIT 1),
         (SELECT split_part(btrim(nome), ' ', 1) FROM pessoas WHERE id = v_pac),
         (SELECT split_part(btrim(r.nome), ' ', 1)
            FROM pessoa_responsaveis pr JOIN pessoas r ON r.id = pr.id_responsavel
           WHERE pr.id_pessoa = v_pac AND pr.ativo
           ORDER BY (pr.tipo_responsabilidade IN ('legal', 'ambos')) DESC LIMIT 1),
         to_char(v_dh AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
         1;
END $function$;

REVOKE ALL ON FUNCTION public.fn_ju_fisio_aviso_alvo(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_recado_rotear(p_conversa_id bigint, p_mensagem_id bigint, p_texto text, p_telefone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prof uuid; v_q text; v_txt text; v_norm text; r ju_recados; v_n int; v_lista text;
  fam ju_conversas; f record; v_cmd text; v_ju boolean; al record; v_aviso boolean := false; v_consulta text;
BEGIN
  SELECT d.profissional_id INTO v_prof
    FROM ju_recado_destinatarios d JOIN pessoas pp ON pp.id = d.profissional_id
   WHERE d.ativo AND pp.ativo AND pp.telefone IS NOT NULL
     AND fn_ju_telefone(pp.telefone::text) = fn_ju_telefone(p_telefone)
   LIMIT 1;
  IF v_prof IS NULL THEN RETURN NULL; END IF;

  v_ju := coalesce(p_texto, '') ~* '^\s*@ju([^[:alnum:]]|$)';
  v_q := substring(coalesce(p_texto, '') FROM '\[respondendo a: "(.*)"\]\s*$');
  v_txt := btrim(regexp_replace(coalesce(p_texto, ''), '\s*\[respondendo a: ".*"\]\s*$', ''));
  v_norm := lower(unaccent(regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i')));

  -- 25/11/2026: aviso que parte da fisio para a família (não é resposta a recado).
  IF v_ju AND coalesce(v_q, '') !~ '^\s*📩'
     AND v_norm ~ '\m(avis\w*|fal[ae]r?|fala|diz(er)?|diga|mand[ae]r?|manda|inform\w*|comunic\w*|lembr\w*)\M'
     AND (coalesce(v_q, '') ~* 'Paciente:' OR v_norm ~ '\m(mae|pai|familia|responsavel|paciente)\M') THEN
    SELECT * INTO al FROM fn_ju_fisio_aviso_alvo(v_prof, v_q, v_norm);
    SELECT * INTO f FROM fn_ju_recado_chat_fisio(v_prof);
    IF al.paciente_id IS NULL THEN
      PERFORM fn_ju_recado_whats(f.numero,
        CASE WHEN al.candidatos > 1 THEN 'Achei mais de uma criança com esse nome nas suas consultas. '
             ELSE 'Não achei essa criança nas suas consultas de ontem até os próximos 14 dias. ' END
        || 'Responda citando a confirmação da consulta (segure a mensagem e toque em Responder) ou escreva o nome completo da criança, sempre com @ju.',
        p_conversa_id);
      RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'AVISO_QUAL', 'conversa_id', p_conversa_id);
    END IF;
    IF al.conversa_id IS NULL THEN
      PERFORM fn_ju_recado_whats(f.numero,
        'Não achei o WhatsApp da família de ' || al.crianca || ' nas conversas da clínica, então não consegui avisar. Pede para a recepção avisar por favor.',
        p_conversa_id);
      INSERT INTO ju_avisos_grupo (texto, origem)
      VALUES ('📣 A ' || f.nome || ' pediu para avisar a família de ' || al.crianca || coalesce(' (consulta ' || al.consulta || ')', '')
              || ', mas não achei a conversa deles. Avisem por favor: “' || left(regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i'), 300) || '”',
              'RECADO_FISIO');
      RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'AVISO_SEM_CONVERSA', 'conversa_id', p_conversa_id);
    END IF;
    INSERT INTO ju_recados (conversa_id, paciente_id, profissional_id, recado, mensagem, familia, crianca,
                            status, enviar_em, enviado_em, respondido_em, respostas)
    VALUES (al.conversa_id, al.paciente_id, v_prof, left(regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i'), 500), left(v_txt, 500), al.familia, al.crianca,
            'aviso', now(), now(), now(), 1)
    RETURNING * INTO r;
    v_aviso := true;
    v_consulta := al.consulta;
    INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
    VALUES ('📣 A ' || f.nome || ' pediu para avisar a família de ' || al.crianca || coalesce(' (consulta ' || al.consulta || ')', '')
            || ': “' || left(regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i'), 300) || '”. A Ju está passando.',
            'RECADO_FISIO', al.conversa_id);
  END IF;

  IF NOT v_aviso THEN
    IF v_q IS NOT NULL THEN
      v_q := left(btrim(v_q), 60);
      SELECT * INTO r FROM ju_recados
       WHERE profissional_id = v_prof AND status IN ('enviado', 'respondido', 'expirado')
         AND created_at > now() - interval '7 days'
         AND left(regexp_replace(mensagem, '\s+', ' ', 'g'), length(v_q)) = v_q
       ORDER BY created_at DESC LIMIT 1;
      IF r.id IS NULL THEN RETURN NULL; END IF;
    ELSE
      IF NOT v_ju THEN RETURN NULL; END IF;
      IF v_norm ~ '(minha|meu|meus|minhas) (agenda|paciente|numero|horario)|\m(ver|mostra\w*) (a )?agenda|\m(fecha|fechar|abre|abrir|reserva|reservar)\M|lista de espera|evoluc|proximo paciente|confirmac' THEN
        RETURN NULL;
      END IF;
      SELECT count(*), string_agg(coalesce(familia, '?') || coalesce(' (' || crianca || ')', ''), ', ' ORDER BY created_at)
        INTO v_n, v_lista
        FROM ju_recados
       WHERE profissional_id = v_prof
         AND ((status = 'enviado' AND enviado_em > now() - interval '3 days')
           OR (status = 'respondido' AND respondido_em > now() - interval '12 hours'));
      IF v_n = 0 THEN RETURN NULL; END IF;
      IF v_n = 1 THEN
        SELECT * INTO r FROM ju_recados
         WHERE profissional_id = v_prof
           AND ((status = 'enviado' AND enviado_em > now() - interval '3 days')
             OR (status = 'respondido' AND respondido_em > now() - interval '12 hours'))
         LIMIT 1;
      ELSE
        SELECT count(DISTINCT x.conversa_id), max(x.id) INTO v_n, r.id FROM ju_recados x
         WHERE x.profissional_id = v_prof
           AND ((x.status = 'enviado' AND x.enviado_em > now() - interval '3 days')
             OR (x.status = 'respondido' AND x.respondido_em > now() - interval '12 hours'))
           AND (v_norm ~ ('\m' || lower(unaccent(coalesce(x.crianca, '#'))) || '\M')
             OR v_norm ~ ('\m' || lower(unaccent(coalesce(x.familia, '#'))) || '\M'));
        IF v_n = 1 THEN SELECT * INTO r FROM ju_recados WHERE id = r.id; END IF;
        IF v_n <> 1 THEN
          SELECT * INTO f FROM fn_ju_recado_chat_fisio(v_prof);
          PERFORM fn_ju_recado_whats(f.numero,
            'Você tem recados de mais de uma família: ' || v_lista
            || '. Para eu saber de qual é, responda citando o recado (segure a mensagem e toque em Responder) ou diga o nome da criança, sempre com @ju.',
            p_conversa_id);
          RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'RECADO_QUAL', 'conversa_id', p_conversa_id);
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT * INTO fam FROM ju_conversas WHERE id = r.conversa_id;
  SELECT * INTO f FROM fn_ju_recado_chat_fisio(v_prof);
  v_cmd := CASE WHEN v_ju THEN v_txt ELSE '@ju ' || v_txt END;

  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, recado_id)
  VALUES (r.conversa_id, p_mensagem_id, v_cmd, r.id)
  ON CONFLICT (mensagem_id) DO NOTHING;
  IF NOT v_aviso THEN
    UPDATE ju_recados
       SET status = 'respondido', respondido_em = now(), respostas = respostas + 1
     WHERE id = r.id;
  END IF;

  RETURN jsonb_build_object(
    'acao', 'NADA', 'motivo', CASE WHEN v_aviso THEN 'AVISO_FISIO' ELSE 'RECADO_RESPOSTA' END,
    'comando', true, 'recado', true,
    'conversa_id', r.conversa_id, 'mensagem_id', p_mensagem_id, 'wa_chatid', fam.wa_chatid,
    'quem_pediu', f.nome,
    'historico_externo', jsonb_build_object(
      'recado_id', r.id, 'fisio', f.nome, 'fisio_chatid', f.numero, 'fisio_conversa_id', coalesce(f.conversa_id, p_conversa_id),
      'familia', r.familia, 'crianca', r.crianca, 'recado', r.recado, 'aviso', v_aviso, 'consulta', v_consulta,
      'enviado', to_char(r.enviado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      'resposta', regexp_replace(v_txt, '^\s*@ju[[:space:][:punct:]]*', '', 'i'))::text);
END $function$;
