-- AI dev note: 06/11/2026 ("Entrega 2", aprovada pelo dono): seção "Atendimento Ju × equipe" da aba Desempenho.
-- Base = pedidos que a Ju passou para a equipe (ju_solicitacoes, menos CLINICO/EXTERNO e testes), pelo horário do pedido.
-- Espera da equipe = minutos operacionais (fn_ju_minutos_operacionais: seg–sex 8h–18h, sem feriados) até a 1ª mensagem
-- da equipe na conversa (fora "@ju"); corrida = tempo real. Pendentes não somem: contam à parte e entram no "fora do
-- prazo" quando já passaram da meta. Resposta da Ju: 1ª resposta dela até 30 min depois da mensagem da família;
-- "sem espera programada" tira os turnos com alguém da equipe na conversa nos 90 min anteriores (ali a Ju espera 5 min
-- de propósito). Conversão = criança da conversa com consulta criada até 7 dias depois do pedido de AGENDAMENTO;
-- contato novo = família sem consulta antes do pedido. Só descreve: amostra pequena aparece como tal na tela.
CREATE OR REPLACE FUNCTION public.fn_conversas_atendimento(p_dias integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_ini timestamptz := now() - make_interval(days => p_dias);
  v_teste bigint[] := fn_conversas_ids_teste();
  v_meta int := 30;
  v_res jsonb;
BEGIN
  PERFORM fn_conversas_checar_acesso();

  CREATE TEMP TABLE IF NOT EXISTS _cv_at (id bigint, conversa_id bigint, tipo text, criado timestamptz, dow int, h int,
                                          hum timestamptz, espera numeric, corrida numeric, novo boolean, agendou boolean) ON COMMIT DROP;
  TRUNCATE _cv_at;
  INSERT INTO _cv_at
  SELECT s.id, s.conversa_id, s.tipo, s.created_at,
         extract(isodow FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int,
         extract(hour FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int,
         x.hum,
         fn_ju_minutos_operacionais(s.created_at, coalesce(x.hum, now())),
         round((extract(epoch FROM coalesce(x.hum, now()) - s.created_at) / 60)::numeric, 1),
         NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo AND a.created_at < s.created_at - interval '10 minutes'
                       AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id))),
         s.tipo = 'AGENDAMENTO' AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo
                       AND a.created_at BETWEEN s.created_at - interval '10 minutes' AND s.created_at + interval '7 days'
                       AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id)))
    FROM ju_solicitacoes s
    CROSS JOIN LATERAL (SELECT min(m.created_at) hum FROM ju_mensagens m
                         WHERE m.conversa_id = s.conversa_id AND m.origem = 'HUMANO' AND m.created_at > s.created_at
                           AND coalesce(m.conteudo, '') !~* '^\s*@ju') x
   WHERE s.created_at >= v_ini AND s.tipo NOT IN ('CLINICO', 'EXTERNO') AND s.conversa_id <> ALL (v_teste);

  WITH ju AS (
    SELECT m.created_at, j.created_at ju_em,
           EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = m.conversa_id AND h.origem = 'HUMANO'
                     AND h.created_at BETWEEN m.created_at - interval '90 minutes' AND m.created_at) equipe_perto
      FROM ju_mensagens m
      CROSS JOIN LATERAL (SELECT min(j.created_at) created_at FROM ju_mensagens j WHERE j.conversa_id = m.conversa_id
                            AND j.origem = 'JU' AND j.created_at > m.created_at AND j.created_at < m.created_at + interval '30 minutes') j
     WHERE m.origem = 'CLIENTE' AND m.created_at >= greatest(v_ini, now() - interval '30 days') AND m.tipo <> 'BOTAO'
       AND m.conversa_id <> ALL (v_teste) AND j.created_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens p WHERE p.conversa_id = m.conversa_id AND p.origem = 'CLIENTE'
                         AND p.created_at < m.created_at AND p.created_at > m.created_at - interval '2 minutes')
  ),
  faixas AS (
    SELECT CASE WHEN hum IS NULL THEN 6 WHEN espera <= 15 THEN 1 WHEN espera <= 60 THEN 2 WHEN espera <= 180 THEN 3 ELSE 4 END ordem, *
      FROM _cv_at WHERE tipo = 'AGENDAMENTO'
  )
  SELECT jsonb_build_object(
    'periodo_dias', p_dias,
    'meta_min', v_meta,
    'amostra_minima', 30,
    'ju', (SELECT jsonb_build_object(
             'respostas', count(*),
             'mediana_s', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ju_em - created_at))::numeric),
             'p90_s', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM ju_em - created_at))::numeric),
             'respostas_sem_espera', count(*) FILTER (WHERE NOT equipe_perto),
             'mediana_sem_espera_s', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ju_em - created_at))
                                     FILTER (WHERE NOT equipe_perto))::numeric),
             'p90_sem_espera_s', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM ju_em - created_at))
                                     FILTER (WHERE NOT equipe_perto))::numeric)) FROM ju),
    'equipe', (SELECT jsonb_build_object(
             'pedidos', count(*),
             'respondidos', count(hum),
             'mediana_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) FILTER (WHERE hum IS NOT NULL))::numeric),
             'p90_min', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY espera) FILTER (WHERE hum IS NOT NULL))::numeric),
             'mediana_corrida_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY corrida) FILTER (WHERE hum IS NOT NULL))::numeric),
             'fora_prazo', count(*) FILTER (WHERE espera > v_meta),
             'pendentes', count(*) FILTER (WHERE hum IS NULL),
             'pendentes_fora_prazo', count(*) FILTER (WHERE hum IS NULL AND espera > v_meta),
             'pendente_mais_antigo_min', round(max(espera) FILTER (WHERE hum IS NULL)),
             'novos_pendentes', count(*) FILTER (WHERE hum IS NULL AND novo AND tipo = 'AGENDAMENTO')) FROM _cv_at),
    'calor', coalesce((SELECT jsonb_agg(jsonb_build_object('dow', dow, 'faixa', f, 'pedidos', n, 'mediana_min', med) ORDER BY dow, f)
                FROM (SELECT dow, (h / 2) * 2 f, count(*) n,
                             round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera))::numeric) med
                        FROM _cv_at WHERE dow BETWEEN 1 AND 5 AND h BETWEEN 8 AND 17 GROUP BY 1, 2) c), '[]'::jsonb),
    'conversao', coalesce((SELECT jsonb_agg(jsonb_build_object('grupo', CASE WHEN novo THEN 'novo' ELSE 'paciente' END,
                                 'ordem', ordem,
                                 'faixa', CASE ordem WHEN 1 THEN 'até 15 min' WHEN 2 THEN '15–60 min' WHEN 3 THEN '1–3 h'
                                                     WHEN 4 THEN 'mais de 3 h' ELSE 'sem resposta' END,
                                 'pedidos', n, 'agendaram', ag) ORDER BY novo DESC, ordem)
                FROM (SELECT novo, ordem, count(*) n, count(*) FILTER (WHERE agendou) ag FROM faixas GROUP BY 1, 2) c), '[]'::jsonb),
    'tendencia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d, 'pedidos', n, 'mediana_min', med, 'pendentes', pend) ORDER BY d)
                FROM (SELECT (criado AT TIME ZONE 'America/Sao_Paulo')::date d, count(*) n,
                             round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) FILTER (WHERE hum IS NOT NULL))::numeric) med,
                             count(*) FILTER (WHERE hum IS NULL) pend
                        FROM _cv_at
                       WHERE dow BETWEEN 1 AND 5   -- só dias de expediente (fim de semana e feriado não têm relógio)
                         AND NOT EXISTS (SELECT 1 FROM followup_feriados f WHERE f.dia = (criado AT TIME ZONE 'America/Sao_Paulo')::date)
                       GROUP BY 1) t), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.fn_conversas_atendimento(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conversas_atendimento(integer) TO authenticated, service_role;
