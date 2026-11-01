-- 01/11/2026 (pedido do dono, caso "5 limpezas preventivas" R$ 950): a mensagem do prestador trazia
-- "PIX CNPJ 29522116000172", mas o pré-lançamento ficou sem fornecedor e "@ju paga/agende esse pix no inter"
-- não tinha de onde tirar a chave. Agora fn_ju_preparar_pix, quando a conta está sem fornecedor ou o
-- fornecedor está sem chave, lê a chave Pix do próprio texto da mensagem: liga (ou cria) o fornecedor
-- e grava a chave. O "@ju" pode vir em outra mensagem: a busca pela última conta de quem pediu vai de
-- 60 minutos para 24 horas (se houver mais de uma, a Ju pergunta, como antes).
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_preparar_pix(uuid, text, text, numeric, text, text, text)'::regprocedure);

  n := replace(d, $a$AND l2.created_at >= now() - interval '60 minutes')$a$,
                  $a$AND l2.created_at >= now() - interval '24 hours')$a$);

  n := replace(n, $a$  IF l.fornecedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A nota está sem fornecedor identificado.$a$,
    $a$  -- 01/11/2026: sem fornecedor ou sem chave → tenta a chave Pix escrita na própria mensagem
  IF l.fornecedor_id IS NULL OR nullif(l.chave_pix, '') IS NULL THEN
    v_txt := coalesce(l.dados_ia ->> 'texto_original', l.observacoes, '');
    v_chave := public.fn_pix_normalizar_chave((regexp_match(v_txt, '(?i)[^\n]*pix[^\n]*'))[1]);
    IF (v_chave ->> 'chave') IS NULL THEN
      v_chave := public.fn_pix_normalizar_chave((regexp_match(v_txt, '(?i)pix[^\n]*\n\s*([^\n]+)'))[1]);
    END IF;
    IF (v_chave ->> 'chave') IS NOT NULL THEN
      IF l.fornecedor_id IS NULL THEN
        v_nome := nullif(btrim(coalesce(l.dados_ia ->> 'fornecedor', '')), '');
        SELECT x.fornecedor_id, x.score INTO v_forn, v_score
          FROM public.fn_financeiro_sugerir_fornecedor(
                 CASE WHEN v_chave ->> 'tipo' IN ('cnpj', 'cpf') THEN v_chave ->> 'chave' END, v_nome) x
         ORDER BY x.score DESC LIMIT 1;
        IF (v_forn IS NULL OR v_score < 0.5) AND v_nome IS NOT NULL THEN
          INSERT INTO public.fornecedores (tipo_pessoa, nome_razao_social, cpf_cnpj, ativo, observacoes)
          VALUES (CASE WHEN v_chave ->> 'tipo' = 'cpf' THEN 'fisica' ELSE 'juridica' END, v_nome,
                  CASE WHEN v_chave ->> 'tipo' IN ('cnpj', 'cpf') THEN v_chave ->> 'chave' END, true,
                  '[@ju] criado pela mensagem do WhatsApp em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                  || coalesce(' (' || p_solicitante || ')', ''))
          RETURNING id INTO v_forn;
        ELSIF v_score < 0.5 THEN
          v_forn := NULL;
        END IF;
        IF v_forn IS NOT NULL THEN
          UPDATE public.lancamentos_financeiros SET fornecedor_id = v_forn WHERE id = l.id;
        END IF;
      ELSE
        v_forn := l.fornecedor_id;
      END IF;
      IF v_forn IS NOT NULL THEN
        UPDATE public.fornecedores
           SET chave_pix = v_chave ->> 'chave', chave_pix_atualizada_em = now(),
               chave_pix_origem = 'Mensagem do WhatsApp (@ju' || coalesce(' por ' || p_solicitante, '') || ')'
         WHERE id = v_forn AND nullif(chave_pix, '') IS NULL;
        SELECT lf.*, coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social) AS forn_nome, f.chave_pix
          INTO l
          FROM public.lancamentos_financeiros lf
          LEFT JOIN public.fornecedores f ON f.id = lf.fornecedor_id
         WHERE lf.id = v_ids[1];
      END IF;
    END IF;
  END IF;

  IF l.fornecedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A nota está sem fornecedor identificado.$a$);

  n := replace(n, $a$  s        record;
BEGIN$a$, $a$  s        record;
  v_txt    text;
  v_chave  jsonb;
  v_nome   text;
BEGIN$a$);

  IF n = d OR n NOT LIKE '%interval ''24 hours'')%' OR n NOT LIKE '%v_chave := public.fn_pix_normalizar_chave%'
     OR n NOT LIKE '%v_chave  jsonb;%' THEN
    RAISE EXCEPTION 'fn_ju_preparar_pix: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;
