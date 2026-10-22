-- Boletos que chegam por e-mail viram conta a pagar + pedido de pagamento (19/10/2026).
--
-- Fluxo: pg_cron chama a edge `email-boletos` a cada 15 min em horário comercial. Ela lê no
-- Gmail SÓ as mensagens com PDF vindas dos remetentes cadastrados aqui, acha a linha digitável
-- (valor, vencimento e banco saem do próprio código, conferido pelos dígitos verificadores) e
-- chama fn_boleto_registrar_email. O aviso com o link /#/boleto/:id sai no grupo de notas pelo
-- fluxo de avisos que já roda para o Pix (fn_pix_solicitacoes_para_avisar). Quem agenda o
-- pagamento é o admin logado no app, pela inter-pagar de sempre (só admin, tetos, auditoria).
--
-- Contas fixas (ex.: condomínio) já existem como lançamento de valor 0 todo mês: o boleto
-- PREENCHE esse lançamento em vez de criar outro (senão o mês fica duplicado).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_caixas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL UNIQUE,
  refresh_token     text,
  ativo             boolean NOT NULL DEFAULT true,
  conectado_por     uuid REFERENCES public.pessoas(id),
  conectado_em      timestamptz,
  ultima_leitura_em timestamptz,
  ultimo_erro       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_caixas ENABLE ROW LEVEL SECURITY;
-- sem policy: o token só é lido pela edge (service_role); o app usa fn_email_caixas_listar

CREATE TABLE IF NOT EXISTS public.email_boleto_remetentes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- e-mail exato ou "@dominio.com.br" para o domínio inteiro
  email                    text NOT NULL CHECK (email = lower(trim(email)) AND email LIKE '%@%'),
  fornecedor_id            uuid NOT NULL REFERENCES public.fornecedores(id),
  -- conta fixa que o boleto preenche (opcional)
  lancamento_recorrente_id uuid REFERENCES public.lancamentos_recorrentes(id),
  -- texto que precisa aparecer no e-mail ou no PDF para usar este cadastro (ex.: "A-311"),
  -- quando o mesmo remetente manda boletos de contas diferentes
  identificador            text,
  categoria_contabil_id    uuid REFERENCES public.categorias_contabeis(id),
  observacao               text,
  ativo                    boolean NOT NULL DEFAULT true,
  criado_por               uuid REFERENCES public.pessoas(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_boleto_remetentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_boleto_remetentes_admin ON public.email_boleto_remetentes;
CREATE POLICY email_boleto_remetentes_admin ON public.email_boleto_remetentes
  FOR ALL TO authenticated
  USING ((SELECT public.fn_rls_admin_aprovado_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_aprovado_ativo()));

CREATE TABLE IF NOT EXISTS public.email_mensagens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id       uuid NOT NULL REFERENCES public.email_caixas(id),
  gmail_id       text NOT NULL,
  remetente      text,
  assunto        text,
  recebido_em    timestamptz,
  status         text NOT NULL CHECK (status IN ('boleto', 'sem_boleto', 'duplicado', 'ignorado', 'erro')),
  detalhe        text,
  solicitacao_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caixa_id, gmail_id)
);
ALTER TABLE public.email_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_mensagens_admin_le ON public.email_mensagens;
CREATE POLICY email_mensagens_admin_le ON public.email_mensagens
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_rls_admin_aprovado_ativo()));

CREATE TABLE IF NOT EXISTS public.boleto_solicitacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id      uuid NOT NULL REFERENCES public.lancamentos_financeiros(id),
  fornecedor_id      uuid REFERENCES public.fornecedores(id),
  remetente_id       uuid REFERENCES public.email_boleto_remetentes(id),
  mensagem_id        uuid REFERENCES public.email_mensagens(id),
  remetente_email    text,
  linha_digitavel    text NOT NULL CHECK (linha_digitavel ~ '^[0-9]{47}$'),
  banco_codigo       text,
  valor              numeric NOT NULL CHECK (valor > 0),
  vencimento         date NOT NULL,
  beneficiario_nome  text,
  beneficiario_doc   text,
  anexo_path         text,
  descricao          text,
  alertas            jsonb NOT NULL DEFAULT '[]'::jsonb,
  status             text NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando', 'pagando', 'agendado', 'pago', 'erro', 'cancelado')),
  data_pagamento     date,
  aprovado_por       uuid REFERENCES public.pessoas(id),
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  inter_pagamento_id uuid REFERENCES public.inter_pagamentos(id),
  erro               text,
  chatid             text,
  anunciado_em       timestamptz,
  notificado_em      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- o mesmo boleto chega de novo (lembrete de cobrança, outra caixa): um pedido vivo só
CREATE UNIQUE INDEX IF NOT EXISTS ux_boleto_solicitacoes_linha_viva
  ON public.boleto_solicitacoes (linha_digitavel) WHERE status <> 'cancelado';
CREATE INDEX IF NOT EXISTS ix_boleto_solicitacoes_remetente ON public.boleto_solicitacoes (remetente_id, created_at DESC);
ALTER TABLE public.boleto_solicitacoes ENABLE ROW LEVEL SECURITY;
-- sem policy: o app só acessa pelas funções abaixo, que conferem admin

-- mudança de situação que precisa de aviso zera notificado_em (mesma regra do Pix)
CREATE OR REPLACE FUNCTION public.fn_trg_boleto_solicitacao_reaviso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('agendado', 'pago', 'erro') THEN
    NEW.notificado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_boleto_solicitacao_reaviso ON public.boleto_solicitacoes;
CREATE TRIGGER trg_boleto_solicitacao_reaviso
  BEFORE UPDATE OF status ON public.boleto_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_boleto_solicitacao_reaviso();

-- ---------------------------------------------------------------------------
-- Edge email-boletos (service_role)
-- ---------------------------------------------------------------------------

-- Token do cron: o pg_cron manda no header; a edge confere lendo daqui.
CREATE OR REPLACE FUNCTION public.fn_email_boletos_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_boletos_token';
$$;

-- Registra um boleto lido de um e-mail. p: {caixa_id, gmail_id, remetente, assunto, recebido_em,
-- texto, linha_digitavel, banco_codigo, valor, vencimento, beneficiario_doc, beneficiario_nome, anexo_path}
CREATE OR REPLACE FUNCTION public.fn_boleto_registrar_email(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caixa    uuid := (p ->> 'caixa_id')::uuid;
  v_gmail    text := p ->> 'gmail_id';
  v_rem      text := lower(trim(coalesce(p ->> 'remetente', '')));
  v_texto    text := lower(coalesce(p ->> 'texto', '') || ' ' || coalesce(p ->> 'assunto', ''));
  v_linha    text := regexp_replace(coalesce(p ->> 'linha_digitavel', ''), '[^0-9]', '', 'g');
  v_banco    text := nullif(p ->> 'banco_codigo', '');
  v_valor    numeric := nullif(p ->> 'valor', '')::numeric;
  v_venc     date := nullif(p ->> 'vencimento', '')::date;
  v_doc      text := nullif(regexp_replace(coalesce(p ->> 'beneficiario_doc', ''), '[^0-9]', '', 'g'), '');
  v_hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_msg      uuid;
  r          record;
  f          record;
  l          record;
  v_alertas  jsonb := '[]'::jsonb;
  v_ant      record;
  v_hist_min numeric;
  v_hist_max numeric;
  v_lanc     uuid;
  v_cat      uuid;
  v_centro   uuid;
  v_desc     text;
  v_sol      uuid;
  v_dup      uuid;
BEGIN
  -- mensagem já vista: nada a fazer (a edge também filtra, isto é a garantia)
  SELECT id INTO v_msg FROM public.email_mensagens WHERE caixa_id = v_caixa AND gmail_id = v_gmail;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'ja_processada');
  END IF;

  INSERT INTO public.email_mensagens (caixa_id, gmail_id, remetente, assunto, recebido_em, status)
  VALUES (v_caixa, v_gmail, v_rem, p ->> 'assunto', nullif(p ->> 'recebido_em', '')::timestamptz, 'erro')
  RETURNING id INTO v_msg;

  -- cadastro do remetente: e-mail exato vence domínio; com identificador, só se ele aparecer
  SELECT er.* INTO r
  FROM public.email_boleto_remetentes er
  WHERE er.ativo
    AND (er.email = v_rem OR (left(er.email, 1) = '@' AND v_rem LIKE '%' || er.email))
    AND (er.identificador IS NULL OR v_texto LIKE '%' || lower(er.identificador) || '%')
  ORDER BY (er.email = v_rem) DESC, (er.identificador IS NOT NULL) DESC, er.created_at
  LIMIT 1;
  IF NOT FOUND THEN
    UPDATE public.email_mensagens SET status = 'ignorado', detalhe = public.fn_email_motivo_ignorado(v_rem) WHERE id = v_msg;
    RETURN jsonb_build_object('ok', false, 'status', 'ignorado');
  END IF;

  IF v_linha !~ '^[0-9]{47,48}$' OR coalesce(v_valor, 0) <= 0 OR v_venc IS NULL THEN
    UPDATE public.email_mensagens SET status = 'sem_boleto',
      detalhe = coalesce(nullif(p ->> 'motivo', ''), 'Não achei boleto com linha digitável válida no PDF')
    WHERE id = v_msg;
    RETURN jsonb_build_object('ok', false, 'status', 'sem_boleto');
  END IF;

  -- mesmo boleto de novo (lembrete de cobrança, outra caixa) ou já pago pelo Inter
  SELECT id INTO v_dup FROM public.boleto_solicitacoes WHERE linha_digitavel = v_linha AND status <> 'cancelado';
  IF FOUND OR EXISTS (SELECT 1 FROM public.inter_pagamentos ip
                      WHERE regexp_replace(coalesce(ip.codigo_barras, ''), '[^0-9]', '', 'g') = v_linha
                        AND ip.status IN ('sucesso', 'enviando')) THEN
    UPDATE public.email_mensagens SET status = 'duplicado', solicitacao_id = v_dup,
      detalhe = 'Boleto já registrado ou já pago' WHERE id = v_msg;
    RETURN jsonb_build_object('ok', false, 'status', 'duplicado', 'solicitacao_id', v_dup);
  END IF;

  SELECT * INTO f FROM public.fornecedores WHERE id = r.fornecedor_id;

  -- ---- conferências contra boleto adulterado (golpe comum por e-mail) ----
  SELECT b.banco_codigo, b.beneficiario_doc INTO v_ant
  FROM public.boleto_solicitacoes b
  WHERE b.remetente_id = r.id AND b.status <> 'cancelado'
  ORDER BY b.created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'info',
      'texto', 'Primeiro boleto deste remetente pelo e-mail. Confira banco e beneficiário com o PDF.');
  ELSE
    IF v_banco IS DISTINCT FROM v_ant.banco_codigo THEN
      v_alertas := v_alertas || jsonb_build_object('nivel', 'grave',
        'texto', format('O banco mudou: antes %s, agora %s. Confirme com o fornecedor antes de pagar.',
                        coalesce(v_ant.banco_codigo, '?'), coalesce(v_banco, '?')));
    END IF;
    IF v_doc IS NOT NULL AND v_ant.beneficiario_doc IS NOT NULL AND v_doc <> v_ant.beneficiario_doc THEN
      v_alertas := v_alertas || jsonb_build_object('nivel', 'grave',
        'texto', format('O CNPJ do beneficiário mudou: antes %s, agora %s.', v_ant.beneficiario_doc, v_doc));
    END IF;
  END IF;

  IF v_doc IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'grave',
      'texto', 'Não achei o CNPJ do beneficiário no PDF. Confira no boleto quem vai receber.');
  ELSIF nullif(regexp_replace(coalesce(f.cpf_cnpj, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
        AND regexp_replace(f.cpf_cnpj, '[^0-9]', '', 'g') <> v_doc THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'grave',
      'texto', format('O beneficiário do boleto (%s) não é o CNPJ do fornecedor no cadastro (%s).',
                      v_doc, regexp_replace(f.cpf_cnpj, '[^0-9]', '', 'g')));
  END IF;

  -- valor fora do histórico da conta (últimos 6 pagos)
  SELECT min(x.valor_total), max(x.valor_total) INTO v_hist_min, v_hist_max
  FROM (
    SELECT lf.valor_total FROM public.lancamentos_financeiros lf
    WHERE lf.valor_total > 0 AND lf.status_lancamento <> 'cancelado'
      AND (CASE WHEN r.lancamento_recorrente_id IS NOT NULL
                THEN lf.lancamento_recorrente_id = r.lancamento_recorrente_id
                ELSE lf.fornecedor_id = r.fornecedor_id END)
    ORDER BY lf.data_competencia DESC LIMIT 6
  ) x;
  IF v_hist_max IS NOT NULL AND (v_valor > v_hist_max * 1.3 OR v_valor < v_hist_min * 0.7) THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'atencao',
      'texto', format('Valor fora do comum: os últimos ficaram entre R$ %s e R$ %s.',
                      to_char(v_hist_min, 'FM999G990D00'), to_char(v_hist_max, 'FM999G990D00')));
  END IF;

  IF v_venc < v_hoje THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'atencao',
      'texto', format('Venceu em %s. O Inter pode recusar ou cobrar multa e juros.', to_char(v_venc, 'DD/MM/YYYY')));
  END IF;

  -- ---- conta a pagar: preenche a conta fixa do mês, ou uma conta já lançada, ou cria ----
  IF r.lancamento_recorrente_id IS NOT NULL THEN
    SELECT lf.* INTO l FROM public.lancamentos_financeiros lf
    WHERE lf.lancamento_recorrente_id = r.lancamento_recorrente_id
      AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
      AND abs(lf.data_vencimento - v_venc) <= 45
      AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes b WHERE b.lancamento_id = lf.id AND b.status <> 'cancelado')
      AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
    ORDER BY abs(lf.data_vencimento - v_venc), lf.data_vencimento LIMIT 1;
  ELSE
    SELECT lf.* INTO l FROM public.lancamentos_financeiros lf
    WHERE lf.fornecedor_id = r.fornecedor_id
      AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
      AND (lf.valor_total = 0 OR abs(lf.valor_total - v_valor) < 0.01)
      AND abs(coalesce(lf.data_vencimento, lf.data_competencia) - v_venc) <= 20
      AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes b WHERE b.lancamento_id = lf.id AND b.status <> 'cancelado')
      AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
    ORDER BY (abs(lf.valor_total - v_valor) < 0.01) DESC, abs(coalesce(lf.data_vencimento, lf.data_competencia) - v_venc) LIMIT 1;
  END IF;

  IF l.id IS NOT NULL THEN
    v_lanc := l.id;
    IF l.valor_total > 0 AND abs(l.valor_total - v_valor) >= 0.01 THEN
      v_alertas := v_alertas || jsonb_build_object('nivel', 'atencao',
        'texto', format('A conta "%s" estava lançada com R$ %s; o boleto é de R$ %s. Fica o valor do boleto.',
                        l.descricao, to_char(l.valor_total, 'FM999G990D00'), to_char(v_valor, 'FM999G990D00')));
    END IF;
    UPDATE public.lancamentos_financeiros
    SET valor_total = v_valor,
        data_vencimento = v_venc,
        arquivo_url = coalesce(nullif(p ->> 'anexo_path', ''), arquivo_url),
        observacoes = concat_ws(' ', observacoes,
          format('Boleto recebido por e-mail de %s em %s.', v_rem, to_char(v_hoje, 'DD/MM/YYYY'))),
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('boleto', jsonb_build_object(
          'linha_digitavel', v_linha, 'banco', v_banco, 'beneficiario_doc', v_doc,
          'beneficiario_nome', p ->> 'beneficiario_nome', 'remetente', v_rem, 'gmail_id', v_gmail)),
        updated_at = now()
    WHERE id = v_lanc;
    UPDATE public.contas_pagar
    SET valor_parcela = v_valor, data_vencimento = v_venc, updated_at = now()
    WHERE lancamento_id = v_lanc AND status_pagamento = 'pendente' AND coalesce(total_parcelas, 1) = 1;
    v_desc := l.descricao;
  ELSE
    v_cat := coalesce(r.categoria_contabil_id, public.fn_financeiro_categoria_sugerida(r.fornecedor_id),
                      (SELECT id FROM public.categorias_contabeis WHERE codigo = '9.99'));
    SELECT id INTO v_centro FROM public.centros_financeiros WHERE tipo = 'comum' AND ativo LIMIT 1;
    v_desc := concat_ws(' - ', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
                        'boleto venc. ' || to_char(v_venc, 'DD/MM/YYYY'));
    INSERT INTO public.lancamentos_financeiros (
      tipo_lancamento, data_emissao, data_competencia, data_vencimento,
      fornecedor_id, categoria_contabil_id, descricao, observacoes,
      valor_total, quantidade_parcelas, eh_divisao_socios,
      status_lancamento, origem_lancamento, dados_ia, arquivo_url,
      centro_financeiro_id, natureza_custo, pago
    ) VALUES (
      'despesa', v_hoje, date_trunc('month', v_venc)::date, v_venc,
      r.fornecedor_id, v_cat, v_desc,
      format('Boleto recebido por e-mail de %s em %s.', v_rem, to_char(v_hoje, 'DD/MM/YYYY')),
      v_valor, 1, true,
      'pre_lancamento', 'api_ia',
      jsonb_build_object('origem', 'email_boleto', 'boleto', jsonb_build_object(
        'linha_digitavel', v_linha, 'banco', v_banco, 'beneficiario_doc', v_doc,
        'beneficiario_nome', p ->> 'beneficiario_nome', 'remetente', v_rem, 'gmail_id', v_gmail)),
      nullif(p ->> 'anexo_path', ''),
      v_centro, 'compartilhado', false
    ) RETURNING id INTO v_lanc;
  END IF;

  -- débito automático não passa pelo Inter: só o valor fora do comum interessa
  IF r.debito_automatico THEN
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_alertas
    FROM jsonb_array_elements(v_alertas) a
    WHERE a ->> 'texto' LIKE 'Valor fora do comum%' OR a ->> 'texto' LIKE 'A conta "%';
  END IF;

  INSERT INTO public.boleto_solicitacoes (
    lancamento_id, fornecedor_id, remetente_id, mensagem_id, remetente_email,
    linha_digitavel, banco_codigo, valor, vencimento, beneficiario_nome, beneficiario_doc,
    anexo_path, descricao, alertas, chatid, status
  ) VALUES (
    v_lanc, r.fornecedor_id, r.id, v_msg, v_rem,
    v_linha, v_banco, v_valor, v_venc, nullif(p ->> 'beneficiario_nome', ''), v_doc,
    nullif(p ->> 'anexo_path', ''), v_desc, v_alertas,
    -- grupo 🧾 RK · Notas fiscais (robô), o mesmo dos pedidos de Pix
    '120363140440447965@g.us',
    -- débito automático: só registra, sem botão de pagar (boletos_email_debito_automatico.sql)
    CASE WHEN r.debito_automatico THEN 'debito' ELSE 'aguardando' END
  ) RETURNING id INTO v_sol;

  UPDATE public.email_mensagens SET status = 'boleto', solicitacao_id = v_sol, detalhe = NULL WHERE id = v_msg;

  RETURN jsonb_build_object('ok', true, 'status', 'boleto', 'solicitacao_id', v_sol, 'lancamento_id', v_lanc,
                            'alertas', v_alertas);
END;
$$;

-- Registra mensagem lida que não virou boleto (sem PDF, PDF ilegível, erro de leitura).
CREATE OR REPLACE FUNCTION public.fn_email_mensagem_registrar(p jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.email_mensagens (caixa_id, gmail_id, remetente, assunto, recebido_em, status, detalhe)
  VALUES ((p ->> 'caixa_id')::uuid, p ->> 'gmail_id', lower(p ->> 'remetente'), p ->> 'assunto',
          nullif(p ->> 'recebido_em', '')::timestamptz, p ->> 'status', left(p ->> 'detalhe', 500))
  ON CONFLICT (caixa_id, gmail_id) DO NOTHING;
$$;

-- Boleto agendado cujo dia chegou: a edge confere no Inter e chama isto.
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

  SELECT id INTO v_inter FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  SELECT nome INTO v_quem FROM public.pessoas WHERE id = s.aprovado_por;

  UPDATE public.boleto_solicitacoes SET status = 'pago', concluido_em = now(), erro = NULL WHERE id = p_id;
  UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id
  WHERE id = s.inter_pagamento_id AND lancamento_id IS NULL;

  v_nota := 'Pago por: Inter da Clínica (boleto em ' || to_char(coalesce(s.data_pagamento, CURRENT_DATE), 'DD/MM/YYYY')
            || coalesce(', agendado por ' || v_quem, '') || ').';

  SELECT cp.id INTO v_parc FROM public.contas_pagar cp
  WHERE cp.lancamento_id = s.lancamento_id AND cp.status_pagamento = 'pendente'
  ORDER BY cp.numero_parcela LIMIT 1;

  IF v_parc IS NOT NULL THEN
    UPDATE public.contas_pagar
    SET status_pagamento = 'pago', data_pagamento = coalesce(s.data_pagamento, CURRENT_DATE),
        valor_pago = s.valor, valor_final = s.valor, conta_bancaria_id = v_inter, pago_por = s.aprovado_por,
        observacoes = concat_ws(' ', observacoes, 'Boleto recebido por e-mail, pago pelo Inter.')
    WHERE id = v_parc;
  ELSE
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento', jsonb_build_object(
          'conta_bancaria_id', v_inter, 'data', coalesce(s.data_pagamento, CURRENT_DATE),
          'inter_pagamento_id', s.inter_pagamento_id, 'pago_por', s.aprovado_por, 'via', 'email_boleto'))
    WHERE id = s.lancamento_id;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, v_nota)
  WHERE id = s.lancamento_id;
END;
$$;

-- Agendados cujo dia chegou (para a edge conferir no Inter).
CREATE OR REPLACE FUNCTION public.fn_boletos_agendados_para_conferir()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'linha_digitavel', b.linha_digitavel, 'valor', b.valor,
    'data_pagamento', b.data_pagamento, 'resposta', ip.resposta)), '[]'::jsonb)
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.inter_pagamentos ip ON ip.id = b.inter_pagamento_id
  WHERE b.status = 'agendado'
    AND b.data_pagamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- App (admin logado)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_email_caixas_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'email', c.email, 'ativo', c.ativo, 'conectada', c.refresh_token IS NOT NULL,
      'conectado_em', c.conectado_em, 'conectado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = c.conectado_por),
      'ultima_leitura_em', c.ultima_leitura_em, 'ultimo_erro', c.ultimo_erro) ORDER BY c.email)
    FROM public.email_caixas c), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_email_caixa_definir_ativa(p_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  UPDATE public.email_caixas SET ativo = p_ativo WHERE id = p_id;
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
      'id', b.id, 'status', b.status, 'valor', b.valor, 'vencimento', b.vencimento,
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

-- Trava o pedido antes de chamar a inter-pagar (dois celulares não agendam duas vezes).
CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_iniciar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  s        record;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  UPDATE public.boleto_solicitacoes
  SET status = 'pagando', iniciado_em = now(), aprovado_por = v_pessoa, erro = NULL,
      data_pagamento = greatest(vencimento, v_hoje)
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

  RETURN jsonb_build_object('ok', true, 'valor', s.valor, 'linha_digitavel', s.linha_digitavel,
    'data_pagamento', s.data_pagamento, 'favorecido', s.beneficiario_nome, 'descricao', s.descricao);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_concluir(
  p_id uuid, p_inter_pagamento_id uuid DEFAULT NULL, p_erro text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s      record;
  ip     record;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT * INTO s FROM public.boleto_solicitacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pagando' THEN
    RETURN jsonb_build_object('ok', false, 'status', coalesce(s.status, 'inexistente'));
  END IF;

  -- confere na auditoria da inter-pagar (o app pode mentir; a auditoria não)
  SELECT ip2.* INTO ip FROM public.inter_pagamentos ip2
  WHERE ip2.tipo = 'boleto'
    AND regexp_replace(coalesce(ip2.codigo_barras, ''), '[^0-9]', '', 'g') = s.linha_digitavel
    AND ip2.criado_em >= s.iniciado_em - interval '1 minute'
    AND ip2.status IN ('sucesso', 'enviando')
    AND (p_inter_pagamento_id IS NULL OR ip2.id = p_inter_pagamento_id)
  ORDER BY ip2.criado_em DESC LIMIT 1;

  IF FOUND AND ip.status = 'sucesso' THEN
    UPDATE public.boleto_solicitacoes
    SET status = 'agendado', inter_pagamento_id = ip.id, concluido_em = now()
    WHERE id = p_id;
    UPDATE public.inter_pagamentos SET lancamento_id = s.lancamento_id WHERE id = ip.id AND lancamento_id IS NULL;
    UPDATE public.contas_pagar
    SET observacoes = concat_ws(' ', observacoes,
          format('Agendado no Inter para %s.', to_char(s.data_pagamento, 'DD/MM/YYYY')))
    WHERE lancamento_id = s.lancamento_id AND status_pagamento = 'pendente';
    -- vencimento hoje: o Inter paga no mesmo dia; quem confirma é a conferência da edge
    RETURN jsonb_build_object('ok', true, 'status', 'agendado', 'data_pagamento', s.data_pagamento);
  ELSIF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'pagando');
  END IF;

  UPDATE public.boleto_solicitacoes
  SET status = 'erro', erro = left(coalesce(p_erro, 'Falha sem mensagem'), 500), concluido_em = now(),
      data_pagamento = NULL
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'status', 'erro');
END;
$$;

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
  WHERE id = p_id AND status IN ('aguardando', 'erro');
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

-- ---------------------------------------------------------------------------
-- Avisos no grupo: o fluxo do Pix (n8n, a cada minuto) passa a levar os boletos também
-- ---------------------------------------------------------------------------

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

  -- boleto preso em "pagando" (app fechou no meio): mesma reconciliação pela auditoria
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
      'id', b.id, 'status', b.status, 'valor', b.valor, 'vencimento', b.vencimento,
      'favorecido', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social, b.beneficiario_nome),
      'descricao', b.descricao, 'remetente', b.remetente_email, 'alertas', b.alertas,
      'data_pagamento', b.data_pagamento, 'erro', b.erro, 'chatid', b.chatid, 'messageid', NULL,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))), '[]'::jsonb)
  INTO v_bol
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
  WHERE b.chatid IS NOT NULL
    AND ((b.anunciado_em IS NULL AND b.status = 'aguardando')
      OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));

  RETURN v_pix || v_bol;
END;
$$;

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
        notificado_em = CASE WHEN anunciado_em IS NULL THEN notificado_em ELSE now() END
    WHERE id = p_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_email_boletos_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_boleto_registrar_email(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_email_mensagem_registrar(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_boleto_confirmar_pagamento(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_boletos_agendados_para_conferir() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacoes_para_avisar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_solicitacao_marcar_avisada(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_boletos_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_boleto_registrar_email(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_email_mensagem_registrar(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_boleto_confirmar_pagamento(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_boletos_agendados_para_conferir() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacoes_para_avisar() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_pix_solicitacao_marcar_avisada(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_email_caixas_listar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_email_caixa_definir_ativa(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_boleto_solicitacao_obter(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_boleto_solicitacao_iniciar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_boleto_solicitacao_concluir(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_boleto_solicitacao_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_email_caixas_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_caixa_definir_ativa(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_solicitacao_obter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_solicitacao_iniciar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_solicitacao_concluir(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_solicitacao_cancelar(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_boleto_remetentes TO authenticated;
GRANT SELECT ON public.email_mensagens TO authenticated;
REVOKE ALL ON public.email_caixas, public.boleto_solicitacoes FROM anon, authenticated;
REVOKE ALL ON public.email_boleto_remetentes, public.email_mensagens FROM anon;
