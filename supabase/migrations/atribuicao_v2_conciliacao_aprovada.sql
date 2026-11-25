-- Conciliação do P0 aprovada pelo dono em 25/11/2026: com a regra única, os pacientes
-- novos confirmados batem canal por canal entre o painel antigo e a base única.
-- A cópia guardada para comparação (atribuicao_v2_p0_calculo_unico.sql) não é mais
-- usada; a Visão geral e as Campanhas antigas saíram do Marketing no mesmo PR.
DROP VIEW IF EXISTS interno.vw_atrib_aquisicoes_v1;
