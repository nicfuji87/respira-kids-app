-- =====================================================================
-- Botão "Lançar consulta" no aviso de consulta combinada e não lançada (22/10/2026)
-- =====================================================================
-- AI dev note: pedido do dono ("um botão para criar o agendamento, leva para o app como a
-- cobrança e a pessoa só confirma"). Complementa agenda_confirmacao_nao_lancada.sql.
--  - cada consulta avisada vira uma linha em agenda_sugestoes, com dia/hora/fisio lidos da
--    própria conversa por REGRA (sem IA): "hoje", "amanhã", "depois de amanhã", dia da
--    semana, "dia 28", "28/10", "14h", "14:30", "às 9", e o primeiro nome da fisio
--    (Bia = Beatriz). Lê a mensagem da equipe e, para o que faltar, as anteriores da mesma
--    conversa (até 6 h antes, da mais nova para a mais velha). O que não achar fica vazio;
--  - o aviso no 🔔 Notificações sai um por consulta, com o botão "📅 Lançar consulta"
--    (ju_avisos_grupo.botao → n8n Tarefas usa /send/menu); o link também vai no texto,
--    para a reserva pelo número do Nicolas;
--  - a página /#/agenda/lancar/:id (admin e secretaria) abre o formulário de agendamento já
--    preenchido; salvar marca 'lancada'. "Já estava lançada" e "Não era consulta" encerram
--    e servem de medida de acerto do aviso;
--  - o resumo de "mais de 3 avisos" deixou de existir: cada consulta precisa do seu botão.
-- Aplicada em 2 partes: agenda_sugestao_lancar_base (tudo menos o detector) em 22/10; o
-- detector novo (fn_agenda_confirmacoes_verificar) só depois do deploy do front, para o
-- botão não apontar para uma página que ainda não existe.
-- =====================================================================

CREATE TABLE public.agenda_sugestoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id    bigint UNIQUE REFERENCES public.ju_mensagens(id) ON DELETE SET NULL,
  conversa_id    bigint NOT NULL,
  telefone       text,
  texto          text NOT NULL,
  mensagem_em    timestamptz NOT NULL,
  paciente_ids   uuid[] NOT NULL DEFAULT '{}',
  sugestao       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'lancada', 'ja_estava', 'descartada')),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  resolvido_por  uuid REFERENCES public.pessoas(id),
  resolvido_em   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agenda_sugestoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agenda_sugestoes FROM anon, authenticated;

ALTER TABLE public.ju_avisos_grupo ADD COLUMN IF NOT EXISTS botao text;
COMMENT ON COLUMN public.ju_avisos_grupo.botao IS 'Opcional, "Rótulo|url": o n8n Tarefas manda com botão (/send/menu).';

-- fn_ju_tarefas passa o botão adiante (o n8n Tarefas usa /send/menu quando há botão)
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_tarefas()'::regprocedure);
  a1 text := $q$RETURNING g.id, g.texto)$q$;
  a2 text := $q$jsonb_build_object('aviso_id', a.id, 'texto', a.texto)$q$;
BEGIN
  IF position(a1 in d) = 0 OR position(a2 in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(replace(d, a1, $q$RETURNING g.id, g.texto, g.botao)$q$),
                  a2, $q$jsonb_build_object('aviso_id', a.id, 'texto', a.texto, 'botao', a.botao)$q$);
END $m$;

-- ---------------------------------------------------------------------
-- Leitura de dia, hora e fisio num texto. p_base = hora de parede (Brasília) da mensagem.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_agenda_extrair(p_texto text, p_base timestamp)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  t     text := ' ' || lower(public.unaccent(coalesce(p_texto, ''))) || ' ';
  base  date := p_base::date;
  m     text[];
  d     date;
  h     int;
  mi    int;
  dias  text[] := ARRAY['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  alvo  int;
  prof  uuid;
  res   jsonb := '{}'::jsonb;
BEGIN
  -- data: explícita > depois de amanhã > amanhã > hoje > dia da semana
  m := regexp_match(t, '(^|[^0-9])([0-3]?[0-9])/([01]?[0-9])(/[0-9]{2,4})?([^0-9]|$)');
  IF m IS NOT NULL THEN
    BEGIN
      d := make_date(extract(year FROM base)::int, m[3]::int, m[2]::int);
      IF d < base - 30 THEN d := d + interval '1 year'; END IF;
    EXCEPTION WHEN others THEN d := NULL; END;
  END IF;
  IF d IS NULL THEN
    m := regexp_match(t, '\mdia ([0-3]?[0-9])\M');
    IF m IS NOT NULL AND m[1]::int BETWEEN 1 AND 31 THEN
      BEGIN
        d := make_date(extract(year FROM base)::int, extract(month FROM base)::int, m[1]::int);
        IF d < base THEN d := (d + interval '1 month')::date; END IF;
      EXCEPTION WHEN others THEN d := NULL; END;
    END IF;
  END IF;
  IF d IS NULL AND t ~ '\mdepois de amanha\M' THEN d := base + 2; END IF;
  IF d IS NULL AND t ~ '\mamanha\M' THEN d := base + 1; END IF;
  IF d IS NULL AND t ~ '\mhoje\M' THEN d := base; END IF;
  IF d IS NULL THEN
    m := regexp_match(t, '(^|\mna |\mno |\mpara |\mpra |\mdia |\mproxima |\mnesta |\messa |\mesta |[,.;] ?)(segunda|terca|quarta|quinta|sexta|sabado)(-feira| feira)?\M');
    IF m IS NOT NULL THEN
      alvo := array_position(dias, m[2]) - 1;
      d := base + ((alvo - extract(dow FROM base)::int + 7) % 7);
      IF d = base THEN d := base + 7; END IF;
    END IF;
  END IF;
  IF d IS NOT NULL AND d BETWEEN base - 1 AND base + 120 THEN
    res := res || jsonb_build_object('data', d);
  END IF;

  -- hora: "14h", "14h30", "14:30", "16:30h", "às 9" (só entre 6h e 20h)
  FOR m IN SELECT regexp_matches(t, '(^|[^0-9/:])([01]?[0-9]|2[0-3]) ?(h|:)([0-5][0-9])?', 'g') LOOP
    IF m[3] = ':' AND m[4] IS NULL THEN CONTINUE; END IF;
    h := m[2]::int; mi := coalesce(m[4], '0')::int;
    IF h BETWEEN 6 AND 20 THEN EXIT; END IF;
    h := NULL;
  END LOOP;
  IF h IS NULL THEN
    m := regexp_match(t, '\mas ([0-9]{1,2})\M');
    IF m IS NOT NULL AND m[1]::int BETWEEN 6 AND 20 THEN h := m[1]::int; mi := 0; END IF;
  END IF;
  IF h IS NOT NULL THEN
    res := res || jsonb_build_object('hora', lpad(h::text, 2, '0') || ':' || lpad(mi::text, 2, '0'));
  END IF;

  -- fisio: primeiro nome (Bia = Beatriz); nome repetido fica com quem mais atendeu em 120 dias
  WITH profs AS (
    SELECT a.profissional_id id, p.nome, count(*) n
      FROM public.agendamentos a JOIN public.pessoas p ON p.id = a.profissional_id
     WHERE a.ativo AND a.data_hora > now() - interval '120 days'
     GROUP BY 1, 2),
  apelidos AS (
    SELECT id, n, lower(public.unaccent(split_part(btrim(nome), ' ', 1))) ap FROM profs
    UNION ALL SELECT id, n, 'bia' FROM profs WHERE nome ILIKE 'beatriz%')
  SELECT id INTO prof FROM apelidos
   WHERE length(ap) >= 3 AND t ~ ('\m' || ap || '\M')
   ORDER BY position(ap IN t), n DESC LIMIT 1;
  IF prof IS NOT NULL THEN
    res := res || jsonb_build_object('profissional_id', prof);
  END IF;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_extrair(text, timestamp) FROM PUBLIC, anon, authenticated;

-- A mensagem da equipe primeiro; o que faltar, das anteriores da conversa (6 h, mais nova antes).
CREATE FUNCTION public.fn_agenda_sugestao_ler(p_conversa_id bigint, p_mensagem_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  r    record;
  res  jsonb := '{}'::jsonb;
  ex   jsonb;
  ate  timestamptz;
BEGIN
  SELECT created_at INTO ate FROM public.ju_mensagens WHERE id = p_mensagem_id;
  FOR r IN
    SELECT m.conteudo, m.created_at FROM public.ju_mensagens m
     WHERE m.conversa_id = p_conversa_id AND m.origem IN ('HUMANO', 'CLIENTE')
       AND m.created_at BETWEEN ate - interval '6 hours' AND ate
       AND coalesce(btrim(m.conteudo), '') <> ''
     ORDER BY (m.id = p_mensagem_id) DESC, m.created_at DESC
     LIMIT 15
  LOOP
    ex := public.fn_agenda_extrair(r.conteudo, (r.created_at AT TIME ZONE 'America/Sao_Paulo'));
    -- só completa o que falta (a mensagem mais nova manda)
    SELECT res || coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO res
      FROM jsonb_each(ex) e(k, v) WHERE NOT res ? k;
    EXIT WHEN res ? 'data' AND res ? 'hora' AND res ? 'profissional_id';
  END LOOP;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_sugestao_ler(bigint, bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Detector: agora cria a sugestão e manda um aviso com botão por consulta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_confirmacoes_verificar() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  hora   int := extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo');
  r      record;
  pacs   uuid[];
  nomes  text;
  ok     boolean;
  sug    jsonb;
  sid    uuid;
  prof   text;
  linha  text;
  n      int := 0;
  link   text;
BEGIN
  IF hora < 4 THEN RETURN 0; END IF;

  FOR r IN
    WITH cand AS (
      SELECT m.id, m.conversa_id, m.created_at, m.conteudo,
             row_number() OVER (PARTITION BY m.conversa_id ORDER BY m.created_at DESC) AS ult
      FROM public.ju_mensagens m
      WHERE m.origem = 'HUMANO'
        AND m.created_at >= now() - interval '26 hours'
        AND m.created_at <= now() - interval '60 minutes'
        AND m.conteudo ~* '(^|[^[:alnum:]])(marcad[oa]s?|agendad[oa]s?|agendei|marquei|remarcad[oa]s?|remarquei)([^[:alnum:]]|$)'
        AND m.conteudo !~ '\?'
        AND m.conteudo !~* '^[ ]*[áa]udio:'
        AND m.conteudo !~* '(est[aá]|est[aã]o|tem|temos|j[aá] (est[aá]|tem)|sess[aã]o|consulta)[[:space:]]+(uma[[:space:]]+)?(sess[aã]o[[:space:]]+)?agendad'
        AND NOT EXISTS (SELECT 1 FROM public.agenda_confirmacoes_verificadas v WHERE v.mensagem_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM public.ju_conversas t WHERE t.id = m.conversa_id AND t.telefone ~ '^\+?5561999000'))
    SELECT c.*, public.fn_telefone_br_formatado(cv.telefone) AS fone
    FROM cand c JOIN public.ju_conversas cv ON cv.id = c.conversa_id
    ORDER BY c.created_at
  LOOP
    IF r.ult > 1 THEN
      INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado) VALUES (r.id, r.conversa_id, 'agrupada');
      CONTINUE;
    END IF;

    SELECT array_agg((x ->> 'paciente_id')::uuid),
           string_agg(split_part(btrim(x ->> 'nome'), ' ', 1), ' e ')
      INTO pacs, nomes
      FROM (SELECT x FROM jsonb_array_elements(public.fn_ju_contexto_cliente(r.conversa_id) -> 'pacientes') x
             WHERE (x ->> 'acesso_agenda')::boolean LIMIT 4) s;

    SELECT EXISTS (
      SELECT 1 FROM public.agendamentos a
       WHERE a.paciente_id = ANY(coalesce(pacs, '{}')) AND a.ativo
         AND a.data_hora >= date_trunc('day', r.created_at AT TIME ZONE 'America/Sao_Paulo')
         AND (a.created_at >= r.created_at - interval '3 hours' OR a.updated_at >= r.created_at - interval '3 hours'))
      INTO ok;

    IF ok THEN
      INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado) VALUES (r.id, r.conversa_id, 'lancada');
      CONTINUE;
    END IF;

    sug := public.fn_agenda_sugestao_ler(r.conversa_id, r.id);
    INSERT INTO public.agenda_sugestoes (mensagem_id, conversa_id, telefone, texto, mensagem_em, paciente_ids, sugestao)
    VALUES (r.id, r.conversa_id, r.fone, left(btrim(r.conteudo), 1000), r.created_at, coalesce(pacs, '{}'), sug)
    RETURNING id INTO sid;
    link := 'https://app.respirakidsbrasilia.com.br/#/agenda/lancar/' || sid;

    SELECT split_part(btrim(p.nome), ' ', 1) INTO prof FROM public.pessoas p WHERE p.id = (sug ->> 'profissional_id')::uuid;
    linha := CASE WHEN sug ? 'data' OR sug ? 'hora' OR prof IS NOT NULL THEN
               E'\nPelo que entendi da conversa: '
               || concat_ws(' ',
                    CASE WHEN sug ? 'data' THEN
                      (ARRAY['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow FROM (sug ->> 'data')::date)::int + 1]
                      || ' ' || to_char((sug ->> 'data')::date, 'DD/MM') END,
                    CASE WHEN sug ? 'hora' THEN 'às ' || (sug ->> 'hora') END,
                    CASE WHEN prof IS NOT NULL THEN 'com ' || prof END)
               || ' (confira antes de salvar).'
             ELSE '' END;

    INSERT INTO public.ju_avisos_grupo (texto, origem, botao)
    VALUES ('📅 Consulta combinada e ainda não lançada?' || E'\n'
            || coalesce(nomes, 'Família sem cadastro ligado a este número') || ' · ' || coalesce(r.fone, 'número não disponível')
            || E'\nÀs ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
            || CASE WHEN (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
                    THEN ' de ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') ELSE '' END
            || ' a equipe escreveu: "' || left(regexp_replace(btrim(r.conteudo), '\s+', ' ', 'g'), 110)
            || CASE WHEN length(btrim(r.conteudo)) > 110 THEN '...' ELSE '' END || '"'
            || linha || E'\n'
            || CASE WHEN pacs IS NULL
                    THEN 'Este número não está ligado a nenhuma criança no cadastro. Se foi marcada, lance escolhendo a criança (e, se for família nova, faça o cadastro).'
                    ELSE 'Nenhuma consulta dessa família entrou ou mudou na agenda. Se foi marcada, lance para a família receber lembrete e cobrança.' END
            || E'\nToque em 📅 Lançar consulta ou abra: ' || link,
            'AGENDA_NAO_LANCADA',
            '📅 Lançar consulta|' || link);

    INSERT INTO public.agenda_confirmacoes_verificadas (mensagem_id, conversa_id, resultado)
    VALUES (r.id, r.conversa_id, CASE WHEN pacs IS NULL THEN 'sem_cadastro' ELSE 'avisada' END);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_confirmacoes_verificar() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Página do app (admin e secretaria)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_agenda_sugestao_obter(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  s   public.agenda_sugestoes;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN RAISE EXCEPTION 'Apenas admin ou secretaria'; END IF;
  SELECT * INTO s FROM public.agenda_sugestoes WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', s.id, 'status', s.status, 'texto', s.texto, 'mensagem_em', s.mensagem_em,
    'telefone', s.telefone, 'sugestao', s.sugestao, 'agendamento_id', s.agendamento_id,
    'resolvido_em', s.resolvido_em,
    'resolvido_por', (SELECT nome FROM public.pessoas WHERE id = s.resolvido_por),
    'profissional_nome', (SELECT nome FROM public.pessoas WHERE id = (s.sugestao ->> 'profissional_id')::uuid),
    'pacientes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) ORDER BY p.nome)
                             FROM public.pessoas p WHERE p.id = ANY(s.paciente_ids)), '[]'::jsonb),
    -- a conversa em volta da confirmação (12 h antes até 1 h depois)
    'mensagens', coalesce((SELECT jsonb_agg(jsonb_build_object('em', x.created_at, 'origem', x.origem,
                                    'texto', left(x.conteudo, 500), 'eh_a_confirmacao', x.id = s.mensagem_id) ORDER BY x.created_at)
                             FROM (SELECT m.* FROM public.ju_mensagens m
                                    WHERE m.conversa_id = s.conversa_id AND m.origem IN ('HUMANO', 'CLIENTE', 'JU')
                                      AND coalesce(btrim(m.conteudo), '') <> ''
                                      AND m.created_at BETWEEN s.mensagem_em - interval '12 hours' AND s.mensagem_em + interval '1 hour'
                                    ORDER BY m.created_at DESC LIMIT 12) x), '[]'::jsonb),
    -- o que já existe na agenda dessas crianças daqui para frente (para "já estava lançada")
    'consultas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'data_hora', a.data_hora,
                                    'paciente', pc.nome, 'profissional', pr.nome, 'servico', ts.nome,
                                    'criada_em', a.created_at) ORDER BY a.data_hora)
                             FROM public.agendamentos a
                             JOIN public.pessoas pc ON pc.id = a.paciente_id
                             LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id
                             LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
                            WHERE a.paciente_id = ANY(s.paciente_ids) AND a.ativo
                              AND a.data_hora >= date_trunc('day', s.mensagem_em AT TIME ZONE 'America/Sao_Paulo')), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_sugestao_obter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_agenda_sugestao_obter(uuid) TO authenticated;

CREATE FUNCTION public.fn_agenda_sugestao_resolver(p_id uuid, p_status text, p_agendamento_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_pessoa uuid;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN RAISE EXCEPTION 'Apenas admin ou secretaria'; END IF;
  IF p_status NOT IN ('lancada', 'ja_estava', 'descartada', 'pendente') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Situação inválida.');
  END IF;
  IF p_status = 'lancada' AND NOT EXISTS (SELECT 1 FROM public.agendamentos WHERE id = p_agendamento_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Consulta não encontrada.');
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;
  UPDATE public.agenda_sugestoes
     SET status = p_status,
         agendamento_id = CASE WHEN p_status = 'lancada' THEN p_agendamento_id END,
         resolvido_por = CASE WHEN p_status = 'pendente' THEN NULL ELSE v_pessoa END,
         resolvido_em = CASE WHEN p_status = 'pendente' THEN NULL ELSE now() END
   WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'Aviso não encontrado.'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.fn_agenda_sugestao_resolver(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_agenda_sugestao_resolver(uuid, text, uuid) TO authenticated;
