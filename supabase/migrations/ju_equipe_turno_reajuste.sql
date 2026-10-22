-- =====================================================================
-- Ju: achados da sombra real (21/10/2026)
-- =====================================================================
-- AI dev note:
-- 1. Número da equipe (admin, profissional, secretaria) não é atendido pela
--    Ju: a equipe usa o WhatsApp da clínica para falar com a Lolô (ex.: a Bia
--    perguntando "tá na clínica?", a Bruna avisando de agendamento errado).
--    Exceção: números da lista de teste (ju_config.numeros_teste), que valem
--    mesmo com modo_teste desligado.
-- 2. primeira_interacao só é verdadeira se a Ju nunca falou E a Lolô não falou
--    nas últimas 24 h (a Ju não se apresenta no meio da conversa da Lolô).
-- 3. Pedido feito para uma versão que já ficou para trás (a família mandou
--    outra mensagem enquanto a IA pensava) não é aberto: evita aviso duplicado
--    no grupo. Urgente passa sempre.
-- 4. Base: reajuste de 1º/11/2026 (Bruna e Flávia +R$ 20; Bia sem reajuste).
-- =====================================================================

CREATE FUNCTION public.fn_ju_numero_teste(p_telefone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT public.fn_ju_telefone(p_telefone) = ANY (k.numeros_teste)
                   FROM public.ju_config k WHERE k.id = 1), false);
$$;

CREATE FUNCTION public.fn_ju_eh_equipe(p_telefone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pessoas p
    JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
    WHERE p.ativo AND t.codigo IN ('admin', 'profissional', 'secretaria')
      AND p.telefone IS NOT NULL
      AND public.fn_ju_telefone(p.telefone::text) = public.fn_ju_telefone(p_telefone))
    AND NOT public.fn_ju_numero_teste(p_telefone);
$$;
REVOKE ALL ON FUNCTION public.fn_ju_numero_teste(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_eh_equipe(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_numero_teste(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_eh_equipe(text) TO service_role;

DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$WHEN NOT public.fn_ju_liberado(c.telefone) AND NOT public.fn_ju_sombra(c.telefone) THEN 'MODO_TESTE'$a$,
                  $b$WHEN public.fn_ju_eh_equipe(c.telefone) THEN 'EQUIPE'
    WHEN NOT public.fn_ju_liberado(c.telefone) AND NOT public.fn_ju_sombra(c.telefone) THEN 'MODO_TESTE'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: gate não encontrado'; END IF;
  d := n;
  n := replace(d, $a$'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU'),$a$,
                  $b$'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU')
                         AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens h WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                                           AND h.created_at > now() - interval '24 hours'),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: primeira_interacao não encontrada'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_chamar_secretaria'::regproc);
  n := replace(d, $a$    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;$a$,
                  $b$    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  END IF;
  -- a família escreveu de novo enquanto a IA pensava: o turno novo decide
  IF p_versao IS NOT NULL AND NOT coalesce(p_urgente, false) AND c.message_version > p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA');
  END IF;$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: trecho não encontrado'; END IF;
  EXECUTE n;
END
$do$;

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo)
SELECT 'REAJUSTE_NOV_2026', categoria,
  'Reajuste a partir de 01/11/2026: as sessões com as fisioterapeutas Bruna Cury e Flávia Pacheco ficam R$ 20,00 mais caras. As sessões com a Beatriz Perissê (Bia) continuam com os valores atuais. Para a Jeniffer Marjory e para outros serviços não há reajuste informado: não presuma. Vale a data do atendimento, não a data do pedido. Se a família perguntar o valor final de um caso específico, use a tabela de serviços; na dúvida, passe para a secretaria (FINANCEIRO).',
  true
FROM public.ju_conhecimento WHERE id = 'VALORES'
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, ativo = true, updated_at = now();
