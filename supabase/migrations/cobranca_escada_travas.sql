-- =====================================================================================
-- Cobrança: travas, escada de inadimplência, negociação interna e cobrança automática
-- (07/11/2026, pedido do dono a partir da auditoria jun–out/2026)
--
-- 1. Valor zero: a consulta que sai de R$ 0 e estava "paga" sem fatura volta a pendente
--    (o truque SOCIAL → valor normal deixava sessões pagas sem cobrança: caso Melissa).
-- 2. Trava: consulta com link ou fatura não muda valor, serviço nem empresa. Para mudar,
--    tira-se a consulta da cobrança (ou cancela-se a cobrança) e só então se edita.
-- 3. faturas.nfe_dispensada: "sem nota por decisão" (recebido em dinheiro).
-- 4. Negociação interna: tira a família do robô, da cobrança automática e dos números
--    de inadimplência.
-- 5. Escada: até 15 dias o robô segue; 15 dias ou 4 lembretes = robô 1x/semana + tarefa
--    na aba Hoje; 30 dias = robô para + aviso na agenda; 60 dias = decisão do dono.
-- 6. Pré-cobrança vencida há 7 dias vira cobrança Pix no Asaas (cron dias úteis 10h).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Valor zero
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_mark_zero_value_as_paid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pago uuid;
  v_pendente uuid;
BEGIN
  SELECT id INTO v_pago FROM pagamento_status WHERE codigo = 'pago' LIMIT 1;
  IF NEW.valor_servico = 0.00 THEN
    IF v_pago IS NOT NULL THEN
      NEW.status_pagamento_id := v_pago;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.valor_servico = 0.00 AND NEW.valor_servico > 0
        AND NEW.status_pagamento_id = v_pago
        AND NEW.fatura_id IS NULL AND NEW.pagamento_link_id IS NULL THEN
    -- 07/11/2026: saiu do zero sem cobrança => não é pago, volta a pendente
    SELECT id INTO v_pendente FROM pagamento_status WHERE codigo = 'pendente' LIMIT 1;
    NEW.status_pagamento_id := v_pendente;
  END IF;
  RETURN NEW;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. Trava de consulta cobrada
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agendamento_trava_cobrada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fatura_viva boolean := false;
  v_link_vivo boolean := false;
BEGIN
  IF NEW.valor_servico IS NOT DISTINCT FROM OLD.valor_servico
     AND NEW.tipo_servico_id IS NOT DISTINCT FROM OLD.tipo_servico_id
     AND NEW.empresa_fatura IS NOT DISTINCT FROM OLD.empresa_fatura THEN
    RETURN NEW;
  END IF;
  -- sistema (cron, edge com service role, SQL) passa
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- tirar da cobrança no mesmo comando libera
  IF NEW.fatura_id IS DISTINCT FROM OLD.fatura_id
     OR NEW.pagamento_link_id IS DISTINCT FROM OLD.pagamento_link_id THEN
    RETURN NEW;
  END IF;

  IF OLD.fatura_id IS NOT NULL THEN
    SELECT f.ativo AND f.status <> 'cancelado' INTO v_fatura_viva
    FROM faturas f WHERE f.id = OLD.fatura_id;
  END IF;
  IF OLD.pagamento_link_id IS NOT NULL THEN
    SELECT pl.ativo AND pl.status <> 'cancelado' INTO v_link_vivo
    FROM pagamento_links pl WHERE pl.id = OLD.pagamento_link_id;
  END IF;

  IF coalesce(v_fatura_viva, false) OR coalesce(v_link_vivo, false) THEN
    RAISE EXCEPTION 'Esta consulta já está numa cobrança (%). Para mudar valor, serviço ou empresa, primeiro tire a consulta da cobrança (ou cancele a cobrança) e depois edite.',
      CASE WHEN coalesce(v_fatura_viva, false) THEN 'fatura do Asaas' ELSE 'link de pagamento' END
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agendamento_trava_cobrada ON public.agendamentos;
CREATE TRIGGER trg_agendamento_trava_cobrada
  BEFORE UPDATE OF valor_servico, tipo_servico_id, empresa_fatura ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_trava_cobrada();

-- -------------------------------------------------------------------------------------
-- 3. Sem nota por decisão
-- -------------------------------------------------------------------------------------
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS nfe_dispensada boolean NOT NULL DEFAULT false;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS nfe_dispensada_motivo text;

-- -------------------------------------------------------------------------------------
-- 4. Negociação interna
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cobranca_negociacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsavel_cobranca_id uuid NOT NULL REFERENCES public.pessoas(id),
  motivo text NOT NULL,
  criado_por uuid REFERENCES public.pessoas(id),
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  encerrada_em timestamptz,
  encerrada_por uuid REFERENCES public.pessoas(id),
  encerrada_por_nome text,
  observacao_encerramento text
);
CREATE UNIQUE INDEX IF NOT EXISTS cobranca_negociacoes_uma_aberta
  ON public.cobranca_negociacoes (responsavel_cobranca_id) WHERE encerrada_em IS NULL;

ALTER TABLE public.cobranca_negociacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_negociacoes_staff_select ON public.cobranca_negociacoes;
CREATE POLICY cobranca_negociacoes_staff_select ON public.cobranca_negociacoes
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
REVOKE ALL ON public.cobranca_negociacoes FROM anon;
GRANT SELECT ON public.cobranca_negociacoes TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_cobranca_em_negociacao(p_responsavel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM cobranca_negociacoes n
                 WHERE n.responsavel_cobranca_id = p_responsavel_id AND n.encerrada_em IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.fn_cobranca_negociacao(p_responsavel_id uuid, p_ativar boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  v_id uuid;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF NOT (a.sistema OR a.staff) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_responsavel_id IS NULL THEN
    RAISE EXCEPTION 'Responsável não informado';
  END IF;

  IF p_ativar THEN
    IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Explique a negociação (quem combinou e o quê)';
    END IF;
    INSERT INTO cobranca_negociacoes (responsavel_cobranca_id, motivo, criado_por, criado_por_nome)
    VALUES (p_responsavel_id, btrim(p_motivo), a.pessoa_id, coalesce(a.nome, 'sistema'))
    ON CONFLICT (responsavel_cobranca_id) WHERE encerrada_em IS NULL
    DO UPDATE SET motivo = EXCLUDED.motivo
    RETURNING id INTO v_id;
  ELSE
    UPDATE cobranca_negociacoes
       SET encerrada_em = now(), encerrada_por = a.pessoa_id, encerrada_por_nome = coalesce(a.nome, 'sistema'),
           observacao_encerramento = nullif(btrim(coalesce(p_motivo, '')), '')
     WHERE responsavel_cobranca_id = p_responsavel_id AND encerrada_em IS NULL
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.fn_cobranca_negociacao(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_negociacao(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_em_negociacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_em_negociacao(uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 5. Itens em atraso (pré-cobrança + Asaas) com a etapa da escada
--    dias contam do vencimento ORIGINAL do link (a cobrança do Asaas que nasceu dele
--    herda o atraso; o vencimento do Asaas é só o prazo do Pix).
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_inadimplencia_itens WITH (security_invoker = true) AS
WITH itens AS (
  SELECT 'pre_cobranca'::text AS tipo, pl.id AS pagamento_link_id, NULL::uuid AS fatura_id,
         pl.responsavel_cobranca_id, pl.paciente_id, pl.empresa_id, pl.valor_base AS valor,
         pl.vencimento, coalesce(pl.lembretes_enviados, 0) AS lembretes, pl.ultimo_lembrete_em,
         pl.token
  FROM public.pagamento_links pl
  WHERE pl.ativo AND pl.status IN ('pendente', 'expirado') AND pl.id_asaas IS NULL
    AND pl.fatura_id IS NULL AND pl.vencimento < CURRENT_DATE
  UNION ALL
  SELECT 'asaas', l.id, f.id, f.responsavel_cobranca_id, f.paciente_id, f.empresa_id, f.valor_total,
         coalesce(l.vencimento, f.vencimento),
         coalesce(f.lembretes_enviados, 0) + coalesce(l.lembretes_enviados, 0),
         greatest(f.ultimo_lembrete_em, l.ultimo_lembrete_em),
         l.token
  FROM public.faturas f
  LEFT JOIN LATERAL (SELECT x.* FROM public.pagamento_links x WHERE x.fatura_id = f.id
                     ORDER BY x.criado_em LIMIT 1) l ON true
  WHERE f.ativo AND f.status IN ('pendente', 'atrasado') AND f.id_asaas IS NOT NULL
    AND coalesce(l.vencimento, f.vencimento) < CURRENT_DATE
)
SELECT i.*,
       (CURRENT_DATE - i.vencimento) AS dias,
       public.fn_cobranca_em_negociacao(i.responsavel_cobranca_id) AS em_negociacao,
       CASE WHEN public.fn_cobranca_em_negociacao(i.responsavel_cobranca_id) THEN 'negociacao'
            WHEN CURRENT_DATE - i.vencimento >= 60 THEN 'd60'
            WHEN CURRENT_DATE - i.vencimento >= 30 THEN 'd30'
            WHEN CURRENT_DATE - i.vencimento >= 15 OR i.lembretes >= 4 THEN 'd15'
            ELSE 'regua' END AS etapa
FROM itens i;

GRANT SELECT ON public.vw_inadimplencia_itens TO authenticated;
REVOKE ALL ON public.vw_inadimplencia_itens FROM anon;

-- Números do painel: negociação interna sai da inadimplência
CREATE OR REPLACE VIEW public.vw_pendencias_financeiras AS
 WITH nc AS (
         SELECT count(*) AS qtd,
            COALESCE(sum(v.valor_servico), 0::numeric) AS valor,
            min(v.data_hora)::date AS mais_antiga
           FROM vw_agendamentos_completos v
             JOIN agendamentos a ON a.id = v.id
          WHERE v.ativo = true AND v.fatura_id IS NULL AND a.pagamento_link_id IS NULL
            AND v.status_pagamento_codigo = 'pendente'::text AND v.status_consulta_codigo <> 'cancelado'::text
            AND v.data_hora < date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)
        ), atr AS (
         SELECT count(*) AS qtd, COALESCE(sum(i.valor), 0::numeric) AS valor
           FROM vw_inadimplencia_itens i
          WHERE NOT i.em_negociacao
        )
 SELECT nc.qtd AS nao_cobradas_qtd,
    nc.valor AS nao_cobradas_valor,
    nc.mais_antiga AS nao_cobradas_desde,
    atr.qtd AS atrasadas_qtd,
    atr.valor AS atrasadas_valor
   FROM nc, atr;

-- Aviso na agenda: dívida da família do paciente (só admin/secretaria veem valores)
CREATE OR REPLACE FUNCTION public.fn_inadimplencia_paciente(p_paciente_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resp uuid;
  r record;
BEGIN
  IF NOT public.fn_rls_admin_secretaria_ativo() THEN
    RETURN NULL;
  END IF;
  SELECT responsavel_cobranca_id INTO v_resp FROM pessoas WHERE id = p_paciente_id;
  SELECT count(*) AS n, coalesce(sum(i.valor), 0) AS valor, max(i.dias) AS dias,
         bool_or(i.em_negociacao) AS negociacao
    INTO r
    FROM vw_inadimplencia_itens i
   WHERE i.paciente_id = p_paciente_id
      OR (v_resp IS NOT NULL AND i.responsavel_cobranca_id = v_resp);
  IF coalesce(r.n, 0) = 0 THEN
    RETURN jsonb_build_object('n', 0);
  END IF;
  RETURN jsonb_build_object('n', r.n, 'valor', r.valor, 'dias', r.dias, 'negociacao', coalesce(r.negociacao, false));
END $$;
REVOKE ALL ON FUNCTION public.fn_inadimplencia_paciente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_inadimplencia_paciente(uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 5b. A escada dentro de quem decide se o lembrete sai (régua do banco + n8n do Asaas)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cobranca_pode_lembrar(
  p_fatura_id uuid DEFAULT NULL::uuid,
  p_pagamento_link_id uuid DEFAULT NULL::uuid,
  p_id_asaas text DEFAULT NULL::text,
  p_canal text DEFAULT NULL::text,
  p_registrar boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a       record;
  cfg     public.cobranca_config;
  v_fat   public.faturas;
  v_link  public.pagamento_links;
  s       public.cobranca_suspensoes;
  v_fim   uuid;
  v_base  timestamptz;
  v_n     integer;
  v_r     jsonb;
  v_motivo text;
  v_resp  uuid;
  v_dias  integer;
  v_lemb  integer;
  v_ult   timestamptz;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF NOT (a.sistema OR a.staff) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  IF p_id_asaas IS NOT NULL AND p_fatura_id IS NULL THEN
    SELECT * INTO v_fat FROM public.faturas f WHERE f.id_asaas = p_id_asaas AND f.ativo LIMIT 1;
  ELSIF p_fatura_id IS NOT NULL THEN
    SELECT * INTO v_fat FROM public.faturas f WHERE f.id = p_fatura_id;
  END IF;
  IF v_fat.id IS NULL AND p_pagamento_link_id IS NOT NULL THEN
    SELECT * INTO v_link FROM public.pagamento_links pl WHERE pl.id = p_pagamento_link_id;
    IF v_link.fatura_id IS NOT NULL THEN
      SELECT * INTO v_fat FROM public.faturas f WHERE f.id = v_link.fatura_id;
    END IF;
  END IF;

  IF v_fat.id IS NULL AND v_link.id IS NULL THEN
    v_motivo := 'NAO_ENCONTRADA';
  ELSIF v_fat.id IS NOT NULL AND NOT (v_fat.ativo AND v_fat.status IN ('pendente', 'atrasado')) THEN
    v_motivo := 'FATURA_' || upper(coalesce(v_fat.status, 'inativa'));
  ELSIF v_fat.id IS NULL AND NOT (v_link.ativo IS NOT FALSE AND v_link.status IN ('pendente', 'expirado')) THEN
    v_motivo := 'PRE_COBRANCA_' || upper(coalesce(v_link.status, 'inativa'));
  END IF;

  IF v_motivo IS NULL THEN
    s := public.fn_cobranca_suspensao_vigente(v_fat.id, CASE WHEN v_fat.id IS NULL THEN v_link.id END);
    IF s.id IS NOT NULL THEN
      v_motivo := CASE s.status WHEN 'escalada' THEN 'PAUSADA_PRAZO_VENCIDO' ELSE 'PAUSADA' END;
    END IF;
  END IF;

  IF v_motivo IS NULL THEN
    v_fim := public.fn_cobranca_encerrada_sem_divida(v_fat.id, CASE WHEN v_fat.id IS NULL THEN v_link.id END);
    IF v_fim IS NOT NULL THEN
      v_motivo := 'ENCERRADA_SEM_DIVIDA';
    END IF;
  END IF;

  -- 07/11/2026: negociação interna e escada de inadimplência
  IF v_motivo IS NULL THEN
    IF v_fat.id IS NOT NULL AND v_link.id IS NULL THEN
      SELECT * INTO v_link FROM public.pagamento_links x WHERE x.fatura_id = v_fat.id ORDER BY x.criado_em LIMIT 1;
    END IF;
    v_resp := coalesce(v_fat.responsavel_cobranca_id, v_link.responsavel_cobranca_id);
    v_dias := CURRENT_DATE - coalesce(v_link.vencimento, v_fat.vencimento);
    v_lemb := coalesce(v_fat.lembretes_enviados, 0) + coalesce(v_link.lembretes_enviados, 0);
    v_ult := greatest(v_fat.ultimo_lembrete_em, v_link.ultimo_lembrete_em);
    IF v_resp IS NOT NULL AND public.fn_cobranca_em_negociacao(v_resp) THEN
      v_motivo := 'NEGOCIACAO_INTERNA';
    ELSIF v_dias >= 30 THEN
      v_motivo := 'ESCADA_30_DIAS';
    ELSIF (v_dias >= 15 OR v_lemb >= 4) AND v_ult > now() - interval '6 days' THEN
      v_motivo := 'ESCADA_SEMANAL';
    END IF;
  END IF;

  IF v_motivo IS NULL THEN
    SELECT * INTO cfg FROM public.cobranca_config LIMIT 1;
    SELECT max(x.encerrada_em) INTO v_base
    FROM public.cobranca_suspensoes x
    WHERE x.resultado = 'divida_confirmada'
      AND ((v_fat.id IS NOT NULL AND x.fatura_id = v_fat.id)
           OR x.pagamento_link_id = coalesce(v_link.id, '00000000-0000-0000-0000-000000000000'::uuid));
    SELECT count(*) INTO v_n
    FROM public.cobranca_disparo_log l
    WHERE l.tipo = 'lembrete' AND l.status = 'enviado'
      AND l.criado_em > coalesce(v_base, '-infinity'::timestamptz)
      AND ((v_fat.id IS NOT NULL AND l.fatura_id = v_fat.id)
           OR (v_fat.id IS NULL AND l.pagamento_link_id = v_link.id));
    IF cfg.teto_lembretes_automaticos IS NOT NULL AND v_n >= cfg.teto_lembretes_automaticos THEN
      v_r := public.fn_cobranca_suspender(
               p_fatura_id := v_fat.id,
               p_pagamento_link_id := CASE WHEN v_fat.id IS NULL THEN v_link.id END,
               p_motivo := 'teto_lembretes',
               p_detalhe := v_n || ' lembretes automáticos enviados sem pagamento',
               p_origem := 'sistema',
               p_notificar := false);
      v_motivo := 'TETO_LEMBRETES';
      s.id := (v_r ->> 'suspensao_id')::uuid;
    END IF;
  END IF;

  IF v_motivo IS NULL THEN
    RETURN jsonb_build_object('pode', true);
  END IF;

  -- bloqueio esperado da escada não polui o histórico de eventos
  IF p_registrar AND v_motivo NOT IN ('ESCADA_SEMANAL', 'ESCADA_30_DIAS', 'NEGOCIACAO_INTERNA') THEN
    INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, canal, detalhe, ator_nome)
    VALUES (s.id, v_fat.id, v_link.id, 'lembrete_bloqueado', p_canal,
            v_motivo || CASE WHEN v_fat.id IS NULL AND v_link.id IS NULL
                             THEN ' (' || coalesce(p_id_asaas, p_fatura_id::text, p_pagamento_link_id::text) || ')' ELSE '' END,
            coalesce(a.nome, 'sistema'));
  END IF;

  RETURN jsonb_build_object('pode', false, 'motivo', v_motivo, 'suspensao_id', s.id, 'dias', v_dias);
END $$;

-- -------------------------------------------------------------------------------------
-- 5c. Tarefas da escada na aba Hoje (Conversas)
-- -------------------------------------------------------------------------------------
ALTER TABLE public.conversas_tarefas DROP CONSTRAINT IF EXISTS conversas_tarefas_tipo_check;
ALTER TABLE public.conversas_tarefas ADD CONSTRAINT conversas_tarefas_tipo_check
  CHECK (tipo = ANY (ARRAY['familia_aguardando', 'pedido_ju', 'followup', 'reclamacao', 'lead', 'inadimplencia']));

-- itens prontos para a aba Hoje (1 por família na etapa em que está)
CREATE OR REPLACE FUNCTION public.fn_inadimplencia_tarefas()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH fam AS (
    SELECT i.responsavel_cobranca_id AS resp, sum(i.valor) AS valor, count(*) AS n,
           max(i.dias) AS dias, max(i.lembretes) AS lembretes, min(i.vencimento) AS desde,
           (array_agg(i.paciente_id ORDER BY i.vencimento))[1] AS paciente_id
    FROM vw_inadimplencia_itens i
    WHERE NOT i.em_negociacao AND i.responsavel_cobranca_id IS NOT NULL
    GROUP BY 1
  ), etapa AS (
    SELECT f.*, CASE WHEN f.dias >= 60 THEN 60 WHEN f.dias >= 30 THEN 30
                     WHEN f.dias >= 15 OR f.lembretes >= 4 THEN 15 END AS e
    FROM fam f
  )
  SELECT jsonb_build_object(
    'tipo', 'inadimplencia', 'ref', 'inad:' || e.resp || ':' || e.e,
    'prioridade', CASE WHEN e.e >= 30 THEN 'alta' ELSE 'media' END,
    'responsavel', CASE WHEN e.e = 60 THEN 'Gestão' ELSE 'Financeiro' END,
    'titulo', CASE e.e
        WHEN 15 THEN 'Ligar ou mandar áudio: ' || public.fn_brl(e.valor) || ' vencido há ' || e.dias || ' dias'
        WHEN 30 THEN 'Robô parou de cobrar: ' || public.fn_brl(e.valor) || ' vencido há ' || e.dias || ' dias'
        ELSE 'Decidir a cobrança: ' || public.fn_brl(e.valor) || ' vencido há ' || e.dias || ' dias' END,
    'descricao', CASE e.e
        WHEN 15 THEN 'O lembrete automático passou a sair só 1 vez por semana. Uma ligação ou um áudio costuma resolver.'
        WHEN 30 THEN 'Nenhum lembrete automático sai mais, e a agenda avisa ao marcar sessão nova. Se houver acordo combinado, marque Negociação interna em Cobranças.'
        ELSE 'Mais de 60 dias. Opções: acordo (Negociação interna), cobrança no Asaas com boleto e negativação, ou suspender novos agendamentos até regularizar.' END,
    'evidencia', e.n || CASE WHEN e.n = 1 THEN ' cobrança' ELSE ' cobranças' END || ' em aberto · ' || e.lembretes || ' lembrete(s) enviados',
    'desde', e.desde, 'atividade', e.desde,
    'nome', coalesce(p.nome, 'Responsável'),
    'telefone', p.telefone::text,
    'paciente_id', e.paciente_id,
    'link_interno', '/cobrancas',
    'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
               FROM conversas_tarefas t WHERE t.tipo = 'inadimplencia' AND t.ref = 'inad:' || e.resp || ':' || e.e
                 AND t.status = 'assumida'))
  FROM etapa e
  JOIN pessoas p ON p.id = e.resp
  WHERE e.e IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM conversas_tarefas t WHERE t.tipo = 'inadimplencia'
                      AND t.ref = 'inad:' || e.resp || ':' || e.e AND t.status = 'resolvida');
$$;
REVOKE ALL ON FUNCTION public.fn_inadimplencia_tarefas() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 6. Pré-cobrança vencida há 7 dias vira cobrança Pix no Asaas
-- -------------------------------------------------------------------------------------
ALTER TABLE public.pagamento_links ADD COLUMN IF NOT EXISTS conversao_tentada_em timestamptz;
ALTER TABLE public.pagamento_links ADD COLUMN IF NOT EXISTS conversao_erro text;
ALTER TABLE public.pagamento_links ADD COLUMN IF NOT EXISTS convertido_auto_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_pre_cobranca_converter_asaas(p_limite integer DEFAULT 15)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n integer := 0;
  v_anon constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMTI5MTgsImV4cCI6MjA2NzU4ODkxOH0.Fm5yqwPUeGRPriONRXaOZ8T7tySeebfCIMYb9Hx_Y6I';
BEGIN
  FOR r IN
    SELECT pl.id, pl.token
    FROM pagamento_links pl
    WHERE pl.ativo AND pl.status IN ('pendente', 'expirado')
      AND pl.id_asaas IS NULL AND pl.fatura_id IS NULL
      AND pl.valor_base > 0
      AND pl.vencimento <= CURRENT_DATE - 7
      AND (pl.conversao_tentada_em IS NULL OR pl.conversao_tentada_em < now() - interval '20 hours')
      AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.pagamento_link_id = pl.id AND a.ativo AND a.fatura_id IS NULL)
      -- só sessões que já aconteceram
      AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.pagamento_link_id = pl.id AND a.ativo
                        AND a.data_hora > (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
      AND NOT public.fn_cobranca_em_negociacao(pl.responsavel_cobranca_id)
      AND (public.fn_cobranca_suspensao_vigente(NULL, pl.id)).id IS NULL
    ORDER BY pl.vencimento
    LIMIT greatest(least(p_limite, 30), 1)
  LOOP
    UPDATE pagamento_links
       SET status = 'pendente',
           expira_em = greatest(coalesce(expira_em, now()), now() + interval '30 days'),
           conversao_tentada_em = now(), conversao_erro = NULL, atualizado_em = now()
     WHERE id = r.id;
    PERFORM net.http_post(
      url := 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1/confirm-payment-link',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_anon, 'Authorization', 'Bearer ' || v_anon),
      body := jsonb_build_object('token', r.token, 'forma', 'pix', 'origem', 'auto_7dias'),
      timeout_milliseconds := 60000);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_pre_cobranca_converter_asaas(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('pre-cobranca-converter-asaas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pre-cobranca-converter-asaas');
SELECT cron.schedule('pre-cobranca-converter-asaas', '0 13 * * 1-5', $$SELECT public.fn_pre_cobranca_converter_asaas(15)$$);

REVOKE ALL ON FUNCTION public.fn_agendamento_trava_cobrada() FROM PUBLIC, anon, authenticated;

-- Aba Hoje: acrescenta as tarefas da escada (troca cirúrgica no corpo atual da função)
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.fn_conversas_hoje()'::regprocedure);
  v_novo text;
BEGIN
  IF position('fn_inadimplencia_tarefas' IN v_def) > 0 THEN
    RETURN; -- já aplicado
  END IF;
  v_novo := replace(v_def,
    'UNION ALL SELECT item FROM i_revisar) u;',
    'UNION ALL SELECT item FROM i_revisar UNION ALL SELECT x FROM public.fn_inadimplencia_tarefas() x) u;');
  v_novo := replace(v_novo,
    '''cobrancas_conferencia'', count(*) FILTER (WHERE x ->> ''tipo'' = ''cobranca''),',
    '''cobrancas_conferencia'', count(*) FILTER (WHERE x ->> ''tipo'' = ''cobranca''),' || chr(10) ||
    '    ''inadimplencia'', count(*) FILTER (WHERE x ->> ''tipo'' = ''inadimplencia''),');
  IF v_novo = v_def OR position('fn_inadimplencia_tarefas' IN v_novo) = 0
     OR position('''inadimplencia'', count(*)' IN v_novo) = 0 THEN
    RAISE EXCEPTION 'fn_conversas_hoje mudou: troca não aplicada';
  END IF;
  EXECUTE v_novo;
END $do$;
