-- Pausa por teto de lembretes não avisa uma a uma: vai num resumo só.
-- Em 28/10/2026 já havia 15 cobranças com 10 a 17 lembretes enviados; sem isso,
-- a primeira rodada da régua mandaria 15 mensagens seguidas ao grupo.

ALTER TABLE public.cobranca_suspensoes ADD COLUMN IF NOT EXISTS avisada_em timestamptz;

-- fn_cobranca_suspensao_avisar passa a gravar avisada_em.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_cobranca_suspensao_avisar(uuid, text)'::regprocedure);
  v_old text := $q$  INSERT INTO public.ju_avisos_grupo (texto, origem, botao)$q$;
  v_new text := $q$  UPDATE public.cobranca_suspensoes SET avisada_em = now() WHERE id = s.id;

  INSERT INTO public.ju_avisos_grupo (texto, origem, botao)$q$;
BEGIN
  IF position('avisada_em' IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fn_cobranca_suspensao_avisar: trecho não encontrado uma única vez';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- Teto: pausa sem aviso individual.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_cobranca_pode_lembrar(uuid, uuid, text, text, boolean)'::regprocedure);
  v_old text := $q$               p_origem := 'sistema');$q$;
  v_new text := $q$               p_origem := 'sistema',
               p_notificar := false);$q$;
BEGIN
  IF position('p_notificar := false' IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fn_cobranca_pode_lembrar: trecho não encontrado uma única vez';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- Escalonamento + resumo das pausas por teto ainda não avisadas.
CREATE OR REPLACE FUNCTION public.fn_cobranca_suspensoes_escalar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  r record;
  n integer := 0;
  v_txt text;
  v_qtd integer;
  v_lista text;
BEGIN
  FOR r IN
    UPDATE public.cobranca_suspensoes
       SET status = 'escalada', escalada_em = now()
     WHERE status = 'ativa' AND prazo_verificacao < now()
    RETURNING id, fatura_id, pagamento_link_id
  LOOP
    INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, ator_nome)
    VALUES (r.id, r.fatura_id, r.pagamento_link_id, 'escalada', 'sistema');
    PERFORM public.fn_cobranca_suspensao_avisar(r.id, 'escalada');
    n := n + 1;
  END LOOP;

  -- Resumo único das cobranças que chegaram ao teto.
  WITH novas AS (
    UPDATE public.cobranca_suspensoes s
       SET avisada_em = now()
     WHERE s.motivo = 'teto_lembretes' AND s.avisada_em IS NULL AND s.status IN ('ativa', 'escalada')
    RETURNING s.id, s.responsavel_cobranca_id, s.paciente_id, s.fatura_id, s.pagamento_link_id, s.detalhe
  )
  SELECT count(*),
         string_agg(
           '• ' || concat_ws(' · ',
                     split_part(btrim(coalesce(resp.nome, 'sem nome')), ' ', 1),
                     split_part(btrim(coalesce(pac.nome, '')), ' ', 1),
                     public.fn_brl(coalesce(f.valor_total, pl.valor_base)),
                     coalesce(substring(nv.detalhe FROM '^\d+') || ' lembretes', NULL)),
           E'\n' ORDER BY coalesce(f.vencimento, pl.vencimento))
    INTO v_qtd, v_lista
  FROM novas nv
  LEFT JOIN public.pessoas resp ON resp.id = nv.responsavel_cobranca_id
  LEFT JOIN public.pessoas pac ON pac.id = nv.paciente_id
  LEFT JOIN public.faturas f ON f.id = nv.fatura_id
  LEFT JOIN public.pagamento_links pl ON pl.id = nv.pagamento_link_id;

  IF coalesce(v_qtd, 0) > 0 THEN
    v_txt := '🔕 ' || v_qtd || CASE WHEN v_qtd = 1 THEN ' cobrança chegou' ELSE ' cobranças chegaram' END
             || ' ao limite de lembretes automáticos e ' || CASE WHEN v_qtd = 1 THEN 'foi pausada' ELSE 'foram pausadas' END
             || E':\n' || v_lista
             || E'\nNinguém pagou depois de tantos avisos: vale um contato pessoal ou rever a cobrança. '
             || 'Os lembretes só voltam se o Financeiro confirmar a dívida em Cobranças.';
    INSERT INTO public.ju_avisos_grupo (texto, origem, botao)
    VALUES (v_txt, 'COBRANCA_TETO', '💳 Abrir Cobranças|https://app.respirakidsbrasilia.com.br/#/cobrancas');
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cobranca_suspensoes_escalar() FROM PUBLIC, anon, authenticated;
