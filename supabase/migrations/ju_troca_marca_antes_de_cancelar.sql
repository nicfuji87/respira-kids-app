-- 15/11/2026 (aprovado pelo dono, caso Heloisa/Maria Cecília): em troca de horário de quem marca pela
-- agenda pública, a Ju cancelava a sessão antes de ter o novo horário. Agora o prompt manda marcar primeiro
-- (agendar_pelo_link) e só depois cancelar a antiga; a resposta da ferramenta lembra disso.
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_acao_fixo'::regproc);
  v_old text := $o$|| '. Confirme à família em uma frase curta (dia, horário e fisio), sem falar de valor nem de link.');$o$;
  v_new text := $n$|| '. Se isto for uma troca de horário, agora cancele a sessão antiga com cancelar_consulta (se ela recusar, avise a família que o novo está marcado e chame a secretaria com REMARCACAO para desmarcar a antiga). Confirme à família em uma frase curta (dia, horário e fisio), sem falar de valor nem de link.');$n$;
BEGIN
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $mig$;
