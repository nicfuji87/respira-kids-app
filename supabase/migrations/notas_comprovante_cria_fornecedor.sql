-- 27/11/2026 (decisão do dono): comprovante de pagamento do grupo 🧾 cujo recebedor tem CNPJ e não está no cadastro
-- cria o fornecedor sozinho (antes ficava "Recebedor a confirmar" e quem validava escolhia). Intermediadoras de
-- pagamento (Adyen, Mercado Pago, PagSeguro…) ficam de fora: o nome delas não diz quem vendeu.
-- Só CNPJ (14 dígitos); Pix para pessoa física (CPF) segue sem fornecedor, para não duplicar pessoas da equipe.

CREATE OR REPLACE FUNCTION public.fn_financeiro_eh_intermediadora(p_nome text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(p_nome, '') ~* '(adyen|mercado\s*pago|pag\s*seguro|pagbank|stone\s+(instit|pagamento)|cielo|getnet|pagar\.?\s*me|ebanx|picpay|iugu|zoop|paypal|asaas|gerencianet|juno\s|sumup|infinite\s*pay|cloudwalk|safrapay)';
$function$;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_financeiro_enriquecer_prelancamento(uuid,text,text,jsonb)'::regprocedure);
  n := replace(d, $a$      IF v_forn_score IS NULL OR v_forn_score < 0.6 THEN v_forn := NULL; END IF;
    END IF;$a$,
$a$      IF v_forn_score IS NULL OR v_forn_score < 0.6 THEN v_forn := NULL; END IF;
    END IF;
    -- 27/11/2026: recebedor com CNPJ fora do cadastro vira fornecedor (menos intermediadora de pagamento)
    IF v_forn IS NULL AND length(coalesce(v_receb_doc, '')) = 14 AND v_receb_nome IS NOT NULL
       AND NOT public.fn_financeiro_eh_intermediadora(v_receb_nome) THEN
      SELECT f.id INTO v_forn FROM public.fornecedores f
       WHERE public.fn_normalizar_documento(f.cpf_cnpj) = v_receb_doc ORDER BY f.ativo DESC LIMIT 1;
      IF v_forn IS NULL THEN
        INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, cpf_cnpj, ativo, observacoes)
        VALUES ('juridica', v_receb_nome, v_receb_doc, true,
                '[WhatsApp] Criado pelo comprovante enviado no grupo em '
                || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                || coalesce(' (' || v_rem || ')', '') || '.')
        RETURNING id INTO v_forn;
      END IF;
    END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'enriquecer: trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- A leitura atual (edge v4) já põe o recebedor como emitente no comprovante, então ele não passa pelo bloco acima:
-- o mesmo vale para todo documento do tipo comprovante que ficou sem fornecedor.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_financeiro_enriquecer_prelancamento(uuid,text,text,jsonb)'::regprocedure);
  n := replace(d, $a$  -- 05/11/2026: "pago do Inter / Nubank / Asaas": já nasce pago na conta, para o extrato reconhecer
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;$a$,
$a$  -- 27/11/2026: comprovante (recebedor no lugar do emitente) com CNPJ fora do cadastro: cria o fornecedor
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;
  IF l.fornecedor_id IS NULL AND coalesce(l.dados_ia #>> '{documento,tipo}', '') ~* 'comprovante' THEN
    v_receb_doc := public.fn_normalizar_documento(coalesce(nullif(l.dados_ia #>> '{recebedor,cnpj}', ''), l.dados_ia #>> '{emitente,cnpj}'));
    v_receb_nome := btrim(regexp_replace(coalesce(nullif(btrim(l.dados_ia #>> '{recebedor,nome}'), ''),
                                                  nullif(btrim(l.dados_ia #>> '{emitente,razao_social}'), ''), ''),
                                         '^[0-9./\s-]+', ''));
    IF length(coalesce(v_receb_doc, '')) = 14 AND nullif(v_receb_nome, '') IS NOT NULL
       AND v_receb_nome !~* '(bc\s*fisio|respira\s*kids|pacheco)'
       AND v_receb_doc NOT IN (SELECT public.fn_normalizar_documento(cnpj) FROM public.pessoa_empresas WHERE cnpj IS NOT NULL)
       AND NOT public.fn_financeiro_eh_intermediadora(v_receb_nome) THEN
      SELECT f.id INTO v_forn FROM public.fornecedores f
       WHERE public.fn_normalizar_documento(f.cpf_cnpj) = v_receb_doc ORDER BY f.ativo DESC LIMIT 1;
      IF v_forn IS NULL THEN
        INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, cpf_cnpj, ativo, observacoes)
        VALUES ('juridica', v_receb_nome, v_receb_doc, true,
                '[WhatsApp] Criado pelo comprovante enviado no grupo em '
                || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                || coalesce(' (' || v_rem || ')', '') || '.')
        RETURNING id INTO v_forn;
      END IF;
      v_cat := public.fn_financeiro_categoria_do_fornecedor(v_forn);
      UPDATE public.lancamentos_financeiros
         SET fornecedor_id = v_forn,
             categoria_contabil_id = CASE WHEN categoria_contabil_id = v_a_class AND v_cat IS NOT NULL THEN v_cat ELSE categoria_contabil_id END
       WHERE id = l.id;
    END IF;
  END IF;

  -- 05/11/2026: "pago do Inter / Nubank / Asaas": já nasce pago na conta, para o extrato reconhecer
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_lancamento_id;$a$);
  IF n = d THEN RAISE EXCEPTION 'enriquecer (comprovante sem fornecedor): trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- Antes de criar: cadastro antigo SEM CNPJ cujo nome é o começo do nome do recebedor ("Ifood" × "Ifood.com Agencia de
-- Restaurantes…", que a busca por nome não casava) é o mesmo fornecedor e ganha o CNPJ do comprovante.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_financeiro_enriquecer_prelancamento(uuid,text,text,jsonb)'::regprocedure);
  n := replace(d, $a$      IF v_forn IS NULL THEN
        INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, cpf_cnpj, ativo, observacoes)$a$,
$a$      IF v_forn IS NULL THEN
        SELECT f.id INTO v_forn FROM public.fornecedores f
         WHERE f.ativo AND coalesce(public.fn_normalizar_documento(f.cpf_cnpj), '') = ''
           AND length(btrim(regexp_replace(lower(coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social, '')), '[^a-z0-9à-ü]+', ' ', 'g'))) >= 4
           AND (btrim(regexp_replace(lower(v_receb_nome), '[^a-z0-9à-ü]+', ' ', 'g')) || ' ')
               LIKE (btrim(regexp_replace(lower(coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social)), '[^a-z0-9à-ü]+', ' ', 'g')) || ' %')
         ORDER BY length(coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social)) DESC LIMIT 1;
        IF v_forn IS NOT NULL THEN
          UPDATE public.fornecedores SET cpf_cnpj = v_receb_doc WHERE id = v_forn;
        END IF;
      END IF;
      IF v_forn IS NULL THEN
        INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, cpf_cnpj, ativo, observacoes)$a$);
  IF n = d OR (length(n) - length(replace(n, 'LIKE (btrim(', ''))) / length('LIKE (btrim(') <> 2 THEN
    RAISE EXCEPTION 'enriquecer (nome sem CNPJ): trecho não encontrado nos dois blocos';
  END IF;
  EXECUTE n;
END $$;
