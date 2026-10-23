-- Saída que é um boleto já acompanhado pelo fluxo de boletos: o aviso de "pago" sai por lá.
CREATE OR REPLACE FUNCTION public.fn_asaas_saidas_silenciar_boleto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tratamento = 'boleto' AND NEW.avisado_em IS NULL THEN
    NEW.avisado_em := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_asaas_saidas_silenciar_boleto ON public.asaas_saidas;
CREATE TRIGGER trg_asaas_saidas_silenciar_boleto
  BEFORE INSERT ON public.asaas_saidas
  FOR EACH ROW EXECUTE FUNCTION public.fn_asaas_saidas_silenciar_boleto();
