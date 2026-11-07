-- Bônus das estagiárias: motora só entra a partir de 01/12/2026 e o mês de
-- estreia é proporcional (a regra passou a valer em 24/10/2026, na reunião do
-- dia 23). Decisões do dono em 07/11/2026. Esta função alimenta os slides das
-- reuniões, o card da aba Clínica e, por reuso, fn_metas_pagamentos — uma
-- regra só, em um lugar só.

CREATE OR REPLACE FUNCTION public.fn_estagio_bonus_evolucoes(p_mes date DEFAULT NULL::date)
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
  v_ini_efetivo  date;
  v_dias_mes     integer;
  v_dias_vig     integer;
  v_base         numeric;
  v_conta_motora boolean;
  v_result       jsonb;
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

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
       AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_inicio AND v_fim
       AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
  ),
  com_prazo AS (
    SELECT b.*,
           extract(isodow FROM b.inicio_sessao) IN (6, 7) AS fim_de_semana,
           CASE
             WHEN extract(isodow FROM b.inicio_sessao) IN (6, 7) THEN
               (b.inicio_sessao::date + (8 - extract(isodow FROM b.inicio_sessao))::int)
               + interval '23 hours 59 minutes 59 seconds'
             ELSE b.inicio_sessao + interval '24 hours'
           END AS prazo
      FROM base b
     WHERE NOT b.domiciliar
  ),
  s AS (
    SELECT c.*,
           c.prazo <= v_agora AS venceu,
           (c.evo_em IS NOT NULL AND c.evo_em <= c.prazo) AS no_prazo,
           CASE WHEN extract(hour FROM c.inicio_sessao) < 13 THEN 'manha' ELSE 'tarde' END AS turno,
           (c.inicio_sessao::date >= v_ini_efetivo
             AND (v_conta_motora OR c.grupo <> 'motora')) AS conta_bonus
      FROM com_prazo c
  ),
  tot AS (
    SELECT count(*) FILTER (WHERE venceu AND conta_bonus)                                    AS contadas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND no_prazo)                       AS no_prazo,
           count(*) FILTER (WHERE venceu AND conta_bonus AND NOT no_prazo)                   AS perdidas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND NOT no_prazo AND evo_em IS NOT NULL) AS feitas_atrasadas,
           count(*) FILTER (WHERE venceu AND conta_bonus AND evo_em IS NULL)                 AS sem_evolucao,
           count(*) FILTER (WHERE NOT venceu AND conta_bonus AND evo_em IS NULL)              AS em_risco,
           count(*) FILTER (WHERE NOT venceu AND conta_bonus AND evo_em IS NOT NULL)          AS adiantadas
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
    'desconto_por_perdida', c_desconto,
    'contadas', t.contadas,
    'no_prazo', t.no_prazo,
    'perdidas', t.perdidas,
    'feitas_atrasadas', t.feitas_atrasadas,
    'sem_evolucao', t.sem_evolucao,
    'em_risco', t.em_risco,
    'adiantadas', t.adiantadas,
    'bonus', greatest(0, v_base - c_desconto * t.perdidas),
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
                 count(*) FILTER (WHERE venceu) AS contadas,
                 count(*) FILTER (WHERE venceu AND no_prazo) AS no_prazo,
                 count(*) FILTER (WHERE venceu AND NOT no_prazo) AS perdidas,
                 count(*) FILTER (WHERE venceu AND evo_em IS NOT NULL) AS com_evolucao,
                 bool_or(conta_bonus) AS conta_no_bonus
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
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM tot t;

  RETURN v_result;
END;
$function$
;
