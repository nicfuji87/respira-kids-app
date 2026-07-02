-- Fase 3b: cron que cutuca o worker de criação (mode:'worker') a cada minuto, SÓ quando há
-- trabalho pendente (guard em processando/gerando + payload not null p/ ignorar lotes da
-- Fase 2 antiga). Mesmo padrão do process-webhooks-job (net.http_post -> edge function).
-- A chave usada no header é a ANON KEY (publishable, já pública no bundle do front) — basta
-- ser um JWT válido; o path 'worker' da função não faz auth de usuário.
SELECT cron.schedule(
  'process-payment-generation-job',
  '* * * * *',
  $cron$
  select case when exists (
    select 1 from public.pagamento_link_geracao_log
    where status in ('processando','gerando') and payload is not null
  ) then net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/generate-payment-links-bulk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I'
    ),
    body := '{"mode":"worker"}'::jsonb,
    timeout_milliseconds := 5000
  ) end
  $cron$
);
