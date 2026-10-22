-- =====================================================================
-- Ju: pausa maior no expediente + áudio da Lolô transcrito (20/10/2026)
-- =====================================================================
-- AI dev note:
-- 1. Quando a Lolô escreve na conversa, a Ju sai por 2 h no expediente
--    (seg-sex 8h-19h) e por 15 min fora dele. Com 15 min a Ju "voltava" no meio
--    de negociações de horário que a Lolô estava conduzindo (visto no modo
--    sombra, 20/10: cliente respondeu "Tudo bem!" e a Ju se apresentou).
-- 2. Áudio da Lolô também é transcrito (só para o histórico da Ju; a Entrada não
--    manda essa transcrição para a família nem chama a Ju por causa dele).
-- 3. Base: equipe com os nomes de uso; contrato: dúvida vai para a secretaria.
-- =====================================================================

CREATE FUNCTION public.fn_ju_pausa_humano()
RETURNS interval
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
               AND (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
               AND (now() AT TIME ZONE 'America/Sao_Paulo')::time <  time '19:00'
              THEN interval '2 hours' ELSE interval '15 minutes' END;
$$;

DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$ELSE now() + interval '15 minutes' END,$a$,
                  $b$ELSE now() + public.fn_ju_pausa_humano() END,$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: pausa não encontrada'; END IF;
  d := n;
  n := replace(d, $a$RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id);$a$,
                  $b$RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id, 'midia', v_tipo = 'AUDIO');$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: retorno HUMANO não encontrado'; END IF;
  EXECUTE n;
END
$do$;

UPDATE public.ju_conhecimento SET texto =
  'A secretaria da Respira Kids é a Lolô. As fisioterapeutas são Bruna Cury, Flávia Pacheco, Beatriz Perissê e Jeniffer Marjory. A Ju pode dizer quem faz parte da equipe, mas não promete qual profissional vai atender nem disponibilidade de horário: isso é definido pela secretaria no agendamento.',
  updated_at = now()
WHERE id = 'EQUIPE';

UPDATE public.ju_conhecimento SET texto =
  'Por que assinar o contrato: ele existe para a segurança das duas partes. Deixa claro o que a clínica oferece e as regras de pagamento, faltas, cancelamento e remarcação, e a assinatura é necessária para seguir com os atendimentos. A Ju pode explicar isso em poucas palavras, sem pressionar. Qualquer dúvida sobre o conteúdo do contrato (cláusula, valor, multa, prazo) ou recusa em assinar vai para a secretaria (CONTRATO).',
  updated_at = now()
WHERE id = 'CONTRATO_POR_QUE';
