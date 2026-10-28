-- A tela Conversas lê vw_whatsapp_conversas_enriquecidas (via RPC
-- get_whatsapp_conversas_enriquecidas): as colunas da reclassificação da fila
-- (followup_fila_recuperacao.sql, 28/10/2026) entram no fim.
DO $$
DECLARE
  v_def text := pg_get_viewdef('public.vw_whatsapp_conversas_enriquecidas'::regclass);
  v_old text := $q$COALESCE(fat.faturas, '[]'::jsonb) AS faturas_sistema$q$;
  v_new text := $q$COALESCE(fat.faturas, '[]'::jsonb) AS faturas_sistema,
    w.followup_tipo_acao,
    w.followup_motivo,
    w.followup_reclassificado_em$q$;
BEGIN
  IF position('followup_motivo' IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'vw_whatsapp_conversas_enriquecidas mudou: âncora não encontrada uma única vez';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_whatsapp_conversas_enriquecidas AS ' || replace(v_def, v_old, v_new);
END $$;

-- CREATE OR REPLACE VIEW sem WITH zera as opções: sem security_invoker, qualquer
-- usuário logado leria todas as conversas direto pela view.
ALTER VIEW public.vw_whatsapp_conversas_enriquecidas SET (security_invoker = on);
