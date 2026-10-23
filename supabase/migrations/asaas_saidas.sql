-- Saídas do Asaas (conta da BC) lançadas sozinhas no financeiro (23/10/2026, pedido do dono:
-- "to fazendo pagamentos pelo asaas da bruna, pegue pelo webhook e lance no sistema").
--
-- Webhook próprio no Asaas (TRANSFER_DONE, BILL_PAID) → edge asaas-saidas → fn_asaas_saida_registrar.
-- A mesma função roda na conferência diária (lista /transfers e /bill pela API, só leitura), então
-- webhook perdido não vira buraco. Idempotente pelo id do Asaas.
--
-- Ordem de decisão para cada saída:
--   1. já registrada (mesmo id) → nada;
--   2. pagamento de conta que o sistema acompanha (boleto do e-mail/grupo, mesmo código) → baixa
--      pelo próprio pedido (fn_boleto_confirmar_pagamento);
--   3. já lançada à mão (paga na conta Asaas, mesmo valor, ±3 dias) → só liga;
--   4. transferência para CNPJ do grupo (BC, F.S PACHECO) → transferência entre contas, sem despesa;
--   5. conta em aberto que bate (imposto pela categoria; senão pelo fornecedor) → baixa nela;
--   6. Pix para sócio (Bruna, Nicolas) sem conta que bata → retirada, sem despesa;
--   7. senão → pré-lançamento JÁ PAGO (conta Asaas) para conferir em Financeiro › Pré-lançamentos.
-- Cada uma vira um aviso no grupo de notas (fluxo de avisos), exceto as da carga inicial.

-- ---------------------------------------------------------------- favorecidos conhecidos
-- O Asaas mascara o CPF no Pix: o nome do favorecido é o que identifica a pessoa.
CREATE TABLE IF NOT EXISTS public.financeiro_favorecidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  padrao        text NOT NULL UNIQUE,        -- começo do nome, minúsculo e sem acento
  fornecedor_id uuid REFERENCES public.fornecedores(id),
  tratamento    text NOT NULL DEFAULT 'fornecedor'
                CHECK (tratamento IN ('fornecedor', 'retirada', 'transferencia_interna')),
  observacao    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financeiro_favorecidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financeiro_favorecidos_admin ON public.financeiro_favorecidos;
CREATE POLICY financeiro_favorecidos_admin ON public.financeiro_favorecidos
  FOR ALL TO authenticated USING ((SELECT public.fn_rls_admin_aprovado_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_aprovado_ativo()));

INSERT INTO public.financeiro_favorecidos (padrao, fornecedor_id, tratamento, observacao) VALUES
  ('leonice vieira da fonseca', 'd0f95a9a-6444-4fde-8652-3251a70f1225', 'fornecedor', 'Nice (limpeza)'),
  ('bp fisioterapia infantil', '445dc083-fb3d-4fe4-9f4f-71a922083889', 'fornecedor', 'Bia (comissão)'),
  ('beatriz perisse', '445dc083-fb3d-4fe4-9f4f-71a922083889', 'fornecedor', 'Bia (comissão)'),
  ('walter antonio da silva', '41bb22b3-9dad-43c8-99cf-8e6944012656', 'fornecedor', 'aluguel sala 310'),
  ('faoli contabilidade', 'd0d95272-3d81-4c4e-9976-af8eb2915ec9', 'fornecedor', 'contabilidade'),
  ('alorrani de souza almeida', '57f4d062-1fa3-4e15-bc63-4225461e53e5', 'fornecedor', 'Lolô (secretária)'),
  ('raquel assad', '29ca8346-1cfb-46cf-9406-971ee03510a0', 'fornecedor', 'comissão'),
  ('vivia do perpetuo', '560eef24-385d-44aa-ae51-4ab3c4a10f29', 'fornecedor', 'comissão'),
  ('jeniffer marjory', 'a4183b09-de01-4325-a921-5c457447375f', 'fornecedor', 'comissão'),
  ('bruna cury lourenco peres', 'af9d273c-2723-434d-affd-9a44028e9868', 'retirada', 'retirada da sócia'),
  ('nicolas shuith ramos fujimoto', '9c674b36-f6d0-4c09-850c-2660f23ced60', 'retirada', 'cartões da casa / retirada pessoal'),
  ('bc fisio kids', NULL, 'transferencia_interna', 'repasse entre contas da BC')
ON CONFLICT (padrao) DO NOTHING;

-- ---------------------------------------------------------------- registro das saídas
CREATE TABLE IF NOT EXISTS public.asaas_saidas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_id        text NOT NULL UNIQUE,
  tipo            text NOT NULL CHECK (tipo IN ('transferencia', 'conta')),
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id),
  valor           numeric NOT NULL,
  data            date NOT NULL,
  favorecido      text,
  favorecido_doc  text,
  descricao       text,
  linha_digitavel text,
  payload         jsonb,
  tratamento      text NOT NULL
                  CHECK (tratamento IN ('boleto', 'ja_lancado', 'transferencia_interna', 'baixou', 'retirada', 'novo')),
  lancamento_id   uuid REFERENCES public.lancamentos_financeiros(id),
  detalhe         text,
  origem          text NOT NULL DEFAULT 'webhook' CHECK (origem IN ('webhook', 'conferencia', 'carga')),
  chatid          text,
  avisado_em      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_saidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asaas_saidas_admin_le ON public.asaas_saidas;
CREATE POLICY asaas_saidas_admin_le ON public.asaas_saidas
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_aprovado_ativo()));
CREATE INDEX IF NOT EXISTS ix_asaas_saidas_aviso ON public.asaas_saidas (created_at) WHERE avisado_em IS NULL;

-- ---------------------------------------------------------------- token do webhook (Vault)
DO $v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'asaas_saidas_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'asaas_saidas_token',
                                'authToken do webhook de saídas do Asaas (edge asaas-saidas)');
  END IF;
END
$v$;

CREATE OR REPLACE FUNCTION public.fn_asaas_saidas_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'asaas_saidas_token' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fn_asaas_saidas_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_asaas_saidas_token() TO service_role;

-- ---------------------------------------------------------------- baixa de uma conta em aberto
-- Usa o valor pago de verdade: previsão de valor 0 vira o valor pago; pago acima do previsto
-- vira juros (valor_final = valor_pago + juros, pelo gatilho calculate_valor_final).
CREATE OR REPLACE FUNCTION public.fn_financeiro_baixar_lancamento(
  p_lancamento uuid, p_valor numeric, p_data date, p_conta uuid, p_nota text, p_marca jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l    record;
  cp   record;
  v_principal numeric;
BEGIN
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND OR coalesce(l.pago, false) OR l.status_lancamento = 'cancelado' THEN
    RETURN false;
  END IF;

  IF coalesce(l.valor_total, 0) = 0 THEN
    UPDATE public.lancamentos_financeiros SET valor_total = p_valor WHERE id = p_lancamento;
    l.valor_total := p_valor;
  END IF;

  SELECT * INTO cp FROM public.contas_pagar
  WHERE lancamento_id = p_lancamento AND status_pagamento = 'pendente'
  ORDER BY numero_parcela LIMIT 1;

  IF FOUND THEN
    v_principal := CASE WHEN coalesce(cp.valor_parcela, 0) > 0 AND p_valor > cp.valor_parcela
                        THEN cp.valor_parcela ELSE p_valor END;
    UPDATE public.contas_pagar
    SET status_pagamento = 'pago', data_pagamento = p_data, conta_bancaria_id = p_conta,
        valor_pago = v_principal, juros = greatest(p_valor - v_principal, 0),
        observacoes = concat_ws(' ', observacoes, p_nota)
    WHERE id = cp.id;
  ELSE
    -- pré-lançamento sem parcela: a parcela nasce paga quando validarem (trg_parcela_herda_pagamento)
    UPDATE public.lancamentos_financeiros
    SET pago = true,
        dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento',
          jsonb_build_object('conta_bancaria_id', p_conta, 'data', p_data, 'valor_pago', p_valor) || coalesce(p_marca, '{}'::jsonb))
    WHERE id = p_lancamento;
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = concat_ws(' ', observacoes, p_nota),
      dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('asaas_saida', p_marca),
      updated_at = now()
  WHERE id = p_lancamento;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_financeiro_baixar_lancamento(uuid, numeric, date, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_baixar_lancamento(uuid, numeric, date, uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------- a decisão
CREATE OR REPLACE FUNCTION public.fn_asaas_saida_registrar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id      text := p ->> 'asaas_id';
  v_tipo    text := p ->> 'tipo';                                  -- 'transferencia' | 'conta'
  v_conta   uuid := (p ->> 'conta_bancaria_id')::uuid;
  v_valor   numeric := round((p ->> 'valor')::numeric, 2);
  v_data    date := (p ->> 'data')::date;
  v_fav     text := nullif(trim(p ->> 'favorecido'), '');
  v_doc     text := nullif(regexp_replace(coalesce(p ->> 'favorecido_doc', ''), '[^0-9]', '', 'g'), '');
  v_desc    text := nullif(trim(p ->> 'descricao'), '');
  v_linha   text := nullif(regexp_replace(coalesce(p ->> 'linha_digitavel', ''), '[^0-9]', '', 'g'), '');
  v_banco   text := nullif(p ->> 'banco_codigo', '');
  v_origem  text := coalesce(nullif(p ->> 'origem', ''), 'webhook');
  v_chat    text := '120363140440447965@g.us';
  v_norm    text;
  v_marca   jsonb;
  v_nota    text;
  v_trat    text;
  v_lanc    uuid;
  v_det     text;
  v_forn    uuid;
  v_fav_trat text;
  v_cat_cod text;
  v_cat     uuid;
  v_par_cod text;                                                  -- previsão irmã a cancelar (PIS, CSLL)
  b         record;
  l         record;
  v_base    record;
  v_centro  uuid;
  v_nat     text;
  v_desc_l  text;
  v_arq     text;
  v_comp    date;
BEGIN
  -- registros sempre atribuídos (campo de record não atribuído quebra a função)
  SELECT NULL::uuid AS id INTO l;
  SELECT NULL::uuid AS categoria_contabil_id, NULL::uuid AS centro_financeiro_id,
         NULL::text AS natureza_custo, NULL::boolean AS eh_divisao_socios INTO v_base;

  IF v_id IS NULL OR v_valor IS NULL OR v_valor <= 0 OR v_data IS NULL OR v_conta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'dados incompletos');
  END IF;
  IF EXISTS (SELECT 1 FROM public.asaas_saidas WHERE asaas_id = v_id) THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true);
  END IF;

  v_norm := lower(public.unaccent(concat_ws(' ', v_desc, v_fav)));
  v_marca := jsonb_build_object('asaas_id', v_id, 'tipo', v_tipo, 'via', 'asaas_saida');
  v_nota := format('[Asaas] Pago pelo Asaas da BC em %s (%s %s).', to_char(v_data, 'DD/MM/YYYY'),
                   CASE WHEN v_tipo = 'conta' THEN 'pagamento de conta' ELSE 'Pix/transferência' END, v_id);

  -- 2) conta que o sistema já acompanha (boleto do e-mail ou do grupo)
  IF v_tipo = 'conta' THEN
    SELECT * INTO b FROM public.boleto_solicitacoes s
    WHERE s.status <> 'cancelado'
      AND (s.asaas_bill_id = v_id
           OR (v_linha IS NOT NULL AND (s.linha_digitavel = v_linha
               OR (length(s.linha_digitavel) = 48 AND length(v_linha) = 44
                   AND substr(s.linha_digitavel,1,11)||substr(s.linha_digitavel,13,11)||substr(s.linha_digitavel,25,11)||substr(s.linha_digitavel,37,11) = v_linha))))
    ORDER BY (s.asaas_bill_id = v_id) DESC LIMIT 1;
    IF FOUND THEN
      v_lanc := b.lancamento_id;
      IF b.status = 'pago' OR b.asaas_bill_id = v_id THEN
        v_trat := 'boleto';
        v_det := 'Boleto já acompanhado pelo sistema (' || coalesce(b.descricao, '') || ').';
      ELSE
        -- pago no app do Asaas: o pedido passa a ser do Asaas e dá baixa já (sem aviso duplo)
        UPDATE public.boleto_solicitacoes
        SET status = 'agendado', pagar_por = 'asaas', conta_bancaria_id = v_conta, asaas_bill_id = v_id,
            asaas_resposta = p -> 'payload', data_pagamento = v_data, valor_pagar = v_valor, erro = NULL,
            silenciar_aviso = true
        WHERE id = b.id;
        UPDATE public.boleto_solicitacoes SET silenciar_aviso = true WHERE id = b.id;
        PERFORM public.fn_boleto_confirmar_pagamento(b.id, true);
        v_trat := 'baixou';
        v_det := coalesce(b.descricao, 'Conta do boleto');
      END IF;
    END IF;
  END IF;

  -- 3) já lançada à mão na conta Asaas
  IF v_trat IS NULL THEN
    SELECT cp.lancamento_id, lf.descricao INTO l
    FROM public.contas_pagar cp JOIN public.lancamentos_financeiros lf ON lf.id = cp.lancamento_id
    WHERE cp.conta_bancaria_id = v_conta AND cp.status_pagamento = 'pago'
      AND abs(coalesce(cp.valor_final, cp.valor_pago, cp.valor_parcela) - v_valor) < 0.01
      AND abs(cp.data_pagamento - v_data) <= 3
      AND lf.status_lancamento <> 'cancelado'
      AND NOT EXISTS (SELECT 1 FROM public.asaas_saidas s WHERE s.lancamento_id = cp.lancamento_id)
    ORDER BY abs(cp.data_pagamento - v_data) LIMIT 1;
    IF FOUND THEN
      v_trat := 'ja_lancado';
      v_lanc := l.lancamento_id;
      v_det := l.descricao;
    END IF;
  END IF;

  -- favorecido conhecido / CNPJ do próprio grupo
  IF v_trat IS NULL AND v_tipo = 'transferencia' THEN
    IF v_doc IS NOT NULL AND EXISTS (SELECT 1 FROM public.pessoa_empresas pe
                                     WHERE regexp_replace(coalesce(pe.cnpj, ''), '[^0-9]', '', 'g') = v_doc) THEN
      v_fav_trat := 'transferencia_interna';
    ELSE
      SELECT ff.tratamento, ff.fornecedor_id INTO v_fav_trat, v_forn
      FROM public.financeiro_favorecidos ff
      WHERE lower(public.unaccent(coalesce(v_fav, ''))) LIKE ff.padrao || '%'
      ORDER BY length(ff.padrao) DESC LIMIT 1;
    END IF;
    IF v_fav_trat = 'transferencia_interna' THEN
      v_trat := 'transferencia_interna';
      v_det := 'Transferência entre contas do grupo (' || coalesce(v_fav, 'conta própria') || ').';
    END IF;
  END IF;

  -- 5) conta em aberto que bate
  IF v_trat IS NULL THEN
    -- imposto/contabilidade pela categoria (descrição que a Bruna digita + nome do órgão)
    IF v_tipo = 'conta' OR v_fav IS NULL THEN
      v_cat_cod := CASE
        WHEN v_norm ~ '\m(pis|cofins?)\M' THEN 'COFINS'
        WHEN v_norm ~ '\m(irpj|csll)\M' THEN 'IRPJ'
        WHEN v_norm ~ '\minss\M' THEN 'INSS'
        WHEN v_norm ~ '\mirrf\M' THEN 'IRRF'
        WHEN v_norm ~ '(issqn|\miss\M|gdf conta arrecadacao)' THEN 'ISS'
        WHEN v_norm ~ 'contab' THEN 'CONTABIL'
      END;
      v_par_cod := CASE
        WHEN v_cat_cod = 'COFINS' AND v_norm ~ '\mpis\M' THEN 'PIS'
        WHEN v_cat_cod = 'IRPJ' AND v_norm ~ '\mcsll\M' THEN 'CSLL'
      END;
    END IF;
    SELECT id INTO v_cat FROM public.categorias_contabeis WHERE codigo = v_cat_cod;

    IF v_forn IS NULL AND v_tipo = 'conta' AND v_banco IS NOT NULL THEN
      SELECT s.fornecedor_id INTO v_forn FROM public.boleto_solicitacoes s
      WHERE s.banco_codigo = v_banco AND s.fornecedor_id IS NOT NULL ORDER BY s.created_at DESC LIMIT 1;
    END IF;
    IF v_forn IS NULL AND v_fav IS NOT NULL THEN
      SELECT sg.fornecedor_id INTO v_forn FROM public.fn_financeiro_sugerir_fornecedor(v_doc, v_fav) sg
      WHERE sg.score >= 0.7 ORDER BY sg.score DESC LIMIT 1;
    END IF;

    IF v_cat IS NOT NULL OR v_forn IS NOT NULL THEN
      SELECT lf.id, lf.descricao, lf.valor_total, lf.lancamento_recorrente_id INTO l
      FROM public.lancamentos_financeiros lf
      WHERE lf.tipo_lancamento = 'despesa' AND NOT coalesce(lf.pago, false) AND lf.status_lancamento <> 'cancelado'
        AND ((v_cat IS NOT NULL AND lf.categoria_contabil_id = v_cat)
             OR (v_cat IS NULL AND lf.fornecedor_id = v_forn))
        AND coalesce(lf.data_vencimento, lf.data_competencia) BETWEEN v_data - 45 AND v_data + 20
        AND (coalesce(lf.valor_total, 0) = 0 OR abs(lf.valor_total - v_valor) <= greatest(lf.valor_total * 0.3, 1))
        AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = lf.id AND cp.status_pagamento = 'pago')
        AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes s
                        WHERE s.lancamento_id = lf.id AND s.status IN ('pagando', 'agendando', 'agendado'))
      ORDER BY
        -- conta fixa com o mesmo valor; depois a previsão do mês (valor 0); depois avulso igual
        (lf.lancamento_recorrente_id IS NOT NULL AND abs(coalesce(lf.valor_total, 0) - v_valor) < greatest(v_valor * 0.01, 0.01)) DESC,
        (lf.lancamento_recorrente_id IS NOT NULL AND coalesce(lf.valor_total, 0) = 0) DESC,
        (abs(coalesce(lf.valor_total, 0) - v_valor) < greatest(v_valor * 0.01, 0.01)) DESC,
        (lf.lancamento_recorrente_id IS NOT NULL) DESC,
        abs(coalesce(lf.data_vencimento, lf.data_competencia) - v_data)
      LIMIT 1;
      IF l.id IS NOT NULL THEN
        IF public.fn_financeiro_baixar_lancamento(l.id, v_valor, v_data, v_conta, v_nota, v_marca) THEN
          v_trat := 'baixou';
          v_lanc := l.id;
          v_det := l.descricao;
          -- avulso igual criado pelo grupo/e-mail para a mesma conta: era a mesma coisa
          IF l.lancamento_recorrente_id IS NOT NULL THEN
            UPDATE public.lancamentos_financeiros d
            SET status_lancamento = 'cancelado',
                observacoes = concat_ws(' ', d.observacoes, format('[Asaas] Cancelado: era a mesma conta de "%s", paga pelo Asaas em %s.', l.descricao, to_char(v_data, 'DD/MM/YYYY')))
            WHERE d.id = (SELECT d2.id FROM public.lancamentos_financeiros d2
                          WHERE d2.id <> l.id AND d2.lancamento_recorrente_id IS NULL AND NOT coalesce(d2.pago, false)
                            AND d2.status_lancamento = 'pre_lancamento' AND d2.tipo_lancamento = 'despesa'
                            AND abs(d2.valor_total - v_valor) < 0.01
                            AND ((v_cat IS NOT NULL AND d2.categoria_contabil_id = v_cat) OR (v_cat IS NULL AND d2.fornecedor_id = v_forn))
                            AND d2.created_at > now() - interval '30 days'
                            AND NOT EXISTS (SELECT 1 FROM public.contas_pagar cp WHERE cp.lancamento_id = d2.id AND cp.status_pagamento = 'pago')
                            AND NOT EXISTS (SELECT 1 FROM public.boleto_solicitacoes s WHERE s.lancamento_id = d2.id AND s.status NOT IN ('cancelado'))
                          ORDER BY d2.created_at DESC LIMIT 1)
            RETURNING d.arquivo_url INTO v_arq;
            IF FOUND THEN
              -- o PDF que veio pelo grupo/e-mail fica na conta fixa
              UPDATE public.lancamentos_financeiros SET arquivo_url = coalesce(arquivo_url, v_arq) WHERE id = l.id;
              v_det := v_det || ' (cancelei o pré-lançamento repetido da mesma conta)';
            END IF;
          END IF;
          -- boleto único: PIS vai junto com COFINS, CSLL junto com IRPJ
          IF v_par_cod IS NOT NULL THEN
            UPDATE public.lancamentos_financeiros d
            SET status_lancamento = 'cancelado',
                observacoes = concat_ws(' ', d.observacoes, format('[Asaas] Cancelado: pago no mesmo DARF de "%s" em %s.', l.descricao, to_char(v_data, 'DD/MM/YYYY')))
            WHERE d.id = (SELECT d2.id FROM public.lancamentos_financeiros d2
                          JOIN public.categorias_contabeis c2 ON c2.id = d2.categoria_contabil_id AND c2.codigo = v_par_cod
                          WHERE NOT coalesce(d2.pago, false) AND d2.status_lancamento <> 'cancelado'
                            AND coalesce(d2.valor_total, 0) = 0
                            AND coalesce(d2.data_vencimento, d2.data_competencia) BETWEEN v_data - 45 AND v_data + 20
                          ORDER BY abs(coalesce(d2.data_vencimento, d2.data_competencia) - v_data) LIMIT 1);
            IF FOUND THEN
              v_det := v_det || format(' (a previsão de %s foi junto no mesmo DARF)', v_par_cod);
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6) sócio sem conta que bata: retirada
  IF v_trat IS NULL AND v_fav_trat = 'retirada' THEN
    v_trat := 'retirada';
    v_det := 'Retirada (' || coalesce(v_fav, 'sócio') || ').';
  END IF;

  -- 7) pré-lançamento já pago
  IF v_trat IS NULL THEN
    IF v_forn IS NOT NULL THEN
      SELECT lf.categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios INTO v_base
      FROM public.lancamentos_financeiros lf
      WHERE lf.fornecedor_id = v_forn AND lf.status_lancamento = 'validado'
      ORDER BY lf.data_competencia DESC NULLS LAST, lf.created_at DESC LIMIT 1;
    END IF;
    IF v_base.categoria_contabil_id IS NULL AND v_cat IS NOT NULL THEN
      SELECT lf.categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios INTO v_base
      FROM public.lancamentos_financeiros lf
      WHERE lf.categoria_contabil_id = v_cat AND lf.status_lancamento = 'validado'
      ORDER BY lf.data_competencia DESC NULLS LAST, lf.created_at DESC LIMIT 1;
    END IF;
    IF v_base.categoria_contabil_id IS NULL THEN
      SELECT (SELECT id FROM public.categorias_contabeis WHERE codigo = '9.99') AS categoria_contabil_id,
             (SELECT id FROM public.centros_financeiros WHERE nome = 'BC FISIO' LIMIT 1) AS centro_financeiro_id,
             'individual'::text AS natureza_custo, false AS eh_divisao_socios
        INTO v_base;
    END IF;
    -- comissão, limpeza e funcionários: competência é o mês anterior ao pagamento (regra do dono)
    v_comp := CASE WHEN (SELECT codigo FROM public.categorias_contabeis WHERE id = v_base.categoria_contabil_id)
                        IN ('COMISSAO_PROF', 'SERV_LIMP', 'DESP_FUNC')
                   THEN date_trunc('month', v_data - interval '1 month')::date
                   ELSE date_trunc('month', v_data)::date END;
    v_desc_l := left(concat_ws(' - ',
      coalesce((SELECT coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social) FROM public.fornecedores f WHERE f.id = v_forn), v_fav,
               CASE WHEN v_tipo = 'conta' THEN 'Conta paga' ELSE 'Pix' END),
      v_desc, 'Asaas BC ' || to_char(v_data, 'DD/MM/YYYY')), 200);
    INSERT INTO public.lancamentos_financeiros (
      tipo_lancamento, data_emissao, data_competencia, data_vencimento, fornecedor_id, categoria_contabil_id,
      descricao, observacoes, valor_total, quantidade_parcelas, eh_divisao_socios, status_lancamento,
      origem_lancamento, dados_ia, centro_financeiro_id, natureza_custo, pago)
    VALUES (
      'despesa', v_data, v_comp, v_data, v_forn, v_base.categoria_contabil_id,
      v_desc_l, v_nota, v_valor, 1, coalesce(v_base.eh_divisao_socios, false), 'pre_lancamento',
      'api_ia', jsonb_build_object('origem', 'asaas_saida', 'asaas_saida', v_marca,
                                   'pagamento', jsonb_build_object('conta_bancaria_id', v_conta, 'data', v_data, 'valor_pago', v_valor) || v_marca),
      v_base.centro_financeiro_id, coalesce(v_base.natureza_custo, 'individual'), true)
    RETURNING id INTO v_lanc;
    v_trat := 'novo';
    v_det := v_desc_l;
  END IF;

  INSERT INTO public.asaas_saidas (asaas_id, tipo, conta_bancaria_id, valor, data, favorecido, favorecido_doc, descricao,
                                   linha_digitavel, payload, tratamento, lancamento_id, detalhe, origem, chatid, avisado_em)
  VALUES (v_id, v_tipo, v_conta, v_valor, v_data, v_fav, v_doc, v_desc, v_linha, p -> 'payload', v_trat, v_lanc, v_det,
          v_origem, v_chat, CASE WHEN v_origem = 'carga' THEN now() END);

  RETURN jsonb_build_object('ok', true, 'tratamento', v_trat, 'lancamento_id', v_lanc, 'detalhe', v_det);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_asaas_saida_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_asaas_saida_registrar(jsonb) TO service_role;

-- ---------------------------------------------------------------- aviso no grupo
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_pix_solicitacoes_para_avisar()'::regprocedure) INTO d;
  n := replace(d, $q$  RETURN v_pix || v_bol || v_grp;$q$, $q$  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'asaas_saida', 'id', s.id, 'chatid', s.chatid, 'status', s.tratamento,
      'saida', s.tipo, 'valor', s.valor, 'data', s.data, 'favorecido', s.favorecido,
      'descricao', s.descricao, 'detalhe', s.detalhe,
      'categoria', (SELECT c.nome FROM public.lancamentos_financeiros lf
                    JOIN public.categorias_contabeis c ON c.id = lf.categoria_contabil_id WHERE lf.id = s.lancamento_id))
      ORDER BY s.created_at), '[]'::jsonb)
  INTO v_sai
  FROM public.asaas_saidas s
  WHERE s.avisado_em IS NULL AND s.chatid IS NOT NULL AND s.created_at > now() - interval '2 days';

  RETURN v_pix || v_bol || v_grp || v_sai;$q$);
  n := replace(n, $q$  v_grp jsonb;$q$, $q$  v_grp jsonb;
  v_sai jsonb;$q$);
  IF position('v_sai jsonb;' in n) = 0 OR position('v_grp || v_sai' in n) = 0 THEN
    RAISE EXCEPTION 'fn_pix_solicitacoes_para_avisar: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

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
  UPDATE public.asaas_saidas SET avisado_em = now() WHERE id = p_id;
  IF FOUND THEN
    RETURN;
  END IF;
  UPDATE public.boleto_solicitacoes
  SET anunciado_em = coalesce(anunciado_em, now()),
      notificado_em = CASE WHEN anunciado_em IS NULL AND status <> 'agendado' THEN notificado_em ELSE now() END
  WHERE id = p_id;
END;
$$;

-- ---------------------------------------------------------------- juros contados duas vezes
-- calculate_valor_final faz valor_final = valor_pago + juros; a baixa do boleto gravava o total
-- (com juros) em valor_pago. Agora valor_pago = valor do boleto e juros = o que passou.
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_confirmar_pagamento(uuid,boolean,text)'::regprocedure) INTO d;
  n := replace(d, $q$        valor_pago = v_pago, juros = greatest(v_pago - s.valor, 0), valor_final = v_pago,$q$,
                  $q$        valor_pago = least(v_pago, s.valor), juros = greatest(v_pago - s.valor, 0),$q$);
  IF position('least(v_pago, s.valor)' in n) = 0 THEN
    RAISE EXCEPTION 'fn_boleto_confirmar_pagamento: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END
$do$;

UPDATE public.contas_pagar
SET valor_pago = valor_parcela
WHERE juros > 0 AND valor_parcela > 0 AND abs(valor_pago - (valor_parcela + juros)) < 0.01
  AND observacoes ILIKE '%Boleto recebido por e-mail%';

-- ---------------------------------------------------------------- conferência diária
-- 23:40 BRT: lista pela API as saídas dos últimos 3 dias (rede de segurança do webhook)
SELECT cron.unschedule('asaas-saidas-conferir') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'asaas-saidas-conferir');
SELECT cron.schedule('asaas-saidas-conferir', '40 2 * * *', $c$
  SELECT net.http_post(
    url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/asaas-saidas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', public.fn_email_boletos_token()),
    body := '{"conferir": true, "dias": 3}'::jsonb,
    timeout_milliseconds := 120000);
$c$);
