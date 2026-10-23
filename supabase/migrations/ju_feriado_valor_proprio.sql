-- Feriado custa diferente do fim de semana (R$ 300 na respiratória, avisado pela clínica em 23/10/2026),
-- mas o sistema só tem DU e FDS. A Ju dizia "R$ 280 nos fins de semana e feriados".
-- Provisório até existir preço de feriado: FDS = sábado e domingo; feriado = Lolô confirma o valor.
DO $mig$
DECLARE
  f text;
  d text;
  n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.fn_ju_contexto_cliente(bigint)', 'public.fn_ju_servicos()'] LOOP
    BEGIN
      d := pg_get_functiondef(f::regprocedure);
    EXCEPTION WHEN undefined_function THEN
      RAISE EXCEPTION 'função não encontrada: %', f;
    END;
    n := replace(d, '(fins de semana e feriados)', '(sábado e domingo)');
    IF n = d THEN RAISE EXCEPTION '%: texto do FDS não encontrado', f; END IF;
    EXECUTE n;
  END LOOP;
END
$mig$;

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo)
VALUES ('FERIADO_VALOR', 'FINANCEIRO',
        'Feriado tem valor próprio, diferente do fim de semana, e esse valor não está na tabela de serviços. A Ju não informa valor de sessão em feriado: diz que em feriado o valor é diferente e que a Lolô confirma. Os valores de sábado e domingo são os da tabela (FDS).',
        true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();
