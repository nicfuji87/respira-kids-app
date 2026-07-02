-- Fase 3a: motor de envio PAUSADO do lote (WhatsApp API não-oficial).
-- Envios do LOTE ficam "segurados" no webhook_queue (proximo_retry no futuro distante +
-- payload.data.pacing='lote'). fn_liberar_envio_lote, rodando de minuto em minuto, LIBERA
-- um por vez respeitando: janela 8h-20h (Brasília), intervalo 5-9 min randômico, teto 80/dia.
-- Avulsos (proximo_retry=now/janela, sem pacing) NÃO passam por aqui — vão na hora (pista
-- expressa). Só ATIVA de fato quando a geração passa a marcar os envios como 'held'+pacing.
CREATE OR REPLACE FUNCTION public.fn_liberar_envio_lote()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hora_brt int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo timestamptz;
  v_hoje_count int;
  v_gap_seg int;
  v_id uuid;
  TETO_DIARIO constant int := 80;
BEGIN
  IF v_hora_brt < 8 OR v_hora_brt >= 20 THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_hoje_count
  FROM webhook_queue
  WHERE evento = 'pagamento_link_criado'
    AND payload->'data'->>'pacing' = 'lote'
    AND proximo_retry <= now()
    AND (proximo_retry AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje_brt;
  IF v_hoje_count >= TETO_DIARIO THEN
    RETURN 0;
  END IF;

  SELECT max(proximo_retry) INTO v_ultimo
  FROM webhook_queue
  WHERE evento = 'pagamento_link_criado'
    AND payload->'data'->>'pacing' = 'lote'
    AND proximo_retry <= now();
  v_gap_seg := 300 + floor(random() * 240); -- 5-9 min
  IF v_ultimo IS NOT NULL AND (now() - v_ultimo) < make_interval(secs => v_gap_seg) THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_id
  FROM webhook_queue
  WHERE evento = 'pagamento_link_criado'
    AND payload->'data'->>'pacing' = 'lote'
    AND status = 'pendente'
    AND proximo_retry > now()
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE webhook_queue SET proximo_retry = now() WHERE id = v_id;
  RETURN 1;
END;
$$;

SELECT cron.schedule(
  'liberar-envio-lote-cobranca',
  '* * * * *',
  'SELECT public.fn_liberar_envio_lote();'
);
