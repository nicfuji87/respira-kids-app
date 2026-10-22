-- AI dev note: Etiquetas do WhatsApp da recepção (uazapi) aplicadas pela análise
-- conversacional do n8n ([RK] Analise Conversacional, editori NHaGytlvhVuGDd0t).
-- Os 5 booleanos novos são preenchidos pela IA; a etiqueta sai deles por regra
-- no nó "Etiquetas" do fluxo (a IA nunca escolhe o id da etiqueta).
-- etiquetas_aplicadas guarda os ids que o fluxo deixou no chat, para auditoria.
-- whatsapp_jid é o identificador do contato no Chatwoot (o telefone mistura 12 e 13 dígitos).

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS encaixe_urgente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagamento_a_conferir boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobranca_contestada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota_fiscal_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documento_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_jid text,
  ADD COLUMN IF NOT EXISTS etiquetas_aplicadas text[],
  ADD COLUMN IF NOT EXISTS etiquetas_aplicadas_em timestamptz;

COMMENT ON COLUMN public.whatsapp_conversas.encaixe_urgente IS
  'IA: sintoma agudo e pedido de atendimento para hoje/amanhã ainda sem horário marcado.';
COMMENT ON COLUMN public.whatsapp_conversas.pagamento_a_conferir IS
  'IA: cliente diz que já pagou (comprovante, dinheiro, Pix direto) e a cobrança segue aberta.';
COMMENT ON COLUMN public.whatsapp_conversas.cobranca_contestada IS
  'IA: questiona valor, duplicidade ou cobrança indevida, ou pede parcelamento/desconto, sem resposta final.';
COMMENT ON COLUMN public.whatsapp_conversas.nota_fiscal_pendente IS
  'IA: pediu NF/segunda via ou houve erro de emissão, e a nota ainda não foi entregue.';
COMMENT ON COLUMN public.whatsapp_conversas.documento_pendente IS
  'IA: pediu relatório, atestado ou declaração e ainda não recebeu.';
COMMENT ON COLUMN public.whatsapp_conversas.etiquetas_aplicadas IS
  'Ids das etiquetas uazapi geridas pelo fluxo que ficaram no chat na última análise.';
