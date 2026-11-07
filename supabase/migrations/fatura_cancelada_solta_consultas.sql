-- =====================================================================================
-- Cobrança cancelada devolve as consultas para "pendente" (07/11/2026, pedido do dono)
--
-- Antes: quando o Asaas excluía/cancelava a cobrança, a conciliação diária
-- (fn_asaas_reconciliar_aplicar) marcava a fatura "cancelado" mas, por regra, NÃO mexia nas
-- consultas: elas ficavam em "cobrança gerada" apontando para uma fatura morta e nunca mais
-- entravam num lote. O mesmo valia para link cancelado por caminho que não o botão da tela.
--
-- Agora, por qualquer caminho (tela, Asaas, conciliação):
--   * fatura vira "cancelado" ou é desativada  => consultas em aberto dela voltam a "pendente"
--     (sem fatura, sem link) e o link de pré-cobrança ligado a ela é cancelado;
--   * link de pré-cobrança vira "cancelado" (sem fatura viva) => consultas reservadas nele
--     voltam a "pendente".
-- NÃO solta: link vencido ("expirado") é inadimplência e segue na régua de lembretes
-- (decisão do dono); fatura estornada; consulta paga, cortesia, cancelada ou estornada.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_soltar_consultas_cobranca(p_fatura_id uuid, p_link_id uuid, p_id_asaas text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pendente uuid; n int;
BEGIN
  SELECT id INTO v_pendente FROM pagamento_status WHERE codigo = 'pendente';
  UPDATE agendamentos a
     SET status_pagamento_id = v_pendente,
         fatura_id = CASE WHEN a.fatura_id = p_fatura_id THEN NULL ELSE a.fatura_id END,
         pagamento_link_id = NULL,
         cobranca_gerada_em = NULL,
         cobranca_gerada_por = NULL,
         id_pagamento_externo = CASE WHEN p_id_asaas IS NOT NULL AND a.id_pagamento_externo = p_id_asaas THEN NULL ELSE a.id_pagamento_externo END,
         updated_at = now()
   WHERE a.ativo
     AND ((p_fatura_id IS NOT NULL AND a.fatura_id = p_fatura_id)
       OR (p_link_id IS NOT NULL AND a.pagamento_link_id = p_link_id AND a.fatura_id IS NULL))
     AND a.status_pagamento_id IN (SELECT id FROM pagamento_status WHERE codigo IN ('cobranca_gerada', 'atrasado', 'pendente'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fatura_cancelada_solta_consultas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
     OR (OLD.ativo AND NOT NEW.ativo AND NEW.status IS DISTINCT FROM 'pago') THEN
    PERFORM public.fn_soltar_consultas_cobranca(NEW.id, NULL, NEW.id_asaas);
    UPDATE pagamento_links
       SET status = 'cancelado', ativo = false, atualizado_em = now()
     WHERE fatura_id = NEW.id AND status IN ('confirmado', 'pendente');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- nunca derruba a conciliação nem o webhook do Asaas
  RAISE WARNING 'trg_fatura_cancelada_solta_consultas %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fatura_cancelada_solta_consultas ON public.faturas;
CREATE TRIGGER trg_fatura_cancelada_solta_consultas
  AFTER UPDATE OF status, ativo ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_fatura_cancelada_solta_consultas();

CREATE OR REPLACE FUNCTION public.trg_link_cancelado_solta_consultas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado'
     AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.id = NEW.fatura_id AND f.ativo AND f.status <> 'cancelado') THEN
    PERFORM public.fn_soltar_consultas_cobranca(NULL, NEW.id, NULL);
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'trg_link_cancelado_solta_consultas %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_cancelado_solta_consultas ON public.pagamento_links;
CREATE TRIGGER trg_link_cancelado_solta_consultas
  AFTER UPDATE OF status ON public.pagamento_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_link_cancelado_solta_consultas();

REVOKE ALL ON FUNCTION public.fn_soltar_consultas_cobranca(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_fatura_cancelada_solta_consultas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_link_cancelado_solta_consultas() FROM PUBLIC, anon, authenticated;
