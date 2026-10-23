-- Boleto do grupo com o pedido em mensagem SEPARADA do arquivo (23/10/2026: o dono mandou o
-- PDF do ISSQN sem legenda e, no mesmo segundo, "Pagar com asaas da Bruna"; o arquivo virou
-- nota de gasto e o texto ficou esperando a próxima foto).
--
-- Agora:
--   * texto com "pagar/agendar ... inter|asaas" (sem código) → fn_boleto_grupo_intencao: acha o
--     arquivo (citado, ou o último da mesma pessoa em 10 min) e vira pedido de boleto em cima do
--     PDF já guardado; se o arquivo ainda não chegou, o pedido fica 'esperando_arquivo';
--   * quando o arquivo vira pré-lançamento, fn_boleto_grupo_arquivo_chegou procura pedido
--     esperando da mesma pessoa (10 min) e o completa; a resposta de "nota recebida" não sai.
--   * fn_boleto_registrar_grupo aceita lancamento_hint (preenche aquele pré-lançamento, sem
--     criar outro) e deixa de quebrar quando não reconhece o fornecedor (record não atribuído).

ALTER TABLE public.boleto_grupo_pedidos
  ADD COLUMN IF NOT EXISTS anexo_storage text,
  ADD COLUMN IF NOT EXISTS lancamento_hint uuid REFERENCES public.lancamentos_financeiros(id),
  ADD COLUMN IF NOT EXISTS sender_texto text;
ALTER TABLE public.boleto_grupo_pedidos DROP CONSTRAINT IF EXISTS boleto_grupo_pedidos_status_check;
ALTER TABLE public.boleto_grupo_pedidos ADD CONSTRAINT boleto_grupo_pedidos_status_check
  CHECK (status IN ('esperando_arquivo', 'recebido', 'processando', 'ok', 'duplicado', 'ja_pago', 'sem_boleto', 'erro'));

CREATE OR REPLACE FUNCTION public.fn_boleto_grupo_disparar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/email-boletos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"grupo": true}'::jsonb,
    timeout_milliseconds := 150000);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_grupo_disparar() FROM PUBLIC, anon, authenticated;

-- texto "pagar com asaas/inter" sem código
CREATE OR REPLACE FUNCTION public.fn_boleto_grupo_intencao(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_leg    text := left(coalesce(p ->> 'legenda', ''), 2000);
  v_norm   text := lower(public.unaccent(v_leg));
  v_forma  text := CASE WHEN v_norm ~ '\m(asaas|asas)\M' THEN 'asaas' WHEN v_norm ~ '\minter\M' THEN 'inter' END;
  v_sender text := nullif(p ->> 'sender', '');
  v_quoted text := nullif(p ->> 'quoted', '');
  v_hint   uuid := nullif(p ->> 'lancamento_id', '')::uuid;
  l        record;
  v_id     uuid;
BEGIN
  -- 1) o arquivo: citado (pela resposta da Ju ou pela própria mensagem) ou o último da pessoa
  SELECT lf.id, lf.arquivo_url, lf.dados_ia -> 'whatsapp' ->> 'messageid' AS msg INTO l
  FROM public.lancamentos_financeiros lf
  WHERE lf.arquivo_url IS NOT NULL AND lf.status_lancamento <> 'cancelado' AND NOT coalesce(lf.pago, false)
    AND (lf.id = v_hint
         OR (v_quoted IS NOT NULL AND lf.dados_ia -> 'whatsapp' ->> 'messageid' = v_quoted)
         OR (v_hint IS NULL AND v_quoted IS NULL AND v_sender IS NOT NULL
             AND lf.dados_ia -> 'whatsapp' ->> 'sender' = v_sender
             AND lf.created_at > now() - interval '10 minutes'))
  ORDER BY (lf.id = v_hint) DESC NULLS LAST, lf.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.boleto_grupo_pedidos (chatid, messageid, sender, sender_texto, remetente, legenda, forma,
                                            anexo_storage, lancamento_hint)
    VALUES (p ->> 'chatid', p ->> 'messageid', v_sender, v_sender, nullif(p ->> 'remetente', ''), v_leg, v_forma,
            l.arquivo_url, l.id)
    ON CONFLICT (chatid, messageid) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      PERFORM public.fn_boleto_grupo_disparar();
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'recebido', 'id', v_id, 'lancamento_id', l.id);
  END IF;

  -- 2) arquivo ainda não chegou (mandado junto): espera até 10 min
  INSERT INTO public.boleto_grupo_pedidos (chatid, messageid, sender, sender_texto, remetente, legenda, forma, status)
  VALUES (p ->> 'chatid', p ->> 'messageid', v_sender, v_sender, nullif(p ->> 'remetente', ''), v_leg, v_forma, 'esperando_arquivo')
  ON CONFLICT (chatid, messageid) DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'status', 'esperando_arquivo', 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_grupo_intencao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_grupo_intencao(jsonb) TO service_role;

-- o arquivo virou pré-lançamento: havia um "pagar com..." esperando?
CREATE OR REPLACE FUNCTION public.fn_boleto_grupo_arquivo_chegou(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lanc   uuid := nullif(p ->> 'lancamento_id', '')::uuid;
  v_sender text := nullif(p ->> 'sender', '');
  v_arq    text;
  v_id     uuid;
BEGIN
  IF v_lanc IS NULL OR v_sender IS NULL THEN
    RETURN jsonb_build_object('virou_boleto', false);
  END IF;
  SELECT arquivo_url INTO v_arq FROM public.lancamentos_financeiros WHERE id = v_lanc;
  IF v_arq IS NULL THEN
    RETURN jsonb_build_object('virou_boleto', false);
  END IF;

  UPDATE public.boleto_grupo_pedidos g
  SET status = 'recebido', anexo_storage = v_arq, lancamento_hint = v_lanc,
      arquivo_nome = nullif(p ->> 'arquivo_nome', '')
  WHERE g.id = (SELECT g2.id FROM public.boleto_grupo_pedidos g2
                WHERE g2.status = 'esperando_arquivo' AND g2.sender = v_sender
                  AND g2.created_at > now() - interval '10 minutes'
                ORDER BY g2.created_at DESC LIMIT 1
                FOR UPDATE SKIP LOCKED)
  RETURNING g.id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('virou_boleto', false);
  END IF;
  PERFORM public.fn_boleto_grupo_disparar();
  RETURN jsonb_build_object('virou_boleto', true, 'pedido_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_boleto_grupo_arquivo_chegou(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boleto_grupo_arquivo_chegou(jsonb) TO service_role;

-- fn_boleto_grupo_receber passa a usar o disparo comum (mesmo comportamento)
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
  PERFORM public.fn_boleto_grupo_disparar();
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'forma', v_forma);
END;
$$;

-- pedido esperando arquivo que nunca chegou: vira erro com instrução (o aviso responde no grupo)
CREATE OR REPLACE FUNCTION public.fn_boleto_grupo_expirar_esperas()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH x AS (
    UPDATE public.boleto_grupo_pedidos
    SET status = 'erro',
        resultado = jsonb_build_object('motivo',
          'não achei o arquivo do boleto. Mande o PDF (ou responda a ele) com "pagar pelo inter" ou "pagar pelo asaas"')
    WHERE status = 'esperando_arquivo' AND created_at < now() - interval '10 minutes'
    RETURNING 1)
  SELECT count(*)::int FROM x;
$$;

DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure) INTO d;
  n := replace(d, $q$  -- resposta ao boleto mandado no grupo$q$,
    $q$  PERFORM public.fn_boleto_grupo_expirar_esperas();
  -- resposta ao boleto mandado no grupo$q$);
  IF position('fn_boleto_grupo_expirar_esperas' in n) = 0 THEN
    -- a versão aplicada não tem o comentário: põe antes do SELECT dos pedidos do grupo
    n := replace(d, $q$  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'boleto_grupo'$q$, $q$  PERFORM public.fn_boleto_grupo_expirar_esperas();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'boleto_grupo'$q$);
  END IF;
  IF position('fn_boleto_grupo_expirar_esperas' in n) = 0 THEN
    RAISE EXCEPTION 'fn_pix_solicitacoes_para_avisar: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

-- registro: lancamento_hint + não quebra sem fornecedor
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
  v_hint     uuid := nullif(p ->> 'lancamento_hint', '')::uuid;
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
  -- registros sempre atribuídos (campo de record não atribuído quebra a função)
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE false;
  SELECT NULL::uuid AS categoria_contabil_id, NULL::uuid AS centro_financeiro_id,
         NULL::text AS natureza_custo, NULL::boolean AS eh_divisao_socios INTO v_base;

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

  -- 2) pré-lançamento do próprio arquivo (texto mandado separado): é ESSA a conta
  IF v_hint IS NOT NULL THEN
    SELECT lf.* INTO l FROM public.lancamentos_financeiros lf
    WHERE lf.id = v_hint AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
      AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
      AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes b
                      WHERE b.lancamento_id = lf.id AND b.status IN ('pagando', 'agendando', 'agendado', 'pago', 'debito'));
    IF l.id IS NOT NULL THEN
      v_acao := 'preencheu';
      v_forn := l.fornecedor_id;
    END IF;
  END IF;

  -- 3) fornecedor: CNPJ do beneficiário → mesmo convênio de arrecadação → nome no boleto
  IF v_forn IS NULL AND v_doc IS NOT NULL THEN
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

  -- 4) conta que este boleto substitui ou preenche (se o arquivo não disse qual é)
  IF v_forn IS NOT NULL AND l.id IS NULL THEN
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
    ELSE
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

  -- pedido aberto na conta escolhida (boleto vencido): cancela e anota que foi substituído
  IF l.id IS NOT NULL THEN
    SELECT jsonb_build_object('descricao', l.descricao, 'valor', l.valor_total,
             'vencimento', b.vencimento, 'situacao', b.status, 'erro', b.erro) INTO v_sub
    FROM public.boleto_solicitacoes b
    WHERE b.lancamento_id = l.id AND b.status IN ('aguardando', 'erro', 'externo')
    ORDER BY b.created_at DESC LIMIT 1;
    IF v_sub IS NOT NULL THEN
      v_acao := 'substituiu';
      UPDATE public.boleto_solicitacoes
      SET status = 'cancelado', concluido_em = now(), notificado_em = now(),
          erro = concat_ws(' ', erro, format('Substituído por boleto novo enviado no grupo por %s em %s.', v_quem, to_char(v_hoje, 'DD/MM/YYYY')))
      WHERE lancamento_id = l.id AND status IN ('aguardando', 'erro', 'externo');
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
    -- conta nova: copia categoria, centro e natureza do último lançamento validado do fornecedor
    v_acao := 'novo';
    IF v_forn IS NOT NULL THEN
      SELECT lf.categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios INTO v_base
      FROM public.lancamentos_financeiros lf
      WHERE lf.fornecedor_id = v_forn AND lf.status_lancamento = 'validado'
      ORDER BY lf.data_competencia DESC NULLS LAST, lf.created_at DESC LIMIT 1;
      IF NOT FOUND THEN
        SELECT NULL::uuid AS categoria_contabil_id, NULL::uuid AS centro_financeiro_id,
               NULL::text AS natureza_custo, NULL::boolean AS eh_divisao_socios INTO v_base;
      END IF;
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
    IF v_base.categoria_contabil_id IS NOT NULL THEN
      INSERT INTO public.contas_pagar (lancamento_id, numero_parcela, total_parcelas, valor_parcela, data_vencimento,
                                       valor_final, status_pagamento, juros, desconto)
      VALUES (v_lanc, 1, 1, v_valor, v_venc, v_valor, 'pendente', 0, 0);
    END IF;
  END IF;

  -- 5) alertas: conta parecida já paga (mesmo fornecedor = grave, trava o automático)
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

  -- 6) pedido de pagamento
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
