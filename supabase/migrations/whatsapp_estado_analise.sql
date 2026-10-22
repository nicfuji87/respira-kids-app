-- AI dev note: Usada pelo n8n "[RK] Analise Conversacional" (nó Supabase1) no lugar da
-- fn_whatsapp_precisa_processar. Além de dizer se o conteúdo mudou (hash), devolve a
-- ultima_mensagem_em da análise anterior: o fluxo compara com as mensagens novas e, quando
-- só chegou mensagem automática do sistema (cobrança, NF, lembrete, loja, botão de
-- confirmar), atualiza as métricas por regra sem chamar a IA. Fatura, loja e aviso de
-- cancelamento só pulam a IA se a conversa não estava pendente com a equipe (status_conversa),
-- porque a secretária dispara essas mensagens às vezes em resposta ao cliente.
-- Só a service_role executa (a antiga ficou executável pelo anon).

CREATE OR REPLACE FUNCTION public.fn_whatsapp_estado_analise(p_conversa_id text, p_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'precisa', w.id IS NULL OR w.hash_conteudo IS DISTINCT FROM p_hash,
    'ja_analisada', w.id IS NOT NULL AND w.resumo IS NOT NULL,
    'ultima_mensagem_em', w.ultima_mensagem_em,
    'status_conversa', w.status_conversa
  )
  FROM (SELECT 1) AS um
  LEFT JOIN public.whatsapp_conversas w ON w.chatwoot_conversa_id = p_conversa_id;
$$;

REVOKE ALL ON FUNCTION public.fn_whatsapp_estado_analise(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_whatsapp_estado_analise(text, text) TO service_role;
