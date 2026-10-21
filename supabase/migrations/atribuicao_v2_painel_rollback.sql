-- Rollback da base do painel (fase 3). Depois disto, recriar vw_atrib_receita_sessao,
-- vw_atrib_aquisicoes e vw_atrib_oportunidade_pacientes a partir de
-- atribuicao_v2_ju.sql / atribuicao_v2_custos.sql (versões sem a receita pré-calculada).
SELECT cron.unschedule('atrib_receita');
DROP FUNCTION IF EXISTS public.fn_atrib_painel_qualidade(), public.fn_atrib_jornada(bigint), public.fn_atrib_atualizar_receita();
DROP VIEW IF EXISTS public.vw_atrib_oportunidades_painel;
-- (as três visões acima dependem da MV: recriar antes de apagá-la)
-- DROP MATERIALIZED VIEW interno.mv_atrib_receita_sessao;
-- DROP FUNCTION public.fn_atrib_pode_ver(), public.fn_atrib_rpc_ok();
-- ALTER TABLE public.atrib_config DROP COLUMN receita_atualizada_em;
