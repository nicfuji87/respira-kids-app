-- Marketing P2 (25/11/2026): aba Oportunidades começa por "Precisam de ação" e a aba
-- Qualidade mostra a cobertura da origem declarada pela Ju. Só acrescenta.
--
-- fn_atrib_oportunidades_acao: oportunidades COMERCIAIS de contato novo (intenção de
-- contratar ou ainda não analisada), abertas nos últimos p_dias, que pedem um passo da
-- equipe. Uma ação por oportunidade, a mais urgente:
--   familia_esperando  a última mensagem é da família, há mais de 30 min e menos de 3
--                      dias, e não é só um agradecimento ("ok", "obrigada"…);
--   sem_horario        pediu para agendar, não tem sessão e nenhuma mensagem da equipe
--                      ou da Ju trouxe dia ou hora (heurística por texto, dito na tela);
--   confirmar_primeira 1ª sessão nas próximas 48 h ainda "Agendado" (não confirmada);
--   familia_parou      a equipe ou a Ju falou por último, há 2 a 10 dias, sem sessão
--                      (o follow-up automático pode já ter escrito).
-- Mais de 10 dias parada vira só contagem ('paradas_10d'): é perda, não fila.
-- A fila do dia da equipe (todas as conversas, com "resolver") é Conversas → Hoje;
-- esta lista é o recorte comercial do Marketing e só abre a conversa.

CREATE OR REPLACE FUNCTION public.fn_atrib_oportunidades_acao(p_dias int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_agora timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_out jsonb;
BEGIN
  IF NOT public.fn_atrib_rpc_ok() THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;

  WITH
  op AS (
    SELECT o.id, o.conversa_id, o.aberta_em, o.etapa_atual, o.estado, p.intencao,
           c.telefone, c.chatwoot_conversation_id chatwoot_id, c.nome_whatsapp,
           coalesce((SELECT t.canal FROM public.atrib_toques t
                      WHERE t.conversa_id = o.conversa_id AND t.mensagem_em IS NOT NULL
                      ORDER BY t.mensagem_em, t.id LIMIT 1), 'nao_atribuido') canal
      FROM public.atrib_oportunidades o
      JOIN public.vw_atrib_oportunidades_painel p ON p.id = o.id
      JOIN public.ju_conversas c ON c.id = o.conversa_id
     WHERE o.contato_novo AND o.estado IN ('aberta', 'agendada') AND o.anonimizada_em IS NULL
       AND o.aberta_em >= now() - make_interval(days => greatest(p_dias, 1))
       AND p.intencao IN ('contratar', 'nao_analisada')
  ),
  ult AS (  -- última mensagem de gente (sem automação)
    SELECT DISTINCT ON (m.conversa_id) m.conversa_id, m.origem, m.created_at,
           coalesce(m.conteudo, '') ~* '^\s*(ok|obrigad|agrade[cç]|valeu|perfeito|combinado|beleza|t[aá] bom|certo|blz|👍|🙏)' so_agradeceu
      FROM public.ju_mensagens m JOIN op ON op.conversa_id = m.conversa_id
     WHERE m.origem IN ('CLIENTE', 'JU', 'HUMANO') AND m.created_at >= op.aberta_em
     ORDER BY m.conversa_id, m.created_at DESC, m.id DESC
  ),
  ofereceu AS (  -- equipe ou Ju mandou dia ou hora depois que a conversa abriu
    SELECT DISTINCT m.conversa_id
      FROM public.ju_mensagens m JOIN op ON op.conversa_id = m.conversa_id
     WHERE m.origem IN ('JU', 'HUMANO') AND m.created_at >= op.aberta_em
       AND m.conteudo ~* '(\m([01]?\d|2[0-3]) ?(h|:)([0-5]\d)?\M|\m(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)\M)'
  ),
  ag AS (
    SELECT oa.oportunidade_id,
           min(s.dh) FILTER (WHERE s.presenca = 'agendada') proxima,
           (array_agg(s.status_consulta ORDER BY s.dh) FILTER (WHERE s.presenca = 'agendada'))[1] proxima_status,
           count(*) FILTER (WHERE s.presenca NOT IN ('cancelada', 'invalida', 'agendada')) passadas,
           count(*) FILTER (WHERE s.presenca NOT IN ('cancelada', 'invalida')) sessoes,
           string_agg(DISTINCT split_part(btrim(pe.nome), ' ', 1), ', ') criancas
      FROM public.atrib_oportunidade_agendamentos oa
      JOIN op ON op.id = oa.oportunidade_id
      JOIN interno.vw_atrib_sessoes s ON s.agendamento_id = oa.agendamento_id
      LEFT JOIN public.pessoas pe ON pe.id = s.paciente_id
     WHERE oa.removido_em IS NULL
     GROUP BY 1
  ),
  itens AS (
    SELECT op.*, u.origem ult_origem, u.created_at ult_em, ag.proxima, ag.criancas,
           CASE
             WHEN op.estado = 'aberta' AND u.origem = 'CLIENTE' AND NOT u.so_agradeceu
              AND u.created_at < now() - interval '30 minutes'
              AND u.created_at > now() - interval '3 days' THEN 'familia_esperando'
             WHEN op.estado = 'aberta' AND op.etapa_atual = 'agendamento_solicitado'
              AND coalesce(ag.sessoes, 0) = 0 AND f.conversa_id IS NULL
              AND coalesce(u.created_at, op.aberta_em) > now() - interval '10 days' THEN 'sem_horario'
             WHEN ag.proxima IS NOT NULL AND ag.proxima <= v_agora + interval '48 hours'
              AND ag.proxima_status = 'agendado' AND coalesce(ag.passadas, 0) = 0 THEN 'confirmar_primeira'
             WHEN op.estado = 'aberta' AND coalesce(ag.sessoes, 0) = 0 AND u.origem IN ('JU', 'HUMANO')
              AND u.created_at < now() - interval '48 hours'
              AND u.created_at > now() - interval '10 days' THEN 'familia_parou'
           END tipo,
           (op.estado = 'aberta' AND coalesce(ag.sessoes, 0) = 0
             AND coalesce(u.created_at, op.aberta_em) <= now() - interval '10 days') parada_10d
      FROM op
      LEFT JOIN ult u ON u.conversa_id = op.conversa_id
      LEFT JOIN ofereceu f ON f.conversa_id = op.conversa_id
      LEFT JOIN ag ON ag.oportunidade_id = op.id
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'dias', p_dias,
    'abertas', (SELECT count(*) FROM op),
    'paradas_10d', (SELECT count(*) FROM itens WHERE parada_10d AND tipo IS NULL),
    'itens', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'oportunidade_id', i.id, 'conversa_id', i.conversa_id, 'tipo', i.tipo,
               'nome', coalesce(i.criancas, i.nome_whatsapp), 'responsavel', i.nome_whatsapp,
               'telefone', i.telefone, 'chatwoot_id', i.chatwoot_id::text, 'canal', i.canal,
               'etapa', i.etapa_atual, 'aberta_em', i.aberta_em,
               'desde', coalesce(i.ult_em, i.aberta_em), 'ultima_origem', i.ult_origem,
               'proxima_sessao', to_char(i.proxima, 'YYYY-MM-DD"T"HH24:MI'))
             ORDER BY CASE i.tipo WHEN 'familia_esperando' THEN 1 WHEN 'sem_horario' THEN 2
                                  WHEN 'confirmar_primeira' THEN 3 ELSE 4 END,
                      CASE WHEN i.tipo = 'confirmar_primeira' THEN i.proxima END,
                      coalesce(i.ult_em, i.aberta_em))
        -- A mesma criança pode estar em duas conversas (pai e mãe): um item por criança/sessão.
        FROM (SELECT i0.*, row_number() OVER (
                       PARTITION BY i0.tipo, coalesce(i0.criancas, i0.conversa_id::text), i0.proxima
                       ORDER BY i0.aberta_em) rn
                FROM itens i0 WHERE i0.tipo IS NOT NULL) i
       WHERE i.rn = 1), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_atrib_oportunidades_acao(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atrib_oportunidades_acao(int) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_atrib_oportunidades_acao(int) IS
  'Marketing → Oportunidades, "Precisam de ação" (admin): oportunidades comerciais de contato novo que pedem um passo da equipe (família esperando, pediu horário sem dia/hora, 1ª sessão a confirmar, família parou de responder). Ver atribuicao_v2_p2_oportunidades_acao.sql.';

-- Qualidade: cobertura da origem declarada pela Ju (pergunta desde 25/11/2026) entre
-- as conversas de contato novo sem código RK. Acrescenta a chave 'origem_declarada'.
DO $troca$
DECLARE
  d  text := pg_get_functiondef('public.fn_atrib_painel_qualidade'::regproc);
  d2 text;
BEGIN
  IF position('''origem_declarada''' IN d) > 0 THEN
    RETURN;  -- já aplicado
  END IF;
  d2 := replace(d, '''inicio_rastreamento'', k.inicio,',
    '''origem_declarada'', (SELECT jsonb_build_object(''desde'', ''2026-11-25'',
        ''sem_origem'', count(*),
        ''com_declaracao'', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.atrib_origens_declaradas d0 WHERE d0.conversa_id = o0.conversa_id)))
      FROM public.atrib_oportunidades o0
     WHERE o0.contato_novo AND o0.aberta_em >= ''2026-11-25''
       AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t0 WHERE t0.conversa_id = o0.conversa_id)),
    ''inicio_rastreamento'', k.inicio,');
  IF d2 = d THEN
    RAISE EXCEPTION 'fn_atrib_painel_qualidade mudou: revise a inclusão de origem_declarada';
  END IF;
  EXECUTE d2;
END
$troca$;
