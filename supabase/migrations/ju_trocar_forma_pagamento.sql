-- AI dev note: 07/11/2026 (pedido do dono). A família escolheu a forma errada na pré-cobrança (ex.: Pix e queria
-- cartão, ou o número de parcelas) e pede outra fatura. A Ju faz o mesmo que o botão "refazer cobrança" do app,
-- no servidor: cancela a cobrança do Asaas (o PARCELAMENTO inteiro quando é parcelado) e reabre o MESMO link de
-- pré-cobrança (mesmo token, mesmos valores congelados) para a família escolher de novo.
-- - fn_ju_trocar_forma_preparar: gate do turno, escopo (criança com acesso_financeiro), link confirmado com
--   fatura não paga; registra ju_acoes TROCAR_FORMA.
-- - edge ju-acao (case TROCAR_FORMA_PAGAMENTO): confere no Asaas que não foi paga e cancela.
-- - fn_ju_trocar_forma_concluir: solta a fatura (ativo=false), devolve as consultas ao link e reabre o link.
-- - fn_ju_contexto_cliente: cobrancas_em_aberto ganha etapa (escolher_forma | fatura_gerada), forma e fatura_id,
--   para a Ju explicar a pré-cobrança e saber quando dá para trocar.

ALTER TABLE public.ju_acoes DROP CONSTRAINT IF EXISTS ju_acoes_tipo_check;
ALTER TABLE public.ju_acoes ADD CONSTRAINT ju_acoes_tipo_check CHECK (tipo = ANY (ARRAY['REENVIO_CONTRATO', 'NF_EMITIR', 'RENOVAR_LINK',
  'ATESTADO', 'CORRIGIR_CONTATO_CONTRATO', 'CANCELAR_CONSULTA', 'SUSPENDER_COBRANCA', 'AGENDAR_LINK', 'ADIAR_FIXO', 'TROCAR_FORMA']));

CREATE OR REPLACE FUNCTION public.fn_ju_trocar_forma_preparar(p_conversa_id bigint, p_versao bigint, p_pagamento_link_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_gate text := fn_ju_gate(p_conversa_id, p_versao);
  pl pagamento_links; f faturas; v_acao bigint;
BEGIN
  IF v_gate IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', v_gate); END IF;
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) p,
                     jsonb_array_elements(coalesce(p -> 'cobrancas_em_aberto', '[]'::jsonb)) c
        WHERE (p ->> 'acesso_financeiro')::boolean AND (c ->> 'pagamento_link_id')::uuid = p_pagamento_link_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'LINK_FORA_DO_ESCOPO');
  END IF;
  SELECT * INTO pl FROM pagamento_links WHERE id = p_pagamento_link_id FOR UPDATE;
  IF pl.fatura_id IS NULL OR pl.status = 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AINDA_SEM_FATURA');
  END IF;
  SELECT * INTO f FROM faturas WHERE id = pl.fatura_id FOR UPDATE;
  IF f.id IS NULL OR NOT f.ativo THEN RETURN jsonb_build_object('ok', false, 'motivo', 'FATURA_INEXISTENTE'); END IF;
  IF f.status = 'pago' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'JA_PAGA'); END IF;
  IF f.status NOT IN ('pendente', 'atrasado') OR f.id_asaas IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'FATURA_NAO_TROCAVEL');
  END IF;
  IF (SELECT count(*) FROM ju_acoes a WHERE a.tipo = 'TROCAR_FORMA' AND a.alvo_id = pl.id
        AND a.created_at > now() - interval '1 day' AND a.status = 'OK') >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'LIMITE_TROCAS');
  END IF;
  INSERT INTO ju_acoes (conversa_id, versao, tipo, alvo_id, status)
  VALUES (p_conversa_id, p_versao, 'TROCAR_FORMA', pl.id, 'SOLICITADA')
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING
  RETURNING id INTO v_acao;
  IF v_acao IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'JA_SOLICITADO'); END IF;
  RETURN jsonb_build_object('ok', true, 'acao_id', v_acao, 'fatura_id', f.id, 'id_asaas', f.id_asaas,
    'installment', f.dados_asaas ->> 'installment', 'empresa_id', f.empresa_id,
    'forma', CASE f.dados_asaas ->> 'forma_pagamento' WHEN 'credit_card' THEN 'cartão em ' || coalesce(f.dados_asaas ->> 'parcelas', '1') || 'x'
                                                       WHEN 'pix' THEN 'Pix' ELSE coalesce(f.dados_asaas ->> 'forma_pagamento', '') END);
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_trocar_forma_preparar(bigint, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_trocar_forma_preparar(bigint, bigint, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ju_trocar_forma_concluir(p_acao_id bigint, p_ok boolean, p_detalhe text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE a ju_acoes; pl pagamento_links; v_fatura uuid; v_status uuid; v_ags uuid[];
BEGIN
  SELECT * INTO a FROM ju_acoes WHERE id = p_acao_id FOR UPDATE;
  IF a.id IS NULL OR a.status <> 'SOLICITADA' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ACAO_INVALIDA'); END IF;
  IF NOT p_ok THEN
    UPDATE ju_acoes SET status = 'FALHOU', detalhe = left(p_detalhe, 500), updated_at = now() WHERE id = a.id;
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT * INTO pl FROM pagamento_links WHERE id = a.alvo_id FOR UPDATE;
  v_fatura := pl.fatura_id;
  SELECT id INTO v_status FROM pagamento_status WHERE codigo = 'cobranca_gerada';

  -- Ordem importa: trg_fatura_cancelada_solta_consultas solta as consultas e cancela o link que ainda aponta
  -- para a fatura. Então: guarda as consultas, reabre o link (sem fatura), desativa a fatura e religa as consultas.
  SELECT array_agg(id) INTO v_ags FROM agendamentos WHERE fatura_id = v_fatura AND ativo;
  UPDATE pagamento_links SET status = 'pendente', ativo = true, fatura_id = NULL, id_asaas = NULL, forma_escolhida = NULL,
         installment_count = NULL, expira_em = greatest(coalesce(expira_em, now()), now() + interval '5 days'),
         vencimento = greatest(vencimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1),
         atualizado_em = now()
   WHERE id = pl.id;
  UPDATE faturas SET ativo = false,
         observacoes = 'Cancelada pela Ju em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                       || ' a pedido da família, para trocar a forma de pagamento. ' || coalesce(observacoes, '')
   WHERE id = v_fatura;
  UPDATE agendamentos SET fatura_id = NULL, id_pagamento_externo = NULL, pagamento_link_id = pl.id,
         status_pagamento_id = coalesce(v_status, status_pagamento_id)
   WHERE id = ANY (coalesce(v_ags, '{}'));
  UPDATE ju_acoes SET status = 'OK', detalhe = left(p_detalhe, 500), updated_at = now() WHERE id = a.id;
  PERFORM fn_nfe_aviso_notificacoes('💳 *Forma de pagamento trocada pela Ju*' || E'\n'
    || coalesce((SELECT nullif(btrim(nome_whatsapp), '') FROM ju_conversas WHERE id = a.conversa_id), 'Contato') || E'\n'
    || 'A família pediu para trocar a forma (' || coalesce(nullif(p_detalhe, ''), 'cobrança anterior') || '). '
    || 'A cobrança do Asaas foi cancelada e o mesmo link de pré-cobrança foi reaberto (R$ ' || to_char(pl.valor_base, 'FM999G990D00') || ').');
  RETURN jsonb_build_object('ok', true,
    'link', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || pl.token,
    'valor', pl.valor_base);
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_trocar_forma_concluir(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_trocar_forma_concluir(bigint, boolean, text) TO service_role;

-- Contexto: etapa e forma de cada cobrança em aberto
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%escolher_forma%' THEN RETURN; END IF;
  n := replace(d, $a$'situacao', cp.situacao, 'em_conferencia_financeiro', coalesce(cp.em_analise, false),$a$,
    $a$'situacao', cp.situacao, 'em_conferencia_financeiro', coalesce(cp.em_analise, false),
                   'etapa', CASE WHEN cp.origem = 'pre_cobranca' THEN 'escolher_forma' ELSE 'fatura_gerada' END,
                   'fatura_id', cp.fatura_id,
                   'forma', (SELECT CASE fx.dados_asaas ->> 'forma_pagamento'
                                      WHEN 'credit_card' THEN 'cartão em ' || coalesce(fx.dados_asaas ->> 'parcelas', '1') || 'x'
                                      WHEN 'pix' THEN 'Pix' ELSE fx.dados_asaas ->> 'forma_pagamento' END
                               FROM public.faturas fx WHERE fx.id = cp.fatura_id),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;
