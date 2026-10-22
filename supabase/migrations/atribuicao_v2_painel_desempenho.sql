-- =====================================================================
-- Atribuição v2 — painel: checagem de acesso uma vez por consulta
-- =====================================================================
-- AI dev note (21/10/2026): com login de admin, fn_atrib_pode_ver() era
-- avaliada por LINHA (is_admin() consulta pessoas a cada chamada) e a aba
-- Qualidade dos dados chegou a estourar o statement_timeout (8 s) do papel
-- authenticated no primeiro carregamento. Envolver em (SELECT ...) vira um
-- InitPlan: avalia uma vez. Mesmo padrão das policies (memória
-- rls-subquery-reentra-policy). E a função olha current_user primeiro.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_atrib_pode_ver()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT current_user IN ('postgres', 'supabase_admin', 'service_role')
      OR coalesce(public.is_admin(), false)
$$;

DO $do$
DECLARE v text; d text; n text;
BEGIN
  FOREACH v IN ARRAY ARRAY['vw_atrib_receita_sessao', 'vw_atrib_aquisicoes', 'vw_atrib_oportunidade_pacientes', 'vw_atrib_oportunidades_painel'] LOOP
    d := pg_get_viewdef(('public.' || v)::regclass, true);
    n := replace(d, 'fn_atrib_pode_ver()', '(SELECT fn_atrib_pode_ver() AS fn_atrib_pode_ver)');
    IF n = d THEN RAISE EXCEPTION '%: chamada não encontrada', v; END IF;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS %s', v, n);
  END LOOP;
END
$do$;
