-- AI dev note: 04/11/2026 (pedido do dono): o aviso de cancelamento diz de onde veio.
-- - botão "Cancelar" do WhatsApp: o n8n [Sistema RK] Webhook Botão grava cancelamento_origem = 'botao_whatsapp'
-- - Ju: observação "[Ju] cancelado ..." (já existia)
-- - app: atualizado_por = quem cancelou
-- O webhook appointment_updated leva 'cancelado_por' pronto; o n8n [RK] Webhook Confirmacao usa no grupo e na fisio.
-- cancelamento_origem só vale na própria mudança de status (o gatilho limpa se a mudança não trouxer origem).

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cancelamento_origem text;

CREATE OR REPLACE FUNCTION public.trg_agendamento_cancelamento_origem()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status_consulta_id IS DISTINCT FROM OLD.status_consulta_id
     AND NEW.cancelamento_origem IS NOT DISTINCT FROM OLD.cancelamento_origem THEN
    NEW.cancelamento_origem := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agendamento_cancelamento_origem ON public.agendamentos;
CREATE TRIGGER trg_agendamento_cancelamento_origem BEFORE UPDATE OF status_consulta_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_agendamento_cancelamento_origem();

CREATE OR REPLACE FUNCTION public.fn_agendamento_cancelado_por(p_origem text, p_observacao text, p_atualizado_por uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN p_origem = 'botao_whatsapp' THEN 'pela família, no botão do WhatsApp'
    WHEN coalesce(p_observacao, '') ~ '\[Ju\] cancelad' THEN 'pela Ju, a pedido da família'
    ELSE 'pelo sistema' END; -- 04/11: dono quer só "(pelo sistema)", sem o nome
$$;

DO $do$
DECLARE d text := pg_get_functiondef('public.webhook_appointment_updated'::regproc);
BEGIN
  IF position($a$'observacao', v_agendamento.observacao,$a$ IN d) = 0 THEN RAISE EXCEPTION 'webhook_appointment_updated: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$'observacao', v_agendamento.observacao,$a$,
    $a$'observacao', v_agendamento.observacao,
        'cancelado_por', public.fn_agendamento_cancelado_por(NEW.cancelamento_origem, NEW.observacao, NEW.atualizado_por),$a$);
END $do$;
