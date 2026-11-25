-- Atribuição v2 — origem DECLARADA pela família + canal "Perfil do Google" (25/11/2026).
--
-- Por quê: no painel Retorno por canal, 96 conversas de contato novo (29 pacientes atendidas,
-- R$ 19.170) não têm origem: chamaram direto no WhatsApp, sem o código do site. Decisão
-- (revisão de 25/11): a Ju pergunta, de forma opcional e no momento certo, "como conheceu a
-- Respira Kids?", e a resposta fica guardada SEPARADA da origem técnica (rastreio).
--   - Origem técnica (atrib_toques: código RK ou regra de horário) nunca é sobrescrita.
--   - Origem declarada = relato; vai para atrib_origens_declaradas com a mensagem que serve de
--     evidência e a proveniência (fonte 'ju' = resposta captada pela Ju; 'humano' = equipe).
--   - A Ju NÃO usa fn_atrib_revisar (administrativa). Usa fn_ju_origem_declarada, só
--     service_role, que valida conversa, categoria e evidência.
--   - fn_ju_turno ganha perguntar_origem: contato novo, sem origem técnica, sem origem
--     declarada, sem a pergunta já feita e com a conversa já andando (2+ mensagens da família).
--     O momento exato fica com o prompt (depois da triagem/valor, nunca em gravidade).
-- Canal google_perfil: link com utm_source=google_business_profile (ou gbp / google_perfil)
-- deixa de cair em "outro". Vale para cliques novos (o canal é gravado no clique).
-- Painel: fn_atrib_retorno_canais devolve origem_declarada por conversa/paciente e o resumo
-- 'origens_declaradas' das conversas sem rastreio (relato, nunca somado aos canais técnicos).

-- ── 1. Tabela ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atrib_origens_declaradas (
  id              bigserial PRIMARY KEY,
  conversa_id     bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  oportunidade_id bigint REFERENCES public.atrib_oportunidades(id) ON DELETE SET NULL,
  categoria       text NOT NULL CHECK (categoria IN (
                    'indicacao_profissional', 'indicacao_conhecido', 'google_busca', 'google_maps',
                    'instagram', 'facebook', 'site', 'ja_conhecia', 'outro', 'nao_lembra')),
  detalhe         text CHECK (length(detalhe) <= 200),
  mensagem_id     bigint REFERENCES public.ju_mensagens(id) ON DELETE SET NULL,
  fonte           text NOT NULL CHECK (fonte IN ('ju', 'humano')),
  registrado_por  uuid,
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, fonte)
);
COMMENT ON TABLE public.atrib_origens_declaradas IS
  'Como a família DIZ que conheceu a clínica (relato). Separado da origem técnica (atrib_toques). Uma por conversa e fonte (ju | humano); humano vale mais.';
ALTER TABLE public.atrib_origens_declaradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atrib_origens_declaradas_admin_le ON public.atrib_origens_declaradas;
CREATE POLICY atrib_origens_declaradas_admin_le ON public.atrib_origens_declaradas
  FOR SELECT TO authenticated USING ((SELECT public.fn_atrib_pode_ver()));
REVOKE ALL ON public.atrib_origens_declaradas FROM anon;
GRANT SELECT ON public.atrib_origens_declaradas TO authenticated;

-- ── 2. Quando a Ju pode perguntar ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ju_perguntar_origem(p_conversa_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(public.fn_ju_contato_novo(p_conversa_id), false)
     AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = p_conversa_id)
     AND NOT EXISTS (SELECT 1 FROM public.atrib_origens_declaradas d WHERE d.conversa_id = p_conversa_id)
     AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens m
                      WHERE m.conversa_id = p_conversa_id AND m.origem IN ('JU', 'HUMANO')
                        AND m.conteudo ~* '(como|onde|por onde)[^?]{0,25}conhece|conheceu a respira|nos conheceu|ficou sabendo d[ao] (gente|cl[ií]nica|respira)')
     AND (SELECT count(*) FROM public.ju_mensagens m
           WHERE m.conversa_id = p_conversa_id AND m.origem = 'CLIENTE') >= 2
$$;
REVOKE ALL ON FUNCTION public.fn_ju_perguntar_origem(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_perguntar_origem(bigint) TO service_role;

-- ── 3. Registro pela Ju (marca [ORIGEM categoria: detalhe] na resposta) ───
CREATE OR REPLACE FUNCTION public.fn_ju_origem_declarada(p_conversa_id bigint, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cat text := lower(trim(split_part(coalesce(p_texto, ''), ':', 1)));
  v_det text := nullif(left(trim(substr(coalesce(p_texto, ''), length(split_part(coalesce(p_texto, ''), ':', 1)) + 2)), 200), '');
  v_msg bigint;
  v_op  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ju_conversas c WHERE c.id = p_conversa_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conversa_inexistente');
  END IF;
  IF v_cat NOT IN ('indicacao_profissional', 'indicacao_conhecido', 'google_busca', 'google_maps',
                   'instagram', 'facebook', 'site', 'ja_conhecia', 'outro', 'nao_lembra') THEN
    v_det := nullif(left(trim(coalesce(p_texto, '')), 200), '');
    v_cat := 'outro';
  END IF;
  -- evidência: a última mensagem da família nas últimas 2 h (a resposta à pergunta)
  SELECT m.id INTO v_msg FROM public.ju_mensagens m
   WHERE m.conversa_id = p_conversa_id AND m.origem = 'CLIENTE' AND m.created_at > now() - interval '2 hours'
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_mensagem_recente');
  END IF;
  SELECT o.id INTO v_op FROM public.atrib_oportunidades o
   WHERE o.conversa_id = p_conversa_id ORDER BY o.aberta_em DESC LIMIT 1;
  INSERT INTO public.atrib_origens_declaradas (conversa_id, oportunidade_id, categoria, detalhe, mensagem_id, fonte)
  VALUES (p_conversa_id, v_op, v_cat, v_det, v_msg, 'ju')
  ON CONFLICT (conversa_id, fonte) DO UPDATE
     SET categoria = excluded.categoria, detalhe = excluded.detalhe, mensagem_id = excluded.mensagem_id,
         oportunidade_id = excluded.oportunidade_id, registrado_em = now();
  RETURN jsonb_build_object('ok', true, 'categoria', v_cat);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.atrib_erros (etapa, referencia, detalhe) VALUES ('origem_declarada', p_conversa_id::text, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'motivo', 'erro');
END $$;
REVOKE ALL ON FUNCTION public.fn_ju_origem_declarada(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_origem_declarada(bigint, text) TO service_role;

-- ── 4. fn_ju_turno ganha perguntar_origem (troca pontual no corpo atual) ──
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure) INTO v_def;
  IF position('perguntar_origem' IN v_def) = 0 THEN
    IF position('''aviso_equipe_ja_dado'', public.fn_ju_aviso_equipe_dado(c.id),' IN v_def) = 0 THEN
      RAISE EXCEPTION 'fn_ju_turno mudou: ponto de inserção não encontrado';
    END IF;
    EXECUTE replace(v_def,
      '''aviso_equipe_ja_dado'', public.fn_ju_aviso_equipe_dado(c.id),',
      '''aviso_equipe_ja_dado'', public.fn_ju_aviso_equipe_dado(c.id),' || E'\n    ' ||
      '''perguntar_origem'', public.fn_ju_perguntar_origem(c.id),');
  END IF;
END $do$;

-- ── 5. Canal "Perfil do Google" ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_atrib_canal(p_source text, p_medium text, p_referrer text)
RETURNS TABLE(canal text, plataforma text) LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT CASE
           WHEN g THEN 'google_ads'
           WHEN mt THEN 'meta_ads'
           WHEN s IN ('google_business_profile', 'gbp', 'google_perfil', 'google_my_business', 'gmb') THEN 'google_perfil'
           WHEN s IN ('instagram','ig') THEN 'instagram'
           WHEN s IN ('facebook','fb','messenger','threads') THEN 'facebook'
           WHEN s <> '' THEN 'outro'
           WHEN r ~ '(^|\.)google\.' THEN 'google_organico'
           WHEN r ~ '(chatgpt|openai|perplexity|gemini|copilot|claude)' THEN 'ia_assistente'
           WHEN r ~ '(instagram|facebook)' THEN 'instagram'
           WHEN r = '' THEN 'direto'
           ELSE 'outro' END,
         CASE WHEN g THEN 'google_ads' WHEN mt THEN 'meta_ads' END
  FROM (
    SELECT s, r,
           s IN ('google','adwords','google_ads','googleads')
             AND m IN ('cpc','ppc','paid','paid_search','sem','search','display','cpm','pmax','video') AS g,
           s IN ('msg','an','audience_network')
             OR (s IN ('facebook','fb','instagram','ig','meta','messenger','threads')
                 AND m IN ('cpc','ppc','paid','paid_social','social_paid','paidsocial','ads','cpm','display','video')) AS mt
    FROM (SELECT lower(trim(coalesce(p_source, ''))) s, lower(trim(coalesce(p_medium, ''))) m,
                 lower(coalesce(p_referrer, '')) r) x
  ) y
$function$;

-- ── 6. Painel: origem declarada ao lado da técnica ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_atrib_retorno_canais(
  p_desde date,
  p_ate date,
  p_base text DEFAULT 'aquisicao'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_agora timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_atend boolean := (p_base = 'atendimento');
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
  prim AS (  -- 1º toque de cada conversa (primeira origem conhecida)
    SELECT DISTINCT ON (t.conversa_id)
           t.conversa_id, t.oportunidade_id, coalesce(t.canal, 'outro') canal, t.plataforma,
           t.campanha_id, t.palavra_chave, t.landing_path, t.vinculo,
           (t.mensagem_em AT TIME ZONE 'America/Sao_Paulo') entrada
      FROM public.atrib_toques t
     WHERE t.mensagem_em IS NOT NULL
     ORDER BY t.conversa_id, t.mensagem_em, t.id
  ),
  sem_toque AS (  -- contato novo que chegou sem código RK
    SELECT DISTINCT ON (o.conversa_id)
           o.conversa_id, o.id oportunidade_id, 'desconhecido'::text canal, NULL::text plataforma,
           NULL::text campanha_id, NULL::text palavra_chave, NULL::text landing_path, NULL::text vinculo,
           (o.aberta_em AT TIME ZONE 'America/Sao_Paulo') entrada
      FROM public.atrib_oportunidades o
     WHERE o.contato_novo
       AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = o.conversa_id)
     ORDER BY o.conversa_id, o.aberta_em
  ),
  todas AS (
    SELECT * FROM prim UNION ALL SELECT * FROM sem_toque
  ),
  conv0 AS (
    SELECT x.*, o.etapa_maxima, o.estado, o.motivo_perda,
           (SELECT d.categoria FROM public.atrib_origens_declaradas d WHERE d.conversa_id = x.conversa_id
             ORDER BY (d.fonte = 'humano') DESC, d.registrado_em DESC LIMIT 1) origem_declarada,
           EXISTS (SELECT 1 FROM public.atrib_sinais s WHERE s.conversa_id = x.conversa_id AND s.tipo = 'convenio') convenio
      FROM todas x
      LEFT JOIN public.atrib_oportunidades o ON o.id = x.oportunidade_id
     WHERE CASE WHEN v_atend THEN x.entrada::date <= p_ate
                ELSE x.entrada::date BETWEEN p_desde AND p_ate END
  ),
  descartadas AS (
    SELECT canal, count(*) n FROM conv0 WHERE estado = 'descartada' GROUP BY 1
  ),
  conv AS (SELECT * FROM conv0 WHERE coalesce(estado, '') <> 'descartada'),
  liga AS (  -- paciente ligada a cada conversa + 1ª sessão ligada + tipo do vínculo
    SELECT cv.conversa_id, a.paciente_id, min(a.data_hora) primeira_ligada, min(a.created_at) primeiro_agendamento,
           (array_agg(oa.tipo_vinculo ORDER BY oa.vinculado_em))[1] tipo_vinculo,
           (array_agg(oa.confianca ORDER BY oa.vinculado_em))[1] confianca
      FROM conv cv
      JOIN public.atrib_oportunidade_agendamentos oa ON oa.oportunidade_id = cv.oportunidade_id AND oa.removido_em IS NULL
      JOIN public.agendamentos a ON a.id = oa.agendamento_id
     GROUP BY 1, 2
  ),
  pac AS (  -- uma linha por paciente: vale a conversa mais antiga
    SELECT DISTINCT ON (l.paciente_id) l.*
      FROM liga l JOIN conv cv ON cv.conversa_id = l.conversa_id
     ORDER BY l.paciente_id, cv.entrada
  ),
  ult AS (  -- último toque antes do 1º agendamento ligado (ou até agora)
    SELECT DISTINCT ON (cv.conversa_id) cv.conversa_id, coalesce(t.canal, 'outro') canal
      FROM conv cv
      JOIN public.atrib_toques t ON t.conversa_id = cv.conversa_id
      LEFT JOIN pac p ON p.conversa_id = cv.conversa_id
     WHERE t.mensagem_em <= coalesce(p.primeiro_agendamento, now())
     ORDER BY cv.conversa_id, t.mensagem_em DESC, t.id DESC
  ),
  sess AS (
    SELECT p.paciente_id, (a.data_hora AT TIME ZONE 'UTC') dh,
           cs.codigo status, coalesce(a.valor_servico, 0) valor,
           ts.nome servico, pr.nome profissional, coalesce(r.receita_recebida, 0) recebida
      FROM pac p
      JOIN public.agendamentos a ON a.paciente_id = p.paciente_id AND a.ativo AND a.data_hora >= p.primeira_ligada
      LEFT JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
      LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
      LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id
      LEFT JOIN public.vw_atrib_receita_sessao r ON r.agendamento_id = a.id
     WHERE coalesce(cs.codigo, '') NOT IN ('cancelado', 'reagendado', 'erro')
       AND (NOT v_atend OR (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_desde AND p_ate)
  ),
  por_pac AS (
    SELECT p.paciente_id, p.conversa_id, p.tipo_vinculo, p.confianca, pe.nome,
           EXISTS (SELECT 1 FROM public.agendamentos a0
                    WHERE a0.paciente_id = p.paciente_id AND a0.ativo
                      AND (a0.created_at AT TIME ZONE 'America/Sao_Paulo') < cv.entrada) ja_era_paciente,
           min(s.dh) FILTER (WHERE s.dh <= v_agora AND s.status <> 'faltou') primeira_sessao,
           min(s.dh) FILTER (WHERE s.dh > v_agora) proxima_sessao,
           count(s.dh) FILTER (WHERE s.dh <= v_agora AND s.status IN ('finalizado', 'confirmado', 'agendado')) realizadas,
           count(s.dh) FILTER (WHERE s.dh <= v_agora AND s.status = 'faltou') faltas,
           count(s.dh) FILTER (WHERE s.dh > v_agora) futuras,
           coalesce(sum(s.valor) FILTER (WHERE s.dh <= v_agora), 0) receita_realizada,
           coalesce(sum(s.recebida), 0) receita_recebida,
           coalesce(sum(s.valor) FILTER (WHERE s.dh > v_agora), 0) receita_agendada,
           (array_agg(s.servico ORDER BY s.dh) FILTER (WHERE s.dh IS NOT NULL))[1] servico,
           (array_agg(s.profissional ORDER BY s.dh) FILTER (WHERE s.dh IS NOT NULL))[1] profissional
      FROM pac p
      JOIN conv cv ON cv.conversa_id = p.conversa_id
      LEFT JOIN public.pessoas pe ON pe.id = p.paciente_id
      LEFT JOIN sess s ON s.paciente_id = p.paciente_id
     GROUP BY p.paciente_id, p.conversa_id, p.tipo_vinculo, p.confianca, pe.nome, cv.entrada
  ),
  por_conv AS (
    SELECT cv.*, coalesce(u.canal, cv.canal) canal_ultima,
           pp.paciente_id, pp.realizadas, pp.futuras,
           CASE WHEN pp.realizadas > 0 THEN 'paciente'
                WHEN pp.futuras > 0 THEN 'agendada'
                WHEN pp.paciente_id IS NOT NULL THEN 'sem_sessao'
                WHEN cv.etapa_maxima = 'agendamento_solicitado' THEN 'pediu_horario'
                ELSE 'conversa' END resultado
      FROM conv cv
      LEFT JOIN ult u ON u.conversa_id = cv.conversa_id
      LEFT JOIN por_pac pp ON pp.conversa_id = cv.conversa_id
  ),
  custo AS (
    SELECT 'google_ads'::text canal, sum(c.custo) investimento, sum(c.cliques) cliques
      FROM public.atrib_custos_diarios c
     WHERE c.plataforma = 'google_ads' AND c.data BETWEEN p_desde AND p_ate
  ),
  canais AS (
    SELECT pc.canal,
           count(*) conversas,
           count(*) FILTER (WHERE pc.convenio) convenio,
           count(*) FILTER (WHERE pc.origem_declarada IS NOT NULL) com_origem_declarada,
           count(*) FILTER (WHERE pc.canal_ultima <> pc.canal) multicanal,
           count(*) FILTER (WHERE pc.resultado = 'pediu_horario') pediram_horario,
           count(*) FILTER (WHERE pc.resultado IN ('paciente', 'agendada')) agendaram,
           count(pp.paciente_id) FILTER (WHERE pp.realizadas > 0) atendidas,
           count(pp.paciente_id) FILTER (WHERE pp.realizadas > 0 AND NOT pp.ja_era_paciente) novas_atendidas,
           count(pp.paciente_id) FILTER (WHERE pp.receita_recebida > 0) pagantes,
           coalesce(sum(pp.realizadas), 0) sessoes_realizadas,
           coalesce(sum(pp.futuras), 0) sessoes_agendadas,
           coalesce(sum(pp.receita_realizada), 0) receita_realizada,
           coalesce(sum(pp.receita_recebida), 0) receita_recebida,
           coalesce(sum(pp.receita_agendada), 0) receita_agendada
      FROM por_conv pc
      LEFT JOIN por_pac pp ON pp.conversa_id = pc.conversa_id
     GROUP BY pc.canal
  )
  SELECT jsonb_build_object(
    'desde', p_desde, 'ate', p_ate, 'base', p_base, 'gerado_em', now(),
    'custo_ultimo_dia', (SELECT max(c.data) FROM public.atrib_custos_diarios c WHERE c.plataforma = 'google_ads'),
    'canais', coalesce((
      SELECT jsonb_agg(to_jsonb(k) || jsonb_build_object(
               'investimento', cu.investimento, 'cliques', cu.cliques,
               'descartadas', coalesce(d.n, 0))
             ORDER BY k.conversas DESC)
        FROM canais k
        LEFT JOIN custo cu ON cu.canal = k.canal
        LEFT JOIN descartadas d ON d.canal = k.canal), '[]'::jsonb),
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'paciente_id', pp.paciente_id, 'nome', pp.nome, 'conversa_id', pp.conversa_id,
               'canal', pc.canal, 'canal_ultima', pc.canal_ultima,
               'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave, 'pagina', pc.landing_path,
               'vinculo', pp.tipo_vinculo, 'confianca', pp.confianca, 'origem_declarada', pc.origem_declarada,
               'primeiro_contato', to_char(pc.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'primeira_sessao', to_char(pp.primeira_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'proxima_sessao', to_char(pp.proxima_sessao, 'YYYY-MM-DD"T"HH24:MI'),
               'servico', pp.servico, 'profissional', pp.profissional, 'ja_era_paciente', pp.ja_era_paciente,
               'sessoes_realizadas', pp.realizadas, 'faltas', pp.faltas, 'sessoes_agendadas', pp.futuras,
               'receita_realizada', pp.receita_realizada, 'receita_recebida', pp.receita_recebida,
               'receita_agendada', pp.receita_agendada)
             ORDER BY pc.entrada)
        FROM por_pac pp JOIN por_conv pc ON pc.conversa_id = pp.conversa_id
       WHERE NOT v_atend OR pp.realizadas + pp.faltas + pp.futuras > 0), '[]'::jsonb),
    'conversas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversa_id', pc.conversa_id, 'canal', pc.canal, 'canal_ultima', pc.canal_ultima,
               'campanha_id', pc.campanha_id, 'palavra_chave', pc.palavra_chave, 'pagina', pc.landing_path,
               'vinculo', pc.vinculo, 'entrada', to_char(pc.entrada, 'YYYY-MM-DD"T"HH24:MI'),
               'convenio', pc.convenio, 'resultado', pc.resultado, 'paciente_id', pc.paciente_id,
               'origem_declarada', pc.origem_declarada)
             ORDER BY pc.entrada DESC)
        FROM por_conv pc), '[]'::jsonb),
    'origens_declaradas', coalesce((  -- o que as famílias SEM rastreio disseram (relato, não rastreio)
      SELECT jsonb_agg(jsonb_build_object('categoria', z.categoria, 'conversas', z.conversas, 'agendaram', z.agendaram,
               'atendidas', z.atendidas, 'receita_realizada', z.receita_realizada) ORDER BY z.conversas DESC)
        FROM (SELECT pc.origem_declarada categoria, count(*) conversas,
                     count(*) FILTER (WHERE pc.resultado IN ('paciente', 'agendada')) agendaram,
                     count(pp.paciente_id) FILTER (WHERE pp.realizadas > 0) atendidas,
                     coalesce(sum(pp.receita_realizada), 0) receita_realizada
                FROM por_conv pc LEFT JOIN por_pac pp ON pp.conversa_id = pc.conversa_id
               WHERE pc.canal = 'desconhecido' AND pc.origem_declarada IS NOT NULL
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

REVOKE ALL ON FUNCTION public.fn_atrib_retorno_canais(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_retorno_canais(date, date, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_atrib_retorno_canais(date, date, text) IS
  'Retorno por canal (admin): conversas de contato novo por canal (1ª e última origem; sem código = desconhecido), agendaram, atendidas, pagantes, sessões e receita realizada/recebida/agendada; base aquisição (coorte) ou atendimento (sessões do período). Ver supabase/migrations/atribuicao_v2_retorno_canais.sql.';
