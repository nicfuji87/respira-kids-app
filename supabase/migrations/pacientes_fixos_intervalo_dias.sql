-- Pacientes Fixos: frequência "a cada N dias" + troca de frequência pela lista
-- (02/11/2026, pedido do dono: "tem paciente que é a cada 20 dias")
--
-- - frequencia = 'personalizada' com intervalo_dias (7 a 120).
-- - Ciclo em dias: semanal/2x/3x/diária = 7, quinzenal = 14, mensal = 28,
--   personalizada = intervalo_dias. A semana prevista é a semana de
--   (última sessão + ciclo); para os de 7 dias, toda semana.
-- - A evolução não mexe na frequência de quem tem intervalo próprio (a conduta
--   só tem as frequências padrão e trocaria 20 dias por quinzenal). Alta
--   continua tirando dos fixos.

ALTER TABLE public.pacientes_fixos
  ADD COLUMN IF NOT EXISTS intervalo_dias integer;

ALTER TABLE public.pacientes_fixos DROP CONSTRAINT IF EXISTS pacientes_fixos_frequencia_check;
ALTER TABLE public.pacientes_fixos ADD CONSTRAINT pacientes_fixos_frequencia_check
  CHECK (frequencia IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal', 'personalizada'));
ALTER TABLE public.pacientes_fixos DROP CONSTRAINT IF EXISTS pacientes_fixos_intervalo_check;
ALTER TABLE public.pacientes_fixos ADD CONSTRAINT pacientes_fixos_intervalo_check
  CHECK (frequencia <> 'personalizada' OR intervalo_dias BETWEEN 7 AND 120);

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_ritmo(p_frequencia text, OUT sessoes int, OUT semanas int)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_frequencia
           WHEN 'diaria' THEN 5 WHEN '3x_semana' THEN 3 WHEN '2x_semana' THEN 2 ELSE 1 END,
         CASE p_frequencia
           WHEN 'quinzenal' THEN 2 WHEN 'mensal' THEN 4 ELSE 1 END;
$$;

-- Dias entre um ciclo e outro
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_ciclo_dias(p_frequencia text, p_intervalo_dias integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_frequencia
           WHEN 'quinzenal' THEN 14
           WHEN 'mensal' THEN 28
           WHEN 'personalizada' THEN greatest(coalesce(p_intervalo_dias, 7), 7)
           ELSE 7 END;
$$;

-- Troca só a frequência (lista de fixos); não mexe em profissionais/observação
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_frequencia(
  p_paciente_id uuid,
  p_frequencia text,
  p_intervalo_dias integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar paciente fixo' USING ERRCODE = '42501';
  END IF;
  IF p_frequencia = 'personalizada' AND (p_intervalo_dias IS NULL OR p_intervalo_dias NOT BETWEEN 7 AND 120) THEN
    RAISE EXCEPTION 'Intervalo deve ser de 7 a 120 dias';
  END IF;
  UPDATE public.pacientes_fixos
     SET frequencia = p_frequencia,
         intervalo_dias = CASE WHEN p_frequencia = 'personalizada' THEN p_intervalo_dias END,
         ultima_origem = 'lista',
         ultima_evolucao_id = NULL,
         atualizado_por = public.get_current_pessoa_id()
   WHERE paciente_id = p_paciente_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não está nos fixos';
  END IF;
  RETURN public.fn_paciente_fixo_get(p_paciente_id);
END;
$$;

-- Salvar (ficha) com intervalo
DROP FUNCTION IF EXISTS public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text, uuid[]);
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_salvar(
  p_paciente_id uuid,
  p_frequencia text,
  p_profissional_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_origem text DEFAULT 'cadastro',
  p_profissionais uuid[] DEFAULT NULL,
  p_intervalo_dias integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu uuid := public.get_current_pessoa_id();
  v_profs uuid[];
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar paciente fixo' USING ERRCODE = '42501';
  END IF;
  IF p_frequencia NOT IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal', 'personalizada') THEN
    RAISE EXCEPTION 'Frequência inválida: %', p_frequencia;
  END IF;
  IF p_frequencia = 'personalizada' AND (p_intervalo_dias IS NULL OR p_intervalo_dias NOT BETWEEN 7 AND 120) THEN
    RAISE EXCEPTION 'Intervalo deve ser de 7 a 120 dias';
  END IF;

  SELECT array_agg(x.id ORDER BY x.ord) INTO v_profs
    FROM (SELECT DISTINCT ON (id) id, ord
            FROM unnest(coalesce(p_profissionais,
                   CASE WHEN p_profissional_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_profissional_id] END))
                 WITH ORDINALITY AS u(id, ord)
           WHERE id IS NOT NULL
           ORDER BY id, ord) x;

  INSERT INTO public.pacientes_fixos AS pf
    (paciente_id, frequencia, intervalo_dias, profissional_id, profissionais, observacao, ativo, ultima_origem, atualizado_por)
  VALUES
    (p_paciente_id, p_frequencia, CASE WHEN p_frequencia = 'personalizada' THEN p_intervalo_dias END,
     v_profs[1], v_profs, nullif(trim(p_observacao), ''), true,
     CASE WHEN p_origem IN ('cadastro', 'lista') THEN p_origem ELSE 'cadastro' END, v_eu)
  ON CONFLICT (paciente_id) DO UPDATE SET
    frequencia = EXCLUDED.frequencia,
    intervalo_dias = EXCLUDED.intervalo_dias,
    profissional_id = EXCLUDED.profissional_id,
    profissionais = EXCLUDED.profissionais,
    observacao = EXCLUDED.observacao,
    ativo = true,
    encerrado_em = NULL,
    encerrado_motivo = NULL,
    ultima_origem = EXCLUDED.ultima_origem,
    ultima_evolucao_id = NULL,
    atualizado_por = v_eu;

  RETURN public.fn_paciente_fixo_get(p_paciente_id);
END;
$$;

-- Ficha: devolve o intervalo
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_get(p_paciente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f record;
  v_hist jsonb;
  v_profs jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria() OR public.is_profissional()) THEN
    RETURN NULL;
  END IF;

  SELECT pf.*, pr.nome AS profissional_nome, au.nome AS atualizado_por_nome
    INTO f
    FROM public.pacientes_fixos pf
    LEFT JOIN public.pessoas pr ON pr.id = pf.profissional_id
    LEFT JOIN public.pessoas au ON au.id = pf.atualizado_por
   WHERE pf.paciente_id = p_paciente_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'id', NULL, 'paciente_id', p_paciente_id, 'ativo', false, 'novo', true,
      'historico_profissionais', public.fn_paciente_fixo_alternancia(p_paciente_id),
      'historico', '[]'::jsonb, 'profissionais', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) ORDER BY x.ord), '[]'::jsonb)
    INTO v_profs
    FROM unnest(coalesce(f.profissionais, '{}')) WITH ORDINALITY AS x(id, ord)
    JOIN public.pessoas p ON p.id = x.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'acao', h.acao, 'origem', h.origem,
           'frequencia', h.depois->>'frequencia',
           'frequencia_antes', h.antes->>'frequencia',
           'intervalo_dias', (h.depois->>'intervalo_dias')::int,
           'intervalo_dias_antes', (h.antes->>'intervalo_dias')::int,
           'adiado_ate', h.depois->>'adiado_ate',
           'feito_por_nome', p.nome, 'feito_em', h.feito_em) ORDER BY h.feito_em DESC), '[]'::jsonb)
    INTO v_hist
    FROM (SELECT * FROM public.pacientes_fixos_historico
           WHERE paciente_id = p_paciente_id ORDER BY feito_em DESC LIMIT 10) h
    LEFT JOIN public.pessoas p ON p.id = h.feito_por;

  RETURN jsonb_build_object(
    'id', f.id,
    'paciente_id', f.paciente_id,
    'frequencia', f.frequencia,
    'intervalo_dias', f.intervalo_dias,
    'profissional_id', f.profissional_id,
    'profissional_nome', f.profissional_nome,
    'profissionais', v_profs,
    'historico_profissionais', public.fn_paciente_fixo_alternancia(p_paciente_id),
    'observacao', f.observacao,
    'ativo', f.ativo,
    'adiado_ate', f.adiado_ate,
    'adiado_motivo', f.adiado_motivo,
    'encerrado_em', f.encerrado_em,
    'encerrado_motivo', f.encerrado_motivo,
    'ultima_origem', f.ultima_origem,
    'atualizado_por_nome', f.atualizado_por_nome,
    'updated_at', f.updated_at,
    'historico', v_hist);
END;
$$;

-- Histórico: mudança de intervalo também é "frequencia"
CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_historico_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao text;
  v_antes jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_depois jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (v_antes - 'updated_at' - 'atualizado_por' - 'ultima_origem' - 'ultima_evolucao_id')
       = (v_depois - 'updated_at' - 'atualizado_por' - 'ultima_origem' - 'ultima_evolucao_id') THEN
      RETURN NULL;
    END IF;
  END IF;
  v_acao := CASE
    WHEN TG_OP = 'INSERT' THEN 'criado'
    WHEN NEW.ativo IS DISTINCT FROM OLD.ativo THEN CASE WHEN NEW.ativo THEN 'reativado' ELSE 'encerrado' END
    WHEN NEW.frequencia IS DISTINCT FROM OLD.frequencia
      OR NEW.intervalo_dias IS DISTINCT FROM OLD.intervalo_dias THEN 'frequencia'
    WHEN NEW.adiado_ate IS DISTINCT FROM OLD.adiado_ate THEN
      CASE WHEN NEW.adiado_ate IS NULL THEN 'adiamento_removido' ELSE 'adiado' END
    ELSE 'editado' END;
  INSERT INTO public.pacientes_fixos_historico
    (fixo_id, paciente_id, acao, antes, depois, origem, evolucao_id, feito_por)
  VALUES
    (NEW.id, NEW.paciente_id, v_acao, v_antes, v_depois, NEW.ultima_origem,
     NEW.ultima_evolucao_id, NEW.atualizado_por);
  RETURN NULL;
END;
$$;

-- Evolução não mexe na frequência de quem tem intervalo próprio
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_da_evolucao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conduta jsonb := NEW.evolucao_motora_assimetria->'conduta';
  v_manter boolean;
  v_freq text;
  v_paciente uuid;
  v_dh timestamptz;
  v_autor uuid := coalesce(NEW.atualizado_por, NEW.criado_por);
BEGIN
  IF NEW.tipo_evolucao IS DISTINCT FROM 'motora_assimetria' OR v_conduta IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_manter := (v_conduta->>'manter_fisioterapia')::boolean;
    v_freq := nullif(v_conduta->>'frequencia_sugerida', '');

    SELECT a.paciente_id, a.data_hora INTO v_paciente, v_dh
      FROM public.agendamentos a WHERE a.id = NEW.id_agendamento;
    IF v_paciente IS NULL THEN
      RETURN NULL;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.relatorio_evolucao r
        JOIN public.agendamentos a ON a.id = r.id_agendamento
       WHERE a.paciente_id = v_paciente
         AND r.tipo_evolucao = 'motora_assimetria'
         AND r.id <> NEW.id
         AND a.data_hora > v_dh) THEN
      RETURN NULL;
    END IF;

    IF v_manter IS FALSE THEN
      UPDATE public.pacientes_fixos
         SET ativo = false, encerrado_em = now(), encerrado_motivo = 'alta',
             adiado_ate = NULL, adiado_motivo = NULL,
             ultima_origem = 'evolucao', ultima_evolucao_id = NEW.id,
             atualizado_por = v_autor
       WHERE paciente_id = v_paciente AND ativo;
    ELSIF v_manter IS TRUE
          AND v_freq IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal') THEN
      INSERT INTO public.pacientes_fixos AS pf
        (paciente_id, frequencia, ativo, ultima_origem, ultima_evolucao_id, atualizado_por)
      VALUES (v_paciente, v_freq, true, 'evolucao', NEW.id, v_autor)
      ON CONFLICT (paciente_id) DO UPDATE SET
        frequencia = EXCLUDED.frequencia,
        intervalo_dias = NULL,
        ativo = true,
        encerrado_em = NULL,
        encerrado_motivo = NULL,
        ultima_origem = 'evolucao',
        ultima_evolucao_id = EXCLUDED.ultima_evolucao_id,
        atualizado_por = EXCLUDED.atualizado_por
      WHERE pf.frequencia <> 'personalizada'
        AND (pf.frequencia IS DISTINCT FROM EXCLUDED.frequencia OR NOT pf.ativo);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pacientes_fixos: sincronização com a evolução % falhou: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Semana: ciclo em dias (inclui "a cada N dias")
CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_semana(p_semana date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini date;
  v_fim date;
  v_ids uuid[];
  v_pacientes jsonb;
  v_altas jsonb;
  v_agendas jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  v_ini := date_trunc('week', coalesce(p_semana, v_hoje))::date;
  v_fim := v_ini + 6;

  SELECT array_agg(f.paciente_id) INTO v_ids
    FROM public.pacientes_fixos f JOIN public.pessoas p ON p.id = f.paciente_id
   WHERE f.ativo AND p.ativo;

  WITH sess AS (
    SELECT * FROM public.fn_paciente_fixo_sessoes(coalesce(v_ids, '{}'))
  ), base AS (
    SELECT f.*, r.sessoes,
           public.fn_paciente_fixo_ciclo_dias(f.frequencia, f.intervalo_dias) AS ciclo,
           ceil(public.fn_paciente_fixo_ciclo_dias(f.frequencia, f.intervalo_dias) / 7.0)::int AS semanas,
           pac.nome AS paciente_nome, pac.data_nascimento,
           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh < v_ini) AS ultima_antes,
           (SELECT s.profissional_id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS prof_recente,
           (SELECT s.id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS origem_id,
           public.fn_paciente_fixo_alternancia(f.paciente_id, v_ini::timestamp) AS alt
      FROM public.pacientes_fixos f
      JOIN public.pessoas pac ON pac.id = f.paciente_id
      CROSS JOIN LATERAL public.fn_paciente_fixo_ritmo(f.frequencia) r
     WHERE f.ativo AND pac.ativo
  ), devida AS (
    SELECT b.*,
           CASE WHEN b.ciclo <= 7 THEN v_ini
                WHEN b.ultima_antes IS NULL THEN v_ini
                ELSE date_trunc('week', b.ultima_antes + make_interval(days => b.ciclo))::date END AS semana_base,
           CASE
             WHEN coalesce(array_length(b.profissionais, 1), 0) > 0 THEN b.profissionais
             WHEN (b.alt->>'divide')::boolean THEN
               ARRAY(SELECT jsonb_array_elements_text(b.alt->'dividem')::uuid)
             WHEN b.prof_recente IS NOT NULL THEN ARRAY[b.prof_recente]
             ELSE '{}'::uuid[] END AS profs,
           CASE
             WHEN coalesce(array_length(b.profissionais, 1), 0) > 1 THEN 'cadastro'
             WHEN coalesce(array_length(b.profissionais, 1), 0) = 0 AND (b.alt->>'divide')::boolean THEN 'historico'
             ELSE NULL END AS divide_origem
      FROM base b
  ), vez AS (
    SELECT d.*,
           (SELECT x.id FROM unnest(d.profs) WITH ORDINALITY AS x(id, ord)
             ORDER BY (SELECT max(s.dh) FROM sess s
                        WHERE s.paciente_id = d.paciente_id AND s.profissional_id = x.id
                          AND s.dh < v_ini) NULLS FIRST, x.ord
             LIMIT 1) AS prof_vez
      FROM devida d
  ), calc AS (
    SELECT v.*,
           greatest(v.semana_base, coalesce(v.adiado_ate, v.semana_base)) AS semana_prevista,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'data_hora', to_char(s.dh, 'YYYY-MM-DD"T"HH24:MI'),
                      'status', s.status,
                      'profissional_nome', pr.nome) ORDER BY s.dh), '[]'::jsonb)
              FROM sess s LEFT JOIN public.pessoas pr ON pr.id = s.profissional_id
             WHERE s.paciente_id = v.paciente_id
               AND s.dh >= v_ini
               AND s.dh < v_ini + 7 * v.semanas) AS marcadas
      FROM vez v
  ), final AS (
    SELECT c.*,
           CASE WHEN c.semana_prevista > v_ini THEN 0
                ELSE greatest(c.sessoes - jsonb_array_length(c.marcadas), 0) END AS falta,
           CASE
             WHEN c.semana_prevista > v_ini AND c.adiado_ate IS NOT NULL AND c.adiado_ate > v_ini THEN 'adiado'
             WHEN c.semana_prevista > v_ini THEN 'fora_da_semana'
             WHEN jsonb_array_length(c.marcadas) >= c.sessoes THEN 'completo'
             ELSE 'falta' END AS situacao
      FROM calc c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', fi.paciente_id,
           'paciente_nome', fi.paciente_nome,
           'data_nascimento', fi.data_nascimento,
           'frequencia', fi.frequencia,
           'intervalo_dias', fi.intervalo_dias,
           'sessoes', fi.sessoes,
           'semanas', fi.semanas,
           'situacao', fi.situacao,
           'falta', fi.falta,
           'atrasado', fi.situacao = 'falta' AND fi.ciclo > 7 AND fi.semana_prevista < v_ini,
           'semana_prevista', fi.semana_prevista,
           'adiado_ate', fi.adiado_ate,
           'adiado_motivo', fi.adiado_motivo,
           'observacao', fi.observacao,
           'marcadas', fi.marcadas,
           'ultima_sessao', to_char(fi.ultima_antes, 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_id', fi.prof_vez,
           'profissional_nome', prof.nome,
           'profissionais', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) ORDER BY x.ord), '[]'::jsonb)
                               FROM unnest(fi.profs) WITH ORDINALITY AS x(id, ord)
                               JOIN public.pessoas p ON p.id = x.id),
           'divide', fi.divide_origem IS NOT NULL,
           'divide_origem', fi.divide_origem,
           'historico_profissionais', fi.alt->'profissionais',
           'origem_agendamento_id', fi.origem_id,
           'profissional_fixa', coalesce(array_length(fi.profissionais, 1), 0) > 0,
           'responsavel_nome', resp.nome,
           'responsavel_telefone', coalesce(resp.telefone, pac.telefone)::text,
           'envio', env.envio
         ) ORDER BY
           CASE fi.situacao WHEN 'falta' THEN 0 WHEN 'completo' THEN 1 WHEN 'adiado' THEN 2 ELSE 3 END,
           prof.nome NULLS LAST, fi.paciente_nome), '[]'::jsonb)
    INTO v_pacientes
    FROM final fi
    JOIN public.pessoas pac ON pac.id = fi.paciente_id
    LEFT JOIN public.pessoas prof ON prof.id = fi.prof_vez
    LEFT JOIN LATERAL (
      SELECT r.nome, r.telefone
        FROM public.pessoa_responsaveis pr
        JOIN public.pessoas r ON r.id = pr.id_responsavel
       WHERE pr.id_pessoa = fi.paciente_id
         AND pr.ativo IS NOT FALSE
         AND pr.tipo_responsabilidade IN ('legal', 'ambos')
         AND r.telefone IS NOT NULL
       ORDER BY CASE pr.tipo_responsabilidade WHEN 'legal' THEN 0 ELSE 1 END
       LIMIT 1) resp ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('enviado_em', e.enviado_em, 'enviado_por_nome', ep.nome,
                                'agenda_id', e.agenda_id, 'vezes', count(*) OVER ()) AS envio
        FROM public.pacientes_fixos_envios e
        LEFT JOIN public.pessoas ep ON ep.id = e.enviado_por
       WHERE e.paciente_id = fi.paciente_id AND e.semana = v_ini AND e.status = 'enviado'
       ORDER BY e.enviado_em DESC
       LIMIT 1) env ON true;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', f.paciente_id,
           'paciente_nome', p.nome,
           'encerrado_em', f.encerrado_em,
           'por_nome', au.nome) ORDER BY f.encerrado_em DESC), '[]'::jsonb)
    INTO v_altas
    FROM public.pacientes_fixos f
    JOIN public.pessoas p ON p.id = f.paciente_id
    LEFT JOIN public.pessoas au ON au.id = f.atualizado_por
   WHERE NOT f.ativo AND f.encerrado_motivo = 'alta'
     AND f.encerrado_em > now() - interval '14 days';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', ac.id,
           'token', ac.token,
           'titulo', ac.titulo,
           'profissional_id', ac.profissional_id,
           'profissional_nome', pr.nome,
           'data_inicio', ac.data_inicio,
           'data_fim', ac.data_fim,
           'slots', (SELECT count(*) FROM public.agenda_slots s WHERE s.agenda_id = ac.id AND s.deleted_at IS NULL),
           'livres', (SELECT count(*) FROM public.agenda_slots s
                       WHERE s.agenda_id = ac.id AND s.deleted_at IS NULL AND s.disponivel
                         AND s.data_hora AT TIME ZONE 'UTC' > now() AT TIME ZONE 'America/Sao_Paulo')
         ) ORDER BY pr.nome, ac.created_at DESC), '[]'::jsonb)
    INTO v_agendas
    FROM public.agendas_compartilhadas ac
    JOIN public.pessoas pr ON pr.id = ac.profissional_id
   WHERE ac.ativo
     AND ac.data_inicio <= v_fim
     AND ac.data_fim >= v_ini;

  RETURN jsonb_build_object(
    'ok', true,
    'semana', v_ini,
    'semana_fim', v_fim,
    'pacientes', v_pacientes,
    'altas_recentes', v_altas,
    'agendas', v_agendas);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_paciente_fixo_ciclo_dias(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_frequencia(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text, uuid[], integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_semana(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_historico_gravar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_da_evolucao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_paciente_fixo_ciclo_dias(text, integer),
  public.fn_paciente_fixo_frequencia(uuid, text, integer),
  public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text, uuid[], integer),
  public.fn_paciente_fixo_get(uuid),
  public.fn_pacientes_fixos_semana(date)
TO authenticated;
