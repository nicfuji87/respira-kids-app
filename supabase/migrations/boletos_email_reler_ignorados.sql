-- E-mail ignorado (remetente sem cadastro ou cadastro que não cita o texto do e-mail) ficava
-- marcado como lido para sempre: cadastrar a segunda sala depois não relia o boleto dela
-- (Doc 93710 do condomínio, 21/10/2026). Agora qualquer mudança nos remetentes devolve os
-- ignorados para a fila; a próxima leitura (ou "Ler agora") reavalia. Ignorado não tem
-- efeito nenhum além da linha de log, então apagar é seguro.

CREATE OR REPLACE FUNCTION public.fn_trg_email_remetentes_reler_ignorados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.email_mensagens WHERE status = 'ignorado';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_remetentes_reler_ignorados ON public.email_boleto_remetentes;
CREATE TRIGGER trg_email_remetentes_reler_ignorados
  AFTER INSERT OR UPDATE ON public.email_boleto_remetentes
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_trg_email_remetentes_reler_ignorados();

-- motivo certo no log: remetente conhecido cujo cadastro exige um texto que o e-mail não cita
CREATE OR REPLACE FUNCTION public.fn_email_motivo_ignorado(p_remetente text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.email_boleto_remetentes er
    WHERE er.ativo AND (er.email = lower(p_remetente) OR (left(er.email, 1) = '@' AND lower(p_remetente) LIKE '%' || er.email)))
  THEN 'O cadastro deste remetente exige um texto que o e-mail não cita (outra sala/conta?)'
  ELSE 'Remetente sem cadastro' END;
$$;
REVOKE ALL ON FUNCTION public.fn_email_motivo_ignorado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_motivo_ignorado(text) TO service_role;

-- fn_boleto_registrar_email passa a usar o motivo acima (troca pontual no corpo já publicado;
-- boletos_email.sql já está com a versão nova)
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.fn_boleto_registrar_email(jsonb)'::regprocedure) INTO d;
  d := replace(d, $q$detalhe = 'Remetente sem cadastro'$q$, $q$detalhe = public.fn_email_motivo_ignorado(v_rem)$q$);
  EXECUTE d;
END
$do$;
