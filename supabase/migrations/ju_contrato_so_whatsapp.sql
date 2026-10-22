-- Ju: o contrato chega SÓ pelo WhatsApp da Assinafy (22/10/2026).
-- AI dev note: o fluxo n8n "[RK] Webhook Contrato" cria o assignment com
-- notification_methods ["Whatsapp"]; nas execuções não há envio por e-mail.
-- O "e também por e-mail" (acréscimo de 21/10) mandava a família procurar no
-- lugar errado. Se um dia o fluxo passar a mandar e-mail, volte a mencionar.
UPDATE public.ju_conhecimento
   SET texto = replace(texto, ' e também por e-mail.', '.'), updated_at = now()
 WHERE id = 'CONTRATO_ASSINATURA';
UPDATE public.ju_conhecimento
   SET texto = replace(texto, ', e também por e-mail.', '.'), updated_at = now()
 WHERE id = 'PRE_CADASTRO';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ju_conhecimento WHERE id IN ('CONTRATO_ASSINATURA', 'PRE_CADASTRO') AND texto ILIKE '%por e-mail%') THEN
    RAISE EXCEPTION 'ainda menciona e-mail';
  END IF;
END $$;
