-- =====================================================================
-- Ju: para quem o contrato pendente foi enviado (22/10/2026)
-- =====================================================================
-- AI dev note: caso real (Laís, 22/10): a mãe dizia que o contrato "não chegou" e
-- a Ju só sabia sugerir o spam. O contrato tinha ido para um e-mail antigo dela.
-- Agora, com o contrato PENDENTE, fn_ju_contexto_cliente mostra em
-- contrato.enviado_para: nome do signatário, se o WhatsApp é o desta conversa,
-- os 4 últimos dígitos e o e-mail MASCARADO (3 letras + •••@domínio). Nunca o
-- e-mail inteiro. Fonte = variaveis_utilizadas.responsavelLegal* (a mesma que a
-- edge send-contract-webhook usa para a Assinafy). Só aparece com acesso_agenda.
-- Troca pontual no texto da função (falha se o trecho não existir).
-- Reverter: ju_contrato_destinatario_rollback.sql
-- =====================================================================
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  v_old text := $o$ja.tipo = 'REENVIO_CONTRATO' AND ja.alvo_id = uc.id AND ja.status = 'OK'))$o$;
  v_new text := $n$ja.tipo = 'REENVIO_CONTRATO' AND ja.alvo_id = uc.id AND ja.status = 'OK'),
                   'gerado_em', to_char(uc.data_geracao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
                   'enviado_para', CASE WHEN uc.status_contrato IS DISTINCT FROM 'assinado' THEN (
                     SELECT jsonb_build_object(
                              'nome', nullif(btrim(s.nome), ''),
                              'whatsapp_desta_conversa', CASE WHEN length(s.tel) >= 8 THEN
                                right(s.tel, 8) = right(regexp_replace((SELECT telefone FROM conv), '\D', '', 'g'), 8) END,
                              'whatsapp_final', CASE WHEN length(s.tel) >= 4 THEN right(s.tel, 4) END,
                              'email', CASE WHEN s.email LIKE '%_@_%' THEN
                                left(split_part(s.email, '@', 1), CASE WHEN length(split_part(s.email, '@', 1)) > 4 THEN 3 ELSE 1 END)
                                || '•••@' || split_part(s.email, '@', 2) END)
                     FROM (SELECT coalesce(uc.variaveis_utilizadas ->> 'responsavelLegalNome', uc.variaveis_utilizadas ->> 'contratante') AS nome,
                                  regexp_replace(coalesce(uc.variaveis_utilizadas ->> 'responsavelLegalTelefone', ''), '\D', '', 'g') AS tel,
                                  lower(btrim(coalesce(uc.variaveis_utilizadas ->> 'responsavelLegalEmail', ''))) AS email) s) END)$n$;
BEGIN
  IF position(v_old IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho do contrato não encontrado';
  END IF;
  EXECUTE replace(d, v_old, v_new);
END
$mig$;
