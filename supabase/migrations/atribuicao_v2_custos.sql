-- =====================================================================
-- Atribuição v2 — importação de custos do Google Ads (fase 2)
-- =====================================================================
-- AI dev note (aprovado pelo dono em 21/10/2026):
-- * O Google Ads Script (scripts/google-ads/atrib-custos.js) chama
--   fn_atrib_custos_receber pela chave pública + token próprio (vault
--   'atrib_custos_token', trocável a qualquer momento). Nenhuma credencial
--   administrativa do Supabase vai para o script.
-- * Cada envio traz uma janela (últimos 7 dias) e SUBSTITUI os dados dessa
--   conta nessa janela: rodar 3 vezes não triplica nada; ajuste do Google
--   em dias anteriores é absorvido.
-- * Validação: conta fixa (atrib_config), moeda BRL, datas e números sãos.
--   Rejeitado = nada muda + registro em atrib_custos_importacoes.
-- * Conciliação: total das campanhas × total da conta, dia a dia. Diferença
--   > 1 centavo = importação "divergente" (dados entram, painel avisa).
-- * Sem custo completo e atualizado, CAC/ROAS ficam NULL ("não disponível"),
--   nunca zero. Gasto inteiro da campanha vai no denominador.
-- * Coorte = mês do clique (toque creditado), alinhado ao mês do gasto.
-- =====================================================================

ALTER TABLE public.atrib_config
  ADD COLUMN google_ads_conta_id       text NOT NULL DEFAULT '8744391492',
  ADD COLUMN google_ads_fuso           text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN custos_horas_desatualizado int NOT NULL DEFAULT 36;

ALTER TABLE public.atrib_custos_diarios
  ADD COLUMN status_campanha text,
  ADD COLUMN importacao_id   bigint;

CREATE TABLE public.atrib_custos_importacoes (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recebido_em             timestamptz NOT NULL DEFAULT now(),
  origem                  text NOT NULL,
  plataforma              text,
  conta_id                text,
  periodo_de              date,
  periodo_ate             date,
  moeda                   text,
  fuso                    text,
  linhas                  int,
  campanhas               int,
  custo_campanhas_micros  bigint,
  custo_conta_micros      bigint,
  diferenca_micros        bigint,
  status                  text NOT NULL CHECK (status IN ('ok','divergente','rejeitada')),
  detalhe                 text,
  execucao                text
);
CREATE INDEX atrib_custos_imp_idx ON public.atrib_custos_importacoes (plataforma, conta_id, recebido_em DESC);
ALTER TABLE public.atrib_custos_importacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atrib_custos_importacoes FROM anon, authenticated;
GRANT SELECT ON public.atrib_custos_importacoes TO authenticated;
CREATE POLICY atrib_custos_importacoes_admin ON public.atrib_custos_importacoes
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));


-- ── Importação (interna; service_role ou via fn_atrib_custos_receber) ──
-- p = {plataforma, conta_id, moeda, fuso, periodo_de, periodo_ate, origem, execucao,
--      linhas:[{data, campanha_id, campanha_nome, status, impressoes, cliques, custo_micros}],
--      totais_conta:[{data, custo_micros}]}
DROP FUNCTION public.fn_atrib_custos_importar(jsonb);
CREATE FUNCTION public.fn_atrib_custos_importar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k        public.atrib_config;
  v_de     date; v_ate date;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_erro   text;
  v_id     bigint;
  v_camp   bigint; v_conta bigint; v_dif bigint; v_n int; v_nc int;
  v_status text; v_det text;
BEGIN
  SELECT * INTO k FROM public.atrib_config WHERE id = 1;
  BEGIN
    v_de := (p->>'periodo_de')::date;
    v_ate := (p->>'periodo_ate')::date;
  EXCEPTION WHEN OTHERS THEN v_erro := 'período inválido';
  END;

  BEGIN   -- conversão de tipo malformado vira rejeição, nunca erro 500
  v_erro := coalesce(v_erro, CASE
    WHEN coalesce(p->>'plataforma', '') <> 'google_ads' THEN 'plataforma não suportada'
    WHEN regexp_replace(coalesce(p->>'conta_id', ''), '\D', '', 'g') <> k.google_ads_conta_id THEN 'conta diferente da configurada'
    WHEN coalesce(p->>'moeda', '') <> 'BRL' THEN 'moeda diferente de BRL'
    WHEN v_de IS NULL OR v_ate IS NULL OR v_ate < v_de THEN 'período inválido'
    WHEN v_ate > v_hoje + 1 OR v_ate - v_de > 31 THEN 'período fora do limite (até 31 dias, sem futuro)'
    WHEN jsonb_typeof(p->'linhas') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'linhas') > 5000 THEN 'linhas ausentes ou demais'
    WHEN jsonb_typeof(p->'totais_conta') IS DISTINCT FROM 'array' THEN 'totais da conta ausentes (conciliação)'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') l
                  WHERE coalesce(l->>'campanha_id', '') !~ '^\d{1,20}$'
                     OR coalesce(l->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
                     OR (l->>'data')::date NOT BETWEEN v_de AND v_ate
                     OR coalesce(l->>'custo_micros', '') !~ '^\d{1,15}$'
                     OR coalesce(l->>'impressoes', '0') !~ '^\d{1,12}$'
                     OR coalesce(l->>'cliques', '0') !~ '^\d{1,12}$') THEN 'linha com campo inválido'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p->'totais_conta') t
                  WHERE coalesce(t->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
                     OR coalesce(t->>'custo_micros', '') !~ '^\d{1,15}$') THEN 'total da conta com campo inválido'
    WHEN (SELECT count(*) <> count(DISTINCT (l->>'data', l->>'campanha_id'))
            FROM jsonb_array_elements(p->'linhas') l) THEN 'campanha repetida no mesmo dia'
  END);
  EXCEPTION WHEN OTHERS THEN v_erro := 'dados inválidos: ' || left(SQLERRM, 200);
  END;

  IF v_erro IS NOT NULL THEN
    INSERT INTO public.atrib_custos_importacoes (origem, plataforma, conta_id, periodo_de, periodo_ate, moeda, fuso, status, detalhe, execucao)
    VALUES (coalesce(p->>'origem', 'manual'), left(p->>'plataforma', 30), left(p->>'conta_id', 30), v_de, v_ate,
            left(p->>'moeda', 10), left(p->>'fuso', 60), 'rejeitada', v_erro, left(p->>'execucao', 100))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', false, 'motivo', v_erro, 'importacao_id', v_id);
  END IF;

  -- conciliação: campanhas × conta, por dia
  SELECT coalesce(sum((l->>'custo_micros')::bigint), 0), count(*), count(DISTINCT l->>'campanha_id')
    INTO v_camp, v_n, v_nc FROM jsonb_array_elements(p->'linhas') l;
  SELECT coalesce(sum((t->>'custo_micros')::bigint), 0) INTO v_conta
    FROM jsonb_array_elements(p->'totais_conta') t WHERE (t->>'data')::date BETWEEN v_de AND v_ate;
  SELECT coalesce(sum(abs(coalesce(c.m, 0) - coalesce(t.m, 0))), 0) INTO v_dif
    FROM (SELECT (l->>'data')::date d, sum((l->>'custo_micros')::bigint) m FROM jsonb_array_elements(p->'linhas') l GROUP BY 1) c
    FULL JOIN (SELECT (t->>'data')::date d, sum((t->>'custo_micros')::bigint) m FROM jsonb_array_elements(p->'totais_conta') t
                WHERE (t->>'data')::date BETWEEN v_de AND v_ate GROUP BY 1) t USING (d);
  v_status := CASE WHEN v_dif > 10000 THEN 'divergente' ELSE 'ok' END;   -- 10.000 micros = 1 centavo
  v_det := concat_ws('; ',
    CASE WHEN v_dif > 10000 THEN format('campanhas %s × conta %s', round(v_camp / 1e6, 2), round(v_conta / 1e6, 2)) END,
    CASE WHEN coalesce(p->>'fuso', '') <> k.google_ads_fuso THEN 'fuso da conta: ' || coalesce(p->>'fuso', '?') END);

  INSERT INTO public.atrib_custos_importacoes (origem, plataforma, conta_id, periodo_de, periodo_ate, moeda, fuso, linhas, campanhas,
                                               custo_campanhas_micros, custo_conta_micros, diferenca_micros, status, detalhe, execucao)
  VALUES (coalesce(p->>'origem', 'manual'), 'google_ads', k.google_ads_conta_id, v_de, v_ate, 'BRL', left(p->>'fuso', 60), v_n, v_nc,
          v_camp, v_conta, v_dif, v_status, nullif(v_det, ''), left(p->>'execucao', 100))
  RETURNING id INTO v_id;

  -- substitui a janela inteira dessa conta (idempotente; absorve ajustes do Google)
  DELETE FROM public.atrib_custos_diarios d
   WHERE d.plataforma = 'google_ads' AND d.conta_id = k.google_ads_conta_id AND d.data BETWEEN v_de AND v_ate;
  INSERT INTO public.atrib_custos_diarios (plataforma, conta_id, campanha_id, data, campanha_nome, status_campanha, impressoes, cliques,
                                           custo_micros, custo, moeda, fonte, atualizado_em, importacao_id)
  SELECT 'google_ads', k.google_ads_conta_id, l->>'campanha_id', (l->>'data')::date, left(l->>'campanha_nome', 200),
         left(l->>'status', 30), coalesce((l->>'impressoes')::bigint, 0), coalesce((l->>'cliques')::bigint, 0),
         (l->>'custo_micros')::bigint, round((l->>'custo_micros')::numeric / 1000000, 2), 'BRL',
         CASE WHEN coalesce(p->>'origem', 'manual') = 'google_ads_script' THEN 'google_ads_script' ELSE 'manual' END, now(), v_id
    FROM jsonb_array_elements(p->'linhas') l;

  RETURN jsonb_build_object('ok', true, 'importacao_id', v_id, 'status', v_status, 'linhas', v_n,
                            'custo', round(v_camp / 1e6, 2), 'diferenca', round(v_dif / 1e6, 2));
END $$;

-- ── Porta de entrada do Google Ads Script (chave pública + token) ────
CREATE FUNCTION public.fn_atrib_custos_receber(p jsonb, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tok text := (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'atrib_custos_token');
BEGIN
  IF v_tok IS NULL OR p_token IS NULL OR length(p_token) < 32 OR p_token <> v_tok THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_atrib_custos_importar(p || jsonb_build_object('origem', 'google_ads_script'));
END $$;

REVOKE ALL ON FUNCTION public.fn_atrib_custos_importar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_atrib_custos_importar(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fn_atrib_custos_receber(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_atrib_custos_receber(jsonb, text) TO anon, authenticated, service_role;


-- ── Situação dos custos (o painel avisa "custo desatualizado") ───────
-- Uma linha fixa por plataforma (a conta configurada), mesmo sem nenhuma
-- importação ainda (aí já nasce "desatualizado"). Rejeições contam à parte,
-- qualquer que seja a conta que veio no envio.
CREATE VIEW public.vw_atrib_custos_status WITH (security_invoker = true) AS
SELECT 'google_ads'::text AS plataforma, k.google_ads_conta_id AS conta_id,
       ok.ultima_importacao, ok.cobertura_ate, ult.status AS ultimo_status, ult.detalhe AS ultimo_detalhe,
       coalesce(ok.ultima_importacao, '-infinity') < now() - make_interval(hours => k.custos_horas_desatualizado) AS desatualizado,
       (SELECT count(*) FROM public.atrib_custos_importacoes i
         WHERE i.plataforma = 'google_ads' AND i.conta_id = k.google_ads_conta_id AND i.status = 'divergente'
           AND i.recebido_em > now() - interval '7 days') AS divergencias_7d,
       (SELECT count(*) FROM public.atrib_custos_importacoes i
         WHERE coalesce(i.plataforma, 'google_ads') = 'google_ads' AND i.status = 'rejeitada'
           AND i.recebido_em > now() - interval '7 days') AS rejeicoes_7d
  FROM public.atrib_config k
  LEFT JOIN LATERAL (SELECT max(i.recebido_em) AS ultima_importacao, max(i.periodo_ate) AS cobertura_ate
                       FROM public.atrib_custos_importacoes i
                      WHERE i.plataforma = 'google_ads' AND i.conta_id = k.google_ads_conta_id AND i.status <> 'rejeitada') ok ON true
  LEFT JOIN LATERAL (SELECT i.status, i.detalhe FROM public.atrib_custos_importacoes i
                      WHERE coalesce(i.plataforma, 'google_ads') = 'google_ads'
                      ORDER BY i.recebido_em DESC, i.id DESC LIMIT 1) ult ON true
 WHERE k.id = 1;


-- ── Coorte pelo mês do clique (alinha com o mês do gasto) ───────────
CREATE OR REPLACE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS
WITH prim AS (
  SELECT DISTINCT ON (a.paciente_id) a.paciente_id, a.id AS agendamento_id, a.data_hora AS aquisicao_em
    FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
   WHERE a.ativo AND cs.codigo = 'finalizado'
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
       -- novo: mês da origem (clique creditado; sem clique, a abertura da oportunidade)
       date_trunc('month', coalesce(t.clicado_em, t.mensagem_em, o.aberta_em) AT TIME ZONE 'America/Sao_Paulo')::date AS mes_origem
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
      FROM public.vw_atrib_receita_sessao rs
     WHERE rs.paciente_id = p.paciente_id AND rs.data_hora >= p.aquisicao_em) r ON true;


-- ── Campanhas: custo completo ou "não disponível" ─────────────────────
-- custo_status: completo | desatualizado (importação parada ou mês ainda não
-- coberto) | sem_dados (campanha paga sem custo importado) | nao_se_aplica
-- (orgânico). CAC/ROAS só com custo completo; o gasto INTEIRO da campanha
-- é o denominador. ROAS = "atribuído observado": parte das conversas pode
-- não ter origem vinculada (ver vw_atrib_cobertura_mensal).
DROP VIEW public.vw_atrib_campanhas_mensal;
CREATE VIEW public.vw_atrib_campanhas_mensal WITH (security_invoker = true) AS
WITH st AS (
  SELECT s.plataforma, s.cobertura_ate, s.desatualizado FROM public.vw_atrib_custos_status s),
custo AS (
  SELECT date_trunc('month', d.data)::date AS mes, d.plataforma, d.campanha_id, max(d.campanha_nome) AS campanha_nome,
         sum(d.custo) AS investimento, sum(d.impressoes) AS impressoes, sum(d.cliques) AS cliques_anuncio
    FROM public.atrib_custos_diarios d GROUP BY 1, 2, 3),
wpp AS (
  SELECT date_trunc('month', w.dia)::date AS mes, w.campanha_id, sum(w.cliques) AS cliques_whatsapp
    FROM public.atrib_cliques_whatsapp_diarios w WHERE w.campanha_id <> '' GROUP BY 1, 2),
ops AS (
  SELECT date_trunc('month', o.aberta_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes, o.plataforma, o.campanha_id,
         count(*) AS conversas, count(*) FILTER (WHERE o.etapa_maxima_ord >= 5) AS agendaram
    FROM public.vw_atrib_oportunidades o WHERE o.campanha_id IS NOT NULL GROUP BY 1, 2, 3),
aq AS (
  SELECT a.mes_origem AS mes, a.plataforma, a.campanha_id, count(*) AS novos_pacientes,
         count(*) FILTER (WHERE a.familia_nova) AS familias_novas,
         sum(a.receita_primeira_sessao) AS r1, sum(a.receita_30d) AS r30, sum(a.receita_90d) AS r90,
         sum(a.receita_180d) AS r180, sum(a.ltv_realizado) AS ltv, min(a.dias_desde_aquisicao) AS idade_min
    FROM public.vw_atrib_aquisicoes a WHERE a.campanha_id IS NOT NULL GROUP BY 1, 2, 3),
base AS (
  SELECT mes, plataforma, campanha_id, c.campanha_nome, c.investimento, c.impressoes, c.cliques_anuncio,
         o.conversas, o.agendaram, a.novos_pacientes, a.familias_novas, a.r1, a.r30, a.r90, a.r180, a.ltv, a.idade_min
    FROM custo c
    FULL JOIN ops o USING (mes, plataforma, campanha_id)
    FULL JOIN aq a USING (mes, plataforma, campanha_id)),
cs AS (
  SELECT b.*,
         CASE WHEN b.plataforma IS NULL THEN 'nao_se_aplica'
              WHEN st.plataforma IS NULL OR b.investimento IS NULL THEN 'sem_dados'
              WHEN st.desatualizado
                OR st.cobertura_ate < least((b.mes + interval '1 month - 1 day')::date,
                                            (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1) THEN 'desatualizado'
              ELSE 'completo' END AS custo_status
    FROM base b LEFT JOIN st ON st.plataforma = b.plataforma)
SELECT b.mes, b.plataforma, b.campanha_id,
       coalesce(b.campanha_nome, (SELECT max(t.campanha_nome) FROM public.atrib_toques t WHERE t.campanha_id = b.campanha_id)) AS campanha_nome,
       b.custo_status,
       b.investimento,                       -- NULL = não importado (não é zero)
       b.impressoes, b.cliques_anuncio, w.cliques_whatsapp,
       coalesce(b.conversas, 0) AS conversas_com_codigo, coalesce(b.agendaram, 0) AS agendaram,
       coalesce(b.novos_pacientes, 0) AS novos_pacientes, coalesce(b.familias_novas, 0) AS familias_novas,
       CASE WHEN b.custo_status = 'completo' THEN round(b.investimento / nullif(b.agendaram, 0), 2) END AS custo_por_agendamento,
       CASE WHEN b.custo_status = 'completo' THEN round(b.investimento / nullif(b.novos_pacientes, 0), 2) END AS cac_midia,
       CASE WHEN b.custo_status = 'completo' THEN round(coalesce(b.r1, 0) / nullif(b.investimento, 0), 2) END AS roas_primeira_sessao,
       CASE WHEN b.custo_status = 'completo' THEN round(coalesce(b.r30, 0) / nullif(b.investimento, 0), 2) END AS roas_30d,
       coalesce(b.idade_min >= 30, false) AS roas_30d_maduro,
       CASE WHEN b.custo_status = 'completo' THEN round(coalesce(b.r90, 0) / nullif(b.investimento, 0), 2) END AS roas_90d,
       coalesce(b.idade_min >= 90, false) AS roas_90d_maduro,
       CASE WHEN b.custo_status = 'completo' THEN round(coalesce(b.r180, 0) / nullif(b.investimento, 0), 2) END AS roas_180d,
       coalesce(b.idade_min >= 180, false) AS roas_180d_maduro,
       coalesce(b.ltv, 0) AS receita_acumulada, coalesce(b.novos_pacientes, 0) AS amostra
  FROM cs b
  LEFT JOIN wpp w ON w.mes = b.mes AND w.campanha_id = b.campanha_id;


-- ── Cobertura: nome correto do indicador ─────────────────────────────
DROP VIEW public.vw_atrib_cobertura_mensal;
CREATE VIEW public.vw_atrib_cobertura_mensal WITH (security_invoker = true) AS
WITH aq AS (
  SELECT a.mes, count(*) AS novos_pacientes,
         count(*) FILTER (WHERE a.tipo_vinculo <> 'sem_vinculo') AS com_oportunidade,
         count(*) FILTER (WHERE a.tipo_origem = 'site_completa') AS origem_completa,
         count(*) FILTER (WHERE a.tipo_origem = 'site_recuperada') AS origem_recuperada,
         count(*) FILTER (WHERE a.tipo_origem = 'declarada') AS origem_declarada,
         count(*) FILTER (WHERE a.tipo_origem IN ('sem_vinculo','nao_atribuida')) AS nao_atribuidos,
         count(*) FILTER (WHERE a.confianca = 'alta') AS vinculo_alto
    FROM public.vw_atrib_aquisicoes a WHERE a.periodo_rastreado GROUP BY 1),
msg AS (
  SELECT date_trunc('month', t.mensagem_em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
         count(*) AS mensagens_com_codigo,
         count(*) FILTER (WHERE t.clique_status = 'encontrado') AS codigos_com_clique
    FROM public.atrib_toques t WHERE t.origem_tipo = 'site' GROUP BY 1),
cli AS (
  SELECT date_trunc('month', w.dia)::date AS mes, sum(w.cliques) AS cliques_whatsapp
    FROM public.atrib_cliques_whatsapp_diarios w GROUP BY 1)
SELECT mes, cli.cliques_whatsapp, msg.mensagens_com_codigo, msg.codigos_com_clique,
       -- não é a taxa de conversão do WhatsApp: a pessoa pode apagar o código,
       -- usar outro telefone ou escrever depois.
       round(100.0 * msg.mensagens_com_codigo / nullif(cli.cliques_whatsapp, 0), 1) AS taxa_vinculacao_rk_observada,
       aq.novos_pacientes, aq.com_oportunidade, aq.origem_completa, aq.origem_recuperada, aq.origem_declarada,
       aq.nao_atribuidos, aq.vinculo_alto,
       round(100.0 * aq.nao_atribuidos / nullif(aq.novos_pacientes, 0), 1) AS pct_nao_atribuidos
  FROM aq FULL JOIN msg USING (mes) FULL JOIN cli USING (mes);

REVOKE ALL ON public.vw_atrib_custos_status, public.vw_atrib_campanhas_mensal, public.vw_atrib_cobertura_mensal FROM anon;
