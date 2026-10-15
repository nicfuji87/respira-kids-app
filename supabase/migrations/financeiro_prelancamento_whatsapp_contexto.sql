-- Mini-histórico do grupo de gastos: a foto chega sem legenda e a explicação vem depois
-- (texto ou áudio). Os pré-lançamentos guardam quem mandou (dados_ia.whatsapp.sender) e o
-- complemento que chega em seguida é aplicado neles em vez de virar gasto novo.

-- A nota (arquivo) passa a gravar quem mandou, para o complemento achar.
DROP FUNCTION IF EXISTS public.fn_financeiro_enriquecer_prelancamento(uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_financeiro_enriquecer_prelancamento(
  p_lancamento_id uuid,
  p_dica text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_whatsapp jsonb DEFAULT NULL
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

  UPDATE public.lancamentos_financeiros
  SET observacoes = CASE WHEN nullif(trim(coalesce(p_observacoes, '')), '') IS NOT NULL
                         THEN concat_ws(' ', p_observacoes, observacoes) ELSE observacoes END,
      dados_ia = CASE WHEN p_whatsapp IS NOT NULL
                      THEN coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('whatsapp', p_whatsapp)
                      ELSE dados_ia END
  WHERE id = l.id;

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

-- Pré-lançamentos que a mesma pessoa mandou no grupo nos últimos minutos (contexto para a IA
-- decidir se a mensagem nova explica essas notas ou é um gasto novo).
CREATE OR REPLACE FUNCTION public.fn_financeiro_prelancamentos_recentes(
  p_sender text,
  p_minutos integer DEFAULT 20
)
RETURNS TABLE(
  lancamento_id uuid, descricao text, valor numeric, fornecedor_nome text,
  categoria_nome text, pagador_informado boolean, minutos integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT l.id, l.descricao, l.valor_total,
         coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
         c.nome,
         coalesce(l.observacoes, '') NOT LIKE '%Pago por: não informado.%',
         floor(extract(epoch FROM now() - l.created_at) / 60)::int
  FROM public.lancamentos_financeiros l
  JOIN public.categorias_contabeis c ON c.id = l.categoria_contabil_id
  LEFT JOIN public.fornecedores f ON f.id = l.fornecedor_id
  WHERE nullif(p_sender, '') IS NOT NULL
    AND l.status_lancamento = 'pre_lancamento'
    AND l.origem_lancamento = 'api_ia'
    AND l.created_at >= now() - make_interval(mins => greatest(p_minutos, 1))
    AND l.dados_ia #>> '{whatsapp,sender}' = p_sender
  ORDER BY l.created_at DESC
  LIMIT 5;
$$;

-- Aplica a explicação que chegou depois nas notas recentes da mesma pessoa:
-- quem pagou, o que é (vai na frente da descrição) e reclassifica se o texto for claro.
CREATE OR REPLACE FUNCTION public.fn_financeiro_complementar_prelancamento(
  p_sender text,
  p_texto text,
  p_pagador text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_remetente text DEFAULT NULL,
  p_minutos integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r          record;
  c          record;
  v_a_class  uuid;
  v_nova_cat uuid;
  v_obs      text;
  v_desc     text;
  v_pag      text := nullif(trim(coalesce(p_pagador, '')), '');
  v_descr    text := nullif(trim(coalesce(p_descricao, '')), '');
  v_res      jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_a_class FROM public.categorias_contabeis WHERE codigo = '9.99';

  -- o que o texto diz vale para todas as notas pendentes dele
  SELECT * INTO c
  FROM public.fn_financeiro_classificar_por_historico(coalesce(v_descr, p_texto)) LIMIT 1;

  FOR r IN
    SELECT l.*
    FROM public.lancamentos_financeiros l
    WHERE nullif(p_sender, '') IS NOT NULL
      AND l.status_lancamento = 'pre_lancamento'
      AND l.origem_lancamento = 'api_ia'
      AND l.created_at >= now() - make_interval(mins => greatest(p_minutos, 1))
      AND l.dados_ia #>> '{whatsapp,sender}' = p_sender
    ORDER BY l.created_at
  LOOP
    v_obs := coalesce(r.observacoes, '');
    IF v_pag IS NOT NULL THEN
      v_obs := CASE WHEN v_obs LIKE '%Pago por: não informado.%'
                    THEN replace(v_obs, 'Pago por: não informado.', 'Pago por: ' || v_pag || ' (informado depois).')
                    ELSE concat_ws(' ', v_obs, 'Pago por: ' || v_pag || ' (informado depois).') END;
    END IF;
    v_obs := concat_ws(' ', nullif(v_obs, ''),
      '[WhatsApp] Complemento de ' || coalesce(nullif(p_remetente, ''), '?') || ': "' || p_texto || '".');

    v_desc := r.descricao;
    IF v_descr IS NOT NULL AND position(lower(v_descr) IN lower(r.descricao)) = 0 THEN
      v_desc := v_descr || ' - ' || r.descricao;
    END IF;

    -- texto claro troca a categoria; texto fraco só preenche o que estava "A classificar"
    v_nova_cat := r.categoria_contabil_id;
    IF c.categoria_id IS NOT NULL
       AND (c.confianca >= 0.4 OR (r.categoria_contabil_id = v_a_class AND c.confianca >= 0.2)) THEN
      v_nova_cat := c.categoria_id;
    END IF;

    UPDATE public.lancamentos_financeiros
    SET observacoes = v_obs,
        descricao = v_desc,
        categoria_contabil_id = v_nova_cat,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('complemento_whatsapp',
          coalesce(dados_ia -> 'complemento_whatsapp', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('texto', p_texto, 'pagador', v_pag, 'descricao', v_descr, 'remetente', p_remetente)))
    WHERE id = r.id;

    IF v_nova_cat IS DISTINCT FROM r.categoria_contabil_id THEN
      UPDATE public.lancamento_itens SET categoria_contabil_id = v_nova_cat
      WHERE lancamento_id = r.id AND categoria_contabil_id = r.categoria_contabil_id;
    END IF;

    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'lancamento_id', r.id,
      'descricao', v_desc,
      'valor', r.valor_total,
      'categoria_nome', (SELECT nome FROM public.categorias_contabeis WHERE id = v_nova_cat),
      'categoria_mudou', v_nova_cat IS DISTINCT FROM r.categoria_contabil_id,
      'pagador', v_pag));
  END LOOP;

  RETURN jsonb_build_object('ok', jsonb_array_length(v_res) > 0, 'atualizados', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_financeiro_enriquecer_prelancamento(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_financeiro_prelancamentos_recentes(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_financeiro_complementar_prelancamento(text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_enriquecer_prelancamento(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_prelancamentos_recentes(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_complementar_prelancamento(text, text, text, text, text, integer) TO service_role;
