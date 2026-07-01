-- Auto-renovação do lembrete de inadimplência das PRÉ-COBRANÇAS
-- --------------------------------------------------------------------------
-- Evolução de pre_cobranca_lembretes_inadimplencia.sql. Regra de negócio nova:
--  * O lembrete continua ATIVO mesmo depois do link "expirar" (30 dias). Em vez
--    de parar e exigir reenvio manual de outro link, a validade (expira_em) é
--    RENOVADA no ato de cada lembrete (30 dias a partir de agora), mantendo o
--    vencimento ORIGINAL — assim o "vencido há X dias" segue crescendo e o mesmo
--    link nunca morre enquanto houver dívida.
--  * Contexto: antes, vencimento e expira_em andavam juntos, o que zerava a janela
--    "vencida mas ainda válida" e tornava o lembrete impossível de disparar (ver
--    fix b435608 que desacoplou vencimento=criação+1 de expira_em=criação+30).
--  * Guard novo: só lembra se o link ainda tem consulta reservada e NÃO faturada
--    (id_asaas/fatura_id null + EXISTS agendamento reservado) — evita cobrar link
--    cuja consulta já foi para uma fatura.
--
-- Para PARAR de lembrar uma pré-cobrança específica: excluí-la (status cancelado /
-- ativo=false) pela tela de pré-faturas — o guard EXISTS e o ativo=true a tiram da
-- régua. Não há teto de avisos: lembra toda ter/sex até pagar ou ser excluída.

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
  -- Pré-cobranças VENCIDAS e ainda não pagas/convertidas, não lembradas hoje.
  -- Não exige expira_em > now(): vencidas continuam na régua indefinidamente; a
  -- validade é renovada no ato do lembrete (UPDATE abaixo), mantendo o vencimento
  -- ORIGINAL (dias_em_atraso cresce). Guard: só entra se ainda houver consulta
  -- reservada e não faturada.
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT pl.id
    FROM public.pagamento_links pl
    WHERE pl.ativo = true
      AND pl.status IN ('pendente', 'expirado')
      AND pl.id_asaas IS NULL
      AND pl.fatura_id IS NULL
      AND pl.vencimento < CURRENT_DATE
      AND (pl.ultimo_lembrete_em IS NULL OR pl.ultimo_lembrete_em < CURRENT_DATE)
      AND EXISTS (
        SELECT 1 FROM public.agendamentos a
        WHERE a.pagamento_link_id = pl.id AND a.ativo = true AND a.fatura_id IS NULL
      )
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

  -- Marca como lembrada hoje e AUTO-RENOVA a validade (30 dias a partir de agora),
  -- revivendo se estava 'expirado'. NÃO toca no vencimento.
  UPDATE public.pagamento_links
  SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
      ultimo_lembrete_em = now(),
      status = 'pendente',
      expira_em = now() + interval '30 days',
      atualizado_em = now()
  WHERE id = ANY(v_ids);

  RETURN v_queue_id;
END;
$function$;

-- ==========================================================================
-- Data migration ONE-TIME (já aplicada em 2026-07-01 via MCP; idempotente):
-- ==========================================================================

-- (a) Revive as pré-cobranças antigas SAUDÁVEIS (valor_base = soma das consultas
--     reservadas), estendendo a validade e mantendo o vencimento original.
UPDATE public.pagamento_links pl
SET expira_em = now() + interval '30 days',
    status = 'pendente',
    atualizado_em = now()
WHERE pl.ativo AND pl.id_asaas IS NULL AND pl.fatura_id IS NULL
  AND pl.status IN ('pendente','expirado')
  AND pl.expira_em < now() + interval '25 days'  -- só as ainda não renovadas
  AND pl.valor_base = (
    SELECT COALESCE(SUM(a.valor_servico),0) FROM public.agendamentos a
    WHERE a.pagamento_link_id = pl.id AND a.ativo AND a.fatura_id IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.pagamento_link_id = pl.id AND a.ativo AND a.fatura_id IS NULL
  );

-- (b) Exclusão do link duplicado da Barbara (R$520 p/ 1 consulta de R$260, nunca
--     corrigido) — cancela e devolve a consulta para 'pendente'. Fica aqui como
--     registro; não re-executa porque o link já está status='cancelado'.
WITH bad AS (
  UPDATE public.pagamento_links
  SET status = 'cancelado', ativo = false, atualizado_em = now()
  WHERE token = 'rJgdWkzZCzNUuz2IeMwlF' AND status = 'pendente'
  RETURNING id
)
UPDATE public.agendamentos a
SET pagamento_link_id = NULL,
    cobranca_gerada_em = NULL,
    cobranca_gerada_por = NULL,
    status_pagamento_id = (SELECT id FROM public.pagamento_status WHERE codigo = 'pendente')
WHERE a.pagamento_link_id IN (SELECT id FROM bad);
