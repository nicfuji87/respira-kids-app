-- Link de pagamento substituído: quando a recepção gera um link novo, o antigo é
-- cancelado (ativo=false). A família que toca na mensagem antiga caía em
-- "Este link não está mais disponível" (visto em 27/11/2026).
-- Esta função devolve o token do link que o substituiu, para a página pública
-- redirecionar. Substituto = o ÚNICO link ativo da mesma família (responsável,
-- paciente e empresa) criado depois do antigo. Com 0 ou 2+ candidatos devolve
-- NULL e a página mantém o aviso: melhor não redirecionar do que mandar a
-- família para a cobrança errada. Quem tem o token antigo já tinha acesso à
-- cobrança dessa família, então revelar o novo token não abre nada a mais.
-- Aplicada em produção em 27/11/2026.
CREATE OR REPLACE FUNCTION public.get_pagamento_link_substituto(p_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antigo public.pagamento_links%ROWTYPE;
  v_tokens text[];
BEGIN
  SELECT * INTO v_antigo FROM public.pagamento_links WHERE token = p_token;

  -- Só link realmente substituído (cancelado/inativo). Link ativo expirado ou
  -- pago segue o fluxo normal da página.
  IF NOT FOUND OR (v_antigo.ativo AND v_antigo.status <> 'cancelado') THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(n.token ORDER BY n.criado_em DESC) INTO v_tokens
  FROM public.pagamento_links n
  WHERE n.ativo = true
    AND n.id <> v_antigo.id
    AND n.status NOT IN ('cancelado', 'expirado')
    AND (n.expira_em IS NULL OR n.expira_em > now())
    AND n.criado_em > v_antigo.criado_em
    AND n.responsavel_cobranca_id = v_antigo.responsavel_cobranca_id
    AND n.paciente_id IS NOT DISTINCT FROM v_antigo.paciente_id
    AND n.empresa_id IS NOT DISTINCT FROM v_antigo.empresa_id;

  IF coalesce(array_length(v_tokens, 1), 0) <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_tokens[1];
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pagamento_link_substituto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pagamento_link_substituto(text) TO anon, authenticated, service_role;
