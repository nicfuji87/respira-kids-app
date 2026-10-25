-- Rollback de atribuicao_v2_otimizacao.sql (desfaz tudo; apaga sinais e detalhe do Ads).
SELECT cron.unschedule('atrib_alerta_convenio') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atrib_alerta_convenio');
DROP FUNCTION IF EXISTS public.fn_atrib_alerta_convenio();
DROP FUNCTION IF EXISTS public.fn_atrib_otimizacao(date, date);
DROP FUNCTION IF EXISTS public.fn_atrib_ads_detalhe_receber(jsonb, text);
DROP TABLE IF EXISTS public.atrib_ads_termos_diarios;
DROP TABLE IF EXISTS public.atrib_ads_palavras_diarias;
DROP FUNCTION IF EXISTS public.fn_atrib_corresp(text);
DROP TRIGGER IF EXISTS atrib_sinais_ins ON public.ju_mensagens;
DROP TRIGGER IF EXISTS atrib_sinais_upd ON public.ju_mensagens;
DROP FUNCTION IF EXISTS public.fn_atrib_sinais_mensagem();
DROP TABLE IF EXISTS public.atrib_sinais;
DROP FUNCTION IF EXISTS public.fn_atrib_convenio_detalhes(text);
