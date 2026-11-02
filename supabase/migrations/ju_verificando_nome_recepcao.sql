-- 02/11/2026: o botão "Estou verificando" tocado pelo celular da clínica chega com o nome "Respira Kids".
-- O card mostrava "Respira está verificando"; agora mostra "Recepção".
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_verificar(bigint,text)'::regprocedure);
BEGIN
  IF position($$'^(alguém|alguem|recep)'$$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_verificar: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $$'^(alguém|alguem|recep)'$$, $$'^(alguém|alguem|recep|respira)'$$);
END $m$;

UPDATE public.ju_solicitacoes SET verificando_por = 'Recepção' WHERE verificando_por ~* '^respira';
