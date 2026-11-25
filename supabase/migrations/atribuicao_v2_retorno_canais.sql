-- Atribuição v2 — Retorno por canal (aba Marketing → Retorno por canal).
--
-- Evolução do "Retorno dos anúncios" (fn_atrib_retorno_anuncios, que continua igual e alimenta
-- o detalhe do Google Ads). Pergunta (revisão de 25/11/2026): quais canais trazem pacientes
-- novos, quanto rendem e onde perdemos oportunidades.
--
-- Unidade: CONVERSA de contato novo (não clique). Um clique gera um código RK; a conversa é a
-- mesma regra do painel de anúncios (atrib_toques), então o Google Ads bate com o painel atual.
--   - canal = canal do 1º toque da conversa (primeira origem conhecida);
--   - canal_ultima = canal do último toque antes do 1º agendamento ligado (ou até agora);
--     hoje (25/11) nenhuma conversa tem dois canais, então as duas coincidem;
--   - conversa de contato novo SEM toque = 'desconhecido' (chamou direto no WhatsApp,
--     indicação, perfil do Google...). Nunca é empurrada para um canal.
--   - oportunidade 'descartada' (não comercial, já paciente) fica fora e é contada à parte.
-- Paciente: contado UMA vez, na conversa mais antiga que levou a ela (sem dupla contagem).
-- agendou = tem sessão ligada (passada ou futura); atendida = ao menos 1 sessão realizada;
-- pagante = receita recebida > 0. Receita: mesmos critérios de fn_atrib_retorno_anuncios
-- (realizada pelo valor da agenda, recebida pelas faturas pagas, agendada = futuras).
-- p_base: 'aquisicao' = conversas que começaram no período e tudo que renderam até hoje
--         (coorte); 'atendimento' = sessões que aconteceram no período, de pacientes que
--         chegaram até o fim dele (receita do mês).
-- Custo: só Google Ads tem custo importado; os outros canais vêm com custo nulo
-- ("sem custo de mídia informado", não "CAC zero").
-- data_hora é hora de parede (gravada como UTC): comparar com now() em São Paulo.
-- Só admin (fn_atrib_rpc_ok).

-- Auditoria do vínculo manual (quem ligou, quando e por quê).
ALTER TABLE public.atrib_oportunidade_agendamentos
  ADD COLUMN IF NOT EXISTS vinculado_por uuid,
  ADD COLUMN IF NOT EXISTS motivo text;
COMMENT ON COLUMN public.atrib_oportunidade_agendamentos.vinculado_por IS 'pessoas.id de quem fez o vínculo manual (tipo_vinculo = humano); nulo = feito pelo sistema ou pelo desenvolvedor.';
COMMENT ON COLUMN public.atrib_oportunidade_agendamentos.motivo IS 'Por que o vínculo manual foi feito (evidência).';

UPDATE public.atrib_oportunidade_agendamentos
   SET motivo = 'Vínculo manual em 25/11/2026 (desenvolvimento): o pai veio pelo anúncio "plagiocefalia bebê" em 18/11, a equipe reservou 26/11 15h com a Bruna e em 19/11 10h08 ele mandou o nome da criança; o agendamento foi criado às 10h11 no cadastro com o telefone da mãe.'
 WHERE oportunidade_id = 408 AND agendamento_id = 'f62726fd-6ad2-4202-8672-b2a08a30f3f1' AND motivo IS NULL;

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
               'vinculo', pp.tipo_vinculo, 'confianca', pp.confianca,
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
               'convenio', pc.convenio, 'resultado', pc.resultado, 'paciente_id', pc.paciente_id)
             ORDER BY pc.entrada DESC)
        FROM por_conv pc), '[]'::jsonb),
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
