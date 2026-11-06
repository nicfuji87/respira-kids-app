-- AI dev note: 06/11/2026 (caso Renata, conv 11301): a mãe perguntou se era normal o bebê não engatinhar, a Ju abriu
-- CLINICO junto do AGENDAMENTO e o pré-atendimento do contato novo parou (modo ANOTAR, Ju muda desde 7h14).
-- Pedido CLINICO não urgente não interrompe mais o pré-atendimento. (O prompt também passou a tratar essa dúvida como
-- motivo da avaliação, sem abrir CLINICO.)
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_pre_atendimento'::regproc);
  a text := $a$WHERE s.conversa_id = c.id AND s.status = 'ABERTA' AND s.tipo <> 'AGENDAMENTO')$a$;
BEGIN
  IF position(a IN d) = 0 THEN RAISE EXCEPTION 'fn_ju_pre_atendimento: trecho não encontrado'; END IF;
  EXECUTE replace(d, a, $a$WHERE s.conversa_id = c.id AND s.status = 'ABERTA' AND s.tipo <> 'AGENDAMENTO'
                          AND NOT (s.tipo = 'CLINICO' AND NOT coalesce(s.urgente, false)))$a$);
END $do$;
