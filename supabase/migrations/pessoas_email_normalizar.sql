-- 25/11/2026: contrato do Yan não chegava (e-mail da mãe salvo como "...@gmail.com." e a Assinafy recusava
-- com "Email inválido"; duas tentativas, 18 e 24/11). Três ajustes:
--   1) e-mail é limpo ao salvar: sem espaços, sem pontuação sobrando no começo/fim, em minúsculas; vazio vira NULL;
--   2) o aviso de contrato recusado mostra o e-mail cadastrado e o problema encontrado;
--   3) limpeza dos cadastros atuais (o único com erro real já foi corrigido à mão; os 18 restantes eram '').

CREATE OR REPLACE FUNCTION public.fn_email_limpo(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT nullif(lower(regexp_replace(regexp_replace(coalesce(p, ''), '\s+', '', 'g'), '^[.,;:]+|[.,;:]+$', '', 'g')), '');
$function$;

CREATE OR REPLACE FUNCTION public.fn_email_problema(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN 'está vazio'
    WHEN p ~ '\s' THEN 'tem espaço'
    WHEN p ~ '[.,;:]$' THEN 'termina com pontuação'
    WHEN p ~ '^[.,;:]' THEN 'começa com pontuação'
    WHEN p !~ '@' THEN 'não tem @'
    WHEN p ~ '@.*@' THEN 'tem mais de um @'
    WHEN p ~ '\.\.' THEN 'tem dois pontos seguidos'
    WHEN p ~* '@(gmail|hotmail|outlook|yahoo|icloud)$' THEN 'falta o .com no fim'
    WHEN p ~* '@g?mai?l\.co$|@gmial\.|@gmal\.|@hotmal\.|@hotmial\.' THEN 'domínio parece digitado errado'
    WHEN p !~* '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' THEN 'formato inválido'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_pessoas_email_limpo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.email := public.fn_email_limpo(NEW.email);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_pessoas_email_limpo ON public.pessoas;
CREATE TRIGGER trg_pessoas_email_limpo
  BEFORE INSERT OR UPDATE OF email ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_pessoas_email_limpo();

-- Cadastros atuais: o único com erro real (e-mail com ponto no fim) foi corrigido à mão em 25/11.
-- Os outros 18 "inválidos" são e-mail '' (vazio) de crianças e ficam como estão: um UPDATE em massa em
-- pessoas dispararia webhook_patient_updated_trigger para o n8n em cada linha. Eles viram NULL quando o
-- cadastro for salvo de novo. Maiúsculas existentes também ficam (o gatilho só age quando o e-mail é salvo).

-- aviso do contrato recusado com o e-mail e o problema
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_contrato_envio_registrar(uuid,boolean,text,text,text,text,text)'::regprocedure);
  n := replace(d, 'DECLARE v_pac text; v_resp text;', 'DECLARE v_pac text; v_resp text; v_email text; v_prob text;');
  n := replace(n, $a$    SELECT split_part(btrim(p.nome), ' ', 1), split_part(btrim(u.variaveis_utilizadas ->> 'responsavelLegalNome'), ' ', 1)
      INTO v_pac, v_resp$a$,
  $a$    SELECT split_part(btrim(p.nome), ' ', 1), split_part(btrim(u.variaveis_utilizadas ->> 'responsavelLegalNome'), ' ', 1),
           u.variaveis_utilizadas ->> 'responsavelLegalEmail'
      INTO v_pac, v_resp, v_email$a$);
  n := replace(n, $a$            || E'\nErro: ' || left(regexp_replace(coalesce(p_erro, 'sem detalhe'), '\s+', ' ', 'g'), 180)$a$,
  $a$            || E'\nErro: ' || left(regexp_replace(coalesce(p_erro, 'sem detalhe'), '\s+', ' ', 'g'), 180)
            || CASE WHEN coalesce(p_erro, '') ~* 'mail' THEN
                 E'\nE-mail no contrato: ' || coalesce('"' || v_email || '"', '(vazio)')
                 || coalesce(' → ' || public.fn_email_problema(v_email), '')
               ELSE '' END$a$);
  IF n = d OR strpos(n, 'fn_email_problema') = 0 OR strpos(n, 'INTO v_pac, v_resp, v_email') = 0 THEN
    RAISE EXCEPTION 'fn_contrato_envio_registrar: trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;
