-- AI dev note: 04/11/2026 (pedido do dono): o aviso "⏰ Atraso avisado" sai no grupo 🩺 Agenda e atendimentos
-- (antes no 🔔). O "✅ Ok" vale nos dois grupos (cards antigos no 🔔) e, no grupo da agenda, não responde
-- nada: o card some. A Entrada aceita ju_atraso_ok vindo do grupo da agenda.

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_aviso_atraso'::regproc);
  IF position($a$jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button'$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ju_aviso_atraso: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button'$a$,
                     $a$jsonb_build_object('number', '120363402677285308@g.us', 'type', 'button'$a$);

  d := pg_get_functiondef('public.fn_ju_reserva_botao'::regproc);
  IF position($a$  IF p_prof LIKE 'ju_lecmd:%' THEN$a$ IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_reserva_botao: trecho não encontrado'; END IF;
  EXECUTE replace(d, $a$  IF p_prof LIKE 'ju_lecmd:%' THEN$a$,
    $a$  IF p_prof LIKE 'ju_atraso_ok:%' AND coalesce(p_chatid, '') = '120363402677285308@g.us' THEN
    RETURN public.fn_ju_atraso_botao(p_prof, p_quem) || jsonb_build_object('silencioso', true);
  END IF;
  IF p_prof LIKE 'ju_lecmd:%' THEN$a$);
END $do$;
