-- AI dev note: 04/11/2026 (pedido do dono): a lista de horários livres das 19h (fn_horarios_livres_postar →
-- ju_avisos_grupo → n8n, que grava o msg_id) é fixada no grupo da agenda por 1 dia logo depois de postada.
-- A lista de espera continua fixada por 30 dias (fn_lista_espera_cron). WhatsApp aceita até 3 fixadas.
-- uazapi /message/pin: duration em dias (1, 7 ou 30).

ALTER TABLE public.ju_avisos_grupo ADD COLUMN IF NOT EXISTS fixado_em timestamptz;
UPDATE public.ju_avisos_grupo SET fixado_em = now()
 WHERE origem = 'HORARIOS_LIVRES' AND fixado_em IS NULL AND enviado_em < now() - interval '2 hours' AND id <> 98;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
BEGIN
  IF position($a$  v_n int := 0; v_fila int; v_req bigint;$a$ IN d) = 0
     OR position($a$  RETURN jsonb_build_object('vagas_fechadas', v_n,$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  d := replace(d, $a$  v_n int := 0; v_fila int; v_req bigint;$a$, $a$  v_n int := 0; v_fila int; v_req bigint; v_pin record;$a$);
  d := replace(d, $a$  RETURN jsonb_build_object('vagas_fechadas', v_n,$a$,
    $a$  -- lista de horários livres recém-postada: fixa por 1 dia (04/11/2026)
  IF fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token' IS NOT NULL THEN
    FOR v_pin IN UPDATE ju_avisos_grupo SET fixado_em = now()
                  WHERE origem = 'HORARIOS_LIVRES' AND msg_id IS NOT NULL AND fixado_em IS NULL AND apagado_em IS NULL
                    AND enviado_em > now() - interval '2 hours'
                 RETURNING msg_id LOOP
      PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/pin',
        body := jsonb_build_object('id', v_pin.msg_id, 'pin', true, 'duration', 1),
        headers := jsonb_build_object('token', fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token',
                                      'Content-Type', 'application/json', 'Accept', 'application/json'),
        timeout_milliseconds := 20000);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('vagas_fechadas', v_n,$a$);
  EXECUTE d;
END $do$;
