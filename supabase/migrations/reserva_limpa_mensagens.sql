-- 29/10/2026 (pedido do dono): quando a reserva vira consulta ou é liberada/excluída (botão, app ou @ju),
-- as mensagens dela somem do grupo 🔔 e do privado da profissional (cards e "cadastro pronto").
-- Os ids das mensagens são guardados (net._http_response só vive algumas horas).

ALTER TABLE public.ju_reserva_agenda
  ADD COLUMN IF NOT EXISTS msg_reqs bigint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS msg_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS limpo_em timestamptz;

-- req de envio → id da mensagem (guarda o que já respondeu)
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_resolver_msgs(p_bloqueio_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE m public.ju_reserva_agenda; v_novos text[];
BEGIN
  SELECT * INTO m FROM public.ju_reserva_agenda WHERE bloqueio_id = p_bloqueio_id;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_novos FROM (
    SELECT unnest(m.msg_ids) x
    UNION
    SELECT nullif(h.content::jsonb ->> 'messageid', '')
      FROM net._http_response h
     WHERE h.id = ANY (m.msg_reqs || coalesce(m.grupo_req_id, 0)) AND h.status_code = 200) s
   WHERE x IS NOT NULL;
  IF v_novos IS DISTINCT FROM m.msg_ids THEN
    UPDATE public.ju_reserva_agenda SET msg_ids = v_novos WHERE bloqueio_id = p_bloqueio_id;
  END IF;
  RETURN v_novos;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_ju_reserva_agenda_limpar(p_bloqueio_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_ids text[]; v_tok text; v_id text; v_n int := 0;
BEGIN
  v_ids := public.fn_ju_reserva_agenda_resolver_msgs(p_bloqueio_id);
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_tok IS NULL THEN RETURN 0; END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/message/delete', body := jsonb_build_object('id', v_id),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.ju_reserva_agenda SET limpo_em = now() WHERE bloqueio_id = p_bloqueio_id;
  RETURN v_n;
END $f$;

-- Reserva saiu da agenda (virou consulta, liberada ou excluída): apaga as mensagens
CREATE OR REPLACE FUNCTION public.fn_trg_reserva_limpa_mensagens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ju_reserva_agenda WHERE bloqueio_id = NEW.id AND limpo_em IS NULL) THEN
    PERFORM public.fn_ju_reserva_agenda_limpar(NEW.id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'limpeza das mensagens da reserva % falhou: %', NEW.id, SQLERRM;
  RETURN NULL;
END $f$;
DROP TRIGGER IF EXISTS trg_reserva_limpa_mensagens ON public.agenda_bloqueios;
CREATE TRIGGER trg_reserva_limpa_mensagens
  AFTER UPDATE OF ativo, deleted_at ON public.agenda_bloqueios
  FOR EACH ROW
  WHEN (OLD.motivo = 'reserva' AND OLD.ativo AND OLD.deleted_at IS NULL AND (NOT NEW.ativo OR NEW.deleted_at IS NOT NULL))
  EXECUTE FUNCTION public.fn_trg_reserva_limpa_mensagens();

-- Envios passam a registrar o req de cada mensagem
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_reserva_agenda_avisar(uuid)'::regprocedure);
  IF d NOT LIKE '%msg_reqs%' THEN
    n := replace(d, $a$  UPDATE public.ju_reserva_agenda SET grupo_req_id = v_req WHERE bloqueio_id = b.id;
  IF v_tel IS NOT NULL THEN
    PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/menu',$a$,
$a$  UPDATE public.ju_reserva_agenda SET grupo_req_id = v_req, msg_reqs = msg_reqs || v_req WHERE bloqueio_id = b.id;
  IF v_tel IS NOT NULL THEN
    v_req := net.http_post(url := 'https://infuse.uazapi.com/send/menu',$a$);
    n := replace(n, $a$      timeout_milliseconds := 20000);
  END IF;
  RETURN v_req;$a$, $a$      timeout_milliseconds := 20000);
    UPDATE public.ju_reserva_agenda SET msg_reqs = msg_reqs || v_req WHERE bloqueio_id = b.id;
  END IF;
  RETURN (SELECT grupo_req_id FROM public.ju_reserva_agenda WHERE bloqueio_id = b.id);$a$);
    IF n NOT LIKE '%msg_reqs = msg_reqs || v_req WHERE bloqueio_id = b.id;%RETURN (SELECT grupo_req_id%' THEN
      RAISE EXCEPTION 'fn_ju_reserva_agenda_avisar: trecho não encontrado';
    END IF;
    EXECUTE n;
  END IF;

  d := pg_get_functiondef('public.fn_ju_reservas_tick()'::regprocedure);
  IF d NOT LIKE '%msg_reqs%' THEN
    n := replace(d, $a$DECLARE x record; ctx jsonb; v_n int; v_pac uuid; v_cards int := 0; v_avisos int := 0; v_tok text; v_msg text; v_nome text;
BEGIN$a$, $a$DECLARE x record; ctx jsonb; v_n int; v_pac uuid; v_cards int := 0; v_avisos int := 0; v_tok text; v_msg text; v_nome text; v_req bigint;
BEGIN
  -- guarda os ids das mensagens enquanto as respostas do envio ainda existem
  PERFORM public.fn_ju_reserva_agenda_resolver_msgs(m.bloqueio_id)
     FROM public.ju_reserva_agenda m WHERE m.limpo_em IS NULL AND m.created_at > now() - interval '60 days';$a$);
    n := replace(n, $a$        PERFORM net.http_post(url := 'https://infuse.uazapi.com/send/text',$a$,
                    $a$        v_req := net.http_post(url := 'https://infuse.uazapi.com/send/text',$a$);
    n := replace(n, $a$          timeout_milliseconds := 20000);
      END IF;
      v_avisos := v_avisos + 1;$a$, $a$          timeout_milliseconds := 20000);
        UPDATE public.ju_reserva_agenda SET msg_reqs = msg_reqs || v_req WHERE bloqueio_id = x.bloqueio_id;
      END IF;
      v_avisos := v_avisos + 1;$a$);
    IF n NOT LIKE '%fn_ju_reserva_agenda_resolver_msgs(m.bloqueio_id)%' OR n NOT LIKE '%msg_reqs = msg_reqs || v_req WHERE bloqueio_id = x.bloqueio_id%' THEN
      RAISE EXCEPTION 'fn_ju_reservas_tick: trecho não encontrado';
    END IF;
    EXECUTE n;
  END IF;
END
$mig$;

-- Reserva da Isadora/Alice: mensagens já apagadas à mão em 29/10/2026
UPDATE public.ju_reserva_agenda SET limpo_em = now()
 WHERE bloqueio_id = '41252808-06f5-44c9-9060-a6ea2ad60ade' AND limpo_em IS NULL;

DO $grant$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_ju_reserva_agenda_resolver_msgs(uuid)', 'fn_ju_reserva_agenda_limpar(uuid)', 'fn_trg_reserva_limpa_mensagens()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $grant$;
