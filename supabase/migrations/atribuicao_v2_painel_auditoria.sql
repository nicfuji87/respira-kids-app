-- =====================================================================
-- Atribuição v2 — painel: ajustes da auditoria de 21/10/2026
-- =====================================================================
-- AI dev note:
-- 1) Intenção da conversa. Toda conversa nova da Ju vira oportunidade, mas
--    nem toda é comercial (família em tratamento remarcando, fornecedor,
--    "oi" sem demanda). A análise da noite (whatsapp_conversas, n8n
--    "[RK] Analise Conversacional") já classifica cada conversa; aqui ela só
--    é LIDA, por REGRA fixa (a IA não escolhe a categoria nem muda o estado
--    da oportunidade). Fato vence a análise: pediu/agendou = contratar.
--    Análise anterior à abertura da oportunidade não vale (pode ser de outro
--    assunto): fica "nao_analisada" até a próxima rodada.
-- 2) Qualidade: vínculo dos pacientes novos separado em confirmado
--    (equipe ou pedido da Ju), provável (telefone + janela) e sem vínculo;
--    e consultas de paciente novo que já passaram sem baixa (sem
--    "finalizado" a aquisição não conta — é o que ocorreu com a #17).
-- Rollback: atribuicao_v2_painel_auditoria_rollback.sql
-- =====================================================================

-- Busca por telefone na análise da noite (mesma chave DDD + 8 dígitos).
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_tel_chave
  ON public.whatsapp_conversas (public.fn_atrib_tel_chave(contato_telefone));

CREATE OR REPLACE VIEW public.vw_atrib_oportunidades_painel
WITH (security_invoker = true) AS
 SELECT o.id,
    o.aberta_em,
    o.motivo_abertura,
    o.contato_novo,
    o.etapa_atual,
    o.etapa_maxima,
    o.etapa_maxima_ord,
    o.estado,
    o.estado_em,
    o.motivo_perda,
    o.motivo_fonte,
    o.motivo_evidencia,
    o.canal,
    o.plataforma,
    o.campanha_id,
    o.campanha_nome,
    o.tipo_origem,
    o.n_toques,
    ( SELECT t.servico_pagina
           FROM atrib_toques t
          WHERE t.id = o.toque_id) AS servico_pagina,
    ( SELECT string_agg(DISTINCT split_part(btrim(pp.nome), ' '::text, 1) || COALESCE((' '::text || "left"(NULLIF(split_part(btrim(pp.nome), ' '::text, 2), ''::text), 1)) || '.'::text, ''::text), ', '::text) AS string_agg
           FROM atrib_oportunidade_agendamentos oa
             JOIN agendamentos a ON a.id = oa.agendamento_id
             JOIN pessoas pp ON pp.id = a.paciente_id
          WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS criancas,
    ( SELECT count(*) AS count
           FROM atrib_oportunidade_agendamentos oa
          WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS agendamentos,
    ( SELECT COALESCE(sum(m.receita_recebida), 0::numeric) AS "coalesce"
           FROM atrib_oportunidade_agendamentos oa
             JOIN interno.mv_atrib_receita_sessao m ON m.agendamento_id = oa.agendamento_id
          WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS receita_vinculada,
    CASE
        WHEN o.etapa_maxima_ord >= 4 THEN 'contratar'::text
        WHEN w.id IS NULL THEN 'nao_analisada'::text
        WHEN w.lead_quente OR w.tipo_demanda = 'comercial'::text
          OR (w.cliente_novo AND (w.perguntou_valor OR w.perguntou_disponibilidade)) THEN 'contratar'::text
        WHEN w.intencao_principal = ANY (ARRAY['outros'::text, 'sem_atendimento'::text]) THEN 'sem_demanda'::text
        ELSE 'paciente'::text
    END AS intencao,
    CASE
        WHEN o.etapa_maxima_ord >= 4 THEN 'etapa'::text
        WHEN w.id IS NOT NULL THEN 'analise'::text
    END AS intencao_fonte,
    w.intencao_principal AS intencao_analise,
    w.processado_em AS intencao_analisada_em
   FROM vw_atrib_oportunidades o
     LEFT JOIN atrib_oportunidades x ON x.id = o.id
     LEFT JOIN LATERAL ( SELECT wc.id, wc.lead_quente, wc.tipo_demanda, wc.cliente_novo, wc.perguntou_valor,
            wc.perguntou_disponibilidade, wc.intencao_principal, wc.processado_em
           FROM whatsapp_conversas wc
          WHERE x.telefone_chave IS NOT NULL
            AND fn_atrib_tel_chave(wc.contato_telefone) = x.telefone_chave
            AND wc.processado_em >= o.aberta_em
          ORDER BY wc.processado_em DESC
         LIMIT 1) w ON true
  WHERE o.anonimizada_em IS NULL AND ( SELECT fn_atrib_pode_ver() AS fn_atrib_pode_ver);

CREATE OR REPLACE FUNCTION public.fn_atrib_painel_qualidade()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'vinculo_alto', count(*) FILTER (WHERE a.confianca = 'alta'),
        'vinculo_provavel', count(*) FILTER (WHERE a.tipo_vinculo = 'provavel'),
        'sem_vinculo', count(*) FILTER (WHERE a.tipo_vinculo = 'sem_vinculo'))
      FROM public.vw_atrib_aquisicoes a
     WHERE a.periodo_rastreado AND a.aquisicao_em >= (now() AT TIME ZONE 'America/Sao_Paulo') - interval '90 days'),
    -- Paciente novo (sem nenhuma sessão finalizada e sem sessão ocorrida antes do
    -- rastreamento) com consulta já passada e ainda agendada/confirmada: só vira
    -- aquisição quando a recepção der baixa. data_hora é hora de parede gravada
    -- como UTC (memória agenda-fuso-wall-clock). Lê a MV (até 10 min de atraso).
    'aguardando_baixa', (SELECT jsonb_build_object(
        'pacientes', count(*),
        'ligados_a_conversa', count(*) FILTER (WHERE z.ligado))
      FROM (SELECT m.paciente_id,
                   bool_or(EXISTS (SELECT 1 FROM public.atrib_oportunidade_agendamentos oa
                                    WHERE oa.agendamento_id = m.agendamento_id AND oa.removido_em IS NULL)) AS ligado
              FROM interno.mv_atrib_receita_sessao m
             WHERE m.status_consulta IN ('agendado', 'confirmado')
               AND (m.data_hora AT TIME ZONE 'UTC')::date >= k.inicio
               AND (m.data_hora AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'America/Sao_Paulo')
               AND NOT EXISTS (SELECT 1 FROM interno.mv_atrib_receita_sessao x
                                WHERE x.paciente_id = m.paciente_id AND x.status_consulta = 'finalizado')
               AND NOT EXISTS (SELECT 1 FROM interno.mv_atrib_receita_sessao x
                                WHERE x.paciente_id = m.paciente_id
                                  AND (x.data_hora AT TIME ZONE 'UTC')::date < k.inicio
                                  AND public.fn_atrib_sessao_ocorreu(x.status_consulta, x.status_pagamento,
                                                                     x.fatura_id, x.fatura_status, x.data_hora))
             GROUP BY m.paciente_id) z),
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
END $function$;

-- =====================================================================
-- 3) Sessão que "ocorreu" (evidência de atendimento).
-- =====================================================================
-- AI dev note: a recepção nem sempre dá baixa ("finalizado"). Desde 14/10,
-- 71 sessões passadas seguiam agendado/confirmado contra 40 finalizadas, e
-- 367 dos 1.430 pacientes com sessão paga não têm NENHUMA finalizada. Com a
-- regra antiga (aquisição = 1ª finalizada), paciente antigo virava "novo" no
-- dia em que alguém finalizasse uma sessão dele (157 das 1.077 aquisições
-- históricas tinham sessão paga antes). Regra nova:
--   - continua precisando de ao menos 1 sessão FINALIZADA para contar como
--     aquisição (agendado sozinho nunca conta — decisão do dono);
--   - a DATA da aquisição (e o "já era paciente/família") olha a 1ª sessão que
--     ocorreu: finalizada, OU agendada/confirmada já passada e paga (fatura
--     paga ou status pago sem fatura; estorno não vale). Falta, cancelamento,
--     reagendamento e erro nunca contam.
-- Função SQL simples sem SET search_path de propósito: assim o planner a
-- expande dentro da visão (não chama por linha). Não lê tabela nenhuma.
CREATE OR REPLACE FUNCTION public.fn_atrib_sessao_ocorreu(
  p_consulta text, p_pagamento text, p_fatura_id uuid, p_fatura_status text, p_data_hora timestamptz)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT p_consulta = 'finalizado'
      OR (p_consulta IN ('agendado', 'confirmado')
          AND (p_data_hora AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'America/Sao_Paulo')
          AND p_pagamento IS DISTINCT FROM 'estornado'
          AND (p_fatura_status = 'pago' OR (p_fatura_id IS NULL AND p_pagamento = 'pago')))
$$;
REVOKE ALL ON FUNCTION public.fn_atrib_sessao_ocorreu(text, text, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_sessao_ocorreu(text, text, uuid, text, timestamptz) TO authenticated, service_role;

-- Guarda as definições atuais para o rollback (restaura texto exato).
CREATE TABLE IF NOT EXISTS interno.atrib_definicoes_anteriores (
  objeto text NOT NULL, migracao text NOT NULL, definicao text NOT NULL, salvo_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (objeto, migracao));
REVOKE ALL ON interno.atrib_definicoes_anteriores FROM PUBLIC, anon, authenticated;
INSERT INTO interno.atrib_definicoes_anteriores (objeto, migracao, definicao) VALUES
  ('vw_atrib_aquisicoes', 'atribuicao_v2_painel_auditoria',
   'CREATE OR REPLACE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS ' || pg_get_viewdef('public.vw_atrib_aquisicoes'::regclass, true)),
  ('fn_atrib_processar', 'atribuicao_v2_painel_auditoria', pg_get_functiondef('public.fn_atrib_processar()'::regprocedure))
ON CONFLICT (objeto, migracao) DO NOTHING;

-- Aquisições reescrita: a âncora ("prim"), o vínculo ("cand") e o "família
-- nova" leem interno.mv_atrib_receita_sessao (uma linha por agendamento ativo,
-- com status da consulta, do pagamento e da fatura) em vez de agendamentos e
-- faturas. Motivo: numa visão security_invoker, cada linha de agendamentos e
-- faturas passa pelo RLS (is_admin/is_secretaria por linha) e o admin
-- estourava o timeout de 8 s. Custo: até 10 min de atraso (refresh da MV), o
-- mesmo da receita. O resto da visão é igual ao de atribuicao_v2_painel.
CREATE OR REPLACE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS
 WITH prim AS (
         SELECT DISTINCT ON (m.paciente_id) m.paciente_id,
            m.agendamento_id,
            m.data_hora AS aquisicao_em
           FROM interno.mv_atrib_receita_sessao m
          WHERE ( SELECT fn_atrib_pode_ver() AS fn_atrib_pode_ver)
            AND fn_atrib_sessao_ocorreu(m.status_consulta, m.status_pagamento, m.fatura_id, m.fatura_status, m.data_hora)
            AND (EXISTS ( SELECT 1
                   FROM interno.mv_atrib_receita_sessao mf
                  WHERE mf.paciente_id = m.paciente_id AND mf.status_consulta = 'finalizado'::text))
          ORDER BY m.paciente_id, m.data_hora, m.agendamento_id
        ), cand AS (
         SELECT p_1.paciente_id,
            oa.oportunidade_id,
            max(
                CASE oa.tipo_vinculo
                    WHEN 'humano'::text THEN 3
                    WHEN 'pedido_ju'::text THEN 2
                    ELSE 1
                END) AS forca,
            min(a.created_at) AS ag_criado_em
           FROM prim p_1
             JOIN interno.mv_atrib_receita_sessao a ON a.paciente_id = p_1.paciente_id AND a.created_at <= p_1.aquisicao_em
             JOIN atrib_oportunidade_agendamentos oa ON oa.agendamento_id = a.agendamento_id AND oa.removido_em IS NULL
          GROUP BY p_1.paciente_id, oa.oportunidade_id
        ), cred AS (
         SELECT DISTINCT ON (c_1.paciente_id) c_1.paciente_id,
            c_1.oportunidade_id,
            c_1.ag_criado_em,
                CASE c_1.forca
                    WHEN 3 THEN 'humano'::text
                    WHEN 2 THEN 'pedido_ju'::text
                    ELSE 'provavel'::text
                END AS tipo_vinculo,
                CASE
                    WHEN c_1.forca >= 2 THEN 'alta'::text
                    ELSE 'media'::text
                END AS confianca
           FROM cand c_1
             JOIN atrib_oportunidades o_1 ON o_1.id = c_1.oportunidade_id
          ORDER BY c_1.paciente_id, c_1.forca DESC, ((EXISTS ( SELECT 1
                   FROM atrib_toques t_1
                  WHERE t_1.oportunidade_id = o_1.id))) DESC, o_1.aberta_em DESC, o_1.id DESC
        )
 SELECT p.paciente_id,
    p.agendamento_id AS primeiro_atendimento_id,
    p.aquisicao_em,
    date_trunc('month'::text, (p.aquisicao_em AT TIME ZONE 'UTC'::text))::date AS mes,
    (p.aquisicao_em AT TIME ZONE 'UTC'::text)::date >= (( SELECT k.inicio
           FROM atrib_config k
          WHERE k.id = 1)) AS periodo_rastreado,
    c.oportunidade_id,
    COALESCE(c.tipo_vinculo, 'sem_vinculo'::text) AS tipo_vinculo,
    c.confianca,
    COALESCE(t.canal, 'nao_atribuido'::text) AS canal,
    t.plataforma,
    t.campanha_id,
    t.campanha_nome,
        CASE
            WHEN c.oportunidade_id IS NULL THEN 'sem_vinculo'::text
            WHEN t.id IS NULL THEN 'nao_atribuida'::text
            WHEN t.origem_tipo = 'declarada'::text THEN 'declarada'::text
            WHEN t.clique_status = 'encontrado'::text THEN 'site_completa'::text
            WHEN t.clique_status = 'pendente'::text THEN 'pendente'::text
            ELSE 'site_recuperada'::text
        END AS tipo_origem,
    o.contato_novo,
    NOT (EXISTS ( SELECT 1
           FROM pessoa_responsaveis r1
             JOIN pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel AND r2.id_pessoa <> r1.id_pessoa
             JOIN interno.mv_atrib_receita_sessao a2 ON a2.paciente_id = r2.id_pessoa AND a2.data_hora < p.aquisicao_em
          WHERE r1.id_pessoa = p.paciente_id
            AND fn_atrib_sessao_ocorreu(a2.status_consulta, a2.status_pagamento, a2.fatura_id, a2.fatura_status, a2.data_hora))) AS familia_nova,
    COALESCE(r.receita_primeira_sessao, 0::numeric) AS receita_primeira_sessao,
    COALESCE(r.receita_30d, 0::numeric) AS receita_30d,
    COALESCE(r.receita_90d, 0::numeric) AS receita_90d,
    COALESCE(r.receita_180d, 0::numeric) AS receita_180d,
    COALESCE(r.receita_total, 0::numeric) AS ltv_realizado,
    COALESCE(r.sessoes_30d, 0::bigint) AS sessoes_30d,
    COALESCE(r.sessoes_90d, 0::bigint) AS sessoes_90d,
    COALESCE(r.sessoes_180d, 0::bigint) AS sessoes_180d,
    COALESCE(r.sessoes_total, 0::bigint) AS sessoes_total,
    COALESCE(r.sessoes_30d, 0::bigint) > 1 AS retornou_30d,
    COALESCE(r.sessoes_90d, 0::bigint) > 1 AS retornou_90d,
    COALESCE(r.sessoes_180d, 0::bigint) > 1 AS retornou_180d,
    (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date - (p.aquisicao_em AT TIME ZONE 'UTC'::text)::date AS dias_desde_aquisicao,
    date_trunc('month'::text, (COALESCE(t.clicado_em, t.mensagem_em, o.aberta_em) AT TIME ZONE 'America/Sao_Paulo'::text))::date AS mes_origem,
    ( SELECT regexp_replace(btrim(ts.nome), '\s*-\s*(DU|FDS)$'::text, ''::text) AS regexp_replace
           FROM agendamentos ag
             JOIN tipo_servicos ts ON ts.id = ag.tipo_servico_id
          WHERE ag.id = p.agendamento_id) AS servico,
        CASE
            WHEN NOT (EXISTS ( SELECT 1
           FROM pessoa_responsaveis r1
             JOIN pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel AND r2.id_pessoa <> r1.id_pessoa
             JOIN interno.mv_atrib_receita_sessao a2 ON a2.paciente_id = r2.id_pessoa AND a2.data_hora < p.aquisicao_em
          WHERE r1.id_pessoa = p.paciente_id
            AND fn_atrib_sessao_ocorreu(a2.status_consulta, a2.status_pagamento, a2.fatura_id, a2.fatura_status, a2.data_hora))) THEN ( SELECT COALESCE(sum(m.receita_recebida), 0::numeric) AS "coalesce"
               FROM interno.mv_atrib_receita_sessao m
              WHERE m.data_hora >= p.aquisicao_em AND (m.paciente_id IN ( SELECT p.paciente_id
                    UNION
                     SELECT r2.id_pessoa
                       FROM pessoa_responsaveis r1
                         JOIN pessoa_responsaveis r2 ON r2.id_responsavel = r1.id_responsavel
                      WHERE r1.id_pessoa = p.paciente_id AND r2.ativo)))
            ELSE NULL::numeric
        END AS ltv_familia_realizado
   FROM prim p
     LEFT JOIN cred c ON c.paciente_id = p.paciente_id
     LEFT JOIN atrib_oportunidades o ON o.id = c.oportunidade_id
     LEFT JOIN LATERAL ( SELECT tt.id,
            tt.origem_tipo,
            tt.canal,
            tt.plataforma,
            tt.campanha_id,
            tt.campanha_nome,
            tt.clicado_em,
            tt.mensagem_em,
            tt.clique_status
           FROM atrib_toques tt
          WHERE tt.oportunidade_id = c.oportunidade_id
          ORDER BY (COALESCE(tt.mensagem_em, tt.registrado_em) <= c.ag_criado_em) DESC, (COALESCE(tt.mensagem_em, tt.registrado_em)) DESC, tt.id DESC
         LIMIT 1) t ON true
     LEFT JOIN LATERAL ( SELECT sum(rs.receita_recebida) FILTER (WHERE rs.agendamento_id = p.agendamento_id) AS receita_primeira_sessao,
            sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < (p.aquisicao_em + '30 days'::interval)) AS receita_30d,
            sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < (p.aquisicao_em + '90 days'::interval)) AS receita_90d,
            sum(rs.receita_recebida) FILTER (WHERE rs.data_hora < (p.aquisicao_em + '180 days'::interval)) AS receita_180d,
            sum(rs.receita_recebida) AS receita_total,
            count(*) FILTER (WHERE rs.status_consulta = 'finalizado'::text AND rs.data_hora < (p.aquisicao_em + '30 days'::interval)) AS sessoes_30d,
            count(*) FILTER (WHERE rs.status_consulta = 'finalizado'::text AND rs.data_hora < (p.aquisicao_em + '90 days'::interval)) AS sessoes_90d,
            count(*) FILTER (WHERE rs.status_consulta = 'finalizado'::text AND rs.data_hora < (p.aquisicao_em + '180 days'::interval)) AS sessoes_180d,
            count(*) FILTER (WHERE rs.status_consulta = 'finalizado'::text) AS sessoes_total
           FROM interno.mv_atrib_receita_sessao rs
          WHERE rs.paciente_id = p.paciente_id AND rs.data_hora >= p.aquisicao_em) r ON true;

-- Processamento: "já era paciente" (descarte ja_paciente) usa a mesma evidência.
DO $do$
DECLARE d text; n text;
  v_velho text := $v$WHERE cs.codigo = 'finalizado' AND a.data_hora < o.aberta_em$v$;
  v_novo text := $v$LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
                LEFT JOIN public.faturas fa ON fa.id = a.fatura_id AND fa.ativo
               WHERE public.fn_atrib_sessao_ocorreu(cs.codigo, ps.codigo, fa.id, fa.status, a.data_hora)
                 AND a.data_hora < o.aberta_em$v$;
BEGIN
  d := pg_get_functiondef('public.fn_atrib_processar()'::regprocedure);
  IF (length(d) - length(replace(d, v_velho, ''))) / length(v_velho) <> 1 THEN
    RAISE EXCEPTION 'processar: trecho do ja_paciente não encontrado (ou repetido)';
  END IF;
  EXECUTE replace(d, v_velho, v_novo);
END
$do$;
