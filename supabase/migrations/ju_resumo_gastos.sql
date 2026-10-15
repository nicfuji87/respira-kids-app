-- @ju: "quanto gastamos com a Bio Bella?", "quanto foi de custos fixos em setembro?",
-- "total de gastos do mês". Pedido do dono em 15/10/2026.
-- Mesma régua da conciliação: competência do mês, só lançamento validado, despesa da
-- Clínica = natureza compartilhada (individual = custo só da BC, mostrado à parte) e
-- pré-lançamento ainda não validado aparece separado ("a validar").

CREATE OR REPLACE FUNCTION public.fn_ju_resumo_gastos(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL,
  p_fornecedor text DEFAULT NULL,
  p_filtro text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini    date;
  v_fim    date;
  v_forn   record;
  v_filtro record;
  v_res    jsonb;
BEGIN
  -- período em meses de competência; fornecedor sem período olha 12 meses
  v_ini := date_trunc('month', coalesce(p_inicio,
             CASE WHEN nullif(trim(coalesce(p_fornecedor, '')), '') IS NOT NULL
                  THEN (v_hoje - interval '11 months')::date ELSE v_hoje END))::date;
  v_fim := date_trunc('month', coalesce(p_fim, p_inicio, v_hoje))::date;
  IF v_fim < v_ini THEN v_fim := v_ini; END IF;

  -- ---------------- por fornecedor ----------------
  IF nullif(trim(coalesce(p_fornecedor, '')), '') IS NOT NULL THEN
    SELECT s.* INTO v_forn FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC LIMIT 1;
    IF v_forn.fornecedor_id IS NULL OR v_forn.score < 0.5 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || p_fornecedor || '" no cadastro');
    END IF;

    WITH l AS (
      SELECT lf.* FROM public.lancamentos_financeiros lf
      WHERE lf.fornecedor_id = v_forn.fornecedor_id AND lf.tipo_lancamento = 'despesa'
        AND lf.status_lancamento <> 'cancelado'
        AND lf.data_competencia BETWEEN v_ini AND v_fim
    )
    SELECT jsonb_build_object(
      'ok', true, 'modo', 'fornecedor', 'fornecedor', v_forn.nome, 'inicio', v_ini, 'fim', v_fim,
      'total', coalesce((SELECT sum(valor_total) FROM l WHERE status_lancamento = 'validado'), 0),
      'qtd', (SELECT count(*) FROM l WHERE status_lancamento = 'validado'),
      'a_validar', coalesce((SELECT sum(valor_total) FROM l WHERE status_lancamento = 'pre_lancamento'), 0),
      'em_aberto', coalesce((SELECT sum(valor_total) FROM l WHERE NOT pago AND status_lancamento <> 'cancelado'), 0),
      'ultima', (SELECT jsonb_build_object('data', data_emissao, 'valor', valor_total, 'descricao', descricao)
                 FROM l ORDER BY data_emissao DESC LIMIT 1),
      'por_mes', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', m.mes, 'total', m.total) ORDER BY m.mes)
                           FROM (SELECT data_competencia AS mes, sum(valor_total) AS total
                                 FROM l WHERE status_lancamento = 'validado' GROUP BY 1) m), '[]'::jsonb))
    INTO v_res;
    RETURN v_res;
  END IF;

  -- ---------------- por grupo ou categoria ----------------
  IF nullif(trim(coalesce(p_filtro, '')), '') IS NOT NULL THEN
    SELECT c.id, c.nome, c.nivel,
           CASE WHEN lower(unaccent(c.nome)) = lower(unaccent(trim(p_filtro))) OR lower(c.codigo) = lower(trim(p_filtro)) THEN 1
                ELSE greatest(similarity(lower(unaccent(c.nome)), lower(unaccent(p_filtro))),
                              word_similarity(lower(unaccent(p_filtro)), lower(unaccent(c.nome)))) END AS score
    INTO v_filtro
    FROM public.categorias_contabeis c
    WHERE c.ativo AND c.codigo NOT IN ('9.99', 'RECEITA')
    ORDER BY 4 DESC, c.nivel LIMIT 1;
    IF v_filtro.id IS NULL OR v_filtro.score < 0.45 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não achei grupo ou categoria "' || p_filtro || '"');
    END IF;

    WITH l AS (
      SELECT lf.*, coalesce(nullif(fo.nome_fantasia, ''), fo.nome_razao_social) AS forn
      FROM public.lancamentos_financeiros lf
      JOIN public.categorias_contabeis c ON c.id = lf.categoria_contabil_id
      LEFT JOIN public.fornecedores fo ON fo.id = lf.fornecedor_id
      WHERE lf.tipo_lancamento = 'despesa' AND lf.status_lancamento = 'validado'
        AND lf.data_competencia BETWEEN v_ini AND v_fim
        AND (c.id = v_filtro.id OR c.categoria_pai_id = v_filtro.id)
    )
    SELECT jsonb_build_object(
      'ok', true, 'modo', 'filtro', 'filtro', v_filtro.nome, 'eh_grupo', v_filtro.nivel = 1,
      'inicio', v_ini, 'fim', v_fim,
      'total_clinica', coalesce((SELECT sum(valor_total) FROM l WHERE coalesce(natureza_custo, 'compartilhado') <> 'individual'), 0),
      'total_bc', coalesce((SELECT sum(valor_total) FROM l WHERE natureza_custo = 'individual'), 0),
      'por_mes', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', m.mes, 'total', m.total) ORDER BY m.mes)
                           FROM (SELECT data_competencia AS mes, sum(valor_total) AS total FROM l
                                 WHERE coalesce(natureza_custo, 'compartilhado') <> 'individual' GROUP BY 1) m), '[]'::jsonb),
      'maiores', coalesce((SELECT jsonb_agg(jsonb_build_object('descricao', x.descricao, 'valor', x.valor_total, 'mes', x.data_competencia))
                           FROM (SELECT descricao, valor_total, data_competencia FROM l
                                 WHERE coalesce(natureza_custo, 'compartilhado') <> 'individual'
                                 ORDER BY valor_total DESC LIMIT 6) x), '[]'::jsonb))
    INTO v_res;
    RETURN v_res;
  END IF;

  -- ---------------- visão geral do período ----------------
  WITH l AS (
    SELECT lf.*, coalesce(g.nome, c.nome) AS grupo,
           coalesce(nullif(fo.nome_fantasia, ''), fo.nome_razao_social) AS forn,
           coalesce(lf.natureza_custo, 'compartilhado') <> 'individual' AS clinica
    FROM public.lancamentos_financeiros lf
    JOIN public.categorias_contabeis c ON c.id = lf.categoria_contabil_id
    LEFT JOIN public.categorias_contabeis g ON g.id = c.categoria_pai_id
    LEFT JOIN public.fornecedores fo ON fo.id = lf.fornecedor_id
    WHERE lf.tipo_lancamento = 'despesa' AND lf.status_lancamento <> 'cancelado'
      AND lf.data_competencia BETWEEN v_ini AND v_fim
  ), val AS (SELECT * FROM l WHERE status_lancamento = 'validado'),
  ant AS (
    SELECT sum(lf.valor_total) AS total
    FROM public.lancamentos_financeiros lf
    WHERE lf.tipo_lancamento = 'despesa' AND lf.status_lancamento = 'validado'
      AND coalesce(lf.natureza_custo, 'compartilhado') <> 'individual'
      -- mesmo número de meses, imediatamente antes
      AND lf.data_competencia BETWEEN (v_ini - make_interval(months =>
                                         (extract(year FROM age(v_fim, v_ini)) * 12 + extract(month FROM age(v_fim, v_ini)))::int + 1))::date
                                  AND (v_ini - interval '1 month')::date
  )
  SELECT jsonb_build_object(
    'ok', true, 'modo', 'geral', 'inicio', v_ini, 'fim', v_fim,
    'total_clinica', coalesce((SELECT sum(valor_total) FROM val WHERE clinica), 0),
    'total_bc', coalesce((SELECT sum(valor_total) FROM val WHERE NOT clinica), 0),
    'periodo_anterior', (SELECT total FROM ant),
    'a_validar', coalesce((SELECT sum(valor_total) FROM l WHERE status_lancamento = 'pre_lancamento' AND origem_lancamento = 'api_ia'), 0),
    'por_grupo', coalesce((SELECT jsonb_agg(jsonb_build_object('grupo', x.grupo, 'total', x.total) ORDER BY x.total DESC)
                           FROM (SELECT grupo, sum(valor_total) AS total FROM val WHERE clinica GROUP BY 1) x), '[]'::jsonb),
    'fornecedores', coalesce((SELECT jsonb_agg(jsonb_build_object('fornecedor', x.forn, 'total', x.total) ORDER BY x.total DESC)
                              FROM (SELECT forn, sum(valor_total) AS total FROM val
                                    WHERE clinica AND forn IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5) x), '[]'::jsonb))
  INTO v_res;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_resumo_gastos(date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_resumo_gastos(date, date, text, text) TO service_role;
