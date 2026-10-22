-- Follow-up: erro técnico da IA (ex.: 429 da OpenAI) não vira classificação.
-- AI dev note (21/10/2026): na 1ª rodada real, 5 de 11 análises bateram no limite
-- de requisições da conta (a mesma da Ju) e ficaram como INCERTA. Seguro (não
-- envia), mas perde a análise. Agora: sem resultado = fica pendente (ia_em NULL,
-- decisão AGUARDANDO_IA, não envia) e a repescagem das 9h45 tenta de novo.
-- Resposta inválida (veio, mas fora do contrato) continua virando INCERTA.
CREATE OR REPLACE FUNCTION public.fn_followup_ia_registrar(p_avaliacao_id bigint, p_resultado jsonb, p_modelo text, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cls text := upper(coalesce(p_resultado ->> 'classificacao', ''));
BEGIN
  IF p_resultado IS NULL THEN
    UPDATE public.followup_avaliacoes
       SET ia_erro = left(coalesce(p_erro, 'sem_resultado'), 300), ia_modelo = p_modelo
     WHERE id = p_avaliacao_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'AVALIACAO_INEXISTENTE'); END IF;
    RETURN public.fn_followup_decidir(p_avaliacao_id);  -- AGUARDANDO_IA
  END IF;
  IF v_cls NOT IN ('CANDIDATA','NAO_ELEGIVEL','BLOQUEADA','AGUARDANDO_CLINICA','RETORNO_COMBINADO',
                   'PENDENCIA_OPERACIONAL','CEDO','INCERTA') THEN
    v_cls := NULL;  -- resposta fora do contrato = INCERTA (não envia)
  END IF;
  UPDATE public.followup_avaliacoes
     SET ia_classificacao = coalesce(v_cls, 'INCERTA'), ia_resultado = p_resultado, ia_modelo = p_modelo,
         ia_em = now(), ia_erro = coalesce(p_erro, CASE WHEN v_cls IS NULL THEN 'resposta_invalida' END)
   WHERE id = p_avaliacao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'AVALIACAO_INEXISTENTE'); END IF;
  RETURN public.fn_followup_decidir(p_avaliacao_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_followup_ia_registrar(bigint, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_followup_ia_registrar(bigint, jsonb, text, text) TO service_role;

-- Repescagem seg-sex 9h45 (12h45 UTC): só manda o que ainda está sem análise.
SELECT cron.unschedule('followup-ia-repescagem') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup-ia-repescagem');
SELECT cron.schedule('followup-ia-repescagem', '45 12 * * 1-5', $$SELECT public.fn_followup_ia_disparar()$$);
