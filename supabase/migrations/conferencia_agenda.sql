-- =====================================================================================
-- Conferência de agenda (03/11/2026)
-- Confere todo dia a agenda contra as conversas de WhatsApp e contra ela mesma, para a
-- cobrança do mês sair certa. Três camadas:
--   1. Checagens só no banco (custo zero): status de consulta x pagamento contraditórios,
--      duplicadas, horário fora do expediente, consulta apagada.
--   2. Sessões extraídas das conversas pela IA (n8n "RK Conferência de agenda", gpt-6-luna):
--      gravadas por fn_conferencia_sessoes_salvar em conferencia_sessoes_conversa.
--   3. fn_conferencia_agenda_rodar compara (2) com a agenda, junta com (1) e mantém
--      conferencia_agenda_itens: item novo abre, item que deixou de valer fecha sozinho.
-- A aba "Conferência" em Conversas lê fn_conferencia_agenda_listar.
-- =====================================================================================

-- ---------- Consulta apagada deixa rastro (hoje some sem histórico) ----------
CREATE TABLE IF NOT EXISTS public.agendamentos_excluidos (
  id uuid PRIMARY KEY,
  data_hora timestamptz,
  paciente_id uuid,
  profissional_id uuid,
  status_consulta text,
  status_pagamento text,
  valor_servico numeric,
  registro jsonb NOT NULL,
  excluido_em timestamptz NOT NULL DEFAULT now(),
  excluido_por uuid
);
ALTER TABLE public.agendamentos_excluidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agendamentos_excluidos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_agendamento_registrar_exclusao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.agendamentos_excluidos
    (id, data_hora, paciente_id, profissional_id, status_consulta, status_pagamento, valor_servico, registro, excluido_por)
  VALUES (
    OLD.id, OLD.data_hora, OLD.paciente_id, OLD.profissional_id,
    (SELECT codigo FROM public.consulta_status WHERE id = OLD.status_consulta_id),
    (SELECT codigo FROM public.pagamento_status WHERE id = OLD.status_pagamento_id),
    OLD.valor_servico, to_jsonb(OLD), auth.uid())
  ON CONFLICT (id) DO NOTHING;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_agendamento_registrar_exclusao ON public.agendamentos;
CREATE TRIGGER trg_agendamento_registrar_exclusao
  AFTER DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_registrar_exclusao();

-- ---------- Sessões que a IA leu nas conversas ----------
CREATE TABLE IF NOT EXISTS public.conferencia_sessoes_conversa (
  id bigserial PRIMARY KEY,
  chatwoot_conversa_id bigint NOT NULL,
  caixa integer,
  telefone text,
  paciente_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  paciente_nome text,
  chave_paciente text NOT NULL,           -- paciente_id ou nome normalizado
  data date NOT NULL,
  hora time,
  profissional text,
  situacao text NOT NULL CHECK (situacao IN ('combinada','realizada','cancelada','remarcada','falta')),
  mensagem_em timestamptz,                -- hora real da mensagem que decide
  evidencia text,
  confianca text CHECK (confianca IN ('alta','media','baixa')),
  modelo text,
  extraido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatwoot_conversa_id, chave_paciente, data)
);
CREATE INDEX IF NOT EXISTS idx_conf_sessoes_data ON public.conferencia_sessoes_conversa (data);
ALTER TABLE public.conferencia_sessoes_conversa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conferencia_sessoes_conversa FROM anon, authenticated;

-- ---------- Itens da conferência (o relatório) ----------
CREATE TABLE IF NOT EXISTS public.conferencia_agenda_itens (
  id bigserial PRIMARY KEY,
  chave text NOT NULL UNIQUE,
  tipo text NOT NULL,
  grupo text NOT NULL CHECK (grupo IN ('corrigir','lancar','decidir','conferir','horario')),
  origem text NOT NULL CHECK (origem IN ('sistema','conversa','carga')),
  data date NOT NULL,
  hora time,
  paciente_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  paciente_nome text,
  profissional text,
  agendamento_id uuid,
  chatwoot_conversa_id bigint,
  detalhe text,
  evidencia text,
  confianca text,
  valor numeric,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','resolvido','ignorado','fechado_auto')),
  nota text,
  resolvido_por uuid,
  resolvido_por_nome text,
  resolvido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  visto_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conf_itens_data ON public.conferencia_agenda_itens (data);
CREATE INDEX IF NOT EXISTS idx_conf_itens_status ON public.conferencia_agenda_itens (status);
ALTER TABLE public.conferencia_agenda_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conferencia_agenda_itens FROM anon, authenticated;

-- ---------- Contexto para a IA: pacientes ligados ao telefone ----------
-- Devolve ignorar=true para equipe, grupos e números de teste.
CREATE OR REPLACE FUNCTION public.fn_conferencia_contexto(p_telefone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (SELECT public.fn_tel_chave(p_telefone) AS chave),
  dono AS (
    SELECT p.id, p.nome, tp.codigo
    FROM public.pessoas p
    LEFT JOIN public.pessoa_tipos tp ON tp.id = p.id_tipo_pessoa
    WHERE p.ativo AND public.fn_tel_chave(p.telefone::text) = (SELECT chave FROM k)
  ),
  pacs AS (
    SELECT DISTINCT pa.id, pa.nome
    FROM dono d
    JOIN public.pessoa_responsaveis pr ON pr.id_responsavel = d.id AND pr.ativo
    JOIN public.pessoas pa ON pa.id = pr.id_pessoa AND pa.ativo
    UNION
    SELECT d.id, d.nome FROM dono d WHERE d.codigo = 'paciente'
  )
  SELECT jsonb_build_object(
    'ignorar', (SELECT chave FROM k) IS NULL
               OR EXISTS (SELECT 1 FROM dono WHERE codigo IN ('admin','profissional','secretaria'))
               OR (SELECT chave FROM k) = public.fn_tel_chave('5561991310529')
               OR (SELECT chave FROM k) LIKE '6199900%',
    'pacientes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome) ORDER BY nome) FROM pacs), '[]'::jsonb),
    'responsaveis', COALESCE((SELECT jsonb_agg(nome) FROM dono WHERE codigo <> 'paciente'), '[]'::jsonb)
  );
$$;

-- ---------- n8n grava as sessões lidas de uma conversa ----------
-- p_sessoes: [{paciente_id, paciente_nome, data, hora, profissional, situacao, mensagem_em, evidencia, confianca}]
CREATE OR REPLACE FUNCTION public.fn_conferencia_sessoes_salvar(
  p_conversa_id bigint, p_caixa integer, p_telefone text, p_sessoes jsonb, p_modelo text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s jsonb; v_pac uuid; v_nome text; v_chave text; v_data date; n int := 0;
  v_validos uuid[];
BEGIN
  SELECT array_agg((x->>'id')::uuid) INTO v_validos
  FROM jsonb_array_elements(public.fn_conferencia_contexto(p_telefone)->'pacientes') x;

  FOR s IN SELECT * FROM jsonb_array_elements(COALESCE(p_sessoes, '[]'::jsonb)) LOOP
    BEGIN
      v_data := (s->>'data')::date;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
    IF v_data IS NULL OR v_data < current_date - 60 OR v_data > current_date + 60 THEN CONTINUE; END IF;

    v_nome := NULLIF(btrim(s->>'paciente_nome'), '');
    v_pac := NULL;
    BEGIN v_pac := NULLIF(s->>'paciente_id', '')::uuid; EXCEPTION WHEN others THEN v_pac := NULL; END;
    IF v_pac IS NOT NULL AND NOT (v_pac = ANY (COALESCE(v_validos, '{}'))) THEN v_pac := NULL; END IF;

    -- sem id: tenta achar pelo nome (primeiro + último nome, sem acento) quando há um só candidato
    IF v_pac IS NULL AND v_nome IS NOT NULL AND array_length(regexp_split_to_array(v_nome, '\s+'), 1) >= 2 THEN
      SELECT min(p.id::text)::uuid INTO v_pac
      FROM public.pessoas p JOIN public.pessoa_tipos tp ON tp.id = p.id_tipo_pessoa AND tp.codigo = 'paciente'
      WHERE p.ativo
        AND unaccent(lower(p.nome)) LIKE unaccent(lower(split_part(v_nome, ' ', 1))) || ' %'
        AND unaccent(lower(p.nome)) LIKE '% ' || unaccent(lower(regexp_replace(v_nome, '^.*\s', '')))  || '%'
      HAVING count(*) = 1;
    END IF;
    IF v_pac IS NOT NULL THEN SELECT nome INTO v_nome FROM public.pessoas WHERE id = v_pac; END IF;

    v_chave := COALESCE(v_pac::text, 'nome:' || unaccent(lower(COALESCE(v_nome, '?'))));

    INSERT INTO public.conferencia_sessoes_conversa
      (chatwoot_conversa_id, caixa, telefone, paciente_id, paciente_nome, chave_paciente, data, hora,
       profissional, situacao, mensagem_em, evidencia, confianca, modelo, extraido_em)
    VALUES (p_conversa_id, p_caixa, p_telefone, v_pac, v_nome, v_chave, v_data,
       CASE WHEN s->>'hora' ~ '^\d{1,2}:\d{2}' THEN (s->>'hora')::time END,
       NULLIF(s->>'profissional', ''), s->>'situacao',
       NULLIF(s->>'mensagem_em', '')::timestamptz, left(s->>'evidencia', 400),
       CASE WHEN s->>'confianca' IN ('alta','media','baixa') THEN s->>'confianca' END,
       p_modelo, now())
    ON CONFLICT (chatwoot_conversa_id, chave_paciente, data) DO UPDATE SET
      hora = COALESCE(EXCLUDED.hora, conferencia_sessoes_conversa.hora),
      profissional = COALESCE(EXCLUDED.profissional, conferencia_sessoes_conversa.profissional),
      situacao = EXCLUDED.situacao,
      mensagem_em = EXCLUDED.mensagem_em,
      evidencia = EXCLUDED.evidencia,
      confianca = EXCLUDED.confianca,
      paciente_id = COALESCE(EXCLUDED.paciente_id, conferencia_sessoes_conversa.paciente_id),
      paciente_nome = COALESCE(EXCLUDED.paciente_nome, conferencia_sessoes_conversa.paciente_nome),
      modelo = EXCLUDED.modelo,
      extraido_em = now()
    -- leitura mais antiga não sobrescreve decisão mais nova
    WHERE EXCLUDED.mensagem_em IS NULL OR conferencia_sessoes_conversa.mensagem_em IS NULL
       OR EXCLUDED.mensagem_em >= conferencia_sessoes_conversa.mensagem_em;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ---------- Comparação + checagens: monta e atualiza os itens ----------
CREATE OR REPLACE FUNCTION public.fn_conferencia_agenda_rodar(p_dias integer DEFAULT 45)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date := current_date - p_dias;
  v_fim date := current_date + 1;
  v_novos int; v_fechados int; v_abertos int;
BEGIN
  IF NOT (session_user IN ('postgres','supabase_admin') OR auth.role() = 'service_role'
          OR public.fn_rls_admin_secretaria_ativo()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  DROP TABLE IF EXISTS _ag, _it, _s, _val;
  CREATE TEMP TABLE _ag ON COMMIT DROP AS
  SELECT a.id, a.paciente_id, a.data_hora,
         (a.data_hora AT TIME ZONE 'UTC') AS parede,
         (a.data_hora AT TIME ZONE 'UTC')::date AS dia,
         cs.codigo AS st, ps.codigo AS pg, a.fatura_id, a.valor_servico, a.updated_at,
         split_part(pr.nome, ' ', 1) AS prof, p.nome AS pac
  FROM public.agendamentos a
  JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
  LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id
  LEFT JOIN public.pessoas p ON p.id = a.paciente_id
  WHERE a.ativo AND a.data_hora >= (v_ini - 1)::timestamptz AND a.data_hora < (v_fim + 30)::timestamptz;

  CREATE TEMP TABLE _it (
    chave text PRIMARY KEY, tipo text, grupo text, origem text, data date, hora time,
    paciente_id uuid, paciente_nome text, profissional text, agendamento_id uuid,
    chatwoot_conversa_id bigint, detalhe text, evidencia text, confianca text, valor numeric
  ) ON COMMIT DROP;

  -- 1a. Status contraditório: consulta parada com pagamento em aberto, ou o contrário
  INSERT INTO _it
  SELECT 'status:' || id, 'STATUS_CONTRADITORIO', 'corrigir', 'sistema', dia, parede::time,
         paciente_id, pac, prof, id, NULL,
         CASE WHEN st IN ('cancelado','erro','reagendado')
              THEN 'Consulta "' || st || '" com pagamento "' || pg || '": a cobrança em massa olha só o pagamento e vai cobrar.'
              ELSE 'Consulta "' || st || '" com pagamento "cancelado": fica fora da cobrança. Se a sessão ocorreu, acertar o pagamento.' END,
         NULL, 'alta', valor_servico
  FROM _ag
  WHERE dia BETWEEN v_ini AND current_date AND fatura_id IS NULL
    AND ((st IN ('cancelado','erro','reagendado') AND pg IN ('pendente','atrasado'))
      OR (st NOT IN ('cancelado','erro','reagendado') AND pg = 'cancelado'))
  ON CONFLICT DO NOTHING;

  -- 1b. Horário fora do expediente (provável erro de digitação: 01:00, 22:30)
  INSERT INTO _it
  SELECT 'horario_estranho:' || id, 'HORARIO_ESTRANHO', 'corrigir', 'sistema', dia, parede::time,
         paciente_id, pac, prof, id, NULL,
         'Consulta às ' || to_char(parede, 'HH24:MI') || ', fora do expediente. Se for erro de digitação, vai ser cobrada a mais.'
         || COALESCE(' Mesmo dia: ' || (SELECT string_agg(to_char(b.parede, 'HH24:MI') || ' (' || b.st || ')', ', ')
                                       FROM _ag b WHERE b.paciente_id = _ag.paciente_id AND b.dia = _ag.dia AND b.id <> _ag.id), ''),
         NULL, 'alta', valor_servico
  FROM _ag
  WHERE dia BETWEEN v_ini AND current_date + 30 AND st NOT IN ('cancelado','erro','reagendado')
    AND (extract(hour FROM parede) < 6 OR extract(hour FROM parede) >= 22)
  ON CONFLICT DO NOTHING;

  -- 1c. Duplicada: mesmo paciente, duas consultas ativas com menos de 90 min de distância
  INSERT INTO _it
  SELECT 'duplicada:' || b.id, 'DUPLICADA', 'corrigir', 'sistema', b.dia, b.parede::time,
         b.paciente_id, b.pac, b.prof, b.id, NULL,
         'Duas consultas do mesmo paciente com ' || abs(extract(epoch FROM b.parede - a.parede) / 60)::int
         || ' min de diferença (' || to_char(a.parede, 'HH24:MI') || ' ' || a.prof || ' e ' || to_char(b.parede, 'HH24:MI') || ' ' || b.prof || '). Cobraria duas vezes.',
         NULL, 'media', b.valor_servico
  FROM _ag a JOIN _ag b ON a.paciente_id = b.paciente_id AND a.dia = b.dia AND a.id < b.id
  WHERE b.dia BETWEEN v_ini AND current_date + 30
    AND a.st NOT IN ('cancelado','erro','reagendado') AND b.st NOT IN ('cancelado','erro','reagendado')
    AND abs(extract(epoch FROM b.parede - a.parede)) < 90 * 60
  ON CONFLICT DO NOTHING;

  -- 1d. Consulta apagada (a partir de 03/11/2026, quando o rastro começou)
  INSERT INTO _it
  SELECT 'excluida:' || e.id, 'CONSULTA_APAGADA', 'conferir', 'sistema', (e.data_hora AT TIME ZONE 'UTC')::date,
         (e.data_hora AT TIME ZONE 'UTC')::time, e.paciente_id, p.nome, split_part(pr.nome, ' ', 1), NULL, NULL,
         'Consulta apagada em ' || to_char(e.excluido_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
         || COALESCE(' por ' || ex.nome, '') || ' (estava "' || COALESCE(e.status_consulta, '?') || '"). Se foi desmarcação em cima da hora, decidir a taxa.',
         NULL, 'media', e.valor_servico
  FROM public.agendamentos_excluidos e
  LEFT JOIN public.pessoas p ON p.id = e.paciente_id
  LEFT JOIN public.pessoas pr ON pr.id = e.profissional_id
  LEFT JOIN public.pessoas ex ON ex.auth_user_id = e.excluido_por
  WHERE (e.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_ini AND current_date
    AND COALESCE(e.status_consulta, '') NOT IN ('cancelado','erro')
  ON CONFLICT DO NOTHING;

  -- 2. Conversas: a decisão mais recente por paciente + dia vale
  CREATE TEMP TABLE _s ON COMMIT DROP AS
  SELECT DISTINCT ON (chave_paciente, data) *
  FROM public.conferencia_sessoes_conversa
  WHERE data BETWEEN v_ini AND current_date - 1   -- o dia de hoje ainda pode ser lançado
  ORDER BY chave_paciente, data, mensagem_em DESC NULLS LAST, extraido_em DESC;

  -- valor de referência do paciente (mediana dos últimos 90 dias)
  CREATE TEMP TABLE _val ON COMMIT DROP AS
  SELECT a.paciente_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY a.valor_servico) AS v
  FROM public.agendamentos a
  WHERE a.ativo AND a.valor_servico > 0 AND a.data_hora > now() - interval '90 days'
    AND a.paciente_id IN (SELECT paciente_id FROM _s WHERE paciente_id IS NOT NULL)
  GROUP BY 1;

  INSERT INTO _it
  SELECT DISTINCT ON (chave)
         chave, tipo, grupo, 'conversa', data, hora, paciente_id, paciente_nome, profissional,
         agendamento_id, chatwoot_conversa_id, detalhe, evidencia, confianca, valor
  FROM (
    SELECT s.*, x.*
    FROM _s s
    LEFT JOIN _val v ON v.paciente_id = s.paciente_id
    CROSS JOIN LATERAL (
      SELECT
        -- consulta ativa mais próxima do horário combinado, no mesmo dia
        (SELECT a.id FROM _ag a WHERE a.paciente_id = s.paciente_id AND a.dia = s.data
           AND a.st NOT IN ('cancelado','erro','reagendado')
         ORDER BY abs(extract(epoch FROM a.parede::time - COALESCE(s.hora, a.parede::time))) LIMIT 1) AS ativa,
        (SELECT a.id FROM _ag a WHERE a.paciente_id = s.paciente_id AND a.dia = s.data
           AND a.st IN ('cancelado','erro','reagendado') LIMIT 1) AS inativa,
        CASE WHEN s.mensagem_em IS NOT NULL AND s.hora IS NOT NULL
             THEN extract(epoch FROM (s.data + s.hora) - (s.mensagem_em AT TIME ZONE 'America/Sao_Paulo')) / 3600 END AS antecedencia_h,
        v.v AS valor_ref
    ) y
    CROSS JOIN LATERAL (
      SELECT * FROM (VALUES
        -- combinada/realizada e nada na agenda
        (s.situacao IN ('combinada','realizada') AND y.ativa IS NULL AND y.inativa IS NULL AND s.paciente_id IS NOT NULL,
         'nao_lancada:' || s.chave_paciente || ':' || s.data, 'NAO_LANCADA', 'lancar', NULL::uuid,
         'A conversa mostra a sessão ' || CASE s.situacao WHEN 'realizada' THEN 'realizada' ELSE 'combinada' END
           || ' e não há consulta do paciente nesse dia.', y.valor_ref),
        -- sem cadastro
        (s.situacao IN ('combinada','realizada') AND s.paciente_id IS NULL,
         'sem_cadastro:' || s.chave_paciente || ':' || s.data, 'SEM_CADASTRO', 'lancar', NULL::uuid,
         'Sessão na conversa com paciente que não foi achado no cadastro (' || COALESCE(s.paciente_nome, 'nome não dito') || ').', NULL::numeric),
        -- combinada/realizada mas cancelada no sistema
        (s.situacao IN ('combinada','realizada') AND y.ativa IS NULL AND y.inativa IS NOT NULL,
         'cancelada_sistema:' || y.inativa, 'CANCELADA_NO_SISTEMA', 'lancar', y.inativa,
         'Na conversa a sessão ficou de pé, mas no sistema está cancelada: não vai ser cobrada.', y.valor_ref),
        -- desmarcada na conversa e ativa no sistema
        (s.situacao IN ('cancelada','remarcada') AND y.ativa IS NOT NULL
           AND COALESCE(y.antecedencia_h, 1) > 0     -- aviso depois do horário não é desmarcação
           AND (s.hora IS NULL OR EXISTS (SELECT 1 FROM _ag a WHERE a.id = y.ativa
                  AND abs(extract(epoch FROM a.parede::time - s.hora)) <= 90 * 60)),
         'desmarcada_ativa:' || y.ativa, 'DESMARCADA_ATIVA', 'corrigir', y.ativa,
         'A conversa ' || CASE s.situacao WHEN 'remarcada' THEN 'remarcou' ELSE 'desmarcou' END || ' esta sessão'
           || COALESCE(' com ' || round(y.antecedencia_h::numeric, 1) || 'h de antecedência', '')
           || ', mas ela segue ativa no sistema e seria cobrada.'
           || CASE WHEN y.antecedencia_h < 6 THEN ' Aviso com menos de 6h: pelo contrato, 50%.' ELSE '' END, NULL::numeric),
        -- falta sem consulta no sistema
        (s.situacao = 'falta' AND y.ativa IS NULL AND s.paciente_id IS NOT NULL,
         'falta_sem_consulta:' || s.chave_paciente || ':' || s.data, 'FALTA_SEM_COBRANCA', 'decidir', y.inativa,
         'A família faltou e não há consulta ativa para cobrar (falta cobra integral).', y.valor_ref),
        -- desmarcada em cima da hora e cancelada sem cobrança
        (s.situacao IN ('cancelada','remarcada') AND y.ativa IS NULL AND y.inativa IS NOT NULL AND y.antecedencia_h > 0 AND y.antecedencia_h < 6,
         'cancel_6h:' || y.inativa, 'CANCELAMENTO_MENOS_6H', 'decidir', y.inativa,
         'Desmarcada com ' || round(greatest(y.antecedencia_h, 0)::numeric, 1) || 'h de antecedência e cancelada sem cobrança. Contrato: menos de 6h = 50%.', y.valor_ref),
        -- horário diferente do combinado (mesmo dia, não muda o valor)
        (s.situacao IN ('combinada','realizada') AND y.ativa IS NOT NULL AND s.hora IS NOT NULL AND s.confianca = 'alta'
           AND EXISTS (SELECT 1 FROM _ag a WHERE a.id = y.ativa AND abs(extract(epoch FROM a.parede::time - s.hora)) > 60 * 60),
         'horario:' || y.ativa, 'HORARIO_DIVERGENTE', 'horario', y.ativa,
         'Combinado às ' || to_char(s.hora, 'HH24:MI') || '; no sistema às '
           || (SELECT to_char(a.parede, 'HH24:MI') FROM _ag a WHERE a.id = y.ativa) || '. Mesmo dia, não muda o valor.', NULL::numeric)
      ) t(cond, chave, tipo, grupo, agendamento_id, detalhe, valor)
      WHERE t.cond
    ) x
  ) z
  ORDER BY chave
  ON CONFLICT DO NOTHING;

  -- 3. Aplica: novo abre, existente atualiza, fechado sozinho reabre se voltou
  WITH up AS (
    INSERT INTO public.conferencia_agenda_itens AS c
      (chave, tipo, grupo, origem, data, hora, paciente_id, paciente_nome, profissional, agendamento_id,
       chatwoot_conversa_id, detalhe, evidencia, confianca, valor)
    SELECT chave, tipo, grupo, origem, data, hora, paciente_id, paciente_nome, profissional, agendamento_id,
           chatwoot_conversa_id, detalhe, evidencia, confianca, valor
    FROM _it
    ON CONFLICT (chave) DO UPDATE SET
      detalhe = EXCLUDED.detalhe, evidencia = COALESCE(EXCLUDED.evidencia, c.evidencia),
      hora = EXCLUDED.hora, valor = EXCLUDED.valor, confianca = EXCLUDED.confianca,
      chatwoot_conversa_id = COALESCE(EXCLUDED.chatwoot_conversa_id, c.chatwoot_conversa_id),
      status = CASE WHEN c.status = 'fechado_auto' THEN 'aberto' ELSE c.status END,
      atualizado_em = CASE WHEN c.detalhe IS DISTINCT FROM EXCLUDED.detalhe OR c.status = 'fechado_auto' THEN now() ELSE c.atualizado_em END,
      visto_em = now()
    RETURNING (xmax = 0) AS novo
  )
  SELECT count(*) FILTER (WHERE novo) INTO v_novos FROM up;

  -- o que deixou de valer fecha sozinho (só itens automáticos, da janela)
  UPDATE public.conferencia_agenda_itens c
     SET status = 'fechado_auto', atualizado_em = now()
   WHERE c.status = 'aberto' AND c.origem <> 'carga'
     AND c.data BETWEEN v_ini AND current_date + 30
     AND NOT EXISTS (SELECT 1 FROM _it WHERE _it.chave = c.chave);
  GET DIAGNOSTICS v_fechados = ROW_COUNT;

  -- carga manual: fecha quando a consulta citada passou a bater (lançada ou corrigida)
  UPDATE public.conferencia_agenda_itens c
     SET status = 'fechado_auto', atualizado_em = now()
   WHERE c.status = 'aberto' AND c.origem = 'carga' AND c.tipo = 'NAO_LANCADA' AND c.paciente_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM _ag a WHERE a.paciente_id = c.paciente_id AND a.dia = c.data
                   AND a.st NOT IN ('cancelado','erro','reagendado'));

  SELECT count(*) INTO v_abertos FROM public.conferencia_agenda_itens WHERE status = 'aberto';
  RETURN jsonb_build_object('novos', v_novos, 'fechados', v_fechados, 'abertos', v_abertos, 'rodado_em', now());
END $$;

-- ---------- Leitura para a tela ----------
CREATE OR REPLACE FUNCTION public.fn_conferencia_agenda_listar(p_mes date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date; v_fim date;
BEGIN
  IF NOT (session_user IN ('postgres','supabase_admin') OR public.fn_rls_admin_secretaria_ativo()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  v_ini := date_trunc('month', COALESCE(p_mes, current_date))::date;
  v_fim := (v_ini + interval '1 month')::date;
  RETURN jsonb_build_object(
    'mes', v_ini,
    'ultima_execucao', (SELECT max(visto_em) FROM public.conferencia_agenda_itens),
    'ultima_leitura_conversas', (SELECT max(extraido_em) FROM public.conferencia_sessoes_conversa),
    'conversas_lidas_mes', (SELECT count(DISTINCT chatwoot_conversa_id) FROM public.conferencia_sessoes_conversa WHERE data >= v_ini AND data < v_fim),
    'sessoes_lidas_mes', (SELECT count(*) FROM public.conferencia_sessoes_conversa WHERE data >= v_ini AND data < v_fim),
    'itens', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object(
               'agendamento_status', (SELECT cs.descricao FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id WHERE a.id = i.agendamento_id),
               'agendamento_pagamento', (SELECT ps.descricao FROM public.agendamentos a JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id WHERE a.id = i.agendamento_id))
             ORDER BY i.data, i.hora NULLS LAST)
      FROM public.conferencia_agenda_itens i
      WHERE i.data >= v_ini AND i.data < v_fim), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.fn_conferencia_agenda_marcar(p_id bigint, p_status text, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa uuid; v_nome text; r public.conferencia_agenda_itens;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_status NOT IN ('aberto','resolvido','ignorado') THEN RAISE EXCEPTION 'status inválido'; END IF;
  SELECT id, nome INTO v_pessoa, v_nome FROM public.pessoas WHERE auth_user_id = auth.uid();
  UPDATE public.conferencia_agenda_itens SET
    status = p_status,
    nota = COALESCE(NULLIF(btrim(p_nota), ''), nota),
    resolvido_por = CASE WHEN p_status = 'aberto' THEN NULL ELSE v_pessoa END,
    resolvido_por_nome = CASE WHEN p_status = 'aberto' THEN NULL ELSE v_nome END,
    resolvido_em = CASE WHEN p_status = 'aberto' THEN NULL ELSE now() END,
    atualizado_em = now()
  WHERE id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'item não encontrado'; END IF;
  RETURN to_jsonb(r);
END $$;

-- ---------- Permissões ----------
REVOKE ALL ON FUNCTION public.fn_agendamento_registrar_exclusao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conferencia_contexto(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conferencia_sessoes_salvar(bigint, integer, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conferencia_agenda_rodar(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conferencia_agenda_listar(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conferencia_agenda_marcar(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_contexto(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_sessoes_salvar(bigint, integer, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_agenda_rodar(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_agenda_listar(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_agenda_marcar(bigint, text, text) TO authenticated;

-- ---------- Rodada diária só do banco (o n8n também chama ao terminar a leitura) ----------
SELECT cron.unschedule('conferencia-agenda') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conferencia-agenda');
SELECT cron.schedule('conferencia-agenda', '40 9 * * *', $c$ SELECT public.fn_conferencia_agenda_rodar(); $c$);

-- ---------- Disparo diário da leitura das conversas (n8n flows-principal N4ZakTeyal7vAVWo) ----------
CREATE OR REPLACE FUNCTION public.fn_conferencia_conversas_disparar(p_horas integer DEFAULT 26)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF NOT (session_user IN ('postgres','supabase_admin') OR public.fn_rls_admin_aprovado_ativo()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'ju_tarefas_token';
  RETURN net.http_post(
    url := 'https://flows-principal.infusecomunicacao.online/webhook/rk-conferencia-agenda-8e3f1c27',
    body := jsonb_build_object('horas', LEAST(GREATEST(COALESCE(p_horas, 26), 1), 24 * 45)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ju-tarefas', v_token),
    timeout_milliseconds := 10000);
END $$;
REVOKE ALL ON FUNCTION public.fn_conferencia_conversas_disparar(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('conferencia-conversas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conferencia-conversas');
SELECT cron.schedule('conferencia-conversas', '30 8 * * *', $c$ SELECT public.fn_conferencia_conversas_disparar(26); $c$);

-- ---------- "Lançar" a partir da conferência: reaproveita a tela /agenda/lancar/:id ----------
-- Cria (uma vez) um registro em agenda_sugestoes com criança, dia, hora e fisio do item.
-- conversa_id = 0 marca que veio da conferência (não há card no grupo para apagar).
ALTER TABLE public.conferencia_agenda_itens ADD COLUMN IF NOT EXISTS sugestao_id uuid;

CREATE OR REPLACE FUNCTION public.fn_conferencia_item_lancar(p_id bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.conferencia_agenda_itens; v_sug uuid; v_prof uuid;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO i FROM public.conferencia_agenda_itens WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item não encontrado'; END IF;
  IF i.sugestao_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.agenda_sugestoes WHERE id = i.sugestao_id) THEN
    RETURN i.sugestao_id;
  END IF;
  SELECT p.id INTO v_prof
  FROM public.pessoas p JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
  WHERE p.ativo AND t.codigo IN ('profissional','admin') AND i.profissional IS NOT NULL
    AND unaccent(lower(split_part(p.nome, ' ', 1))) = unaccent(lower(split_part(regexp_replace(i.profissional, '^Bia$', 'Beatriz'), ' ', 1)))
  LIMIT 1;
  INSERT INTO public.agenda_sugestoes (conversa_id, telefone, texto, mensagem_em, paciente_ids, sugestao, status)
  VALUES (0, NULL,
          COALESCE(NULLIF(i.evidencia, ''), i.detalhe, 'Conferência de agenda'),
          (i.data + COALESCE(i.hora, time '08:00')) AT TIME ZONE 'America/Sao_Paulo',
          CASE WHEN i.paciente_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[i.paciente_id] END,
          jsonb_strip_nulls(jsonb_build_object('data', i.data, 'hora', to_char(i.hora, 'HH24:MI'), 'profissional_id', v_prof)),
          'pendente')
  RETURNING id INTO v_sug;
  UPDATE public.conferencia_agenda_itens SET sugestao_id = v_sug WHERE id = p_id;
  RETURN v_sug;
END $$;
REVOKE ALL ON FUNCTION public.fn_conferencia_item_lancar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_item_lancar(bigint) TO authenticated;
