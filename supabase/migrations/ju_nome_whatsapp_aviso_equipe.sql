-- 27/10/2026 (pedido do dono, caso Fernanda): a Ju repetia "já avisei a Lolô / a Lolô segue com o pedido"
-- em toda mensagem da mesma espera, e não sabia o nome da pessoa no WhatsApp (tratava mãe no masculino).
-- 1) ju_conversas guarda o nome que a pessoa usa no WhatsApp (pushName da uazapi), gravado pela Entrada.
-- 2) fn_ju_turno entrega nome_whatsapp e aviso_equipe_ja_dado (a Ju já disse, depois da última fala da
--    Lolô, que a equipe vai responder).

ALTER TABLE public.ju_conversas
  ADD COLUMN IF NOT EXISTS nome_whatsapp text,
  ADD COLUMN IF NOT EXISTS nome_whatsapp_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_ju_nome_whatsapp(p_wa_chatid text, p_nome text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $f$
  UPDATE public.ju_conversas
     SET nome_whatsapp = left(btrim(p_nome), 80), nome_whatsapp_em = now()
   WHERE wa_chatid = p_wa_chatid
     AND nullif(btrim(coalesce(p_nome, '')), '') IS NOT NULL
     AND nome_whatsapp IS DISTINCT FROM left(btrim(p_nome), 80);
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_nome_whatsapp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_nome_whatsapp(text, text) TO service_role;

-- A Ju já avisou, depois da última mensagem da Lolô, que a equipe vai responder?
CREATE OR REPLACE FUNCTION public.fn_ju_aviso_equipe_dado(p_conversa_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.ju_mensagens m
     WHERE m.conversa_id = p_conversa_id AND m.origem = 'JU'
       AND m.created_at > now() - interval '3 days'
       AND m.created_at > coalesce((SELECT max(h.created_at) FROM public.ju_mensagens h
                                     WHERE h.conversa_id = p_conversa_id AND h.origem = 'HUMANO'), '-infinity'::timestamptz)
       AND m.conteudo ~* '((avisei|passei|pedi|encaminhei|vou (passar|avisar|pedir))\M.{0,50}(lol[ôo]|secret[áa]ri|equipe|fisios)|(lol[ôo]|secret[áa]ri[ao]|equipe)\M.{0,80}(respond|confirma|segue|seguir|te cham|retorn|verific|confer))')
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_aviso_equipe_dado(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_aviso_equipe_dado(bigint) TO service_role;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%aviso_equipe_ja_dado%' THEN RETURN; END IF;
  n := replace(d, $a$'pre_atendimento', public.fn_ju_pre_atendimento(c.id),$a$,
                  $a$'pre_atendimento', public.fn_ju_pre_atendimento(c.id),
    'nome_whatsapp', c.nome_whatsapp,
    'aviso_equipe_ja_dado', public.fn_ju_aviso_equipe_dado(c.id),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
