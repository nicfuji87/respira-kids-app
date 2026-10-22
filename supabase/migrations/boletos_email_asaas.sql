-- Boleto pago pelo ASAAS da BC FISIO agendado direto pela API (22/10/2026, pedido do dono).
--
-- Remetente com pagar_por = 'asaas' + conta_bancaria_id de uma conta Asaas (contas_bancarias.
-- asaas_empresa_id diz de qual empresa é a chave da API). A solicitação nasce 'agendando'; a edge
-- email-boletos simula e cria o pagamento de conta no Asaas (POST /v3/bill) na mesma rodada e o
-- deixa 'agendado'. O Asaas segura o pagamento até a Bruna liberar no app dela: o aviso no grupo
-- diz exatamente isso. A cada rodada a edge consulta o pagamento (GET /v3/bill/{id}) e dá baixa
-- quando o Asaas diz PAID. Se não der para agendar (erro da API, alerta grave), vira 'externo'
-- com o motivo em `erro`: dá para tentar de novo pela página do boleto ou pagar à mão e marcar.

ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS asaas_empresa_id uuid REFERENCES public.pessoa_empresas(id);
COMMENT ON COLUMN public.contas_bancarias.asaas_empresa_id IS
  'Conta no Asaas: empresa (pessoa_empresas) cuja chave de API movimenta esta conta.';

-- Asaas BC FISIO KIDS (ag 0001 cc 2928667-1) = chave da BC FISIO KIDS LTDA
UPDATE public.contas_bancarias SET asaas_empresa_id = 'e02b9107-894f-4578-989f-4e8663f2dcca'
WHERE id = 'f4f078ea-9471-4b7d-8ef1-ec40ca20bd82' AND asaas_empresa_id IS NULL;

ALTER TABLE public.email_boleto_remetentes DROP CONSTRAINT IF EXISTS email_boleto_remetentes_pagar_por_check;
ALTER TABLE public.email_boleto_remetentes ADD CONSTRAINT email_boleto_remetentes_pagar_por_check
  CHECK (pagar_por IN ('inter', 'outra_conta', 'asaas'));

-- 'asaas' exige conta Asaas com chave
CREATE OR REPLACE FUNCTION public.fn_trg_email_remetente_asaas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.pagar_por = 'asaas' AND NOT EXISTS (
    SELECT 1 FROM public.contas_bancarias cb
    WHERE cb.id = NEW.conta_bancaria_id AND cb.asaas_empresa_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Para agendar pelo Asaas, escolha uma conta do Asaas.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_email_remetente_asaas ON public.email_boleto_remetentes;
CREATE TRIGGER trg_email_remetente_asaas
  BEFORE INSERT OR UPDATE OF pagar_por, conta_bancaria_id ON public.email_boleto_remetentes
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_email_remetente_asaas();

ALTER TABLE public.boleto_solicitacoes
  ADD COLUMN IF NOT EXISTS asaas_bill_id text,
  ADD COLUMN IF NOT EXISTS asaas_resposta jsonb,
  ADD COLUMN IF NOT EXISTS asaas_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS asaas_confirmado boolean NOT NULL DEFAULT false;

ALTER TABLE public.boleto_solicitacoes DROP CONSTRAINT IF EXISTS boleto_solicitacoes_status_check;
ALTER TABLE public.boleto_solicitacoes ADD CONSTRAINT boleto_solicitacoes_status_check
  CHECK (status IN ('aguardando', 'pagando', 'agendando', 'agendado', 'pago', 'erro', 'cancelado', 'debito', 'externo'));

-- registro: 'asaas' nasce 'agendando' (a edge agenda na mesma rodada) e o alerta de vencido
-- não fala do Inter (mesmo texto do 'outra_conta')
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  n := replace(d, $q$WHEN r.pagar_por = 'outra_conta' THEN 'externo'$q$,
    $q$WHEN r.pagar_por = 'outra_conta' THEN 'externo' WHEN r.pagar_por = 'asaas' THEN 'agendando'$q$);
  n := replace(n, $q$IF r.pagar_por = 'outra_conta' THEN
    SELECT$q$, $q$IF r.pagar_por IN ('outra_conta', 'asaas') THEN
    SELECT$q$);
  IF position($q$THEN 'agendando'$q$ in n) = 0 OR position($q$IN ('outra_conta', 'asaas') THEN$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_registrar_email: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- página do boleto: pedir (de novo) o agendamento no Asaas. A edge faz o resto.
CREATE OR REPLACE FUNCTION public.fn_boleto_asaas_pedir(p_id uuid, p_confirmado boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.boleto_solicitacoes b
  SET status = 'agendando', erro = NULL, asaas_bill_id = NULL, asaas_tentativa_em = NULL,
      asaas_confirmado = coalesce(p_confirmado, false), aprovado_por = v_pessoa, iniciado_em = now()
  FROM public.email_boleto_remetentes er
  WHERE b.id = p_id AND er.id = b.remetente_id AND er.pagar_por = 'asaas'
    AND b.status IN ('externo', 'erro');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este boleto não está esperando agendamento no Asaas.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_asaas_pedir(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boleto_asaas_pedir(uuid, boolean) TO authenticated;

-- marcar como pago à mão também vale para o 'asaas' (Bruna pagou direto no app) e depois de erro
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

  UPDATE public.boleto_solicitacoes b
  SET aprovado_por = v_pessoa, data_pagamento = coalesce(p_data, v_hoje), status = 'externo'
  FROM public.email_boleto_remetentes er
  WHERE b.id = p_id AND er.id = b.remetente_id
    AND (b.status = 'externo' OR (b.status = 'erro' AND er.pagar_por IN ('outra_conta', 'asaas')));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este boleto não está esperando pagamento por outra conta.');
  END IF;

  PERFORM public.fn_boleto_confirmar_pagamento(p_id, true);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- baixa: o agendado pelo Asaas também usa a conta do cadastro do remetente
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
  v_asa   boolean;
  v_banco text;
  v_tit   text;
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
  v_asa := s.status = 'agendado' AND s.asaas_bill_id IS NOT NULL;
  v_pago := coalesce(s.valor_pagar, s.valor);
  IF v_deb OR v_ext OR v_asa THEN
    SELECT er.conta_bancaria_id INTO v_conta FROM public.email_boleto_remetentes er WHERE er.id = s.remetente_id;
  ELSE
    SELECT id INTO v_conta FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  END IF;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;
  SELECT cb.banco_nome, cb.titular INTO v_banco, v_tit FROM public.contas_bancarias cb WHERE cb.id = v_conta;

  UPDATE public.boleto_solicitacoes
  SET status = 'pago', concluido_em = now(), erro = NULL,
      data_pagamento = coalesce(data_pagamento, vencimento), valor_pagar = v_pago
  WHERE id = p_id;
  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = s.inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := CASE
    WHEN v_deb THEN 'Pago por: débito automático em ' || to_char(coalesce(s.data_pagamento, s.vencimento), 'DD/MM/YYYY')
         || coalesce(' (' || v_banco || ')', '') || '. Baixa automática no vencimento; confira no extrato.'
    WHEN v_asa THEN 'Pago por: Asaas' || coalesce(' ' || v_tit, '') || ' em '
         || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
         || CASE WHEN v_pago > s.valor THEN ', com R$ ' || public.fn_brl(v_pago - s.valor) || ' de multa e juros' ELSE '' END
         || ' (agendado pela API, pagamento ' || s.asaas_bill_id || ', liberado no app do Asaas).'
    WHEN v_ext THEN 'Pago por: ' || coalesce(v_banco, 'outra conta') || ' em '
         || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
         || coalesce(' (marcado como pago no app por ' || v_quem || ')', '') || '.'
    ELSE 'Pago por: Inter da Clínica (boleto em ' || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
         || CASE WHEN v_pago > s.valor THEN ', com R$ ' || public.fn_brl(v_pago - s.valor) || ' de multa e juros' ELSE '' END
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
               WHEN v_asa THEN 'Boleto recebido por e-mail, pago pelo Asaas (agendado pela API).'
               WHEN v_ext THEN 'Boleto recebido por e-mail, pago fora do sistema.'
               ELSE 'Boleto recebido por e-mail, pago pelo Inter.' END)
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_conta, 'data', coalesce(s.data_pagamento, s.vencimento, CURRENT_DATE), 'valor_pago', v_pago,
          'inter_pagamento_id', s.inter_pagamento_id, 'asaas_bill_id', s.asaas_bill_id, 'pago_por', s.aprovado_por,
          'via', CASE WHEN v_deb THEN 'debito_automatico' WHEN v_asa THEN 'asaas' WHEN v_ext THEN 'outra_conta' ELSE 'email_boleto' END))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, v_nota)
  WHERE id = s.lancamento_id;
END;
$$;

-- conferência: Inter só no dia; Asaas todo agendado (a Bruna pode recusar antes do dia)
CREATE OR REPLACE FUNCTION public.fn_boletos_agendados_para_conferir()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'linha_digitavel', b.linha_digitavel, 'valor', b.valor,
    'data_pagamento', b.data_pagamento, 'resposta', ip.resposta,
    'asaas_bill_id', b.asaas_bill_id, 'asaas_empresa_id', cb.asaas_empresa_id)), '[]'::jsonb)
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.inter_pagamentos ip ON ip.id = b.inter_pagamento_id
  LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
  LEFT JOIN public.contas_bancarias cb ON cb.id = er.conta_bancaria_id
  WHERE b.status = 'agendado'
    AND (b.asaas_bill_id IS NOT NULL
         OR b.data_pagamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;

-- aviso: o 'asaas' é anunciado já agendado (ou como externo, se não deu para agendar)
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure) INTO d;
  n := replace(d, $q$AND ((b.anunciado_em IS NULL AND b.status IN ('aguardando', 'debito', 'externo'))$q$,
    $q$AND ((b.anunciado_em IS NULL AND (b.status IN ('aguardando', 'debito', 'externo')
             OR (b.status = 'agendado' AND b.asaas_bill_id IS NOT NULL)))$q$);
  n := replace(n, $q$'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,$q$,
    $q$'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,
      'conta_titular', cb.titular, 'asaas_bill_id', b.asaas_bill_id,$q$);
  IF position('asaas_bill_id IS NOT NULL)))' in n) = 0 OR position($q$'conta_titular'$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_pix_solicitacoes_para_avisar: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- anúncio de quem já nasce agendado vale também como aviso do agendamento
CREATE OR REPLACE FUNCTION public.fn_pix_solicitacao_marcar_avisada(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.pix_solicitacoes SET notificado_em = now() WHERE id = p_id;
  IF NOT FOUND THEN
    UPDATE public.boleto_solicitacoes
    SET anunciado_em = coalesce(anunciado_em, now()),
        notificado_em = CASE WHEN anunciado_em IS NULL AND status <> 'agendado' THEN notificado_em ELSE now() END
    WHERE id = p_id;
  END IF;
END;
$$;

-- página: o que ela precisa para o Asaas
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_solicitacao_obter(uuid)'::regprocedure) INTO d;
  n := replace(d, $q$'senha_pdf', er.senha_pdf,$q$,
    $q$'senha_pdf', er.senha_pdf, 'conta_titular', cb.titular, 'asaas_bill_id', b.asaas_bill_id,$q$);
  IF position($q$'asaas_bill_id'$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_solicitacao_obter: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- Faoli (ISSQN, honorários e INSS pró-labore) passa a ser agendada no Asaas da BC
UPDATE public.email_boleto_remetentes SET pagar_por = 'asaas'
WHERE pagar_por = 'outra_conta' AND conta_bancaria_id = 'f4f078ea-9471-4b7d-8ef1-ec40ca20bd82';
