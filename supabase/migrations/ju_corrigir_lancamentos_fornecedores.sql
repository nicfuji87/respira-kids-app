-- @ju: corrigir lançamento, corrigir cadastro de fornecedor e dizer o que lançou.
-- Pedido do dono em 15/10/2026. A IA só entende o pedido; aqui o banco acha o registro,
-- confere o que pode mudar e deixa anotado quem pediu e o "de → para".

-- Categoria pedida pelo nome (só as de nível 2, que são as usadas nos lançamentos).
CREATE OR REPLACE FUNCTION public.fn_ju_resolver_categoria(p_texto text)
RETURNS TABLE(categoria_id uuid, nome text, codigo text, score numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH alvo AS (SELECT lower(unaccent(trim(coalesce(p_texto, '')))) AS t)
  SELECT c.id, c.nome, c.codigo,
         round(CASE WHEN lower(unaccent(c.nome)) = a.t OR lower(c.codigo) = a.t THEN 1
                    -- só nome/código idêntico vale 1: "limpeza" cabe em duas categorias e precisa perguntar
                    ELSE least(0.99, greatest(similarity(lower(unaccent(c.nome)), a.t), word_similarity(a.t, lower(unaccent(c.nome))))) END::numeric, 3)
  FROM public.categorias_contabeis c, alvo a
  WHERE c.ativo AND c.nivel = 2 AND length(a.t) >= 3
  ORDER BY 4 DESC
  LIMIT 3;
$$;

-- Acha o lançamento do pedido: o citado; senão o que bate com a busca (descrição,
-- fornecedor ou valor) nos últimos 120 dias; senão o último que a pessoa mandou no grupo.
CREATE OR REPLACE FUNCTION public.fn_ju_achar_lancamento(
  p_lancamento_id uuid DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_valor numeric DEFAULT NULL,
  p_sender text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cands jsonb;
  v_n     integer;
  v_id    uuid;
BEGIN
  IF p_lancamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id);
  END IF;

  IF nullif(trim(coalesce(p_busca, '')), '') IS NULL AND p_valor IS NULL THEN
    SELECT l.id INTO v_id FROM public.lancamentos_financeiros l
    WHERE nullif(p_sender, '') IS NOT NULL AND l.dados_ia #>> '{whatsapp,sender}' = p_sender
      AND l.created_at >= now() - interval '24 hours'
    ORDER BY l.created_at DESC LIMIT 1;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não sei qual lançamento. Responda em cima da nota ou diga o que é (fornecedor, descrição ou valor).');
    END IF;
    RETURN jsonb_build_object('ok', true, 'lancamento_id', v_id);
  END IF;

  WITH cand AS (
    SELECT l.id, l.descricao, l.valor_total, l.data_emissao, l.created_at,
           (l.status_lancamento = 'pre_lancamento') AS pre,
           greatest(
             coalesce(word_similarity(lower(unaccent(p_busca)), lower(unaccent(l.descricao))), 0),
             coalesce(word_similarity(lower(unaccent(p_busca)), lower(unaccent(coalesce(f.nome_fantasia, '') || ' ' || coalesce(f.nome_razao_social, '')))), 0)
           ) AS sim
    FROM public.lancamentos_financeiros l
    LEFT JOIN public.fornecedores f ON f.id = l.fornecedor_id
    WHERE l.status_lancamento <> 'cancelado'
      AND l.created_at >= now() - interval '120 days'
      AND (p_valor IS NULL OR abs(l.valor_total - p_valor) < 0.01)
  ), boas AS (
    SELECT * FROM cand
    WHERE (nullif(trim(coalesce(p_busca, '')), '') IS NULL OR sim >= 0.5)
    ORDER BY sim DESC, created_at DESC
    LIMIT 6
  )
  SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'descricao', descricao, 'valor', valor_total, 'data', data_emissao, 'pre', pre)
                             ORDER BY sim DESC, created_at DESC)
  INTO v_n, v_cands FROM boas;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei lançamento com "' || coalesce(p_busca, '') ||
      CASE WHEN p_valor IS NOT NULL THEN '" de R$ ' || p_valor ELSE '"' END || ' nos últimos 120 dias.');
  END IF;
  IF v_n > 1 THEN
    -- correção quase sempre é da nota que acabou de entrar: um único pré-lançamento parecido ganha
    SELECT (x ->> 'id')::uuid INTO v_id FROM jsonb_array_elements(v_cands) x WHERE (x ->> 'pre')::boolean;
    IF v_id IS NOT NULL AND (SELECT count(*) FROM jsonb_array_elements(v_cands) x WHERE (x ->> 'pre')::boolean) = 1 THEN
      RETURN jsonb_build_object('ok', true, 'lancamento_id', v_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'erro', 'Achei mais de um lançamento. Responda em cima da nota ou diga o valor.',
      'candidatos', v_cands);
  END IF;
  RETURN jsonb_build_object('ok', true, 'lancamento_id', (v_cands -> 0 ->> 'id')::uuid);
END;
$$;

-- Corrige o lançamento. Campos aceitos em p_alt: categoria, descricao, valor, data,
-- vencimento, competencia (AAAA-MM), fornecedor, cancelar (bool), observacao.
-- Valor e vencimento só mudam se nada foi pago e houver no máximo uma parcela.
CREATE OR REPLACE FUNCTION public.fn_ju_alterar_lancamento(
  p_lancamento_id uuid,
  p_alt jsonb,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l          record;
  c          record;
  f          record;
  v_seg      numeric;
  v_pagas    integer;
  v_parcelas integer;
  v_mud      text[] := '{}';
  v_txt      text;
  v_num      numeric;
  v_data     date;
BEGIN
  SELECT lf.*, cc.nome AS cat_nome,
         coalesce(nullif(fo.nome_fantasia, ''), fo.nome_razao_social) AS forn_nome
  INTO l
  FROM public.lancamentos_financeiros lf
  JOIN public.categorias_contabeis cc ON cc.id = lf.categoria_contabil_id
  LEFT JOIN public.fornecedores fo ON fo.id = lf.fornecedor_id
  WHERE lf.id = p_lancamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado');
  END IF;
  IF l.status_lancamento = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', '"' || l.descricao || '" está cancelado');
  END IF;

  SELECT count(*) FILTER (WHERE status_pagamento = 'pago'), count(*)
  INTO v_pagas, v_parcelas
  FROM public.contas_pagar WHERE lancamento_id = l.id;

  -- cancelar
  IF coalesce((p_alt ->> 'cancelar')::boolean, false) THEN
    IF v_pagas > 0 OR l.pago THEN
      RETURN jsonb_build_object('ok', false, 'erro', '"' || l.descricao || '" já tem pagamento registrado; cancele pelo app');
    END IF;
    UPDATE public.contas_pagar SET status_pagamento = 'cancelado' WHERE lancamento_id = l.id AND status_pagamento = 'pendente';
    UPDATE public.lancamentos_financeiros
    SET status_lancamento = 'cancelado', pago = false,
        observacoes = concat_ws(' ', observacoes, '[@ju] Cancelado' || coalesce(' por ' || nullif(p_solicitante, ''), '')
                      || ' em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || '.')
    WHERE id = l.id;
    UPDATE public.pix_solicitacoes SET status = 'cancelado', concluido_em = now(), notificado_em = now()
    WHERE lancamento_id = l.id AND status IN ('aguardando', 'erro');
    RETURN jsonb_build_object('ok', true, 'lancamento_id', l.id, 'descricao', l.descricao, 'cancelado', true);
  END IF;

  -- categoria
  v_txt := nullif(trim(coalesce(p_alt ->> 'categoria', '')), '');
  IF v_txt IS NOT NULL THEN
    SELECT * INTO c FROM public.fn_ju_resolver_categoria(v_txt) LIMIT 1;
    SELECT x.score INTO v_seg FROM public.fn_ju_resolver_categoria(v_txt) x OFFSET 1 LIMIT 1;
    IF c.categoria_id IS NULL OR c.score < 0.45 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não achei a categoria "' || v_txt || '"',
        'candidatos', (SELECT jsonb_agg(jsonb_build_object('nome', x.nome)) FROM public.fn_ju_resolver_categoria(v_txt) x));
    END IF;
    IF c.score < 1 AND v_seg IS NOT NULL AND c.score - v_seg < 0.08 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Qual categoria? "' || v_txt || '" parece com mais de uma',
        'candidatos', (SELECT jsonb_agg(jsonb_build_object('nome', x.nome)) FROM public.fn_ju_resolver_categoria(v_txt) x));
    END IF;
    IF c.categoria_id <> l.categoria_contabil_id THEN
      UPDATE public.lancamento_itens SET categoria_contabil_id = c.categoria_id
      WHERE lancamento_id = l.id AND categoria_contabil_id = l.categoria_contabil_id;
      UPDATE public.lancamentos_financeiros SET categoria_contabil_id = c.categoria_id WHERE id = l.id;
      v_mud := v_mud || ('categoria ' || l.cat_nome || ' → ' || c.nome);
    END IF;
  END IF;

  -- fornecedor
  v_txt := nullif(trim(coalesce(p_alt ->> 'fornecedor', '')), '');
  IF v_txt IS NOT NULL THEN
    SELECT s.* INTO f FROM public.fn_financeiro_sugerir_fornecedor(NULL, v_txt) s ORDER BY s.score DESC LIMIT 1;
    IF f.fornecedor_id IS NULL OR f.score < 0.5 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || v_txt || '" no cadastro');
    END IF;
    IF f.fornecedor_id IS DISTINCT FROM l.fornecedor_id THEN
      UPDATE public.lancamentos_financeiros SET fornecedor_id = f.fornecedor_id WHERE id = l.id;
      v_mud := v_mud || ('fornecedor ' || coalesce(l.forn_nome, '(nenhum)') || ' → ' || f.nome);
    END IF;
  END IF;

  -- descrição
  v_txt := nullif(trim(coalesce(p_alt ->> 'descricao', '')), '');
  IF v_txt IS NOT NULL AND v_txt <> l.descricao THEN
    UPDATE public.lancamentos_financeiros SET descricao = v_txt WHERE id = l.id;
    v_mud := v_mud || ('descrição "' || l.descricao || '" → "' || v_txt || '"');
  END IF;

  -- valor e vencimento: só sem pagamento e com no máximo uma parcela
  v_num := nullif(p_alt ->> 'valor', '')::numeric;
  v_data := nullif(p_alt ->> 'vencimento', '')::date;
  IF (v_num IS NOT NULL AND v_num <> l.valor_total) OR (v_data IS NOT NULL AND v_data IS DISTINCT FROM l.data_vencimento) THEN
    IF v_pagas > 0 OR l.pago THEN
      RETURN jsonb_build_object('ok', false, 'erro', '"' || l.descricao || '" já tem pagamento; valor e vencimento só pelo app');
    END IF;
    IF v_parcelas > 1 THEN
      RETURN jsonb_build_object('ok', false, 'erro', '"' || l.descricao || '" é parcelado; valor e vencimento só pelo app');
    END IF;
    IF v_num IS NOT NULL AND v_num <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Valor inválido');
    END IF;
    IF v_num IS NOT NULL AND v_num <> l.valor_total THEN
      UPDATE public.lancamentos_financeiros SET valor_total = v_num WHERE id = l.id;
      -- item único acompanha o valor (com vários itens, quem valida ajusta)
      UPDATE public.lancamento_itens SET valor_total = v_num, valor_unitario = v_num / greatest(coalesce(quantidade, 1), 1)
      WHERE lancamento_id = l.id AND (SELECT count(*) FROM public.lancamento_itens WHERE lancamento_id = l.id) = 1;
      v_mud := v_mud || ('valor ' || to_char(l.valor_total, 'FM999G999D00') || ' → ' || to_char(v_num, 'FM999G999D00'));
    END IF;
    IF v_data IS NOT NULL AND v_data IS DISTINCT FROM l.data_vencimento THEN
      UPDATE public.lancamentos_financeiros SET data_vencimento = v_data WHERE id = l.id;
      v_mud := v_mud || ('vencimento ' || coalesce(to_char(l.data_vencimento, 'DD/MM/YYYY'), '-') || ' → ' || to_char(v_data, 'DD/MM/YYYY'));
    END IF;
  END IF;

  -- data da compra (emissão)
  v_data := nullif(p_alt ->> 'data', '')::date;
  IF v_data IS NOT NULL AND v_data <> l.data_emissao THEN
    UPDATE public.lancamentos_financeiros SET data_emissao = v_data WHERE id = l.id;
    v_mud := v_mud || ('data ' || to_char(l.data_emissao, 'DD/MM/YYYY') || ' → ' || to_char(v_data, 'DD/MM/YYYY'));
  END IF;

  -- competência (mês de referência)
  v_txt := nullif(trim(coalesce(p_alt ->> 'competencia', '')), '');
  IF v_txt IS NOT NULL THEN
    v_data := date_trunc('month', (CASE WHEN v_txt ~ '^\d{4}-\d{2}$' THEN v_txt || '-01' ELSE v_txt END)::date)::date;
    IF v_data <> l.data_competencia THEN
      UPDATE public.lancamentos_financeiros SET data_competencia = v_data WHERE id = l.id;
      v_mud := v_mud || ('competência ' || to_char(l.data_competencia, 'MM/YYYY') || ' → ' || to_char(v_data, 'MM/YYYY'));
    END IF;
  END IF;

  -- observação livre
  v_txt := nullif(trim(coalesce(p_alt ->> 'observacao', '')), '');
  IF v_txt IS NOT NULL THEN
    v_mud := v_mud || ('obs: ' || v_txt);
  END IF;

  IF coalesce(array_length(v_mud, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nada mudou em "' || l.descricao || '" (já estava assim)');
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, '[@ju] ' || coalesce(nullif(p_solicitante, ''), '?') || ' em '
                    || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ': ' || array_to_string(v_mud, '; ') || '.')
  WHERE id = l.id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', l.id,
    'descricao', (SELECT descricao FROM public.lancamentos_financeiros WHERE id = l.id),
    'mudancas', to_jsonb(v_mud));
END;
$$;

-- Corrige o cadastro do fornecedor. Campos em p_alt: razao_social, nome_fantasia, cnpj,
-- telefone, email. CNPJ/CPF só com 14/11 dígitos e sem repetir outro fornecedor ativo.
CREATE OR REPLACE FUNCTION public.fn_ju_alterar_fornecedor(
  p_fornecedor text,
  p_alt jsonb,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_top   record;
  v_seg   numeric;
  fo      record;
  v_mud   text[] := '{}';
  v_txt   text;
  v_doc   text;
  v_outro text;
BEGIN
  SELECT s.* INTO v_top FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC LIMIT 1;
  SELECT s.score INTO v_seg FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC OFFSET 1 LIMIT 1;
  IF v_top.fornecedor_id IS NULL OR v_top.score < 0.5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || coalesce(p_fornecedor, '') || '" no cadastro');
  END IF;
  IF v_seg IS NOT NULL AND v_top.score - v_seg < 0.1 AND v_top.score < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de um fornecedor parecido com "' || p_fornecedor || '"',
      'candidatos', (SELECT jsonb_agg(jsonb_build_object('nome', s.nome)) FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s));
  END IF;

  SELECT * INTO fo FROM public.fornecedores WHERE id = v_top.fornecedor_id;

  v_txt := nullif(trim(coalesce(p_alt ->> 'razao_social', '')), '');
  IF v_txt IS NOT NULL AND v_txt IS DISTINCT FROM fo.nome_razao_social THEN
    UPDATE public.fornecedores SET nome_razao_social = v_txt WHERE id = fo.id;
    v_mud := v_mud || ('razão social "' || coalesce(fo.nome_razao_social, '') || '" → "' || v_txt || '"');
  END IF;

  v_txt := nullif(trim(coalesce(p_alt ->> 'nome_fantasia', '')), '');
  IF v_txt IS NOT NULL AND v_txt IS DISTINCT FROM fo.nome_fantasia THEN
    UPDATE public.fornecedores SET nome_fantasia = v_txt WHERE id = fo.id;
    v_mud := v_mud || ('nome fantasia "' || coalesce(fo.nome_fantasia, '') || '" → "' || v_txt || '"');
  END IF;

  v_txt := nullif(trim(coalesce(p_alt ->> 'cnpj', '')), '');
  IF v_txt IS NOT NULL THEN
    v_doc := regexp_replace(v_txt, '[^0-9]', '', 'g');
    IF length(v_doc) NOT IN (11, 14) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'CNPJ/CPF "' || v_txt || '" não tem 14 (CNPJ) nem 11 (CPF) dígitos');
    END IF;
    SELECT coalesce(nullif(nome_fantasia, ''), nome_razao_social) INTO v_outro
    FROM public.fornecedores
    WHERE ativo AND id <> fo.id AND public.fn_normalizar_documento(cpf_cnpj) = v_doc LIMIT 1;
    IF v_outro IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Esse CNPJ/CPF já está no cadastro de ' || v_outro || '. Pode ser o mesmo fornecedor duplicado; ajuste pelo app.');
    END IF;
    IF v_doc IS DISTINCT FROM public.fn_normalizar_documento(fo.cpf_cnpj) THEN
      UPDATE public.fornecedores SET cpf_cnpj = v_doc,
             tipo_pessoa = CASE WHEN length(v_doc) = 14 THEN 'juridica' ELSE 'fisica' END
      WHERE id = fo.id;
      v_mud := v_mud || ('CNPJ/CPF ' || coalesce(fo.cpf_cnpj, '(vazio)') || ' → ' || v_doc);
    END IF;
  END IF;

  v_txt := nullif(regexp_replace(coalesce(p_alt ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
  IF v_txt IS NOT NULL AND v_txt::bigint IS DISTINCT FROM fo.telefone THEN
    UPDATE public.fornecedores SET telefone = v_txt::bigint WHERE id = fo.id;
    v_mud := v_mud || ('telefone ' || coalesce(fo.telefone::text, '(vazio)') || ' → ' || v_txt);
  END IF;

  v_txt := nullif(lower(trim(coalesce(p_alt ->> 'email', ''))), '');
  IF v_txt IS NOT NULL THEN
    IF v_txt !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'E-mail "' || v_txt || '" inválido');
    END IF;
    IF v_txt IS DISTINCT FROM fo.email THEN
      UPDATE public.fornecedores SET email = v_txt WHERE id = fo.id;
      v_mud := v_mud || ('e-mail ' || coalesce(fo.email, '(vazio)') || ' → ' || v_txt);
    END IF;
  END IF;

  IF coalesce(array_length(v_mud, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nada mudou no cadastro de ' || v_top.nome || ' (já estava assim)');
  END IF;

  UPDATE public.fornecedores
  SET observacoes = concat_ws(' ', observacoes, '[@ju] ' || coalesce(nullif(p_solicitante, ''), '?') || ' em '
                    || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ': ' || array_to_string(v_mud, '; ') || '.')
  WHERE id = fo.id;

  RETURN jsonb_build_object('ok', true, 'fornecedor_nome', v_top.nome, 'mudancas', to_jsonb(v_mud));
END;
$$;

-- "O que você lançou": um lançamento (citado) em detalhe, ou o que entrou pelo
-- WhatsApp nos últimos p_dias dias (0 = hoje).
CREATE OR REPLACE FUNCTION public.fn_ju_consultar_lancamentos(
  p_lancamento_id uuid DEFAULT NULL,
  p_dias integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN p_lancamento_id IS NOT NULL THEN (
    SELECT jsonb_build_object(
      'modo', 'detalhe',
      'descricao', l.descricao, 'valor', l.valor_total, 'status', l.status_lancamento, 'pago', l.pago,
      'categoria', c.nome, 'fornecedor', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
      'data', l.data_emissao, 'vencimento', l.data_vencimento, 'competencia', l.data_competencia,
      'observacoes', l.observacoes,
      'itens', (SELECT jsonb_agg(jsonb_build_object('descricao', i.descricao, 'valor', i.valor_total) ORDER BY i.item_numero)
                FROM public.lancamento_itens i WHERE i.lancamento_id = l.id))
    FROM public.lancamentos_financeiros l
    JOIN public.categorias_contabeis c ON c.id = l.categoria_contabil_id
    LEFT JOIN public.fornecedores f ON f.id = l.fornecedor_id
    WHERE l.id = p_lancamento_id)
  ELSE (
    SELECT jsonb_build_object(
      'modo', 'lista', 'dias', greatest(p_dias, 0),
      'total', coalesce(sum(l.valor_total) FILTER (WHERE l.status_lancamento <> 'cancelado'), 0),
      'itens', coalesce(jsonb_agg(jsonb_build_object(
                 'descricao', l.descricao, 'valor', l.valor_total, 'categoria', c.nome,
                 'status', l.status_lancamento, 'pago', l.pago,
                 'quando', l.created_at, 'quem', l.dados_ia #>> '{whatsapp,remetente}')
               ORDER BY l.created_at), '[]'::jsonb))
    FROM public.lancamentos_financeiros l
    JOIN public.categorias_contabeis c ON c.id = l.categoria_contabil_id
    WHERE l.origem_lancamento = 'api_ia'
      AND l.dados_ia ? 'whatsapp'
      AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date
          >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - greatest(p_dias, 0))
  END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_resolver_categoria(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_achar_lancamento(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_alterar_lancamento(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_alterar_fornecedor(text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_consultar_lancamentos(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_resolver_categoria(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_achar_lancamento(uuid, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_alterar_lancamento(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_alterar_fornecedor(text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_consultar_lancamentos(uuid, integer) TO service_role;
