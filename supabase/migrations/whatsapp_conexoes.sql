-- Configurações > Integrações > WhatsApp: status e QR das duas conexões do número
-- da recepção (uazapi e o QuePasa que alimenta o Chatwoot).
--
-- Os tokens ficam no Vault e só a edge function `whatsapp-conexoes` (service_role)
-- os lê. O front nunca recebe token. Para trocar um token:
--   SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = '<nome>'), '<novo>');
--
-- Segredos usados (criados à mão, fora deste arquivo, para não versionar o valor):
--   whatsapp_uazapi_token   token da instância uazapi `respirakids`
--   whatsapp_quepasa_token  token do servidor QuePasa ligado à caixa 39 do Chatwoot
--   whatsapp_quepasa_user   usuário do QuePasa dono do servidor (header X-QUEPASA-USER do /scan)

CREATE OR REPLACE FUNCTION public.fn_whatsapp_conexoes_credenciais()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  FROM vault.decrypted_secrets
  WHERE name IN ('whatsapp_uazapi_token', 'whatsapp_quepasa_token', 'whatsapp_quepasa_user');
$$;

REVOKE ALL ON FUNCTION public.fn_whatsapp_conexoes_credenciais() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_whatsapp_conexoes_credenciais() TO service_role;
