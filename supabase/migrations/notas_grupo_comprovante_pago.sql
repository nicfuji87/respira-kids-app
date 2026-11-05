-- AI dev note: 05/11/2026 (caso pro-pés R$ 210,27, Bruna no grupo de notas). Correções aprovadas pelo dono:
-- 1. Comprovante de pagamento (o CNPJ lido é o da BC ou da F.S Pacheco = pagadora): não vira fornecedor; a descrição
--    sai da legenda ("Compra de 20 pacotes de propes") e o recebedor entra quando o extrato chegar.
-- 2. "Pago do Inter / Nubank / Asaas" na legenda: o pré-lançamento já nasce pago naquela conta (dados_ia.pagamento),
--    igual ao Pix da @ju. A leitura do extrato reconhece (ja_lancado) e não duplica. Se o extrato chegou antes,
--    o pré-lançamento dele é juntado a este e cancelado.
-- 3. Remetente sem nome (senderName vazio na uazapi): nome da equipe pelo telefone (fn_ju_equipe_por_telefone).
-- 4. Resposta citando a nota no grupo dizendo o que ela é: fn_financeiro_complementar_citado (descrição + categoria).

CREATE OR REPLACE FUNCTION public.fn_financeiro_conta_do_pagador(p_obs text)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN coalesce(p_obs, '') ~ 'Pago por: Cartão de crédito' THEN NULL
    WHEN coalesce(p_obs, '') ~ 'Pago por: Inter da Clínica' THEN '8a764401-2885-4cb3-a973-b575a6f25149'::uuid
    WHEN coalesce(p_obs, '') ~ 'Pago por: Nubank da Clínica' THEN 'ac6e9696-7267-4d25-9ab0-c4f7b3112158'::uuid
    WHEN coalesce(p_obs, '') ~ 'Pago por: Asaas da BC' THEN 'f4f078ea-9471-4b7d-8ef1-ec40ca20bd82'::uuid
  END;
$$;

-- junta o pré-lançamento da nota (WhatsApp) com a saída do extrato do mesmo pagamento
CREATE OR REPLACE FUNCTION public.fn_financeiro_juntar_saida(p_lancamento_id uuid, p_saida_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE s asaas_saidas; l lancamentos_financeiros; v_forn uuid; v_outro uuid;
BEGIN
  SELECT * INTO s FROM asaas_saidas WHERE id = p_saida_id;
  SELECT * INTO l FROM lancamentos_financeiros WHERE id = p_lancamento_id;
  IF s.id IS NULL OR l.id IS NULL THEN RETURN; END IF;
  v_outro := CASE WHEN s.lancamento_id <> l.id THEN s.lancamento_id END;
  IF l.fornecedor_id IS NULL AND s.favorecido_doc IS NOT NULL THEN
    SELECT id INTO v_forn FROM fornecedores
     WHERE ativo AND regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = regexp_replace(s.favorecido_doc, '\D', '', 'g')
       AND regexp_replace(s.favorecido_doc, '\D', '', 'g') NOT IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM pessoa_empresas WHERE cnpj IS NOT NULL)
     LIMIT 1;
  END IF;
  UPDATE lancamentos_financeiros
     SET fornecedor_id = coalesce(fornecedor_id, v_forn),
         descricao = CASE WHEN s.favorecido IS NOT NULL AND position(lower(s.favorecido) IN lower(descricao)) = 0
                               AND l.fornecedor_id IS NULL AND v_forn IS NULL
                          THEN left(descricao || ' - ' || s.favorecido, 250) ELSE descricao END,
         pago = true,
         dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('pagamento',
           coalesce((SELECT o.dados_ia -> 'pagamento' FROM lancamentos_financeiros o WHERE o.id = v_outro),
                    jsonb_build_object('via', 'asaas_saida', 'data', s.data, 'tipo', s.tipo, 'banco', s.banco,
                                       'asaas_id', s.asaas_id, 'valor_pago', s.valor, 'conta_bancaria_id', s.conta_bancaria_id))),
         observacoes = concat_ws(' ', observacoes, '[Extrato] Pagamento conferido no extrato (' || coalesce(s.banco, '') || ', '
                       || to_char(s.data, 'DD/MM/YYYY') || coalesce(', para ' || s.favorecido, '') || ').'),
         updated_at = now()
   WHERE id = l.id;
  IF v_outro IS NOT NULL THEN
    UPDATE lancamentos_financeiros
       SET status_lancamento = 'cancelado',
           observacoes = concat_ws(' ', observacoes, '[WhatsApp] Cancelado automaticamente: o mesmo pagamento já veio pela nota do grupo ("'
                         || (SELECT descricao FROM lancamentos_financeiros WHERE id = l.id) || '").'),
           updated_at = now()
     WHERE id = v_outro AND status_lancamento = 'pre_lancamento';
  END IF;
  UPDATE asaas_saidas SET lancamento_id = l.id, tratamento = 'ja_lancado',
         detalhe = (SELECT descricao FROM lancamentos_financeiros WHERE id = l.id)
   WHERE id = s.id;
END $$;
REVOKE ALL ON FUNCTION public.fn_financeiro_juntar_saida(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- enriquecer: remetente, comprovante, pago na legenda e saída do extrato que chegou antes
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_financeiro_enriquecer_prelancamento'::regproc);
  a text := $a$  SELECT id INTO v_a_class FROM public.categorias_contabeis WHERE codigo = '9.99';

  v_texto := concat_ws(' ',$a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_financeiro_enriquecer_prelancamento: trecho não encontrado'; END IF;
  d := replace(d, $a$  v_origem_cat text;
BEGIN$a$, $a$  v_origem_cat text;
  v_rem        text;
  v_conta      uuid;
  v_descl      text;
  v_saida      uuid;
BEGIN$a$);
  d := replace(d, a, $a$  -- 05/11/2026: quem mandou (a uazapi às vezes manda sem nome)
  v_rem := nullif(btrim(coalesce(p_whatsapp ->> 'remetente', '')), '');
  IF v_rem IS NULL AND nullif(p_whatsapp ->> 'sender', '') IS NOT NULL THEN
    v_rem := array_to_string((string_to_array(btrim(public.fn_ju_equipe_por_telefone(split_part(p_whatsapp ->> 'sender', '@', 1)) ->> 'nome'), ' '))[1:2], ' ');
    IF nullif(v_rem, '') IS NOT NULL THEN
      UPDATE public.lancamentos_financeiros
         SET observacoes = replace(observacoes, 'Enviado no grupo por ? ', 'Enviado no grupo por ' || v_rem || ' '),
             dados_ia = jsonb_set(dados_ia, '{whatsapp,remetente}', to_jsonb(v_rem))
       WHERE id = l.id;
    END IF;
  END IF;

  -- 05/11/2026: comprovante de pagamento (o CNPJ lido é o da casa, que pagou): descrição da legenda, sem fornecedor
  IF regexp_replace(coalesce(l.dados_ia #>> '{emitente,cnpj}', ''), '\D', '', 'g')
       IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM public.pessoa_empresas WHERE cnpj IS NOT NULL) THEN
    v_descl := left(nullif(btrim(split_part(regexp_replace(coalesce(p_dica, ''), '\s+', ' ', 'g'), '.', 1)), ''), 120);
    UPDATE public.lancamentos_financeiros
       SET descricao = coalesce(v_descl, 'Pagamento (fornecedor a confirmar)'),
           fornecedor_id = CASE WHEN fornecedor_id IN (SELECT f.id FROM public.fornecedores f
                                                        WHERE regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g')
                                                              IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM public.pessoa_empresas WHERE cnpj IS NOT NULL))
                                THEN NULL ELSE fornecedor_id END,
           dados_ia = dados_ia || jsonb_build_object('comprovante_pagamento', true)
     WHERE id = l.id;
  END IF;

  -- 05/11/2026: "pago do Inter / Nubank / Asaas": já nasce pago na conta, para o extrato reconhecer
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  v_conta := public.fn_financeiro_conta_do_pagador(l.observacoes);
  IF v_conta IS NOT NULL AND NOT coalesce(l.pago, false) THEN
    UPDATE public.lancamentos_financeiros
       SET pago = true,
           dados_ia = dados_ia || jsonb_build_object('pagamento', jsonb_build_object(
             'via', 'whatsapp', 'data', coalesce(l.data_emissao, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
             'valor_pago', l.valor_total, 'conta_bancaria_id', v_conta))
     WHERE id = l.id;
    -- o extrato chegou antes: junta e cancela o pré-lançamento dele
    SELECT s.id INTO v_saida
      FROM public.asaas_saidas s JOIN public.lancamentos_financeiros o ON o.id = s.lancamento_id
     WHERE s.conta_bancaria_id = v_conta AND abs(s.valor - l.valor_total) < 0.01
       AND abs(s.data - coalesce(l.data_emissao, (now() AT TIME ZONE 'America/Sao_Paulo')::date)) <= 3
       AND s.tratamento = 'novo' AND o.status_lancamento = 'pre_lancamento' AND o.id <> l.id
       AND o.dados_ia ->> 'origem' = 'asaas_saida'
     ORDER BY abs(s.data - coalesce(l.data_emissao, (now() AT TIME ZONE 'America/Sao_Paulo')::date)) LIMIT 1;
    IF v_saida IS NOT NULL THEN
      PERFORM public.fn_financeiro_juntar_saida(l.id, v_saida);
    END IF;
  END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;

$a$ || a);
  EXECUTE d;
END $do$;

-- extrato chega depois de uma nota já paga: completa a nota com o recebedor
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_asaas_saida_registrar'::regproc);
  a text := $a$    ORDER BY lf.created_at DESC LIMIT 1;
    IF FOUND THEN
      v_trat := 'ja_lancado';
      v_lanc := l.lancamento_id;
      v_det := l.descricao;
    END IF;$a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_asaas_saida_registrar: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, $a$    ORDER BY lf.created_at DESC LIMIT 1;
    IF FOUND THEN
      v_trat := 'ja_lancado';
      v_lanc := l.lancamento_id;
      v_det := l.descricao;
      -- 05/11/2026: nota do grupo (comprovante) sem fornecedor: o recebedor do extrato completa
      IF v_fav IS NOT NULL AND EXISTS (SELECT 1 FROM public.lancamentos_financeiros x
                                        WHERE x.id = l.lancamento_id AND x.fornecedor_id IS NULL
                                          AND x.dados_ia -> 'pagamento' ->> 'via' = 'whatsapp') THEN
        UPDATE public.lancamentos_financeiros x
           SET fornecedor_id = coalesce(x.fornecedor_id, (SELECT f.id FROM public.fornecedores f
                                 WHERE f.ativo AND v_doc IS NOT NULL
                                   AND regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') = v_doc LIMIT 1)),
               descricao = CASE WHEN position(lower(v_fav) IN lower(x.descricao)) = 0
                                THEN left(x.descricao || ' - ' || v_fav, 250) ELSE x.descricao END,
               observacoes = concat_ws(' ', x.observacoes, '[Extrato] Pagamento conferido no extrato (' || v_bco || ', '
                             || to_char(v_data, 'DD/MM/YYYY') || ', para ' || v_fav || ').'),
               updated_at = now()
         WHERE x.id = l.lancamento_id;
        v_det := (SELECT descricao FROM public.lancamentos_financeiros WHERE id = l.lancamento_id);
      END IF;
    END IF;$a$);
END $do$;

-- resposta citando a nota no grupo dizendo o que ela é
CREATE OR REPLACE FUNCTION public.fn_financeiro_complementar_citado(p_lancamento_id uuid, p_texto text, p_remetente text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  r lancamentos_financeiros; c record; v_a_class uuid; v_txt text := left(btrim(coalesce(p_texto, '')), 150);
  v_desc text; v_cat uuid; v_casa boolean;
BEGIN
  SELECT * INTO r FROM lancamentos_financeiros WHERE id = p_lancamento_id;
  IF r.id IS NULL OR r.status_lancamento <> 'pre_lancamento' OR v_txt = '' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT id INTO v_a_class FROM categorias_contabeis WHERE codigo = '9.99';
  -- descrição que era só o nome da casa (comprovante lido como nota) é trocada; nas outras o texto entra na frente
  v_casa := r.descricao ~* '^(BC FISIO KIDS|F\.?S\.? PACHECO|Pagamento \(fornecedor a confirmar\))';
  v_desc := CASE WHEN v_casa THEN v_txt
                 WHEN position(lower(v_txt) IN lower(r.descricao)) > 0 THEN r.descricao
                 ELSE left(v_txt || ' - ' || r.descricao, 250) END;
  SELECT * INTO c FROM fn_financeiro_classificar_por_historico(v_txt, r.fornecedor_id) LIMIT 1;
  v_cat := r.categoria_contabil_id;
  IF c.categoria_id IS NOT NULL AND (c.confianca >= 0.4 OR (r.categoria_contabil_id = v_a_class AND c.confianca >= 0.15)) THEN
    v_cat := c.categoria_id;
  END IF;
  UPDATE lancamentos_financeiros
     SET descricao = v_desc, categoria_contabil_id = v_cat,
         observacoes = concat_ws(' ', observacoes, '[WhatsApp] ' || coalesce(nullif(p_remetente, ''), 'Equipe') || ' respondeu no grupo: "' || v_txt || '".'),
         dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('complemento_whatsapp',
           coalesce(dados_ia -> 'complemento_whatsapp', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('texto', v_txt, 'remetente', p_remetente))),
         updated_at = now()
   WHERE id = r.id;
  IF v_cat IS DISTINCT FROM r.categoria_contabil_id THEN
    UPDATE lancamento_itens SET categoria_contabil_id = v_cat WHERE lancamento_id = r.id AND categoria_contabil_id = r.categoria_contabil_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'descricao', v_desc, 'valor', r.valor_total,
    'categoria_nome', (SELECT nome FROM categorias_contabeis WHERE id = v_cat),
    'categoria_mudou', v_cat IS DISTINCT FROM r.categoria_contabil_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_financeiro_complementar_citado(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_complementar_citado(uuid, text, text) TO service_role;
