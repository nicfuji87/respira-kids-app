-- 29/10/2026 (pedido do dono): organizar a agenda. A Ju sugere primeiro os horários colados em consultas que
-- já existem (agenda corrida: 11, 12 e 13 em vez de 11, 14 e 17). Os outros livres só se a família pedir.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_ocupado(p_prof uuid, p_inicio timestamptz, p_ignorar_conversa bigint DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
  SELECT EXISTS (
           SELECT 1 FROM public.agendamentos a
             JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
             LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
            WHERE a.profissional_id = p_prof AND a.ativo AND cs.codigo NOT IN ('cancelado', 'erro')
              AND a.data_hora < p_inicio + interval '60 minutes'
              AND a.data_hora + make_interval(mins => coalesce(nullif(ts.duracao_minutos, 0), 60)) > p_inicio)
      OR EXISTS (
           SELECT 1 FROM public.ju_reservas r
            WHERE r.profissional_id = p_prof AND r.conversa_id IS DISTINCT FROM p_ignorar_conversa
              AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
              AND r.data_hora < p_inicio + interval '60 minutes' AND r.data_hora + interval '60 minutes' > p_inicio);
$f$;
REVOKE ALL ON FUNCTION public.fn_ju_reserva_ocupado(uuid, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_reserva_ocupado(uuid, timestamptz, bigint) TO service_role;

-- fn_ju_horarios_livres passa a devolver `sugeridos` (2 horários) e a resposta manda oferecer esses primeiro.
-- Critério: horário colado em consulta/reserva existente (antes ou depois); entre esses, o dia mais próximo.
-- Sem nenhum colado na janela, vale o mais cedo do dia mais próximo (dia vazio começa do início).
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_horarios_livres(bigint, text, date, text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%sugeridos%' THEN RETURN; END IF;
  n := replace(d, $a$  RETURN jsonb_build_object('ok', true, 'dias', v_dias,
    'resposta', 'Horários livres para reserva (hora cheia; cada faixa inclui todas as horas dentro dela): ' || v_txt
                || '. Ofereça poucas opções, de forma natural (ex.: "pra hoje ainda tem às 16h; amanhã pode ser das 14h às 17h"). '
                || 'Para reservar, use reservar_horario com a data entre colchetes (AAAA-MM-DD) e a hora escolhida (HH:MM).');$a$,
$a$  -- Sugestão: horários colados em consulta/reserva existente (agenda corrida), do dia mais próximo.
  WITH c AS (
    SELECT t.d ->> 'data' AS data, t.d ->> 'rotulo' AS rotulo, h AS hora, t.di
      FROM jsonb_array_elements(v_dias) WITH ORDINALITY AS t(d, di), jsonb_array_elements_text(t.d -> 'horas') h
  ), s AS (
    SELECT c.*, public.fn_ju_reserva_ocupado(cfg.profissional_id, ((c.data::date + c.hora::time) - interval '1 hour') AT TIME ZONE 'UTC', p_conversa_id)::int
              + public.fn_ju_reserva_ocupado(cfg.profissional_id, ((c.data::date + c.hora::time) + interval '1 hour') AT TIME ZONE 'UTC', p_conversa_id)::int AS score
      FROM c
  ), top AS (
    SELECT * FROM s ORDER BY (score = 0), di, score DESC, hora LIMIT 2
  )
  SELECT jsonb_agg(jsonb_build_object('data', data, 'hora', hora, 'rotulo', rotulo) ORDER BY di, hora),
         string_agg(rotulo || ' [' || data || '] às ' || ltrim(split_part(hora, ':', 1), '0') || 'h', ' e ' ORDER BY di, hora)
    INTO v_sug, v_sug_txt FROM top;
  RETURN jsonb_build_object('ok', true, 'dias', v_dias, 'sugeridos', v_sug,
    'resposta', 'Ofereça primeiro estes dois horários (deixam a agenda da fisio corrida, sem buracos): ' || v_sug_txt
                || '. Outros horários livres, só se a família pedir outro dia, outro período ou um horário específico: ' || v_txt
                || '. Fale de forma natural (ex.: "amanhã tem às 12h ou às 13h. Algum fica bom?"). '
                || 'Para reservar, use reservar_horario com a data entre colchetes (AAAA-MM-DD) e a hora escolhida (HH:MM).');$a$);
  n := replace(n, $a$v_faixa text; i int; j int;$a$, $a$v_faixa text; i int; j int; v_sug jsonb; v_sug_txt text;$a$);
  IF n NOT LIKE '%sugeridos%' OR n NOT LIKE '%v_sug_txt text%' THEN RAISE EXCEPTION 'fn_ju_horarios_livres: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
