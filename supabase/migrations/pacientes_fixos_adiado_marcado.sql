-- Pacientes Fixos: adiado que já marcou a volta conta como "Marcados"
-- (02/11/2026, caso da Antônia: adiada até a semana de 09/11 e já com
-- consulta em 10/11, mas a aba da semana atual ainda mostrava "Adiados").
--
-- O cálculo mora em fn_pacientes_fixos_semana_dados (a tela e o lembrete
-- automático da Ju usam; ver fixos_lembrete_automatico.sql). Para não perder
-- mudanças de outros trabalhos, a função é editada a partir da definição
-- atual, trocando só três trechos. Se algum trecho não for encontrado, a
-- migration falha (nada muda).
-- - base: próxima consulta agendada/confirmada a partir da semana na tela;
-- - situação: adiado com consulta marcada → 'completo';
-- - saída: proxima_sessao.

DO $m$
DECLARE
  d text := pg_get_functiondef('public.fn_pacientes_fixos_semana_dados(date)'::regprocedure);
  a1 text := $a$           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh < v_ini) AS ultima_antes,$a$;
  b1 text := $a$           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh < v_ini) AS ultima_antes,
           (SELECT min(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh >= v_ini
               AND s.status IN ('agendado', 'confirmado')) AS proxima,$a$;
  a2 text := $a$             WHEN c.semana_prevista > v_ini AND c.adiado_ate IS NOT NULL AND c.adiado_ate > v_ini THEN 'adiado'$a$;
  b2 text := $a$             WHEN c.semana_prevista > v_ini AND c.adiado_ate IS NOT NULL AND c.adiado_ate > v_ini THEN
               CASE WHEN c.proxima IS NOT NULL THEN 'completo' ELSE 'adiado' END$a$;
  a3 text := $a$           'ultima_sessao', to_char(fi.ultima_antes, 'YYYY-MM-DD"T"HH24:MI'),$a$;
  b3 text := $a$           'ultima_sessao', to_char(fi.ultima_antes, 'YYYY-MM-DD"T"HH24:MI'),
           'proxima_sessao', to_char(fi.proxima, 'YYYY-MM-DD"T"HH24:MI'),$a$;
BEGIN
  IF position('AS proxima,' IN d) > 0 THEN
    RAISE NOTICE 'fn_pacientes_fixos_semana_dados já tem proxima_sessao; nada a fazer';
    RETURN;
  END IF;
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 OR position(a3 IN d) = 0 THEN
    RAISE EXCEPTION 'fn_pacientes_fixos_semana_dados mudou: trecho esperado não encontrado';
  END IF;
  d := replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
  EXECUTE d;
END $m$;

REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_semana_dados(date) FROM PUBLIC, anon, authenticated;
