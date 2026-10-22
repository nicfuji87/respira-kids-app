-- =====================================================================
-- Ju: tarefas por tempo (retomada, lembretes à Lolô, notas com erro)
-- =====================================================================
-- AI dev note: o relógio fica no banco. O pg_cron roda fn_ju_tarefas_disparar
-- a cada minuto (só SQL, sem rede); o n8n ("RK Ju - Tarefas") só é chamado,
-- via pg_net, quando há trabalho. O webhook é autenticado por um header cujo
-- valor fica no Vault (segredo 'ju_tarefas_token') e na credencial do n8n.
--
--   retomar   pausa da Lolô vencida e o cliente ainda esperando resposta.
--             Uma retomada por versão (sem repetir a cada minuto).
--   lembretes pedido aberto há 10 e 30 min (horário da clínica: seg-sex
--             8h-19h, contando a partir da abertura se chegou fora dele);
--             urgente: 5 e 15 min, a qualquer hora. Só para a equipe.
--   notas     nota pedida pela Ju que voltou com erro: vira pedido para a
--             secretaria (o n8n chama o mesmo sub-fluxo das ferramentas).
--
-- O job é criado DESLIGADO; liga no dia em que a Ju for ao ar.
-- =====================================================================

ALTER TABLE public.ju_conversas
  ADD COLUMN retomada_versao bigint;
ALTER TABLE public.ju_solicitacoes
  ADD COLUMN ultimo_lembrete_em timestamptz;


-- ---------------------------------------------------------------------
-- 1. Notas pedidas pela Ju: marca as que saíram e devolve as que voltaram
--    com erro (o pedido à secretaria é feito pelo n8n, com aviso e etiqueta).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_nf_acompanhar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb;
BEGIN
  UPDATE public.ju_acoes ja
     SET status = 'CONCLUIDA', updated_at = now()
    FROM public.faturas f
   WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK' AND f.id = ja.alvo_id
     AND f.link_nfe ~ '^https://'
     AND coalesce(f.status_nfe, '') !~* '(falha|retorno da prefeitura|erro)';

  WITH erradas AS (
    UPDATE public.ju_acoes ja
       SET status = 'ESCALADA', detalhe = left(f.status_nfe, 1000), updated_at = now()
      FROM public.faturas f
     WHERE ja.tipo = 'NF_EMITIR' AND ja.status = 'OK' AND f.id = ja.alvo_id
       AND ja.created_at > now() - interval '7 days'
       AND (f.link_nfe = 'erro' OR coalesce(f.status_nfe, '') ~* '(falha|retorno da prefeitura)')
    RETURNING ja.conversa_id, f.paciente_id, f.descricao, f.status_nfe)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'conversa_id', conversa_id,
           'paciente_id', paciente_id,
           'resumo', 'A nota fiscal que a Ju pediu voltou com erro de novo. Fatura: ' || coalesce(descricao, '-')
                     || '. Retorno: ' || coalesce(status_nfe, 'sem detalhe'))), '[]'::jsonb)
    INTO v_out FROM erradas;
  RETURN v_out;
END;
$$;


-- ---------------------------------------------------------------------
-- 2. O que precisa ser feito agora. Marca o que devolve (não repete).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_tarefas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_agora     timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_expediente boolean := extract(isodow FROM v_agora) BETWEEN 1 AND 5
                          AND v_agora::time >= time '08:00' AND v_agora::time < time '19:00';
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
       AND c.retomada_versao IS DISTINCT FROM c.message_version
    RETURNING c.id, c.message_version)
  SELECT coalesce(jsonb_agg(jsonb_build_object('conversa_id', id, 'versao', message_version)), '[]'::jsonb)
    INTO v_retomar FROM r;

  WITH devidos AS (
    SELECT s.id,
           CASE WHEN s.urgente THEN now() - s.created_at
                ELSE now() - greatest(s.created_at, v_abertura) END AS parado
    FROM public.ju_solicitacoes s
    WHERE s.status = 'ABERTA' AND s.lembretes < 2
      AND (s.urgente OR v_expediente)),
  l AS (
    UPDATE public.ju_solicitacoes s
       SET lembretes = s.lembretes + 1, ultimo_lembrete_em = now()
      FROM devidos d
     WHERE s.id = d.id
       AND d.parado >= CASE WHEN s.urgente THEN (CASE WHEN s.lembretes = 0 THEN interval '5 minutes' ELSE interval '15 minutes' END)
                            ELSE (CASE WHEN s.lembretes = 0 THEN interval '10 minutes' ELSE interval '30 minutes' END) END
    RETURNING s.id, s.tipo, s.lembretes, s.urgente, s.notificacao_msg_id, d.parado, s.conversa_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'solicitacao_id', l.id,
           'citar', l.notificacao_msg_id,
           'texto', CASE WHEN l.lembretes = 1 THEN '⏰ ' ELSE '⚠️ ' END
                    || CASE WHEN l.urgente THEN 'URGENTE: ' ELSE '' END
                    || 'pedido aguardando a equipe há ' || (extract(epoch FROM l.parado) / 60)::int || ' min'
                    || CASE WHEN l.notificacao_msg_id IS NULL
                            THEN ' (' || lower(l.tipo) || ', ' || coalesce((SELECT nullif(c.telefone, '') FROM public.ju_conversas c WHERE c.id = l.conversa_id), 'sem telefone') || ')'
                            ELSE '' END
                    || '. Quando terminar, toque em Concluído ou tire a etiqueta.')), '[]'::jsonb)
    INTO v_lembretes FROM l;

  RETURN jsonb_build_object('retomar', v_retomar, 'lembretes', v_lembretes, 'notas', public.fn_ju_nf_acompanhar());
END;
$$;


-- ---------------------------------------------------------------------
-- 3. Disparo pelo pg_cron: só chama o n8n quando há algo a fazer.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_tarefas_disparar()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t       jsonb := public.fn_ju_tarefas();
  v_token text;
BEGIN
  IF jsonb_array_length(t -> 'retomar') = 0 AND jsonb_array_length(t -> 'lembretes') = 0
     AND jsonb_array_length(t -> 'notas') = 0 THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'ju_tarefas_token';
  RETURN net.http_post(
    url := 'https://flows-principal.infusecomunicacao.online/webhook/rk-ju-tarefas-8c3f5a1d7e24',
    body := t,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ju-tarefas', v_token),
    timeout_milliseconds := 10000);
END;
$$;


REVOKE ALL ON FUNCTION public.fn_ju_tarefas(), public.fn_ju_tarefas_disparar()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_tarefas(), public.fn_ju_tarefas_disparar() TO service_role;

-- Job criado desligado: ligar com
--   SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'ju-tarefas'), active := true);
SELECT cron.schedule('ju-tarefas', '* * * * *', $$SELECT public.fn_ju_tarefas_disparar()$$);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'ju-tarefas'), active := false);
