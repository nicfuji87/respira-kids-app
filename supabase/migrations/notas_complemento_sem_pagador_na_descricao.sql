-- 10/11/2026 (pedido do dono): o complemento "Nicolas" (quem pagou) virou "Pago por Nicolas - CASA DE BISCOITOS...".
-- A descrição do complemento só vai para a frente se sobrar algo além de pagamento/pessoa (fn_financeiro_texto_para_classificar).
-- Também: ju_conhecimento REAJUSTE_NOV_2026 ganhou a regra "até 31/12/2026, se perguntarem se o preço mudou: sim,
-- reajuste em 1º/11 só nas sessões da Bruna e da Flávia" (editado direto na tabela).
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_financeiro_complementar_prelancamento(text,text,text,text,text,integer)'::regprocedure);
  v_new := replace(v_def,
$s$    IF v_descr IS NOT NULL AND position(lower(v_descr) IN lower(r.descricao)) = 0 THEN$s$,
$s$    IF v_descr IS NOT NULL AND position(lower(v_descr) IN lower(r.descricao)) = 0
       AND length(btrim(regexp_replace(public.fn_financeiro_texto_para_classificar(v_descr), '[^[:alnum:]]+', ' ', 'g'))) >= 3 THEN$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_financeiro_complementar_prelancamento: trecho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
