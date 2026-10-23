-- =====================================================================
-- "@ju" na conversa da família: a recepção pede e a Ju agenda (23/10/2026)
-- =====================================================================
-- AI dev note: pedido do dono. Mensagem que sai do número da clínica (HUMANO: Lolô no celular,
-- WhatsApp Web ou Chatwoot) começando com "@ju" é um comando. Por enquanto só AGENDAR; o
-- prefixo é genérico para outras funções depois (nota, atestado...). Família nunca aciona.
--  - fn_ju_receber devolve comando=true (só TEXT, só conversa individual) → n8n "RK Ju - Comando";
--  - a IA lê a conversa (fn_ju_comando_contexto) e só PROPÕE: criança, dia, hora, fisio, serviço.
--    Faltou algo → pergunta curta no próprio chat ("É para o Pedro ou para a Ana?"); a recepção
--    responde começando de novo com "@ju" e a Ju relê a conversa;
--  - fn_ju_agendar confere TUDO por regra antes de criar: criança desta família, horário no
--    futuro e em hora razoável, fisio ativa, serviço ativo (DU ↔ FDS ajustado pelo dia: sábado,
--    domingo e feriado de followup_feriados = FDS), sem consulta da criança perto desse horário,
--    agenda livre (fn_horario_disponivel). Valor = fn_valor_servico; empresa = da última consulta
--    (mesma fisio > qualquer > a mais usada pela fisio); sala fixa por fisio (Bruna 2, Flávia 1,
--    Beatriz e demais 3); agendado_por = secretaria (Alorrani/Lolô); observação "Agendado pela Ju".
--    O INSERT dispara os gatilhos de sempre (notificação à família, Google Agenda, lembretes).
--  - Resposta à família só "Acabei de agendar! Se puder, confere as informações, por favor" —
--    nunca os dados da consulta (a notificação automática já leva).
-- =====================================================================

CREATE TABLE public.ju_comandos (
  id              bigserial PRIMARY KEY,
  conversa_id     bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  mensagem_id     bigint UNIQUE REFERENCES public.ju_mensagens(id) ON DELETE SET NULL,
  texto           text NOT NULL,
  status          text NOT NULL DEFAULT 'recebido'
                  CHECK (status IN ('recebido', 'agendado', 'pergunta', 'recusado', 'erro', 'nao_suportado')),
  proposta        jsonb,
  resultado       jsonb,
  agendamento_id  uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  resposta        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  concluido_em    timestamptz
);
ALTER TABLE public.ju_comandos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_comandos FROM anon, authenticated;

-- fn_ju_receber: mensagem da equipe começando com "@ju" vira comando (continua pausando a Ju)
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_receber(text,text,text,boolean,boolean,text,text)'::regprocedure);
  a text := $q$RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id, 'midia', v_tipo = 'AUDIO');$q$;
  b text := $q$IF v_tipo = 'TEXT' AND coalesce(p_conteudo, '') ~* '^\s*@ju([^[:alnum:]]|$)' AND p_wa_chatid NOT LIKE '%@g.us' THEN
      INSERT INTO public.ju_comandos (conversa_id, mensagem_id, texto) VALUES (c.id, v_msg, btrim(p_conteudo))
      ON CONFLICT (mensagem_id) DO NOTHING;
      RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id, 'midia', false,
                                'comando', true, 'mensagem_id', v_msg, 'wa_chatid', c.wa_chatid);
    END IF;
    $q$;
BEGIN
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(d, a, b || a);
END $m$;

-- ---------------------------------------------------------------------
-- O que a IA do comando lê
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_comando_contexto(p_conversa_id bigint, p_mensagem_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  ctx    jsonb := public.fn_ju_contexto_cliente(p_conversa_id);
  agora  timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  dias   text[] := ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
BEGIN
  RETURN jsonb_build_object(
    'agora', dias[extract(dow FROM agora)::int + 1] || ', ' || to_char(agora, 'DD/MM/YYYY HH24:MI'),
    'hoje', to_char(agora, 'YYYY-MM-DD'),
    'comando', (SELECT conteudo FROM ju_mensagens WHERE id = p_mensagem_id),
    'criancas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paciente_id', x ->> 'paciente_id',
               'nome', x ->> 'nome',
               'idade_meses', x -> 'idade_meses',
               'ultima_consulta', (
                 SELECT jsonb_build_object(
                          'data', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI'),
                          'tipo_servico_id', a.tipo_servico_id, 'servico', regexp_replace(ts.nome, '\s+', ' ', 'g'),
                          'profissional_id', a.profissional_id, 'profissional', split_part(btrim(pr.nome), ' ', 1))
                   FROM agendamentos a
                   JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
                   LEFT JOIN pessoas pr ON pr.id = a.profissional_id
                  WHERE a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
                  ORDER BY a.data_hora DESC LIMIT 1),
               'proximas_consultas', coalesce(x -> 'proximas_consultas', '[]'::jsonb)))
        FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x
       WHERE (x ->> 'acesso_agenda')::boolean), '[]'::jsonb),
    'historico', coalesce((
      SELECT jsonb_agg(linha ORDER BY created_at)
        FROM (SELECT m.created_at,
                     dias[extract(dow FROM m.created_at AT TIME ZONE 'America/Sao_Paulo')::int + 1] || ' '
                     || to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' '
                     || CASE m.origem WHEN 'CLIENTE' THEN 'Família' WHEN 'HUMANO' THEN 'Recepção' WHEN 'JU' THEN 'Ju' ELSE 'Automática' END
                     || ': ' || left(regexp_replace(m.conteudo, '\s+', ' ', 'g'), 400) AS linha
                FROM ju_mensagens m
               WHERE m.conversa_id = p_conversa_id AND coalesce(btrim(m.conteudo), '') <> ''
                 AND m.origem IN ('CLIENTE', 'HUMANO', 'JU')
                 AND m.created_at > now() - interval '5 days'
                 AND m.id <= p_mensagem_id
               ORDER BY m.created_at DESC LIMIT 40) h), '[]'::jsonb),
    'profissionais', coalesce((
      SELECT jsonb_agg(jsonb_build_object('profissional_id', id, 'nome', nome) ORDER BY nome)
        FROM (SELECT DISTINCT p.id, p.nome FROM agendamentos a JOIN pessoas p ON p.id = a.profissional_id
               WHERE a.ativo AND a.data_hora > now() - interval '90 days' AND p.ativo) pr), '[]'::jsonb),
    'servicos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('tipo_servico_id', id, 'nome', regexp_replace(nome, '\s+', ' ', 'g')) ORDER BY nome)
        FROM tipo_servicos WHERE ativo), '[]'::jsonb),
    'feriados', coalesce((
      SELECT jsonb_agg(to_char(dia, 'DD/MM') || ' ' || nome ORDER BY dia)
        FROM followup_feriados WHERE dia BETWEEN agora::date AND agora::date + 60), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_comando_contexto(bigint, bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Confere por regra e cria a consulta
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_agendar(p_conversa_id bigint, p_mensagem_id bigint, p_paciente_id uuid,
                                     p_data date, p_hora text, p_profissional_id uuid, p_tipo_servico_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  cmd      ju_comandos;
  agora    timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora   time;
  v_quando timestamp;
  v_dh     timestamptz;
  v_fds    boolean;
  ts       tipo_servicos;
  v_base   text;
  v_alvo   text;
  v_serv   uuid;
  v_dur    int;
  v_prof   text;
  v_local  uuid;
  v_emp    uuid;
  v_valor  numeric;
  v_id     uuid;
  r        jsonb;
  erro     text;
BEGIN
  SELECT * INTO cmd FROM ju_comandos WHERE mensagem_id = p_mensagem_id AND conversa_id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'COMANDO_INEXISTENTE'); END IF;
  IF cmd.agendamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'codigo', 'JA_AGENDADO', 'agendamento_id', cmd.agendamento_id);
  END IF;

  -- criança desta família
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
                  WHERE (x ->> 'acesso_agenda')::boolean AND (x ->> 'paciente_id')::uuid = p_paciente_id) THEN
    r := jsonb_build_object('ok', false, 'codigo', 'CRIANCA_FORA_DA_FAMILIA');
  END IF;

  -- dia e hora (hora de parede, como o app grava: 'AAAA-MM-DD HH:MM+00')
  IF r IS NULL THEN
    BEGIN v_hora := p_hora::time; EXCEPTION WHEN others THEN v_hora := NULL; END;
    IF p_data IS NULL OR v_hora IS NULL THEN
      r := jsonb_build_object('ok', false, 'codigo', 'SEM_DIA_OU_HORA');
    ELSE
      v_quando := p_data + v_hora;
      v_dh := v_quando AT TIME ZONE 'UTC';
      IF v_quando <= agora THEN r := jsonb_build_object('ok', false, 'codigo', 'NO_PASSADO');
      ELSIF v_quando > agora + interval '120 days' THEN r := jsonb_build_object('ok', false, 'codigo', 'MUITO_LONGE');
      ELSIF v_hora < time '06:00' OR v_hora > time '21:00' THEN r := jsonb_build_object('ok', false, 'codigo', 'HORA_ESTRANHA');
      END IF;
    END IF;
  END IF;

  -- fisio
  IF r IS NULL THEN
    SELECT lower(unaccent(split_part(btrim(p.nome), ' ', 1))) INTO v_prof FROM pessoas p
     WHERE p.id = p_profissional_id AND p.ativo
       AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.profissional_id = p.id AND a.data_hora > now() - interval '180 days');
    IF v_prof IS NULL THEN r := jsonb_build_object('ok', false, 'codigo', 'FISIO_INVALIDA'); END IF;
  END IF;

  -- serviço: dia útil x fim de semana/feriado
  IF r IS NULL THEN
    SELECT * INTO ts FROM tipo_servicos WHERE id = p_tipo_servico_id AND ativo;
    IF NOT FOUND THEN
      r := jsonb_build_object('ok', false, 'codigo', 'SERVICO_INVALIDO');
    ELSE
      v_fds := extract(isodow FROM p_data) IN (6, 7) OR EXISTS (SELECT 1 FROM followup_feriados WHERE dia = p_data);
      v_base := lower(regexp_replace(ts.nome, '\s+', ' ', 'g'));
      v_serv := ts.id;
      IF v_fds AND v_base ~ ' - du$' THEN v_alvo := regexp_replace(v_base, ' - du$', ' - fds');
      ELSIF NOT v_fds AND v_base ~ ' - fds$' THEN v_alvo := regexp_replace(v_base, ' - fds$', ' - du');
      END IF;
      IF v_alvo IS NOT NULL THEN
        SELECT id INTO v_serv FROM tipo_servicos WHERE ativo AND lower(regexp_replace(nome, '\s+', ' ', 'g')) = v_alvo LIMIT 1;
        IF v_serv IS NULL THEN v_serv := ts.id; END IF;
      END IF;
      SELECT * INTO ts FROM tipo_servicos WHERE id = v_serv;
      v_dur := coalesce(nullif(ts.duracao_minutos, 0), 60);
    END IF;
  END IF;

  -- a criança já tem consulta perto desse horário?
  IF r IS NULL AND EXISTS (
       SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
        WHERE a.paciente_id = p_paciente_id AND a.ativo AND cs.codigo NOT IN ('cancelado')
          AND a.data_hora BETWEEN v_dh - interval '90 minutes' AND v_dh + interval '90 minutes') THEN
    r := jsonb_build_object('ok', false, 'codigo', 'JA_TEM_CONSULTA_PERTO');
  END IF;

  -- agenda da fisio livre (consultas + bloqueios)
  IF r IS NULL AND NOT fn_horario_disponivel(p_profissional_id, v_dh, v_dh + make_interval(mins => v_dur)) THEN
    r := jsonb_build_object('ok', false, 'codigo', 'HORARIO_OCUPADO');
  END IF;

  IF r IS NULL THEN
    v_local := (SELECT id FROM locais_atendimento WHERE ativo AND nome = CASE v_prof WHEN 'bruna' THEN 'Sala 2'
                                                                                     WHEN 'flavia' THEN 'Sala 1'
                                                                                     ELSE 'Sala 3' END LIMIT 1);
    SELECT a.empresa_fatura INTO v_emp FROM agendamentos a
     WHERE a.paciente_id = p_paciente_id AND a.ativo AND a.empresa_fatura IS NOT NULL
     ORDER BY (a.profissional_id = p_profissional_id) DESC, a.data_hora DESC LIMIT 1;
    IF v_emp IS NULL THEN
      SELECT a.empresa_fatura INTO v_emp FROM agendamentos a
       WHERE a.profissional_id = p_profissional_id AND a.ativo AND a.empresa_fatura IS NOT NULL
         AND a.data_hora > now() - interval '90 days'
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
    END IF;
    v_valor := coalesce(fn_valor_servico(v_serv, p_profissional_id, p_paciente_id), ts.valor);

    BEGIN
      INSERT INTO agendamentos (data_hora, paciente_id, profissional_id, tipo_servico_id, local_id,
                                status_consulta_id, status_pagamento_id, valor_servico, agendado_por,
                                empresa_fatura, observacao, ativo)
      VALUES (v_dh, p_paciente_id, p_profissional_id, v_serv, v_local,
              (SELECT id FROM consulta_status WHERE codigo = 'agendado'),
              (SELECT id FROM pagamento_status WHERE codigo = 'pendente'),
              v_valor, 'df8ed2ab-867d-47b3-97a2-b05891fae798', v_emp,
              'Agendado pela Ju a pedido da recepção (@ju).', true)
      RETURNING id INTO v_id;
      r := jsonb_build_object('ok', true, 'codigo', 'AGENDADO', 'agendamento_id', v_id,
                              'servico', regexp_replace(ts.nome, '\s+', ' ', 'g'), 'valor', v_valor);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
      r := jsonb_build_object('ok', false, 'codigo', 'SISTEMA_RECUSOU', 'detalhe', left(erro, 300));
    END;
  END IF;

  UPDATE ju_comandos
     SET proposta = jsonb_build_object('paciente_id', p_paciente_id, 'data', p_data, 'hora', p_hora,
                                       'profissional_id', p_profissional_id, 'tipo_servico_id', p_tipo_servico_id),
         resultado = r,
         agendamento_id = CASE WHEN (r ->> 'ok')::boolean THEN (r ->> 'agendamento_id')::uuid END,
         status = CASE WHEN (r ->> 'ok')::boolean THEN 'agendado' ELSE 'recusado' END,
         concluido_em = now()
   WHERE id = cmd.id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_agendar(bigint, bigint, uuid, date, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- resposta enviada (pergunta, recusa, não suportado, erro) fica registrada
CREATE FUNCTION public.fn_ju_comando_resposta(p_mensagem_id bigint, p_status text, p_resposta text, p_proposta jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  UPDATE ju_comandos
     SET resposta = left(p_resposta, 1000),
         status = CASE WHEN status = 'agendado' THEN status ELSE coalesce(p_status, status) END,
         proposta = coalesce(proposta, p_proposta),
         concluido_em = coalesce(concluido_em, now())
   WHERE mensagem_id = p_mensagem_id;
$$;
REVOKE ALL ON FUNCTION public.fn_ju_comando_resposta(bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- (migration ju_agendar_ensaio_teste) Conversa falsa 55619990000NN: fn_ju_agendar faz tudo e desfaz a
-- consulta no fim (RAISE 'ENSAIO_TESTE' na subtransação) e devolve ensaio=true, sala e data_hora.
-- n8n: "RK Ju - Comando (@ju)" G1ZIuU7x7j1lSBLZ (cópia do prompt em scripts/n8n/ju-comando-montar-pedido.js);
-- Entrada: "Registrar mensagem" → "Comando @ju?" → "Chamar Comando" (sem esperar).
-- Testado 23/10 (ensaio): Anna "segunda 9h com a Flávia" → 26/10 09:00 Sala 1 respiratória DU R$ 260;
-- 2 crianças → "O agendamento é para Alice ou Olívia?" → "@ju a Olívia" → sábado 10h Bruna Sala 2
-- Fisioterapia Motora FDS R$ 350 (depois da avaliação vem sessão); sem cadastro → avisa; "@ju emite
-- a nota" → só agenda por enquanto. Validações do banco: mesmo comando 2x, consulta perto, criança de
-- outra família recusados.
