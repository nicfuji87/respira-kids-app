-- Rollback da atribuição v2 (só objetos atrib_*; nada de agenda, faturas ou Ju é alterado).
SELECT cron.unschedule('atrib_processar');
SELECT cron.unschedule('atrib_buscar_cliques');
DROP TRIGGER IF EXISTS atrib_captura ON public.ju_mensagens;
DROP VIEW IF EXISTS public.vw_atrib_cobertura_mensal, public.vw_atrib_campanhas_mensal, public.vw_atrib_funil_mensal,
  public.vw_atrib_oportunidade_pacientes, public.vw_atrib_aquisicoes, public.vw_atrib_oportunidades, public.vw_atrib_receita_sessao;
DROP TABLE IF EXISTS public.atrib_site_requisicoes, public.atrib_revisoes, public.atrib_cliques_whatsapp_diarios,
  public.atrib_custos_diarios, public.atrib_eventos, public.atrib_oportunidade_agendamentos, public.atrib_toques,
  public.atrib_oportunidades, public.atrib_erros, public.atrib_config;
DROP FUNCTION IF EXISTS public.fn_atrib_revisar(bigint, text, text, text), public.fn_atrib_custos_importar(jsonb),
  public.fn_atrib_processar(), public.fn_atrib_buscar_cliques(), public.fn_atrib_site_post(text, jsonb),
  public.fn_atrib_aplicar_clique(bigint, jsonb), public.fn_atrib_capturar_mensagem(),
  public.fn_atrib_oportunidade_para(bigint, timestamptz, text), public.fn_atrib_contato_novo(text, bigint, timestamptz),
  public.fn_atrib_eventos_imutavel(), public.fn_atrib_canal(text, text, text), public.fn_atrib_pacientes_do_contato(text),
  public.fn_atrib_excluida(text, text), public.fn_atrib_etapa_ord(text);
DROP INDEX IF EXISTS public.atrib_pessoas_tel_chave_idx;
DROP FUNCTION IF EXISTS public.fn_atrib_tel_chave(text);
DELETE FROM vault.secrets WHERE name IN ('atrib_site_token', 'atrib_site_anon');
-- No site: docs/atribuicao/sql/site_02_leitura_app_rollback.sql (repo respirakids-site)
