-- =====================================================================
-- Lembrete de pedido parado com texto que se explica sozinho (22/10/2026)
-- =====================================================================
-- AI dev note: pedido do dono. O lembrete era "⏰ pedido aguardando a equipe há
-- 10 min (agendamento, +55619...)": sem nome, sem o que a família quer, e o
-- "há 10 min" de um pedido aberto na véspera contava só desde as 8h. Agora:
--   ⏰ Pedido ainda sem resposta · Agendamento
--   Pedro · (61) 99900-0086
--   <resumo que a Ju escreveu, até 220 caracteres>
--   Aberto ontem às 18:22. Quando resolver, toque em ✅ Concluído ou tire a etiqueta.
-- O resto de fn_ju_tarefas (retomada, prazos 10/30 e 5/15 min, notas) não muda.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ju_tarefas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_agora     timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_expediente boolean := extract(isodow FROM v_agora) BETWEEN 1 AND 5
                          AND v_agora::time >= time '08:00' AND v_agora::time < time '18:00';
  v_abertura  timestamptz := (date_trunc('day', v_agora) + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo';
  v_retomar   jsonb;
  v_lembretes jsonb;
BEGIN
  WITH r AS (
    UPDATE public.ju_conversas c
       SET retomada_versao = c.message_version
     WHERE c.status = 'PAUSADA' AND c.pause_until <= now()
       AND c.message_version > c.ultima_versao_respondida
       AND c.ultima_mensagem_cliente > coalesce(c.ultima_mensagem_humano, '-infinity'::timestamptz)
       AND c.ultima_mensagem_cliente > now() - interval '2 hours'
       AND c.retomada_versao IS DISTINCT FROM c.message_version
    RETURNING c.id, c.message_version)
  SELECT coalesce(jsonb_agg(jsonb_build_object('conversa_id', id, 'versao', message_version)), '[]'::jsonb)
    INTO v_retomar FROM r;

  WITH devidos AS (
    SELECT s.id,
           CASE WHEN s.urgente THEN now() - s.created_at
                ELSE now() - greatest(s.created_at, v_abertura) END AS parado
    FROM public.ju_solicitacoes s
    WHERE s.status = 'ABERTA' AND s.lembretes < 2 AND s.tipo <> 'EXTERNO'
      AND (s.urgente OR v_expediente)),
  l AS (
    UPDATE public.ju_solicitacoes s
       SET lembretes = s.lembretes + 1, ultimo_lembrete_em = now()
      FROM devidos d
     WHERE s.id = d.id
       AND d.parado >= CASE WHEN s.urgente THEN (CASE WHEN s.lembretes = 0 THEN interval '5 minutes' ELSE interval '15 minutes' END)
                            ELSE (CASE WHEN s.lembretes = 0 THEN interval '10 minutes' ELSE interval '30 minutes' END) END
    RETURNING s.id, s.tipo, s.lembretes, s.urgente, s.notificacao_msg_id, d.parado, s.conversa_id,
              s.resumo, s.paciente_id, s.created_at),
  t AS (
    SELECT l.*,
           CASE l.tipo WHEN 'AGENDAMENTO' THEN 'Agendamento' WHEN 'FINANCEIRO' THEN 'Financeiro'
                       WHEN 'CONTRATO' THEN 'Contrato' WHEN 'CLINICO' THEN 'Dúvida clínica (fisios)'
                       WHEN 'NOTA_FISCAL' THEN 'Nota fiscal' WHEN 'RECLAMACAO' THEN 'Reclamação'
                       WHEN 'HUMANO' THEN 'Quer falar com alguém da equipe' WHEN 'CADASTRO' THEN 'Cadastro'
                       ELSE initcap(lower(replace(l.tipo, '_', ' '))) END AS rotulo,
           (SELECT split_part(btrim(p.nome), ' ', 1) FROM public.pessoas p WHERE p.id = l.paciente_id) AS paciente,
           (SELECT CASE WHEN length(d) >= 10
                        THEN regexp_replace(right(d, CASE WHEN length(d) >= 13 THEN 11 ELSE length(d) - 2 END),
                                            '^(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3')
                        ELSE nullif(c.telefone, '') END
              FROM public.ju_conversas c, LATERAL (SELECT regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') AS d) x
             WHERE c.id = l.conversa_id) AS fone,
           (l.created_at AT TIME ZONE 'America/Sao_Paulo') AS aberto
    FROM l)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'solicitacao_id', t.id,
           'citar', t.notificacao_msg_id,
           'texto',
             CASE WHEN t.urgente THEN '🚨 URGENTE: pedido sem resposta há ' || (extract(epoch FROM t.parado) / 60)::int || ' min'
                  WHEN t.lembretes = 1 THEN '⏰ Pedido ainda sem resposta'
                  ELSE '⚠️ Pedido ainda sem resposta (2º lembrete)' END
             || ' · ' || t.rotulo
             || E'\n' || concat_ws(' · ', t.paciente, coalesce(t.fone, 'sem telefone'))
             || CASE WHEN nullif(btrim(t.resumo), '') IS NOT NULL AND t.resumo <> 'Pedido de teste'
                     THEN E'\n' || CASE WHEN length(btrim(t.resumo)) > 220
                                        THEN left(btrim(t.resumo), 217) || '...' ELSE btrim(t.resumo) END
                     ELSE '' END
             || E'\nAberto ' || CASE WHEN t.aberto::date = v_agora::date THEN 'hoje'
                                     WHEN t.aberto::date = v_agora::date - 1 THEN 'ontem'
                                     ELSE 'em ' || to_char(t.aberto, 'DD/MM') END
             || ' às ' || to_char(t.aberto, 'HH24:MI')
             || '. Quando resolver, toque em ✅ Concluído ou tire a etiqueta.')), '[]'::jsonb)
    INTO v_lembretes FROM t;

  RETURN jsonb_build_object('retomar', v_retomar, 'lembretes', v_lembretes, 'notas', public.fn_ju_nf_acompanhar());
END;
$function$;
