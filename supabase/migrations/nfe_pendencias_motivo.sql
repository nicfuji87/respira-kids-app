-- =====================================================================================
-- Tela de nota fiscal: motivo de cada nota pendente (07/11/2026, pedido do dono)
--
-- Antes: quando a nota falhava, o banco só guardava link_nfe = 'erro'; o motivo ficava
-- no Asaas. A conferência diária (fn_asaas_nfe_disparar → fn_asaas_reconciliar_aplicar,
-- tipo 'nfe') passa a guardar também o status da nota no Asaas e o texto do erro.
-- vw_nfe_pendencias junta tudo e classifica o motivo (RPS, IBS/CBS, e-mail, endereço,
-- E0014 do Portal Nacional, nunca pedida, sem nota por decisão...).
-- =====================================================================================

ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS nfe_status_asaas text;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS nfe_erro_asaas text;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS nfe_verificado_em timestamptz;

-- Conferência diária grava status/erro da nota (troca cirúrgica antes do DELETE da fila)
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.fn_asaas_reconciliar_aplicar()'::regprocedure);
  v_novo text;
  v_alvo constant text := 'DELETE FROM public.asaas_reconciliacao_fila q';
BEGIN
  IF position('nfe_status_asaas' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_novo := replace(v_def, v_alvo, $sql$-- 07/11/2026: guarda o status da nota no Asaas e o motivo do erro (tela de notas)
  UPDATE public.faturas f
     SET nfe_status_asaas = x.st, nfe_erro_asaas = x.erro, nfe_verificado_em = now()
    FROM (
      SELECT q.fatura_id AS fid,
             CASE WHEN count(inv) = 0 THEN 'NENHUMA'
                  WHEN bool_or(inv->>'status' = 'AUTHORIZED') THEN 'AUTHORIZED'
                  WHEN bool_or(inv->>'status' IN ('SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZATION_PENDING', 'PROCESSING_CANCELLATION')) THEN 'PROCESSANDO'
                  WHEN bool_or(inv->>'status' = 'ERROR') THEN 'ERROR'
                  ELSE max(inv->>'status') END AS st,
             (array_agg(inv->>'statusDescription' ORDER BY inv->>'id' DESC)
                FILTER (WHERE inv->>'status' = 'ERROR'))[1] AS erro
        FROM public.asaas_reconciliacao_fila q
        JOIN net._http_response r ON r.id = q.request_id
        LEFT JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(r.content::jsonb->'data') = 'array'
                    THEN r.content::jsonb->'data' ELSE '[]'::jsonb END) inv ON true
       WHERE q.tipo = 'nfe' AND r.status_code = 200
       GROUP BY q.fatura_id
    ) x
   WHERE f.id = x.fid;

  $sql$ || v_alvo);
  IF v_novo = v_def THEN
    RAISE EXCEPTION 'fn_asaas_reconciliar_aplicar mudou: troca não aplicada';
  END IF;
  EXECUTE v_novo;
END $do$;

-- Pendências de nota (pagas nos últimos 180 dias sem PDF da nota)
CREATE OR REPLACE VIEW public.vw_nfe_pendencias WITH (security_invoker = true) AS
WITH base AS (
  SELECT f.*,
         lower(coalesce(f.nfe_erro_asaas, '') || ' ' || coalesce(f.status_nfe, '')) AS texto
  FROM public.faturas f
  WHERE f.ativo AND f.status = 'pago'
    AND (f.link_nfe IS NULL OR f.link_nfe !~ '^https?://')
    AND f.pago_em > now() - interval '180 days'
)
SELECT b.id AS fatura_id, b.id_asaas, b.empresa_id,
       coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome,
       b.paciente_id, pac.nome AS paciente_nome,
       b.responsavel_cobranca_id, resp.nome AS responsavel_nome,
       coalesce(b.tomador_nfe_id, b.responsavel_cobranca_id) AS tomador_id, tom.nome AS tomador_nome,
       b.valor_total, b.descricao, b.pago_em,
       (CURRENT_DATE - (b.pago_em AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_desde_pagamento,
       b.link_nfe, b.status_nfe, b.nfe_status_asaas, b.nfe_erro_asaas, b.nfe_verificado_em,
       b.nfe_dispensada, b.nfe_dispensada_motivo,
       CASE
         WHEN b.nfe_dispensada THEN 'sem_nota_decisao'
         WHEN b.nfe_status_asaas = 'AUTHORIZED' THEN 'autorizada_sem_link'
         WHEN b.texto LIKE '%rps%' THEN 'rps'
         WHEN b.texto LIKE '%em061%' OR b.texto LIKE '%ibs%' OR b.texto LIKE '%cbs%' THEN 'ibs_cbs'
         WHEN b.texto LIKE '%e0014%' OR b.texto LIKE '%dps%' THEN 'e0014_portal'
         WHEN b.texto LIKE '%e-mail%' OR b.texto LIKE '%email%' THEN 'email'
         WHEN b.texto LIKE '%endere%' OR b.texto LIKE '%cep%' THEN 'endereco'
         WHEN b.texto LIKE '%telefone%' OR b.texto LIKE '%celular%' THEN 'telefone'
         WHEN b.texto LIKE '%cpf%' OR b.texto LIKE '%cnpj%' THEN 'documento'
         WHEN b.texto LIKE '%cancelar nfe anterior%' THEN 'cancelamento_anterior'
         WHEN b.texto LIKE '%agendada%' THEN 'ja_agendada'
         WHEN b.nfe_status_asaas = 'PROCESSANDO' OR b.link_nfe = 'sincronizando'
              OR b.texto LIKE '%emitida com sucesso%' THEN 'em_processamento'
         WHEN b.nfe_status_asaas = 'NENHUMA'
              OR (b.link_nfe IS NULL AND b.status_nfe IS NULL AND b.nfe_status_asaas IS NULL) THEN 'nunca_pedida'
         WHEN b.nfe_status_asaas = 'ERROR' OR b.link_nfe = 'erro' THEN 'erro_sem_detalhe'
         ELSE 'outro'
       END AS motivo
FROM base b
LEFT JOIN public.pessoa_empresas e ON e.id = b.empresa_id
LEFT JOIN public.pessoas pac ON pac.id = b.paciente_id
LEFT JOIN public.pessoas resp ON resp.id = b.responsavel_cobranca_id
LEFT JOIN public.pessoas tom ON tom.id = coalesce(b.tomador_nfe_id, b.responsavel_cobranca_id);

GRANT SELECT ON public.vw_nfe_pendencias TO authenticated;
REVOKE ALL ON public.vw_nfe_pendencias FROM anon;

-- Marcar/desmarcar "sem nota por decisão" (admin/secretaria)
CREATE OR REPLACE FUNCTION public.fn_fatura_nfe_dispensar(p_fatura_id uuid, p_dispensar boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF NOT (a.sistema OR a.staff) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_dispensar AND nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo (ex.: recebido em dinheiro, família não quer nota)';
  END IF;
  UPDATE faturas
     SET nfe_dispensada = p_dispensar,
         nfe_dispensada_motivo = CASE WHEN p_dispensar
                                      THEN btrim(p_motivo) || ' (' || coalesce(a.nome, 'sistema') || ', ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ')'
                                      END,
         updated_at = now()
   WHERE id = p_fatura_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.fn_fatura_nfe_dispensar(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fatura_nfe_dispensar(uuid, boolean, text) TO authenticated;
