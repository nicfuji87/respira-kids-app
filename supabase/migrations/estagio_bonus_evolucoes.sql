-- Bônus das estagiárias por evolução em até 24h (combinado na reunião de 23/10/2026).
--
-- Regra:
--   * Cada estagiária começa o mês com R$ 100.
--   * Cada sessão realizada sem evolução registrada em até 24h desconta R$ 5
--     (feita depois das 24h também desconta). 20 perdidas zeram o bônus.
--   * Conta toda sessão da clínica (respiratória, motora, avaliação...), exceto
--     atendimento domiciliar, que fica liberado (as estagiárias não vão).
--   * Sessão cancelada, reagendada, com falta ou erro não conta.
--   * A perda é da dupla: as duas recebem o mesmo valor (se organizam entre
--     manhã e tarde).
--
-- data_hora é hora de parede gravada como UTC (ver fn_agora_parede);
-- relatorio_evolucao.created_at é instante real -> converte para SP.

CREATE OR REPLACE FUNCTION public.fn_estagio_bonus_evolucoes(p_mes date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_bonus_base   constant numeric := 100;
  c_desconto     constant numeric := 5;
  v_agora        timestamp := fn_agora_parede();
  v_inicio       date := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim          date := (date_trunc('month', coalesce(p_mes, v_agora::date)) + interval '1 month - 1 day')::date;
  v_result       jsonb;
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

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
  s AS (
    SELECT b.*,
           b.inicio_sessao + interval '24 hours' AS prazo,
           (b.inicio_sessao + interval '24 hours') <= v_agora AS venceu,
           (b.evo_em IS NOT NULL AND b.evo_em <= b.inicio_sessao + interval '24 hours') AS no_prazo,
           CASE WHEN extract(hour FROM b.inicio_sessao) < 13 THEN 'manha' ELSE 'tarde' END AS turno
      FROM base b
     WHERE NOT b.domiciliar
  ),
  tot AS (
    SELECT count(*) FILTER (WHERE venceu)                                   AS contadas,
           count(*) FILTER (WHERE venceu AND no_prazo)                      AS no_prazo,
           count(*) FILTER (WHERE venceu AND NOT no_prazo)                  AS perdidas,
           count(*) FILTER (WHERE venceu AND NOT no_prazo AND evo_em IS NOT NULL) AS feitas_atrasadas,
           count(*) FILTER (WHERE venceu AND evo_em IS NULL)                AS sem_evolucao,
           count(*) FILTER (WHERE NOT venceu AND evo_em IS NULL)            AS em_risco,
           count(*) FILTER (WHERE NOT venceu AND evo_em IS NOT NULL)        AS adiantadas
      FROM s
  )
  SELECT jsonb_build_object(
    'mes', to_char(v_inicio, 'YYYY-MM'),
    'inicio', v_inicio,
    'fim', v_fim,
    'atualizado_em', v_agora,
    'bonus_base', c_bonus_base,
    'desconto_por_perdida', c_desconto,
    'contadas', t.contadas,
    'no_prazo', t.no_prazo,
    'perdidas', t.perdidas,
    'feitas_atrasadas', t.feitas_atrasadas,
    'sem_evolucao', t.sem_evolucao,
    'em_risco', t.em_risco,
    'adiantadas', t.adiantadas,
    'bonus', greatest(0, c_bonus_base - c_desconto * t.perdidas),
    'domiciliares_liberadas', (SELECT count(*) FROM base WHERE domiciliar),
    'por_grupo', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'grupo', g.grupo,
               'contadas', g.contadas,
               'no_prazo', g.no_prazo,
               'perdidas', g.perdidas,
               'com_evolucao', g.com_evolucao
             ) ORDER BY g.contadas DESC)
        FROM (
          SELECT grupo,
                 count(*) FILTER (WHERE venceu) AS contadas,
                 count(*) FILTER (WHERE venceu AND no_prazo) AS no_prazo,
                 count(*) FILTER (WHERE venceu AND NOT no_prazo) AS perdidas,
                 count(*) FILTER (WHERE venceu AND evo_em IS NOT NULL) AS com_evolucao
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
                 count(*) FILTER (WHERE venceu) AS contadas,
                 count(*) FILTER (WHERE venceu AND NOT no_prazo) AS perdidas
            FROM s GROUP BY turno
        ) x
    ), '[]'::jsonb),
    'em_risco_lista', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id,
               'inicio', r.inicio_sessao,
               'prazo', r.prazo,
               'grupo', r.grupo,
               'paciente', split_part(coalesce(r.paciente, ''), ' ', 1),
               'profissional', split_part(coalesce(r.profissional, ''), ' ', 1)
             ) ORDER BY r.prazo)
        FROM (
          SELECT * FROM s
           WHERE NOT venceu AND evo_em IS NULL
           ORDER BY prazo
           LIMIT 30
        ) r
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM tot t;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_estagio_bonus_evolucoes(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_estagio_bonus_evolucoes(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_estagio_bonus_evolucoes(date) TO authenticated;

COMMENT ON FUNCTION public.fn_estagio_bonus_evolucoes(date) IS
  'Bônus das estagiárias: R$100/mês menos R$5 por sessão sem evolução em até 24h (exceto domiciliar). Admin/secretaria.';
