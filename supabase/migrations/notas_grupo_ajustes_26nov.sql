-- 26/11/2026: ajustes do grupo 🧾 de notas, a partir das mensagens do dia.
-- 1) Nota da Bio Bella (papel toalha, R$ 239): a leitura pôs o CNPJ da casa (destinatária) como emitente. O banco
--    tratou como comprovante de Pix, tirou o fornecedor certo (Bio Bella, casado pelo nome) e respondeu "Recebedor a
--    confirmar". Agora nota com itens, sem "comprovante" no tipo e com nome de emitente que não é da casa segue como
--    nota do fornecedor. No comprovante, o nome do recebedor só some quando é o nome da casa. A legenda só com número
--    ("173235") não vira descrição. No criar, o CNPJ da casa nunca "cura" o cadastro de um fornecedor.
-- 2) "@ju faz o pix da bio Bella" respondendo em cima da nota sem fornecedor: o fornecedor dito no pedido completa a
--    nota (antes a Ju respondia "A nota está sem fornecedor identificado" três vezes).
-- 3) Comprovante já lançado pelo extrato (Bruna, cafés pagos pelo Asaas para a Adyen): em vez de só "Isso já está
--    lançado: ADYEN…", o comprovante completa o lançamento do extrato (fornecedor, categoria, arquivo, legenda) e a
--    resposta diz de onde ele veio. A mensagem seguinte da pessoa ("boleto de cafés") e a resposta citando o robô
--    passam a completar esse lançamento.

-- ── 1 e 3: enriquecer ──
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_financeiro_enriquecer_prelancamento(uuid,text,text,jsonb)'::regprocedure);
  n := replace(d, '  v_corte      numeric;', '  v_corte      numeric;
  v_alvo       record;');

  -- legenda só com número não é descrição
  n := replace(n, $a$  -- 05/11/2026: comprovante de pagamento (o CNPJ lido é o da casa, que pagou): descrição da legenda.$a$,
$a$  -- 26/11/2026: legenda só com número ("173235") não é descrição
  IF v_descl !~ '[[:alpha:]]' THEN v_descl := NULL; END IF;

  -- 05/11/2026: comprovante de pagamento (o CNPJ lido é o da casa, que pagou): descrição da legenda.$a$);

  -- nota com itens e CNPJ da casa como emitente: é nota do fornecedor, não comprovante
  n := replace(n, $a$  -- 09/11/2026: fornecedor = recebedor (quando a leitura trouxer); sem ele volta para "A classificar".
  IF regexp_replace($a$,
$a$  -- 09/11/2026: fornecedor = recebedor (quando a leitura trouxer); sem ele volta para "A classificar".
  -- 26/11/2026: nota com itens, sem "comprovante" no tipo e com emitente que não é a casa = CNPJ da casa (destinatária)
  -- lido no lugar do emitente. Segue como nota do fornecedor (casado pelo nome no criar).
  IF regexp_replace(coalesce(l.dados_ia #>> '{emitente,cnpj}', ''), '\D', '', 'g')
       IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM public.pessoa_empresas WHERE cnpj IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.lancamento_itens i WHERE i.lancamento_id = l.id)
     AND coalesce(l.dados_ia #>> '{documento,tipo}', '') !~* 'comprovante'
     AND nullif(btrim(coalesce(l.dados_ia #>> '{emitente,razao_social}', '')), '') IS NOT NULL
     AND (l.dados_ia #>> '{emitente,razao_social}') !~* '(bc\s*fisio|respira\s*kids|pacheco)' THEN
    UPDATE public.lancamentos_financeiros
       SET dados_ia = dados_ia || jsonb_build_object('cnpj_da_casa_como_emitente', true),
           descricao = CASE WHEN v_descl IS NOT NULL AND (descricao LIKE 'Nota sem emitente%' OR descricao ~* '\.(jpe?g|png|pdf|webp|heic)$')
                            THEN v_descl ELSE descricao END
     WHERE id = l.id;
  ELSIF regexp_replace($a$);

  -- recebedor com o CNPJ da casa: some o documento, o nome só se for o da casa
  n := replace(n, $a$      v_receb_doc := NULL; v_receb_nome := NULL;$a$,
$a$      v_receb_doc := NULL;
      IF v_receb_nome ~* '(bc\s*fisio|respira\s*kids|pacheco)' THEN v_receb_nome := NULL; END IF;$a$);

  -- duplicado do extrato: o comprovante completa o lançamento que já existe
  n := replace(n, $a$    RETURN jsonb_build_object('ok', false, 'duplicado', true, 'lancamento_id', v_dup.lancamento_id,
      'duplicado_descricao', v_dup.descricao, 'duplicado_data', v_dup.data_ref);$a$,
$a$    -- 26/11/2026 (Bruna, cafés pagos pelo Asaas): o comprovante completa o lançamento que já existe
    UPDATE public.lancamentos_financeiros
       SET dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('duplicado_de', v_dup.lancamento_id)
     WHERE id = l.id;
    SELECT * INTO v_alvo FROM public.lancamentos_financeiros WHERE id = v_dup.lancamento_id;
    IF v_alvo.status_lancamento = 'pre_lancamento' THEN
      UPDATE public.lancamentos_financeiros
         SET fornecedor_id = coalesce(fornecedor_id, l.fornecedor_id),
             categoria_contabil_id = CASE WHEN categoria_contabil_id = v_a_class AND l.categoria_contabil_id IS DISTINCT FROM v_a_class
                                          THEN l.categoria_contabil_id ELSE categoria_contabil_id END,
             descricao = CASE WHEN v_descl IS NOT NULL AND position(lower(v_descl) IN lower(descricao)) = 0
                              THEN left(v_descl || ' - ' || descricao, 250) ELSE descricao END,
             arquivo_url = coalesce(arquivo_url, l.arquivo_url),
             observacoes = concat_ws(' ', observacoes, '[WhatsApp] Comprovante enviado no grupo por '
                             || coalesce(v_rem, nullif(p_whatsapp ->> 'remetente', ''), '?') || '.'),
             dados_ia = coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('comprovante_whatsapp', jsonb_build_object(
                          'lancamento_cancelado', l.id, 'recebedor', l.dados_ia -> 'recebedor', 'whatsapp', p_whatsapp))
       WHERE id = v_alvo.id;
      SELECT * INTO v_alvo FROM public.lancamentos_financeiros WHERE id = v_dup.lancamento_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'duplicado', true, 'lancamento_id', v_dup.lancamento_id,
      'duplicado_descricao', coalesce(v_alvo.descricao, v_dup.descricao), 'duplicado_data', v_dup.data_ref,
      'duplicado_valor', coalesce(v_alvo.valor_total, l.valor_total),
      'duplicado_editavel', coalesce(v_alvo.status_lancamento = 'pre_lancamento', false),
      'duplicado_origem', CASE WHEN v_alvo.dados_ia ->> 'origem' = 'asaas_saida'
                               THEN CASE WHEN v_alvo.dados_ia #>> '{pagamento,banco}' = 'inter' THEN 'extrato do Inter' ELSE 'extrato do Asaas' END END,
      'duplicado_sem_descricao', coalesce(v_alvo.status_lancamento = 'pre_lancamento' AND v_alvo.fornecedor_id IS NULL
                                          AND v_alvo.categoria_contabil_id = v_a_class, false),
      'recebedor_nome', coalesce(v_receb_nome, nullif(btrim(l.dados_ia #>> '{recebedor,nome}'), '')));$a$);

  IF n = d OR strpos(n, 'v_alvo       record') = 0 OR strpos(n, 'legenda só com número') = 0
     OR strpos(n, 'cnpj_da_casa_como_emitente') = 0 OR strpos(n, 'v_receb_doc := NULL;
      IF v_receb_nome') = 0 OR strpos(n, 'duplicado_sem_descricao') = 0 THEN
    RAISE EXCEPTION 'enriquecer: trecho não encontrado';
  END IF;
  EXECUTE n;

  -- criar: o CNPJ da casa nunca vai para o cadastro do fornecedor
  d := pg_get_functiondef('public.fn_financeiro_criar_prelancamento(uuid)'::regprocedure);
  n := replace(d, $a$  -- o CNPJ do papel cura o cadastro: fornecedor casado por nome ganha o documento
  IF v_forn IS NOT NULL AND v_cnpj IS NOT NULL THEN$a$,
$a$  -- o CNPJ do papel cura o cadastro: fornecedor casado por nome ganha o documento
  -- 26/11/2026: nunca o CNPJ da casa (destinatária lida como emitente)
  IF v_cnpj IN (SELECT public.fn_normalizar_documento(cnpj) FROM public.pessoa_empresas WHERE cnpj IS NOT NULL) THEN
    v_cnpj := NULL;
  END IF;
  IF v_forn IS NOT NULL AND v_cnpj IS NOT NULL THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'criar: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ── 3: a mensagem seguinte da pessoa completa o lançamento que o comprovante dela encontrou ──
CREATE OR REPLACE FUNCTION public.fn_financeiro_prelancamentos_recentes(p_sender text, p_minutos integer DEFAULT 20)
 RETURNS TABLE(lancamento_id uuid, descricao text, valor numeric, fornecedor_nome text, categoria_nome text, pagador_informado boolean, minutos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH alvo AS (
    -- notas da pessoa nos últimos minutos
    SELECT l.id, l.created_at AS quando
      FROM public.lancamentos_financeiros l
     WHERE nullif(p_sender, '') IS NOT NULL
       AND l.status_lancamento = 'pre_lancamento'
       AND l.origem_lancamento = 'api_ia'
       AND l.created_at >= now() - make_interval(mins => greatest(p_minutos, 1))
       AND l.dados_ia #>> '{whatsapp,sender}' = p_sender
    UNION
    -- 26/11/2026: comprovante dela que caiu num lançamento já existente (extrato)
    SELECT (x.dados_ia ->> 'duplicado_de')::uuid, x.created_at
      FROM public.lancamentos_financeiros x
     WHERE nullif(p_sender, '') IS NOT NULL
       AND x.status_lancamento = 'cancelado'
       AND x.dados_ia ? 'duplicado_de'
       AND x.created_at >= now() - make_interval(mins => greatest(p_minutos, 1))
       AND x.dados_ia #>> '{whatsapp,sender}' = p_sender
  )
  SELECT l.id, l.descricao, l.valor_total,
         coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
         c.nome,
         coalesce(l.observacoes, '') NOT LIKE '%Pago por: não informado.%',
         floor(extract(epoch FROM now() - max(a.quando)) / 60)::int
    FROM alvo a
    JOIN public.lancamentos_financeiros l ON l.id = a.id AND l.status_lancamento = 'pre_lancamento'
    JOIN public.categorias_contabeis c ON c.id = l.categoria_contabil_id
    LEFT JOIN public.fornecedores f ON f.id = l.fornecedor_id
   GROUP BY l.id, l.descricao, l.valor_total, f.nome_fantasia, f.nome_razao_social, c.nome, l.observacoes
   ORDER BY max(a.quando) DESC
   LIMIT 5;
$function$;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_financeiro_complementar_prelancamento(text,text,text,text,text,integer)'::regprocedure);
  n := replace(d, $a$    WHERE nullif(p_sender, '') IS NOT NULL
      AND l.status_lancamento = 'pre_lancamento'
      AND l.origem_lancamento = 'api_ia'
      AND l.created_at >= now() - make_interval(mins => greatest(p_minutos, 1))
      AND l.dados_ia #>> '{whatsapp,sender}' = p_sender$a$,
$a$    WHERE l.id IN (SELECT x.lancamento_id FROM public.fn_financeiro_prelancamentos_recentes(p_sender, p_minutos) x)$a$);
  IF n = d THEN RAISE EXCEPTION 'complementar: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ── 2: o fornecedor dito no "@ju paga…" completa a nota citada que ficou sem fornecedor ──
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_preparar_pix(uuid,text,text,numeric,text,text,text)'::regprocedure);
  n := replace(d, $a$  IF l.fornecedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A nota está sem fornecedor identificado. Ajuste no sistema ou diga o fornecedor.');
  END IF;$a$,
$a$  -- 26/11/2026: nota citada sem fornecedor, mas o pedido diz qual é ("@ju faz o pix da Bio Bella")
  IF l.fornecedor_id IS NULL AND p_lancamento_id IS NOT NULL AND nullif(btrim(coalesce(p_fornecedor, '')), '') IS NOT NULL THEN
    SELECT x.fornecedor_id, x.score INTO v_forn, v_score
      FROM public.fn_financeiro_sugerir_fornecedor(NULL, p_fornecedor) x ORDER BY x.score DESC LIMIT 1;
    IF v_forn IS NULL OR v_score < 0.5 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Não achei o fornecedor "' || p_fornecedor || '" no cadastro');
    END IF;
    UPDATE public.lancamentos_financeiros
       SET fornecedor_id = v_forn,
           observacoes = concat_ws(' ', observacoes, '[@ju] ' || coalesce(p_solicitante, '?') || ' disse o fornecedor no pedido de Pix.')
     WHERE id = l.id;
    SELECT lf.*, coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social) AS forn_nome, f.chave_pix
      INTO l
      FROM public.lancamentos_financeiros lf
      LEFT JOIN public.fornecedores f ON f.id = lf.fornecedor_id
     WHERE lf.id = v_ids[1];
  END IF;
  IF l.fornecedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A nota está sem fornecedor identificado. Diga o fornecedor no pedido (ex.: "@ju paga a Bio Bella pelo Inter") ou ajuste no sistema.');
  END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'preparar_pix: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;
