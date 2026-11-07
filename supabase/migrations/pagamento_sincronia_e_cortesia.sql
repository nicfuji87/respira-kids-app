-- =====================================================================================
-- Pagamento acompanha a consulta + status "Cortesia" (06/11/2026)
--
-- Antes: o gatilho cancelar_pagamento_quando_consulta_cancelada só agia quando a consulta
-- MUDAVA para "cancelado". Ficavam de fora (achados da Conferência de outubro):
--   - consulta criada já cancelada (o formulário deixa escolher os dois status);
--   - status "reagendado" e "erro";
--   - edição posterior que devolvia o pagamento para "pendente" com a consulta cancelada;
--   - consulta que voltava de cancelada para ativa (o pagamento ficava cancelado).
-- Agora fn_agendamento_sincronizar_pagamento roda em INSERT e em UPDATE do status da
-- consulta ou do pagamento:
--   1. consulta parada (cancelado/erro/reagendado) => pagamento "cancelado", salvo pago,
--      estornado ou já cancelado;
--   2. consulta que volta para ativa com pagamento "cancelado" (sem fatura nem link) =>
--      "pendente" (ou "pago" se o valor é zero, como o resto do sistema faz).
--
-- Cortesia: sessão que aconteceu e não será cobrada. Só admin e secretaria marcam (pela
-- RPC fn_agendamento_cortesia, com motivo). Quando é a secretaria, sai aviso no grupo
-- 🩺 RK · Agenda e atendimentos. Cortesia fica fora da cobrança (front: podeGerarCobranca).
-- =====================================================================================

INSERT INTO public.pagamento_status (codigo, descricao, cor)
SELECT 'cortesia', 'Cortesia', '#EC4899'
WHERE NOT EXISTS (SELECT 1 FROM public.pagamento_status WHERE codigo = 'cortesia');

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS cortesia_motivo text,
  ADD COLUMN IF NOT EXISTS cortesia_por uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cortesia_em timestamptz;

-- ---------- Sincronia consulta x pagamento + trava da cortesia ----------
CREATE OR REPLACE FUNCTION public.fn_agendamento_sincronizar_pagamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_st text; v_st_old text; v_pg text; v_pg_old text;
  v_cancelado uuid; v_pendente uuid; v_pago uuid;
BEGIN
  SELECT codigo INTO v_st FROM consulta_status WHERE id = NEW.status_consulta_id;
  SELECT codigo INTO v_pg FROM pagamento_status WHERE id = NEW.status_pagamento_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT codigo INTO v_st_old FROM consulta_status WHERE id = OLD.status_consulta_id;
    SELECT codigo INTO v_pg_old FROM pagamento_status WHERE id = OLD.status_pagamento_id;
  END IF;
  SELECT id INTO v_cancelado FROM pagamento_status WHERE codigo = 'cancelado';
  SELECT id INTO v_pendente FROM pagamento_status WHERE codigo = 'pendente';
  SELECT id INTO v_pago FROM pagamento_status WHERE codigo = 'pago';

  -- Cortesia: só admin e secretaria (ou o próprio sistema)
  IF v_pg = 'cortesia' AND (TG_OP = 'INSERT' OR v_pg_old IS DISTINCT FROM 'cortesia') THEN
    IF NOT (session_user IN ('postgres', 'supabase_admin') OR auth.role() = 'service_role'
            OR public.fn_rls_admin_secretaria_ativo()) THEN
      RAISE EXCEPTION 'Só admin ou secretaria pode marcar a sessão como cortesia.';
    END IF;
    NEW.cortesia_em := COALESCE(NEW.cortesia_em, now());
    NEW.cortesia_por := COALESCE(NEW.cortesia_por, (SELECT id FROM pessoas WHERE auth_user_id = auth.uid() LIMIT 1));
  ELSIF v_pg IS DISTINCT FROM 'cortesia' AND v_pg_old = 'cortesia' THEN
    NEW.cortesia_em := NULL; NEW.cortesia_por := NULL; NEW.cortesia_motivo := NULL;
  END IF;

  -- 1. consulta parada => pagamento cancelado
  IF v_st IN ('cancelado', 'erro', 'reagendado')
     AND COALESCE(v_pg, '') NOT IN ('pago', 'estornado', 'cancelado') THEN
    NEW.status_pagamento_id := v_cancelado;
    NEW.cortesia_em := NULL; NEW.cortesia_por := NULL; NEW.cortesia_motivo := NULL;

  -- 2. consulta voltou a ficar ativa => pagamento reaberto
  ELSIF TG_OP = 'UPDATE'
     AND v_st_old IN ('cancelado', 'erro', 'reagendado')
     AND v_st NOT IN ('cancelado', 'erro', 'reagendado')
     AND v_pg = 'cancelado'
     AND NEW.fatura_id IS NULL AND NEW.pagamento_link_id IS NULL THEN
    NEW.status_pagamento_id := CASE WHEN COALESCE(NEW.valor_servico, 0) = 0 THEN v_pago ELSE v_pendente END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_cancelar_pagamento_quando_consulta_cancelada ON public.agendamentos;
DROP TRIGGER IF EXISTS trg_agendamento_sincronizar_pagamento ON public.agendamentos;
CREATE TRIGGER trg_agendamento_sincronizar_pagamento
  BEFORE INSERT OR UPDATE OF status_consulta_id, status_pagamento_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_sincronizar_pagamento();

-- ---------- Aviso no grupo da agenda quando a secretaria marca/desfaz cortesia ----------
CREATE OR REPLACE FUNCTION public.fn_agendamento_cortesia_aviso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pg text; v_pg_old text; v_quem record; v_pac text; v_prof text; v_txt text;
BEGIN
  SELECT codigo INTO v_pg FROM pagamento_status WHERE id = NEW.status_pagamento_id;
  SELECT codigo INTO v_pg_old FROM pagamento_status WHERE id = OLD.status_pagamento_id;
  IF (v_pg = 'cortesia') = (v_pg_old = 'cortesia') THEN RETURN NEW; END IF;

  SELECT p.nome, t.codigo INTO v_quem
  FROM pessoas p JOIN pessoa_tipos t ON t.id = p.id_tipo_pessoa
  WHERE p.auth_user_id = auth.uid() LIMIT 1;
  IF v_quem.codigo IS DISTINCT FROM 'secretaria' THEN RETURN NEW; END IF;  -- admin não avisa

  SELECT nome INTO v_pac FROM pessoas WHERE id = NEW.paciente_id;
  SELECT split_part(nome, ' ', 1) INTO v_prof FROM pessoas WHERE id = NEW.profissional_id;
  v_txt := CASE WHEN v_pg = 'cortesia' THEN '🎁 *Cortesia marcada*' ELSE '↩️ *Cortesia desfeita*' END
    || E'\nPaciente: ' || COALESCE(v_pac, '?')
    || E'\nSessão: ' || to_char(NEW.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI') || COALESCE(' com ' || v_prof, '')
    || CASE WHEN v_pg = 'cortesia'
            THEN E'\nValor que não será cobrado: R$ ' || replace(to_char(COALESCE(NEW.valor_servico, 0), 'FM999990.00'), '.', ',')
                 || COALESCE(E'\nMotivo: ' || NULLIF(btrim(NEW.cortesia_motivo), ''), '')
            ELSE E'\nA sessão volta para a cobrança.' END
    || E'\nPor: ' || v_quem.nome;
  INSERT INTO ju_avisos_grupo (texto, origem, destino)
  VALUES (v_txt, 'CORTESIA', '120363402677285308@g.us');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agendamento_cortesia_aviso ON public.agendamentos;
CREATE TRIGGER trg_agendamento_cortesia_aviso
  AFTER UPDATE OF status_pagamento_id ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_cortesia_aviso();

-- ---------- RPC da tela: marcar ou desfazer cortesia ----------
CREATE OR REPLACE FUNCTION public.fn_agendamento_cortesia(p_agendamento_id uuid, p_cortesia boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a agendamentos; v_st text; v_pg text; v_novo uuid;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Só admin ou secretaria pode marcar a sessão como cortesia.';
  END IF;
  SELECT * INTO a FROM agendamentos WHERE id = p_agendamento_id AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consulta não encontrada.'; END IF;
  SELECT codigo INTO v_st FROM consulta_status WHERE id = a.status_consulta_id;
  SELECT codigo INTO v_pg FROM pagamento_status WHERE id = a.status_pagamento_id;

  IF p_cortesia THEN
    IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Diga o motivo da cortesia.'; END IF;
    IF v_st IN ('cancelado', 'erro', 'reagendado') THEN
      RAISE EXCEPTION 'A consulta está %: cortesia é só para sessão que aconteceu.', v_st;
    END IF;
    IF a.fatura_id IS NOT NULL OR a.pagamento_link_id IS NOT NULL OR v_pg IN ('pago', 'cobranca_gerada', 'estornado') THEN
      RAISE EXCEPTION 'Esta sessão já foi cobrada ou paga. Cancele a cobrança antes de marcar cortesia.';
    END IF;
    SELECT id INTO v_novo FROM pagamento_status WHERE codigo = 'cortesia';
    UPDATE agendamentos SET cortesia_motivo = btrim(p_motivo), status_pagamento_id = v_novo,
           atualizado_por = (SELECT id FROM pessoas WHERE auth_user_id = auth.uid() LIMIT 1), updated_at = now()
     WHERE id = a.id;
  ELSE
    IF v_pg IS DISTINCT FROM 'cortesia' THEN RAISE EXCEPTION 'Esta sessão não está como cortesia.'; END IF;
    SELECT id INTO v_novo FROM pagamento_status
     WHERE codigo = CASE WHEN COALESCE(a.valor_servico, 0) = 0 THEN 'pago' ELSE 'pendente' END;
    UPDATE agendamentos SET status_pagamento_id = v_novo,
           atualizado_por = (SELECT id FROM pessoas WHERE auth_user_id = auth.uid() LIMIT 1), updated_at = now()
     WHERE id = a.id;
  END IF;
  RETURN (SELECT jsonb_build_object('id', x.id, 'status_pagamento', ps.codigo, 'cortesia_motivo', x.cortesia_motivo)
          FROM agendamentos x JOIN pagamento_status ps ON ps.id = x.status_pagamento_id WHERE x.id = a.id);
END $$;
REVOKE ALL ON FUNCTION public.fn_agendamento_cortesia(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_agendamento_cortesia(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_agendamento_sincronizar_pagamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_agendamento_cortesia_aviso() FROM PUBLIC, anon, authenticated;
