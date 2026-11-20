-- 20/11/2026: a chave de administrador ficou como segredo da Edge Function (openai_admin_key), então o
-- cron chama a edge sempre (ela responde 'sem_chave' se faltar). A organização da OpenAI é compartilhada
-- com outros projetos do dono (Cada Fase, IPO...): o total oficial passa a ser por chave de API e o
-- painel soma só as chaves da Respira Kids (ia_chaves_rk); o resto aparece como openai_outros_usd.

SELECT cron.unschedule('ia-uso-openai') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ia-uso-openai');
SELECT cron.schedule('ia-uso-openai', '7 * * * *', $c$
  SELECT net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/ia-uso-openai',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"dias": 3}'::jsonb,
    timeout_milliseconds := 60000);
$c$);

DELETE FROM public.ia_uso_openai_dia;
ALTER TABLE public.ia_uso_openai_dia ADD COLUMN IF NOT EXISTS chave text NOT NULL DEFAULT 'desconhecida';
ALTER TABLE public.ia_uso_openai_dia DROP CONSTRAINT IF EXISTS ia_uso_openai_dia_pkey;
ALTER TABLE public.ia_uso_openai_dia ADD PRIMARY KEY (dia, modelo, chave);

CREATE TABLE IF NOT EXISTS public.ia_chaves_rk (
  nome       text PRIMARY KEY,
  observacao text
);
ALTER TABLE public.ia_chaves_rk ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_chaves_rk FROM anon, authenticated;
INSERT INTO public.ia_chaves_rk (nome, observacao) VALUES
  ('cadafase_clientes', 'Ju (atendimento, @ju, resumo, imagem, áudio). Atenção: tem também gpt-5.5 de outros clientes'),
  ('Sistema Analise Conversacional', '[RK] Análise Conversacional (n8n editori), gpt-5.5'),
  ('Sistema', 'edges do app (escolha de horário, lista de espera, histórico...)')
ON CONFLICT (nome) DO NOTHING;

DO $mig$
DECLARE v_def text := pg_get_functiondef('public.fn_ia_uso_painel(integer)'::regprocedure);
  v_old text := $o$                 FROM ia_uso_openai_dia o WHERE o.dia >= v_ini), '[]'::jsonb)$o$;
  v_new text := $n$                 FROM ia_uso_openai_dia o WHERE o.dia >= v_ini
                  AND o.chave IN (SELECT nome FROM ia_chaves_rk)), '[]'::jsonb),
      'openai_outros_usd', (SELECT round(coalesce(sum(fn_ia_custo_usd(o.modelo, o.tokens_entrada, o.tokens_cache, o.tokens_saida)), 0), 2)
                              FROM ia_uso_openai_dia o WHERE o.dia >= v_ini AND o.chave NOT IN (SELECT nome FROM ia_chaves_rk))$n$;
BEGIN
  IF position(v_old IN v_def) > 0 THEN EXECUTE replace(v_def, v_old, v_new); END IF;
END $mig$;

DO $mig$
DECLARE v_def text := pg_get_functiondef('public.fn_ia_uso_painel(integer)'::regprocedure);
BEGIN
  IF position($o$'chave', o.chave$o$ IN v_def) = 0 THEN
    v_def := replace(v_def, $o$'openai_oficial', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', o.dia, 'modelo', o.modelo, 'requisicoes', o.requisicoes,$o$,
                            $n$'openai_oficial', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', o.dia, 'modelo', o.modelo, 'chave', o.chave, 'requisicoes', o.requisicoes,$n$);
    EXECUTE v_def;
  END IF;
END $mig$;
