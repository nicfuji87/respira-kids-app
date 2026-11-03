-- 03/11/2026: saídas feitas à mão no app do Inter (Pix e contas pagas) entram no financeiro
-- sozinhas, pela mesma regra das saídas do Asaas (fn_asaas_saida_registrar). Quem lê o extrato
-- é a edge inter-saidas (pg_cron a cada 30 min); o id fica 'inter:<idTransacao>' em asaas_saidas.
--
-- Diferenças do Inter:
--  * textos dizem "Inter" no lugar de "Asaas da BC";
--  * conta futura só casa até 10 dias à frente (no Asaas, 20): a 2ª conta de luz paga no mesmo dia
--    não pode baixar a do mês seguinte;
--  * boleto do fluxo de boletos pago à mão no app do Inter é marcado como pago na solicitação
--    (o aviso é o do boleto); o que o próprio app pagou pela API fica com o acompanhamento de sempre;
--  * Pix que quitou uma conta aberta avisa no grupo (no Asaas, Pix é sempre silencioso).

ALTER TABLE public.asaas_saidas ADD COLUMN IF NOT EXISTS banco text NOT NULL DEFAULT 'asaas';
ALTER TABLE public.asaas_saidas DROP CONSTRAINT IF EXISTS asaas_saidas_tratamento_check;
ALTER TABLE public.asaas_saidas ADD CONSTRAINT asaas_saidas_tratamento_check CHECK (tratamento = ANY (ARRAY[
  'boleto', 'ja_lancado', 'transferencia_interna', 'baixou', 'retirada', 'novo', 'segunda_conta']));

DO $m$
DECLARE
  d text := pg_get_functiondef('public.fn_asaas_saida_registrar(jsonb)'::regprocedure);
  trechos text[][] := ARRAY[
    -- declarações
    [$$  v_comp    date;$$,
     $$  v_comp    date;
  v_bco     text := coalesce(nullif(p ->> 'banco', ''), 'asaas');
  v_tag     text;
  v_onde    text;
  v_fut     int;
  v_irma    uuid;
  v_irma_d  text;$$],
    -- marca e textos por banco
    [$$  v_marca := jsonb_build_object('asaas_id', v_id, 'tipo', v_tipo, 'via', 'asaas_saida');$$,
     $$  v_marca := jsonb_build_object('asaas_id', v_id, 'tipo', v_tipo, 'via', 'asaas_saida', 'banco', v_bco);
  v_tag  := CASE WHEN v_bco = 'inter' THEN '[Inter]' ELSE '[Asaas]' END;
  v_onde := CASE WHEN v_bco = 'inter' THEN 'pelo Inter' ELSE 'pelo Asaas da BC' END;
  v_fut  := CASE WHEN v_bco = 'inter' THEN 10 ELSE 20 END;$$],
    [$$format('[Asaas] Pago pelo Asaas da BC em %s (%s %s).', to_char(v_data, 'DD/MM/YYYY'),$$,
     $$format('%s Pago %s em %s (%s %s).', v_tag, v_onde, to_char(v_data, 'DD/MM/YYYY'),$$],
    -- boleto do fluxo de boletos
    [$$      IF b.status = 'pago' OR b.asaas_bill_id = v_id THEN$$,
     $$      IF b.status = 'pago' OR b.asaas_bill_id = v_id
         OR (v_bco = 'inter' AND (b.status IN ('pagando', 'agendando', 'agendado') OR b.inter_pagamento_id IS NOT NULL)) THEN$$],
    [$$      ELSE
        UPDATE public.boleto_solicitacoes
        SET status = 'agendado', pagar_por = 'asaas',$$,
     $$      ELSIF v_bco = 'inter' THEN
        -- pago à mão no app do Inter: a solicitação vira paga por "outra conta" (o Inter) e o
        -- aviso é o do próprio boleto; a saída fica silenciosa ('boleto')
        UPDATE public.boleto_solicitacoes
        SET status = 'externo', pagar_por = 'outra_conta', conta_bancaria_id = v_conta,
            data_pagamento = v_data, valor_pagar = v_valor, erro = NULL
        WHERE id = b.id;
        PERFORM public.fn_boleto_confirmar_pagamento(b.id, true);
        v_trat := 'boleto';
        v_det := 'Boleto pago à mão no app do Inter (' || coalesce(b.descricao, '') || ').';
      ELSE
        UPDATE public.boleto_solicitacoes
        SET status = 'agendado', pagar_por = 'asaas',$$],
    -- janela de conta futura
    [$$BETWEEN v_data - 45 AND v_data + 20$$, $$BETWEEN v_data - 45 AND v_data + v_fut$$],
    [$$format('[Asaas] Cancelado: era a mesma conta de "%s", paga pelo Asaas em %s.', l.descricao,$$,
     $$format('%s Cancelado: era a mesma conta de "%s", paga %s em %s.', v_tag, l.descricao, v_onde,$$],
    [$$format('[Asaas] Cancelado: pago no mesmo DARF de "%s" em %s.', l.descricao,$$,
     $$format('%s Cancelado: pago no mesmo DARF de "%s" em %s.', v_tag, l.descricao,$$],
    [$$'Asaas BC ' || to_char(v_data, 'DD/MM/YYYY')$$,
     $$CASE WHEN v_bco = 'inter' THEN 'Inter ' ELSE 'Asaas BC ' END || to_char(v_data, 'DD/MM/YYYY')$$],
    -- já lançado sem parcela: Pix pago pelo app (link /#/pix da @ju) fica com pago = true e a conta
    -- em dados_ia.pagamento, sem contas_pagar; antes isso virava lançamento repetido
    [$$  IF v_trat IS NULL AND v_tipo = 'transferencia' THEN$$,
     $$  IF v_trat IS NULL THEN
    SELECT lf.id AS lancamento_id, lf.descricao INTO l
    FROM public.lancamentos_financeiros lf
    WHERE coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
      AND lf.dados_ia -> 'pagamento' ->> 'conta_bancaria_id' = v_conta::text
      AND abs(coalesce(lf.valor_total, 0) - v_valor) < 0.01
      AND abs(coalesce(CASE WHEN lf.dados_ia -> 'pagamento' ->> 'data' ~ '^\d{4}-\d{2}-\d{2}'
                            THEN left(lf.dados_ia -> 'pagamento' ->> 'data', 10)::date END,
                       lf.data_vencimento, lf.data_competencia) - v_data) <= 3
      AND NOT EXISTS (SELECT 1 FROM public.asaas_saidas s WHERE s.lancamento_id = lf.id)
    ORDER BY lf.created_at DESC LIMIT 1;
    IF FOUND THEN
      v_trat := 'ja_lancado';
      v_lanc := l.lancamento_id;
      v_det := l.descricao;
    END IF;
  END IF;

  IF v_trat IS NULL AND v_tipo = 'transferencia' THEN$$],
    -- 2ª unidade da mesma conta de consumo (ex.: duas contas de luz pagas no mesmo dia): a 1ª
    -- baixou a conta do mês; esta vira "(segunda conta)" do mesmo mês, com a categoria dela
    [$$    INSERT INTO public.lancamentos_financeiros ($$,
     $$    IF v_bco = 'inter' AND v_forn IS NOT NULL THEN
      SELECT lf.id, lf.descricao INTO v_irma, v_irma_d
      FROM public.asaas_saidas s JOIN public.lancamentos_financeiros lf ON lf.id = s.lancamento_id
      WHERE s.tratamento = 'baixou' AND s.data = v_data AND s.conta_bancaria_id = v_conta
        AND lf.fornecedor_id = v_forn AND lf.lancamento_recorrente_id IS NOT NULL
      ORDER BY s.created_at DESC LIMIT 1;
      IF v_irma IS NOT NULL THEN
        SELECT lf.categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios
          INTO v_base FROM public.lancamentos_financeiros lf WHERE lf.id = v_irma;
        SELECT lf.data_competencia INTO v_comp FROM public.lancamentos_financeiros lf WHERE lf.id = v_irma;
        v_desc_l := left(CASE WHEN v_irma_d ~ ' - \d{2}/\d{4}$'
                              THEN regexp_replace(v_irma_d, ' - (\d{2}/\d{4})$', ' (segunda conta) - \1')
                              ELSE v_irma_d || ' (segunda conta)' END, 200);
      END IF;
    END IF;
    INSERT INTO public.lancamentos_financeiros ($$],
    [$$    v_trat := 'novo';$$,
     $$    v_trat := CASE WHEN v_irma IS NOT NULL THEN 'segunda_conta' ELSE 'novo' END;$$],
    [$$INSERT INTO public.asaas_saidas (asaas_id, tipo,$$, $$INSERT INTO public.asaas_saidas (banco, asaas_id, tipo,$$],
    [$$VALUES (v_id, v_tipo, v_conta,$$, $$VALUES (v_bco, v_id, v_tipo, v_conta,$$]
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(trechos, 1) LOOP
    IF position(trechos[i][1] IN d) = 0 THEN
      RAISE EXCEPTION 'fn_asaas_saida_registrar: trecho % não encontrado: %', i, left(trechos[i][1], 80);
    END IF;
    d := replace(d, trechos[i][1], trechos[i][2]);
  END LOOP;
  EXECUTE d;
END $m$;

-- conta de luz paga pelo Pix do QR da fatura chega como "Neoenergia Brasilia"
INSERT INTO public.financeiro_favorecidos (padrao, fornecedor_id, tratamento, observacao)
SELECT 'neoenergia', 'ae1a9938-07ee-4f29-8c96-0ac74cc9e615', 'fornecedor', 'Conta de luz paga por Pix (QR da fatura)'
WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_favorecidos WHERE padrao = 'neoenergia');

-- Pix do Asaas continua silencioso; Pix do Inter que quitou conta aberta avisa
CREATE OR REPLACE FUNCTION public.fn_asaas_saidas_silenciar_boleto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.tratamento = 'boleto'
      OR (NEW.tipo = 'transferencia' AND NOT (NEW.banco = 'inter' AND NEW.tratamento IN ('baixou', 'segunda_conta'))))
     AND NEW.avisado_em IS NULL THEN
    NEW.avisado_em := now();
  END IF;
  RETURN NEW;
END $function$;

-- aviso no grupo sabe de qual banco veio
DO $m$
DECLARE
  d text := pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure);
  f text := $$'tipo', 'asaas_saida', 'id', sd.id,$$;
BEGIN
  IF position(f IN d) = 0 THEN
    RAISE EXCEPTION 'fn_pix_solicitacoes_para_avisar: trecho não encontrado';
  END IF;
  EXECUTE replace(d, f, $$'tipo', 'asaas_saida', 'banco', sd.banco, 'id', sd.id,$$);
END $m$;

-- leitura do extrato a cada 30 min, das 7h às 22h30 (Brasília)
SELECT cron.unschedule('inter-saidas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inter-saidas');
SELECT cron.schedule('inter-saidas', '*/30 0,1,10-23 * * *', $c$
  SELECT net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/inter-saidas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"dias": 3}'::jsonb,
    timeout_milliseconds := 120000);
$c$);
