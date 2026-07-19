-- Estende o log de disparo para cobrir também as COBRANÇAS ASAAS (faturas),
-- não só as pré-cobranças (pagamento_links). Assim o lembrete de inadimplência
-- das faturas Asaas também registra enviado/falhou (via fn_registrar_disparo_cobranca
-- com p_id_asaas). A view do log passa a unir os dois mundos.

-- 1. Vincular disparo a fatura Asaas
ALTER TABLE public.cobranca_disparo_log
  ADD COLUMN IF NOT EXISTS fatura_id uuid,
  ADD COLUMN IF NOT EXISTS id_asaas text;

CREATE INDEX IF NOT EXISTS idx_cdl_fatura
  ON public.cobranca_disparo_log(fatura_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cdl_idasaas
  ON public.cobranca_disparo_log(id_asaas, criado_em DESC);

-- 2. RPC passa a aceitar p_id_asaas (resolve fatura + link). Overload novo => DROP + CREATE.
DROP FUNCTION IF EXISTS public.fn_registrar_disparo_cobranca(text, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_registrar_disparo_cobranca(
  p_status text,
  p_pagamento_link_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_tipo text DEFAULT 'inicial',
  p_canal text DEFAULT 'whatsapp',
  p_detalhe text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_id_asaas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link_id uuid := p_pagamento_link_id;
  v_fatura_id uuid;
  v_id_asaas text := p_id_asaas;
  v_id uuid;
BEGIN
  -- resolve link por token
  IF v_link_id IS NULL AND p_token IS NOT NULL THEN
    SELECT id INTO v_link_id FROM public.pagamento_links WHERE token = p_token LIMIT 1;
  END IF;

  -- resolve por id_asaas: fatura + (link, se ainda não resolvido)
  IF p_id_asaas IS NOT NULL THEN
    SELECT id INTO v_fatura_id FROM public.faturas
      WHERE id_asaas = p_id_asaas AND ativo = true ORDER BY criado_em DESC LIMIT 1;
    IF v_link_id IS NULL THEN
      SELECT id INTO v_link_id FROM public.pagamento_links WHERE id_asaas = p_id_asaas LIMIT 1;
    END IF;
  END IF;

  -- completa fatura/id_asaas a partir do link, quando o disparo veio pelo link
  IF v_link_id IS NOT NULL THEN
    SELECT COALESCE(v_fatura_id, pl.fatura_id), COALESCE(v_id_asaas, pl.id_asaas)
      INTO v_fatura_id, v_id_asaas
    FROM public.pagamento_links pl WHERE pl.id = v_link_id;
  END IF;

  INSERT INTO public.cobranca_disparo_log
    (pagamento_link_id, fatura_id, id_asaas, token, tipo, canal, status, detalhe, telefone)
  VALUES
    (v_link_id, v_fatura_id, v_id_asaas, p_token, COALESCE(p_tipo,'inicial'),
     COALESCE(p_canal,'whatsapp'), p_status, p_detalhe, p_telefone)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 3. View unificada: pré-cobranças (link) + faturas Asaas diretas COM disparo registrado.
--    As faturas diretas só entram se JÁ têm registro no cobranca_disparo_log (senão a
--    view traria milhares de faturas pagas sem disparo). As faturas que vieram de link
--    continuam representadas pela linha do pagamento_link (origem 'link').
DROP VIEW IF EXISTS public.vw_disparo_cobrancas;
CREATE VIEW public.vw_disparo_cobrancas AS
 SELECT pl.id AS pagamento_link_id,
    pl.token,
    pl.criado_em,
    pl.status AS link_status,
    pl.valor_base,
    pl.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    pl.responsavel_cobranca_id,
    r.nome AS responsavel_nome,
    r.telefone AS responsavel_telefone,
    pl.paciente_id,
    pac.nome AS paciente_nome,
    g.lote_id,
    g.status AS geracao_status,
    g.erro AS geracao_erro,
    g.criado_por,
    d.status AS envio_status,
    d.detalhe AS envio_detalhe,
    d.tipo AS envio_tipo,
    d.criado_em AS envio_em,
    wq.status AS fila_status,
    wq.processado_em AS fila_processado_em,
    wq.erro AS fila_erro,
    (wq.payload -> 'data' ->> 'pacing') AS pacing,
    CASE
      WHEN g.status = 'erro' THEN 'erro_geracao'
      WHEN d.status = 'falhou' THEN 'falhou'
      WHEN d.status IN ('enviado','entregue','lido') THEN 'enviado'
      WHEN wq.status = 'erro' THEN 'erro_entrega'
      WHEN wq.status = 'processado' THEN 'entregue_n8n'
      WHEN wq.id IS NOT NULL THEN 'na_fila'
      ELSE 'sem_disparo'
    END AS disparo_status,
    'link'::text AS origem,
    pl.fatura_id,
    pl.id_asaas,
    pl.id AS linha_id
   FROM public.pagamento_links pl
     LEFT JOIN LATERAL (
       SELECT dl.status, dl.detalhe, dl.tipo, dl.criado_em
       FROM public.cobranca_disparo_log dl WHERE dl.pagamento_link_id = pl.id
       ORDER BY dl.criado_em DESC LIMIT 1) d ON true
     LEFT JOIN public.pagamento_link_geracao_log g ON g.pagamento_link_id = pl.id
     LEFT JOIN LATERAL (
       SELECT w.id, w.status, w.processado_em, w.erro, w.payload
       FROM public.webhook_queue w
       WHERE w.evento = 'pagamento_link_criado'
         AND (w.payload -> 'data' ->> 'pagamento_link_id') = pl.id::text
       ORDER BY w.created_at DESC LIMIT 1) wq ON true
     LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
     LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
     LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id
UNION ALL
 SELECT NULL::uuid AS pagamento_link_id,
    NULL::text AS token,
    f.criado_em,
    f.status AS link_status,
    f.valor_total AS valor_base,
    f.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    f.responsavel_cobranca_id,
    r.nome AS responsavel_nome,
    r.telefone AS responsavel_telefone,
    f.paciente_id,
    pac.nome AS paciente_nome,
    NULL::uuid AS lote_id,
    NULL::text AS geracao_status,
    NULL::text AS geracao_erro,
    NULL::uuid AS criado_por,
    d.status AS envio_status,
    d.detalhe AS envio_detalhe,
    d.tipo AS envio_tipo,
    d.criado_em AS envio_em,
    NULL::text AS fila_status,
    NULL::timestamptz AS fila_processado_em,
    NULL::text AS fila_erro,
    NULL::text AS pacing,
    CASE
      WHEN d.status = 'falhou' THEN 'falhou'
      WHEN d.status IN ('enviado','entregue','lido') THEN 'enviado'
      ELSE 'sem_disparo'
    END AS disparo_status,
    'asaas'::text AS origem,
    f.id AS fatura_id,
    f.id_asaas,
    f.id AS linha_id
   FROM public.faturas f
     LEFT JOIN LATERAL (
       SELECT dl.status, dl.detalhe, dl.tipo, dl.criado_em
       FROM public.cobranca_disparo_log dl
       WHERE dl.fatura_id = f.id OR (dl.id_asaas IS NOT NULL AND dl.id_asaas = f.id_asaas)
       ORDER BY dl.criado_em DESC LIMIT 1) d ON true
     LEFT JOIN public.pessoas r ON r.id = f.responsavel_cobranca_id
     LEFT JOIN public.pessoas pac ON pac.id = f.paciente_id
     LEFT JOIN public.pessoa_empresas emp ON emp.id = f.empresa_id
   WHERE f.ativo = true
     AND f.id_asaas IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pagamento_links pl2 WHERE pl2.fatura_id = f.id)
     AND EXISTS (
       SELECT 1 FROM public.cobranca_disparo_log dl2
       WHERE dl2.fatura_id = f.id OR (dl2.id_asaas IS NOT NULL AND dl2.id_asaas = f.id_asaas)
     );

GRANT SELECT ON public.vw_disparo_cobrancas TO authenticated;
