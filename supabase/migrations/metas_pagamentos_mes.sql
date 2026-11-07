-- Painel de Pagamento (aba só do admin na tela Metas): evoluções separadas por
-- tipo, quem bateu a meta e quanto pagar a cada uma. Os números do bônus das
-- estagiárias vêm de fn_estagio_bonus_evolucoes; o lado da secretaria sai dos
-- níveis e do pré-requisito já gravados na tabela metas.

CREATE OR REPLACE FUNCTION public.fn_metas_pagamentos(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agora      timestamp := fn_agora_parede();
  v_ini        date := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim        date := (date_trunc('month', coalesce(p_mes, v_agora::date)) + interval '1 month - 1 day')::date;
  v_bonus      jsonb;
  v_bonus_cada numeric;
  v_result     jsonb;
BEGIN
  IF NOT fn_rls_admin() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  v_bonus := fn_estagio_bonus_evolucoes(v_ini);
  v_bonus_cada := (v_bonus ->> 'bonus')::numeric;

  WITH base AS (
    SELECT a.id,
           (a.data_hora AT TIME ZONE 'UTC') AS inicio_sessao,
           CASE
             WHEN ts.nome ILIKE '%avalia%' THEN 'avaliacao'
             WHEN ts.nome ILIKE '%respirat%' OR ts.nome ILIKE '%aspira%' THEN 'respiratoria'
             WHEN ts.nome ILIKE '%motora%' THEN 'motora'
             ELSE 'outros'
           END AS grupo,
           ts.nome ILIKE '%domiciliar%' AS domiciliar,
           (SELECT min(re.created_at AT TIME ZONE 'America/Sao_Paulo')
              FROM relatorio_evolucao re WHERE re.id_agendamento = a.id) AS evo_em
      FROM agendamentos a
      JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.ativo = true
       AND a.paciente_id IS NOT NULL
       AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
       AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_ini AND v_fim
       AND (a.data_hora AT TIME ZONE 'UTC') <= v_agora
  ),
  v AS (
    SELECT b.*,
           CASE
             WHEN extract(isodow FROM b.inicio_sessao) IN (6, 7)
               THEN (b.inicio_sessao::date + (8 - extract(isodow FROM b.inicio_sessao))::int)
                    + interval '23 hours 59 minutes 59 seconds'
             ELSE b.inicio_sessao + interval '24 hours'
           END AS prazo
      FROM base b
  ),
  venc AS (
    SELECT v.*, (v.evo_em IS NOT NULL AND v.evo_em <= v.prazo) AS no_prazo
      FROM v WHERE v.prazo <= v_agora
  )
  SELECT jsonb_build_object(
    'por_tipo', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'grupo', g.grupo,
               'sessoes', g.sessoes,
               'com_evolucao', g.com_evolucao,
               'no_prazo', g.no_prazo,
               'perdidas', g.perdidas,
               'pct_cobertura', CASE WHEN g.sessoes > 0 THEN round(100.0 * g.com_evolucao / g.sessoes, 1) ELSE 0 END,
               'pct_no_prazo', CASE WHEN g.sessoes > 0 THEN round(100.0 * g.no_prazo / g.sessoes, 1) ELSE 0 END,
               'conta_no_bonus', (coalesce((v_bonus ->> 'conta_motora')::boolean, false) OR g.grupo <> 'motora')
             ) ORDER BY g.sessoes DESC)
        FROM (
          SELECT grupo,
                 count(*) AS sessoes,
                 count(*) FILTER (WHERE evo_em IS NOT NULL) AS com_evolucao,
                 count(*) FILTER (WHERE no_prazo) AS no_prazo,
                 count(*) FILTER (WHERE NOT no_prazo) AS perdidas
            FROM venc GROUP BY grupo
        ) g WHERE g.sessoes > 0
    ), '[]'::jsonb)
  ) INTO v_result;

  SELECT v_result || jsonb_build_object(
    'mes', to_char(v_ini, 'YYYY-MM'),
    'inicio', v_ini,
    'fim', v_fim,
    'atualizado_em', v_agora,
    'regras', jsonb_build_object(
      'bonus_base', (v_bonus ->> 'bonus_base_cheio')::numeric,
      'desconto_por_perdida', (v_bonus ->> 'desconto_por_perdida')::numeric,
      'vigencia_inicio', v_bonus ->> 'vigencia_inicio',
      'motora_desde', v_bonus ->> 'motora_desde',
      'conta_motora', (v_bonus ->> 'conta_motora')::boolean,
      'dias_mes', (v_bonus ->> 'dias_mes')::int,
      'dias_vigentes', (v_bonus ->> 'dias_vigentes')::int,
      'proporcional', (v_bonus ->> 'proporcional')::boolean,
      'base_do_mes', (v_bonus ->> 'bonus_base')::numeric,
      'divisao', 'dupla'
    ),
    'contadas', (v_bonus ->> 'contadas')::int,
    'perdidas', (v_bonus ->> 'perdidas')::int,
    'em_risco', (v_bonus ->> 'em_risco')::int,
    'domiciliares_fora', (v_bonus ->> 'domiciliares_liberadas')::int,
    'bonus_cada', v_bonus_cada,
    'estagiarias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'nome', e.nome,
               'turno', e.turno,
               'dias_trabalhados', e.dias,
               'perdidas_do_turno', coalesce((
                 SELECT (x ->> 'perdidas')::int FROM jsonb_array_elements(v_bonus -> 'por_turno') x
                  WHERE x ->> 'turno' = e.turno), 0),
               'sessoes_do_turno', coalesce((
                 SELECT (x ->> 'contadas')::int FROM jsonb_array_elements(v_bonus -> 'por_turno') x
                  WHERE x ->> 'turno' = e.turno), 0),
               'bateu', (v_bonus_cada > 0),
               'a_pagar', v_bonus_cada
             ) ORDER BY e.turno, e.nome)
        FROM (
          SELECT c.nome,
                 CASE WHEN count(*) FILTER (WHERE p.entrada < '13:00') >= count(*) FILTER (WHERE p.entrada >= '13:00')
                      THEN 'manha' ELSE 'tarde' END AS turno,
                 count(*)::int AS dias
            FROM (
              SELECT pt.candidatura_id,
                     (pt.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
                     min((pt.registrado_em AT TIME ZONE 'America/Sao_Paulo')::time) FILTER (WHERE pt.tipo = 'entrada') AS entrada
                FROM estagio_pontos pt
               WHERE pt.ativo
                 AND (pt.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_ini AND v_fim
               GROUP BY 1, 2
            ) p
            JOIN candidaturas_estagio c ON c.id = p.candidatura_id
           GROUP BY c.nome
        ) e
    ), '[]'::jsonb),
    'secretaria', (
      SELECT jsonb_build_object(
               'nome', max(p.nome),
               'contatos', max(CASE WHEN tm.codigo = 'contatos_inatividade' THEN m.valor_atual END),
               'contatos_meta', max(CASE WHEN tm.codigo = 'contatos_inatividade' THEN m.valor_meta END),
               'reativacoes', max(CASE WHEN tm.codigo = 'pacientes_reativados' THEN m.valor_atual END),
               'reativacoes_meta', max(CASE WHEN tm.codigo = 'pacientes_reativados' THEN m.valor_meta END),
               'convites_pesquisa', max(CASE WHEN tm.codigo = 'pesquisa_convites' THEN m.valor_atual END),
               'respostas_pesquisa', max(CASE WHEN tm.codigo = 'pesquisa_respostas' THEN m.valor_atual END),
               'requisito_ok', bool_or(tm.codigo = 'contatos_inatividade' AND m.valor_atual >= m.valor_meta),
               'bonus_nivel', coalesce(max(CASE WHEN tm.codigo = 'pacientes_reativados' THEN (
                   SELECT max((n ->> 'bonus')::numeric) FROM jsonb_array_elements(coalesce(m.niveis, '[]'::jsonb)) n
                    WHERE (n ->> 'valor')::numeric <= m.valor_atual) END), 0),
               'proximo_nivel', (SELECT min((n ->> 'valor')::numeric)
                   FROM metas m2 JOIN tipos_meta t2 ON t2.id = m2.tipo_meta_id,
                        jsonb_array_elements(coalesce(m2.niveis, '[]'::jsonb)) n
                  WHERE m2.mes_referencia = extract(month FROM v_ini)
                    AND m2.ano_referencia = extract(year FROM v_ini)
                    AND t2.codigo = 'pacientes_reativados'
                    AND (n ->> 'valor')::numeric > m2.valor_atual)
             )
        FROM metas m
        JOIN tipos_meta tm ON tm.id = m.tipo_meta_id
        LEFT JOIN pessoas p ON p.id = m.pessoa_id
       WHERE m.mes_referencia = extract(month FROM v_ini)
         AND m.ano_referencia = extract(year FROM v_ini)
         AND tm.categoria IN ('reativacao', 'experiencia')
    )
  ) INTO v_result;

  RETURN v_result || jsonb_build_object(
    'secretaria_a_pagar',
      CASE WHEN coalesce((v_result -> 'secretaria' ->> 'requisito_ok')::boolean, false)
           THEN coalesce((v_result -> 'secretaria' ->> 'bonus_nivel')::numeric, 0) ELSE 0 END,
    'total_a_pagar',
      v_bonus_cada * jsonb_array_length(v_result -> 'estagiarias')
      + CASE WHEN coalesce((v_result -> 'secretaria' ->> 'requisito_ok')::boolean, false)
             THEN coalesce((v_result -> 'secretaria' ->> 'bonus_nivel')::numeric, 0) ELSE 0 END
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.fn_metas_pagamentos(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_metas_pagamentos(date) TO authenticated;
