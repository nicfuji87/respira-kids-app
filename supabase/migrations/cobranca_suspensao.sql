-- P0 da central de Conversas (28/10/2026): pausa auditável de cobrança.
--
-- Problema: o sistema gera cobrança e lembrete sozinho, mas não tinha como parar
-- quando a família diz que já pagou, contesta ou recebe cobrança duplicada.
-- 24 de 29 reclamações do histórico vêm de falha interna, 14 delas de cobrança
-- indevida.
--
-- Regras (decididas pelo dono):
--  * pausar só congela os lembretes; quem decide é o Financeiro;
--  * vencido o prazo de conferência (3 dias úteis), a TAREFA escala, a cobrança
--    continua parada;
--  * só uma pessoa (admin, logada) retoma a cobrança, e só registrando o
--    resultado. Nenhum fluxo automático reabre pausa de outro;
--  * pagamento confirmado ou cobrança cancelada = sem lembrete para sempre;
--  * teto de lembretes automáticos: atingiu, a cobrança pausa sozinha e vai para
--    o Financeiro;
--  * na dúvida, não envia (alvo não encontrado, cobrança fora de aberto etc.).
--
-- Quem pergunta antes de enviar: fn_enqueue_lembretes_pre_cobranca (régua do
-- banco) e o n8n "[Sistema RK] Asaas Inadimplencia 3" (flows-disp), via
-- fn_cobranca_pode_lembrar.

-- =====================================================================
-- Configuração (uma linha)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cobranca_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  teto_lembretes_automaticos integer NOT NULL DEFAULT 6 CHECK (teto_lembretes_automaticos > 0),
  dias_uteis_verificacao integer NOT NULL DEFAULT 3 CHECK (dias_uteis_verificacao > 0),
  responsavel_verificacao_id uuid REFERENCES public.pessoas(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cobranca_config DEFAULT VALUES ON CONFLICT DO NOTHING;

ALTER TABLE public.cobranca_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_config_admin_select ON public.cobranca_config;
CREATE POLICY cobranca_config_admin_select ON public.cobranca_config
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
REVOKE ALL ON public.cobranca_config FROM anon;
GRANT SELECT ON public.cobranca_config TO authenticated;

-- =====================================================================
-- Pausas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cobranca_suspensoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid REFERENCES public.faturas(id),
  pagamento_link_id uuid REFERENCES public.pagamento_links(id),
  responsavel_cobranca_id uuid REFERENCES public.pessoas(id),
  paciente_id uuid REFERENCES public.pessoas(id),
  motivo text NOT NULL CHECK (motivo IN (
    'pagamento_informado',   -- família diz que pagou, ainda não confirmado
    'pagamento_fora_asaas',  -- Pix direto, dinheiro, transferência
    'contestacao',           -- família contesta valor ou sessão
    'duplicidade',           -- cobrança em duplicidade
    'teto_lembretes',        -- o sistema atingiu o limite de lembretes
    'outro')),
  detalhe text,
  origem text NOT NULL CHECK (origem IN ('ju', 'equipe', 'sistema')),
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'escalada', 'encerrada')),
  resultado text CHECK (resultado IN (
    'pagamento_confirmado',  -- encerra cobrança e lembretes
    'divida_confirmada',     -- retoma os lembretes
    'cobranca_cancelada')),  -- encerra cobrança e lembretes
  responsavel_verificacao_id uuid REFERENCES public.pessoas(id),
  prazo_verificacao timestamptz NOT NULL,
  conversa_ref text,
  criado_por uuid REFERENCES public.pessoas(id),
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  escalada_em timestamptz,
  encerrada_em timestamptz,
  encerrada_por uuid REFERENCES public.pessoas(id),
  encerrada_por_nome text,
  observacao_encerramento text,
  CONSTRAINT cobranca_suspensoes_um_alvo CHECK (num_nonnulls(fatura_id, pagamento_link_id) = 1),
  CONSTRAINT cobranca_suspensoes_resultado_coerente CHECK ((status = 'encerrada') = (resultado IS NOT NULL))
);

-- Uma pausa aberta por cobrança.
CREATE UNIQUE INDEX IF NOT EXISTS cobranca_suspensoes_uma_aberta
  ON public.cobranca_suspensoes ((coalesce(fatura_id, pagamento_link_id)))
  WHERE status IN ('ativa', 'escalada');
CREATE INDEX IF NOT EXISTS cobranca_suspensoes_fatura_idx ON public.cobranca_suspensoes (fatura_id) WHERE fatura_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cobranca_suspensoes_link_idx ON public.cobranca_suspensoes (pagamento_link_id) WHERE pagamento_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cobranca_suspensoes_abertas_prazo_idx ON public.cobranca_suspensoes (prazo_verificacao) WHERE status = 'ativa';

CREATE TABLE IF NOT EXISTS public.cobranca_suspensao_eventos (
  id bigserial PRIMARY KEY,
  suspensao_id uuid REFERENCES public.cobranca_suspensoes(id),
  fatura_id uuid,
  pagamento_link_id uuid,
  evento text NOT NULL CHECK (evento IN ('criada', 'reforcada', 'escalada', 'encerrada', 'lembrete_bloqueado')),
  canal text,
  detalhe text,
  ator_id uuid,
  ator_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cobranca_suspensao_eventos_susp_idx ON public.cobranca_suspensao_eventos (suspensao_id);
CREATE INDEX IF NOT EXISTS cobranca_suspensao_eventos_data_idx ON public.cobranca_suspensao_eventos (criado_em);

ALTER TABLE public.cobranca_suspensoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobranca_suspensao_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_suspensoes_staff_select ON public.cobranca_suspensoes;
CREATE POLICY cobranca_suspensoes_staff_select ON public.cobranca_suspensoes
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
DROP POLICY IF EXISTS cobranca_suspensao_eventos_staff_select ON public.cobranca_suspensao_eventos;
CREATE POLICY cobranca_suspensao_eventos_staff_select ON public.cobranca_suspensao_eventos
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
-- Escrita só pelas funções abaixo.
REVOKE ALL ON public.cobranca_suspensoes, public.cobranca_suspensao_eventos FROM anon, authenticated;
GRANT SELECT ON public.cobranca_suspensoes, public.cobranca_suspensao_eventos TO authenticated;

-- =====================================================================
-- Auxiliares
-- =====================================================================

-- n-ésimo dia útil depois de p_data (sem sábado, domingo e followup_feriados).
CREATE OR REPLACE FUNCTION public.fn_dias_uteis_somar(p_data date, p_dias integer)
RETURNS date
LANGUAGE plpgsql STABLE
SET search_path TO ''
AS $$
DECLARE
  d date := p_data;
  n integer := 0;
BEGIN
  WHILE n < p_dias LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6
       AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = d) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- Quem está chamando: pessoa logada, ou o sistema (service_role, cron, MCP).
-- session_user e não current_user: dentro de SECURITY DEFINER o current_user é
-- sempre o dono da função. Pelo PostgREST o session_user é 'authenticator' e o
-- papel vem do JWT; cron e SQL direto entram como 'postgres'.
CREATE OR REPLACE FUNCTION public.fn_cobranca_ator()
RETURNS TABLE (pessoa_id uuid, nome text, sistema boolean, admin boolean, staff boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.id, p.nome,
         (auth.uid() IS NULL AND (coalesce(auth.role(), '') = 'service_role' OR session_user = 'postgres')),
         coalesce(p.role = 'admin' AND p.ativo, false),
         coalesce(p.role IN ('admin', 'secretaria') AND p.ativo, false)
  FROM (SELECT 1) x
  LEFT JOIN public.pessoas p ON p.auth_user_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

-- Pausa aberta que vale para a cobrança. Olha a fatura E os links dela (a
-- pré-cobrança vira fatura quando a família escolhe a forma de pagar).
CREATE OR REPLACE FUNCTION public.fn_cobranca_suspensao_vigente(p_fatura_id uuid, p_link_id uuid)
RETURNS public.cobranca_suspensoes
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT s.*
  FROM public.cobranca_suspensoes s
  WHERE s.status IN ('ativa', 'escalada')
    AND (
      (p_fatura_id IS NOT NULL AND s.fatura_id = p_fatura_id)
      OR (p_link_id IS NOT NULL AND s.pagamento_link_id = p_link_id)
      OR (p_fatura_id IS NOT NULL AND s.pagamento_link_id IN (
            SELECT pl.id FROM public.pagamento_links pl WHERE pl.fatura_id = p_fatura_id))
      OR (p_link_id IS NOT NULL AND s.fatura_id = (
            SELECT pl.fatura_id FROM public.pagamento_links pl WHERE pl.id = p_link_id))
    )
  ORDER BY s.criado_em
  LIMIT 1;
$$;

-- Última pausa encerrada sem dívida (pagamento confirmado ou cobrança cancelada).
CREATE OR REPLACE FUNCTION public.fn_cobranca_encerrada_sem_divida(p_fatura_id uuid, p_link_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT s.id
  FROM public.cobranca_suspensoes s
  WHERE s.status = 'encerrada'
    AND s.resultado IN ('pagamento_confirmado', 'cobranca_cancelada')
    AND (
      (p_fatura_id IS NOT NULL AND s.fatura_id = p_fatura_id)
      OR (p_link_id IS NOT NULL AND s.pagamento_link_id = p_link_id)
      OR (p_fatura_id IS NOT NULL AND s.pagamento_link_id IN (
            SELECT pl.id FROM public.pagamento_links pl WHERE pl.fatura_id = p_fatura_id))
    )
  ORDER BY s.encerrada_em DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_cobranca_fone_fmt(p_telefone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE WHEN length(d) >= 10
              THEN regexp_replace(right(d, CASE WHEN length(d) >= 13 THEN 11 ELSE length(d) - 2 END),
                                  '^(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3')
              ELSE nullif(p_telefone, '') END
  FROM (SELECT regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') AS d) x;
$$;

-- Aviso no grupo 🔔 RK · Notificações (sai pelo fn_ju_tarefas em até 1 min).
CREATE OR REPLACE FUNCTION public.fn_cobranca_suspensao_avisar(p_suspensao_id uuid, p_tipo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  s       public.cobranca_suspensoes;
  v_resp  record;
  v_pac   text;
  v_valor numeric;
  v_motivo text;
  v_quem  text;
  v_txt   text;
BEGIN
  SELECT * INTO s FROM public.cobranca_suspensoes WHERE id = p_suspensao_id;
  IF s.id IS NULL THEN RETURN; END IF;

  SELECT p.nome, p.telefone::text AS telefone INTO v_resp FROM public.pessoas p WHERE p.id = s.responsavel_cobranca_id;
  SELECT split_part(btrim(p.nome), ' ', 1) INTO v_pac FROM public.pessoas p WHERE p.id = s.paciente_id;
  IF s.fatura_id IS NOT NULL THEN
    SELECT f.valor_total INTO v_valor FROM public.faturas f WHERE f.id = s.fatura_id;
  ELSE
    SELECT pl.valor_base INTO v_valor FROM public.pagamento_links pl WHERE pl.id = s.pagamento_link_id;
  END IF;

  v_motivo := CASE s.motivo
    WHEN 'pagamento_informado' THEN 'a família disse que já pagou'
    WHEN 'pagamento_fora_asaas' THEN 'pagamento feito fora do link (Pix direto, dinheiro ou transferência)'
    WHEN 'contestacao' THEN 'a família contestou a cobrança'
    WHEN 'duplicidade' THEN 'possível cobrança em duplicidade'
    WHEN 'teto_lembretes' THEN 'a cobrança chegou ao limite de lembretes automáticos'
    ELSE 'outro motivo' END;
  v_quem := CASE s.origem WHEN 'ju' THEN 'pela Ju' WHEN 'sistema' THEN 'pelo sistema'
                 ELSE 'por ' || coalesce(split_part(btrim(s.criado_por_nome), ' ', 1), 'alguém da equipe') END;

  IF p_tipo = 'criada' THEN
    v_txt := '💳 Cobrança pausada para conferência';
  ELSE
    v_txt := '⏰ Conferência de cobrança passou do prazo';
  END IF;

  v_txt := v_txt
    || E'\n' || concat_ws(' · ', split_part(btrim(coalesce(v_resp.nome, 'Responsável sem nome')), ' ', 1),
                          coalesce(public.fn_cobranca_fone_fmt(v_resp.telefone), 'sem telefone'))
    || E'\n' || concat_ws(' · ', v_pac, public.fn_brl(v_valor))
    || E'\nMotivo: ' || v_motivo || '. Pausada ' || v_quem || '.'
    || CASE WHEN nullif(btrim(s.detalhe), '') IS NOT NULL
            THEN E'\n"' || left(btrim(s.detalhe), 200) || '"' ELSE '' END;

  IF p_tipo = 'criada' THEN
    v_txt := v_txt || E'\nOs lembretes automáticos dessa cobrança estão parados. Confira até '
             || to_char(s.prazo_verificacao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
             || ' e registre o resultado em Cobranças.';
  ELSE
    v_txt := v_txt || E'\nOs lembretes continuam parados até alguém registrar o resultado em Cobranças.';
  END IF;

  INSERT INTO public.ju_avisos_grupo (texto, origem, botao)
  VALUES (v_txt,
          CASE WHEN p_tipo = 'criada' THEN 'COBRANCA_PAUSADA' ELSE 'COBRANCA_PAUSA_VENCIDA' END,
          '💳 Abrir Cobranças|https://app.respirakidsbrasilia.com.br/#/cobrancas');
END;
$$;

-- =====================================================================
-- Pausar
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_cobranca_suspender(
  p_fatura_id uuid DEFAULT NULL,
  p_pagamento_link_id uuid DEFAULT NULL,
  p_id_asaas text DEFAULT NULL,
  p_motivo text DEFAULT 'pagamento_informado',
  p_detalhe text DEFAULT NULL,
  p_origem text DEFAULT 'equipe',
  p_conversa_ref text DEFAULT NULL,
  p_ator_nome text DEFAULT NULL,
  p_notificar boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  a        record;
  cfg      public.cobranca_config;
  v_fat    public.faturas;
  v_link   public.pagamento_links;
  v_alvo_f uuid;
  v_alvo_l uuid;
  v_aberta boolean;
  s        public.cobranca_suspensoes;
  v_links  uuid[];
  v_prazo  timestamptz;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF NOT (a.sistema OR a.staff) THEN
    RAISE EXCEPTION 'Sem permissão para pausar cobrança' USING ERRCODE = '42501';
  END IF;
  IF p_origem NOT IN ('ju', 'equipe', 'sistema') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;
  -- Pessoa logada sempre conta como equipe; sistema/Ju só via service_role.
  IF NOT a.sistema THEN p_origem := 'equipe'; END IF;

  -- Resolve a cobrança. Link que já virou fatura → a pausa vai na fatura.
  IF p_id_asaas IS NOT NULL AND p_fatura_id IS NULL THEN
    SELECT f.id INTO p_fatura_id FROM public.faturas f WHERE f.id_asaas = p_id_asaas AND f.ativo LIMIT 1;
  END IF;
  IF p_pagamento_link_id IS NOT NULL AND p_fatura_id IS NULL THEN
    SELECT * INTO v_link FROM public.pagamento_links WHERE id = p_pagamento_link_id;
    IF v_link.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'NAO_ENCONTRADA');
    END IF;
    IF v_link.fatura_id IS NOT NULL THEN
      p_fatura_id := v_link.fatura_id;
    END IF;
  END IF;

  IF p_fatura_id IS NOT NULL THEN
    SELECT * INTO v_fat FROM public.faturas WHERE id = p_fatura_id;
    IF v_fat.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'NAO_ENCONTRADA');
    END IF;
    v_alvo_f := v_fat.id;
    v_aberta := v_fat.ativo AND v_fat.status IN ('pendente', 'atrasado');
  ELSIF v_link.id IS NOT NULL THEN
    v_alvo_l := v_link.id;
    v_aberta := v_link.ativo IS NOT FALSE AND v_link.status IN ('pendente', 'expirado');
  ELSE
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_ALVO');
  END IF;

  IF NOT v_aberta THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'COBRANCA_NAO_ESTA_EM_ABERTO',
                              'status', coalesce(v_fat.status, v_link.status));
  END IF;

  -- Já pausada: só registra o reforço (ex.: família repetiu que pagou).
  s := public.fn_cobranca_suspensao_vigente(v_alvo_f, v_alvo_l);
  IF s.id IS NOT NULL THEN
    INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, detalhe, ator_id, ator_nome)
    VALUES (s.id, s.fatura_id, s.pagamento_link_id, 'reforcada',
            concat_ws(' · ', p_motivo, nullif(btrim(p_detalhe), '')), a.pessoa_id, coalesce(a.nome, p_ator_nome, p_origem));
    RETURN jsonb_build_object('ok', true, 'suspensao_id', s.id, 'ja_existia', true, 'prazo', s.prazo_verificacao);
  END IF;

  SELECT * INTO cfg FROM public.cobranca_config LIMIT 1;
  v_prazo := ((public.fn_dias_uteis_somar((now() AT TIME ZONE 'America/Sao_Paulo')::date,
                                          coalesce(cfg.dias_uteis_verificacao, 3))
               + time '23:59') AT TIME ZONE 'America/Sao_Paulo');

  INSERT INTO public.cobranca_suspensoes (
    fatura_id, pagamento_link_id, responsavel_cobranca_id, paciente_id, motivo, detalhe, origem,
    responsavel_verificacao_id, prazo_verificacao, conversa_ref, criado_por, criado_por_nome)
  VALUES (
    v_alvo_f, v_alvo_l,
    coalesce(v_fat.responsavel_cobranca_id, v_link.responsavel_cobranca_id),
    coalesce(v_fat.paciente_id, v_link.paciente_id),
    p_motivo, nullif(btrim(p_detalhe), ''), p_origem,
    cfg.responsavel_verificacao_id, v_prazo, p_conversa_ref, a.pessoa_id, coalesce(a.nome, p_ator_nome))
  RETURNING * INTO s;

  INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, detalhe, ator_id, ator_nome)
  VALUES (s.id, s.fatura_id, s.pagamento_link_id, 'criada', s.motivo, a.pessoa_id, coalesce(a.nome, p_ator_nome, p_origem));

  -- Lembrete de pré-cobrança que já estava na fila (sai espaçado, pode levar
  -- horas) não sai mais. O evento leva as cobranças da família juntas: cancela o
  -- evento inteiro; as outras voltam na próxima rodada da régua.
  v_links := CASE WHEN v_alvo_l IS NOT NULL THEN ARRAY[v_alvo_l]
                  ELSE ARRAY(SELECT pl.id FROM public.pagamento_links pl WHERE pl.fatura_id = v_alvo_f) END;
  IF coalesce(array_length(v_links, 1), 0) > 0 THEN
    UPDATE public.webhook_queue q
       SET status = 'erro', tentativas = q.max_tentativas, processado_em = now(),
           erro = 'Cancelado: cobrança pausada para conferência (' || s.id || ')'
     WHERE q.status = 'pendente'
       AND q.evento = 'pre_cobranca_inadimplente'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.payload -> 'data' -> 'cobrancas') c
                   WHERE (c ->> 'pagamento_link_id')::uuid = ANY (v_links));
  END IF;

  IF p_notificar THEN
    PERFORM public.fn_cobranca_suspensao_avisar(s.id, 'criada');
  END IF;

  RETURN jsonb_build_object('ok', true, 'suspensao_id', s.id, 'ja_existia', false, 'prazo', s.prazo_verificacao);
END;
$$;

-- =====================================================================
-- Encerrar (só admin logado: nenhum fluxo retoma cobrança sozinho)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_cobranca_encerrar_suspensao(
  p_suspensao_id uuid,
  p_resultado text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  a record;
  s public.cobranca_suspensoes;
BEGIN
  SELECT * INTO a FROM public.fn_cobranca_ator();
  IF auth.uid() IS NULL OR NOT a.admin THEN
    RAISE EXCEPTION 'Só um administrador logado registra o resultado da conferência' USING ERRCODE = '42501';
  END IF;
  IF p_resultado NOT IN ('pagamento_confirmado', 'divida_confirmada', 'cobranca_cancelada') THEN
    RAISE EXCEPTION 'resultado inválido: %', p_resultado;
  END IF;

  UPDATE public.cobranca_suspensoes
     SET status = 'encerrada', resultado = p_resultado, encerrada_em = now(),
         encerrada_por = a.pessoa_id, encerrada_por_nome = a.nome,
         observacao_encerramento = nullif(btrim(p_observacao), '')
   WHERE id = p_suspensao_id AND status IN ('ativa', 'escalada')
  RETURNING * INTO s;

  IF s.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'NAO_ESTA_ABERTA');
  END IF;

  INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, detalhe, ator_id, ator_nome)
  VALUES (s.id, s.fatura_id, s.pagamento_link_id, 'encerrada',
          concat_ws(' · ', p_resultado, nullif(btrim(p_observacao), '')), a.pessoa_id, a.nome);

  RETURN jsonb_build_object('ok', true, 'suspensao_id', s.id, 'resultado', s.resultado);
END;
$$;

-- =====================================================================
-- Porteiro: pode mandar lembrete desta cobrança agora?
-- Quem envia lembrete automático pergunta antes. Na dúvida, não.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_cobranca_pode_lembrar(
  p_fatura_id uuid DEFAULT NULL,
  p_pagamento_link_id uuid DEFAULT NULL,
  p_id_asaas text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_registrar boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
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

  -- Teto de lembretes automáticos desde a última vez que o Financeiro confirmou
  -- a dívida (ou desde sempre).
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
    IF v_n >= coalesce(cfg.teto_lembretes_automaticos, 6) THEN
      v_r := public.fn_cobranca_suspender(
               p_fatura_id := v_fat.id,
               p_pagamento_link_id := CASE WHEN v_fat.id IS NULL THEN v_link.id END,
               p_motivo := 'teto_lembretes',
               p_detalhe := v_n || ' lembretes automáticos enviados sem pagamento',
               p_origem := 'sistema');
      v_motivo := 'TETO_LEMBRETES';
      s.id := (v_r ->> 'suspensao_id')::uuid;
    END IF;
  END IF;

  IF v_motivo IS NULL THEN
    RETURN jsonb_build_object('pode', true);
  END IF;

  IF p_registrar THEN
    INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, canal, detalhe, ator_nome)
    VALUES (s.id, v_fat.id, v_link.id, 'lembrete_bloqueado', p_canal,
            v_motivo || CASE WHEN v_fat.id IS NULL AND v_link.id IS NULL
                             THEN ' (' || coalesce(p_id_asaas, p_fatura_id::text, p_pagamento_link_id::text) || ')' ELSE '' END,
            coalesce(a.nome, 'sistema'));
  END IF;

  RETURN jsonb_build_object('pode', false, 'motivo', v_motivo, 'suspensao_id', s.id);
END;
$$;

-- =====================================================================
-- Escalonamento: prazo vencido → avisa o Financeiro UMA vez. Cobrança segue parada.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_cobranca_suspensoes_escalar()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    UPDATE public.cobranca_suspensoes
       SET status = 'escalada', escalada_em = now()
     WHERE status = 'ativa' AND prazo_verificacao < now()
    RETURNING id, fatura_id, pagamento_link_id
  LOOP
    INSERT INTO public.cobranca_suspensao_eventos (suspensao_id, fatura_id, pagamento_link_id, evento, ator_nome)
    VALUES (r.id, r.fatura_id, r.pagamento_link_id, 'escalada', 'sistema');
    PERFORM public.fn_cobranca_suspensao_avisar(r.id, 'escalada');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cobranca-suspensoes-escalar')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cobranca-suspensoes-escalar');
  -- 8h às 19h30 de Brasília, dias úteis (banco em UTC).
  PERFORM cron.schedule('cobranca-suspensoes-escalar', '*/30 11-22 * * 1-5',
                        'SELECT public.fn_cobranca_suspensoes_escalar()');
END $$;

-- =====================================================================
-- Régua de pré-cobrança pergunta ao porteiro antes de enfileirar
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_enqueue_lembretes_pre_cobranca()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grp record;
  v_delay interval := interval '0';   -- atraso acumulado (1º sai na hora)
  v_last uuid;
  v_it jsonb;
  v_i int;
  v_nome text;
  v_txt text;
  v_html text;
  v_dias int;
  v_rodape text := E'Caso já tenha efetuado o pagamento, por favor, desconsidere este lembrete. No entanto, se ainda não teve a chance de realizar o pagamento, gostaríamos de pedir que o realize assim que possível. Entendemos que imprevistos acontecem e estamos aqui para ajudar!\n\nAtenciosamente,\n\nEquipe Respira Kids\n\n_Essa é uma mensagem automática._';
BEGIN
  -- 27/10/2026: UM evento POR RESPONSÁVEL, com todas as cobranças dele, espaçados 5–9 min (randômico)
  -- via proximo_retry (API não oficial). O banco monta o texto do WhatsApp (texto_whatsapp) e o trecho
  -- do e-mail (html_itens); o n8n só envia. Mesma elegibilidade + auto-renovação de antes.
  -- 28/10/2026: cada cobrança passa por fn_cobranca_pode_lembrar (pausa, teto, encerrada).
  --             O filtro roda DEPOIS da elegibilidade (CTE materializada), para o teto
  --             não pausar cobrança que nem estava na régua.
  FOR v_grp IN
    WITH base AS MATERIALIZED (
      SELECT pl.id, pl.token, pl.responsavel_cobranca_id, r.nome AS r_nome,
             r.telefone AS r_tel, pl.paciente_id, pac.nome AS p_nome, pl.empresa_id,
             COALESCE(emp.nome_fantasia, emp.razao_social) AS e_nome,
             pl.valor_base, pl.descricao, pl.vencimento,
             (CURRENT_DATE - pl.vencimento) AS dias,
             COALESCE(pl.lembretes_enviados, 0) + 1 AS aviso
      FROM public.pagamento_links pl
      LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
      LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
      LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id
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
    ),
    eleg AS MATERIALIZED (
      SELECT b.* FROM base b
      WHERE (public.fn_cobranca_pode_lembrar(NULL, b.id, NULL, 'regua_pre_cobranca', true) ->> 'pode')::boolean
    )
    SELECT coalesce(e.responsavel_cobranca_id::text, e.id::text) AS chave,
           max(e.r_nome) AS r_nome,
           count(*) AS n,
           sum(e.valor_base) AS total,
           array_agg(e.id) AS ids,
           jsonb_agg(jsonb_build_object(
             'pagamento_link_id', e.id,
             'token', e.token,
             'url', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || e.token,
             'responsavel_cobranca_id', e.responsavel_cobranca_id,
             'responsavel_nome', e.r_nome,
             'responsavel_telefone', e.r_tel,
             'paciente_id', e.paciente_id,
             'paciente_nome', e.p_nome,
             'empresa_id', e.empresa_id,
             'empresa_nome', e.e_nome,
             'valor_base', e.valor_base,
             'descricao', e.descricao,
             'vencimento', e.vencimento,
             'dias_em_atraso', e.dias,
             'aviso_numero', e.aviso
           ) ORDER BY e.vencimento, e.id) AS itens
    FROM eleg e
    GROUP BY 1
    ORDER BY min(e.vencimento)
  LOOP
    v_nome := split_part(btrim(coalesce(v_grp.r_nome, '')), ' ', 1);

    IF v_grp.n = 1 THEN
      v_it := v_grp.itens -> 0;
      v_dias := greatest((v_it ->> 'dias_em_atraso')::int, 0);
      v_txt := 'Olá, ' || v_nome || E'\n\nEspero que esteja tudo bem com você! Estamos escrevendo apenas para lembrar gentilmente que parece haver uma fatura em aberto conosco.\n\nDetalhes da Fatura:\n\nDescrição da Fatura: *'
               || regexp_replace(coalesce(v_it ->> 'descricao', ''), '\s*\n\s*', ' ', 'g')
               || E'*\nDias Vencidos: *' || v_dias
               || E'*\nValor: *' || public.fn_brl((v_it ->> 'valor_base')::numeric)
               || E'*\nAcessar Fatura: ' || (v_it ->> 'url') || E'\n\n' || v_rodape;
      v_html := replace(replace(replace(regexp_replace(coalesce(v_it ->> 'descricao', ''), '\s*\n\s*', ' ', 'g'),
                  '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    ELSE
      v_txt := 'Olá, ' || v_nome || E'\n\nEspero que esteja tudo bem com você! Estamos escrevendo apenas para lembrar gentilmente que há '
               || v_grp.n || ' faturas em aberto conosco, somando *' || public.fn_brl(v_grp.total) || '*.';
      v_html := '<ul style="margin:6px 0 0 18px; padding:0;">';
      v_i := 0;
      FOR v_it IN SELECT x FROM jsonb_array_elements(v_grp.itens) x LOOP
        v_i := v_i + 1;
        v_dias := greatest((v_it ->> 'dias_em_atraso')::int, 1);
        v_txt := v_txt || E'\n\n*Fatura ' || v_i || '* (' || split_part(coalesce(v_it ->> 'paciente_nome', ''), ' ', 1) || '): *'
                 || public.fn_brl((v_it ->> 'valor_base')::numeric) || '*, vencida há ' || v_dias
                 || CASE WHEN v_dias = 1 THEN ' dia' ELSE ' dias' END
                 || E'\nAcessar: ' || (v_it ->> 'url');
        v_html := v_html || '<li style="margin:0 0 8px 0;"><strong>Fatura ' || v_i || '</strong> ('
                  || replace(replace(split_part(coalesce(v_it ->> 'paciente_nome', ''), ' ', 1), '<', '&lt;'), '>', '&gt;')
                  || '): ' || public.fn_brl((v_it ->> 'valor_base')::numeric) || ', vencida há ' || v_dias
                  || CASE WHEN v_dias = 1 THEN ' dia' ELSE ' dias' END
                  || '. <a href="' || (v_it ->> 'url') || '" style="color:#27c0b3;">Pagar esta fatura</a></li>';
      END LOOP;
      v_txt := v_txt || E'\n\n' || v_rodape;
      v_html := v_html || '</ul>';
    END IF;

    INSERT INTO public.webhook_queue (evento, payload, status, tentativas, max_tentativas, proximo_retry)
    VALUES (
      'pre_cobranca_inadimplente',
      jsonb_build_object(
        'tipo', 'pre_cobranca_inadimplente',
        'timestamp', now(),
        'webhook_id', gen_random_uuid(),
        'data', jsonb_build_object('total', v_grp.n, 'valor_total', v_grp.total, 'cobrancas', v_grp.itens,
                                   'texto_whatsapp', v_txt, 'html_itens', v_html)
      ),
      'pendente', 0, 3,
      now() + v_delay
    )
    RETURNING id INTO v_last;

    UPDATE public.pagamento_links
    SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
        ultimo_lembrete_em = now(),
        status = 'pendente',
        expira_em = now() + interval '30 days',
        atualizado_em = now()
    WHERE id = ANY (v_grp.ids);

    v_delay := v_delay + make_interval(secs => (300 + random() * 240)::int);
  END LOOP;

  RETURN v_last;
END;
$function$;

-- =====================================================================
-- Ju: família diz que pagou → pausa as cobranças em aberto do paciente
-- =====================================================================
ALTER TABLE public.ju_acoes DROP CONSTRAINT IF EXISTS ju_acoes_tipo_check;
ALTER TABLE public.ju_acoes ADD CONSTRAINT ju_acoes_tipo_check CHECK (tipo = ANY (ARRAY[
  'REENVIO_CONTRATO', 'NF_EMITIR', 'RENOVAR_LINK', 'ATESTADO', 'CORRIGIR_CONTATO_CONTRATO',
  'CANCELAR_CONSULTA', 'SUSPENDER_COBRANCA']));

CREATE OR REPLACE FUNCTION public.fn_ju_cobranca_suspender(
  p_conversa_id bigint,
  p_versao bigint,
  p_paciente_id uuid,
  p_motivo text DEFAULT 'pagamento_informado',
  p_detalhe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_gate  text := public.fn_ju_gate(p_conversa_id, p_versao);
  v_acao  bigint;
  r       record;
  v_res   jsonb;
  v_ids   jsonb := '[]'::jsonb;
BEGIN
  IF v_gate IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_gate);
  END IF;
  IF p_motivo NOT IN ('pagamento_informado', 'pagamento_fora_asaas', 'contestacao', 'duplicidade') THEN
    p_motivo := 'pagamento_informado';
  END IF;

  -- Só paciente com acesso financeiro por este telefone.
  IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes') x
       WHERE (x -> 'acesso_financeiro')::boolean AND (x ->> 'paciente_id')::uuid = p_paciente_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PACIENTE_FORA_DO_ESCOPO');
  END IF;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id)
  VALUES (p_conversa_id, p_versao, 'SUSPENDER_COBRANCA', p_paciente_id)
  ON CONFLICT ON CONSTRAINT ju_acoes_idempotente DO NOTHING
  RETURNING id INTO v_acao;
  IF v_acao IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_SOLICITADO');
  END IF;

  -- A família raramente diz qual cobrança: pausa todas as abertas do paciente.
  -- Pausar a mais é atraso; pausar a menos é cobrar quem pagou.
  FOR r IN
    SELECT f.id AS fatura_id, NULL::uuid AS link_id
    FROM public.faturas f
    WHERE f.paciente_id = p_paciente_id AND f.ativo AND f.status IN ('pendente', 'atrasado')
    UNION ALL
    SELECT NULL, pl.id
    FROM public.pagamento_links pl
    WHERE pl.paciente_id = p_paciente_id AND pl.ativo IS NOT FALSE AND pl.fatura_id IS NULL
      AND pl.status IN ('pendente', 'expirado')
  LOOP
    v_res := public.fn_cobranca_suspender(
               p_fatura_id := r.fatura_id, p_pagamento_link_id := r.link_id,
               p_motivo := p_motivo, p_detalhe := p_detalhe, p_origem := 'ju',
               p_conversa_ref := 'ju:' || p_conversa_id, p_ator_nome := 'Ju');
    IF (v_res ->> 'ok')::boolean THEN
      v_ids := v_ids || jsonb_build_array(v_res ->> 'suspensao_id');
    END IF;
  END LOOP;

  UPDATE public.ju_acoes
     SET status = CASE WHEN jsonb_array_length(v_ids) > 0 THEN 'OK' ELSE 'CONCLUIDA' END,
         detalhe = CASE WHEN jsonb_array_length(v_ids) > 0
                        THEN jsonb_array_length(v_ids) || ' cobrança(s) pausada(s)'
                        ELSE 'nenhuma cobrança em aberto' END,
         updated_at = now()
   WHERE id = v_acao;

  RETURN jsonb_build_object('ok', true, 'acao_id', v_acao, 'pausadas', jsonb_array_length(v_ids),
                            'suspensoes', v_ids);
END;
$$;

-- =====================================================================
-- Permissões
-- =====================================================================
REVOKE ALL ON FUNCTION public.fn_cobranca_ator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_suspensao_vigente(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_encerrada_sem_divida(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_suspensao_avisar(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_suspensoes_escalar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_cobranca_suspender(bigint, bigint, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_cobranca_suspender(bigint, bigint, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fn_cobranca_suspender(uuid, uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_suspender(uuid, uuid, text, text, text, text, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_cobranca_encerrar_suspensao(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_encerrar_suspensao(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cobranca_pode_lembrar(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cobranca_pode_lembrar(uuid, uuid, text, text, boolean) TO authenticated, service_role;

-- =====================================================================
-- Telas: vw_cobrancas_pendentes ganha a pausa no fim (colunas novas só no fim)
-- =====================================================================
CREATE OR REPLACE VIEW public.vw_cobrancas_pendentes
WITH (security_invoker = true) AS
 WITH base AS (
         SELECT 'pre_cobranca'::text AS origem,
            pl.id AS cobranca_id,
            pl.id AS pagamento_link_id,
            NULL::uuid AS fatura_id,
            pl.token,
            NULL::text AS id_asaas,
            pl.paciente_id,
            pl.responsavel_cobranca_id,
            pl.empresa_id,
            pl.descricao,
            pl.valor_base AS valor,
            pl.vencimento,
            'https://app.respirakidsbrasilia.com.br/#/pagamento/'::text || pl.token AS link_pagamento,
            pl.expira_em IS NOT NULL AND pl.expira_em < now() AS link_expirado,
            COALESCE(pl.lembretes_enviados, 0) AS lembretes_enviados,
            pl.ultimo_lembrete_em,
            pl.criado_em,
            ( SELECT array_agg(DISTINCT a.profissional_id) AS array_agg
                   FROM agendamentos a
                  WHERE a.pagamento_link_id = pl.id AND a.ativo = true) AS profissional_ids
           FROM pagamento_links pl
          WHERE pl.ativo IS NOT FALSE AND pl.status = 'pendente'::text AND pl.fatura_id IS NULL
        UNION ALL
         SELECT 'fatura'::text AS text,
            f.id,
            pl2.id,
            f.id,
            pl2.token,
            f.id_asaas,
            f.paciente_id,
            f.responsavel_cobranca_id,
            f.empresa_id,
            f.descricao,
            f.valor_total,
            f.vencimento,
            f.dados_asaas ->> 'invoiceUrl'::text,
            false,
            COALESCE(f.lembretes_enviados, 0) AS "coalesce",
            f.ultimo_lembrete_em,
            f.criado_em,
            ( SELECT array_agg(DISTINCT a.profissional_id) AS array_agg
                   FROM agendamentos a
                  WHERE a.fatura_id = f.id AND a.ativo = true) AS array_agg
           FROM faturas f
             LEFT JOIN LATERAL ( SELECT p.id,
                    p.token
                   FROM pagamento_links p
                  WHERE p.fatura_id = f.id AND p.ativo IS NOT FALSE
                  ORDER BY p.criado_em DESC
                 LIMIT 1) pl2 ON true
          WHERE f.ativo IS NOT FALSE AND (f.status = ANY (ARRAY['pendente'::text, 'atrasado'::text]))
        )
 SELECT b.origem,
    b.cobranca_id,
    b.pagamento_link_id,
    b.fatura_id,
    b.token,
    b.id_asaas,
    b.paciente_id,
    pac.nome AS paciente_nome,
    b.responsavel_cobranca_id,
    resp.nome AS responsavel_nome,
    resp.telefone AS responsavel_telefone,
    b.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    b.descricao,
    b.valor,
    b.vencimento,
    CURRENT_DATE - b.vencimento AS dias_atraso,
        CASE
            WHEN b.vencimento IS NULL THEN 'pendente'::text
            WHEN CURRENT_DATE <= b.vencimento THEN 'pendente'::text
            WHEN (CURRENT_DATE - b.vencimento) <= 7 THEN 'atrasada'::text
            ELSE 'muito_atrasada'::text
        END AS situacao,
    b.link_pagamento,
    b.link_expirado,
    b.lembretes_enviados,
    b.ultimo_lembrete_em,
    b.criado_em,
    COALESCE(m.envios_manuais, 0) AS envios_manuais,
    m.ultimo_envio_manual_em,
    m.ultimo_envio_manual_por,
    COALESCE(b.profissional_ids, ARRAY[]::uuid[]) AS profissional_ids,
    COALESCE(( SELECT array_agg(p.nome ORDER BY p.nome) AS array_agg
           FROM pessoas p
          WHERE p.id = ANY (b.profissional_ids)), ARRAY[]::text[]) AS profissionais,
    pac.cpf_cnpj AS paciente_cpf,
    resp.cpf_cnpj AS responsavel_cpf,
    resp.email AS responsavel_email,
    susp.id IS NOT NULL AS em_analise,
    susp.id AS suspensao_id,
    susp.status AS suspensao_status,
    susp.motivo AS suspensao_motivo,
    susp.origem AS suspensao_origem,
    susp.prazo_verificacao AS suspensao_prazo,
    susp.criado_em AS suspensao_criada_em
   FROM base b
     LEFT JOIN pessoas pac ON pac.id = b.paciente_id
     LEFT JOIN pessoas resp ON resp.id = b.responsavel_cobranca_id
     LEFT JOIN pessoa_empresas emp ON emp.id = b.empresa_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS envios_manuais,
            max(l.criado_em) AS ultimo_envio_manual_em,
            (array_agg(l.registrado_por ORDER BY l.criado_em DESC))[1] AS ultimo_envio_manual_por
           FROM cobranca_disparo_log l
          WHERE l.canal = 'whatsapp_manual'::text AND (b.pagamento_link_id IS NOT NULL AND l.pagamento_link_id = b.pagamento_link_id OR b.fatura_id IS NOT NULL AND l.fatura_id = b.fatura_id)) m ON true
     -- Pausa: igualdade simples em cada ramo (OR entre colunas não usa índice).
     LEFT JOIN LATERAL ( SELECT x.* FROM (
              SELECT s.* FROM cobranca_suspensoes s
               WHERE b.fatura_id IS NOT NULL AND s.fatura_id = b.fatura_id AND s.status IN ('ativa','escalada')
              UNION ALL
              SELECT s.* FROM cobranca_suspensoes s
               WHERE b.pagamento_link_id IS NOT NULL AND s.pagamento_link_id = b.pagamento_link_id AND s.status IN ('ativa','escalada')
            ) x ORDER BY x.criado_em LIMIT 1) susp ON true;

-- Painel de conferência (aberta + encerradas dos últimos 60 dias)
CREATE OR REPLACE VIEW public.vw_cobranca_suspensoes
WITH (security_invoker = true) AS
SELECT s.id,
       s.status,
       s.motivo,
       s.detalhe,
       s.origem,
       s.resultado,
       s.criado_em,
       s.criado_por_nome,
       s.prazo_verificacao,
       s.status = 'escalada' OR (s.status = 'ativa' AND s.prazo_verificacao < now()) AS prazo_vencido,
       s.escalada_em,
       s.encerrada_em,
       s.encerrada_por_nome,
       s.observacao_encerramento,
       s.conversa_ref,
       s.fatura_id,
       s.pagamento_link_id,
       CASE WHEN s.fatura_id IS NOT NULL THEN 'fatura' ELSE 'pre_cobranca' END AS origem_cobranca,
       coalesce(f.valor_total, pl.valor_base) AS valor,
       coalesce(f.descricao, pl.descricao) AS descricao,
       coalesce(f.vencimento, pl.vencimento) AS vencimento,
       coalesce(f.status, pl.status) AS status_cobranca,
       f.id_asaas,
       f.dados_asaas ->> 'invoiceUrl' AS invoice_url,
       s.paciente_id,
       pac.nome AS paciente_nome,
       s.responsavel_cobranca_id,
       resp.nome AS responsavel_nome,
       resp.telefone AS responsavel_telefone,
       s.responsavel_verificacao_id,
       ver.nome AS responsavel_verificacao_nome,
       (SELECT count(*)::integer FROM cobranca_suspensao_eventos e
         WHERE e.suspensao_id = s.id AND e.evento = 'lembrete_bloqueado') AS lembretes_bloqueados
FROM cobranca_suspensoes s
LEFT JOIN faturas f ON f.id = s.fatura_id
LEFT JOIN pagamento_links pl ON pl.id = s.pagamento_link_id
LEFT JOIN pessoas pac ON pac.id = s.paciente_id
LEFT JOIN pessoas resp ON resp.id = s.responsavel_cobranca_id
LEFT JOIN pessoas ver ON ver.id = s.responsavel_verificacao_id
WHERE s.status IN ('ativa', 'escalada') OR s.encerrada_em > now() - interval '60 days';

GRANT SELECT ON public.vw_cobranca_suspensoes TO authenticated;

-- =====================================================================
-- Ju enxerga a pausa: cobrança em conferência não é para mandar link de novo
-- =====================================================================
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  v_old text := $q$'situacao', cp.situacao,$q$;
  v_new text := $q$'situacao', cp.situacao, 'em_conferencia_financeiro', coalesce(cp.em_analise, false),$q$;
BEGIN
  IF position('em_conferencia_financeiro' IN v_def) > 0 THEN
    RETURN; -- já aplicado
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fn_ju_contexto_cliente mudou: trecho de cobrancas_em_aberto não encontrado uma única vez';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;
