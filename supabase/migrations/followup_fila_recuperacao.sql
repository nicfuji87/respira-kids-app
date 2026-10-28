-- P1 da central de Conversas (28/10/2026): recuperar a fila de follow-up.
--
-- * O resumo diário (cron whatsapp-followup-reminder → fn_enqueue_whatsapp_followups)
--   foi desligado: mandava até 200 pendências velhas todo dia para um nó do n8n
--   que já estava desativado. A função fica, sem agendamento.
-- * Os 243 pendentes são reclassificados pela AÇÃO que ficou pendente, não por
--   quem falou por último. Só fecha sozinho o que o sistema prova:
--     nota fiscal → toda fatura paga da família tem nota;
--     pagamento   → nada em aberto E pagamento registrado depois da conversa;
--     agenda      → consulta criada depois da conversa;
--     contrato    → contrato de todos os pacientes assinado.
--   Pendência que o sistema confirma (nota faltando, fatura em aberto) e conversa
--   recente (14 dias) continuam pendentes. O resto vai para revisão humana.
-- * Nada é apagado: status, tipo de ação e motivo ficam registrados.

SELECT cron.unschedule('whatsapp-followup-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-followup-reminder');

ALTER TABLE public.whatsapp_conversas DROP CONSTRAINT IF EXISTS whatsapp_conversas_followup_status_check;
ALTER TABLE public.whatsapp_conversas ADD CONSTRAINT whatsapp_conversas_followup_status_check
  CHECK (followup_status = ANY (ARRAY['pendente', 'concluido', 'ignorado', 'nao_aplicavel',
                                      'resolvido_sistema', 'em_revisao']));

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS followup_tipo_acao text,
  ADD COLUMN IF NOT EXISTS followup_motivo text,
  ADD COLUMN IF NOT EXISTS followup_reclassificado_em timestamptz;

-- Classifica a ação pendente pelo texto da recomendação da IA.
CREATE OR REPLACE FUNCTION public.fn_followup_tipo_acao(p_acao text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_acao ~* '(nota fiscal|\mNF\M|NFS|RPS)' THEN 'nota_fiscal'
    WHEN p_acao ~* '(contrato|assinatura)' THEN 'contrato'
    WHEN p_acao ~* '(comprovante|baixa|pagamento|cobran|fatura|pix|parcel|duplicidade|valor pago)' THEN 'pagamento'
    WHEN p_acao ~* '(cancel|desmarc)' THEN 'cancelamento'
    WHEN p_acao ~* '(hor[aá]rio|agend|avalia|remarc|disponibilidade|sess[aã]o|vaga|lista de espera)' THEN 'agenda'
    WHEN p_acao ~* '(valor|pre[cç]o|pacote|or[cç]amento)' THEN 'valor'
    ELSE 'outro' END;
$$;

-- Reclassifica os pendentes. p_aplicar=false só simula.
CREATE OR REPLACE FUNCTION public.fn_followup_reclassificar(p_aplicar boolean DEFAULT false)
RETURNS TABLE (tipo_acao text, destino text, motivo text, quantidade bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _fu_class (id uuid, tipo text, destino text, motivo text) ON COMMIT DROP;
  TRUNCATE _fu_class;

  INSERT INTO _fu_class
  WITH p AS (
    SELECT v.id, v.acao_recomendada AS a,
           coalesce(v.ultima_mensagem_em, v.created_at) AS ult, v.cliente_cadastrado AS cad,
           array(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(to_jsonb(v.pacientes_vinculados)) x) AS pacs,
           coalesce(to_jsonb(v.faturas_sistema), '[]'::jsonb) AS fats
    FROM public.vw_whatsapp_conversas_enriquecidas v
    WHERE v.necessita_followup AND v.followup_status = 'pendente'
  ),
  t AS (SELECT p.*, public.fn_followup_tipo_acao(p.a) AS tipo FROM p),
  e AS (
    SELECT t.*,
      (t.tipo = 'nota_fiscal' AND t.cad AND jsonb_array_length(t.fats) > 0
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.fats) f
                         WHERE f ->> 'status' = 'pago' AND NOT coalesce((f ->> 'tem_nfe')::boolean, false))) AS nf_ok,
      (t.tipo = 'nota_fiscal'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.fats) f
                     WHERE f ->> 'status' = 'pago' AND NOT coalesce((f ->> 'tem_nfe')::boolean, false))) AS nf_falta,
      (SELECT max(f.pago_em) FROM public.faturas f
        WHERE t.tipo = 'pagamento' AND t.cad AND f.paciente_id = ANY (t.pacs) AND f.status = 'pago'
          AND f.pago_em >= t.ult - interval '3 days'
          AND NOT EXISTS (SELECT 1 FROM public.faturas f2 WHERE f2.paciente_id = ANY (t.pacs) AND f2.ativo
                            AND f2.status IN ('pendente', 'atrasado'))
          AND NOT EXISTS (SELECT 1 FROM public.pagamento_links pl WHERE pl.paciente_id = ANY (t.pacs) AND pl.ativo
                            AND pl.fatura_id IS NULL AND pl.status IN ('pendente', 'expirado'))) AS pago_em,
      (t.tipo = 'pagamento'
         AND EXISTS (SELECT 1 FROM public.faturas f WHERE f.paciente_id = ANY (t.pacs) AND f.ativo
                       AND f.status IN ('pendente', 'atrasado'))) AS pag_aberto,
      (SELECT min(ag.created_at) FROM public.agendamentos ag
        WHERE t.tipo IN ('agenda', 'valor') AND ag.paciente_id = ANY (t.pacs) AND ag.ativo
          AND ag.created_at >= t.ult - interval '1 day') AS agendado_em,
      (t.tipo = 'contrato' AND cardinality(t.pacs) > 0
         AND NOT EXISTS (SELECT 1 FROM unnest(t.pacs) pid
                         WHERE NOT EXISTS (SELECT 1 FROM public.user_contracts uc
                                           WHERE uc.pessoa_id = pid AND uc.ativo AND uc.status_contrato = 'assinado'))) AS ct_ok
    FROM t
  )
  SELECT e.id, e.tipo,
    CASE
      WHEN e.nf_ok OR e.pago_em IS NOT NULL OR e.agendado_em IS NOT NULL OR e.ct_ok THEN 'resolvido_sistema'
      WHEN e.nf_falta OR e.pag_aberto THEN 'pendente'
      WHEN e.ult >= now() - interval '14 days' THEN 'pendente'
      ELSE 'em_revisao' END,
    CASE
      WHEN e.nf_ok THEN 'Todas as faturas pagas da família têm nota fiscal'
      WHEN e.pago_em IS NOT NULL THEN 'Sem cobrança em aberto; pagamento registrado em '
                                      || to_char(e.pago_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
      WHEN e.agendado_em IS NOT NULL THEN 'Consulta lançada na agenda em '
                                          || to_char(e.agendado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
      WHEN e.ct_ok THEN 'Contrato assinado'
      WHEN e.nf_falta THEN 'Há fatura paga sem nota fiscal'
      WHEN e.pag_aberto THEN 'Ainda há cobrança em aberto'
      WHEN e.ult >= now() - interval '14 days' THEN 'Conversa recente'
      ELSE 'O sistema não mostra se foi resolvido' END
  FROM e;

  IF p_aplicar THEN
    UPDATE public.whatsapp_conversas w
       SET followup_status = c.destino,
           followup_tipo_acao = c.tipo,
           followup_motivo = c.motivo,
           followup_reclassificado_em = now(),
           followup_concluido_em = CASE WHEN c.destino = 'resolvido_sistema' THEN now() ELSE w.followup_concluido_em END
      FROM _fu_class c
     WHERE w.id = c.id;
  END IF;

  RETURN QUERY
  SELECT c.tipo, c.destino, CASE WHEN c.destino = 'resolvido_sistema' THEN regexp_replace(c.motivo, ' em \d.*$', '') ELSE c.motivo END,
         count(*)
  FROM _fu_class c GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_followup_reclassificar(boolean) FROM PUBLIC, anon, authenticated;

-- Regra para as próximas: conversa que já tinha saído da fila e recebe mensagem
-- nova pedindo ação volta para pendente (antes ficava escondida como concluída).
CREATE OR REPLACE FUNCTION public.fn_followup_reabrir_com_conversa_nova()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.hash_conteudo IS DISTINCT FROM OLD.hash_conteudo
     AND NEW.necessita_followup
     AND OLD.followup_status IN ('concluido', 'ignorado', 'resolvido_sistema', 'em_revisao', 'nao_aplicavel')
     AND NEW.ultima_mensagem_em > coalesce(OLD.followup_concluido_em, OLD.followup_reclassificado_em, OLD.updated_at)
     AND NEW.ultima_mensagem_remetente = 'cliente' THEN
    NEW.followup_status := 'pendente';
    NEW.followup_concluido_em := NULL;
    NEW.followup_concluido_por := NULL;
    NEW.followup_lembrete_enviado_em := NULL;
    NEW.followup_tipo_acao := public.fn_followup_tipo_acao(NEW.acao_recomendada);
    NEW.followup_motivo := 'Reaberto: a família escreveu de novo e a conversa pede ação';
  ELSIF NEW.hash_conteudo IS DISTINCT FROM OLD.hash_conteudo AND NEW.necessita_followup THEN
    NEW.followup_tipo_acao := public.fn_followup_tipo_acao(NEW.acao_recomendada);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_followup_reabrir ON public.whatsapp_conversas;
CREATE TRIGGER trg_followup_reabrir
  BEFORE UPDATE ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.fn_followup_reabrir_com_conversa_nova();

-- Aplica a reclassificação dos pendentes de hoje.
SELECT * FROM public.fn_followup_reclassificar(true);
