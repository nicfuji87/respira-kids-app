-- Rollback da fase 2 (custos). Volta as visões ao formato da fase 1 rodando, depois
-- disto, os blocos CREATE VIEW de vw_atrib_aquisicoes, vw_atrib_campanhas_mensal e
-- vw_atrib_cobertura_mensal de atribuicao_v2_ju.sql.
DROP VIEW IF EXISTS public.vw_atrib_campanhas_mensal, public.vw_atrib_cobertura_mensal, public.vw_atrib_custos_status;
DROP FUNCTION IF EXISTS public.fn_atrib_custos_receber(jsonb, text);
DROP TABLE IF EXISTS public.atrib_custos_importacoes;
ALTER TABLE public.atrib_custos_diarios DROP COLUMN IF EXISTS status_campanha, DROP COLUMN IF EXISTS importacao_id;
ALTER TABLE public.atrib_config DROP COLUMN IF EXISTS google_ads_conta_id, DROP COLUMN IF EXISTS google_ads_fuso,
  DROP COLUMN IF EXISTS custos_horas_desatualizado;
DELETE FROM vault.secrets WHERE name = 'atrib_custos_token';
-- vw_atrib_aquisicoes ganhou a coluna mes_origem no fim: DROP VIEW vw_atrib_oportunidade_pacientes,
-- vw_atrib_aquisicoes e recriar as duas a partir de atribuicao_v2_ju.sql.
-- fn_atrib_custos_importar(jsonb) mudou de contrato: recriar a versão de atribuicao_v2_ju.sql.
