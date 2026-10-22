-- =====================================================================
-- Atribuição v2 — base do painel admin (fase 3)
-- =====================================================================
-- AI dev note (aprovado pelo dono em 21/10/2026):
-- * Rateio da fatura em CENTAVOS INTEIROS (maiores restos): a soma das sessões
--   é sempre igual ao valor da fatura (antes sobravam 2 centavos em ago/2026).
-- * O rateio olha a fatura inteira, então a receita por sessão é pré-calculada
--   em interno.mv_atrib_receita_sessao (atualizada a cada 10 min pelo cron;
--   hora em atrib_config.receita_atualizada_em). O esquema "interno" não é
--   exposto pela API; as visões públicas filtram por fn_atrib_pode_ver().
-- * fn_atrib_pode_ver(): admin (is_admin) ou acesso de serviço. Toda visão
--   atrib_* filtra por ela — quem não é admin recebe zero linhas, inclusive
--   chamando a API direto. RPCs do painel dão erro 42501 para não-admin.
-- * Jornada (fn_atrib_jornada) e qualidade (fn_atrib_painel_qualidade) para as
--   telas 4 e 6. Sem conteúdo de mensagem, diagnóstico ou prontuário; nome da
--   criança abreviado e telefone mascarado.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS interno;
REVOKE ALL ON SCHEMA interno FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA interno TO authenticated, service_role;   -- não exposto pela API

ALTER TABLE public.atrib_config ADD COLUMN receita_atualizada_em timestamptz;

-- Visões (security_invoker): admin logado, ou o usuário efetivo é o próprio
-- banco/serviço (cron, SQL do Supabase, service_role, e funções do painel
-- que já checaram a permissão). Pela API, quem não é admin roda como
-- "authenticated" e recebe zero linhas.
CREATE FUNCTION public.fn_atrib_pode_ver()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(public.is_admin(), false)
      OR current_user IN ('postgres', 'supabase_admin', 'service_role')
$$;
REVOKE ALL ON FUNCTION public.fn_atrib_pode_ver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_pode_ver() TO authenticated, service_role;

-- Funções do painel (SECURITY DEFINER rodam como postgres, então não dá para
-- olhar current_user): admin, service_role pela API, ou SQL direto sem
-- identidade de usuário (cron/SQL editor). Pela API sempre há claims.
CREATE FUNCTION public.fn_atrib_rpc_ok()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(public.is_admin(), false)
      OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
      OR (session_user IN ('postgres', 'supabase_admin')
          AND coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '')
$$;
REVOKE ALL ON FUNCTION public.fn_atrib_rpc_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_rpc_ok() TO authenticated, service_role;


-- ── Receita por sessão, rateio em centavos inteiros ──────────────────
CREATE MATERIALIZED VIEW interno.mv_atrib_receita_sessao AS
WITH base AS (
  SELECT a.id AS agendamento_id, a.paciente_id, a.data_hora, a.created_at,
         cs.codigo AS status_consulta, ps.codigo AS status_pagamento,
         a.valor_servico AS valor_previsto, a.fatura_id, f.status AS fatura_status, f.pago_em,
         round(coalesce(f.valor_servico, f.valor_total, 0) * 100) AS total_c,
         CASE WHEN ps.codigo = 'estornado' THEN 'estornada'
              WHEN (f.status = 'pago' OR (f.id IS NULL AND ps.codigo = 'pago')) AND cs.codigo IN ('cancelado','erro') THEN 'a_conciliar'
              WHEN f.status = 'pago' THEN 'recebida'
              WHEN f.id IS NULL AND ps.codigo = 'pago' THEN 'recebida_manual'
              WHEN cs.codigo IN ('cancelado','erro','reagendado') THEN 'sem_receita'
              ELSE 'pendente' END AS situacao
    FROM public.agendamentos a
    JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
    LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
    LEFT JOIN public.faturas f ON f.id = a.fatura_id AND f.ativo
   WHERE a.ativo),
quota AS (
  SELECT b.*,
         CASE WHEN b.fatura_id IS NULL THEN NULL
              WHEN sum(coalesce(b.valor_previsto, 0)) OVER w > 0
                THEN b.total_c * coalesce(b.valor_previsto, 0) / sum(coalesce(b.valor_previsto, 0)) OVER w
              ELSE b.total_c / count(*) OVER w END AS exato
    FROM base b WINDOW w AS (PARTITION BY b.fatura_id)),
rateio AS (
  SELECT q.*, floor(q.exato) AS piso,
         q.total_c - sum(floor(q.exato)) OVER (PARTITION BY q.fatura_id) AS resto,
         row_number() OVER (PARTITION BY q.fatura_id ORDER BY q.exato - floor(q.exato) DESC, q.agendamento_id) AS ordem
    FROM quota q)
SELECT r.agendamento_id, r.paciente_id, r.data_hora, r.created_at, r.status_consulta, r.status_pagamento,
       r.valor_previsto, r.fatura_id, r.fatura_status, r.situacao,
       CASE r.situacao
         WHEN 'recebida' THEN round((r.piso + CASE WHEN r.ordem <= r.resto THEN 1 ELSE 0 END) / 100.0, 2)
         WHEN 'recebida_manual' THEN coalesce(r.valor_previsto, 0)
         ELSE 0 END AS receita_recebida,
       CASE WHEN r.situacao = 'recebida' THEN r.pago_em END AS recebida_em
  FROM rateio r
WITH DATA;
CREATE UNIQUE INDEX mv_atrib_receita_sessao_pk ON interno.mv_atrib_receita_sessao (agendamento_id);
CREATE INDEX mv_atrib_receita_sessao_pac ON interno.mv_atrib_receita_sessao (paciente_id, data_hora);
CREATE INDEX mv_atrib_receita_sessao_fat ON interno.mv_atrib_receita_sessao (fatura_id);
REVOKE ALL ON interno.mv_atrib_receita_sessao FROM PUBLIC, anon;
GRANT SELECT ON interno.mv_atrib_receita_sessao TO authenticated, service_role;

CREATE FUNCTION public.fn_atrib_atualizar_receita()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY interno.mv_atrib_receita_sessao;
  UPDATE public.atrib_config SET receita_atualizada_em = now() WHERE id = 1;
  RETURN now();
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_atualizar_receita() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atrib_atualizar_receita() TO service_role;
UPDATE public.atrib_config SET receita_atualizada_em = now() WHERE id = 1;

CREATE OR REPLACE VIEW public.vw_atrib_receita_sessao WITH (security_invoker = true) AS
SELECT m.agendamento_id, m.paciente_id, m.data_hora, m.created_at, m.status_consulta, m.status_pagamento,
       m.valor_previsto, m.fatura_id, m.fatura_status, m.situacao, m.receita_recebida, m.recebida_em
  FROM interno.mv_atrib_receita_sessao m
 WHERE public.fn_atrib_pode_ver();


-- ── Aquisições: + serviço do 1º atendimento + LTV da família ─────────
CREATE OR REPLACE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS
WITH prim AS (
  SELECT DISTINCT ON (a.paciente_id) a.paciente_id, a.id AS agendamento_id, a.data_hora AS aquisicao_em, a.tipo_servico_id
    FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
   WHERE a.ativo AND cs.codigo = 'finalizado' AND public.fn_atrib_pode_ver()
   ORDER BY a.paciente_id, a.data_hora, a.id),
cand AS (
  SELECT p.paciente_id, oa.oportunidade_id,
         max(CASE oa.tipo_vinculo WHEN 'humano' THEN 3 WHEN 'pedido_ju' THEN 2 ELSE 1 END) AS forca,
         min(a.created_at) AS ag_criado_em
    FROM prim p
    JOIN public.agendamentos a ON a.paciente_id = p.paciente_id AND a.ativo AND a.created_at <= p.aquisicao_em
    JOIN public.atrib_oportunidade_agendamentos oa ON oa.agendamento_id = a.id AND oa.removido_em IS NULL
   GROUP BY p.paciente_id, oa.oportunidade_id),
cred AS (
  SELECT DISTINCT ON (c.paciente_id) c.paciente_id, c.oportunidade_id, c.ag_criado_em,
         CASE c.forca WHEN 3 THEN 'humano' WHEN 2 THEN 'pedido_ju' ELSE 'provavel' END AS tipo_vinculo,
         CASE WHEN c.forca >= 2 THEN 'alta' ELSE 'media' END AS confianca
    FROM cand c JOIN public.atrib_oportunidades o ON o.id = c.oportunidade_id
   ORDER BY c.paciente_id, c.forca DESC,
            EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.oportunidade_id = o.id) DESC,
            o.aberta_em DESC, o.id DESC)
SELECT p.paciente_id, p.agendamento_id AS primeiro_atendimento_id, p.aquisicao_em,
       date_trunc('month', p.aquisicao_em AT TIME ZONE 'UTC')::date AS mes,
       (p.aquisicao_em AT TIME ZONE 'UTC')::date >= (SELECT k.inicio FROM public.atrib_config k WHERE k.id = 1) AS periodo_rastreado,
       c.oportunidade_id, coalesce(c.tipo_vinculo, 'sem_vinculo') AS tipo_vinculo, c.confianca,
       coalesce(t.canal, 'nao_atribuido') AS canal, t.plataforma, t.campanha_id, t.campanha_nome,
       CASE WHEN c.oportunidade_id IS NULL THEN 'sem_vinculo'
            WHEN t.id IS NULL THEN 'nao_atribuida'
            WHEN t.origem_tipo = 'declarada' THEN 'declarada'
            WHEN t.clique_status = 'encontrado' THEN 'site_completa'
            WHEN t.clique_status = 'pendente' THEN 'pendente'
            ELSE 'site_recuperada' END AS tipo_origem,
       o.contato_novo,
       NOT EXISTS (SELECT 1 FROM public.pessoa_responsaveis r1
                     JOIN public.pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel AND r2.id_pessoa <> r1.id_pessoa
                     JOIN public.agendamentos a2 ON a2.paciente_id = r2.id_pessoa AND a2.ativo AND a2.data_hora < p.aquisicao_em
                     JOIN public.consulta_status c2 ON c2.id = a2.status_consulta_id AND c2.codigo = 'finalizado'
                    WHERE r1.id_pessoa = p.paciente_id) AS familia_nova,
       coalesce(r.receita_primeira_sessao, 0) AS receita_primeira_sessao,
       coalesce(r.receita_30d, 0) AS receita_30d, coalesce(r.receita_90d, 0) AS receita_90d,
       coalesce(r.receita_180d, 0) AS receita_180d, coalesce(r.receita_total, 0) AS ltv_realizado,
       coalesce(r.sessoes_30d, 0) AS sessoes_30d, coalesce(r.sessoes_90d, 0) AS sessoes_90d,
       coalesce(r.sessoes_180d, 0) AS sessoes_180d, coalesce(r.sessoes_total, 0) AS sessoes_total,
       coalesce(r.sessoes_30d, 0) > 1 AS retornou_30d, coalesce(r.sessoes_90d, 0) > 1 AS retornou_90d,
       coalesce(r.sessoes_180d, 0) > 1 AS retornou_180d,
       ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (p.aquisicao_em AT TIME ZONE 'UTC')::date) AS dias_desde_aquisicao,
       date_trunc('month', coalesce(t.clicado_em, t.mensagem_em, o.aberta_em) AT TIME ZONE 'America/Sao_Paulo')::date AS mes_origem,
       -- novos (fase 3)
       (SELECT regexp_replace(btrim(ts.nome), '\s*-\s*(DU|FDS)$', '') FROM public.tipo_servicos ts WHERE ts.id = p.tipo_servico_id) AS servico,
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.pessoa_responsaveis r1
                              JOIN public.pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel AND r2.id_pessoa <> r1.id_pessoa
                              JOIN public.agendamentos a2 ON a2.paciente_id = r2.id_pessoa AND a2.ativo AND a2.data_hora < p.aquisicao_em
                              JOIN public.consulta_status c2 ON c2.id = a2.status_consulta_id AND c2.codigo = 'finalizado'
                             WHERE r1.id_pessoa = p.paciente_id)
            THEN (SELECT coalesce(sum(m.receita_recebida), 0) FROM interno.mv_atrib_receita_sessao m
                   WHERE m.data_hora >= p.aquisicao_em
                     AND m.paciente_id IN (SELECT p.paciente_id
                                           UNION SELECT r2.id_pessoa FROM public.pessoa_responsaveis r1
                                             JOIN public.pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel
                                            WHERE r1.id_pessoa = p.paciente_id AND r2.ativo))
       END AS ltv_familia_realizado
  FROM prim p
  LEFT JOIN cred c ON c.paciente_id = p.paciente_id
  LEFT JOIN public.atrib_oportunidades o ON o.id = c.oportunidade_id
  LEFT JOIN LATERAL (SELECT tt.* FROM public.atrib_toques tt WHERE tt.oportunidade_id = c.oportunidade_id
                      ORDER BY (coalesce(tt.mensagem_em, tt.registrado_em) <= c.ag_criado_em) DESC,
                               coalesce(tt.mensagem_em, tt.registrado_em) DESC, tt.id DESC
                      LIMIT 1) t ON true
  LEFT JOIN LATERAL (
    SELECT sum(rs.receita_recebida) FILTER (WHERE rs.agendamento_id = p.agendamento_id) AS receita_primeira_sessao,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '30 days')  AS receita_30d,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '90 days')  AS receita_90d,
           sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < p.aquisicao_em + interval '180 days') AS receita_180d,
           sum(rs.receita_recebida) AS receita_total,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '30 days')  AS sessoes_30d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '90 days')  AS sessoes_90d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado' AND rs.data_hora < p.aquisicao_em + interval '180 days') AS sessoes_180d,
           count(*) FILTER (WHERE rs.status_consulta = 'finalizado') AS sessoes_total
      FROM interno.mv_atrib_receita_sessao rs
     WHERE rs.paciente_id = p.paciente_id AND rs.data_hora >= p.aquisicao_em) r ON true;


-- ── As demais visões: zero linhas para quem não é admin ──────────────
CREATE OR REPLACE VIEW public.vw_atrib_oportunidade_pacientes WITH (security_invoker = true) AS
SELECT oa.oportunidade_id, a.paciente_id,
       CASE WHEN aq.oportunidade_id = oa.oportunidade_id THEN 'novo'
            WHEN aq.aquisicao_em IS NULL THEN 'sem_atendimento'
            WHEN aq.aquisicao_em < o.aberta_em THEN 'recorrente'
            ELSE 'novo_outra_oportunidade' END AS tipo_paciente,
       count(*) AS agendamentos,
       count(*) FILTER (WHERE rs.status_consulta = 'finalizado') AS atendimentos,
       coalesce(sum(rs.receita_recebida), 0) AS receita_vinculada
  FROM public.atrib_oportunidade_agendamentos oa
  JOIN public.atrib_oportunidades o ON o.id = oa.oportunidade_id
  JOIN public.agendamentos a ON a.id = oa.agendamento_id AND a.ativo
  LEFT JOIN interno.mv_atrib_receita_sessao rs ON rs.agendamento_id = a.id
  LEFT JOIN public.vw_atrib_aquisicoes aq ON aq.paciente_id = a.paciente_id
 WHERE oa.removido_em IS NULL AND public.fn_atrib_pode_ver()
 GROUP BY oa.oportunidade_id, a.paciente_id, aq.oportunidade_id, aq.aquisicao_em, o.aberta_em;

-- Lista de oportunidades para o painel (telas 2 e 4): crianças abreviadas.
CREATE VIEW public.vw_atrib_oportunidades_painel WITH (security_invoker = true) AS
SELECT o.id, o.aberta_em, o.motivo_abertura, o.contato_novo, o.etapa_atual, o.etapa_maxima, o.etapa_maxima_ord,
       o.estado, o.estado_em, o.motivo_perda, o.motivo_fonte, o.motivo_evidencia,
       o.canal, o.plataforma, o.campanha_id, o.campanha_nome, o.tipo_origem, o.n_toques,
       (SELECT t.servico_pagina FROM public.atrib_toques t WHERE t.id = o.toque_id) AS servico_pagina,
       (SELECT string_agg(DISTINCT split_part(btrim(pp.nome), ' ', 1)
                          || coalesce(' ' || left(nullif(split_part(btrim(pp.nome), ' ', 2), ''), 1) || '.', ''), ', ')
          FROM public.atrib_oportunidade_agendamentos oa
          JOIN public.agendamentos a ON a.id = oa.agendamento_id
          JOIN public.pessoas pp ON pp.id = a.paciente_id
         WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS criancas,
       (SELECT count(*) FROM public.atrib_oportunidade_agendamentos oa
         WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS agendamentos,
       (SELECT coalesce(sum(m.receita_recebida), 0) FROM public.atrib_oportunidade_agendamentos oa
          JOIN interno.mv_atrib_receita_sessao m ON m.agendamento_id = oa.agendamento_id
         WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS receita_vinculada
  FROM public.vw_atrib_oportunidades o
 WHERE o.anonimizada_em IS NULL AND public.fn_atrib_pode_ver();


-- ── Tela 4: jornada de uma oportunidade ──────────────────────────────
CREATE FUNCTION public.fn_atrib_jornada(p_oportunidade bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.atrib_oportunidades; v_tel text;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.atrib_oportunidades WHERE id = p_oportunidade;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT c.telefone INTO v_tel FROM public.ju_conversas c WHERE c.id = o.conversa_id;
  RETURN jsonb_build_object(
    'oportunidade', jsonb_build_object(
      'id', o.id, 'aberta_em', o.aberta_em, 'motivo_abertura', o.motivo_abertura, 'contato_novo', o.contato_novo,
      'etapa_atual', o.etapa_atual, 'etapa_maxima', o.etapa_maxima, 'estado', o.estado, 'estado_em', o.estado_em,
      'motivo_perda', o.motivo_perda, 'motivo_fonte', o.motivo_fonte, 'motivo_evidencia', o.motivo_evidencia,
      'contato', CASE WHEN v_tel IS NOT NULL THEN '•••• ' || right(v_tel, 4) END,
      'revisao_humana', o.revisao_humana),
    'toques', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'ref', t.ref, 'origem_tipo', t.origem_tipo, 'canal', t.canal, 'plataforma', t.plataforma,
        'campanha_id', t.campanha_id, 'campanha_nome', t.campanha_nome, 'grupo_id', t.grupo_id,
        'palavra_chave_segmentacao', t.palavra_chave, 'pagina', t.page_path, 'servico_pagina', t.servico_pagina,
        'clicado_em', t.clicado_em, 'mensagem_em', t.mensagem_em, 'clique_status', t.clique_status) ORDER BY t.mensagem_em)
      FROM public.atrib_toques t WHERE t.oportunidade_id = o.id), '[]'::jsonb),
    'eventos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'tipo', e.tipo, 'de', e.valor_anterior, 'para', e.valor_novo, 'fonte', e.fonte,
        'evidencia', e.evidencia, 'ocorrido_em', e.ocorrido_em) ORDER BY e.ocorrido_em, e.id)
      FROM public.atrib_eventos e WHERE e.oportunidade_id = o.id), '[]'::jsonb),
    'agendamentos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'agendamento_id', a.id, 'paciente_id', a.paciente_id,
        'crianca', split_part(btrim(pp.nome), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(pp.nome), ' ', 2), ''), 1) || '.', ''),
        'tipo_paciente', op.tipo_paciente,
        'servico', regexp_replace(btrim(ts.nome), '\s*-\s*(DU|FDS)$', ''),
        'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
        'criado_em', a.created_at, 'status_consulta', m.status_consulta, 'situacao_receita', m.situacao,
        'receita', m.receita_recebida, 'recebida_em', m.recebida_em,
        'tipo_vinculo', oa.tipo_vinculo, 'confianca', oa.confianca) ORDER BY a.data_hora)
      FROM public.atrib_oportunidade_agendamentos oa
      JOIN public.agendamentos a ON a.id = oa.agendamento_id
      JOIN public.pessoas pp ON pp.id = a.paciente_id
      LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
      LEFT JOIN interno.mv_atrib_receita_sessao m ON m.agendamento_id = a.id
      LEFT JOIN public.vw_atrib_oportunidade_pacientes op ON op.oportunidade_id = o.id AND op.paciente_id = a.paciente_id
      WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_jornada(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_jornada(bigint) TO authenticated, service_role;


-- ── Tela 6: qualidade dos dados ──────────────────────────────────────
CREATE FUNCTION public.fn_atrib_painel_qualidade()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.atrib_config; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM public.atrib_config WHERE id = 1;
  RETURN jsonb_build_object(
    'gerado_em', now(),
    'receita_atualizada_em', k.receita_atualizada_em,
    'oportunidades_processadas_em', (SELECT max(o.processada_em) FROM public.atrib_oportunidades o),
    'jobs', (SELECT jsonb_agg(jsonb_build_object('job', x.jobname, 'status', x.status, 'em', x.start_time,
                                                 'mensagem', left(x.return_message, 200)) ORDER BY x.jobname)
               FROM (SELECT DISTINCT ON (j.jobname) j.jobname, d.status, d.start_time, d.return_message
                       FROM cron.job j LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
                      WHERE j.jobname LIKE 'atrib%' ORDER BY j.jobname, d.start_time DESC NULLS LAST) x),
    'custos', (SELECT to_jsonb(s) FROM public.vw_atrib_custos_status s WHERE s.plataforma = 'google_ads'),
    'origem_90d', (SELECT jsonb_build_object(
        'oportunidades', count(*),
        'site_completa', count(*) FILTER (WHERE o.tipo_origem = 'site_completa'),
        'site_recuperada', count(*) FILTER (WHERE o.tipo_origem = 'site_recuperada'),
        'pendente', count(*) FILTER (WHERE o.tipo_origem = 'pendente'),
        'declarada', count(*) FILTER (WHERE o.tipo_origem = 'declarada'),
        'nao_atribuida', count(*) FILTER (WHERE o.tipo_origem = 'nao_atribuida'))
      FROM public.vw_atrib_oportunidades o WHERE o.aberta_em >= now() - interval '90 days'),
    'agendamentos_90d', (SELECT jsonb_build_object(
        'novos_pacientes', count(*),
        'com_oportunidade', count(*) FILTER (WHERE a.tipo_vinculo <> 'sem_vinculo'),
        'vinculo_alto', count(*) FILTER (WHERE a.confianca = 'alta'))
      FROM public.vw_atrib_aquisicoes a
     WHERE a.periodo_rastreado AND a.aquisicao_em >= (now() AT TIME ZONE 'America/Sao_Paulo') - interval '90 days'),
    'faturas', (SELECT jsonb_agg(jsonb_build_object('mes', z.mes, 'faturas', z.n, 'valor_faturas', z.valor,
                                                    'receita_rateada', z.rateada, 'diferenca', z.valor - z.rateada) ORDER BY z.mes)
                  FROM (SELECT date_trunc('month', f.pago_em)::date AS mes, count(*) AS n,
                               sum(coalesce(f.valor_servico, f.valor_total, 0)) AS valor,
                               sum((SELECT coalesce(sum(m.receita_recebida), 0) FROM interno.mv_atrib_receita_sessao m
                                     WHERE m.fatura_id = f.id AND m.situacao = 'recebida')) AS rateada
                          FROM public.faturas f
                         WHERE f.ativo AND f.status = 'pago'
                           AND f.pago_em >= date_trunc('month', now()) - interval '3 months'
                         GROUP BY 1) z),
    'pendencias', jsonb_build_object(
        'toques_sem_clique', (SELECT count(*) FROM public.atrib_toques t WHERE t.clique_status = 'pendente'),
        'erros_7d', (SELECT count(*) FROM public.atrib_erros e WHERE e.criado_em > now() - interval '7 days'),
        'sessoes_a_conciliar_90d', (SELECT count(*) FROM interno.mv_atrib_receita_sessao m
                                     WHERE m.situacao = 'a_conciliar' AND m.data_hora >= now() - interval '90 days')),
    'coortes', (SELECT jsonb_build_object(
        'menos_30d', count(*) FILTER (WHERE a.dias_desde_aquisicao < 30),
        'de_30_a_89d', count(*) FILTER (WHERE a.dias_desde_aquisicao BETWEEN 30 AND 89),
        'de_90_a_179d', count(*) FILTER (WHERE a.dias_desde_aquisicao BETWEEN 90 AND 179),
        'mais_180d', count(*) FILTER (WHERE a.dias_desde_aquisicao >= 180))
      FROM public.vw_atrib_aquisicoes a WHERE a.periodo_rastreado),
    'inicio_rastreamento', k.inicio,
    'hoje', v_hoje);
END $$;
REVOKE ALL ON FUNCTION public.fn_atrib_painel_qualidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_painel_qualidade() TO authenticated, service_role;

REVOKE ALL ON public.vw_atrib_oportunidades_painel FROM anon;

-- receita recalculada a cada 10 min (rateio olha a fatura inteira)
SELECT cron.schedule('atrib_receita', '3-59/10 * * * *', $c$SELECT public.fn_atrib_atualizar_receita()$c$);
