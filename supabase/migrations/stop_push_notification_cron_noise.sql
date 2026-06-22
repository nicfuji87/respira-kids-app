-- Sistema de push está dormente (0 tokens, 0 fila, 0 logs) e o cron de 1 min
-- falhava sempre porque as GUCs app.settings.supabase_url /
-- app.settings.supabase_service_role_key nunca foram configuradas, gerando
-- "null value in column url of http_request_queue" a cada minuto.

-- 1) Blindar a função: não tentar POST sem URL/credencial válidas.
--    (Mantém o comportamento original quando as GUCs estiverem configuradas.)
CREATE OR REPLACE FUNCTION public.invoke_send_push_notification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  base_url text;
  function_url text;
  service_role_key text;
BEGIN
  base_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  -- Sem configuração não há como invocar a Edge Function: sair silenciosamente
  -- em vez de inserir url NULL na fila do pg_net (que viola NOT NULL).
  IF base_url IS NULL OR base_url = '' OR service_role_key IS NULL OR service_role_key = '' THEN
    RETURN;
  END IF;

  function_url := base_url || '/functions/v1/send-push-notification';

  PERFORM
    net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := '{}'::jsonb
    );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao invocar send-push-notification: %', SQLERRM;
END;
$function$;

-- 2) Desativar o cron de 1 min enquanto o push não estiver realmente ativado.
--    Reversível: SELECT cron.alter_job(4, active := true) quando configurar.
SELECT cron.alter_job(job_id := 4, active := false);
