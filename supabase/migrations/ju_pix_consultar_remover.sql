-- @ju: descadastrar chave Pix e consultar quem tem chave (uma chave por fornecedor;
-- cadastrar de novo troca a anterior). Pedido do dono em 15/10/2026.

-- Remove a chave do fornecedor citado e cancela os links de Pix ainda abertos dele,
-- para ninguém pagar numa chave que acabou de ser descadastrada.
CREATE OR REPLACE FUNCTION public.fn_ju_remover_pix(
  p_fornecedor text,
  p_solicitante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cands     jsonb;
  v_top       record;
  v_segundo   numeric;
  v_anterior  text;
  v_cancel    integer;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('nome', s.nome, 'score', s.score) ORDER BY s.score DESC), '[]'::jsonb)
  INTO v_cands FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s;
  SELECT s.* INTO v_top FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC LIMIT 1;
  SELECT s.score INTO v_segundo FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s ORDER BY s.score DESC OFFSET 1 LIMIT 1;

  IF v_top.fornecedor_id IS NULL OR v_top.score < 0.5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || coalesce(p_fornecedor, '') || '" no cadastro', 'candidatos', v_cands);
  END IF;
  IF v_segundo IS NOT NULL AND v_top.score - v_segundo < 0.1 AND v_top.score < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tem mais de um fornecedor parecido com "' || p_fornecedor || '"', 'candidatos', v_cands);
  END IF;

  SELECT chave_pix INTO v_anterior FROM public.fornecedores WHERE id = v_top.fornecedor_id;
  IF nullif(v_anterior, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', v_top.nome || ' já não tinha chave Pix cadastrada');
  END IF;

  UPDATE public.fornecedores
  SET chave_pix = NULL,
      chave_pix_atualizada_em = now(),
      chave_pix_origem = 'Removida pela @ju' || coalesce(' por ' || nullif(p_solicitante, ''), '')
  WHERE id = v_top.fornecedor_id;

  UPDATE public.pix_solicitacoes
  SET status = 'cancelado', concluido_em = now(), notificado_em = now(),
      erro = 'Chave Pix descadastrada'
  WHERE fornecedor_id = v_top.fornecedor_id AND status IN ('aguardando', 'erro');
  GET DIAGNOSTICS v_cancel = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'fornecedor_nome', v_top.nome, 'chave_anterior', v_anterior,
    'pedidos_cancelados', v_cancel);
END;
$$;

-- Sem fornecedor: todos que têm chave. Com fornecedor: os parecidos no cadastro,
-- dizendo se cada um tem chave (e "não está no cadastro" quando nada parece).
CREATE OR REPLACE FUNCTION public.fn_ju_consultar_pix(p_fornecedor text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN nullif(trim(coalesce(p_fornecedor, '')), '') IS NULL THEN
      jsonb_build_object(
        'modo', 'todos',
        'total_fornecedores', (SELECT count(*) FROM public.fornecedores WHERE ativo),
        'com_chave', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
                   'chave', f.chave_pix, 'atualizada_em', f.chave_pix_atualizada_em)
                 ORDER BY coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social))
          FROM public.fornecedores f
          WHERE f.ativo AND nullif(f.chave_pix, '') IS NOT NULL), '[]'::jsonb))
    ELSE
      jsonb_build_object(
        'modo', 'fornecedor',
        'busca', p_fornecedor,
        'encontrados', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'nome', s.nome, 'score', s.score, 'chave', f.chave_pix,
                   'cnpj', f.cpf_cnpj, 'atualizada_em', f.chave_pix_atualizada_em)
                 ORDER BY s.score DESC)
          FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) s
          JOIN public.fornecedores f ON f.id = s.fornecedor_id), '[]'::jsonb))
  END;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_remover_pix(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_consultar_pix(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_remover_pix(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_consultar_pix(text) TO service_role;
