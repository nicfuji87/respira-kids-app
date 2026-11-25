-- Marketing P0, parte 2 (25/11/2026): Retorno por canal e dos anúncios na base única + alerta de convênio.
-- Depende de atribuicao_v2_p0_base.sql. Aplicar junto com o front do PR (o formato do retorno mudou:
-- resultado 'a_conferir', canal 'nao_atribuido', presença por paciente).

-- ── 4b. Painel antigo: mesma regra de "a família veio da conversa" ─────────
-- vw_atrib_aquisicoes só aceitava o vínculo se o agendamento tivesse sido CRIADO antes da
-- 1ª sessão, comparando created_at (UTC de verdade) com data_hora (hora de parede gravada
-- como UTC): quem marcava e era atendido no mesmo dia, ou tinha a sessão lançada na agenda
-- depois, caía em "sem vínculo" (17 de 86 ligados em out–nov). Regra nova, igual à da base
-- única (interno.fn_atrib_pacientes): vale o vínculo se a conversa abriu ANTES da 1ª sessão
-- realizada (confirmada ou provável). Testado em 25/11/2026: com ela, os pacientes novos
-- confirmados batem canal por canal nas duas bases (Google Ads 5, Instagram 8, direto 1,
-- Google orgânico 1). A versão anterior fica em interno.vw_atrib_aquisicoes_v1 para
-- comparação até a conciliação ser aprovada.
DO $troca$
DECLARE
  d  text := pg_get_viewdef('public.vw_atrib_aquisicoes'::regclass);
  d2 text;
BEGIN
  IF to_regclass('interno.vw_atrib_aquisicoes_v1') IS NULL THEN
    EXECUTE 'CREATE VIEW interno.vw_atrib_aquisicoes_v1 AS ' || d;
    EXECUTE 'REVOKE ALL ON interno.vw_atrib_aquisicoes_v1 FROM PUBLIC, anon, authenticated';
    EXECUTE $c$COMMENT ON VIEW interno.vw_atrib_aquisicoes_v1 IS 'Cópia de vw_atrib_aquisicoes antes do P0 (25/11/2026), só para comparação. Apagar depois da conciliação aprovada.'$c$;
  END IF;
  d2 := replace(d, '(a.created_at <= p_1.aquisicao_em)', 'true');
  d2 := replace(d2, '((oa.agendamento_id = a.agendamento_id) AND (oa.removido_em IS NULL))',
    '((oa.agendamento_id = a.agendamento_id) AND (oa.removido_em IS NULL) AND (( SELECT (o0.aberta_em AT TIME ZONE ''America/Sao_Paulo'') FROM atrib_oportunidades o0 WHERE (o0.id = oa.oportunidade_id)) <= (p_1.aquisicao_em AT TIME ZONE ''UTC'')))');
  IF position('o0.aberta_em' IN d2) = 0 OR position('a.created_at <= p_1' IN d2) > 0 THEN
    RAISE EXCEPTION 'vw_atrib_aquisicoes mudou: revise a troca da regra do vínculo';
  END IF;
  -- security_invoker mantém a RLS de quem consulta (só admin vê dado).
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_atrib_aquisicoes WITH (security_invoker = true) AS ' || d2;
END
$troca$;

-- ── 5. Retorno por canal (com filtros de verdade) ─────────────────────────
DROP FUNCTION IF EXISTS public.fn_atrib_retorno_canais(date, date, text);
CREATE OR REPLACE FUNCTION public.fn_atrib_retorno_canais(
  p_desde date,
  p_ate date,
  p_base text DEFAULT 'aquisicao',
  p_canal text DEFAULT NULL,      -- código do canal ou 'tipo:pago|organico|sem_origem'
  p_campanha text DEFAULT NULL,   -- campanha_id (só Google Ads tem)
  p_servico text DEFAULT NULL     -- serviço do 1º atendimento (sem sufixo DU/FDS)
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_serv boolean := nullif(p_servico, 'todos') IS NOT NULL;
  v_camp text := nullif(p_campanha, 'todas');
  v_out jsonb;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_ate IS NULL OR p_ate < p_desde THEN
    RAISE EXCEPTION 'período inválido';
  END IF;
  IF p_base NOT IN ('aquisicao', 'atendimento') THEN
    RAISE EXCEPTION 'base inválida';
  END IF;

  WITH
  conv0 AS (
    SELECT c.* FROM interno.fn_atrib_conversas(p_desde, p_ate, p_base) c
     WHERE interno.fn_atrib_canal_ok(c.canal, p_canal)
       AND (v_camp IS NULL OR c.campanha_id = v_camp)
  ),
  descartadas AS (SELECT canal, count(*) n FROM conv0 WHERE estado = 'descartada' GROUP BY 1),
  conv1 AS (SELECT * FROM conv0 WHERE coalesce(estado, '') <> 'descartada'),
  pac AS (  -- pacientes do recorte (o serviço filtra aqui)
    SELECT p.* FROM interno.fn_atrib_pacientes(p_desde, p_ate, p_base) p
      JOIN conv1 c ON c.conversa_id = p.conversa_id
     WHERE NOT v_serv OR p.servico = p_servico
  ),
  conv AS (  -- com serviço, só conversas que levaram a uma paciente daquele serviço
    SELECT c.* FROM conv1 c
     WHERE NOT v_serv OR EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = c.conversa_id)
  ),
  ult AS (  -- último toque antes do 1º agendamento ligado (ou até agora)
    SELECT DISTINCT ON (cv.conversa_id) cv.conversa_id, coalesce(t.canal, 'outro') canal
      FROM conv cv
      JOIN public.atrib_toques t ON t.conversa_id = cv.conversa_id
     WHERE t.mensagem_em <= coalesce((SELECT min(p.primeiro_agendamento) FROM pac p
                                       WHERE p.conversa_id = cv.conversa_id), now())
     ORDER BY cv.conversa_id, t.mensagem_em DESC, t.id DESC
  ),
  por_conv AS (  -- uma linha por conversa, mesmo com irmãos
    SELECT cv.*, coalesce(u.canal, cv.canal) canal_ultima,
           (SELECT min(p.paciente_id::text)::uuid FROM pac p WHERE p.conversa_id = cv.conversa_id) paciente_id,
           CASE WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca = 'confirmada') THEN 'paciente'
                WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca IN ('provavel', 'pendente')) THEN 'a_conferir'
                WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca = 'agendada') THEN 'agendada'
                WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id) THEN 'sem_sessao'
                WHEN cv.etapa_maxima = 'agendamento_solicitado' THEN 'pediu_horario'
                ELSE 'conversa' END resultado
      FROM conv cv
      LEFT JOIN ult u ON u.conversa_id = cv.conversa_id
  ),
  custo AS (
    SELECT 'google_ads'::text canal, sum(c.custo) investimento, sum(c.cliques) cliques
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = 'google_ads' AND c.data BETWEEN p_desde AND p_ate
       AND (v_camp IS NULL OR c.campanha_id = v_camp)
  ),
  k_conv AS (
    SELECT pc.canal, count(*) conversas,
           count(*) FILTER (WHERE pc.convenio) convenio,
           count(*) FILTER (WHERE pc.origem_declarada IS NOT NULL) com_origem_declarada,
           count(*) FILTER (WHERE pc.canal_ultima <> pc.canal) multicanal,
           count(*) FILTER (WHERE pc.resultado = 'pediu_horario') pediram_horario,
           count(*) FILTER (WHERE pc.resultado IN ('paciente', 'a_conferir', 'agendada')) agendaram
      FROM por_conv pc GROUP BY 1
  ),
  k_pac AS (
    SELECT c.canal,
           count(*) FILTER (WHERE p.presenca = 'confirmada') atendidas,
           count(*) FILTER (WHERE p.presenca = 'confirmada' AND NOT p.ja_era_paciente) novas_atendidas,
           count(*) FILTER (WHERE p.presenca = 'provavel') atendidas_provaveis,
           count(*) FILTER (WHERE p.presenca = 'provavel' AND NOT p.ja_era_paciente) novas_provaveis,
           count(*) FILTER (WHERE p.presenca = 'pendente') presenca_pendente,
           count(*) FILTER (WHERE p.receita_recebida > 0) pagantes,
           sum(p.confirmadas) sessoes_realizadas, sum(p.provaveis) sessoes_provaveis,
           sum(p.pendentes) sessoes_pendentes, sum(p.faltas) faltas, sum(p.futuras) sessoes_agendadas,
           sum(p.receita_realizada) receita_realizada, sum(p.receita_a_conferir) receita_a_conferir,
           sum(p.receita_recebida) receita_recebida, sum(p.receita_agendada) receita_agendada
      FROM pac p JOIN conv c ON c.conversa_id = p.conversa_id
     GROUP BY 1
  ),
  canais AS (
    SELECT kc.canal,
           -- Com filtro de serviço a conversa não se divide por serviço: indisponível.
           CASE WHEN v_serv THEN NULL ELSE kc.conversas END conversas,
           CASE WHEN v_serv THEN NULL ELSE kc.convenio END convenio,
           kc.multicanal, kc.com_origem_declarada,
           CASE WHEN v_serv THEN NULL ELSE kc.pediram_horario END pediram_horario,
           kc.agendaram,
           coalesce(kp.atendidas, 0) atendidas, coalesce(kp.novas_atendidas, 0) novas_atendidas,
           coalesce(kp.atendidas_provaveis, 0) atendidas_provaveis, coalesce(kp.novas_provaveis, 0) novas_provaveis,
           coalesce(kp.presenca_pendente, 0) presenca_pendente, coalesce(kp.pagantes, 0) pagantes,
           coalesce(kp.sessoes_realizadas, 0) sessoes_realizadas, coalesce(kp.sessoes_provaveis, 0) sessoes_provaveis,
           coalesce(kp.sessoes_pendentes, 0) sessoes_pendentes, coalesce(kp.faltas, 0) faltas,
           coalesce(kp.sessoes_agendadas, 0) sessoes_agendadas,
           coalesce(kp.receita_realizada, 0) receita_realizada, coalesce(kp.receita_a_conferir, 0) receita_a_conferir,
           coalesce(kp.receita_recebida, 0) receita_recebida, coalesce(kp.receita_agendada, 0) receita_agendada
      FROM k_conv kc LEFT JOIN k_pac kp ON kp.canal = kc.canal
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'ate', p_ate, 'base', p_base, 'gerado_em', now(),
    'recorte', jsonb_build_object('canal', p_canal, 'campanha', v_camp, 'servico', nullif(p_servico, 'todos')),
    'custo_ultimo_dia', (SELECT max(c.data) FROM public.atrib_custos_diarios c WHERE c.plataforma = 'google_ads'),
    'canais', coalesce((
      SELECT jsonb_agg(to_jsonb(k) || jsonb_build_object(
               -- Investimento não se divide por serviço: nulo + aviso no painel.
               'investimento', CASE WHEN v_serv THEN NULL ELSE cu.investimento END,
               'cliques', CASE WHEN v_serv THEN NULL ELSE cu.cliques END,
               'descartadas', coalesce(d.n, 0))
             ORDER BY k.agendaram DESC, k.conversas DESC NULLS LAST)
        FROM canais k
        LEFT JOIN custo cu ON cu.canal = k.canal
        LEFT JOIN descartadas d ON d.canal = k.canal), '[]'::jsonb),
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paciente_id', pp.paciente_id, 'nome', pp.nome, 'conversa_id', pp.conversa_id,
               'canal', pc.canal, 'canal_ultima', pc.canal_ultima,
               'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave, 'pagina', pc.landing_path,
               'vinculo', pp.tipo_vinculo, 'confianca', pp.confianca, 'origem_declarada', pc.origem_declarada,
               'presenca', pp.presenca,
               'primeiro_contato', to_char(pc.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'primeira_sessao', to_char(pp.primeira_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'proxima_sessao', to_char(pp.proxima_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'servico', pp.servico, 'profissional', pp.profissional, 'ja_era_paciente', pp.ja_era_paciente,
               'sessoes_realizadas', pp.confirmadas, 'sessoes_provaveis', pp.provaveis,
               'sessoes_pendentes', pp.pendentes, 'faltas', pp.faltas, 'sessoes_agendadas', pp.futuras,
               'receita_realizada', pp.receita_realizada, 'receita_a_conferir', pp.receita_a_conferir,
               'receita_recebida', pp.receita_recebida, 'receita_agendada', pp.receita_agendada)
             ORDER BY pc.entrada)
        FROM pac pp JOIN por_conv pc ON pc.conversa_id = pp.conversa_id
       WHERE p_base <> 'atendimento' OR pp.presenca <> 'sem_sessao'), '[]'::jsonb),
    'conversas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversa_id', pc.conversa_id, 'canal', pc.canal, 'canal_ultima', pc.canal_ultima,
               'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave, 'pagina', pc.landing_path,
               'vinculo', pc.vinculo, 'entrada', to_char(pc.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'convenio', pc.convenio, 'resultado', pc.resultado, 'paciente_id', pc.paciente_id,
               'origem_declarada', pc.origem_declarada)
             ORDER BY pc.entrada DESC)
        FROM por_conv pc), '[]'::jsonb),
    'origens_declaradas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('categoria', z.categoria, 'conversas', z.conversas, 'agendaram', z.agendaram,
               'atendidas', z.atendidas, 'receita_realizada', z.receita_realizada) ORDER BY z.conversas DESC)
        FROM (SELECT pc.origem_declarada categoria, count(DISTINCT pc.conversa_id) conversas,
                     count(DISTINCT pc.conversa_id) FILTER (WHERE pc.resultado IN ('paciente', 'a_conferir', 'agendada')) agendaram,
                     count(pp.paciente_id) FILTER (WHERE pp.presenca = 'confirmada') atendidas,
                     coalesce(sum(pp.receita_realizada), 0) receita_realizada
                FROM por_conv pc LEFT JOIN pac pp ON pp.conversa_id = pc.conversa_id
               WHERE pc.canal = 'nao_atribuido' AND pc.origem_declarada IS NOT NULL
               GROUP BY 1) z), '[]'::jsonb),
    'vinculos_manuais', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversa_id', pc.conversa_id, 'canal', pc.canal, 'paciente', pe.nome,
               'vinculado_em', to_char(oa.vinculado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'),
               'vinculado_por', vp.nome, 'motivo', oa.motivo)
             ORDER BY oa.vinculado_em DESC)
        FROM por_conv pc
        JOIN public.atrib_oportunidade_agendamentos oa ON oa.oportunidade_id = pc.oportunidade_id
             AND oa.removido_em IS NULL AND oa.tipo_vinculo = 'humano'
        JOIN public.agendamentos a ON a.id = oa.agendamento_id
        LEFT JOIN public.pessoas pe ON pe.id = a.paciente_id
        LEFT JOIN public.pessoas vp ON vp.id = oa.vinculado_por), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_atrib_retorno_canais(date, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_retorno_canais(date, date, text, text, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_atrib_retorno_canais(date, date, text, text, text, text) IS
  'Retorno por canal (admin), cálculo único do Marketing: conversas de contato novo por canal (1ª origem), pacientes com presença confirmada/provável/pendente (fn_atrib_presenca) e receita realizada/a conferir/recebida/agendada. Filtros de canal, campanha e serviço valem para os totais. Ver atribuicao_v2_p0_calculo_unico.sql.';

-- ── 6. Retorno dos anúncios: mesma base, agrupado por campanha ────────────
-- Antes: 1º toque DA PLATAFORMA na conversa. Agora: 1ª origem da conversa (igual ao
-- Retorno por canal), para o Google Ads não somar conversas que vieram de outro canal.
DROP FUNCTION IF EXISTS public.fn_atrib_retorno_anuncios(date, date, text);
CREATE OR REPLACE FUNCTION public.fn_atrib_retorno_anuncios(
  p_desde date,
  p_ate date,
  p_plataforma text DEFAULT 'google_ads',
  p_campanha text DEFAULT NULL,
  p_servico text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_serv boolean := nullif(p_servico, 'todos') IS NOT NULL;
  v_camp text := nullif(p_campanha, 'todas');
  v_out jsonb;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_ate IS NULL OR p_ate < p_desde THEN
    RAISE EXCEPTION 'período inválido';
  END IF;

  WITH
  nomes AS (
    SELECT DISTINCT ON (c.campanha_id) c.campanha_id, c.campanha_nome
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = p_plataforma AND c.campanha_nome IS NOT NULL
     ORDER BY c.campanha_id, c.data DESC
  ),
  custo AS (
    SELECT c.campanha_id, sum(c.custo) investimento, sum(c.impressoes) impressoes, sum(c.cliques) cliques
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = p_plataforma AND c.data BETWEEN p_desde AND p_ate
       AND (v_camp IS NULL OR c.campanha_id = v_camp)
     GROUP BY 1
  ),
  conv1 AS (
    SELECT c.* FROM interno.fn_atrib_conversas(p_desde, p_ate, 'aquisicao') c
     WHERE c.plataforma = p_plataforma AND coalesce(c.estado, '') <> 'descartada'
       AND (v_camp IS NULL OR c.campanha_id = v_camp)
  ),
  pac AS (
    SELECT p.* FROM interno.fn_atrib_pacientes(p_desde, p_ate, 'aquisicao') p
      JOIN conv1 c ON c.conversa_id = p.conversa_id
     WHERE NOT v_serv OR p.servico = p_servico
  ),
  conv AS (
    SELECT c.* FROM conv1 c
     WHERE NOT v_serv OR EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = c.conversa_id)
  ),
  por_conv AS (
    SELECT cv.*,
           (SELECT min(p.paciente_id::text)::uuid FROM pac p WHERE p.conversa_id = cv.conversa_id) paciente_id,
           CASE WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca = 'confirmada') THEN 'paciente'
                WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca IN ('provavel', 'pendente')) THEN 'a_conferir'
                WHEN EXISTS (SELECT 1 FROM pac p WHERE p.conversa_id = cv.conversa_id AND p.presenca = 'agendada') THEN 'agendada'
                WHEN cv.etapa_maxima = 'agendamento_solicitado' THEN 'pediu_horario'
                ELSE 'conversa' END resultado
      FROM conv cv
  ),
  camp AS (
    SELECT coalesce(c.campanha_id, x.campanha_id) campanha_id,
           coalesce(n.campanha_nome, coalesce(c.campanha_id, x.campanha_id)) nome,
           CASE WHEN v_serv THEN NULL ELSE coalesce(c.investimento, 0) END investimento,
           CASE WHEN v_serv THEN NULL ELSE coalesce(c.impressoes, 0) END impressoes,
           CASE WHEN v_serv THEN NULL ELSE coalesce(c.cliques, 0) END cliques,
           CASE WHEN v_serv THEN NULL ELSE coalesce(x.conversas, 0) END conversas,
           CASE WHEN v_serv THEN NULL ELSE coalesce(x.convenio, 0) END convenio,
           coalesce(x.agendaram, 0) agendaram,
           coalesce(y.pacientes, 0) pacientes, coalesce(y.pacientes_novas, 0) pacientes_novas,
           coalesce(y.pacientes_provaveis, 0) pacientes_provaveis, coalesce(y.novas_provaveis, 0) novas_provaveis,
           coalesce(y.realizadas, 0) sessoes_realizadas, coalesce(y.provaveis, 0) sessoes_provaveis,
           coalesce(y.pendentes, 0) sessoes_pendentes, coalesce(y.futuras, 0) sessoes_agendadas,
           coalesce(y.receita_realizada, 0) receita_realizada, coalesce(y.receita_a_conferir, 0) receita_a_conferir,
           coalesce(y.receita_recebida, 0) receita_recebida, coalesce(y.receita_agendada, 0) receita_agendada
      FROM custo c
      FULL JOIN (SELECT pc.campanha_id, count(*) conversas, count(*) FILTER (WHERE pc.convenio) convenio,
                        count(*) FILTER (WHERE pc.resultado IN ('paciente', 'a_conferir', 'agendada')) agendaram
                   FROM por_conv pc GROUP BY 1) x ON x.campanha_id = c.campanha_id
      LEFT JOIN (SELECT cv.campanha_id,
                        count(*) FILTER (WHERE pp.presenca = 'confirmada') pacientes,
                        count(*) FILTER (WHERE pp.presenca = 'confirmada' AND NOT pp.ja_era_paciente) pacientes_novas,
                        count(*) FILTER (WHERE pp.presenca = 'provavel') pacientes_provaveis,
                        count(*) FILTER (WHERE pp.presenca = 'provavel' AND NOT pp.ja_era_paciente) novas_provaveis,
                        sum(pp.confirmadas) realizadas, sum(pp.provaveis) provaveis, sum(pp.pendentes) pendentes,
                        sum(pp.futuras) futuras,
                        sum(pp.receita_realizada) receita_realizada, sum(pp.receita_a_conferir) receita_a_conferir,
                        sum(pp.receita_recebida) receita_recebida, sum(pp.receita_agendada) receita_agendada
                   FROM pac pp JOIN conv cv ON cv.conversa_id = pp.conversa_id GROUP BY 1) y
             ON y.campanha_id = coalesce(c.campanha_id, x.campanha_id)
      LEFT JOIN nomes n ON n.campanha_id = coalesce(c.campanha_id, x.campanha_id)
     WHERE NOT v_serv OR y.campanha_id IS NOT NULL OR x.campanha_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'ate', p_ate, 'plataforma', p_plataforma, 'gerado_em', now(),
    'recorte', jsonb_build_object('campanha', v_camp, 'servico', nullif(p_servico, 'todos')),
    'custo_ultimo_dia', (SELECT max(c.data) FROM public.atrib_custos_diarios c WHERE c.plataforma = p_plataforma),
    'campanhas', coalesce((SELECT jsonb_agg(to_jsonb(cp) ORDER BY cp.investimento DESC NULLS LAST, cp.agendaram DESC) FROM camp cp), '[]'::jsonb),
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paciente_id', pp.paciente_id, 'nome', pp.nome, 'conversa_id', pp.conversa_id,
               'campanha_id', cv.campanha_id, 'palavra_chave', cv.palavra_chave, 'presenca', pp.presenca,
               'vinculo', pp.tipo_vinculo,
               'primeiro_contato', to_char(cv.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'primeira_sessao', to_char(pp.primeira_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'proxima_sessao', to_char(pp.proxima_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'servico', pp.servico, 'ja_era_paciente', pp.ja_era_paciente,
               'sessoes_realizadas', pp.confirmadas, 'sessoes_provaveis', pp.provaveis,
               'sessoes_pendentes', pp.pendentes,
               'sessoes_sem_baixa', pp.provaveis + pp.pendentes, 'faltas', pp.faltas,
               'sessoes_agendadas', pp.futuras,
               'receita_realizada', pp.receita_realizada, 'receita_a_conferir', pp.receita_a_conferir,
               'receita_recebida', pp.receita_recebida, 'receita_agendada', pp.receita_agendada)
             ORDER BY cv.entrada)
        FROM pac pp JOIN conv cv ON cv.conversa_id = pp.conversa_id), '[]'::jsonb),
    'conversas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversa_id', pc.conversa_id, 'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave,
               'pagina', pc.landing_path, 'vinculo', pc.vinculo,
               'primeira_msg', to_char(pc.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'convenio', pc.convenio, 'resultado', pc.resultado, 'paciente_id', pc.paciente_id)
             ORDER BY pc.entrada DESC)
        FROM por_conv pc), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_atrib_retorno_anuncios(date, date, text, text, text) IS
  'Retorno dos anúncios (admin): mesma base do Retorno por canal (interno.fn_atrib_conversas/fn_atrib_pacientes), agrupada por campanha. Presença confirmada/provável/pendente; receita realizada/a conferir/recebida/agendada. Ver atribuicao_v2_p0_calculo_unico.sql.';

-- ── 7. Convênio: diagnóstico, não recomendação de negativa ────────────────
-- Negar operadoras só com evidência nos termos de pesquisa (gasto em buscas com nome de
-- operadora). Sem isso, a diferença de agendamento é sobre a conversa (atendimento
-- particular pouco claro, reembolso), não sobre a busca. Mesma regra em
-- src/lib/marketing-otimizacao.ts (resumoConvenio) — mudou aqui, mude lá.
CREATE OR REPLACE FUNCTION public.fn_atrib_alerta_convenio()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  d jsonb := public.fn_atrib_otimizacao((now() - interval '60 days')::date, current_date);
  c_n int; c_ag int; o_n int; o_ag int; t_c numeric; t_o numeric; rec text; texto text;
  custo_conv numeric := coalesce((d->'termos_convenio'->>'custo')::numeric, 0);
  termos_conv int := coalesce((d->'termos_convenio'->>'termos')::int, 0);
BEGIN
  SELECT coalesce(sum((x->>'conversas')::int) FILTER (WHERE (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'agendaram')::int) FILTER (WHERE (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'conversas')::int) FILTER (WHERE NOT (x->>'citou')::boolean), 0),
         coalesce(sum((x->>'agendaram')::int) FILTER (WHERE NOT (x->>'citou')::boolean), 0)
    INTO c_n, c_ag, o_n, o_ag
    FROM jsonb_array_elements(d->'convenio') x WHERE x->>'recorte' = 'pago';
  t_c := CASE WHEN c_n > 0 THEN c_ag::numeric / c_n END;
  t_o := CASE WHEN o_n > 0 THEN o_ag::numeric / o_n END;
  rec := CASE WHEN c_n < 10 THEN 'amostra_insuficiente'
              WHEN t_o IS NULL OR t_c >= 0.5 * t_o THEN 'manter'
              WHEN custo_conv > 0 THEN 'revisar_termos'   -- há busca paga com operadora: evidência
              ELSE 'investigar_conversa' END;              -- sem busca com operadora: é a conversa

  IF rec = 'amostra_insuficiente' THEN
    RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n);
  END IF;
  -- Não repetir a mesma recomendação em menos de 7 dias.
  IF EXISTS (SELECT 1 FROM public.ju_avisos_grupo a WHERE a.origem = 'MARKETING_CONVENIO'
              AND a.created_at > now() - interval '7 days' AND a.texto LIKE '%(' || rec || ')%') THEN
    RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n, 'avisado', false);
  END IF;

  texto := '📊 *Google Ads · convênio* (últimos 60 dias, contatos vindos de anúncio)' || E'\n\n' ||
    c_n || ' citaram convênio, plano ou reembolso: ' || c_ag || ' agendaram (' || round(100 * coalesce(t_c, 0)) || '%).' || E'\n' ||
    o_n || ' não citaram: ' || o_ag || ' agendaram (' || round(100 * coalesce(t_o, 0)) || '%).' || E'\n' ||
    'Gasto em buscas com nome de operadora: R$ ' || to_char(custo_conv, 'FM999G990D00') ||
    ' (' || termos_conv || ' termo(s))' || E'\n\n' ||
    CASE rec
      WHEN 'revisar_termos' THEN 'Diagnóstico: quem cita convênio agenda menos e há gasto em buscas com nome de operadora. Revise esses termos em Marketing → Otimização antes de negativar.'
      WHEN 'investigar_conversa' THEN 'Diagnóstico: quem cita convênio agenda menos, mas não há gasto em buscas com nome de operadora. Negativar operadoras não resolve. Revise como o atendimento particular aparece no anúncio e na página, e os motivos de perda (quem precisa do plano × quem só pergunta de reembolso).'
      ELSE 'Diagnóstico: quem cita convênio agenda em ritmo parecido com os demais. Nada a mudar.'
    END || E'\n' || 'Detalhes em Marketing → Otimização. (' || rec || ')';

  INSERT INTO public.ju_avisos_grupo (texto, origem, destino)
  VALUES (texto, 'MARKETING_CONVENIO', '5561981446666@s.whatsapp.net');
  RETURN jsonb_build_object('recomendacao', rec, 'citaram', c_n, 'avisado', true);
END $function$;
REVOKE ALL ON FUNCTION public.fn_atrib_alerta_convenio() FROM PUBLIC, anon, authenticated;
