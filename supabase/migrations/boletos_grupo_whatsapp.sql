-- Boleto mandado no grupo de notas do WhatsApp (22/10/2026, pedido do dono): "pagar pelo inter"
-- ou "pagar pelo asaas". Sem forma escolhida, a página do boleto oferece as duas.
--
-- Caminho: n8n (grupo de notas) → fn_boleto_grupo_receber (fila boleto_grupo_pedidos + pg_net)
-- → edge email-boletos {grupo:true} lê o PDF/foto/código (DVs conferidos) → fn_boleto_registrar_grupo
-- → boleto_solicitacoes (Inter: botão no app; Asaas: agenda na hora e a Bruna libera no app)
-- → fluxo de avisos responde no grupo citando a mensagem.
--
-- Contra pagar em dobro (o dono pediu explicitamente):
--   * mesmo código já registrado/pago → não registra de novo;
--   * boleto novo do mesmo fornecedor com valor parecido e um pedido em aberto (ex.: IPTU vencido,
--     que não recalcula e precisa de 2ª via) → SUBSTITUI: cancela o pedido velho e atualiza o mesmo
--     lançamento, sem criar outro;
--   * conta parecida já paga (mesmo fornecedor, valor ±1%, vencimento a até 25 dias) → alerta grave,
--     que trava o agendamento automático e exige "conferi" na página.

-- ---------------------------------------------------------------- fila do grupo
CREATE TABLE IF NOT EXISTS public.boleto_grupo_pedidos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatid         text NOT NULL,
  messageid      text NOT NULL,
  sender         text,
  remetente      text,
  legenda        text,
  arquivo_url    text,
  arquivo_nome   text,
  mime           text,
  forma          text CHECK (forma IN ('inter', 'asaas')),
  status         text NOT NULL DEFAULT 'recebido'
                 CHECK (status IN ('recebido', 'processando', 'ok', 'duplicado', 'ja_pago', 'sem_boleto', 'erro')),
  resultado      jsonb,
  solicitacao_id uuid REFERENCES public.boleto_solicitacoes(id),
  anexo_path     text,
  tentativa_em   timestamptz,
  avisado_em     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatid, messageid)
);
ALTER TABLE public.boleto_grupo_pedidos ENABLE ROW LEVEL SECURITY;
-- sem policy: só service_role (n8n e edge) e as funções abaixo
CREATE INDEX IF NOT EXISTS ix_boleto_grupo_pedidos_aviso
  ON public.boleto_grupo_pedidos (created_at) WHERE avisado_em IS NULL;

-- ---------------------------------------------------------------- solicitação: forma e conta próprias
-- Boleto do grupo não tem remetente cadastrado: a forma e a conta ficam na própria solicitação.
-- Nas funções, vale coalesce(solicitação, remetente).
ALTER TABLE public.boleto_solicitacoes
  ADD COLUMN IF NOT EXISTS pagar_por text CHECK (pagar_por IN ('inter', 'outra_conta', 'asaas')),
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id),
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'email' CHECK (origem IN ('email', 'grupo')),
  ADD COLUMN IF NOT EXISTS grupo_pedido_id uuid REFERENCES public.boleto_grupo_pedidos(id),
  -- o próximo aviso de mudança (agendado/pago/erro) já sai na resposta do pedido do grupo
  ADD COLUMN IF NOT EXISTS silenciar_aviso boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_trg_boleto_solicitacao_reaviso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('agendado', 'pago', 'erro') THEN
    IF NEW.silenciar_aviso THEN
      NEW.notificado_em := now();
      NEW.silenciar_aviso := false;
    ELSE
      NEW.notificado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- n8n → fila
CREATE OR REPLACE FUNCTION public.fn_boleto_grupo_receber(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id    uuid;
  v_leg   text := left(coalesce(p ->> 'legenda', ''), 2000);
  v_norm  text := lower(public.unaccent(v_leg));
  v_forma text := nullif(p ->> 'forma', '');
BEGIN
  IF v_forma IS NULL THEN
    v_forma := CASE WHEN v_norm ~ '\m(asaas|asas)\M' THEN 'asaas' WHEN v_norm ~ '\minter\M' THEN 'inter' END;
  END IF;
  INSERT INTO public.boleto_grupo_pedidos (chatid, messageid, sender, remetente, legenda, arquivo_url, arquivo_nome, mime, forma)
  VALUES (p ->> 'chatid', p ->> 'messageid', nullif(p ->> 'sender', ''), nullif(p ->> 'remetente', ''), v_leg,
          nullif(p ->> 'arquivo_url', ''), nullif(p ->> 'arquivo_nome', ''), nullif(p ->> 'mime', ''), v_forma)
  ON CONFLICT (chatid, messageid) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true);
  END IF;

  -- a edge lê na hora (o cron de 15 em 15 min é a rede de segurança)
  PERFORM net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/email-boletos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"grupo": true}'::jsonb,
    timeout_milliseconds := 150000);
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'forma', v_forma);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_grupo_receber(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_grupo_receber(jsonb) TO service_role;

-- ---------------------------------------------------------------- edge → solicitação
CREATE OR REPLACE FUNCTION public.fn_boleto_registrar_grupo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_linha    text := regexp_replace(coalesce(p ->> 'linha_digitavel', ''), '[^0-9]', '', 'g');
  v_banco    text := nullif(p ->> 'banco_codigo', '');
  v_valor    numeric := nullif(p ->> 'valor', '')::numeric;
  v_venc     date := nullif(p ->> 'vencimento', '')::date;
  v_doc      text := nullif(regexp_replace(coalesce(p ->> 'beneficiario_doc', ''), '[^0-9]', '', 'g'), '');
  v_nome     text := nullif(trim(coalesce(p ->> 'beneficiario_nome', '')), '');
  v_dica     text := nullif(trim(coalesce(p ->> 'descricao_hint', '')), '');
  v_forma    text := nullif(p ->> 'forma', '');
  v_quem     text := coalesce(nullif(p ->> 'remetente', ''), 'alguém');
  v_pedido   uuid := nullif(p ->> 'pedido_id', '')::uuid;
  v_hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sem_venc boolean := false;
  v_forn     uuid;
  f          record;
  v_dup      record;
  l          record;
  v_base     record;
  v_pago     record;
  v_lanc     uuid;
  v_desc     text;
  v_acao     text;
  v_sub      jsonb;
  v_alertas  jsonb := '[]'::jsonb;
  v_conta    uuid;
  v_sol      uuid;
  v_cat      uuid;
  v_centro   uuid;
  v_status   text;
  v_nome_f   text;
  v_obs      text;
  v_marca    jsonb;
BEGIN
  IF v_linha !~ '^[0-9]{47,48}$' OR coalesce(v_valor, 0) <= 0 THEN
    RETURN jsonb_build_object('status', 'sem_boleto');
  END IF;
  IF v_venc IS NULL THEN
    v_venc := v_hoje;
    v_sem_venc := true;
  END IF;

  -- 1) mesmo código: já registrado (qualquer origem) ou já pago pelo Inter
  SELECT b.id, b.status, b.descricao INTO v_dup
  FROM public.boleto_solicitacoes b
  WHERE b.linha_digitavel = v_linha AND b.status <> 'cancelado'
  ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicado', 'solicitacao_id', v_dup.id, 'situacao', v_dup.status,
                              'descricao', v_dup.descricao, 'valor', v_valor);
  END IF;
  IF EXISTS (SELECT 1 FROM public.inter_pagamentos ip
             WHERE regexp_replace(coalesce(ip.codigo_barras, ''), '[^0-9]', '', 'g') = v_linha
               AND ip.status IN ('sucesso', 'enviando')) THEN
    RETURN jsonb_build_object('status', 'ja_pago', 'valor', v_valor);
  END IF;

  -- 2) fornecedor: CNPJ do beneficiário → mesmo convênio de arrecadação → nome no boleto
  IF v_doc IS NOT NULL THEN
    SELECT s.fornecedor_id INTO v_forn FROM public.fn_financeiro_sugerir_fornecedor(v_doc, NULL) s
    WHERE s.motivo = 'cnpj' LIMIT 1;
  END IF;
  IF v_forn IS NULL AND v_banco LIKE 'A%' THEN
    SELECT b.fornecedor_id INTO v_forn FROM public.boleto_solicitacoes b
    WHERE b.banco_codigo = v_banco AND b.fornecedor_id IS NOT NULL
    ORDER BY b.created_at DESC LIMIT 1;
  END IF;
  IF v_forn IS NULL AND v_nome IS NOT NULL THEN
    SELECT s.fornecedor_id INTO v_forn FROM public.fn_financeiro_sugerir_fornecedor(NULL, v_nome) s
    WHERE s.score >= 0.6 ORDER BY s.score DESC LIMIT 1;
  END IF;
  SELECT * INTO f FROM public.fornecedores WHERE id = v_forn;
  v_nome_f := coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social, v_nome);

  -- 3) conta que este boleto substitui ou preenche
  IF v_forn IS NOT NULL THEN
    -- 3a) pedido em aberto do mesmo fornecedor com valor parecido (2ª via de boleto vencido)
    SELECT lf.* INTO l FROM public.lancamentos_financeiros lf
    WHERE lf.fornecedor_id = v_forn
      AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
      AND lf.created_at > now() - interval '120 days'
      AND abs(lf.valor_total - v_valor) <= greatest(lf.valor_total * 0.2, 5)
      AND EXISTS (SELECT 1 FROM public.boleto_solicitacoes b
                  WHERE b.lancamento_id = lf.id AND b.status IN ('aguardando', 'erro', 'externo'))
      AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes b
                      WHERE b.lancamento_id = lf.id AND b.status IN ('pagando', 'agendando', 'agendado', 'pago', 'debito'))
      AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
    ORDER BY abs(lf.valor_total - v_valor), lf.created_at DESC LIMIT 1;
    IF l.id IS NOT NULL THEN
      v_acao := 'substituiu';
      SELECT jsonb_build_object('descricao', l.descricao, 'valor', l.valor_total,
               'vencimento', b.vencimento, 'situacao', b.status, 'erro', b.erro) INTO v_sub
      FROM public.boleto_solicitacoes b
      WHERE b.lancamento_id = l.id AND b.status IN ('aguardando', 'erro', 'externo')
      ORDER BY b.created_at DESC LIMIT 1;
      UPDATE public.boleto_solicitacoes
      SET status = 'cancelado', concluido_em = now(), notificado_em = now(),
          erro = concat_ws(' ', erro, format('Substituído por boleto novo enviado no grupo por %s em %s.', v_quem, to_char(v_hoje, 'DD/MM/YYYY')))
      WHERE lancamento_id = l.id AND status IN ('aguardando', 'erro', 'externo');
    ELSE
      -- 3b) conta já lançada e sem pedido (conta fixa do mês, pré-lançamento da nota)
      SELECT lf.* INTO l FROM public.lancamentos_financeiros lf
      WHERE lf.fornecedor_id = v_forn
        AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
        AND (lf.valor_total = 0 OR abs(lf.valor_total - v_valor) < greatest(v_valor * 0.01, 0.01))
        AND abs(coalesce(lf.data_vencimento, lf.data_competencia) - v_venc) <= 20
        AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes b WHERE b.lancamento_id = lf.id AND b.status <> 'cancelado')
        AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
      ORDER BY (abs(lf.valor_total - v_valor) < 0.01) DESC, abs(coalesce(lf.data_vencimento, lf.data_competencia) - v_venc)
      LIMIT 1;
      IF l.id IS NOT NULL THEN
        v_acao := 'preencheu';
      END IF;
    END IF;
  END IF;

  v_marca := jsonb_build_object('boleto', jsonb_build_object(
    'linha_digitavel', v_linha, 'banco', v_banco, 'beneficiario_doc', v_doc,
    'beneficiario_nome', v_nome, 'origem', 'grupo_whatsapp', 'enviado_por', v_quem, 'pedido_id', v_pedido));
  v_obs := format('[WhatsApp] Boleto enviado no grupo por %s em %s%s.', v_quem, to_char(v_hoje, 'DD/MM/YYYY'),
                  CASE WHEN v_acao = 'substituiu' THEN ' (substituiu o boleto anterior)' ELSE '' END);

  IF l.id IS NOT NULL THEN
    v_lanc := l.id;
    v_desc := l.descricao;
    UPDATE public.lancamentos_financeiros
    SET valor_total = v_valor, data_vencimento = v_venc,
        arquivo_url = coalesce(nullif(p ->> 'anexo_path', ''), arquivo_url),
        observacoes = concat_ws(' ', observacoes, v_obs),
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || v_marca,
        updated_at = now()
    WHERE id = v_lanc;
    UPDATE public.contas_pagar
    SET valor_parcela = v_valor, valor_final = v_valor, data_vencimento = v_venc, updated_at = now()
    WHERE lancamento_id = v_lanc AND status_pagamento = 'pendente' AND coalesce(total_parcelas, 1) = 1;
  ELSE
    -- 3c) conta nova: copia categoria, centro e natureza do último lançamento validado do fornecedor
    v_acao := 'novo';
    IF v_forn IS NOT NULL THEN
      SELECT lf.categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios INTO v_base
      FROM public.lancamentos_financeiros lf
      WHERE lf.fornecedor_id = v_forn AND lf.status_lancamento = 'validado'
      ORDER BY lf.data_competencia DESC NULLS LAST, lf.created_at DESC LIMIT 1;
    END IF;
    v_cat := coalesce(v_base.categoria_contabil_id,
                      CASE WHEN v_forn IS NOT NULL THEN public.fn_financeiro_categoria_sugerida(v_forn) END,
                      (SELECT id FROM public.categorias_contabeis WHERE codigo = '9.99'));
    SELECT id INTO v_centro FROM public.centros_financeiros WHERE tipo = 'comum' AND ativo LIMIT 1;
    v_desc := left(concat_ws(' - ', coalesce(v_nome_f, 'Boleto'), v_dica, 'venc. ' || to_char(v_venc, 'DD/MM/YYYY')), 200);
    INSERT INTO public.lancamentos_financeiros (
      tipo_lancamento, data_emissao, data_competencia, data_vencimento,
      fornecedor_id, categoria_contabil_id, descricao, observacoes,
      valor_total, quantidade_parcelas, eh_divisao_socios,
      status_lancamento, origem_lancamento, dados_ia, arquivo_url,
      centro_financeiro_id, natureza_custo, pago
    ) VALUES (
      'despesa', v_hoje, date_trunc('month', v_venc)::date, v_venc,
      v_forn, v_cat, v_desc, v_obs,
      v_valor, 1, coalesce(v_base.eh_divisao_socios, true),
      CASE WHEN v_base.categoria_contabil_id IS NOT NULL THEN 'validado' ELSE 'pre_lancamento' END,
      'api_ia', jsonb_build_object('origem', 'grupo_whatsapp_boleto') || v_marca,
      nullif(p ->> 'anexo_path', ''),
      coalesce(v_base.centro_financeiro_id, v_centro), coalesce(v_base.natureza_custo, 'compartilhado'), false
    ) RETURNING id INTO v_lanc;
    -- validado aparece em contas a pagar já com a parcela (pré-lançamento ganha a dele ao validar)
    IF v_base.categoria_contabil_id IS NOT NULL THEN
      INSERT INTO public.contas_pagar (lancamento_id, numero_parcela, total_parcelas, valor_parcela, data_vencimento,
                                       valor_final, status_pagamento, juros, desconto)
      VALUES (v_lanc, 1, 1, v_valor, v_venc, v_valor, 'pendente', 0, 0);
    END IF;
  END IF;

  -- 4) alertas
  -- conta parecida já paga: mesmo fornecedor = grave (trava o automático); sem fornecedor = atenção
  SELECT lf.descricao, coalesce(cp.valor_pago, lf.valor_total) AS valor,
         coalesce(cp.data_pagamento, (lf.dados_ia -> 'pagamento' ->> 'data')::date) AS dia,
         cb.banco_nome AS conta
    INTO v_pago
  FROM public.lancamentos_financeiros lf
  LEFT JOIN public.contas_pagar cp ON cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago'
  LEFT JOIN public.contas_bancarias cb ON cb.id = cp.conta_bancaria_id
  WHERE lf.id <> v_lanc AND lf.tipo_lancamento = 'despesa' AND lf.status_lancamento <> 'cancelado'
    AND (cp.id IS NOT NULL OR coalesce(lf.pago, false))
    AND abs(coalesce(cp.valor_pago, lf.valor_total) - v_valor) <= greatest(v_valor * 0.01, 0.05)
    AND abs(coalesce(cp.data_vencimento, lf.data_vencimento, lf.data_competencia) - v_venc) <= 25
    AND (v_forn IS NULL OR lf.fornecedor_id = v_forn)
  ORDER BY abs(coalesce(cp.data_vencimento, lf.data_vencimento, lf.data_competencia) - v_venc) LIMIT 1;
  IF FOUND THEN
    v_alertas := v_alertas || jsonb_build_object(
      'nivel', CASE WHEN v_forn IS NOT NULL THEN 'grave' ELSE 'atencao' END,
      'texto', format('Pode já estar pago: "%s" de R$ %s consta paga%s%s. Confira antes de pagar.',
                      v_pago.descricao, public.fn_brl(v_pago.valor),
                      coalesce(' em ' || to_char(v_pago.dia, 'DD/MM/YYYY'), ''),
                      coalesce(' (' || v_pago.conta || ')', '')));
  END IF;
  IF v_venc < v_hoje THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'atencao',
      'texto', format('Venceu em %s. Se o banco recusar, emita um boleto novo e mande no grupo.', to_char(v_venc, 'DD/MM/YYYY')));
  END IF;
  IF v_sem_venc THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'info',
      'texto', 'O vencimento não vem no código e não achei no documento: registrei como hoje.');
  END IF;
  IF v_forn IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object('nivel', 'info',
      'texto', 'Não reconheci o fornecedor: confira o lançamento em Financeiro.');
  END IF;

  -- 5) pedido de pagamento
  IF v_forma = 'asaas' THEN
    SELECT id INTO v_conta FROM public.contas_bancarias WHERE asaas_empresa_id IS NOT NULL AND ativo ORDER BY created_at LIMIT 1;
    IF v_conta IS NULL THEN
      v_forma := NULL;
    END IF;
  ELSIF v_forma = 'inter' THEN
    SELECT id INTO v_conta FROM public.contas_bancarias WHERE banco_codigo = '077' AND ativo LIMIT 1;
  END IF;
  v_status := CASE WHEN v_forma = 'asaas' THEN 'agendando' ELSE 'aguardando' END;

  INSERT INTO public.boleto_solicitacoes (
    lancamento_id, fornecedor_id, remetente_email, linha_digitavel, banco_codigo, valor, vencimento,
    beneficiario_nome, beneficiario_doc, anexo_path, descricao, alertas, chatid, status,
    pagar_por, conta_bancaria_id, origem, grupo_pedido_id, silenciar_aviso, anunciado_em, notificado_em
  ) VALUES (
    v_lanc, v_forn, 'WhatsApp · ' || v_quem, v_linha, v_banco, v_valor, v_venc,
    v_nome, v_doc, nullif(p ->> 'anexo_path', ''), v_desc, v_alertas, nullif(p ->> 'chatid', ''), v_status,
    v_forma, v_conta, 'grupo', v_pedido, v_forma = 'asaas', now(), now()
  ) RETURNING id INTO v_sol;

  RETURN jsonb_build_object(
    'status', 'boleto', 'solicitacao_id', v_sol, 'lancamento_id', v_lanc,
    'descricao', v_desc, 'fornecedor', v_nome_f, 'valor', v_valor, 'vencimento', v_venc,
    'sem_vencimento', v_sem_venc, 'pagar_por', v_forma, 'acao', v_acao, 'substituiu', v_sub,
    'alertas', v_alertas,
    'conta_titular', (SELECT titular FROM public.contas_bancarias WHERE id = v_conta));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_registrar_grupo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_registrar_grupo(jsonb) TO service_role;

-- ---------------------------------------------------------------- funções que liam a forma do remetente
-- página do boleto
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
      'assunto', coalesce(m.assunto, nullif(g.legenda, '')),
      'caixa', coalesce(c.email, CASE WHEN b.origem = 'grupo' THEN 'grupo de notas do WhatsApp' END),
      'debito_automatico', coalesce(er.debito_automatico, false),
      'pagar_por', coalesce(b.pagar_por, er.pagar_por, 'inter'),
      -- boleto do grupo mandado sem "inter"/"asaas": a página oferece as duas formas
      'forma_escolhida', (b.pagar_por IS NOT NULL OR er.id IS NOT NULL),
      'conta_debito', cb.banco_nome,
      'conta_pagamento', CASE WHEN cb.id IS NOT NULL THEN concat_ws(' · ', cb.banco_nome, cb.titular) END,
      'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,
      'senha_pdf', er.senha_pdf,
      'conta_titular', cb.titular,
      'asaas_bill_id', b.asaas_bill_id,
      'origem', b.origem,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))
    FROM public.boleto_solicitacoes b
    LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
    LEFT JOIN public.email_mensagens m ON m.id = b.mensagem_id
    LEFT JOIN public.email_caixas c ON c.id = m.caixa_id
    LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
    LEFT JOIN public.contas_bancarias cb ON cb.id = coalesce(b.conta_bancaria_id, er.conta_bancaria_id)
    LEFT JOIN public.lancamentos_financeiros l ON l.id = b.lancamento_id
    LEFT JOIN public.centros_financeiros cf ON cf.id = l.centro_financeiro_id
    LEFT JOIN public.boleto_grupo_pedidos g ON g.id = b.grupo_pedido_id
    WHERE b.id = p_id
  );
END;
$$;

-- avisos no grupo (Pix, boletos e, agora, a resposta aos boletos mandados no grupo)
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
  v_grp jsonb;
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
      'pagar_por', coalesce(b.pagar_por, er.pagar_por, 'inter'),
      'conta_debito', cb.banco_nome,
      'conta_pagamento', CASE WHEN cb.id IS NOT NULL THEN concat_ws(' · ', cb.banco_nome, cb.titular) END,
      'custo_de', CASE WHEN l.natureza_custo = 'individual' THEN cf.nome END,
      'conta_titular', cb.titular, 'asaas_bill_id', b.asaas_bill_id,
      'data_pagamento', b.data_pagamento, 'erro', b.erro, 'chatid', b.chatid, 'messageid', g.messageid,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))), '[]'::jsonb)
  INTO v_bol
  FROM public.boleto_solicitacoes b
  LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
  LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
  LEFT JOIN public.contas_bancarias cb ON cb.id = coalesce(b.conta_bancaria_id, er.conta_bancaria_id)
  LEFT JOIN public.lancamentos_financeiros l ON l.id = b.lancamento_id
  LEFT JOIN public.centros_financeiros cf ON cf.id = l.centro_financeiro_id
  LEFT JOIN public.boleto_grupo_pedidos g ON g.id = b.grupo_pedido_id
  WHERE b.chatid IS NOT NULL
    AND ((b.anunciado_em IS NULL AND (b.status IN ('aguardando', 'debito', 'externo')
             OR (b.status = 'agendado' AND b.asaas_bill_id IS NOT NULL)))
      OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));

  -- resposta ao boleto mandado no grupo (lido, substituído, repetido, sem código...)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'boleto_grupo', 'id', gp.id, 'chatid', gp.chatid, 'messageid', gp.messageid,
      'status', gp.status, 'forma', gp.forma, 'remetente', gp.remetente,
      'resultado', gp.resultado) ORDER BY gp.created_at), '[]'::jsonb)
  INTO v_grp
  FROM public.boleto_grupo_pedidos gp
  WHERE gp.avisado_em IS NULL AND gp.status NOT IN ('recebido', 'processando')
    AND gp.created_at > now() - interval '2 days';

  RETURN v_pix || v_bol || v_grp;
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
  IF FOUND THEN
    RETURN;
  END IF;
  UPDATE public.boleto_grupo_pedidos SET avisado_em = now() WHERE id = p_id;
  IF FOUND THEN
    RETURN;
  END IF;
  UPDATE public.boleto_solicitacoes
  SET anunciado_em = coalesce(anunciado_em, now()),
      notificado_em = CASE WHEN anunciado_em IS NULL AND status <> 'agendado' THEN notificado_em ELSE now() END
  WHERE id = p_id;
END;
$$;

-- conferência dos agendados: conta da solicitação antes da do remetente
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
  LEFT JOIN public.contas_bancarias cb ON cb.id = coalesce(b.conta_bancaria_id, er.conta_bancaria_id)
  WHERE b.status = 'agendado'
    AND (b.asaas_bill_id IS NOT NULL
         OR b.data_pagamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
$$;

-- baixa: conta da solicitação antes da do remetente
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_confirmar_pagamento(uuid,boolean,text)'::regprocedure) INTO d;
  n := replace(d,
    $q$    SELECT er.conta_bancaria_id INTO v_conta FROM public.email_boleto_remetentes er WHERE er.id = s.remetente_id;$q$,
    $q$    v_conta := coalesce(s.conta_bancaria_id,
      (SELECT er.conta_bancaria_id FROM public.email_boleto_remetentes er WHERE er.id = s.remetente_id));$q$);
  IF position('coalesce(s.conta_bancaria_id' in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_confirmar_pagamento: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- Inter não agenda o que é do Asaas
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_solicitacao_iniciar(uuid,numeric)'::regprocedure) INTO d;
  n := replace(d, $q$    AND status IN ('aguardando', 'erro')
$q$, $q$    AND status IN ('aguardando', 'erro')
    AND coalesce(pagar_por, 'inter') = 'inter'
$q$);
  IF position($q$coalesce(pagar_por, 'inter') = 'inter'$q$ in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_solicitacao_iniciar: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- marcar como pago: forma da solicitação ou do remetente
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
  WHERE b.id = p_id
    AND (b.status = 'externo'
         OR (b.status = 'erro'
             AND coalesce(b.pagar_por, (SELECT er.pagar_por FROM public.email_boleto_remetentes er WHERE er.id = b.remetente_id))
                 IN ('outra_conta', 'asaas')));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este boleto não está esperando pagamento por outra conta.');
  END IF;

  PERFORM public.fn_boleto_confirmar_pagamento(p_id, true);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- agendar no Asaas pela página: refazer (erro/externo) ou TROCAR um boleto do Inter para o Asaas
DROP FUNCTION IF EXISTS public.fn_boleto_asaas_pedir(uuid, boolean);
CREATE OR REPLACE FUNCTION public.fn_boleto_asaas_pedir(p_id uuid, p_confirmado boolean DEFAULT false, p_trocar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_asaas  uuid;
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT id INTO v_pessoa FROM public.pessoas WHERE auth_user_id = auth.uid() LIMIT 1;
  SELECT id INTO v_asaas FROM public.contas_bancarias WHERE asaas_empresa_id IS NOT NULL AND ativo ORDER BY created_at LIMIT 1;

  UPDATE public.boleto_solicitacoes b
  SET status = 'agendando', erro = NULL, asaas_bill_id = NULL, asaas_tentativa_em = NULL,
      asaas_confirmado = coalesce(p_confirmado, false), aprovado_por = v_pessoa, iniciado_em = now(),
      silenciar_aviso = false, data_pagamento = NULL, valor_pagar = NULL,
      pagar_por = CASE WHEN p_trocar THEN 'asaas' ELSE b.pagar_por END,
      conta_bancaria_id = CASE WHEN p_trocar THEN v_asaas ELSE b.conta_bancaria_id END
  WHERE b.id = p_id
    AND (
      (coalesce(b.pagar_por, (SELECT er.pagar_por FROM public.email_boleto_remetentes er WHERE er.id = b.remetente_id)) = 'asaas'
       AND b.status IN ('externo', 'erro'))
      OR (p_trocar AND v_asaas IS NOT NULL AND b.status IN ('aguardando', 'erro')
          AND coalesce(b.pagar_por, (SELECT er.pagar_por FROM public.email_boleto_remetentes er WHERE er.id = b.remetente_id), 'inter') = 'inter')
    )
    AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = b.lancamento_id AND cp.status_pagamento = 'pago')
    AND NOT EXISTS (SELECT 1 FROM public.inter_pagamentos ip
                    WHERE regexp_replace(coalesce(ip.codigo_barras, ''), '[^0-9]', '', 'g') = b.linha_digitavel
                      AND ip.status IN ('sucesso', 'enviando'));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Este boleto não pode ser agendado no Asaas agora (já pago, em andamento ou cancelado).');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_asaas_pedir(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_boleto_asaas_pedir(uuid, boolean, boolean) TO authenticated;

-- A reescrita acima de fn_pix_solicitacoes_para_avisar apagou o ajuste de
-- boleto_asaas_adotado_nota.sql (outra sessão, mesmo dia): conta agendada à mão no app do Asaas
-- e achada pelo sistema só avisa quando pagar. Reaplicado (migration boletos_grupo_reaplica_aviso_adotado).
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure);
  a text := $q$OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL AND b.status IN ('agendado', 'pago', 'erro')));$q$;
  n text := $q$OR (b.anunciado_em IS NOT NULL AND b.notificado_em IS NULL
          AND (b.status IN ('pago', 'erro')
               -- agendado à mão no app do Asaas e achado pelo sistema: só avisa quando pagar
               OR (b.status = 'agendado' AND NOT (b.asaas_bill_id IS NOT NULL
                   AND b.asaas_resposta ->> 'externalReference' IS DISTINCT FROM b.id::text)))));$q$;
BEGIN
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(d, a, n);
END $m$;
