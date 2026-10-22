-- Contas em débito automático (Claro, 22/10/2026) e código de arrecadação (48 dígitos).
--
-- Remetente marcado como débito automático: a fatura preenche a conta fixa / cria a conta,
-- chega no grupo só como aviso (sem botão de pagar) e, no dia do vencimento, a edge
-- email-boletos chama fn_boletos_debito_baixar, que dá baixa na conta bancária escolhida no
-- cadastro. A conferência com o extrato continua sendo quem pega um débito que não passou.

ALTER TABLE public.email_boleto_remetentes
  ADD COLUMN IF NOT EXISTS debito_automatico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id);

ALTER TABLE public.boleto_solicitacoes DROP CONSTRAINT IF EXISTS boleto_solicitacoes_linha_digitavel_check;
ALTER TABLE public.boleto_solicitacoes ADD CONSTRAINT boleto_solicitacoes_linha_digitavel_check
  CHECK (linha_digitavel ~ '^[0-9]{47,48}$');
ALTER TABLE public.boleto_solicitacoes DROP CONSTRAINT IF EXISTS boleto_solicitacoes_status_check;
ALTER TABLE public.boleto_solicitacoes ADD CONSTRAINT boleto_solicitacoes_status_check
  CHECK (status IN ('aguardando', 'pagando', 'agendado', 'pago', 'erro', 'cancelado', 'debito'));

-- registro: aceita 48 dígitos e nasce em "debito" quando o remetente é débito automático
-- (troca pontual no corpo publicado; boletos_email.sql já está com a versão nova)
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  n := replace(d, $q$v_linha !~ '^[0-9]{47}$'$q$, $q$v_linha !~ '^[0-9]{47,48}$'$q$);
  n := replace(n, $q$anexo_path, descricao, alertas, chatid
  ) VALUES ($q$, $q$anexo_path, descricao, alertas, chatid, status
  ) VALUES ($q$);
  n := replace(n, $q$'120363140440447965@g.us'
  ) RETURNING id INTO v_sol;$q$, $q$'120363140440447965@g.us',
    CASE WHEN r.debito_automatico THEN 'debito' ELSE 'aguardando' END
  ) RETURNING id INTO v_sol;$q$);
  IF n = d OR position('47,48' in n) = 0 OR position($q$THEN 'debito'$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_registrar_email: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- baixa: aceita "debito" e usa a conta do cadastro do remetente
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
BEGIN
  SELECT * INTO s FROM public.boleto_solicitacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('agendado', 'pagando', 'debito') THEN
    RETURN;
  END IF;

  IF NOT p_pago THEN
    UPDATE public.boleto_solicitacoes
    SET status = 'erro', erro = left(coalesce(p_erro, 'O Inter não confirmou o pagamento'), 500), concluido_em = now()
    WHERE id = p_id;
    RETURN;
  END IF;

  v_deb := s.status = 'debito';
  v_pago := coalesce(s.valor_pagar, s.valor);
  IF v_deb THEN
    SELECT er.conta_bancaria_id INTO v_conta FROM public.email_boleto_remetentes er WHERE er.id = s.remetente_id;
  ELSE
    SELECT id INTO v_conta FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  END IF;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;

  UPDATE public.boleto_solicitacoes
  SET status = 'pago', concluido_em = now(), erro = NULL,
      data_pagamento = coalesce(data_pagamento, vencimento), valor_pagar = v_pago
  WHERE id = p_id;
  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = s.inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := CASE WHEN v_deb
    THEN 'Pago por: débito automático em ' || to_char(coalesce(s.data_pagamento, s.vencimento), 'DD/MM/YYYY')
         || coalesce(' (' || (SELECT cb.banco_nome FROM public.contas_bancarias cb WHERE cb.id = v_conta) || ')', '')
         || '. Baixa automática no vencimento; confira no extrato.'
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
               ELSE 'Boleto recebido por e-mail, pago pelo Inter.' END)
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_conta, 'data', coalesce(s.data_pagamento, s.vencimento, CURRENT_DATE), 'valor_pago', v_pago,
          'inter_pagamento_id', s.inter_pagamento_id, 'pago_por', s.aprovado_por,
          'via', CASE WHEN v_deb THEN 'debito_automatico' ELSE 'email_boleto' END))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, v_nota)
  WHERE id = s.lancamento_id;
END;
$$;

-- débito automático cujo vencimento chegou: baixa (chamado pela edge email-boletos)
CREATE OR REPLACE FUNCTION public.fn_boletos_debito_baixar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s record;
  n integer := 0;
BEGIN
  FOR s IN SELECT id FROM public.boleto_solicitacoes
           WHERE status = 'debito' AND vencimento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  LOOP
    PERFORM public.fn_boleto_confirmar_pagamento(s.id, true);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boletos_debito_baixar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boletos_debito_baixar() TO service_role;

-- cancelar também vale para débito automático (ex.: conta foi paga de outro jeito)
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
  WHERE id = p_id AND status IN ('aguardando', 'erro', 'debito');
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
      'conta_debito', (SELECT cb.banco_nome FROM public.contas_bancarias cb WHERE cb.id = er.conta_bancaria_id),
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))
    FROM public.boleto_solicitacoes b
    LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
    LEFT JOIN public.email_mensagens m ON m.id = b.mensagem_id
    LEFT JOIN public.email_caixas c ON c.id = m.caixa_id
    LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
    WHERE b.id = p_id
  );
END;
$$;

-- avisos: débito automático também é anunciado (sem botão) e depois avisado como pago
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
      'debito_automatico', coalesce(er.debito_automatico, false),
      'conta_debito', (SELECT cb.banco_nome FROM public.contas_bancarias cb WHERE cb.id = er.conta_bancaria_id),
      'data_pagamento', b.data_pagamento, 'erro', b.erro, 'chatid', b.chatid, 'messageid', NULL,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))), '[]'::jsonb)
  INTO v_bol
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
  LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
  WHERE b.chatid IS NOT NULL
    AND ((b.anunciado_em IS NULL AND b.status IN ('aguardando', 'debito'))
      OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));

  RETURN v_pix || v_bol;
END;
$$;

-- débito automático: sem alertas de pagamento (CNPJ, vencido), só os de valor
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  n := replace(d, $q$  INSERT INTO public.boleto_solicitacoes ($q$, $q$  IF r.debito_automatico THEN
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_alertas
    FROM jsonb_array_elements(v_alertas) a
    WHERE a ->> 'texto' LIKE 'Valor fora do comum%' OR a ->> 'texto' LIKE 'A conta "%';
  END IF;

  INSERT INTO public.boleto_solicitacoes ($q$);
  IF n = d THEN
    RAISE EXCEPTION 'fn_boleto_registrar_email: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;
