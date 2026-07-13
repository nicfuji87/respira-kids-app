-- Sincronização de bloqueios de agenda com o Google Calendar.
-- Aplicado em produção em 2026-07-13 (via MCP).
-- Espelha a infra de sync-google-calendar das consultas.
-- NOTA DE SEGURANÇA: em produção, o trigger usa o service_role JWT hardcoded
-- (mesmo padrão de trigger_google_calendar_sync). Aqui a chave está REDIGIDA
-- porque o repositório é público — substitua <SERVICE_ROLE_KEY> ao reaplicar.

-- Mapeamento bloqueio -> evento Google por profissional (clínica inteira = N eventos)
CREATE TABLE public.agenda_bloqueio_google_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloqueio_id        uuid NOT NULL REFERENCES public.agenda_bloqueios(id) ON DELETE CASCADE,
  profissional_id    uuid NOT NULL REFERENCES public.pessoas(id),
  google_event_id    text NOT NULL,
  google_calendar_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bloqueio_id, profissional_id)
);

ALTER TABLE public.agenda_bloqueio_google_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass" ON public.agenda_bloqueio_google_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY bloqueio_gevents_staff_select ON public.agenda_bloqueio_google_events
  FOR SELECT TO authenticated USING (is_authorized_staff());

-- Destinatários: profissional do bloqueio, ou TODOS os profissionais com OAuth
-- (pode_atender = true) quando é bloqueio de clínica inteira.
CREATE OR REPLACE FUNCTION public.get_google_calendar_recipients_bloqueio(
  p_bloqueio_id uuid
)
RETURNS TABLE(
  id uuid, nome text, email text, google_calendar_id text,
  google_refresh_token text, google_access_token text,
  google_token_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prof uuid;
  v_clinica boolean;
BEGIN
  SELECT b.profissional_id, (b.profissional_id IS NULL)
    INTO v_prof, v_clinica
  FROM agenda_bloqueios b WHERE b.id = p_bloqueio_id;

  RETURN QUERY
  SELECT pes.id, pes.nome, pes.email, pes.google_calendar_id,
         pes.google_refresh_token, pes.google_access_token,
         pes.google_token_expires_at
  FROM pessoas pes
  WHERE pes.google_calendar_enabled = true
    AND pes.google_refresh_token IS NOT NULL
    AND pes.ativo = true
    AND (
      (v_clinica IS FALSE AND pes.id = v_prof)
      OR (v_clinica IS TRUE AND pes.pode_atender = true)
    );
END;
$$;

-- Trigger: chama a edge function via pg_net. EXCEPTION-safe.
CREATE OR REPLACE FUNCTION public.trigger_bloqueio_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_function_url text := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1';
  v_service_key  text := '<SERVICE_ROLE_KEY>';  -- redigido; valor real setado em produção
  v_op text := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'INSERT';
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.inicio IS DISTINCT FROM OLD.inicio
        OR NEW.fim IS DISTINCT FROM OLD.fim
        OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id
        OR NEW.motivo IS DISTINCT FROM OLD.motivo
        OR NEW.observacao IS DISTINCT FROM OLD.observacao
        OR NEW.ativo IS DISTINCT FROM OLD.ativo
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
      IF NEW.ativo = false OR NEW.deleted_at IS NOT NULL THEN
        v_op := 'DELETE';
      ELSE
        v_op := 'UPDATE';
      END IF;
    END IF;
  END IF;

  IF v_op IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_function_url || '/sync-google-calendar-bloqueio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('operation', v_op, 'bloqueio_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro trigger bloqueio Google sync: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bloqueio_google_sync ON public.agenda_bloqueios;
CREATE TRIGGER bloqueio_google_sync
  AFTER INSERT OR UPDATE OF inicio, fim, profissional_id, motivo, observacao, ativo, deleted_at
  ON public.agenda_bloqueios
  FOR EACH ROW EXECUTE FUNCTION public.trigger_bloqueio_google_sync();
