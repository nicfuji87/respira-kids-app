-- Pacientes Fixos: atendimento dividido entre profissionais + sugestões em 90 dias
-- (02/11/2026, pedido do dono)
--
-- - Um fixo pode ser dividido (ex.: Bruna e Beatriz). O cadastro guarda a
--   lista em `profissionais`; sem lista, o histórico decide.
-- - Alternância pelo histórico: nas últimas 6 sessões motoras (120 dias),
--   2+ profissionais com 2+ sessões cada = "divide". Uma sessão só com outra
--   é substituição e não conta. Em 02/11/2026: 6 pacientes dividiam, 21 só
--   tiveram substituição.
-- - "Da vez" = entre as que dividem, a que atendeu há mais tempo.
-- - Sugestões: 3+ sessões motoras em 90 dias (antes 60), para pegar o mensal.

ALTER TABLE public.pacientes_fixos
  ADD COLUMN IF NOT EXISTS profissionais uuid[];

UPDATE public.pacientes_fixos
   SET profissionais = ARRAY[profissional_id]
 WHERE profissional_id IS NOT NULL AND profissionais IS NULL;

COMMENT ON COLUMN public.pacientes_fixos.profissionais IS
  'Profissionais que atendem o fixo (dividido quando 2+). Vazio = vale o histórico. profissional_id = a primeira, mantido por compatibilidade.';

-- =============================================================================
-- Alternância pelo histórico
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_alternancia(
  p_paciente_id uuid,
  p_ate timestamp DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ult AS (
    SELECT s.profissional_id, s.dh
      FROM public.fn_paciente_fixo_sessoes(ARRAY[p_paciente_id]) s
     WHERE s.dh < coalesce(p_ate, (now() AT TIME ZONE 'America/Sao_Paulo') + interval '60 days')
       AND s.dh > (now() AT TIME ZONE 'America/Sao_Paulo') - interval '120 days'
     ORDER BY s.dh DESC
     LIMIT 6
  ), por AS (
    SELECT u.profissional_id, count(*) AS sessoes, max(u.dh) AS ultima
      FROM ult u GROUP BY u.profissional_id
  ), dividem AS (
    SELECT * FROM por WHERE sessoes >= 2
  )
  SELECT jsonb_build_object(
    'profissionais', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.profissional_id, 'nome', pe.nome, 'sessoes', p.sessoes,
               'ultima', to_char(p.ultima, 'YYYY-MM-DD"T"HH24:MI'))
             ORDER BY p.sessoes DESC, p.ultima DESC)
        FROM por p LEFT JOIN public.pessoas pe ON pe.id = p.profissional_id), '[]'::jsonb),
    'total', (SELECT count(*) FROM ult),
    'divide', (SELECT count(*) FROM dividem) >= 2,
    'dividem', coalesce((SELECT jsonb_agg(d.profissional_id ORDER BY d.ultima) FROM dividem d), '[]'::jsonb),
    'da_vez', (SELECT d.profissional_id FROM dividem d ORDER BY d.ultima LIMIT 1)
  );
$$;

-- =============================================================================
-- Ficha: lista de profissionais + o que o histórico mostra
-- =============================================================================
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
    -- Sem cadastro: devolve só o histórico (a ficha mostra antes de tornar fixo)
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

-- =============================================================================
-- Salvar com lista de profissionais (p_profissionais vence p_profissional_id)
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_salvar(
  p_paciente_id uuid,
  p_frequencia text,
  p_profissional_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_origem text DEFAULT 'cadastro',
  p_profissionais uuid[] DEFAULT NULL
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
  IF p_frequencia NOT IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal') THEN
    RAISE EXCEPTION 'Frequência inválida: %', p_frequencia;
  END IF;

  -- Sem repetição, na ordem escolhida
  SELECT array_agg(x.id ORDER BY x.ord) INTO v_profs
    FROM (SELECT DISTINCT ON (id) id, ord
            FROM unnest(coalesce(p_profissionais,
                   CASE WHEN p_profissional_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_profissional_id] END))
                 WITH ORDINALITY AS u(id, ord)
           WHERE id IS NOT NULL
           ORDER BY id, ord) x;

  INSERT INTO public.pacientes_fixos AS pf
    (paciente_id, frequencia, profissional_id, profissionais, observacao, ativo, ultima_origem, atualizado_por)
  VALUES
    (p_paciente_id, p_frequencia, v_profs[1], v_profs, nullif(trim(p_observacao), ''), true,
     CASE WHEN p_origem IN ('cadastro', 'lista') THEN p_origem ELSE 'cadastro' END, v_eu)
  ON CONFLICT (paciente_id) DO UPDATE SET
    frequencia = EXCLUDED.frequencia,
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

-- =============================================================================
-- Semana: profissionais do paciente (cadastro > histórico) e a da vez
-- =============================================================================
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
    SELECT f.*, r.sessoes, r.semanas, pac.nome AS paciente_nome, pac.data_nascimento,
           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh < v_ini) AS ultima_antes,
           (SELECT s.profissional_id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS prof_recente,
           (SELECT s.id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS origem_id,
           -- histórico até o começo da semana: quem atendeu por último decide a vez
           public.fn_paciente_fixo_alternancia(f.paciente_id, v_ini::timestamp) AS alt
      FROM public.pacientes_fixos f
      JOIN public.pessoas pac ON pac.id = f.paciente_id
      CROSS JOIN LATERAL public.fn_paciente_fixo_ritmo(f.frequencia) r
     WHERE f.ativo AND pac.ativo
  ), devida AS (
    SELECT b.*,
           CASE WHEN b.semanas = 1 THEN v_ini
                WHEN b.ultima_antes IS NULL THEN v_ini
                ELSE date_trunc('week', b.ultima_antes)::date + 7 * b.semanas END AS semana_base,
           -- Lista final: cadastro > histórico (divide) > última sessão
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
           -- Da vez: entre os profissionais do paciente, o que atendeu há mais tempo
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
           'sessoes', fi.sessoes,
           'semanas', fi.semanas,
           'situacao', fi.situacao,
           'falta', fi.falta,
           'atrasado', fi.situacao = 'falta' AND fi.semanas > 1 AND fi.semana_prevista < v_ini,
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
       WHERE e.paciente_id = fi.paciente_id AND e.semana = v_ini
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

-- =============================================================================
-- Sugestões: 3+ sessões motoras em 90 dias (pega o mensal) + quem divide
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_sugestoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_res jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT array_agg(DISTINCT a.paciente_id) INTO v_ids
    FROM public.agendamentos a
    JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.ativo AND ts.nome ~* 'motor'
     AND a.data_hora > now() - interval '90 days';

  WITH s AS (
    SELECT * FROM public.fn_paciente_fixo_sessoes(coalesce(v_ids, '{}'))
     WHERE dh > (now() AT TIME ZONE 'America/Sao_Paulo') - interval '90 days'
  ), por AS (
    SELECT s.paciente_id,
           count(*) AS total,
           min(s.dh) AS primeira, max(s.dh) AS ultima,
           mode() WITHIN GROUP (ORDER BY s.profissional_id) AS prof
      FROM s GROUP BY s.paciente_id
  ), ult_ev AS (
    SELECT DISTINCT ON (a.paciente_id) a.paciente_id,
           r.evolucao_motora_assimetria->'conduta'->>'frequencia_sugerida' AS freq,
           (r.evolucao_motora_assimetria->'conduta'->>'manter_fisioterapia')::boolean AS manter
      FROM public.relatorio_evolucao r
      JOIN public.agendamentos a ON a.id = r.id_agendamento
     WHERE r.tipo_evolucao = 'motora_assimetria'
       AND a.paciente_id = ANY (coalesce(v_ids, '{}'))
     ORDER BY a.paciente_id, a.data_hora DESC
  ), cand AS (
    SELECT por.*,
           por.total / greatest((extract(epoch FROM por.ultima - por.primeira) / 604800.0) + 1, 1) AS por_semana,
           ue.freq AS freq_evolucao, ue.manter,
           public.fn_paciente_fixo_alternancia(por.paciente_id) AS alt
      FROM por
      LEFT JOIN ult_ev ue ON ue.paciente_id = por.paciente_id
     WHERE por.total >= 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', c.paciente_id,
           'paciente_nome', p.nome,
           'sessoes_90d', c.total,
           'ultima_sessao', to_char(c.ultima, 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_id', c.prof,
           'profissional_nome', pr.nome,
           'divide', (c.alt->>'divide')::boolean,
           'dividem', c.alt->'dividem',
           'historico_profissionais', c.alt->'profissionais',
           'frequencia_evolucao', c.freq_evolucao,
           'frequencia_sugerida', coalesce(
              CASE WHEN c.freq_evolucao IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal')
                   THEN c.freq_evolucao END,
              CASE WHEN c.por_semana >= 1.6 THEN '2x_semana'
                   WHEN c.por_semana >= 0.75 THEN 'semanal'
                   WHEN c.por_semana >= 0.4 THEN 'quinzenal'
                   ELSE 'mensal' END)
         ) ORDER BY c.total DESC, p.nome), '[]'::jsonb)
    INTO v_res
    FROM cand c
    JOIN public.pessoas p ON p.id = c.paciente_id AND p.ativo
    LEFT JOIN public.pessoas pr ON pr.id = c.prof
   WHERE c.manter IS NOT FALSE
     AND NOT EXISTS (
       SELECT 1 FROM public.pacientes_fixos f
        WHERE f.paciente_id = c.paciente_id
          AND (f.ativo OR f.encerrado_em > now() - interval '30 days'));

  RETURN v_res;
END;
$$;

-- Permissões (default privileges dão EXECUTE ao anon)
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_alternancia(uuid, timestamp) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_semana(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_sugestoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_paciente_fixo_get(uuid),
  public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text, uuid[]),
  public.fn_pacientes_fixos_semana(date),
  public.fn_pacientes_fixos_sugestoes()
TO authenticated;
