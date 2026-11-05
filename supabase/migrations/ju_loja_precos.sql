-- AI dev note: 05/11/2026 (caso Fernanda, conv 8899): a família perguntou o preço de cada item da compra e a Ju
-- não sabia ("vou confirmar com a Lolô"). fn_ju_loja entrega à Ju a tabela da loja (produtos vendáveis ativos)
-- e as compras dos últimos 30 dias da família com o valor de cada item. Entra em fn_ju_turno como 'loja'.

CREATE OR REPLACE FUNCTION public.fn_ju_loja(p_conversa_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH conv AS (
    SELECT substr(telefone, 2) AS t13,
           CASE WHEN telefone ~ '^\+55[0-9]{2}9[0-9]{8}$' THEN substr(telefone, 2, 4) || substr(telefone, 7) END AS t12
      FROM public.ju_conversas WHERE id = p_conversa_id
  ),
  resp AS (
    SELECT p.id FROM conv JOIN public.pessoas p ON p.telefone::text IN (conv.t13, conv.t12) WHERE p.ativo
  ),
  compras AS (
    SELECT v.id, v.created_at, v.status, v.valor_total, v.desconto
      FROM public.produto_vendas v
     WHERE v.ativo AND v.created_at > now() - interval '30 days'
       AND (v.responsavel_cobranca_id IN (SELECT id FROM resp)
            OR v.paciente_id IN (SELECT pr.id_pessoa FROM public.pessoa_responsaveis pr
                                  WHERE pr.id_responsavel IN (SELECT id FROM resp) AND pr.ativo))
     ORDER BY v.created_at DESC LIMIT 5
  )
  SELECT jsonb_build_object(
    'tabela', coalesce((
      SELECT jsonb_agg(p.nome || ' - R$ ' || replace(to_char(p.preco_venda, 'FM999990.00'), '.', ',')
                       || CASE WHEN p.controla_estoque AND coalesce(p.estoque_atual, 0) <= 0 THEN ' (esgotado)' ELSE '' END
                       ORDER BY p.categoria_venda, p.nome)
        FROM public.produtos_servicos p
       WHERE p.vendavel AND p.ativo AND p.preco_venda IS NOT NULL), '[]'::jsonb),
    'compras_recentes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'data', to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
               'status', c.status,
               'total', c.valor_total,
               'desconto', nullif(c.desconto, 0),
               'itens', (SELECT jsonb_agg(i.quantidade::int || 'x ' || p.nome || ' - R$ '
                                          || replace(to_char(i.preco_unitario, 'FM999990.00'), '.', ',') || ' cada'
                                          ORDER BY p.nome)
                           FROM public.produto_venda_itens i JOIN public.produtos_servicos p ON p.id = i.produto_id
                          WHERE i.venda_id = c.id))
             ORDER BY c.created_at DESC)
        FROM compras c), '[]'::jsonb));
$$;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_turno'::regproc);
BEGIN
  IF position($a$    'servicos', public.fn_ju_servicos(),$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$    'servicos', public.fn_ju_servicos(),$a$,
    $a$    'servicos', public.fn_ju_servicos(),
    'loja', public.fn_ju_loja(c.id),$a$);
END $do$;
