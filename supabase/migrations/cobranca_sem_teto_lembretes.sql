-- 28/10/2026, decisão do dono: lembrete de inadimplência sai toda terça e sexta
-- enquanto a cobrança estiver em aberto. A família precisa ver que está
-- inadimplente. Sem teto: nenhuma cobrança pausa sozinha por quantidade de
-- lembretes. teto_lembretes_automaticos NULL = sem limite.

ALTER TABLE public.cobranca_config ALTER COLUMN teto_lembretes_automaticos DROP NOT NULL;
ALTER TABLE public.cobranca_config ALTER COLUMN teto_lembretes_automaticos DROP DEFAULT;
UPDATE public.cobranca_config SET teto_lembretes_automaticos = NULL, atualizado_em = now();

DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_cobranca_pode_lembrar(uuid, uuid, text, text, boolean)'::regprocedure);
  v_old text := $q$IF v_n >= coalesce(cfg.teto_lembretes_automaticos, 6) THEN$q$;
  v_new text := $q$IF cfg.teto_lembretes_automaticos IS NOT NULL AND v_n >= cfg.teto_lembretes_automaticos THEN$q$;
BEGIN
  IF position(v_new IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fn_cobranca_pode_lembrar: trecho do teto não encontrado uma única vez';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;
