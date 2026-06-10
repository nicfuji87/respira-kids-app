-- ============================================
-- MIGRATION: Remover constraint UNIQUE indevida sobre faturas.link_nfe
-- Data: 2026-06-10
-- Descrição:
--   A constraint faturas_numero_interno_key estava (erroneamente) definida como
--   UNIQUE sobre a coluna link_nfe — provável herança de uma coluna "numero_interno"
--   renomeada para link_nfe sem ajustar a constraint.
--
--   Efeito do bug: como o índice é UNIQUE, apenas UMA fatura no sistema inteiro
--   podia ter cada valor sentinela de link_nfe (ex: 'erro', 'sincronizando').
--   Quando o webhook do ASAAS (ASAAS -> n8n -> Supabase REST) tentava marcar uma
--   segunda fatura como 'erro', o Postgres rejeitava com:
--     409 / 23505 - duplicate key value violates unique constraint
--                   "faturas_numero_interno_key" Key (link_nfe)=(erro) already exists
--   O update falhava silenciosamente e a fatura ficava presa com link_nfe = null,
--   deixando o botão preso em "Emitir NFe"/"Gerar fatura".
--   (NULL é isento de UNIQUE no Postgres, por isso múltiplas faturas sem NFe coexistiam.)
--
--   link_nfe NÃO deve ser único: várias faturas podem estar simultaneamente em
--   'erro', 'sincronizando', ou compartilhar qualquer valor. As URLs reais de NFe
--   já são naturalmente distintas, não há necessidade de constraint.
-- ============================================

ALTER TABLE public.faturas
  DROP CONSTRAINT IF EXISTS faturas_numero_interno_key;
