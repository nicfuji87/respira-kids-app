-- 28/10/2026 (ok do dono):
-- 1) Follow-up não sai quando a família reclamou do atendimento ou a Lolô pediu desculpas (caso Cibele:
--    família reclamou da IA, a Lolô se desculpou e o FU automático estava programado para o dia seguinte).
-- 2) Resumo "Esperando resposta" vê as consultas dos últimos dias (inclusive passadas): pedido de sessão
--    já lançado na agenda conta como atendido (caso Thais/Artur, que seguia no resumo depois de lançado).
-- 3) CONVERSA_BRUNA: a Ju apresenta a Bruna Cury como fisioterapeuta responsável da clínica.

CREATE OR REPLACE FUNCTION public.fn_followup_clima_ruim(p_conversa_id bigint, p_desde timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.ju_mensagens m
     WHERE m.conversa_id = p_conversa_id
       AND m.created_at >= coalesce(p_desde, now() - interval '7 days')
       AND ((m.origem = 'CLIENTE'
             AND m.conteudo ~* '(n[ãa]o entendi|confus|\mrob[ôo]\M|\mia\M|intelig[êe]ncia artificial|sem (nenhuma )?informa[çc][ãa]o|absurdo|p[ée]ssim|horr[íi]vel|reclama|insatisfeit|chatead|desrespeit|falta de respeito|descaso)')
         OR (m.origem = 'HUMANO' AND m.conteudo ~* '(desculp|perd[ãa]o|lament)')))
$f$;
REVOKE ALL ON FUNCTION public.fn_followup_clima_ruim(bigint, timestamptz) FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_avaliar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%reclamacao_ou_desculpas%' THEN RETURN; END IF;
  n := replace(d, $a$    ELSIF public.fn_followup_aguardando_secretaria(r.conversa_id) THEN$a$,
                  $a$    ELSIF public.fn_followup_clima_ruim(r.conversa_id, r.aberta_em - interval '1 day') THEN
      v_sit := 'bloqueado'; v_mot := 'reclamacao_ou_desculpas';
    ELSIF public.fn_followup_aguardando_secretaria(r.conversa_id) THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_avaliar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_revalidar(uuid)'::regprocedure); n text;
BEGIN
  IF d LIKE '%fn_followup_clima_ruim%' THEN RETURN; END IF;
  n := replace(d, $a$    WHEN public.fn_followup_aguardando_secretaria(t.conversa_id) THEN 'lolo_conduzindo'$a$,
                  $a$    WHEN public.fn_followup_clima_ruim(t.conversa_id, o.aberta_em - interval '1 day') THEN 'reclamacao_ou_desculpas'
    WHEN public.fn_followup_aguardando_secretaria(t.conversa_id) THEN 'lolo_conduzindo'$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_revalidar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta(integer)'::regprocedure); n text;
BEGIN
  IF d LIKE '%consultas_ultimos_dias%' THEN RETURN; END IF;
  n := replace(d, $a$'proximas_consultas', x -> 'proximas_consultas',$a$,
                  $a$'proximas_consultas', x -> 'proximas_consultas',
                                 'consultas_ultimos_dias', (SELECT jsonb_agg(to_char(a.data_hora, 'DD/MM HH24:MI') || ' ' || coalesce(cs.codigo, '') ORDER BY a.data_hora)
                                                              FROM agendamentos a
                                                              LEFT JOIN consulta_status cs ON cs.id = a.status_consulta_id
                                                             WHERE a.paciente_id = (x ->> 'paciente_id')::uuid AND a.ativo
                                                               AND a.data_hora::date BETWEEN current_date - 4 AND current_date
                                                               AND coalesce(cs.codigo, '') <> 'cancelado'),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_esperando_resposta: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

UPDATE public.ju_conhecimento
   SET texto = replace(texto,
         'A Ju explica isso em uma frase, sem avaliar o caso, diz que a Bruna vai falar com a família por ali',
         'A Ju explica isso em uma frase, sem avaliar o caso, apresentando-a como "a Bruna Cury, fisioterapeuta responsável da clínica" (nunca só "a Bruna": a família ainda não a conhece), diz que ela vai falar com a família por ali'),
       updated_at = now()
 WHERE id = 'CONVERSA_BRUNA' AND texto NOT LIKE '%fisioterapeuta responsável da clínica%';
