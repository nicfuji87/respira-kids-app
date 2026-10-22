-- Ju: ao mandar o link de pré-cadastro, avisar que o contrato chega pela Assinafy.
-- AI dev note (21/10/2026, pedido do dono): o contrato é enviado logo depois do
-- cadastro, por WhatsApp de um número da Assinafy (não é o da clínica) e por
-- e-mail. Sem o aviso a família estranha a mensagem de um número desconhecido.
UPDATE public.ju_conhecimento
   SET texto = 'Para quem ainda não é paciente da Respira Kids e quer agendar, a Ju pode enviar o link de pré-cadastro: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente . Com o cadastro preenchido, a secretaria conclui o agendamento mais rápido. O pré-cadastro não garante horário. Logo depois de enviar o cadastro, a família recebe o contrato de prestação de serviços para assinar: ele chega por WhatsApp, enviado pela Assinafy (a plataforma de assinatura digital, de um número próprio dela, não o da Respira Kids), e também por e-mail. Sempre que mandar o link de cadastro, a Ju avisa isso em uma frase curta, para a família não estranhar a mensagem de um número desconhecido.',
       updated_at = now()
 WHERE id = 'PRE_CADASTRO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ju_conhecimento WHERE id = 'PRE_CADASTRO' AND texto ILIKE '%Assinafy%') THEN
    RAISE EXCEPTION 'PRE_CADASTRO não atualizado';
  END IF;
END $$;
