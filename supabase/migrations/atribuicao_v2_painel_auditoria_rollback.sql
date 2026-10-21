-- Rollback de atribuicao_v2_painel_auditoria.sql (volta ao estado de atribuicao_v2_painel_desempenho).
BEGIN;
DROP VIEW public.vw_atrib_oportunidades_painel;
CREATE VIEW public.vw_atrib_oportunidades_painel
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
          WHERE oa.oportunidade_id = o.id AND oa.removido_em IS NULL) AS receita_vinculada
   FROM vw_atrib_oportunidades o
  WHERE o.anonimizada_em IS NULL AND ( SELECT fn_atrib_pode_ver() AS fn_atrib_pode_ver);

REVOKE ALL ON public.vw_atrib_oportunidades_painel FROM PUBLIC, anon;
GRANT ALL ON public.vw_atrib_oportunidades_painel TO authenticated, service_role;

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
END $function$;

-- aquisições e processamento: texto exato salvo pela migração
DO $do$
BEGIN
  EXECUTE (SELECT definicao FROM interno.atrib_definicoes_anteriores WHERE objeto = 'vw_atrib_aquisicoes' AND migracao = 'atribuicao_v2_painel_auditoria');
  EXECUTE (SELECT definicao FROM interno.atrib_definicoes_anteriores WHERE objeto = 'fn_atrib_processar' AND migracao = 'atribuicao_v2_painel_auditoria');
END
$do$;
DROP FUNCTION IF EXISTS public.fn_atrib_sessao_ocorreu(text, text, uuid, text, timestamptz);
DELETE FROM interno.atrib_definicoes_anteriores WHERE migracao = 'atribuicao_v2_painel_auditoria';
DROP INDEX IF EXISTS public.idx_whatsapp_conversas_tel_chave;
COMMIT;
