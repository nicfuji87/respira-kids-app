-- 09/11/2026 (pedido do dono: o robô do grupo de notas classificava errado — Uber como INSS, fralda da Amazon como Alexa).
-- Causas: palavras de pagamento/pessoas da legenda entravam na comparação ("Inter empresas" → "INSS EMPRESA",
-- "cartão Nicolas" → "Marketing (Nicolas)"), lançamentos recorrentes lotavam os vizinhos, e a moda de fornecedor
-- marketplace mandava (Amazon = 93% Alexa). Comprovante de Pix: a leitura põe a BC (pagadora) como emitente.
-- Mudanças:
--   1. fn_financeiro_texto_para_classificar: tira pagamento, pessoas, NF, números e nome de arquivo do texto.
--   2. fn_financeiro_classificar_por_historico: limpa alvo e base, conta texto repetido 1x, e tributos/assinaturas/
--      folha/aluguel/condomínio/contabilidade só votam se o vizinho for do mesmo fornecedor.
--   3. fornecedores.multicategoria (Amazon, Shopee, Mercado Livre...) + fn_financeiro_categoria_do_fornecedor
--      (só validados; multicategoria ou moda < 60% → sem sugestão). A antiga fn_financeiro_categoria_sugerida
--      continua para os boletos.
--   4. fn_financeiro_sugerir_fornecedor: nome do fornecedor no começo do nome lido ("Uber do Brasil Tecnologia" → Uber),
--      só para fornecedor com 3+ lançamentos validados (há fornecedores com nome de pessoa: Maria, Daniel...).
--   5. criar/enriquecer: comprovante usa o recebedor (quando a leitura trouxer) e volta para "A classificar" ao tirar
--      o fornecedor; marketplace classifica pelo item + legenda, sem o nome da loja; pagamento de fatura de cartão
--      não vira categoria (aviso nas observações); "foto.jpg" vira a 1ª frase da legenda; "NF" só em nota fiscal.

ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS multicategoria boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.fornecedores.multicategoria IS
  'Loja que vende de tudo (marketplace/supermercado): a categoria vem do item comprado, não da moda do fornecedor.';
UPDATE public.fornecedores SET multicategoria = true
 WHERE id IN ('ce40092b-652a-41bb-a61c-3309933c3918',  -- Amazon
              '6cf3670c-177e-4594-b734-705ff15a6aea',  -- Shopee
              '28596c5c-d095-478f-bcc3-d55701034139',  -- Mercado Livre
              '8f46369c-73b8-4d9c-9e17-7bea5eaf7bb3',  -- MercadoPago
              '510f719d-3e5f-4d2e-abc1-93daa42bb0b3',  -- Magalu
              '014d29d5-ba5c-4588-8f9a-9bf7baeeb6b8',  -- AliExpress
              '2209058b-ab8e-4180-8f6b-e826eed39118',  -- SHEIN
              '4cd46233-555e-437c-9b95-d534fd6c35f6',  -- Ifood
              '52276ccf-ffb8-4fb8-8183-169fb869d450',  -- Avulso
              '1869e7bd-54b7-4763-8e0d-08b128a4023c',  -- Leroy Merlin
              '59189916-ab80-4ba6-a016-641d9320471a',  -- Comper
              '072911f5-1769-428f-868d-ef1c49add8a1',  -- VMB Supermercados
              'b3993b5f-5e95-4cb6-9905-1ad420e27b64',  -- Sou Super
              '1630d448-b1f9-4bdc-9e5c-fad871e0dfcd',  -- Mikami
              '49bb757a-ef71-417b-aa22-275e28de706b'); -- Kalunga

-- 1. texto limpo para comparar
CREATE OR REPLACE FUNCTION public.fn_financeiro_texto_para_classificar(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(coalesce(p, '')),
    '\s-\s\d{2}/\d{4}|\(reembols[^)]*\)', ' ', 'g'),                         -- " - 10/2026", "(reembolsar ...)"
    '\mnf(c?-?e)?\s*(n[ºo°.]*\s*)?[0-9][0-9./-]*', ' ', 'g'),                 -- NF 123 / NFC-e 456
    '[^[:space:]]+\.(jpe?g|png|pdf|webp|heic)\M', ' ', 'g'),                  -- foto.jpg
    '@ju\M', ' ', 'g'),
    '\m(pag[oa]s?|paguei|pagamos|pagamento|pix|inter|empresas?|nubank|asaas|cart[aã]o|cr[eé]dito|d[eé]bito|cl[ií]nica|reembols\w*|lan[cç]ar|nicolas|bruna|cury|fl[aá]via|lol[oô]|alorrani|julio|adnet|via|pelo|pela|conta|banco|whatsapp|comprad[oa]s?|compra|no|na|com|por|do|da|de|para|pra|o|a|e)\M', ' ', 'g'),
    '[0-9]+([.,/:-][0-9]+)*|r\$', ' ', 'g'));
$$;

-- 2. classificação por histórico
CREATE OR REPLACE FUNCTION public.fn_financeiro_classificar_por_historico(p_texto text, p_fornecedor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria_id uuid, categoria_codigo text, categoria_nome text, confianca numeric, votos integer, exemplo text, fornecedor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH alvo AS (
    SELECT public.fn_normalizar_nome_empresa(public.fn_financeiro_texto_para_classificar(p_texto)) AS t
  ), excl AS (
    -- não vêm por foto de nota: só votam quando o vizinho é do mesmo fornecedor (ex.: Receita Federal)
    SELECT c.id FROM public.categorias_contabeis c
    LEFT JOIN public.categorias_contabeis pc ON pc.id = c.categoria_pai_id
    WHERE pc.codigo = 'DESP_TRIB'
       OR c.codigo IN ('9.99', 'ALEXA', 'WYZE', 'SISTEMA_ASSIN', 'DESP_FUNC', 'BOLSA_ESTAGIO', 'COMISSAO_PROF',
                       'VT_ESTAGIO', 'ALUGUEL', 'CONDOMINIO', 'CONTABIL')
  ), base0 AS (
    SELECT l.categoria_contabil_id AS cat, l.fornecedor_id AS forn, l.descricao AS texto, l.data_competencia
    FROM public.lancamentos_financeiros l
    WHERE l.status_lancamento = 'validado' AND l.tipo_lancamento = 'despesa'
    UNION ALL
    SELECT coalesce(i.categoria_contabil_id, l.categoria_contabil_id), l.fornecedor_id, i.descricao, l.data_competencia
    FROM public.lancamento_itens i
    JOIN public.lancamentos_financeiros l ON l.id = i.lancamento_id
    WHERE l.status_lancamento = 'validado' AND l.tipo_lancamento = 'despesa'
  ), base AS (
    -- texto repetido (mensalidades, "Amazon Music") conta uma vez por categoria
    SELECT DISTINCT ON (b.cat, n.d) b.cat, b.forn, b.texto, n.d, b.data_competencia
    FROM base0 b
    CROSS JOIN LATERAL (SELECT public.fn_normalizar_nome_empresa(public.fn_financeiro_texto_para_classificar(b.texto)) AS d) n
    WHERE length(n.d) >= 3
      AND (b.cat NOT IN (SELECT id FROM excl) OR (p_fornecedor_id IS NOT NULL AND b.forn = p_fornecedor_id))
    ORDER BY b.cat, n.d, (b.forn IS NOT DISTINCT FROM p_fornecedor_id) DESC, b.data_competencia DESC
  ), viz AS (
    SELECT b.cat, b.forn, b.texto,
           greatest(
             similarity(a.t, b.d),
             word_similarity(a.t, b.d),
             word_similarity(b.d, a.t)
           ) * CASE WHEN p_fornecedor_id IS NOT NULL AND b.forn = p_fornecedor_id THEN 1.5 ELSE 1 END AS peso
    FROM base b
    CROSS JOIN alvo a
    WHERE length(a.t) >= 3
    ORDER BY 4 DESC, b.data_competencia DESC
    LIMIT 15
  ), forte AS (
    SELECT * FROM viz WHERE peso >= 0.3
  ), total AS (
    SELECT sum(peso) AS s FROM forte
  ), por_cat AS (
    SELECT f.cat,
           sum(f.peso) AS s,
           max(f.peso) AS melhor,
           count(*)::int AS n,
           (array_agg(f.texto ORDER BY f.peso DESC))[1] AS exemplo,
           mode() WITHIN GROUP (ORDER BY f.forn) FILTER (WHERE f.peso >= 0.6) AS forn
    FROM forte f
    GROUP BY f.cat
  )
  SELECT c.id, c.codigo, c.nome,
         round(least(1, (p.s / t.s) * least(p.melhor, 1))::numeric, 2),
         p.n, p.exemplo, p.forn
  FROM por_cat p
  CROSS JOIN total t
  JOIN public.categorias_contabeis c ON c.id = p.cat
  ORDER BY 4 DESC
  LIMIT 3;
$function$;

-- 3. categoria do fornecedor (notas do grupo/upload): só validados; marketplace ou moda < 60% → nada
CREATE OR REPLACE FUNCTION public.fn_financeiro_categoria_do_fornecedor(p_fornecedor_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE WHEN f.multicategoria THEN NULL
              WHEN s.tot >= 5 AND s.top::numeric / s.tot < 0.6 THEN NULL
              ELSE s.cat END
  FROM public.fornecedores f
  LEFT JOIN LATERAL (
    SELECT l.categoria_contabil_id AS cat, count(*) AS top, sum(count(*)) OVER () AS tot
    FROM public.lancamentos_financeiros l
    JOIN public.categorias_contabeis cc ON cc.id = l.categoria_contabil_id
    WHERE l.fornecedor_id = f.id AND l.status_lancamento = 'validado' AND cc.codigo <> '9.99'
    GROUP BY l.categoria_contabil_id
    ORDER BY count(*) DESC, max(l.data_competencia) DESC
    LIMIT 1) s ON true
  WHERE f.id = p_fornecedor_id;
$$;

-- 4. fornecedor pelo nome contido no começo
CREATE OR REPLACE FUNCTION public.fn_financeiro_sugerir_fornecedor(p_documento text, p_nome text)
 RETURNS TABLE(fornecedor_id uuid, nome text, cpf_cnpj text, score numeric, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH alvo AS (
    SELECT public.fn_normalizar_documento(p_documento)  AS doc,
           public.fn_normalizar_nome_empresa(p_nome)    AS nome_norm
  ), cand AS (
    SELECT f.id,
           coalesce(nullif(f.nome_fantasia,''), f.nome_razao_social) AS nome,
           f.cpf_cnpj,
           a.doc,
           a.nome_norm,
           public.fn_normalizar_documento(f.cpf_cnpj) = a.doc AS bate_cnpj,
           greatest(
             similarity(public.fn_normalizar_nome_empresa(
               coalesce(f.nome_razao_social,'') || ' ' || coalesce(f.nome_fantasia,'')), a.nome_norm),
             similarity(public.fn_normalizar_nome_empresa(f.nome_fantasia), a.nome_norm),
             similarity(public.fn_normalizar_nome_empresa(f.nome_razao_social), a.nome_norm),
             least(0.95, word_similarity(a.nome_norm, public.fn_normalizar_nome_empresa(f.nome_fantasia))),
             least(0.95, word_similarity(a.nome_norm, public.fn_normalizar_nome_empresa(f.nome_razao_social))),
             -- 09/11/2026: "uber do brasil tecnologia" começa com "uber" e o resto é só palavra de empresa.
             -- O resto precisa ser genérico: há fornecedores com nome de pessoa ("Maria" ≠ "Maria Clara Doces").
             CASE WHEN EXISTS (
                    SELECT 1 FROM (VALUES (public.fn_normalizar_nome_empresa(f.nome_fantasia)),
                                          (public.fn_normalizar_nome_empresa(f.nome_razao_social))) v(n)
                    WHERE length(v.n) >= 4 AND left(a.nome_norm || ' ', length(v.n) + 1) = v.n || ' '
                      AND btrim(substr(a.nome_norm, length(v.n) + 1)) ~ '^((do|da|de|dos|e|brasil|tecnologia|tecnologias|comercio|servicos|com|br|online|digital|sa|me|ltda|eireli|epp|intermediacao|intermediacoes|pagamentos|varejo|varejista|distribuidora|importacao|exportacao|industria|marketplace|loja|lojas|store)(\s+|$))*$')
                  THEN 0.9 ELSE 0 END
           ) AS sim
    FROM public.fornecedores f, alvo a
    WHERE f.ativo
  )
  SELECT id, nome, cpf_cnpj,
         CASE WHEN bate_cnpj THEN 1.0 ELSE round(sim::numeric, 3) END,
         CASE WHEN bate_cnpj THEN 'cnpj' ELSE 'nome' END
  FROM cand
  WHERE (doc IS NOT NULL AND bate_cnpj)
     OR (length(nome_norm) >= 3 AND sim >= 0.35)
  ORDER BY 4 DESC
  LIMIT 5;
$function$;

-- 5a. criar: recebedor no comprovante, categoria nova, descrição sem "foto.jpg" e sem "NF" de pedido
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_financeiro_criar_prelancamento(uuid)'::regprocedure);
  v_new := replace(v_def,
$s$  v_valor     := coalesce((x #>> '{valores,total}')::numeric, 0);
$s$,
$s$  v_valor     := coalesce((x #>> '{valores,total}')::numeric, 0);

  -- 09/11/2026: comprovante de Pix com a casa como "emitente": o fornecedor é quem recebeu
  IF v_cnpj IS NOT NULL AND v_cnpj IN (SELECT public.fn_normalizar_documento(cnpj) FROM public.pessoa_empresas WHERE cnpj IS NOT NULL)
     AND coalesce(nullif(btrim(x #>> '{recebedor,nome}'), ''), nullif(btrim(x #>> '{recebedor,cnpj}'), '')) IS NOT NULL THEN
    v_cnpj      := public.fn_normalizar_documento(x #>> '{recebedor,cnpj}');
    v_nome_emit := nullif(btrim(coalesce(x #>> '{recebedor,nome}', '')), '');
  END IF;
$s$);
  v_new := replace(v_new,
    'THEN public.fn_financeiro_categoria_sugerida(v_forn) END;',
    'THEN public.fn_financeiro_categoria_do_fornecedor(v_forn) END;');
  v_new := replace(v_new,
$s$    coalesce(v_nome_emit, d.nome_original) ||
      CASE WHEN v_numero IS NOT NULL THEN ' - NF ' || v_numero ELSE '' END,$s$,
$s$    coalesce(v_nome_emit, 'Nota sem emitente') ||
      CASE WHEN v_numero IS NOT NULL AND coalesce(x #>> '{documento,tipo}', '') ~* 'nf|danfe' THEN ' - NF ' || v_numero ELSE '' END,$s$);
  IF position('recebedor,nome' in v_new) = 0 OR position('fn_financeiro_categoria_do_fornecedor' in v_new) = 0
     OR position('Nota sem emitente' in v_new) = 0 THEN
    RAISE EXCEPTION 'fn_financeiro_criar_prelancamento: trecho não encontrado';
  END IF;
  EXECUTE v_new;
END $mig$;

-- 5b. enriquecer
CREATE OR REPLACE FUNCTION public.fn_financeiro_enriquecer_prelancamento(p_lancamento_id uuid, p_dica text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_whatsapp jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  l            record;
  v_a_class    uuid;
  v_texto      text;
  v_dup        record;
  v_dups       jsonb;
  c            record;
  v_exemplo    text;
  v_origem_cat text;
  v_rem        text;
  v_conta      uuid;
  v_descl      text;
  v_saida      uuid;
  v_comprovante boolean := false;
  v_receb_nome text;
  v_receb_doc  text;
  v_forn       uuid;
  v_forn_score numeric;
  v_cat        uuid;
  v_fatura     boolean := false;
  v_multi      boolean := false;
  v_corte      numeric;
BEGIN
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  IF NOT FOUND OR l.status_lancamento <> 'pre_lancamento' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Pré-lançamento não encontrado');
  END IF;

  UPDATE public.lancamentos_financeiros
  SET observacoes = CASE WHEN nullif(trim(coalesce(p_observacoes, '')), '') IS NOT NULL
                         THEN concat_ws(' ', p_observacoes, observacoes) ELSE observacoes END,
      dados_ia = CASE WHEN p_whatsapp IS NOT NULL
                      THEN coalesce(dados_ia, '{}'::jsonb) || jsonb_build_object('whatsapp', p_whatsapp)
                      ELSE dados_ia END
  WHERE id = l.id;

  -- 05/11/2026: quem mandou (a uazapi às vezes manda sem nome)
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

  SELECT id INTO v_a_class FROM public.categorias_contabeis WHERE codigo = '9.99';
  v_descl := left(nullif(btrim(split_part(regexp_replace(coalesce(p_dica, ''), '\s+', ' ', 'g'), '.', 1)), ''), 120);

  -- 05/11/2026: comprovante de pagamento (o CNPJ lido é o da casa, que pagou): descrição da legenda.
  -- 09/11/2026: fornecedor = recebedor (quando a leitura trouxer); sem ele volta para "A classificar"
  --             (a categoria antiga vinha do nome da casa, ex.: Uber → INSS).
  IF regexp_replace(coalesce(l.dados_ia #>> '{emitente,cnpj}', ''), '\D', '', 'g')
       IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM public.pessoa_empresas WHERE cnpj IS NOT NULL) THEN
    v_comprovante := true;
    v_receb_nome := nullif(btrim(coalesce(l.dados_ia #>> '{recebedor,nome}', '')), '');
    v_receb_doc  := nullif(regexp_replace(coalesce(l.dados_ia #>> '{recebedor,cnpj}', ''), '\D', '', 'g'), '');
    IF v_receb_doc IN (SELECT regexp_replace(cnpj, '\D', '', 'g') FROM public.pessoa_empresas WHERE cnpj IS NOT NULL) THEN
      v_receb_doc := NULL; v_receb_nome := NULL;
    END IF;
    IF v_receb_nome IS NOT NULL OR v_receb_doc IS NOT NULL THEN
      SELECT s.fornecedor_id, s.score INTO v_forn, v_forn_score
        FROM public.fn_financeiro_sugerir_fornecedor(v_receb_doc, v_receb_nome) s ORDER BY s.score DESC LIMIT 1;
      IF v_forn_score IS NULL OR v_forn_score < 0.6 THEN v_forn := NULL; END IF;
    END IF;
    v_cat := coalesce(CASE WHEN v_forn IS NOT NULL THEN public.fn_financeiro_categoria_do_fornecedor(v_forn) END, v_a_class);
    UPDATE public.lancamentos_financeiros
       SET descricao = coalesce(v_descl, 'Pagamento - ' || v_receb_nome, 'Pagamento (fornecedor a confirmar)'),
           fornecedor_id = v_forn,
           categoria_contabil_id = v_cat,
           dados_ia = dados_ia || jsonb_build_object('comprovante_pagamento', true)
                      || CASE WHEN v_receb_nome IS NOT NULL THEN jsonb_build_object('recebedor_nome', v_receb_nome) ELSE '{}'::jsonb END
     WHERE id = l.id;
    UPDATE public.lancamento_itens SET categoria_contabil_id = v_cat WHERE lancamento_id = l.id;
  ELSIF v_descl IS NOT NULL AND (l.descricao LIKE 'Nota sem emitente%' OR l.descricao ~* '\.(jpe?g|png|pdf|webp|heic)$') THEN
    -- 09/11/2026: nota sem emitente lido ganhava o nome do arquivo ("foto.jpg")
    UPDATE public.lancamentos_financeiros SET descricao = v_descl WHERE id = l.id;
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

  -- 09/11/2026: pagamento de fatura de cartão não é despesa nova (as compras do cartão já entram uma a uma)
  v_fatura := concat_ws(' ', p_dica, l.descricao)
              ~* '(fatura\s+(do\s+|de\s+|da\s+)?cart[aã]o|pagamento\s+(do\s+|da\s+|de\s+)?(fatura|cart[aã]o))';
  IF v_fatura THEN
    UPDATE public.lancamentos_financeiros
       SET categoria_contabil_id = v_a_class,
           observacoes = concat_ws(' ', observacoes,
             '[WhatsApp] Parece pagamento de fatura de cartão: não é despesa nova (as compras do cartão entram uma a uma). Confira antes de validar.'),
           dados_ia = dados_ia || jsonb_build_object('pagamento_fatura_cartao', true)
     WHERE id = l.id;
    UPDATE public.lancamento_itens SET categoria_contabil_id = v_a_class WHERE lancamento_id = l.id;
    SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  END IF;

  -- 09/11/2026: loja que vende de tudo: classifica pelo item e pela legenda, sem o nome da loja
  SELECT coalesce(f.multicategoria, false) INTO v_multi FROM public.fornecedores f WHERE f.id = l.fornecedor_id;
  v_multi := coalesce(v_multi, false);

  v_texto := concat_ws(' ',
    CASE WHEN v_multi THEN NULL ELSE l.descricao END,
    (SELECT string_agg(i.descricao, ' ') FROM public.lancamento_itens i WHERE i.lancamento_id = l.id),
    p_dica);

  SELECT * INTO v_dup
  FROM public.fn_financeiro_possiveis_duplicados(l.valor_total, l.data_emissao, l.fornecedor_id, l.descricao, l.id) d
  WHERE d.exato
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.lancamentos_financeiros
    SET status_lancamento = 'cancelado',
        observacoes = concat_ws(' ', observacoes, '[WhatsApp] Cancelado automaticamente: duplicado de "' || v_dup.descricao || '".')
    WHERE id = l.id;
    UPDATE public.documentos_fiscais
    SET status = 'duplicado', duplicado_de_id = NULL, lancamento_id = v_dup.lancamento_id
    WHERE lancamento_id = l.id;
    RETURN jsonb_build_object('ok', false, 'duplicado', true, 'lancamento_id', v_dup.lancamento_id,
      'duplicado_descricao', v_dup.descricao, 'duplicado_data', v_dup.data_ref);
  END IF;

  v_origem_cat := CASE WHEN l.categoria_contabil_id = v_a_class THEN 'a_classificar' ELSE 'fornecedor' END;

  v_corte := CASE WHEN v_multi THEN 0.25 ELSE 0.2 END;
  IF l.categoria_contabil_id = v_a_class AND NOT v_fatura THEN
    SELECT * INTO c FROM public.fn_financeiro_classificar_por_historico(v_texto, CASE WHEN v_multi THEN NULL ELSE l.fornecedor_id END) LIMIT 1;
    IF FOUND AND c.confianca >= v_corte THEN
      UPDATE public.lancamentos_financeiros SET categoria_contabil_id = c.categoria_id WHERE id = l.id;
      UPDATE public.lancamento_itens SET categoria_contabil_id = c.categoria_id
      WHERE lancamento_id = l.id AND categoria_contabil_id = v_a_class;
      v_origem_cat := 'historico';
      v_exemplo := c.exemplo;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_dups
  FROM public.fn_financeiro_possiveis_duplicados(l.valor_total, l.data_emissao, l.fornecedor_id, l.descricao, l.id) d;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'lancamento_id', l.id,
      'valor', l.valor_total,
      'categoria_codigo', cc.codigo,
      'categoria_nome', cc.nome,
      'categoria_origem', v_origem_cat,
      'categoria_exemplo', v_exemplo,
      -- 09/11/2026: comprovante nunca mostra a casa como fornecedor (o n8n cai no emitente lido se vier nulo)
      'fornecedor_nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social,
                                  CASE WHEN v_comprovante THEN coalesce(v_receb_nome, 'Recebedor a confirmar') END),
      'comprovante_pagamento', v_comprovante,
      'fatura_cartao', v_fatura,
      'possiveis_duplicados', v_dups)
    FROM public.lancamentos_financeiros x
    JOIN public.categorias_contabeis cc ON cc.id = x.categoria_contabil_id
    LEFT JOIN public.fornecedores f ON f.id = x.fornecedor_id
    WHERE x.id = l.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_financeiro_texto_para_classificar(text), public.fn_financeiro_categoria_do_fornecedor(uuid)
  FROM PUBLIC, anon, authenticated;
