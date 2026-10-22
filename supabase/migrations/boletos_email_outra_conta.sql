-- Boleto pago por OUTRA conta (Faoli/ISSQN da BC FISIO pelo Asaas, 22/10/2026) e documento
-- que chega por link em vez de anexo (Hubstrom).
--
-- Remetente com pagar_por = 'outra_conta': a solicitação nasce 'externo'; o aviso no grupo diz
-- por qual conta pagar (conta_bancaria_id do remetente) e de quem é o custo (natureza/centro do
-- lançamento: a conta fixa "ISS - Lucro Presumido" é individual da BC FISIO). Quem pagou toca
-- "Marquei como pago" na página do boleto (fn_boleto_marcar_pago) e a baixa sai nessa conta.
-- links_permitidos: domínios cujo link "Baixar" do e-mail a edge pode seguir para pegar o PDF.

ALTER TABLE public.email_boleto_remetentes
  ADD COLUMN IF NOT EXISTS pagar_por text NOT NULL DEFAULT 'inter'
    CHECK (pagar_por IN ('inter', 'outra_conta')),
  ADD COLUMN IF NOT EXISTS links_permitidos text;

ALTER TABLE public.boleto_solicitacoes DROP CONSTRAINT IF EXISTS boleto_solicitacoes_status_check;
ALTER TABLE public.boleto_solicitacoes ADD CONSTRAINT boleto_solicitacoes_status_check
  CHECK (status IN ('aguardando', 'pagando', 'agendado', 'pago', 'erro', 'cancelado', 'debito', 'externo'));

-- registro: nasce 'externo' e o alerta de vencido não fala do Inter
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  n := replace(d, $q$CASE WHEN r.debito_automatico THEN 'debito' ELSE 'aguardando' END$q$,
    $q$CASE WHEN r.debito_automatico THEN 'debito' WHEN r.pagar_por = 'outra_conta' THEN 'externo' ELSE 'aguardando' END$q$);
  n := replace(n, $q$  IF r.debito_automatico THEN
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_alertas$q$, $q$  IF r.pagar_por = 'outra_conta' THEN
    SELECT coalesce(jsonb_agg(CASE WHEN a ->> 'texto' LIKE 'Venceu em%'
             THEN jsonb_build_object('nivel', 'atencao', 'texto', split_part(a ->> 'texto', '.', 1) || '. Pode ter multa e juros.')
             ELSE a END), '[]'::jsonb) INTO v_alertas
    FROM jsonb_array_elements(v_alertas) a;
  END IF;
  IF r.debito_automatico THEN
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_alertas$q$);
  IF position($q$THEN 'externo'$q$ in n) = 0 OR position($q$r.pagar_por = 'outra_conta' THEN
    SELECT$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_registrar_email: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- baixa: 'externo' usa a conta do cadastro do remetente
CREATE OR REPLACE FUNCTION public.fn_boleto_confirmar_pagamento(p_id uuid, p_pago boolean, p_erro text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s       record;
  v_conta uuid;
  v_parc  uuid;
  v_quem  text;
  v_nota  text;
  v_pago  numeric;
  v_deb   boolean;
  v_ext   boolean;
  v_banco text;
BEGIN
  SELECT * INTO s FROM public.boleto_solicitacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('agendado', 'pagando', 'debito', 'externo') THEN
    RETURN;
  END IF;

  IF NOT p_pago THEN
    UPDATE public.boleto_solicitacoes
    SET status = 'erro', erro = left(coalesce(p_erro, 'O Inter não confirmou o pagamento'), 500), concluido_em = now()
    WHERE id = p_id;
    RETURN;
  END IF;

  v_deb := s.status = 'debito';
  v_ext := s.status = 'externo';
  v_pago := coalesce(s.valor_pagar, s.valor);
  IF v_deb OR v_ext THEN
    SELECT er.conta_bancaria_id INTO v_conta FROM public.email_boleto_remetentes er WHERE er.id = s.remetente_id;
  ELSE
    SELECT id INTO v_conta FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  END IF;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;
  SELECT cb.banco_nome INTO v_banco FROM public.contas_bancarias cb WHERE cb.id = v_conta;

  UPDATE public.boleto_solicitacoes
  SET status = 'pago', concluido_em = now(), erro = NULL,
      data_pagamento = coalesce(data_pagamento, vencimento), valor_pagar = v_pago
  WHERE id = p_id;
  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = s.inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := CASE
    WHEN v_deb THEN 'Pago por: débito automático em ' || to_char(coalesce(s.data_pagamento, s.vencimento), 'DD/MM/YYYY')
         || coalesce(' (' || v_banco || ')', '') || '. Baixa automática no vencimento; confira no extrato.'
    WHEN v_ext THEN 'Pago por: ' || coalesce(v_banco, 'outra conta') || ' em '
         || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
         || coalesce(' (marcado como pago no app por ' || v_quem || ')', '') || '.'
    ELSE 'Pago por: Inter da Clínica (boleto em ' || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
         || CASE WHEN v_pago > s.valor THEN ', com R$ ' || to_char(v_pago - s.valor, 'FM999G990D00') || ' de multa e juros' ELSE '' END
         || coalesce(', agendado por ' || v_quem, '') || ').'
  END;

  SELECT cp.id INTO v_parc FROM public.contas_pagar cp
  WHERE cp.lancamento_id = s.lancamento_id AND cp.status_pagamento = 'pendente'
  ORDER BY cp.numero_parcela LIMIT 1;

  IF v_parc IS NOT NULL THEN
    UPDATE public.contas_pagar
    SET status_pagamento = 'pago', data_pagamento = coalesce(s.data_pagamento, s.vencimento, CURRENT_DATE),
        valor_pago = v_pago, juros = greatest(v_pago - s.valor, 0), valor_final = v_pago,
        conta_bancaria_id = v_conta, pago_por = s.aprovado_por,
        observacoes = concat_ws(' ', observacoes,
          CASE WHEN v_deb THEN 'Débito automático (fatura recebida por e-mail).'
               WHEN v_ext THEN 'Boleto recebido por e-mail, pago fora do sistema.'
               ELSE 'Boleto recebido por e-mail, pago pelo Inter.' END)
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_conta, 'data', coalesce(s.data_pagamento, s.vencimento, CURRENT_DATE), 'valor_pago', v_pago,
          'inter_pagamento_id', s.inter_pagamento_id, 'pago_por', s.aprovado_por,
          'via', CASE WHEN v_deb THEN 'debito_automatico' WHEN v_ext THEN 'outra_conta' ELSE 'email_boleto' END))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, v_nota)
  WHERE id = s.lancamento_id;
END;
$$;

-- "Marquei como pago" (boleto pago por outra conta, ex.: Asaas da BC)
CREATE OR REPLACE FUNCTION public.fn_boleto_marcar_pago(p_id uuid, p_data date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  IF p_data IS NOT NULL AND (p_data > v_hoje OR p_data < v_hoje - 90) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Data de pagamento fora do aceitável.');
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.boleto_solicitacoes
  SET aprovado_por = v_pessoa, data_pagamento = coalesce(p_data, v_hoje)
  WHERE id = p_id AND status = 'externo';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este boleto não está esperando pagamento por outra conta.');
  END IF;

  PERFORM public.fn_boleto_confirmar_pagamento(p_id, true);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_marcar_pago(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boleto_marcar_pago(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_cancelar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  UPDATE public.boleto_solicitacoes SET status = 'cancelado', concluido_em = now(), notificado_em = now()
  WHERE id = p_id AND status IN ('aguardando', 'erro', 'debito', 'externo');
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

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
      'debito_automatico', coalesce(er.debito_automatico, false),
      'pagar_por', coalesce(er.pagar_por, 'inter'),
      'conta_debito', cb.banco_nome,
      'conta_pagamento', CASE WHEN cb.id IS NOT NULL THEN concat_ws(' · ', cb.banco_nome, cb.titular) END,
      'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,
      'senha_pdf', er.senha_pdf,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))
    FROM public.boleto_solicitacoes b
    LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
    LEFT JOIN public.email_mensagens m ON m.id = b.mensagem_id
    LEFT JOIN public.email_caixas c ON c.id = m.caixa_id
    LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
    LEFT JOIN public.contas_bancarias cb ON cb.id = er.conta_bancaria_id
    LEFT JOIN public.lancamentos_financeiros l ON l.id = b.lancamento_id
    LEFT JOIN public.centros_financeiros cf ON cf.id = l.centro_financeiro_id
    WHERE b.id = p_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pix_solicitacoes_para_avisar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s  record;
  ip record;
  v_pix jsonb;
  v_bol jsonb;
BEGIN
  FOR s IN SELECT * FROM public.pix_solicitacoes WHERE status = 'pagando' AND iniciado_em < now() - interval '3 minutes'
  LOOP
    SELECT * INTO ip FROM public.inter_pagamentos
    WHERE tipo = 'pix' AND chave_pix = s.chave_pix AND abs(valor - s.valor) < 0.01
      AND criado_em >= s.iniciado_em - interval '1 minute'
      AND solicitado_por IS NOT DISTINCT FROM s.aprovado_por
    ORDER BY criado_em DESC LIMIT 1;

    IF FOUND AND ip.status = 'sucesso' THEN
      PERFORM public.fn_pix_registrar_pago(s.id, ip.id);
    ELSIF FOUND AND ip.status = 'erro' THEN
      UPDATE public.pix_solicitacoes SET status = 'erro', erro = ip.erro, concluido_em = now() WHERE id = s.id;
    ELSIF NOT FOUND AND s.iniciado_em < now() - interval '10 minutes' THEN
      UPDATE public.pix_solicitacoes SET status = 'aguardando', iniciado_em = NULL, aprovado_por = NULL WHERE id = s.id;
    END IF;
  END LOOP;

  UPDATE public.pix_solicitacoes SET status = 'expirado'
  WHERE status = 'aguardando' AND expira_em < now();

  FOR s IN SELECT * FROM public.boleto_solicitacoes WHERE status = 'pagando' AND iniciado_em < now() - interval '3 minutes'
  LOOP
    SELECT * INTO ip FROM public.inter_pagamentos
    WHERE tipo = 'boleto'
      AND regexp_replace(coalesce(codigo_barras, ''), '[^0-9]', '', 'g') = s.linha_digitavel
      AND criado_em >= s.iniciado_em - interval '1 minute'
    ORDER BY criado_em DESC LIMIT 1;

    IF FOUND AND ip.status = 'sucesso' THEN
      UPDATE public.boleto_solicitacoes SET status = 'agendado', inter_pagamento_id = ip.id, concluido_em = now() WHERE id = s.id;
    ELSIF FOUND AND ip.status = 'erro' THEN
      UPDATE public.boleto_solicitacoes SET status = 'erro', erro = ip.erro, concluido_em = now(), data_pagamento = NULL WHERE id = s.id;
    ELSIF NOT FOUND AND s.iniciado_em < now() - interval '10 minutes' THEN
      UPDATE public.boleto_solicitacoes SET status = 'aguardando', iniciado_em = NULL, aprovado_por = NULL, data_pagamento = NULL WHERE id = s.id;
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'pix', 'evento', 'status',
      'id', ps.id, 'status', ps.status, 'valor', ps.valor, 'favorecido', ps.favorecido,
      'chatid', ps.chatid, 'messageid', ps.messageid, 'erro', ps.erro,
      'inter_pagamento_id', ps.inter_pagamento_id, 'chave_pix', ps.chave_pix,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = ps.aprovado_por))), '[]'::jsonb)
  INTO v_pix
  FROM public.pix_solicitacoes ps
  WHERE ps.status IN ('pago', 'erro', 'expirado') AND ps.notificado_em IS NULL AND ps.chatid IS NOT NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'boleto',
      'evento', CASE WHEN b.anunciado_em IS NULL THEN 'anuncio' ELSE 'status' END,
      'id', b.id, 'status', b.status, 'valor', b.valor, 'valor_pagar', b.valor_pagar, 'vencimento', b.vencimento,
      'favorecido', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social, b.beneficiario_nome),
      'descricao', b.descricao, 'remetente', b.remetente_email, 'alertas', b.alertas,
      'linha_digitavel', b.linha_digitavel,
      'debito_automatico', coalesce(er.debito_automatico, false),
      'pagar_por', coalesce(er.pagar_por, 'inter'),
      'conta_debito', cb.banco_nome,
      'conta_pagamento', CASE WHEN cb.id IS NOT NULL THEN concat_ws(' · ', cb.banco_nome, cb.titular) END,
      'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,
      'data_pagamento', b.data_pagamento, 'erro', b.erro, 'chatid', b.chatid, 'messageid', NULL,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))), '[]'::jsonb)
  INTO v_bol
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
  LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
  LEFT JOIN public.contas_bancarias cb ON cb.id = er.conta_bancaria_id
  LEFT JOIN public.lancamentos_financeiros l ON l.id = b.lancamento_id
  LEFT JOIN public.centros_financeiros cf ON cf.id = l.centro_financeiro_id
  WHERE b.chatid IS NOT NULL
    AND ((b.anunciado_em IS NULL AND b.status IN ('aguardando', 'debito', 'externo'))
      OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));

  RETURN v_pix || v_bol;
END;
$$;
