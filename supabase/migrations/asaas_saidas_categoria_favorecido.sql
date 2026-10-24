-- Saídas do Asaas, ajustes do dono (23/10/2026):
--   * "A Infuse é pagamento de marketing, lança como despesa" → favorecido pode ter categoria
--     padrão; o pré-lançamento novo usa ela antes do histórico do fornecedor.
--   * "essa em específico foi pró-labore" → o Pix de R$ 29.045,95 de 14/10 sai da despesa e fica
--     como retirada (pró-labore do Nicolas pago à Infuse).
--   * "Pix enviado não precisa enviar no grupo, só lança no sistema" → transferência é silenciosa;
--     só conta paga avisa.

ALTER TABLE public.financeiro_favorecidos
  ADD COLUMN IF NOT EXISTS categoria_contabil_id uuid REFERENCES public.categorias_contabeis(id);

-- fornecedor Infuse (agência de marketing) + favorecido com categoria Publicidade e Marketing
DO $$
DECLARE v_forn uuid;
BEGIN
  SELECT id INTO v_forn FROM public.fornecedores
  WHERE regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g') = '32739249000100' LIMIT 1;
  IF v_forn IS NULL THEN
    INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, nome_fantasia, cpf_cnpj, observacoes)
    VALUES ('juridica', 'INFUSE COMUNICACAO E PROMOCAO DE VENDAS LTDA', 'Infuse', '32.739.249/0001-00',
            'Marketing. Cadastrado pelas saídas do Asaas da BC em 23/10/2026.')
    RETURNING id INTO v_forn;
  END IF;
  INSERT INTO public.financeiro_favorecidos (padrao, fornecedor_id, tratamento, categoria_contabil_id, observacao)
  VALUES ('infuse comunicacao', v_forn, 'fornecedor',
          (SELECT id FROM public.categorias_contabeis WHERE codigo = 'PUB_MKT'), 'marketing')
  ON CONFLICT (padrao) DO UPDATE
    SET fornecedor_id = EXCLUDED.fornecedor_id, categoria_contabil_id = EXCLUDED.categoria_contabil_id;
END $$;

-- fn_asaas_saida_registrar: lê a categoria do favorecido e usa no pré-lançamento novo
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.fn_asaas_saida_registrar(jsonb)'::regprocedure) INTO d;
  n := replace(d, $q$  v_fav_trat text;$q$, $q$  v_fav_trat text;
  v_fav_cat uuid;$q$);
  n := replace(n, $q$      SELECT ff.tratamento, ff.fornecedor_id INTO v_fav_trat, v_forn$q$,
                  $q$      SELECT ff.tratamento, ff.fornecedor_id, ff.categoria_contabil_id INTO v_fav_trat, v_forn, v_fav_cat$q$);
  n := replace(n, $q$  IF v_trat IS NULL THEN
    IF v_forn IS NOT NULL THEN$q$, $q$  IF v_trat IS NULL THEN
    -- categoria padrão do favorecido (ex.: Infuse = marketing) vence o histórico
    IF v_fav_cat IS NOT NULL THEN
      SELECT v_fav_cat AS categoria_contabil_id, lf.centro_financeiro_id, lf.natureza_custo, lf.eh_divisao_socios
        INTO v_base
      FROM public.lancamentos_financeiros lf
      WHERE lf.categoria_contabil_id = v_fav_cat AND lf.status_lancamento = 'validado'
      ORDER BY lf.data_competencia DESC NULLS LAST, lf.created_at DESC LIMIT 1;
      IF v_base.categoria_contabil_id IS NULL THEN
        SELECT v_fav_cat AS categoria_contabil_id,
               (SELECT id FROM public.centros_financeiros WHERE nome = 'BC FISIO' LIMIT 1) AS centro_financeiro_id,
               'individual'::text AS natureza_custo, false AS eh_divisao_socios
          INTO v_base;
      END IF;
    END IF;
    IF v_forn IS NOT NULL AND v_base.categoria_contabil_id IS NULL THEN$q$);
  IF position('v_fav_cat uuid;' in n) = 0
     OR position('INTO v_fav_trat, v_forn, v_fav_cat' in n) = 0
     OR position('IF v_forn IS NOT NULL AND v_base.categoria_contabil_id IS NULL THEN' in n) = 0 THEN
    RAISE EXCEPTION 'fn_asaas_saida_registrar: trecho esperado não encontrado';
  END IF;
  EXECUTE n;
END $do$;

-- Pix (transferência) não avisa no grupo; boleto já tem aviso próprio
CREATE OR REPLACE FUNCTION public.fn_asaas_saidas_silenciar_boleto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.tratamento = 'boleto' OR NEW.tipo = 'transferencia') AND NEW.avisado_em IS NULL THEN
    NEW.avisado_em := now();
  END IF;
  RETURN NEW;
END $$;

-- o Pix de 14/10 para a Infuse foi pró-labore: sai da despesa, fica como retirada
UPDATE public.lancamentos_financeiros
SET status_lancamento = 'cancelado',
    observacoes = concat_ws(E'\n', nullif(observacoes, ''),
      'Cancelado em 23/10/2026: não é marketing, foi pró-labore do Nicolas pago à Infuse (retirada, não é despesa).')
WHERE id = 'e8bb4d88-55ef-41b4-9d76-40a253485763' AND status_lancamento = 'pre_lancamento';

UPDATE public.asaas_saidas
SET tratamento = 'retirada', lancamento_id = NULL,
    detalhe = 'Pró-labore do Nicolas pago à Infuse (retirada).'
WHERE asaas_id = 'f1482516-d75f-42b2-bf4a-8080e9a50e13';
