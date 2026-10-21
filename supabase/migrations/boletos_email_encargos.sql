-- Boleto vencido: o Inter recusa o valor original e informa o mínimo com multa e juros
-- ("Pagamento mínimo aceito: R$ 1552.49", condomínio sala 310, 21/10/2026). O app lê esse
-- valor do erro e oferece pagar com encargos; o servidor só aceita valor maior que o do
-- boleto se ele estiver vencido e no máximo 10% acima (multa 2% + juros de alguns meses).
-- A diferença vai como juros na parcela; o lançamento continua com o valor do boleto.

ALTER TABLE public.boleto_solicitacoes ADD COLUMN IF NOT EXISTS valor_pagar numeric;

DROP FUNCTION IF EXISTS public.fn_boleto_solicitacao_iniciar(uuid);
CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_iniciar(p_id uuid, p_valor_pagar numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  b        record;
  s        record;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  IF p_valor_pagar IS NOT NULL THEN
    SELECT * INTO b FROM public.boleto_solicitacoes WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Boleto não encontrado');
    END IF;
    IF abs(p_valor_pagar - b.valor) >= 0.01 AND b.vencimento >= v_hoje THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Boleto no prazo: paga-se o valor do boleto.');
    END IF;
    IF p_valor_pagar < b.valor OR p_valor_pagar > round(b.valor * 1.10, 2) THEN
      RETURN jsonb_build_object('ok', false, 'erro',
        format('Valor fora do aceitável para este boleto (de R$ %s até R$ %s).',
               to_char(b.valor, 'FM999G990D00'), to_char(round(b.valor * 1.10, 2), 'FM999G990D00')));
    END IF;
  END IF;

  UPDATE public.boleto_solicitacoes
  SET status = 'pagando', iniciado_em = now(), aprovado_por = v_pessoa, erro = NULL,
      data_pagamento = greatest(vencimento, v_hoje),
      valor_pagar = round(coalesce(p_valor_pagar, valor), 2)
  WHERE id = p_id
    AND status IN ('aguardando', 'erro')
    AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp
                    WHERE cp.lancamento_id = boleto_solicitacoes.lancamento_id AND cp.status_pagamento = 'pago')
    AND NOT EXISTS (SELECT 1 FROM public.inter_pagamentos ip
                    WHERE regexp_replace(coalesce(ip.codigo_barras, ''), '[^0-9]', '', 'g') = boleto_solicitacoes.linha_digitavel
                      AND ip.status IN ('sucesso', 'enviando'))
  RETURNING * INTO s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Este boleto não pode mais ser pago por aqui (já pago, agendado, em andamento ou cancelado). Recarregue a página.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'valor', s.valor_pagar, 'linha_digitavel', s.linha_digitavel,
    'data_pagamento', s.data_pagamento, 'favorecido', s.beneficiario_nome, 'descricao', s.descricao);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_solicitacao_iniciar(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boleto_solicitacao_iniciar(uuid, numeric) TO authenticated;

-- baixa com o valor efetivamente pago; encargos como juros da parcela
CREATE OR REPLACE FUNCTION public.fn_boleto_confirmar_pagamento(p_id uuid, p_pago boolean, p_erro text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s       record;
  v_inter uuid;
  v_parc  uuid;
  v_quem  text;
  v_nota  text;
  v_pago  numeric;
BEGIN
  SELECT * INTO s FROM public.boleto_solicitacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('agendado', 'pagando') THEN
    RETURN;
  END IF;

  IF NOT p_pago THEN
    UPDATE public.boleto_solicitacoes
    SET status = 'erro', erro = left(coalesce(p_erro, 'O Inter não confirmou o pagamento'), 500), concluido_em = now()
    WHERE id = p_id;
    RETURN;
  END IF;

  v_pago := coalesce(s.valor_pagar, s.valor);
  SELECT id INTO v_inter FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;

  UPDATE public.boleto_solicitacoes SET status = 'pago', concluido_em = now(), erro = NULL WHERE id = p_id;
  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = s.inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := 'Pago por: Inter da Clínica (boleto em ' || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
            || CASE WHEN v_pago > s.valor THEN ', com R$ ' || to_char(v_pago - s.valor, 'FM999G990D00') || ' de multa e juros' ELSE '' END
            || coalesce(', agendado por ' || v_quem, '') || ').';

  SELECT cp.id INTO v_parc FROM public.contas_pagar cp
  WHERE cp.lancamento_id = s.lancamento_id AND cp.status_pagamento = 'pendente'
  ORDER BY cp.numero_parcela LIMIT 1;

  IF v_parc IS NOT NULL THEN
    UPDATE public.contas_pagar
    SET status_pagamento = 'pago', data_pagamento = coalesce(s.data_pagamento, CURRENT_DATE),
        valor_pago = v_pago, juros = greatest(v_pago - s.valor, 0), valor_final = v_pago,
        conta_bancaria_id = v_inter, pago_por = s.aprovado_por,
        observacoes = concat_ws(' ', observacoes, 'Boleto recebido por e-mail, pago pelo Inter.')
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_inter, 'data', coalesce(s.data_pagamento, CURRENT_DATE), 'valor_pago', v_pago,
          'inter_pagamento_id', s.inter_pagamento_id, 'pago_por', s.aprovado_por, 'via', 'email_boleto'))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, v_nota)
  WHERE id = s.lancamento_id;
END;
$$;

-- a página mostra o valor a pagar quando difere do boleto
CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_obter(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'id', b.id, 'status', b.status, 'valor', b.valor, 'valor_pagar', b.valor_pagar, 'vencimento', b.vencimento,
      'linha_digitavel', b.linha_digitavel, 'banco_codigo', b.banco_codigo,
      'beneficiario_nome', b.beneficiario_nome, 'beneficiario_doc', b.beneficiario_doc,
      'descricao', b.descricao, 'alertas', b.alertas, 'anexo_path', b.anexo_path,
      'remetente_email', b.remetente_email, 'created_at', b.created_at,
      'data_pagamento', b.data_pagamento, 'concluido_em', b.concluido_em, 'erro', b.erro,
      'lancamento_id', b.lancamento_id,
      'fornecedor_nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
      'fornecedor_cnpj', f.cpf_cnpj,
      'assunto', m.assunto, 'caixa', c.email,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))
    FROM public.boleto_solicitacoes b
    LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
    LEFT JOIN public.email_mensagens m ON m.id = b.mensagem_id
    LEFT JOIN public.email_caixas c ON c.id = m.caixa_id
    WHERE b.id = p_id
  );
END;
$$;
