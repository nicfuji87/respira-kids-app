-- Lembrete de inadimplência das PRÉ-COBRANÇAS (links não gerados no Asaas)
-- --------------------------------------------------------------------------
-- Regra de negócio:
--  * O Asaas cuida da inadimplência das cobranças geradas por lá. Aqui tratamos
--    SOMENTE as pré-cobranças (pagamento_links pendente, sem id_asaas).
--  * Lembrete toda TERÇA e SEXTA às 14h (Brasília) = 17:00 UTC (banco em UTC).
--  * Lembra enquanto o link estiver VENCIDO e AINDA VÁLIDO (dentro dos 30 dias).
--    Quando o link expira, para sozinho — nesse caso envia-se OUTRO link (manual).
--  * Sem teto de avisos; escalonamento de texto fica no n8n via `aviso_numero`.
--
-- Arquitetura (espelha fn_enqueue_whatsapp_followups): pg_cron -> função que
-- enfileira 1 evento em webhook_queue -> process_webhooks_simple() entrega ao
-- destino n8n configurado em `webhooks` (webhookRKPrincipal) -> n8n envia WhatsApp.
--
-- IMPORTANTE: o cron nasce DESLIGADO. Ligar só quando o ramo no n8n estiver pronto:
--   SELECT cron.alter_job(
--     (SELECT jobid FROM cron.job WHERE jobname='lembrete-pre-cobranca-inadimplente'),
--     active := true);

-- 1. Controle de lembretes na pré-cobrança
ALTER TABLE public.pagamento_links
  ADD COLUMN IF NOT EXISTS lembretes_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_lembrete_em timestamptz;

-- 2. Função que enfileira os lembretes das pré-cobranças inadimplentes
CREATE OR REPLACE FUNCTION public.fn_enqueue_lembretes_pre_cobranca()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_webhook_id uuid := gen_random_uuid();
  v_queue_id uuid;
  v_ids uuid[];
  v_items jsonb;
BEGIN
  -- Pré-cobranças VENCIDAS, com link AINDA VÁLIDO (não expirado), não lembradas hoje.
  -- Expiradas ficam de fora (regra: link vencido -> envia-se OUTRO link, manualmente).
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT pl.id
    FROM public.pagamento_links pl
    WHERE pl.ativo = true
      AND pl.status = 'pendente'
      AND pl.id_asaas IS NULL
      AND pl.vencimento < CURRENT_DATE
      AND pl.expira_em > now()
      AND (pl.ultimo_lembrete_em IS NULL OR pl.ultimo_lembrete_em < CURRENT_DATE)
    ORDER BY pl.vencimento ASC
    LIMIT 200
  ) t;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE NOTICE 'Sem pré-cobranças inadimplentes a lembrar';
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'pagamento_link_id', pl.id,
      'token', pl.token,
      'url', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || pl.token,
      'responsavel_cobranca_id', pl.responsavel_cobranca_id,
      'responsavel_nome', r.nome,
      'responsavel_telefone', r.telefone,
      'paciente_id', pl.paciente_id,
      'paciente_nome', pac.nome,
      'empresa_id', pl.empresa_id,
      'empresa_nome', COALESCE(emp.nome_fantasia, emp.razao_social),
      'valor_base', pl.valor_base,
      'descricao', pl.descricao,
      'vencimento', pl.vencimento,
      'dias_em_atraso', (CURRENT_DATE - pl.vencimento),
      'aviso_numero', COALESCE(pl.lembretes_enviados, 0) + 1
    )
    ORDER BY pl.vencimento ASC
  )
  INTO v_items
  FROM public.pagamento_links pl
  LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
  LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
  LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id
  WHERE pl.id = ANY(v_ids);

  INSERT INTO public.webhook_queue (evento, payload, status, tentativas, max_tentativas)
  VALUES (
    'pre_cobranca_inadimplente',
    jsonb_build_object(
      'tipo', 'pre_cobranca_inadimplente',
      'timestamp', now(),
      'webhook_id', v_webhook_id,
      'data', jsonb_build_object(
        'total', array_length(v_ids, 1),
        'cobrancas', v_items
      )
    ),
    'pendente', 0, 3
  )
  RETURNING id INTO v_queue_id;

  UPDATE public.pagamento_links
  SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
      ultimo_lembrete_em = now()
  WHERE id = ANY(v_ids);

  RETURN v_queue_id;
END;
$function$;

-- 3. Roteia o novo evento para o mesmo destino n8n (webhookRKPrincipal)
UPDATE public.webhooks
SET eventos = array_append(eventos, 'pre_cobranca_inadimplente')
WHERE ativo = true
  AND NOT ('pre_cobranca_inadimplente' = ANY(eventos));

-- 4. Agenda o cron (Tue/Fri 17:00 UTC = 14h BRT) e já DESLIGA até o n8n estar pronto
SELECT cron.schedule(
  'lembrete-pre-cobranca-inadimplente',
  '0 17 * * 2,5',
  'SELECT public.fn_enqueue_lembretes_pre_cobranca();'
);
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'lembrete-pre-cobranca-inadimplente'),
  active := false
);
