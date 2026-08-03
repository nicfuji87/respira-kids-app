-- ============================================================================
-- Auditoria de mudança de status das faturas (DIAGNÓSTICO — temporária)
-- ============================================================================
--
-- MOTIVO: a fatura pay_g31y3ak3lznnd9cw (Serena Tavares Cardoso, R$780, paga no
-- Asaas em 08/07/2026) foi corrigida para 'pago' pela reconciliação e, algum
-- tempo depois, voltou sozinha para 'atrasado' — preservando o `pago_em` que a
-- reconciliação tinha gravado. Das 9 faturas corrigidas naquela rodada, só essa
-- voltou.
--
-- O que já foi descartado na investigação:
-- - o único trigger de faturas (`faturas_margens_aiu`) é AFTER UPDATE e só
--   chama fn_processar_margens_fatura, que apenas INSERE em margens_atendimento;
-- - não há RULE em faturas;
-- - nenhuma função do banco escreve 'atrasado' em faturas além da própria
--   reconciliação (verificado em pg_proc.prosrc).
-- Ou seja: a escrita vem de FORA do banco (app, n8n ou integração) via API.
--
-- Este trigger registra quem muda `faturas.status`: role, usuário,
-- application_name (PostgREST/mgmt-api/etc), IP e o `sub` do JWT quando houver.
-- Com isso o próximo flip identifica o autor sem adivinhação.
--
-- REMOVER quando o autor for identificado:
--   DROP TRIGGER faturas_status_auditoria ON public.faturas;
--   DROP FUNCTION public.trg_faturas_status_auditoria();
--
-- ⚠️ Lição da primeira versão: o `EXCEPTION WHEN OTHERS THEN NULL` engoliu um
-- erro de cast (`->> 'sub'` é text, a coluna é uuid) e a auditoria ficou muda.
-- Handler de exceção em trigger de auditoria SEMPRE deve emitir RAISE WARNING.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.faturas_status_auditoria (
  id               bigserial PRIMARY KEY,
  fatura_id        uuid NOT NULL,
  id_asaas         text,
  status_anterior  text,
  status_novo      text,
  db_role          text,
  db_user          text,
  application_name text,
  client_addr      inet,
  auth_uid         uuid,
  auth_role        text,
  ocorrido_em      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faturas_status_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fsa_admin ON public.faturas_status_auditoria;
CREATE POLICY fsa_admin ON public.faturas_status_auditoria
  FOR ALL USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.trg_faturas_status_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;

      INSERT INTO public.faturas_status_auditoria (
        fatura_id, id_asaas, status_anterior, status_novo,
        db_role, db_user, application_name, client_addr, auth_uid, auth_role
      ) VALUES (
        NEW.id, NEW.id_asaas, OLD.status, NEW.status,
        current_role, session_user,
        current_setting('application_name', true),
        inet_client_addr(),
        (v_claims ->> 'sub')::uuid,
        v_claims ->> 'role'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auditoria de status da fatura % falhou: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS faturas_status_auditoria ON public.faturas;
CREATE TRIGGER faturas_status_auditoria
  AFTER UPDATE OF status ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_faturas_status_auditoria();
