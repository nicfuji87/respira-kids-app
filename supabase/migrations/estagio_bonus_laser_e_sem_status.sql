-- 15/11/2026 (pedido do dono, conferência do grupo do estágio): o bônus de evoluções descontava
-- sessões que não deveriam contar.
--   1. Laserterapia não tem evolução (9 sessões desde junho, nenhuma evoluída) → sai da conta.
--   2. Sessão vencida, sem evolução e ainda "Agendado/Confirmado" (a recepção não marcou falta,
--      desmarcação nem finalizado) não desconta: fica numa lista à parte, "sem status". Quando a
--      recepção marcar Finalizado ela volta a contar com o prazo original; Faltou/Cancelado tira de vez.
--      (Finalizado hoje só acontece com evolução ou baixa manual da recepção.)
--   3. Mensagem das 18h ganha a lista "sem status" e o aviso de que é um retrato das 18h.
-- Em 13/11 eram 13 "fora do prazo"; só 2 eram atraso de verdade.

CREATE OR REPLACE FUNCTION public.fn_estagio_sem_status_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(id), '{}') from consulta_status where codigo in ('agendado', 'confirmado');
$function$;

CREATE OR REPLACE FUNCTION public.fn_estagio_bonus_evolucoes_calc(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_bonus_base      constant numeric := 100;
  c_desconto        constant numeric := 5;
  c_vigencia_inicio constant date := '2026-10-24';
  c_motora_desde    constant date := '2026-12-01';
  v_agora        timestamp := fn_agora_parede();
  v_inicio       date := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim          date := (date_trunc('month', coalesce(p_mes, v_agora::date)) + interval '1 month - 1 day')::date;
  v_sem_status   uuid[] := fn_estagio_sem_status_ids();
  v_ini_efetivo  date;
  v_dias_mes     integer;
  v_dias_vig     integer;
  v_base         numeric;
  v_conta_motora boolean;
  v_result       jsonb;
BEGIN

  v_ini_efetivo  := greatest(v_inicio, c_vigencia_inicio);
  v_dias_mes     := (v_fim - v_inicio) + 1;
  v_dias_vig     := greatest(0, (v_fim - v_ini_efetivo) + 1);
  v_base         := round(c_bonus_base * v_dias_vig::numeric / v_dias_mes, 2);
  v_conta_motora := v_inicio >= c_motora_desde;

  WITH base AS (
    SELECT a.id,
           (a.data_hora AT TIME ZONE 'UTC') AS inicio_sessao,
           ts.nome AS servico,
           CASE
             WHEN ts.nome ILIKE '%avalia%' THEN 'avaliacao'
             WHEN ts.nome ILIKE '%respirat%' OR ts.nome ILIKE '%aspira%' THEN 'respiratoria'
             WHEN ts.nome ILIKE '%motora%' THEN 'motora'
             ELSE 'outros'
           END AS grupo,
           ts.nome ILIKE '%domiciliar%' AS domiciliar,
           ts.nome ILIKE '%motor%' AS eh_motora,
           a.status_consulta_id,
           pp.nome AS paciente,
           pr.nome AS profissional,
           (SELECT min(re.created_at AT TIME ZONE 'America/Sao_Paulo')
              FROM relatorio_evolucao re
             WHERE re.id_agendamento = a.id) AS evo_em
      FROM agendamentos a
      JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
      LEFT JOIN pessoas pp ON pp.id = a.paciente_id
      LEFT JOIN pessoas pr ON pr.id = a.profissional_id
     WHERE a.ativo = true
       AND a.paciente_id IS NOT NULL
       AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
       AND ts.nome NOT ILIKE '%laser%'
       AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_inicio AND v_fim
       AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
  ),
  com_prazo AS (
    SELECT b.*,
           extract(isodow FROM b.inicio_sessao) IN (6, 7) AS fim_de_semana,
           fn_evolucao_prazo(b.inicio_sessao) AS prazo
      FROM base b
     WHERE NOT b.domiciliar
  ),
  s0 AS (
    SELECT c.*,
           c.prazo <= v_agora AS venceu,
           (c.evo_em IS NOT NULL AND c.evo_em <= c.prazo) AS no_prazo,
           CASE WHEN extract(hour FROM c.inicio_sessao) < 13 THEN 'manha' ELSE 'tarde' END AS turno,
           (c.inicio_sessao::date >= v_ini_efetivo
             AND (v_conta_motora OR NOT c.eh_motora)) AS elegivel,
           (c.prazo <= v_agora AND c.evo_em IS NULL
             AND c.status_consulta_id = ANY (v_sem_status)) AS sem_status
      FROM com_prazo c
  ),
  s AS (
    SELECT s0.*, (s0.elegivel AND NOT s0.sem_status) AS conta_bonus FROM s0
  ),
  tot AS (
    SELECT count(*) FILTER (WHERE venceu AND conta_bonus)                                    AS contadas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND no_prazo)                       AS no_prazo,
           count(*) FILTER (WHERE venceu AND conta_bonus AND NOT no_prazo)                   AS perdidas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND NOT no_prazo AND evo_em IS NOT NULL) AS feitas_atrasadas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND evo_em IS NULL)                 AS sem_evolucao,
           count(*) FILTER (WHERE NOT venceu AND conta_bonus AND evo_em IS NULL)              AS em_risco,
           count(*) FILTER (WHERE NOT venceu AND conta_bonus AND evo_em IS NOT NULL)          AS adiantadas,
           count(*) FILTER (WHERE elegivel AND sem_status)                                   AS sem_status
      FROM s
  )
  SELECT jsonb_build_object(
    'mes', to_char(v_inicio, 'YYYY-MM'),
    'inicio', v_inicio,
    'fim', v_fim,
    'atualizado_em', v_agora,
    'bonus_base', v_base,
    'bonus_base_cheio', c_bonus_base,
    'proporcional', v_dias_vig < v_dias_mes,
    'dias_vigentes', v_dias_vig,
    'dias_mes', v_dias_mes,
    'vigencia_inicio', c_vigencia_inicio,
    'conta_motora', v_conta_motora,
    'motora_desde', c_motora_desde,
    'desconto_por_perdida', round(c_desconto * v_dias_vig::numeric / v_dias_mes, 2),
    'contadas', t.contadas,
    'no_prazo', t.no_prazo,
    'perdidas', t.perdidas,
    'feitas_atrasadas', t.feitas_atrasadas,
    'sem_evolucao', t.sem_evolucao,
    'em_risco', t.em_risco,
    'adiantadas', t.adiantadas,
    'sem_status', t.sem_status,
    'bonus', greatest(0, round((c_bonus_base - c_desconto * t.perdidas) * v_dias_vig::numeric / v_dias_mes, 2)),
    'domiciliares_liberadas', (SELECT count(*) FROM base WHERE domiciliar),
    'por_grupo', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'grupo', g.grupo,
               'contadas', g.contadas,
               'no_prazo', g.no_prazo,
               'perdidas', g.perdidas,
               'com_evolucao', g.com_evolucao,
               'conta_no_bonus', g.conta_no_bonus
             ) ORDER BY g.contadas DESC)
        FROM (
          SELECT grupo,
                 count(*) FILTER (WHERE venceu AND NOT sem_status) AS contadas,
                 count(*) FILTER (WHERE venceu AND no_prazo) AS no_prazo,
                 count(*) FILTER (WHERE venceu AND NOT sem_status AND NOT no_prazo) AS perdidas,
                 count(*) FILTER (WHERE venceu AND evo_em IS NOT NULL) AS com_evolucao,
                 bool_or(elegivel) AS conta_no_bonus
            FROM s GROUP BY grupo
        ) g
       WHERE g.contadas > 0
    ), '[]'::jsonb),
    'por_turno', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'turno', x.turno,
               'contadas', x.contadas,
               'perdidas', x.perdidas
             ) ORDER BY x.turno)
        FROM (
          SELECT turno,
                 count(*) FILTER (WHERE venceu AND conta_bonus) AS contadas,
                 count(*) FILTER (WHERE venceu AND conta_bonus AND NOT no_prazo) AS perdidas
            FROM s GROUP BY turno
        ) x
    ), '[]'::jsonb),
    'em_risco_lista', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id,
               'inicio', r.inicio_sessao,
               'prazo', r.prazo,
               'grupo', r.grupo,
               'fim_de_semana', r.fim_de_semana,
               'paciente', split_part(coalesce(r.paciente, ''), ' ', 1),
               'profissional', split_part(coalesce(r.profissional, ''), ' ', 1)
             ) ORDER BY r.prazo)
        FROM (
          SELECT * FROM s
           WHERE NOT venceu AND evo_em IS NULL AND conta_bonus
           ORDER BY prazo
           LIMIT 30
        ) r
    ), '[]'::jsonb),
    'sem_status_lista', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id,
               'inicio', r.inicio_sessao,
               'grupo', r.grupo,
               'paciente', split_part(coalesce(r.paciente, ''), ' ', 1),
               'profissional', split_part(coalesce(r.profissional, ''), ' ', 1)
             ) ORDER BY r.inicio_sessao)
        FROM (
          SELECT * FROM s WHERE elegivel AND sem_status ORDER BY inicio_sessao LIMIT 30
        ) r
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM tot t;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estagio_status_diario_texto()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b jsonb := fn_estagio_bonus_evolucoes_calc(NULL);
  v_agora timestamp := fn_agora_parede();
  v_hoje date := fn_agora_parede()::date;
  v_motora boolean := coalesce((b ->> 'conta_motora')::boolean, false);
  v_sem_status uuid[] := fn_estagio_sem_status_ids();
  h record; v_pend text; v_perd text; v_prof text; v_txt text; v_pct int; v_sst text;
  v_ini_mes date := date_trunc('month', fn_agora_parede())::date;
  v_meses text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  v_dias text[] := ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _est_s (inicio timestamp, prazo timestamp, evo_em timestamp, paciente text, profissional text, sem_status boolean) ON COMMIT DROP;
  TRUNCATE _est_s;
  INSERT INTO _est_s
  SELECT x.inicio, x.prazo, x.evo_em, x.paciente, x.profissional,
         (x.prazo <= v_agora AND x.evo_em IS NULL AND x.status_consulta_id = ANY (v_sem_status))
    FROM (
      SELECT (a.data_hora AT TIME ZONE 'UTC') AS inicio,
             fn_evolucao_prazo(a.data_hora AT TIME ZONE 'UTC') AS prazo,
             (SELECT min(re.created_at AT TIME ZONE 'America/Sao_Paulo') FROM relatorio_evolucao re WHERE re.id_agendamento = a.id) AS evo_em,
             split_part(coalesce(pp.nome, ''), ' ', 1) AS paciente,
             split_part(coalesce(pr.nome, ''), ' ', 1) AS profissional,
             a.status_consulta_id
        FROM agendamentos a
        JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
        LEFT JOIN pessoas pp ON pp.id = a.paciente_id
        LEFT JOIN pessoas pr ON pr.id = a.profissional_id
       WHERE a.ativo AND a.paciente_id IS NOT NULL
         AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
         AND ts.nome NOT ILIKE '%domiciliar%'
         AND ts.nome NOT ILIKE '%laser%'
         AND (v_motora OR ts.nome NOT ILIKE '%motor%')
         AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
         AND (a.data_hora AT TIME ZONE 'UTC') >= least(v_ini_mes::timestamp, v_agora - interval '4 days')
         AND (a.data_hora AT TIME ZONE 'UTC')::date >= (b ->> 'vigencia_inicio')::date
    ) x;

  SELECT count(*) AS sessoes, count(*) FILTER (WHERE evo_em IS NOT NULL) AS evoluidas,
         count(*) FILTER (WHERE evo_em IS NULL) AS pendentes
    INTO h FROM _est_s WHERE inicio::date = v_hoje;

  SELECT string_agg('• ' || paciente || ' · ' || profissional || ' · '
           || CASE WHEN inicio::date = v_hoje THEN 'hoje' WHEN inicio::date = v_hoje - 1 THEN 'ontem'
                   ELSE v_dias[extract(dow FROM inicio)::int + 1] END
           || ' ' || regexp_replace(to_char(inicio, 'FMHH24"h"MI'), 'h00$', 'h')
           || ' → até ' || CASE WHEN prazo::date = v_hoje THEN 'hoje' WHEN prazo::date = v_hoje + 1 THEN 'amanhã'
                                ELSE v_dias[extract(dow FROM prazo)::int + 1] END
           || ' ' || regexp_replace(to_char(prazo, 'FMHH24"h"MI'), 'h00$', 'h'), E'\n' ORDER BY prazo)
    INTO v_pend FROM _est_s WHERE evo_em IS NULL AND prazo > v_agora;

  SELECT string_agg(paciente || ' (' || profissional || ', '
           || CASE WHEN inicio::date = v_hoje - 1 THEN 'ontem' ELSE to_char(inicio, 'DD/MM') END
           || ' ' || regexp_replace(to_char(inicio, 'FMHH24"h"MI'), 'h00$', 'h') || ')', ', ' ORDER BY inicio)
    INTO v_perd FROM _est_s
   WHERE prazo::date = v_hoje AND prazo <= v_agora AND (evo_em IS NULL OR evo_em > prazo) AND NOT sem_status;

  SELECT string_agg(paciente || ' (' || profissional || ', ' || to_char(inicio, 'DD/MM') || ' '
           || regexp_replace(to_char(inicio, 'FMHH24"h"MI'), 'h00$', 'h') || ')', ', ' ORDER BY inicio)
    INTO v_sst FROM _est_s WHERE sem_status AND inicio::date >= v_ini_mes;

  SELECT string_agg('• ' || profissional || ': ' || no_prazo || ' de ' || total || ' no prazo'
           || CASE WHEN fora > 0 THEN ' · ' || fora || ' fora' ELSE '' END, E'\n' ORDER BY total DESC, profissional)
    INTO v_prof
    FROM (SELECT profissional, count(*) AS total,
                 count(*) FILTER (WHERE evo_em IS NOT NULL AND evo_em <= prazo) AS no_prazo,
                 count(*) FILTER (WHERE evo_em IS NULL OR evo_em > prazo) AS fora
            FROM _est_s WHERE inicio::date >= v_ini_mes AND prazo <= v_agora AND NOT sem_status
           GROUP BY profissional) x;

  v_pct := CASE WHEN (b ->> 'contadas')::int > 0
                THEN round(100.0 * (b ->> 'no_prazo')::int / (b ->> 'contadas')::int) END;

  v_txt := '📊 *Evoluções · ' || v_dias[extract(dow FROM v_hoje)::int + 1] || ', ' || to_char(v_hoje, 'DD/MM') || '*'
    || E'\n\n*Hoje:* ' || h.sessoes || CASE WHEN h.sessoes = 1 THEN ' sessão' ELSE ' sessões' END
    || ' · ' || h.evoluidas || CASE WHEN h.evoluidas = 1 THEN ' evoluída' ELSE ' evoluídas' END
    || ' · ' || h.pendentes || CASE WHEN h.pendentes = 1 THEN ' pendente' ELSE ' pendentes' END
    || E'\n*' || initcap(v_meses[extract(month FROM v_hoje)::int]) || ':* '
    || (b ->> 'no_prazo') || ' de ' || (b ->> 'contadas') || ' evoluídas em até 24 h'
    || coalesce(' (' || v_pct || '%)', '')
    || ' · ' || (b ->> 'perdidas') || ' fora do prazo'
    || E'\n*Bônus do mês:* R$ ' || replace(to_char((b ->> 'bonus')::numeric, 'FM999990.00'), '.', ',')
    || ' de R$ ' || replace(to_char((b ->> 'bonus_base')::numeric, 'FM999990.00'), '.', ',')
    || ' (cada evolução fora do prazo tira R$ ' || replace(to_char((b ->> 'desconto_por_perdida')::numeric, 'FM999990.00'), '.', ',') || ')';

  IF v_prof IS NOT NULL THEN
    v_txt := v_txt || E'\n\n👩‍⚕️ *Evoluções em 24 h por profissional (' || v_meses[extract(month FROM v_hoje)::int] || E'):*\n' || v_prof;
  END IF;
  IF v_pend IS NOT NULL THEN
    v_txt := v_txt || E'\n\n⏳ *Faltam evoluir (ainda no prazo):*\n' || v_pend;
  ELSE
    v_txt := v_txt || E'\n\n✅ Nada pendente no prazo. Obrigada!';
  END IF;
  IF v_perd IS NOT NULL THEN
    v_txt := v_txt || E'\n\n❌ *Venceram hoje sem evolução:* ' || v_perd;
  END IF;
  IF v_sst IS NOT NULL THEN
    v_txt := v_txt || E'\n\n❓ *Sem evolução e sem status* (não descontam até a recepção marcar se a sessão aconteceu): ' || v_sst;
  END IF;
  v_txt := v_txt || E'\n\n_Retrato das 18h: o que for evoluído depois não aparece aqui e continua no prazo.'
    || ' Domiciliar e laser não contam.'
    || CASE WHEN NOT v_motora
            THEN ' Motora (sessão e avaliação) passa a contar em ' || to_char((b ->> 'motora_desde')::date, 'DD/MM') || '.'
            ELSE '' END
    || '_';
  RETURN regexp_replace(v_txt, 'R\$ (\d+),00', 'R$ \1', 'g');
END $function$;

CREATE OR REPLACE FUNCTION public.fn_estagio_evolucoes_dados(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_agora  timestamp := fn_agora_parede();
  v_inicio date;
  v_fim    date;
  v_bonus  jsonb;
  v_result jsonb;
  v_sem_status uuid[] := fn_estagio_sem_status_ids();
begin
  v_inicio := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  v_bonus := fn_estagio_bonus_evolucoes_calc(v_inicio);

  with base as (
    select a.id,
           (a.data_hora at time zone 'UTC') as inicio,
           public.fn_evolucao_prazo(a.data_hora at time zone 'UTC') as prazo,
           case
             when ts.nome ilike '%avalia%' then 'Avaliação'
             when ts.nome ilike '%respirat%' or ts.nome ilike '%aspira%' then 'Respiratória'
             when ts.nome ilike '%motora%' then 'Motora'
             else ts.nome
           end as grupo,
           split_part(coalesce(pp.nome, ''), ' ', 1) as paciente,
           split_part(coalesce(pr.nome, ''), ' ', 1) as profissional,
           a.status_consulta_id = any (v_sem_status) as status_aberto,
           exists (select 1 from relatorio_evolucao re where re.id_agendamento = a.id) as tem_evo,
           (select min(re.created_at at time zone 'America/Sao_Paulo')
              from relatorio_evolucao re where re.id_agendamento = a.id) as evo_em
      from agendamentos a
      join tipo_servicos ts on ts.id = a.tipo_servico_id
      left join pessoas pp on pp.id = a.paciente_id
      left join pessoas pr on pr.id = a.profissional_id
     where a.ativo = true
       and a.paciente_id is not null
       and not (a.status_consulta_id = any (fn_status_sessao_nao_realizada()))
       and not (ts.nome ilike '%domiciliar%')
       and not (ts.nome ilike '%laser%')
       and (a.data_hora at time zone 'UTC')::date
           between least(v_inicio, v_agora::date - 7) and v_fim
  ),
  s as (
    select b.*,
           b.inicio <= v_agora as aconteceu,
           b.prazo <= v_agora as venceu,
           (b.evo_em is not null and b.evo_em <= b.prazo) as no_prazo,
           (b.prazo <= v_agora and not b.tem_evo and b.status_aberto) as sem_status
      from base b
  ),
  mes as (
    select * from s where inicio::date between v_inicio and v_fim
  )
  select jsonb_build_object(
    'mes', to_char(v_inicio, 'YYYY-MM'),
    'hoje', v_agora::date,
    'agora', v_agora,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', d.dia,
               'sessoes', d.sessoes,
               'realizadas', d.realizadas,
               'evoluidas', d.evoluidas,
               'faltam', d.faltam,
               'perdidas', d.perdidas,
               'sem_status', d.sem_status
             ) order by d.dia)
        from (
          select inicio::date as dia,
                 count(*) as sessoes,
                 count(*) filter (where aconteceu) as realizadas,
                 count(*) filter (where tem_evo) as evoluidas,
                 count(*) filter (where aconteceu and not tem_evo) as faltam,
                 count(*) filter (where venceu and not no_prazo and not sem_status) as perdidas,
                 count(*) filter (where sem_status) as sem_status
            from mes
           group by inicio::date
        ) d
    ), '[]'::jsonb),
    'no_prazo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional
             ) order by p.prazo)
        from s p
       where p.aconteceu and not p.tem_evo and not p.venceu
    ), '[]'::jsonb),
    'vencidas_total', (
      select count(*) from s
       where aconteceu and not tem_evo and venceu
         and inicio >= v_agora - interval '7 days'
    ),
    'vencidas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional,
               'sem_status', p.sem_status
             ) order by p.inicio desc)
        from (
          select * from s
           where aconteceu and not tem_evo and venceu
             and inicio >= v_agora - interval '7 days'
           order by inicio desc
           limit 30
        ) p
    ), '[]'::jsonb),
    'bonus', jsonb_build_object(
      'base', (v_bonus ->> 'bonus_base')::numeric,
      'base_cheia', (v_bonus ->> 'bonus_base_cheio')::numeric,
      'proporcional', (v_bonus ->> 'proporcional')::boolean,
      'desconto', (v_bonus ->> 'desconto_por_perdida')::numeric,
      'perdidas', (v_bonus ->> 'perdidas')::int,
      'contadas', (v_bonus ->> 'contadas')::int,
      'valor', (v_bonus ->> 'bonus')::numeric,
      'sem_status', (v_bonus ->> 'sem_status')::int,
      'motora_fora', NOT coalesce((v_bonus ->> 'conta_motora')::boolean, false),
      'motora_desde', v_bonus ->> 'motora_desde'
    )
  ) into v_result;

  return v_result;
end;
$function$;
