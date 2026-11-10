-- 10/11/2026 (caso Renata/Leo, decisão do dono): a família escolheu o horário oferecido "para o Leo", que não tem
-- cadastro; como havia uma criança só (Gustavo), a Ju marcou o Gustavo. Agora, se a família nomeia uma criança que não
-- está no cadastro, a Ju avisa que ela não tem cadastro e manda o link (uma vez). O cron ju-escolhas reaplica e, quando
-- o cadastro aparece, a criança é achada pelo nome e a consulta é marcada.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure);
  v_new := regexp_replace(v_def, 'DECLARE\n', E'DECLARE\n  v_crianca_nova text;\n');
  v_new := replace(v_new,
$s$   WHERE (x ->> 'acesso_agenda')::boolean;
  IF v_n = 0 THEN
    IF e.cadastro_pedido_em IS NULL THEN$s$,
$s$   WHERE (x ->> 'acesso_agenda')::boolean;
  -- 10/11/2026: criança nomeada pela família que não está no cadastro → pede o cadastro dela (caso Renata/Leo)
  IF v_n > 0 AND nullif(btrim(r ->> 'crianca'), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(fn_ju_contexto_cliente(c.id) -> 'pacientes') x
                      WHERE (x ->> 'acesso_agenda')::boolean
                        AND (lower(unaccent(split_part(btrim(x ->> 'nome'), ' ', 1))) LIKE lower(unaccent(split_part(btrim(r ->> 'crianca'), ' ', 1))) || '%'
                          OR lower(unaccent(split_part(btrim(r ->> 'crianca'), ' ', 1))) LIKE lower(unaccent(split_part(btrim(x ->> 'nome'), ' ', 1))) || '%')) THEN
    v_crianca_nova := initcap(split_part(btrim(r ->> 'crianca'), ' ', 1));
  END IF;
  IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN
    IF e.cadastro_pedido_em IS NULL THEN$s$);
  v_new := replace(v_new,
$s$      v_txt := 'Preciso só que você faça o cadastro para eu agendar aqui no sistema: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente';$s$,
$s$      v_txt := CASE WHEN v_crianca_nova IS NOT NULL THEN v_crianca_nova || ' ainda não tem cadastro aqui. ' ELSE '' END
               || 'Preciso só que você faça o cadastro para eu agendar aqui no sistema: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente';$s$);
  IF position('v_crianca_nova text;' in v_new) = 0 OR position('IF v_n = 0 OR v_crianca_nova IS NOT NULL THEN' in v_new) = 0
     OR position('ainda não tem cadastro aqui' in v_new) = 0 THEN
    RAISE EXCEPTION 'fn_ju_escolha_aplicar: trecho não encontrado';
  END IF;
  EXECUTE v_new;
END $mig$;
