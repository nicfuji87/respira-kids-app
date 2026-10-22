-- =====================================================================
-- Ju: simulação do resultado do alerta no modo sombra (21/10/2026)
-- =====================================================================
-- AI dev note: ju_config.sombra_alerta (ENVIADO | FALHOU | DESCONHECIDO) decide
-- o que o fluxo de Ações devolve para a Ju quando simula o alerta_clinico em
-- sombra; serve para testar a contingência. Voltar para ENVIADO depois do
-- teste. ju_sombra.destino registra para onde a mensagem iria
-- (familia | grupo | nada), com a mesma regra do caminho real.
-- =====================================================================
ALTER TABLE public.ju_config ADD COLUMN sombra_alerta text NOT NULL DEFAULT 'ENVIADO'
  CHECK (sombra_alerta IN ('ENVIADO','FALHOU','DESCONHECIDO'));
ALTER TABLE public.ju_sombra ADD COLUMN destino text;

CREATE OR REPLACE FUNCTION public.fn_ju_modo_conversa(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'sombra', coalesce(public.fn_ju_sombra(c.telefone), false),
    'alerta_simulado', (SELECT k.sombra_alerta FROM public.ju_config k WHERE k.id = 1))
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;
