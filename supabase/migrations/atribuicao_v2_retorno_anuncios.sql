-- Atribuição v2 — Retorno dos anúncios (aba Marketing → Retorno dos anúncios).
--
-- Pergunta do dono (21/11/2026): "quem são as pacientes que vieram do tráfego pago,
-- quantas sessões já fizeram e qual o ROAS". O painel de aquisição (vw_atrib_aquisicoes)
-- não responde isso hoje porque:
--   1. exige a 1ª sessão com status "Finalizado" (a recepção quase não dá baixa);
--   2. só conta receita de fatura PAGA, e a cobrança é mensal (paga no mês seguinte).
-- Esta função mostra as duas coisas lado a lado, sem estimativa:
--   - receita REALIZADA: sessões que já aconteceram (data passada, não canceladas),
--     pelo valor da sessão na agenda — inclui falta, que é cobrada integral;
--   - receita RECEBIDA: o que as faturas pagas cobriram (rateio de vw_atrib_receita_sessao);
--   - receita AGENDADA: sessões futuras já marcadas (separada; não entra no ROAS realizado).
--
-- Quem conta: pacientes ligadas a uma conversa cujo 1º toque veio da plataforma no período
-- (atrib_oportunidade_agendamentos), com todas as sessões delas desde a 1ª ligada.
-- "Já era paciente" = tinha sessão antes da conversa: aparece na lista, fica fora do CAC.
-- data_hora é hora de parede (gravada como UTC): comparar com now() em São Paulo.
-- Só admin (fn_atrib_rpc_ok), como as demais RPCs do painel.

CREATE OR REPLACE FUNCTION public.fn_atrib_retorno_anuncios(
  p_desde date,
  p_ate date,
  p_plataforma text DEFAULT 'google_ads'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_agora timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_out jsonb;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_ate IS NULL OR p_ate < p_desde THEN
    RAISE EXCEPTION 'período inválido';
  END IF;

  WITH
  nomes AS (  -- nome mais recente de cada campanha (o toque guarda só o id)
    SELECT DISTINCT ON (c.campanha_id) c.campanha_id, c.campanha_nome
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = p_plataforma AND c.campanha_nome IS NOT NULL
     ORDER BY c.campanha_id, c.data DESC
  ),
  custo AS (
    SELECT c.campanha_id, sum(c.custo) investimento, sum(c.impressoes) impressoes, sum(c.cliques) cliques
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = p_plataforma AND c.data BETWEEN p_desde AND p_ate
     GROUP BY 1
  ),
  conv AS (  -- 1º toque da plataforma por conversa, dentro do período
    SELECT DISTINCT ON (t.conversa_id)
           t.conversa_id, t.oportunidade_id, t.campanha_id, t.palavra_chave, t.landing_path,
           t.vinculo, (t.mensagem_em AT TIME ZONE 'America/Sao_Paulo') primeira_msg
      FROM public.atrib_toques t
     WHERE t.plataforma = p_plataforma
       AND (t.mensagem_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_desde AND p_ate
     ORDER BY t.conversa_id, t.mensagem_em
  ),
  conv2 AS (
    SELECT cv.*, o.aberta_em, o.etapa_maxima, o.estado,
           EXISTS (SELECT 1 FROM public.atrib_sinais s WHERE s.conversa_id = cv.conversa_id AND s.tipo = 'convenio') convenio
      FROM conv cv
      LEFT JOIN public.atrib_oportunidades o ON o.id = cv.oportunidade_id
  ),
  liga AS (  -- paciente ligada a cada conversa + 1ª sessão ligada
    SELECT cv.conversa_id, a.paciente_id, min(a.data_hora) primeira_ligada
      FROM conv2 cv
      JOIN public.atrib_oportunidade_agendamentos oa ON oa.oportunidade_id = cv.oportunidade_id AND oa.removido_em IS NULL
      JOIN public.agendamentos a ON a.id = oa.agendamento_id
     GROUP BY 1, 2
  ),
  pac AS (  -- uma linha por paciente (se duas conversas levam à mesma, vale a 1ª)
    SELECT DISTINCT ON (l.paciente_id) l.paciente_id, l.conversa_id, l.primeira_ligada
      FROM liga l JOIN conv2 cv ON cv.conversa_id = l.conversa_id
     ORDER BY l.paciente_id, cv.primeira_msg
  ),
  sess AS (
    SELECT p.paciente_id, a.id agendamento_id, (a.data_hora AT TIME ZONE 'UTC') dh,
           cs.codigo status, ps.codigo pagamento, coalesce(a.valor_servico, 0) valor,
           ts.nome servico, coalesce(r.receita_recebida, 0) recebida
      FROM pac p
      JOIN public.agendamentos a ON a.paciente_id = p.paciente_id AND a.ativo AND a.data_hora >= p.primeira_ligada
      LEFT JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
      LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
      LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
      LEFT JOIN public.vw_atrib_receita_sessao r ON r.agendamento_id = a.id
     WHERE coalesce(cs.codigo, '') NOT IN ('cancelado', 'reagendado', 'erro')
  ),
  por_pac AS (
    SELECT p.paciente_id, p.conversa_id,
           pe.nome,
           EXISTS (SELECT 1 FROM public.agendamentos a0
                    WHERE a0.paciente_id = p.paciente_id AND a0.ativo
                      AND a0.created_at < cv.aberta_em) ja_era_paciente,
           min(s.dh) FILTER (WHERE s.dh <= v_agora AND s.status <> 'faltou') primeira_sessao,
           min(s.dh) FILTER (WHERE s.dh > v_agora) proxima_sessao,
           count(*) FILTER (WHERE s.dh <= v_agora AND s.status IN ('finalizado', 'confirmado', 'agendado')) realizadas,
           count(*) FILTER (WHERE s.dh <= v_agora AND s.status IN ('confirmado', 'agendado')) sem_baixa,
           count(*) FILTER (WHERE s.dh <= v_agora AND s.status = 'faltou') faltas,
           count(*) FILTER (WHERE s.dh > v_agora) futuras,
           coalesce(sum(s.valor) FILTER (WHERE s.dh <= v_agora), 0) receita_realizada,
           coalesce(sum(s.recebida), 0) receita_recebida,
           coalesce(sum(s.valor) FILTER (WHERE s.dh > v_agora), 0) receita_agendada,
           (array_agg(s.servico ORDER BY s.dh))[1] servico
      FROM pac p
      JOIN conv2 cv ON cv.conversa_id = p.conversa_id
      LEFT JOIN public.pessoas pe ON pe.id = p.paciente_id
      LEFT JOIN sess s ON s.paciente_id = p.paciente_id
     GROUP BY p.paciente_id, p.conversa_id, pe.nome, cv.aberta_em
  ),
  por_conv AS (
    SELECT cv.*,
           pp.paciente_id, pp.realizadas, pp.futuras,
           CASE WHEN pp.realizadas > 0 THEN 'paciente'
                WHEN pp.futuras > 0 THEN 'agendada'
                WHEN cv.etapa_maxima = 'agendamento_solicitado' THEN 'pediu_horario'
                ELSE 'conversa' END resultado
      FROM conv2 cv
      LEFT JOIN por_pac pp ON pp.conversa_id = cv.conversa_id
  ),
  camp AS (
    SELECT coalesce(c.campanha_id, x.campanha_id) campanha_id,
           coalesce(n.campanha_nome, coalesce(c.campanha_id, x.campanha_id)) nome,
           coalesce(c.investimento, 0) investimento, coalesce(c.impressoes, 0) impressoes, coalesce(c.cliques, 0) cliques,
           coalesce(x.conversas, 0) conversas, coalesce(x.convenio, 0) convenio, coalesce(x.agendaram, 0) agendaram,
           coalesce(y.pacientes, 0) pacientes, coalesce(y.pacientes_novas, 0) pacientes_novas,
           coalesce(y.realizadas, 0) sessoes_realizadas, coalesce(y.futuras, 0) sessoes_agendadas,
           coalesce(y.receita_realizada, 0) receita_realizada, coalesce(y.receita_recebida, 0) receita_recebida,
           coalesce(y.receita_agendada, 0) receita_agendada
      FROM custo c
      FULL JOIN (SELECT pc.campanha_id, count(*) conversas, count(*) FILTER (WHERE pc.convenio) convenio,
                        count(*) FILTER (WHERE pc.resultado IN ('paciente', 'agendada')) agendaram
                   FROM por_conv pc GROUP BY 1) x ON x.campanha_id = c.campanha_id
      LEFT JOIN (SELECT cv.campanha_id, count(*) FILTER (WHERE pp.realizadas > 0) pacientes,
                        count(*) FILTER (WHERE pp.realizadas > 0 AND NOT pp.ja_era_paciente) pacientes_novas,
                        sum(pp.realizadas) realizadas, sum(pp.futuras) futuras,
                        sum(pp.receita_realizada) receita_realizada, sum(pp.receita_recebida) receita_recebida,
                        sum(pp.receita_agendada) receita_agendada
                   FROM por_pac pp JOIN conv2 cv ON cv.conversa_id = pp.conversa_id GROUP BY 1) y
             ON y.campanha_id = coalesce(c.campanha_id, x.campanha_id)
      LEFT JOIN nomes n ON n.campanha_id = coalesce(c.campanha_id, x.campanha_id)
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'ate', p_ate, 'plataforma', p_plataforma,
    'gerado_em', now(),
    'custo_ultimo_dia', (SELECT max(c.data) FROM public.atrib_custos_diarios c WHERE c.plataforma = p_plataforma),
    'campanhas', coalesce((SELECT jsonb_agg(to_jsonb(cp) ORDER BY cp.investimento DESC) FROM camp cp), '[]'::jsonb),
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paciente_id', pp.paciente_id, 'nome', pp.nome, 'conversa_id', pp.conversa_id,
               'campanha_id', cv.campanha_id, 'palavra_chave', cv.palavra_chave,
               'primeiro_contato', to_char(cv.primeira_msg, 'YYYY-MM-DD"T"HH24:MI'),
               'primeira_sessao', to_char(pp.primeira_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'proxima_sessao', to_char(pp.proxima_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'servico', pp.servico, 'ja_era_paciente', pp.ja_era_paciente,
               'sessoes_realizadas', pp.realizadas, 'sessoes_sem_baixa', pp.sem_baixa, 'faltas', pp.faltas,
               'sessoes_agendadas', pp.futuras,
               'receita_realizada', pp.receita_realizada, 'receita_recebida', pp.receita_recebida,
               'receita_agendada', pp.receita_agendada)
             ORDER BY cv.primeira_msg)
        FROM por_pac pp JOIN conv2 cv ON cv.conversa_id = pp.conversa_id), '[]'::jsonb),
    'conversas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversa_id', pc.conversa_id, 'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave,
               'pagina', pc.landing_path, 'vinculo', pc.vinculo,
               'primeira_msg', to_char(pc.primeira_msg, 'YYYY-MM-DD"T"HH24:MI'),
               'convenio', pc.convenio, 'resultado', pc.resultado, 'paciente_id', pc.paciente_id)
             ORDER BY pc.primeira_msg DESC)
        FROM por_conv pc), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text) IS
  'Retorno dos anúncios (admin): investimento, conversas, pacientes, sessões e receita realizada/recebida/agendada por campanha e por paciente. Ver supabase/migrations/atribuicao_v2_retorno_anuncios.sql.';
