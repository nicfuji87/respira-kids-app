-- Follow-up: contato novo entra mesmo antes da análise noturna das conversas (26/10/2026).
-- O motor só olhava oportunidades com intencao = 'contratar', que depende do processamento noturno de
-- whatsapp_conversas. Um lead que chega de manhã fica 'nao_analisada' o dia todo e o FU1 (1 h depois)
-- nunca acontecia. Agora contato novo ainda não analisado também é avaliado; as regras do motor e a IA
-- continuam decidindo se ele é candidato (quem só perguntou valor ou convênio segue fora, como decidido).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_avaliar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%nao_analisada%' THEN RETURN; END IF;
  n := replace(d, $a$WHERE o.estado = 'aberta' AND o.intencao = 'contratar'$a$,
                  $a$WHERE o.estado = 'aberta'
       AND (o.intencao = 'contratar' OR (o.intencao = 'nao_analisada' AND x.contato_novo))$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_avaliar: filtro de intenção não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
