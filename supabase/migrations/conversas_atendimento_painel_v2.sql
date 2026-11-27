-- AI dev note: 06/11/2026, revisão do PR #44 pedida pelo dono (incremental: a v1 já estava no banco).
-- 1) Expediente deixa de ser fixo no código: tabela ju_expediente_cobertura (um horário por dia da semana).
--    Começa igual ao que estava (seg–sex 8h–18h). O sábado fica cadastrado e desligado até o dono confirmar
--    a cobertura real da secretária. fn_ju_minutos_operacionais (painel, alerta ⏳ e resumo) passa a ler a tabela.
-- 2) fn_conversas_atendimento (enviada = disparada de verdade: sem sombra, SUPRIMIDA ou CANCELADA):
--    - resposta da Ju usa o mesmo período escolhido na tela (antes: no máximo 30 dias);
--    - a 1ª resposta da equipe conta só até o pedido seguinte da mesma conversa. Pedido fechado sem
--      mensagem da equipe (resolvido pelo sistema/Ju ou trocado por outro) vira "encerrado sem resposta"
--      e sai das medianas e dos pendentes;
--    - medianas = só respondidos; pendentes abertos à parte, com espera acumulada até agora;
--    - mapa de calor: mediana dos respondidos + pendentes por célula;
--    - conversão: só pedidos com a janela de 7 dias completa; os recentes vêm como "provisórios";
--    - novo bloco 'followup': funil de elegibilidade do follow-up automático (analisadas → candidatas →
--      enviadas → responderam → agendaram) e onde as outras pararam.

CREATE TABLE IF NOT EXISTS public.ju_expediente_cobertura (
  dow        int PRIMARY KEY CHECK (dow BETWEEN 1 AND 7),   -- isodow: 1 = segunda … 7 = domingo
  inicio     time NOT NULL,
  fim        time NOT NULL CHECK (fim > inicio),
  ativo      boolean NOT NULL DEFAULT true,
  observacao text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_expediente_cobertura ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_expediente_cobertura FROM anon, authenticated;

INSERT INTO public.ju_expediente_cobertura (dow, inicio, fim, ativo, observacao) VALUES
  (1, '08:00', '18:00', true,  'expediente da recepção (21/10/2026)'),
  (2, '08:00', '18:00', true,  'expediente da recepção (21/10/2026)'),
  (3, '08:00', '18:00', true,  'expediente da recepção (21/10/2026)'),
  (4, '08:00', '18:00', true,  'expediente da recepção (21/10/2026)'),
  (5, '08:00', '18:00', true,  'expediente da recepção (21/10/2026)'),
  (6, '08:00', '14:00', false, 'a equipe responde sábado de manhã; ligar quando o dono confirmar a cobertura')
ON CONFLICT (dow) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_ju_minutos_operacionais(p_de timestamptz, p_ate timestamptz)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(round(sum(extract(epoch FROM
           least(p_ate AT TIME ZONE 'America/Sao_Paulo', g.d::date + e.fim)
         - greatest(p_de AT TIME ZONE 'America/Sao_Paulo', g.d::date + e.inicio)) / 60)::numeric, 1), 0)
    FROM generate_series((p_de AT TIME ZONE 'America/Sao_Paulo')::date, (p_ate AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') g(d)
    JOIN public.ju_expediente_cobertura e ON e.dow = extract(isodow FROM g.d)::int AND e.ativo
   WHERE p_ate > p_de
     AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = g.d::date)
     AND least(p_ate AT TIME ZONE 'America/Sao_Paulo', g.d::date + e.fim) > greatest(p_de AT TIME ZONE 'America/Sao_Paulo', g.d::date + e.inicio);
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_atendimento(p_dias integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_ini timestamptz := now() - make_interval(days => p_dias);
  v_teste bigint[] := fn_conversas_ids_teste();
  v_meta int := 30;
  v_res jsonb;
BEGIN
  PERFORM fn_conversas_checar_acesso();

  DROP TABLE IF EXISTS _cv_at;
  CREATE TEMP TABLE _cv_at ON COMMIT DROP AS
  SELECT s.id, s.conversa_id, s.tipo, s.created_at criado,
         extract(isodow FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int dow,
         extract(hour FROM s.created_at AT TIME ZONE 'America/Sao_Paulo')::int h,
         x.hum,
         CASE WHEN x.hum IS NOT NULL THEN 'respondido' WHEN s.status = 'ABERTA' THEN 'pendente' ELSE 'encerrado' END situacao,
         CASE WHEN x.hum IS NOT NULL THEN fn_ju_minutos_operacionais(s.created_at, x.hum)
              WHEN s.status = 'ABERTA' THEN fn_ju_minutos_operacionais(s.created_at, now()) END espera,
         CASE WHEN x.hum IS NOT NULL THEN round((extract(epoch FROM x.hum - s.created_at) / 60)::numeric, 1) END corrida,
         NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo AND a.created_at < s.created_at - interval '10 minutes'
                       AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id))) novo,
         s.tipo = 'AGENDAMENTO' AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo
                       AND a.created_at BETWEEN s.created_at - interval '10 minutes' AND s.created_at + interval '7 days'
                       AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(s.conversa_id))) agendou,
         s.created_at <= now() - interval '7 days' janela_completa
    FROM ju_solicitacoes s
    CROSS JOIN LATERAL (SELECT min(s2.created_at) prox FROM ju_solicitacoes s2
                         WHERE s2.conversa_id = s.conversa_id AND s2.created_at > s.created_at) p
    CROSS JOIN LATERAL (SELECT min(m.created_at) hum FROM ju_mensagens m
                         WHERE m.conversa_id = s.conversa_id AND m.origem = 'HUMANO' AND m.created_at > s.created_at
                           AND (p.prox IS NULL OR m.created_at < p.prox)
                           AND coalesce(m.conteudo, '') !~* '^\s*@ju') x
   WHERE s.created_at >= v_ini AND s.tipo NOT IN ('CLINICO', 'EXTERNO') AND s.conversa_id <> ALL (v_teste);

  WITH ju AS (
    SELECT m.created_at, j.created_at ju_em,
           EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = m.conversa_id AND h.origem = 'HUMANO'
                     AND h.created_at BETWEEN m.created_at - interval '90 minutes' AND m.created_at) equipe_perto
      FROM ju_mensagens m
      CROSS JOIN LATERAL (SELECT min(j.created_at) created_at FROM ju_mensagens j WHERE j.conversa_id = m.conversa_id
                            AND j.origem = 'JU' AND j.created_at > m.created_at AND j.created_at < m.created_at + interval '30 minutes') j
     WHERE m.origem = 'CLIENTE' AND m.created_at >= v_ini AND m.tipo <> 'BOTAO'
       AND m.conversa_id <> ALL (v_teste) AND j.created_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens p WHERE p.conversa_id = m.conversa_id AND p.origem = 'CLIENTE'
                         AND p.created_at < m.created_at AND p.created_at > m.created_at - interval '2 minutes')
  ),
  faixas AS (
    SELECT CASE WHEN situacao <> 'respondido' THEN 6 WHEN espera <= 15 THEN 1 WHEN espera <= 60 THEN 2
                WHEN espera <= 180 THEN 3 ELSE 4 END ordem, *
      FROM _cv_at WHERE tipo = 'AGENDAMENTO'
  ),
  fa AS (   -- follow-up: uma linha por conversa avaliada no período
    SELECT a.conversa_id,
           bool_or(a.situacao = 'candidato') candidata,
           (array_agg(a.situacao ORDER BY a.avaliado_em DESC))[1] sit_final,
           (array_agg(coalesce(a.motivo, a.decisao_motivo) ORDER BY a.avaliado_em DESC))[1] mot_final
      FROM followup_avaliacoes a
     WHERE a.avaliado_em >= v_ini AND a.conversa_id <> ALL (v_teste)
     GROUP BY 1
  ),
  ft AS (
    SELECT t.conversa_id, bool_or(t.resposta_em IS NOT NULL) respondeu,
           bool_or(t.agendamento_em IS NOT NULL OR t.estado = 'CONVERTIDA') agendou
      FROM followup_tentativas t
     WHERE NOT coalesce(t.sombra, false) AND t.disparada_em >= v_ini AND t.estado NOT IN ('SUPRIMIDA', 'CANCELADA')
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'periodo_dias', p_dias,
    'meta_min', v_meta,
    'amostra_minima', 30,
    'dados_desde', (SELECT min(created_at) FROM ju_solicitacoes),
    'expediente', (SELECT coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'inicio', to_char(inicio, 'HH24:MI'),
                                    'fim', to_char(fim, 'HH24:MI')) ORDER BY dow), '[]'::jsonb)
                     FROM ju_expediente_cobertura WHERE ativo),
    'ju', (SELECT jsonb_build_object(
             'desde', (SELECT min(created_at) FROM ju_mensagens),
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
             'respondidos', count(*) FILTER (WHERE situacao = 'respondido'),
             'mediana_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) FILTER (WHERE situacao = 'respondido'))::numeric),
             'p90_min', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY espera) FILTER (WHERE situacao = 'respondido'))::numeric),
             'mediana_corrida_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY corrida) FILTER (WHERE situacao = 'respondido'))::numeric),
             'respondidos_fora_prazo', count(*) FILTER (WHERE situacao = 'respondido' AND espera > v_meta),
             'pendentes', count(*) FILTER (WHERE situacao = 'pendente'),
             'pendentes_fora_prazo', count(*) FILTER (WHERE situacao = 'pendente' AND espera > v_meta),
             'pendente_mais_antigo_min', round(max(espera) FILTER (WHERE situacao = 'pendente')),
             'novos_pendentes', count(*) FILTER (WHERE situacao = 'pendente' AND novo AND tipo = 'AGENDAMENTO'),
             'encerrados_sem_resposta', count(*) FILTER (WHERE situacao = 'encerrado')) FROM _cv_at),
    'calor', coalesce((SELECT jsonb_agg(jsonb_build_object('dow', dow, 'faixa', f, 'pedidos', n, 'respondidos', r,
                                         'pendentes', pend, 'mediana_min', med) ORDER BY dow, f)
                FROM (SELECT dow, (h / 2) * 2 f, count(*) n,
                             count(*) FILTER (WHERE situacao = 'respondido') r,
                             count(*) FILTER (WHERE situacao = 'pendente') pend,
                             round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) FILTER (WHERE situacao = 'respondido'))::numeric) med
                        FROM _cv_at WHERE situacao <> 'encerrado' AND dow BETWEEN 1 AND 6 AND h BETWEEN 8 AND 17
                       GROUP BY 1, 2) c), '[]'::jsonb),
    'conversao', coalesce((SELECT jsonb_agg(jsonb_build_object('grupo', CASE WHEN novo THEN 'novo' ELSE 'paciente' END,
                                 'ordem', ordem,
                                 'faixa', CASE ordem WHEN 1 THEN 'até 15 min' WHEN 2 THEN '15–60 min' WHEN 3 THEN '1–3 h'
                                                     WHEN 4 THEN 'mais de 3 h' ELSE 'sem resposta' END,
                                 'pedidos', n, 'agendaram', ag) ORDER BY novo DESC, ordem)
                FROM (SELECT novo, ordem, count(*) n, count(*) FILTER (WHERE agendou) ag
                        FROM faixas WHERE janela_completa GROUP BY 1, 2) c), '[]'::jsonb),
    'conversao_provisoria', (SELECT jsonb_build_object(
                'novo_pedidos', count(*) FILTER (WHERE novo), 'novo_agendaram', count(*) FILTER (WHERE novo AND agendou),
                'paciente_pedidos', count(*) FILTER (WHERE NOT novo), 'paciente_agendaram', count(*) FILTER (WHERE NOT novo AND agendou))
                FROM faixas WHERE NOT janela_completa),
    'tendencia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d, 'pedidos', n, 'mediana_min', med, 'pendentes', pend) ORDER BY d)
                FROM (SELECT (criado AT TIME ZONE 'America/Sao_Paulo')::date d, count(*) n,
                             round((percentile_cont(0.5) WITHIN GROUP (ORDER BY espera) FILTER (WHERE situacao = 'respondido'))::numeric) med,
                             count(*) FILTER (WHERE situacao = 'pendente') pend
                        FROM _cv_at
                       WHERE situacao <> 'encerrado'
                         AND EXISTS (SELECT 1 FROM ju_expediente_cobertura e WHERE e.ativo AND e.dow = _cv_at.dow)
                         AND NOT EXISTS (SELECT 1 FROM followup_feriados f WHERE f.dia = (criado AT TIME ZONE 'America/Sao_Paulo')::date)
                       GROUP BY 1) t), '[]'::jsonb),
    'followup', (SELECT jsonb_build_object(
                'desde', (SELECT min(t.disparada_em) FROM followup_tentativas t WHERE NOT coalesce(t.sombra, false) AND t.disparada_em IS NOT NULL),
                'analisadas', count(*),
                'candidatas', count(*) FILTER (WHERE fa.candidata),
                'enviadas', (SELECT count(*) FROM ft),
                'responderam', (SELECT count(*) FILTER (WHERE respondeu) FROM ft),
                'agendaram', (SELECT count(*) FILTER (WHERE agendou) FROM ft),
                'paradas', (SELECT coalesce(jsonb_agg(jsonb_build_object('situacao', sit, 'motivo', mot, 'conversas', n) ORDER BY n DESC), '[]'::jsonb)
                              FROM (SELECT fa2.sit_final sit, fa2.mot_final mot, count(*) n
                                      FROM fa fa2 LEFT JOIN ft ft2 ON ft2.conversa_id = fa2.conversa_id
                                     WHERE ft2.conversa_id IS NULL GROUP BY 1, 2) q))
                FROM fa LEFT JOIN ft ON ft.conversa_id = fa.conversa_id)
  ) INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.fn_conversas_atendimento(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conversas_atendimento(integer) TO authenticated, service_role;
