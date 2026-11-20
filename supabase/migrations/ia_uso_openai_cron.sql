-- 20/11/2026: totais oficiais da OpenAI para o painel "Custo de IA" (edge ia-uso-openai).
-- A chave de ADMINISTRADOR da organização fica no Vault como 'openai_admin_key' (o dono cria e coloca;
-- nunca vai para o repositório). Sem ela, a edge responde 'sem_chave' e o painel mostra só as estimativas.

CREATE OR REPLACE FUNCTION public.fn_ia_openai_admin_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'openai_admin_key' LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_ia_openai_admin_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ia_openai_admin_key() TO service_role;

SELECT cron.unschedule('ia-uso-openai') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ia-uso-openai');
SELECT cron.schedule('ia-uso-openai', '7 * * * *', $c$
  SELECT net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/ia-uso-openai',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"dias": 3}'::jsonb,
    timeout_milliseconds := 60000)
  WHERE public.fn_ia_openai_admin_key() IS NOT NULL;
$c$);
