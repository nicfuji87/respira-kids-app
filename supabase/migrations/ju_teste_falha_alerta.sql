-- =====================================================================
-- Ju: ensaio de contingência do alerta clínico (21/10/2026)
-- =====================================================================
-- AI dev note: com ju_config.teste_falha_alerta = true, o fluxo de Ações faz
-- o envio do texto de segurança (SAMU) falhar de propósito, mas SÓ para
-- números da lista de teste (fn_ju_numero_teste). Serve para ensaiar a rota
-- de falha: aviso "orientação NÃO confirmada" no grupo + a Ju reenviando o
-- texto pela resposta normal. Desligar logo depois do ensaio.
-- Ensaio feito em 21/10/2026: aviso no grupo em 10 s, texto à família em 21 s.
-- =====================================================================
ALTER TABLE public.ju_config ADD COLUMN teste_falha_alerta boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_ju_modo_conversa(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'sombra', coalesce(public.fn_ju_sombra(c.telefone), false),
    'sem_ia', c.sem_ia,
    'wa_chatid', c.wa_chatid,
    'etiqueta_sem_ia', (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1),
    'alerta_simulado', (SELECT k.sombra_alerta FROM public.ju_config k WHERE k.id = 1),
    'forcar_falha_alerta', coalesce((SELECT k.teste_falha_alerta FROM public.ju_config k WHERE k.id = 1), false)
                           AND public.fn_ju_numero_teste(c.telefone))
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;
