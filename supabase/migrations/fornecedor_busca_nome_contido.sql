-- Busca de fornecedor por nome: depois que "Bio Bella" virou "Bio Bella Distribuidora de
-- Descartável" (15/10/2026), "Bio Bella"/"Biobella" deixou de achar o fornecedor, porque a
-- similaridade era só do nome inteiro (razão + fantasia juntas). Agora também conta quando o
-- texto buscado está contido no nome fantasia ou na razão social (word_similarity), limitado
-- a 0,95 para que só CNPJ igual valha 1 (as funções da @ju tratam 1 como "sem ambiguidade").

CREATE OR REPLACE FUNCTION public.fn_financeiro_sugerir_fornecedor(p_documento text, p_nome text)
RETURNS TABLE(fornecedor_id uuid, nome text, cpf_cnpj text, score numeric, motivo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH alvo AS (
    SELECT public.fn_normalizar_documento(p_documento)  AS doc,
           public.fn_normalizar_nome_empresa(p_nome)    AS nome_norm
  ), cand AS (
    SELECT f.id,
           coalesce(nullif(f.nome_fantasia,''), f.nome_razao_social) AS nome,
           f.cpf_cnpj,
           a.doc,
           a.nome_norm,
           public.fn_normalizar_documento(f.cpf_cnpj) = a.doc AS bate_cnpj,
           greatest(
             similarity(public.fn_normalizar_nome_empresa(
               coalesce(f.nome_razao_social,'') || ' ' || coalesce(f.nome_fantasia,'')), a.nome_norm),
             similarity(public.fn_normalizar_nome_empresa(f.nome_fantasia), a.nome_norm),
             similarity(public.fn_normalizar_nome_empresa(f.nome_razao_social), a.nome_norm),
             least(0.95, word_similarity(a.nome_norm, public.fn_normalizar_nome_empresa(f.nome_fantasia))),
             least(0.95, word_similarity(a.nome_norm, public.fn_normalizar_nome_empresa(f.nome_razao_social)))
           ) AS sim
    FROM public.fornecedores f, alvo a
    WHERE f.ativo
  )
  SELECT id, nome, cpf_cnpj,
         CASE WHEN bate_cnpj THEN 1.0 ELSE round(sim::numeric, 3) END,
         CASE WHEN bate_cnpj THEN 'cnpj' ELSE 'nome' END
  FROM cand
  WHERE (doc IS NOT NULL AND bate_cnpj)
     OR (length(nome_norm) >= 3 AND sim >= 0.35)
  ORDER BY 4 DESC
  LIMIT 5;
$$;
