-- Pré-lançamento vindo do WhatsApp (grupo de gastos): classificação pelo histórico,
-- checagem de duplicidade por valor/data/beneficiário e criação a partir de texto ou áudio.
-- Chamado só pelo n8n (service_role). Nunca cria lançamento validado.

-- Classifica um texto livre pelos lançamentos já validados mais parecidos (descrição e itens).
-- Cada vizinho vota na sua categoria com o peso da similaridade; o fornecedor, quando conhecido, pesa mais.
CREATE OR REPLACE FUNCTION public.fn_financeiro_classificar_por_historico(
  p_texto text,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  categoria_id uuid, categoria_codigo text, categoria_nome text,
  confianca numeric, votos integer, exemplo text, fornecedor_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH alvo AS (
    SELECT public.fn_normalizar_nome_empresa(p_texto) AS t
  ), base AS (
    SELECT l.categoria_contabil_id AS cat, l.fornecedor_id AS forn, l.descricao AS texto, l.data_competencia
    FROM public.lancamentos_financeiros l
    WHERE l.status_lancamento = 'validado' AND l.tipo_lancamento = 'despesa'
    UNION ALL
    SELECT coalesce(i.categoria_contabil_id, l.categoria_contabil_id), l.fornecedor_id, i.descricao, l.data_competencia
    FROM public.lancamento_itens i
    JOIN public.lancamentos_financeiros l ON l.id = i.lancamento_id
    WHERE l.status_lancamento = 'validado' AND l.tipo_lancamento = 'despesa'
  ), viz AS (
    SELECT b.cat, b.forn, b.texto,
           greatest(
             similarity(a.t, n.d),
             word_similarity(a.t, n.d),
             word_similarity(n.d, a.t)
           ) * CASE WHEN p_fornecedor_id IS NOT NULL AND b.forn = p_fornecedor_id THEN 1.5 ELSE 1 END AS peso
    FROM base b
    CROSS JOIN alvo a
    CROSS JOIN LATERAL (SELECT public.fn_normalizar_nome_empresa(b.texto) AS d) n
    WHERE length(a.t) >= 3 AND length(n.d) >= 3
    ORDER BY 4 DESC, b.data_competencia DESC
    LIMIT 15
  ), forte AS (
    SELECT * FROM viz WHERE peso >= 0.3
  ), total AS (
    SELECT sum(peso) AS s FROM forte
  ), por_cat AS (
    SELECT f.cat,
           sum(f.peso) AS s,
           max(f.peso) AS melhor,
           count(*)::int AS n,
           (array_agg(f.texto ORDER BY f.peso DESC))[1] AS exemplo,
           mode() WITHIN GROUP (ORDER BY f.forn) FILTER (WHERE f.peso >= 0.6) AS forn
    FROM forte f
    GROUP BY f.cat
  )
  SELECT c.id, c.codigo, c.nome,
         round(least(1, (p.s / t.s) * least(p.melhor, 1))::numeric, 2),
         p.n, p.exemplo, p.forn
  FROM por_cat p
  CROSS JOIN total t
  JOIN public.categorias_contabeis c ON c.id = p.cat
  ORDER BY 4 DESC
  LIMIT 3;
$$;

-- Lançamentos que podem ser o mesmo gasto: mesmo valor e data a até 7 dias.
-- "exato" segue a regra do dono: mesma data + mesmo valor + mesmo beneficiário = duplicado.
CREATE OR REPLACE FUNCTION public.fn_financeiro_possiveis_duplicados(
  p_valor numeric,
  p_data date,
  p_fornecedor_id uuid DEFAULT NULL,
  p_texto text DEFAULT NULL,
  p_excluir uuid DEFAULT NULL
)
RETURNS TABLE(
  lancamento_id uuid, descricao text, data_ref date, valor numeric,
  status text, origem text, dias integer, mesmo_beneficiario boolean, exato boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH cand AS (
    SELECT l.id, l.descricao, l.valor_total, l.status_lancamento, l.origem_lancamento,
           l.fornecedor_id,
           coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social) AS forn_nome,
           (SELECT min(abs(d - coalesce(p_data, CURRENT_DATE)))
              FROM unnest(ARRAY[l.data_emissao, l.data_vencimento]
                          || coalesce(array_agg(cp.data_pagamento) FILTER (WHERE cp.data_pagamento IS NOT NULL), '{}')
                          || coalesce(array_agg(cp.data_vencimento), '{}')) AS d
             WHERE d IS NOT NULL) AS dias,
           l.data_emissao
    FROM public.lancamentos_financeiros l
    LEFT JOIN public.fornecedores f ON f.id = l.fornecedor_id
    LEFT JOIN public.contas_pagar cp ON cp.lancamento_id = l.id
    WHERE l.tipo_lancamento = 'despesa'
      AND l.status_lancamento <> 'cancelado'
      AND l.id IS DISTINCT FROM p_excluir
      AND coalesce(p_valor, 0) > 0
      AND (abs(l.valor_total - p_valor) < 0.01
           OR abs(coalesce(cp.valor_parcela, -1) - p_valor) < 0.01
           OR abs(coalesce(cp.valor_pago, -1) - p_valor) < 0.01)
    GROUP BY l.id, f.id
  ), marcado AS (
    SELECT c.*,
           (p_fornecedor_id IS NOT NULL AND c.fornecedor_id = p_fornecedor_id)
           OR (length(n.t) >= 3 AND greatest(
                 similarity(n.t, n.d), word_similarity(n.t, n.d), word_similarity(n.d, n.t),
                 word_similarity(n.f, n.t)
               ) >= 0.5) AS mesmo_benef
    FROM cand c
    CROSS JOIN LATERAL (
      SELECT public.fn_normalizar_nome_empresa(p_texto) AS t,
             public.fn_normalizar_nome_empresa(c.descricao) AS d,
             coalesce(nullif(public.fn_normalizar_nome_empresa(c.forn_nome), ''), '~') AS f
    ) n
    WHERE c.dias IS NOT NULL AND c.dias <= 7
  )
  SELECT id, descricao, data_emissao, valor_total, status_lancamento, origem_lancamento,
         dias, mesmo_benef, (dias = 0 AND mesmo_benef)
  FROM marcado
  ORDER BY (dias = 0 AND mesmo_benef) DESC, mesmo_benef DESC, dias
  LIMIT 5;
$$;

-- Depois que a nota (arquivo) virou pré-lançamento: confere duplicidade e, se a categoria
-- ficou "A classificar", classifica pelo histórico usando descrição, itens e a legenda.
CREATE OR REPLACE FUNCTION public.fn_financeiro_enriquecer_prelancamento(
  p_lancamento_id uuid,
  p_dica text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l            record;
  v_a_class    uuid;
  v_texto      text;
  v_dup        record;
  v_dups       jsonb;
  c            record;
  v_exemplo    text;
  v_origem_cat text;
BEGIN
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  IF NOT FOUND OR l.status_lancamento <> 'pre_lancamento' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Pré-lançamento não encontrado');
  END IF;

  IF nullif(trim(coalesce(p_observacoes, '')), '') IS NOT NULL THEN
    UPDATE public.lancamentos_financeiros
    SET observacoes = concat_ws(' ', p_observacoes, observacoes)
    WHERE id = l.id;
  END IF;

  SELECT id INTO v_a_class FROM public.categorias_contabeis WHERE codigo = '9.99';

  v_texto := concat_ws(' ',
    l.descricao,
    (SELECT string_agg(i.descricao, ' ') FROM public.lancamento_itens i WHERE i.lancamento_id = l.id),
    p_dica);

  -- duplicado exato (mesma data, valor e beneficiário): cancela o novo, mantém o antigo
  SELECT * INTO v_dup
  FROM public.fn_financeiro_possiveis_duplicados(l.valor_total, l.data_emissao, l.fornecedor_id, l.descricao, l.id) d
  WHERE d.exato
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.lancamentos_financeiros
    SET status_lancamento = 'cancelado',
        observacoes = concat_ws(' ', observacoes, '[WhatsApp] Cancelado automaticamente: duplicado de "' || v_dup.descricao || '".')
    WHERE id = l.id;
    UPDATE public.documentos_fiscais
    SET status = 'duplicado', duplicado_de_id = NULL, lancamento_id = v_dup.lancamento_id
    WHERE lancamento_id = l.id;
    RETURN jsonb_build_object('ok', false, 'duplicado', true, 'lancamento_id', v_dup.lancamento_id,
      'duplicado_descricao', v_dup.descricao, 'duplicado_data', v_dup.data_ref);
  END IF;

  v_origem_cat := CASE WHEN l.categoria_contabil_id = v_a_class THEN 'a_classificar' ELSE 'fornecedor' END;

  IF l.categoria_contabil_id = v_a_class THEN
    SELECT * INTO c FROM public.fn_financeiro_classificar_por_historico(v_texto, l.fornecedor_id) LIMIT 1;
    IF FOUND AND c.confianca >= 0.2 THEN
      UPDATE public.lancamentos_financeiros SET categoria_contabil_id = c.categoria_id WHERE id = l.id;
      UPDATE public.lancamento_itens SET categoria_contabil_id = c.categoria_id
      WHERE lancamento_id = l.id AND categoria_contabil_id = v_a_class;
      v_origem_cat := 'historico';
      v_exemplo := c.exemplo;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_dups
  FROM public.fn_financeiro_possiveis_duplicados(l.valor_total, l.data_emissao, l.fornecedor_id, l.descricao, l.id) d;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'lancamento_id', l.id,
      'valor', l.valor_total,
      'categoria_codigo', cc.codigo,
      'categoria_nome', cc.nome,
      'categoria_origem', v_origem_cat,
      'categoria_exemplo', v_exemplo,
      'fornecedor_nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
      'possiveis_duplicados', v_dups)
    FROM public.lancamentos_financeiros x
    JOIN public.categorias_contabeis cc ON cc.id = x.categoria_contabil_id
    LEFT JOIN public.fornecedores f ON f.id = x.fornecedor_id
    WHERE x.id = l.id
  );
END;
$$;

-- Gasto informado por texto ou áudio (já transcrito e extraído pelo n8n).
-- p_dados: {descricao, valor, data, competencia?, fornecedor?, cnpj?, itens?[{descricao,quantidade,valor_total}],
--           origem: 'whatsapp_texto'|'whatsapp_audio', texto_original, remetente, observacoes}
CREATE OR REPLACE FUNCTION public.fn_financeiro_prelancamento_mensagem(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_desc        text := nullif(trim(coalesce(p_dados ->> 'descricao', '')), '');
  v_valor       numeric := nullif(p_dados ->> 'valor', '')::numeric;
  v_data        date := coalesce(nullif(p_dados ->> 'data', '')::date, CURRENT_DATE);
  v_comp        date;
  v_forn_nome   text := nullif(trim(coalesce(p_dados ->> 'fornecedor', '')), '');
  v_forn        uuid;
  v_forn_score  numeric;
  v_texto       text;
  v_a_class     uuid;
  v_categoria   uuid;
  v_origem_cat  text := 'a_classificar';
  c             record;
  v_dup         record;
  v_dups        jsonb;
  v_centro      uuid;
  v_lanc_id     uuid;
  it            jsonb;
  i             integer := 0;
BEGIN
  IF v_desc IS NULL OR coalesce(v_valor, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Faltou descrição ou valor');
  END IF;

  v_comp := date_trunc('month', coalesce(nullif(p_dados ->> 'competencia', '')::date, v_data))::date;
  v_texto := concat_ws(' ', v_desc, v_forn_nome,
    (SELECT string_agg(x ->> 'descricao', ' ') FROM jsonb_array_elements(coalesce(p_dados -> 'itens', '[]'::jsonb)) x));

  SELECT s.fornecedor_id, s.score INTO v_forn, v_forn_score
  FROM public.fn_financeiro_sugerir_fornecedor(p_dados ->> 'cnpj', v_forn_nome) s
  ORDER BY s.score DESC LIMIT 1;
  IF v_forn_score IS NULL OR v_forn_score < 0.6 THEN
    v_forn := NULL;
  END IF;

  SELECT * INTO v_dup
  FROM public.fn_financeiro_possiveis_duplicados(v_valor, v_data, v_forn, v_texto) d
  WHERE d.exato
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'duplicado', true, 'lancamento_id', v_dup.lancamento_id,
      'duplicado_descricao', v_dup.descricao, 'duplicado_data', v_dup.data_ref);
  END IF;

  SELECT id INTO v_a_class FROM public.categorias_contabeis WHERE codigo = '9.99';

  -- fornecedor conhecido manda (moda do histórico dele), como na nota; senão, gastos parecidos
  SELECT * INTO c FROM public.fn_financeiro_classificar_por_historico(v_texto, v_forn) LIMIT 1;
  IF v_forn IS NOT NULL AND public.fn_financeiro_categoria_sugerida(v_forn) IS NOT NULL THEN
    v_categoria := public.fn_financeiro_categoria_sugerida(v_forn); v_origem_cat := 'fornecedor';
  ELSIF c.confianca >= 0.2 THEN
    v_categoria := c.categoria_id; v_origem_cat := 'historico';
  ELSE
    v_categoria := v_a_class;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_dups
  FROM public.fn_financeiro_possiveis_duplicados(v_valor, v_data, v_forn, v_texto) d;

  SELECT id INTO v_centro FROM public.centros_financeiros WHERE tipo = 'comum' AND ativo LIMIT 1;

  INSERT INTO public.lancamentos_financeiros (
    tipo_lancamento, data_emissao, data_competencia, data_vencimento,
    fornecedor_id, categoria_contabil_id, descricao, observacoes,
    valor_total, quantidade_parcelas, eh_divisao_socios,
    status_lancamento, origem_lancamento, dados_ia,
    centro_financeiro_id, natureza_custo, pago
  ) VALUES (
    'despesa', v_data, v_comp, v_data,
    v_forn, v_categoria, v_desc, nullif(p_dados ->> 'observacoes', ''),
    v_valor, 1, true,
    'pre_lancamento', 'api_ia',
    p_dados || jsonb_build_object('classificacao', v_origem_cat, 'possiveis_duplicados', v_dups),
    v_centro, 'compartilhado', false
  ) RETURNING id INTO v_lanc_id;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_dados -> 'itens', '[]'::jsonb))
  LOOP
    i := i + 1;
    INSERT INTO public.lancamento_itens (
      lancamento_id, item_numero, descricao, quantidade, valor_unitario, valor_total, categoria_contabil_id
    ) VALUES (
      v_lanc_id, i,
      coalesce(nullif(it ->> 'descricao', ''), 'Item ' || i),
      coalesce(nullif(it ->> 'quantidade', '')::numeric, 1),
      coalesce(nullif(it ->> 'valor_total', '')::numeric, 0) / greatest(coalesce(nullif(it ->> 'quantidade', '')::numeric, 1), 1),
      coalesce(nullif(it ->> 'valor_total', '')::numeric, 0),
      v_categoria
    );
  END LOOP;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'lancamento_id', v_lanc_id,
      'valor', v_valor,
      'categoria_codigo', cc.codigo,
      'categoria_nome', cc.nome,
      'categoria_origem', v_origem_cat,
      'categoria_exemplo', CASE WHEN v_origem_cat = 'historico' THEN c.exemplo END,
      'fornecedor_nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
      'possiveis_duplicados', v_dups)
    FROM public.categorias_contabeis cc
    LEFT JOIN public.fornecedores f ON f.id = v_forn
    WHERE cc.id = v_categoria
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_financeiro_classificar_por_historico(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_financeiro_possiveis_duplicados(numeric, date, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_financeiro_enriquecer_prelancamento(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_financeiro_prelancamento_mensagem(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_classificar_por_historico(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_possiveis_duplicados(numeric, date, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_enriquecer_prelancamento(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_prelancamento_mensagem(jsonb) TO service_role;
