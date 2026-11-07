-- =====================================================================================
-- Envio das cobranças: proteção contra falha em massa (07/11/2026, pedido do dono)
--
-- Motivo: o lote de 05/08 teve 91% de falha no envio inicial e ninguém soube na hora.
--
-- 1. whatsapp_status: o banco confere a cada 5 min (8h–20h) as duas conexões da recepção
--    (uazapi e QuePasa, as mesmas da aba Integrações) via pg_net.
-- 2. fn_liberar_envio_lote só solta mensagem do lote se pelo menos uma conexão estiver
--    no ar. Desconectado = segura e avisa o grupo (no máximo 1 aviso a cada 2 h); volta
--    sozinho quando reconectar.
-- 3. Mais de 10% de falha entre os envios do lote desde a última retomada (mínimo de 3
--    falhas) = pausa o lote e avisa o grupo. Só volta pelo botão "Retomar envio".
-- 4. Quem falhou ganha uma nova tentativa 30 min depois (data.reenvio = true). Se falhar
--    de novo, o n8n manda a cobrança por e-mail.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_status (
  instancia text PRIMARY KEY CHECK (instancia IN ('uazapi', 'quepasa')),
  conectado boolean,
  estado text,
  verificado_em timestamptz,
  request_id bigint,
  pedido_em timestamptz
);
INSERT INTO public.whatsapp_status (instancia) VALUES ('uazapi'), ('quepasa') ON CONFLICT DO NOTHING;
ALTER TABLE public.whatsapp_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_status_staff_select ON public.whatsapp_status;
CREATE POLICY whatsapp_status_staff_select ON public.whatsapp_status
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
REVOKE ALL ON public.whatsapp_status FROM anon;
GRANT SELECT ON public.whatsapp_status TO authenticated;

-- lê a resposta do pedido anterior e faz um novo
CREATE OR REPLACE FUNCTION public.fn_whatsapp_status_conferir()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  r record;
  j jsonb;
  v_ok boolean;
  v_estado text;
  cred jsonb := public.fn_whatsapp_conexoes_credenciais();
BEGIN
  FOR s IN SELECT * FROM whatsapp_status LOOP
    IF s.request_id IS NOT NULL THEN
      SELECT * INTO r FROM net._http_response WHERE id = s.request_id;
      IF FOUND THEN
        BEGIN
          j := r.content::jsonb;
        EXCEPTION WHEN others THEN
          j := NULL;
        END;
        IF s.instancia = 'uazapi' THEN
          v_ok := r.status_code = 200 AND (
                    (coalesce((j->'status'->>'connected')::boolean, false) AND coalesce((j->'status'->>'loggedIn')::boolean, true))
                    OR j->'instance'->>'status' = 'connected');
          v_estado := coalesce(j->'instance'->>'status', r.status_code::text);
        ELSE
          v_ok := r.status_code = 200 AND CASE WHEN j ? 'state' THEN j->>'state' IN ('Ready', 'Connected')
                                                ELSE coalesce((j->>'success')::boolean, false) END;
          v_estado := coalesce(j->>'state', r.status_code::text);
        END IF;
        UPDATE whatsapp_status SET conectado = v_ok, estado = v_estado, verificado_em = now(), request_id = NULL
         WHERE instancia = s.instancia;
      ELSIF s.pedido_em < now() - interval '10 minutes' THEN
        -- sem resposta (timeout): conta como fora do ar
        UPDATE whatsapp_status SET conectado = false, estado = 'sem resposta', verificado_em = now(), request_id = NULL
         WHERE instancia = s.instancia;
      ELSE
        CONTINUE; -- ainda esperando
      END IF;
    END IF;

    IF s.instancia = 'uazapi' AND cred ? 'whatsapp_uazapi_token' THEN
      UPDATE whatsapp_status
         SET request_id = net.http_get(
               url := 'https://infuse.uazapi.com/instance/status',
               headers := jsonb_build_object('token', cred->>'whatsapp_uazapi_token', 'Accept', 'application/json'),
               timeout_milliseconds := 20000),
             pedido_em = now()
       WHERE instancia = 'uazapi';
    ELSIF s.instancia = 'quepasa' AND cred ? 'whatsapp_quepasa_token' THEN
      UPDATE whatsapp_status
         SET request_id = net.http_get(
               url := 'https://infusecomunicacao.apibridge.top/health',
               headers := jsonb_build_object('X-QUEPASA-TOKEN', cred->>'whatsapp_quepasa_token', 'Accept', 'application/json'),
               timeout_milliseconds := 20000),
             pedido_em = now()
       WHERE instancia = 'quepasa';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fn_whatsapp_status_conferir() FROM PUBLIC, anon, authenticated;

-- true = pode enviar. Sem dado recente (monitor parado) não bloqueia.
CREATE OR REPLACE FUNCTION public.fn_whatsapp_envio_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM whatsapp_status WHERE verificado_em > now() - interval '20 minutes') THEN true
    ELSE EXISTS (SELECT 1 FROM whatsapp_status WHERE verificado_em > now() - interval '20 minutes' AND conectado)
  END;
$$;
REVOKE ALL ON FUNCTION public.fn_whatsapp_envio_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_whatsapp_envio_ok() TO authenticated;

-- Pausas do envio em lote
CREATE TABLE IF NOT EXISTS public.cobranca_envio_pausas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motivo text NOT NULL,
  detalhe text,
  criada_em timestamptz NOT NULL DEFAULT now(),
  retomada_em timestamptz,
  retomada_por uuid REFERENCES public.pessoas(id),
  retomada_por_nome text
);
CREATE UNIQUE INDEX IF NOT EXISTS cobranca_envio_pausas_uma_aberta
  ON public.cobranca_envio_pausas ((true)) WHERE retomada_em IS NULL;
ALTER TABLE public.cobranca_envio_pausas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_envio_pausas_staff_select ON public.cobranca_envio_pausas;
CREATE POLICY cobranca_envio_pausas_staff_select ON public.cobranca_envio_pausas
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
REVOKE ALL ON public.cobranca_envio_pausas FROM anon;
GRANT SELECT ON public.cobranca_envio_pausas TO authenticated;

-- estado dos avisos (1 linha)
CREATE TABLE IF NOT EXISTS public.cobranca_envio_estado (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  aviso_whatsapp_em timestamptz
);
INSERT INTO public.cobranca_envio_estado DEFAULT VALUES ON CONFLICT DO NOTHING;
ALTER TABLE public.cobranca_envio_estado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cobranca_envio_estado FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_cobranca_envio_retomar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; n int;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF NOT (a.sistema OR a.staff) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  UPDATE cobranca_envio_pausas
     SET retomada_em = now(), retomada_por = a.pessoa_id, retomada_por_nome = coalesce(a.nome, 'sistema')
   WHERE retomada_em IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'retomadas', n);
END $$;
REVOKE ALL ON FUNCTION public.fn_cobranca_envio_retomar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_envio_retomar() TO authenticated;

-- Situação para a tela (pausa aberta, WhatsApp, fila e falhas recentes)
CREATE OR REPLACE FUNCTION public.fn_cobranca_envio_situacao()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base timestamptz; p record;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM cobranca_envio_pausas WHERE retomada_em IS NULL LIMIT 1;
  SELECT coalesce(max(retomada_em), now() - interval '24 hours') INTO v_base FROM cobranca_envio_pausas;
  v_base := greatest(v_base, now() - interval '24 hours');
  RETURN jsonb_build_object(
    'pausa', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('motivo', p.motivo, 'detalhe', p.detalhe, 'desde', p.criada_em) END,
    'whatsapp_ok', public.fn_whatsapp_envio_ok(),
    'conexoes', (SELECT jsonb_agg(jsonb_build_object('instancia', instancia, 'conectado', conectado, 'estado', estado, 'verificado_em', verificado_em)) FROM whatsapp_status),
    'na_fila', (SELECT count(*) FROM webhook_queue WHERE evento = 'pagamento_link_criado'
                  AND payload->'data'->>'pacing' = 'lote' AND status = 'pendente' AND proximo_retry > now()),
    'enviados', (SELECT count(*) FROM cobranca_disparo_log WHERE tipo = 'inicial' AND canal = 'whatsapp' AND status = 'enviado' AND criado_em > v_base),
    'falhas', (SELECT count(*) FROM cobranca_disparo_log WHERE tipo = 'inicial' AND canal = 'whatsapp' AND status = 'falhou' AND criado_em > v_base));
END $$;
REVOKE ALL ON FUNCTION public.fn_cobranca_envio_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_envio_situacao() TO authenticated;

-- Libera 1 mensagem do lote (janela 8–20h, 5–9 min, teto 80/dia) + as travas novas
CREATE OR REPLACE FUNCTION public.fn_liberar_envio_lote()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hora_brt int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  v_ritmo record;
  v_gap_seg int;
  v_id uuid;
  v_base timestamptz;
  v_env int;
  v_fal int;
  v_na_fila int;
  TETO_DIARIO constant int := 80;
BEGIN
  IF v_hora_brt < 8 OR v_hora_brt >= 20 THEN
    RETURN 0;
  END IF;

  -- lote pausado por falhas: só o botão "Retomar envio" solta
  IF EXISTS (SELECT 1 FROM cobranca_envio_pausas WHERE retomada_em IS NULL) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_na_fila FROM webhook_queue
   WHERE evento = 'pagamento_link_criado' AND payload->'data'->>'pacing' = 'lote'
     AND status = 'pendente' AND proximo_retry > now();
  IF v_na_fila = 0 THEN
    RETURN 0;
  END IF;

  -- WhatsApp fora do ar: segura e avisa (no máximo a cada 2 h)
  IF NOT public.fn_whatsapp_envio_ok() THEN
    IF coalesce((SELECT aviso_whatsapp_em FROM cobranca_envio_estado), '-infinity') < now() - interval '2 hours' THEN
      INSERT INTO ju_avisos_grupo (texto, origem)
      VALUES ('⏸️ *Envio das cobranças segurado*' || chr(10) ||
              'O WhatsApp da recepção está desconectado (uazapi e QuePasa). ' || v_na_fila ||
              ' cobrança(s) do lote estão esperando. O envio volta sozinho quando reconectar.' || chr(10) ||
              'Para reconectar: Configurações > Integrações > WhatsApp.', 'ENVIO_LOTE');
      UPDATE cobranca_envio_estado SET aviso_whatsapp_em = now();
    END IF;
    RETURN 0;
  END IF;

  -- mais de 10% de falha desde a última retomada (mín. 3 falhas): pausa
  SELECT greatest(coalesce(max(retomada_em), '-infinity'), now() - interval '24 hours') INTO v_base FROM cobranca_envio_pausas;
  SELECT count(*) FILTER (WHERE status = 'enviado'), count(*) FILTER (WHERE status = 'falhou')
    INTO v_env, v_fal
    FROM cobranca_disparo_log
   WHERE tipo = 'inicial' AND canal = 'whatsapp' AND criado_em > v_base;
  IF v_fal >= 3 AND v_fal::numeric / greatest(v_env + v_fal, 1) > 0.10 THEN
    INSERT INTO cobranca_envio_pausas (motivo, detalhe)
    VALUES ('falhas', v_fal || ' de ' || (v_env + v_fal) || ' envios falharam')
    ON CONFLICT DO NOTHING;
    INSERT INTO ju_avisos_grupo (texto, origem)
    VALUES ('⏸️ *Envio das cobranças pausado*' || chr(10) ||
            v_fal || ' de ' || (v_env + v_fal) || ' mensagens do lote falharam (mais de 10%). ' || v_na_fila ||
            ' cobrança(s) seguem esperando. Confira o WhatsApp da recepção e depois toque em "Retomar envio" em Financeiro > Faturas > Disparos.' || chr(10) ||
            'Quem falhou recebe nova tentativa em 30 min e, se falhar de novo, a cobrança vai por e-mail.', 'ENVIO_LOTE');
    RETURN 0;
  END IF;

  SELECT * INTO v_ritmo FROM public.fn_envio_ritmo_recepcao();
  IF v_ritmo.hoje >= TETO_DIARIO THEN
    RETURN 0;
  END IF;

  v_gap_seg := 300 + floor(random() * 240);
  IF v_ritmo.ultimo IS NOT NULL AND (now() - v_ritmo.ultimo) < make_interval(secs => v_gap_seg) THEN
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
END $$;

-- Nova tentativa 30 min depois de uma falha no envio inicial (1 vez por link)
CREATE OR REPLACE FUNCTION public.fn_cobranca_reenviar_falhas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
  v_hora_brt int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
BEGIN
  IF v_hora_brt < 8 OR v_hora_brt >= 20 THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT DISTINCT ON (l.pagamento_link_id) l.pagamento_link_id, l.status, l.criado_em
      FROM cobranca_disparo_log l
     WHERE l.tipo = 'inicial' AND l.canal = 'whatsapp' AND l.pagamento_link_id IS NOT NULL
       AND l.criado_em > now() - interval '3 days'
     ORDER BY l.pagamento_link_id, l.criado_em DESC
  LOOP
    CONTINUE WHEN r.status <> 'falhou' OR r.criado_em > now() - interval '30 minutes';
    -- só 1 nova tentativa por link
    CONTINUE WHEN EXISTS (SELECT 1 FROM webhook_queue w
                           WHERE w.evento = 'pagamento_link_criado'
                             AND w.payload->'data'->>'pagamento_link_id' = r.pagamento_link_id::text
                             AND (w.payload->'data'->>'reenvio')::boolean IS TRUE);
    -- link ainda em aberto
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pagamento_links pl
                               WHERE pl.id = r.pagamento_link_id AND pl.ativo AND pl.status = 'pendente'
                                 AND pl.id_asaas IS NULL AND pl.fatura_id IS NULL);
    INSERT INTO webhook_queue (evento, payload, status, tentativas, max_tentativas, proximo_retry)
    SELECT 'pagamento_link_criado',
           jsonb_set(jsonb_set(w.payload, '{data,reenvio}', 'true'::jsonb), '{data,pacing}', '"reenvio"'::jsonb)
             || jsonb_build_object('webhook_id', gen_random_uuid(), 'timestamp', now()),
           'pendente', 0, 3, now()
      FROM webhook_queue w
     WHERE w.evento = 'pagamento_link_criado'
       AND w.payload->'data'->>'pagamento_link_id' = r.pagamento_link_id::text
     ORDER BY w.created_at DESC
     LIMIT 1;
    IF FOUND THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_cobranca_reenviar_falhas() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('whatsapp-status-conferir') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-status-conferir');
SELECT cron.schedule('whatsapp-status-conferir', '*/5 10-23 * * *', $$SELECT public.fn_whatsapp_status_conferir()$$);
SELECT cron.unschedule('cobranca-reenviar-falhas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cobranca-reenviar-falhas');
SELECT cron.schedule('cobranca-reenviar-falhas', '*/10 11-22 * * *', $$SELECT public.fn_cobranca_reenviar_falhas()$$);
