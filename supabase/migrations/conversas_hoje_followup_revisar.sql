-- AI dev note: 06/11/2026 (ok do dono). O follow-up automático marca algumas conversas como 'revisar' (convênio com
-- interesse, data pedida que já passou, internação antiga…) e não envia nada; até hoje isso não aparecia para
-- ninguém. Agora vira item "lead" na aba Hoje da central de Conversas (ref 'revisar:<conversa_id>'), com o motivo.
-- Some quando alguém resolve o item, até a conversa ter mensagem nova.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_conversas_hoje()'::regprocedure); n text;
  a1 text := $a$    FROM (SELECT * FROM public.fn_conversas_oportunidades() WHERE pontos >= 90 ORDER BY pontos DESC, ultima_mensagem_em DESC LIMIT 8) o
  )$a$;
  a2 text := $a$        UNION ALL SELECT item FROM i_fila UNION ALL SELECT item FROM i_leads) u;$a$;
BEGIN
  IF d LIKE '%i_revisar%' THEN RETURN; END IF;
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 THEN RAISE EXCEPTION 'fn_conversas_hoje: trecho não encontrado'; END IF;
  n := replace(d, a1, a1 || $a$,
  i_revisar AS (
    SELECT jsonb_build_object(
      'tipo', 'lead', 'ref', 'revisar:' || a.conversa_id,
      'prioridade', 'media',
      'responsavel', 'Recepção',
      'titulo', 'Follow-up para revisar: ' || CASE a.motivo
          WHEN 'convenio_com_interesse' THEN 'perguntou de convênio e mostrou interesse'
          WHEN 'intencao_vencida' THEN 'a data que a família pediu já passou'
          WHEN 'saude_historico' THEN 'contou de uma internação ou alta'
          ELSE replace(coalesce(a.motivo, 'sem motivo'), '_', ' ') END,
      'descricao', left(coalesce(nullif(a.acao_pendente, ''), a.contexto, ''), 220),
      'evidencia', 'O follow-up automático não manda nada sozinho nesses casos. Vale retomar?',
      'desde', coalesce(greatest(a.ultima_familia_em, a.ultima_clinica_em), a.avaliado_em),
      'atividade', coalesce(greatest(a.ultima_familia_em, a.ultima_clinica_em), a.avaliado_em),
      'nome', coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Contato sem nome'),
      'telefone', c.telefone,
      'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
                 FROM tarefa t WHERE t.tipo = 'lead' AND t.ref = 'revisar:' || a.conversa_id AND t.status = 'assumida')
    ) AS item
    FROM (SELECT DISTINCT ON (f.conversa_id) f.*
            FROM public.followup_avaliacoes f
           WHERE f.dia >= (v_agora AT TIME ZONE 'America/Sao_Paulo')::date - 1
           ORDER BY f.conversa_id, f.avaliado_em DESC) a
    JOIN public.ju_conversas c ON c.id = a.conversa_id
    WHERE a.situacao = 'revisar' AND NOT c.sem_ia
      AND NOT EXISTS (SELECT 1 FROM tarefa t WHERE t.tipo = 'lead' AND t.ref = 'revisar:' || a.conversa_id
                        AND t.status = 'resolvida'
                        AND t.atividade_ref >= coalesce(greatest(a.ultima_familia_em, a.ultima_clinica_em), a.avaliado_em))
  )$a$);
  n := replace(n, a2, $a$        UNION ALL SELECT item FROM i_fila UNION ALL SELECT item FROM i_leads UNION ALL SELECT item FROM i_revisar) u;$a$);
  EXECUTE n;
END $do$;

-- Ajustes do mesmo dia: só conversa com movimento na última semana; nome pelo whatsapp_conversas; descrição = resumo.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_conversas_hoje()'::regprocedure); n text;
BEGIN
  IF d LIKE '%revisar_7dias%' THEN RETURN; END IF;
  n := replace(d, $a$      'descricao', left(coalesce(nullif(a.acao_pendente, ''), a.contexto, ''), 220),$a$,
                  $a$      'descricao', left(coalesce((SELECT nullif(btrim(w.resumo), '') FROM public.whatsapp_conversas w
                                   WHERE public.fn_tel_chave(w.contato_telefone) = public.fn_tel_chave(c.telefone)
                                   ORDER BY w.ultima_mensagem_em DESC NULLS LAST LIMIT 1), a.acao_pendente, ''), 220),$a$);
  n := replace(n, $a$      'nome', coalesce(nullif(btrim(c.nome_whatsapp), ''), 'Contato sem nome'),$a$,
                  $a$      'nome', coalesce(nullif(btrim(c.nome_whatsapp), ''),
                       (SELECT nullif(btrim(w.contato_nome), '') FROM public.whatsapp_conversas w
                         WHERE public.fn_tel_chave(w.contato_telefone) = public.fn_tel_chave(c.telefone)
                         ORDER BY w.ultima_mensagem_em DESC NULLS LAST LIMIT 1), 'Contato sem nome'),$a$);
  n := replace(n, $a$    WHERE a.situacao = 'revisar' AND NOT c.sem_ia$a$,
                  $a$    WHERE a.situacao = 'revisar' AND NOT c.sem_ia   -- revisar_7dias: só conversa com movimento na última semana
      AND coalesce(greatest(a.ultima_familia_em, a.ultima_clinica_em), a.avaliado_em) > v_agora - interval '7 days'$a$);
  IF n = d OR n NOT LIKE '%revisar_7dias%' OR n NOT LIKE '%contato_nome%' THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;
