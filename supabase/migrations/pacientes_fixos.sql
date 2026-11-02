-- Pacientes Fixos (02/11/2026)
--
-- Paciente motor com ritmo de atendimento (semanal, quinzenal, 2x/semana...).
-- O que se guarda é a FREQUÊNCIA, não um horário: nos 90 dias até 02/11/2026,
-- só 11 de 59 pacientes motores regulares repetiam dia e horário.
--
-- Regras combinadas com o dono:
-- - Só fisioterapia motora. Conta toda consulta cujo serviço tem "motor" no
--   nome (inclui avaliação), exceto cancelada/erro/reagendada. Falta conta
--   (a sessão é cobrada).
-- - A frequência vive no cadastro e na conduta da evolução motora. Evolução
--   finalizada com frequência muda o cadastro (ou torna o paciente fixo);
--   "Manter fisioterapia = não" tira dos fixos (aviso na lista).
-- - A frequência nunca muda sozinha. O que se move é a semana prevista:
--   quinzenal/mensal contam a partir da última sessão marcada ou feita.
--   "Adiar" empurra a semana prevista (família viajando); consulta desmarcada
--   deixa de contar e o paciente volta sozinho para "falta marcar".
-- - A agenda pública é a mesma de hoje (agendas_compartilhadas). Aqui só se
--   cria a da semana com os horários livres e se registra o envio do link.
--
-- Datas de consulta são hora de parede gravada como UTC
-- (data_hora AT TIME ZONE 'UTC'). Semana = segunda a domingo.

-- =============================================================================
-- Tabelas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pacientes_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL UNIQUE REFERENCES public.pessoas(id) ON DELETE CASCADE,
  frequencia text NOT NULL
    CHECK (frequencia IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal')),
  -- Profissional que costuma atender (opcional). Sem ela, vale a da última sessão.
  profissional_id uuid REFERENCES public.pessoas(id),
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  -- Segunda-feira da semana em que o paciente volta a ser esperado
  adiado_ate date,
  adiado_motivo text,
  encerrado_em timestamptz,
  encerrado_motivo text CHECK (encerrado_motivo IN ('alta', 'manual')),
  -- Quem/onde mexeu por último (vai para o histórico)
  ultima_origem text NOT NULL DEFAULT 'cadastro'
    CHECK (ultima_origem IN ('cadastro', 'evolucao', 'lista')),
  ultima_evolucao_id uuid,
  atualizado_por uuid REFERENCES public.pessoas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pacientes_fixos IS
  'Paciente motor com frequência de atendimento. Escrita só pelas RPCs fn_paciente_fixo_* e pelo gatilho da evolução motora.';

CREATE TABLE IF NOT EXISTS public.pacientes_fixos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixo_id uuid NOT NULL REFERENCES public.pacientes_fixos(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  origem text,
  evolucao_id uuid,
  feito_por uuid,
  feito_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pacientes_fixos_historico_paciente
  ON public.pacientes_fixos_historico (paciente_id, feito_em DESC);

-- Link da agenda pública enviado pela secretaria (botão do WhatsApp)
CREATE TABLE IF NOT EXISTS public.pacientes_fixos_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  semana date NOT NULL,
  agenda_id uuid REFERENCES public.agendas_compartilhadas(id) ON DELETE SET NULL,
  telefone text,
  canal text NOT NULL DEFAULT 'whatsapp_manual',
  enviado_por uuid REFERENCES public.pessoas(id),
  enviado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pacientes_fixos_envios_semana
  ON public.pacientes_fixos_envios (semana, paciente_id);

ALTER TABLE public.pacientes_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_fixos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_fixos_envios ENABLE ROW LEVEL SECURITY;

-- Leitura pela equipe; escrita só por RPC (SECURITY DEFINER)
DROP POLICY IF EXISTS pacientes_fixos_select ON public.pacientes_fixos;
CREATE POLICY pacientes_fixos_select ON public.pacientes_fixos
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()) OR (SELECT public.is_profissional()));

DROP POLICY IF EXISTS pacientes_fixos_historico_select ON public.pacientes_fixos_historico;
CREATE POLICY pacientes_fixos_historico_select ON public.pacientes_fixos_historico
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()));

DROP POLICY IF EXISTS pacientes_fixos_envios_select ON public.pacientes_fixos_envios;
CREATE POLICY pacientes_fixos_envios_select ON public.pacientes_fixos_envios
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR (SELECT public.is_secretaria()));

REVOKE ALL ON public.pacientes_fixos, public.pacientes_fixos_historico, public.pacientes_fixos_envios FROM anon;
GRANT SELECT ON public.pacientes_fixos, public.pacientes_fixos_historico, public.pacientes_fixos_envios TO authenticated;

-- =============================================================================
-- Histórico (toda mudança) + updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_historico()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_historico_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao text;
  v_antes jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_depois jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Nada de relevante mudou (só carimbos): não polui o histórico
    IF (v_antes - 'updated_at' - 'atualizado_por' - 'ultima_origem' - 'ultima_evolucao_id')
       = (v_depois - 'updated_at' - 'atualizado_por' - 'ultima_origem' - 'ultima_evolucao_id') THEN
      RETURN NULL;
    END IF;
  END IF;
  v_acao := CASE
    WHEN TG_OP = 'INSERT' THEN 'criado'
    WHEN NEW.ativo IS DISTINCT FROM OLD.ativo THEN CASE WHEN NEW.ativo THEN 'reativado' ELSE 'encerrado' END
    WHEN NEW.frequencia IS DISTINCT FROM OLD.frequencia THEN 'frequencia'
    WHEN NEW.adiado_ate IS DISTINCT FROM OLD.adiado_ate THEN
      CASE WHEN NEW.adiado_ate IS NULL THEN 'adiamento_removido' ELSE 'adiado' END
    ELSE 'editado' END;
  INSERT INTO public.pacientes_fixos_historico
    (fixo_id, paciente_id, acao, antes, depois, origem, evolucao_id, feito_por)
  VALUES
    (NEW.id, NEW.paciente_id, v_acao, v_antes, v_depois, NEW.ultima_origem,
     NEW.ultima_evolucao_id, NEW.atualizado_por);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_fixos_updated ON public.pacientes_fixos;
CREATE TRIGGER trg_pacientes_fixos_updated
  BEFORE INSERT OR UPDATE ON public.pacientes_fixos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pacientes_fixos_historico();

DROP TRIGGER IF EXISTS trg_pacientes_fixos_historico ON public.pacientes_fixos;
CREATE TRIGGER trg_pacientes_fixos_historico
  AFTER INSERT OR UPDATE ON public.pacientes_fixos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pacientes_fixos_historico_gravar();

-- =============================================================================
-- Regras puras
-- =============================================================================

-- Frequência → quantas sessões a cada quantas semanas
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_ritmo(p_frequencia text, OUT sessoes int, OUT semanas int)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_frequencia
           WHEN 'diaria' THEN 5 WHEN '3x_semana' THEN 3 WHEN '2x_semana' THEN 2 ELSE 1 END,
         CASE p_frequencia
           WHEN 'quinzenal' THEN 2 WHEN 'mensal' THEN 4 ELSE 1 END;
$$;

-- Sessões motoras que contam para o ritmo (hora de parede)
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_sessoes(p_paciente_ids uuid[])
RETURNS TABLE (id uuid, paciente_id uuid, profissional_id uuid, dh timestamp, status text, servico text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.paciente_id, a.profissional_id, (a.data_hora AT TIME ZONE 'UTC'), cs.codigo, ts.nome
    FROM public.agendamentos a
    JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
    JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.ativo
     AND a.paciente_id = ANY (p_paciente_ids)
     AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
     AND ts.nome ~* 'motor';
$$;

-- =============================================================================
-- Leitura: ficha do paciente e evolução
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_get(p_paciente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f record;
  v_hist jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria() OR public.is_profissional()) THEN
    RETURN NULL;
  END IF;

  SELECT pf.*, pr.nome AS profissional_nome, au.nome AS atualizado_por_nome
    INTO f
    FROM public.pacientes_fixos pf
    LEFT JOIN public.pessoas pr ON pr.id = pf.profissional_id
    LEFT JOIN public.pessoas au ON au.id = pf.atualizado_por
   WHERE pf.paciente_id = p_paciente_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'acao', h.acao, 'origem', h.origem,
           'frequencia', h.depois->>'frequencia',
           'frequencia_antes', h.antes->>'frequencia',
           'adiado_ate', h.depois->>'adiado_ate',
           'feito_por_nome', p.nome, 'feito_em', h.feito_em) ORDER BY h.feito_em DESC), '[]'::jsonb)
    INTO v_hist
    FROM (SELECT * FROM public.pacientes_fixos_historico
           WHERE paciente_id = p_paciente_id ORDER BY feito_em DESC LIMIT 10) h
    LEFT JOIN public.pessoas p ON p.id = h.feito_por;

  RETURN jsonb_build_object(
    'id', f.id,
    'paciente_id', f.paciente_id,
    'frequencia', f.frequencia,
    'profissional_id', f.profissional_id,
    'profissional_nome', f.profissional_nome,
    'observacao', f.observacao,
    'ativo', f.ativo,
    'adiado_ate', f.adiado_ate,
    'adiado_motivo', f.adiado_motivo,
    'encerrado_em', f.encerrado_em,
    'encerrado_motivo', f.encerrado_motivo,
    'ultima_origem', f.ultima_origem,
    'atualizado_por_nome', f.atualizado_por_nome,
    'updated_at', f.updated_at,
    'historico', v_hist);
END;
$$;

-- =============================================================================
-- Escrita (admin e secretaria)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_salvar(
  p_paciente_id uuid,
  p_frequencia text,
  p_profissional_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_origem text DEFAULT 'cadastro'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu uuid := public.get_current_pessoa_id();
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar paciente fixo' USING ERRCODE = '42501';
  END IF;
  IF p_frequencia NOT IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal') THEN
    RAISE EXCEPTION 'Frequência inválida: %', p_frequencia;
  END IF;

  INSERT INTO public.pacientes_fixos AS pf
    (paciente_id, frequencia, profissional_id, observacao, ativo, ultima_origem, atualizado_por)
  VALUES
    (p_paciente_id, p_frequencia, p_profissional_id, nullif(trim(p_observacao), ''), true,
     CASE WHEN p_origem IN ('cadastro', 'lista') THEN p_origem ELSE 'cadastro' END, v_eu)
  ON CONFLICT (paciente_id) DO UPDATE SET
    frequencia = EXCLUDED.frequencia,
    profissional_id = EXCLUDED.profissional_id,
    observacao = EXCLUDED.observacao,
    ativo = true,
    encerrado_em = NULL,
    encerrado_motivo = NULL,
    ultima_origem = EXCLUDED.ultima_origem,
    ultima_evolucao_id = NULL,
    atualizado_por = v_eu;

  RETURN public.fn_paciente_fixo_get(p_paciente_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_encerrar(
  p_paciente_id uuid,
  p_origem text DEFAULT 'cadastro'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar paciente fixo' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pacientes_fixos
     SET ativo = false, encerrado_em = now(), encerrado_motivo = 'manual',
         adiado_ate = NULL, adiado_motivo = NULL,
         ultima_origem = CASE WHEN p_origem = 'lista' THEN 'lista' ELSE 'cadastro' END,
         ultima_evolucao_id = NULL,
         atualizado_por = public.get_current_pessoa_id()
   WHERE paciente_id = p_paciente_id AND ativo;
  RETURN public.fn_paciente_fixo_get(p_paciente_id);
END;
$$;

-- Adiar: o paciente volta a ser esperado na semana de p_volta (qualquer dia
-- dela; grava a segunda-feira). p_volta NULL tira o adiamento.
CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_adiar(
  p_paciente_id uuid,
  p_volta date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_volta date := date_trunc('week', p_volta)::date;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar paciente fixo' USING ERRCODE = '42501';
  END IF;
  IF p_volta IS NOT NULL AND v_volta <= date_trunc('week', v_hoje)::date THEN
    RAISE EXCEPTION 'Escolha uma semana depois desta';
  END IF;
  UPDATE public.pacientes_fixos
     SET adiado_ate = v_volta,
         adiado_motivo = CASE WHEN p_volta IS NULL THEN NULL ELSE nullif(trim(p_motivo), '') END,
         ultima_origem = 'lista',
         ultima_evolucao_id = NULL,
         atualizado_por = public.get_current_pessoa_id()
   WHERE paciente_id = p_paciente_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não está nos fixos';
  END IF;
  RETURN public.fn_paciente_fixo_get(p_paciente_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_registrar_envio(
  p_paciente_id uuid,
  p_semana date,
  p_agenda_id uuid DEFAULT NULL,
  p_telefone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.pacientes_fixos_envios (paciente_id, semana, agenda_id, telefone, enviado_por)
  VALUES (p_paciente_id, date_trunc('week', p_semana)::date, p_agenda_id, p_telefone,
          public.get_current_pessoa_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- =============================================================================
-- Sincronização com a evolução motora
-- =============================================================================
-- Vale só para a evolução da sessão mais recente do paciente (editar uma
-- evolução antiga não mexe no cadastro). Nunca impede salvar a evolução.

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_da_evolucao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conduta jsonb := NEW.evolucao_motora_assimetria->'conduta';
  v_manter boolean;
  v_freq text;
  v_paciente uuid;
  v_dh timestamptz;
  v_autor uuid := coalesce(NEW.atualizado_por, NEW.criado_por);
BEGIN
  IF NEW.tipo_evolucao IS DISTINCT FROM 'motora_assimetria' OR v_conduta IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_manter := (v_conduta->>'manter_fisioterapia')::boolean;
    v_freq := nullif(v_conduta->>'frequencia_sugerida', '');

    SELECT a.paciente_id, a.data_hora INTO v_paciente, v_dh
      FROM public.agendamentos a WHERE a.id = NEW.id_agendamento;
    IF v_paciente IS NULL THEN
      RETURN NULL;
    END IF;

    -- Existe evolução motora de sessão posterior? Então esta não manda.
    IF EXISTS (
      SELECT 1 FROM public.relatorio_evolucao r
        JOIN public.agendamentos a ON a.id = r.id_agendamento
       WHERE a.paciente_id = v_paciente
         AND r.tipo_evolucao = 'motora_assimetria'
         AND r.id <> NEW.id
         AND a.data_hora > v_dh) THEN
      RETURN NULL;
    END IF;

    IF v_manter IS FALSE THEN
      UPDATE public.pacientes_fixos
         SET ativo = false, encerrado_em = now(), encerrado_motivo = 'alta',
             adiado_ate = NULL, adiado_motivo = NULL,
             ultima_origem = 'evolucao', ultima_evolucao_id = NEW.id,
             atualizado_por = v_autor
       WHERE paciente_id = v_paciente AND ativo;
    ELSIF v_manter IS TRUE
          AND v_freq IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal') THEN
      INSERT INTO public.pacientes_fixos AS pf
        (paciente_id, frequencia, ativo, ultima_origem, ultima_evolucao_id, atualizado_por)
      VALUES (v_paciente, v_freq, true, 'evolucao', NEW.id, v_autor)
      ON CONFLICT (paciente_id) DO UPDATE SET
        frequencia = EXCLUDED.frequencia,
        ativo = true,
        encerrado_em = NULL,
        encerrado_motivo = NULL,
        ultima_origem = 'evolucao',
        ultima_evolucao_id = EXCLUDED.ultima_evolucao_id,
        atualizado_por = EXCLUDED.atualizado_por
      WHERE pf.frequencia IS DISTINCT FROM EXCLUDED.frequencia OR NOT pf.ativo;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pacientes_fixos: sincronização com a evolução % falhou: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_paciente_fixo_da_evolucao ON public.relatorio_evolucao;
CREATE TRIGGER trg_paciente_fixo_da_evolucao
  AFTER INSERT OR UPDATE OF evolucao_motora_assimetria ON public.relatorio_evolucao
  FOR EACH ROW EXECUTE FUNCTION public.fn_paciente_fixo_da_evolucao();

-- =============================================================================
-- A semana: quem falta marcar
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_semana(p_semana date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini date;
  v_fim date;
  v_ids uuid[];
  v_pacientes jsonb;
  v_altas jsonb;
  v_agendas jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  v_ini := date_trunc('week', coalesce(p_semana, v_hoje))::date;
  v_fim := v_ini + 6;

  SELECT array_agg(f.paciente_id) INTO v_ids
    FROM public.pacientes_fixos f JOIN public.pessoas p ON p.id = f.paciente_id
   WHERE f.ativo AND p.ativo;

  WITH sess AS (
    SELECT * FROM public.fn_paciente_fixo_sessoes(coalesce(v_ids, '{}'))
  ), base AS (
    SELECT f.*, r.sessoes, r.semanas, pac.nome AS paciente_nome, pac.data_nascimento,
           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id AND s.dh < v_ini) AS ultima_antes,
           (SELECT s.profissional_id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS prof_recente,
           -- origem do "Marcar" (Agenda Expressa copia serviço, local e valor dela)
           (SELECT s.id FROM sess s WHERE s.paciente_id = f.paciente_id
             ORDER BY (s.dh < v_ini + 7) DESC, s.dh DESC LIMIT 1) AS origem_id
      FROM public.pacientes_fixos f
      JOIN public.pessoas pac ON pac.id = f.paciente_id
      CROSS JOIN LATERAL public.fn_paciente_fixo_ritmo(f.frequencia) r
     WHERE f.ativo AND pac.ativo
  ), devida AS (
    SELECT b.*,
           CASE WHEN b.semanas = 1 THEN v_ini
                WHEN b.ultima_antes IS NULL THEN v_ini
                ELSE date_trunc('week', b.ultima_antes)::date + 7 * b.semanas END AS semana_base
      FROM base b
  ), calc AS (
    SELECT d.*,
           greatest(d.semana_base, coalesce(d.adiado_ate, d.semana_base)) AS semana_prevista,
           -- quinzenal/mensal: uma sessão já marcada mais adiante dentro do
           -- ciclo também resolve (a família preferiu a semana seguinte)
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'data_hora', to_char(s.dh, 'YYYY-MM-DD"T"HH24:MI'),
                      'status', s.status,
                      'profissional_nome', pr.nome) ORDER BY s.dh), '[]'::jsonb)
              FROM sess s LEFT JOIN public.pessoas pr ON pr.id = s.profissional_id
             WHERE s.paciente_id = d.paciente_id
               AND s.dh >= v_ini
               AND s.dh < v_ini + 7 * d.semanas) AS marcadas
      FROM devida d
  ), final AS (
    SELECT c.*,
           jsonb_array_length(c.marcadas) AS qtd_marcadas,
           CASE WHEN c.semana_prevista > v_ini THEN 0
                ELSE greatest(c.sessoes - jsonb_array_length(c.marcadas), 0) END AS falta,
           CASE
             WHEN c.semana_prevista > v_ini AND c.adiado_ate IS NOT NULL AND c.adiado_ate > v_ini THEN 'adiado'
             WHEN c.semana_prevista > v_ini THEN 'fora_da_semana'
             WHEN jsonb_array_length(c.marcadas) >= c.sessoes THEN 'completo'
             ELSE 'falta' END AS situacao,
           coalesce(c.profissional_id, c.prof_recente) AS prof_envio
      FROM calc c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', fi.paciente_id,
           'paciente_nome', fi.paciente_nome,
           'data_nascimento', fi.data_nascimento,
           'frequencia', fi.frequencia,
           'sessoes', fi.sessoes,
           'semanas', fi.semanas,
           'situacao', fi.situacao,
           'falta', fi.falta,
           'atrasado', fi.situacao = 'falta' AND fi.semanas > 1 AND fi.semana_prevista < v_ini,
           'semana_prevista', fi.semana_prevista,
           'adiado_ate', fi.adiado_ate,
           'adiado_motivo', fi.adiado_motivo,
           'observacao', fi.observacao,
           'marcadas', fi.marcadas,
           'ultima_sessao', to_char(fi.ultima_antes, 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_id', fi.prof_envio,
           'origem_agendamento_id', fi.origem_id,
           'profissional_nome', prof.nome,
           'profissional_fixa', fi.profissional_id IS NOT NULL,
           'responsavel_nome', resp.nome,
           'responsavel_telefone', coalesce(resp.telefone, pac.telefone)::text,
           'envio', env.envio
         ) ORDER BY
           CASE fi.situacao WHEN 'falta' THEN 0 WHEN 'completo' THEN 1 WHEN 'adiado' THEN 2 ELSE 3 END,
           prof.nome NULLS LAST, fi.paciente_nome), '[]'::jsonb)
    INTO v_pacientes
    FROM final fi
    JOIN public.pessoas pac ON pac.id = fi.paciente_id
    LEFT JOIN public.pessoas prof ON prof.id = fi.prof_envio
    LEFT JOIN LATERAL (
      SELECT r.nome, r.telefone
        FROM public.pessoa_responsaveis pr
        JOIN public.pessoas r ON r.id = pr.id_responsavel
       WHERE pr.id_pessoa = fi.paciente_id
         AND pr.ativo IS NOT FALSE
         AND pr.tipo_responsabilidade IN ('legal', 'ambos')
         AND r.telefone IS NOT NULL
       ORDER BY CASE pr.tipo_responsabilidade WHEN 'legal' THEN 0 ELSE 1 END
       LIMIT 1) resp ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('enviado_em', e.enviado_em, 'enviado_por_nome', ep.nome,
                                'agenda_id', e.agenda_id, 'vezes', count(*) OVER ()) AS envio
        FROM public.pacientes_fixos_envios e
        LEFT JOIN public.pessoas ep ON ep.id = e.enviado_por
       WHERE e.paciente_id = fi.paciente_id AND e.semana = v_ini
       ORDER BY e.enviado_em DESC
       LIMIT 1) env ON true;

  -- Saíram dos fixos por alta na evolução nos últimos 14 dias (aviso)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', f.paciente_id,
           'paciente_nome', p.nome,
           'encerrado_em', f.encerrado_em,
           'por_nome', au.nome) ORDER BY f.encerrado_em DESC), '[]'::jsonb)
    INTO v_altas
    FROM public.pacientes_fixos f
    JOIN public.pessoas p ON p.id = f.paciente_id
    LEFT JOIN public.pessoas au ON au.id = f.atualizado_por
   WHERE NOT f.ativo AND f.encerrado_motivo = 'alta'
     AND f.encerrado_em > now() - interval '14 days';

  -- Agendas públicas ativas que cobrem a semana
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', ac.id,
           'token', ac.token,
           'titulo', ac.titulo,
           'profissional_id', ac.profissional_id,
           'profissional_nome', pr.nome,
           'data_inicio', ac.data_inicio,
           'data_fim', ac.data_fim,
           'slots', (SELECT count(*) FROM public.agenda_slots s WHERE s.agenda_id = ac.id AND s.deleted_at IS NULL),
           'livres', (SELECT count(*) FROM public.agenda_slots s
                       WHERE s.agenda_id = ac.id AND s.deleted_at IS NULL AND s.disponivel
                         AND s.data_hora AT TIME ZONE 'UTC' > now() AT TIME ZONE 'America/Sao_Paulo')
         ) ORDER BY pr.nome, ac.created_at DESC), '[]'::jsonb)
    INTO v_agendas
    FROM public.agendas_compartilhadas ac
    JOIN public.pessoas pr ON pr.id = ac.profissional_id
   WHERE ac.ativo
     AND ac.data_inicio <= v_fim
     AND ac.data_fim >= v_ini;

  RETURN jsonb_build_object(
    'ok', true,
    'semana', v_ini,
    'semana_fim', v_fim,
    'pacientes', v_pacientes,
    'altas_recentes', v_altas,
    'agendas', v_agendas);
END;
$$;

-- =============================================================================
-- Sugestões: pacientes motores que já vêm com regularidade e não são fixos
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_sugestoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_res jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT array_agg(DISTINCT a.paciente_id) INTO v_ids
    FROM public.agendamentos a
    JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.ativo AND ts.nome ~* 'motor'
     AND a.data_hora > now() - interval '60 days';

  WITH s AS (
    SELECT * FROM public.fn_paciente_fixo_sessoes(coalesce(v_ids, '{}'))
     WHERE dh > (now() AT TIME ZONE 'America/Sao_Paulo') - interval '60 days'
  ), por AS (
    SELECT s.paciente_id,
           count(*) FILTER (WHERE s.dh <= now() AT TIME ZONE 'America/Sao_Paulo') AS feitas,
           count(*) AS total,
           min(s.dh) AS primeira, max(s.dh) AS ultima,
           mode() WITHIN GROUP (ORDER BY s.profissional_id) AS prof
      FROM s GROUP BY s.paciente_id
  ), ult_ev AS (
    SELECT DISTINCT ON (a.paciente_id) a.paciente_id,
           r.evolucao_motora_assimetria->'conduta'->>'frequencia_sugerida' AS freq,
           (r.evolucao_motora_assimetria->'conduta'->>'manter_fisioterapia')::boolean AS manter
      FROM public.relatorio_evolucao r
      JOIN public.agendamentos a ON a.id = r.id_agendamento
     WHERE r.tipo_evolucao = 'motora_assimetria'
       AND a.paciente_id = ANY (coalesce(v_ids, '{}'))
     ORDER BY a.paciente_id, a.data_hora DESC
  ), cand AS (
    SELECT por.*,
           -- sessões por semana entre a primeira e a última (mín. 1 semana)
           por.total / greatest((extract(epoch FROM por.ultima - por.primeira) / 604800.0) + 1, 1) AS por_semana,
           ue.freq AS freq_evolucao, ue.manter
      FROM por
      LEFT JOIN ult_ev ue ON ue.paciente_id = por.paciente_id
     WHERE por.total >= 3
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', c.paciente_id,
           'paciente_nome', p.nome,
           'sessoes_60d', c.total,
           'ultima_sessao', to_char(c.ultima, 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_id', c.prof,
           'profissional_nome', pr.nome,
           'frequencia_evolucao', c.freq_evolucao,
           'frequencia_sugerida', coalesce(
              CASE WHEN c.freq_evolucao IN ('diaria', '3x_semana', '2x_semana', 'semanal', 'quinzenal', 'mensal')
                   THEN c.freq_evolucao END,
              CASE WHEN c.por_semana >= 1.6 THEN '2x_semana'
                   WHEN c.por_semana >= 0.75 THEN 'semanal'
                   WHEN c.por_semana >= 0.4 THEN 'quinzenal'
                   ELSE 'mensal' END)
         ) ORDER BY c.total DESC, p.nome), '[]'::jsonb)
    INTO v_res
    FROM cand c
    JOIN public.pessoas p ON p.id = c.paciente_id AND p.ativo
    LEFT JOIN public.pessoas pr ON pr.id = c.prof
   WHERE c.manter IS NOT FALSE
     AND NOT EXISTS (
       SELECT 1 FROM public.pacientes_fixos f
        WHERE f.paciente_id = c.paciente_id
          AND (f.ativo OR f.encerrado_em > now() - interval '30 days'));

  RETURN v_res;
END;
$$;

-- =============================================================================
-- Agenda pública da semana em 1 clique
-- =============================================================================

-- Padrão da agenda de uma profissional: o da última agenda pública dela
-- (serviços, locais, empresas); sem agenda anterior, o da última consulta motora.
CREATE OR REPLACE FUNCTION public.fn_fixos_agenda_padrao(p_profissional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultima uuid;
  v_servicos uuid[];
  v_locais uuid[];
  v_empresas uuid[];
BEGIN
  SELECT ac.id INTO v_ultima
    FROM public.agendas_compartilhadas ac
   WHERE ac.profissional_id = p_profissional_id
     AND EXISTS (SELECT 1 FROM public.agenda_servicos s
                   JOIN public.tipo_servicos ts ON ts.id = s.tipo_servico_id
                  WHERE s.agenda_id = ac.id AND ts.nome ~* 'motor' AND ts.nome !~* 'avalia')
   ORDER BY ac.created_at DESC LIMIT 1;

  IF v_ultima IS NOT NULL THEN
    SELECT array_agg(tipo_servico_id) INTO v_servicos FROM public.agenda_servicos WHERE agenda_id = v_ultima;
    SELECT array_agg(local_id) INTO v_locais FROM public.agenda_locais WHERE agenda_id = v_ultima;
    SELECT array_agg(empresa_id) INTO v_empresas FROM public.agenda_empresas WHERE agenda_id = v_ultima;
  END IF;

  IF v_servicos IS NULL THEN
    SELECT ARRAY[a.tipo_servico_id] INTO v_servicos
      FROM public.agendamentos a JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.profissional_id = p_profissional_id AND a.ativo
       AND ts.nome ~* 'motor' AND ts.nome !~* 'avalia|domiciliar'
     GROUP BY a.tipo_servico_id ORDER BY count(*) DESC LIMIT 1;
  END IF;
  IF v_locais IS NULL THEN
    SELECT ARRAY[a.local_id] INTO v_locais
      FROM public.agendamentos a JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
      JOIN public.locais_atendimento l ON l.id = a.local_id
     WHERE a.profissional_id = p_profissional_id AND a.ativo AND ts.nome ~* 'motor'
       AND l.tipo_local = 'clinica'
     GROUP BY a.local_id ORDER BY count(*) DESC LIMIT 1;
  END IF;
  IF v_empresas IS NULL THEN
    SELECT ARRAY[a.empresa_fatura] INTO v_empresas
      FROM public.agendamentos a JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.profissional_id = p_profissional_id AND a.ativo AND ts.nome ~* 'motor'
       AND a.empresa_fatura IS NOT NULL
     GROUP BY a.empresa_fatura ORDER BY count(*) DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'agenda_modelo_id', v_ultima,
    'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', ts.id, 'nome', ts.nome, 'duracao_minutos', ts.duracao_minutos))
                            FROM public.tipo_servicos ts WHERE ts.id = ANY (v_servicos)), '[]'::jsonb),
    'locais', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome))
                          FROM public.locais_atendimento l WHERE l.id = ANY (v_locais)), '[]'::jsonb),
    'empresas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'nome', coalesce(e.nome_fantasia, e.razao_social)))
                            FROM public.pessoa_empresas e WHERE e.id = ANY (v_empresas)), '[]'::jsonb));
END;
$$;

-- Horários livres de uma profissional na semana, pela mesma grade da Agenda
-- Expressa (minuto mais comum e faixa de horas por dia da semana nos últimos
-- 120 dias). 'historico' = o dia da semana costuma ter atendimento dela.
CREATE OR REPLACE FUNCTION public.fn_fixos_horarios_livres(
  p_profissional_id uuid,
  p_semana date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_ini date := date_trunc('week', p_semana)::date;
  v_padrao jsonb;
  v_duracao int;
  v_minuto int;
  v_geral_ini int; v_geral_fim int;
  v_ini_h int; v_fim_h int;
  v_datas int;
  v_dia date;
  v_slot timestamp;
  v_lista jsonb;
  v_livres int;
  v_dias jsonb := '[]'::jsonb;
  v_feriado text;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  v_padrao := public.fn_fixos_agenda_padrao(p_profissional_id);
  v_duracao := coalesce(nullif((v_padrao->'servicos'->0->>'duracao_minutos')::int, 0), 60);

  SELECT extract(minute FROM a.data_hora AT TIME ZONE 'UTC')::int INTO v_minuto
    FROM public.agendamentos a
   WHERE a.profissional_id = p_profissional_id AND a.ativo
     AND a.data_hora > now() - interval '120 days'
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  v_minuto := coalesce(v_minuto, 0);

  SELECT min(h), max(h) INTO v_geral_ini, v_geral_fim
    FROM (SELECT extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h
            FROM public.agendamentos a
           WHERE a.profissional_id = p_profissional_id AND a.ativo
             AND a.data_hora > now() - interval '120 days'
           GROUP BY 1 HAVING count(*) >= 2) x;
  v_geral_ini := coalesce(v_geral_ini, 8);
  v_geral_fim := coalesce(v_geral_fim, 17);

  FOR v_dia IN SELECT d::date FROM generate_series(v_ini, v_ini + 5, interval '1 day') d LOOP
    v_feriado := NULL;
    SELECT f.nome INTO v_feriado FROM public.followup_feriados f WHERE f.dia = v_dia LIMIT 1;

    SELECT count(DISTINCT (a.data_hora AT TIME ZONE 'UTC')::date) INTO v_datas
      FROM public.agendamentos a
     WHERE a.profissional_id = p_profissional_id AND a.ativo
       AND a.data_hora > now() - interval '120 days'
       AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia);

    v_ini_h := NULL; v_fim_h := NULL;
    IF v_datas >= 6 THEN
      SELECT min(h), max(h) INTO v_ini_h, v_fim_h
        FROM (SELECT extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h
                FROM public.agendamentos a
               WHERE a.profissional_id = p_profissional_id AND a.ativo
                 AND a.data_hora > now() - interval '120 days'
                 AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia)
               GROUP BY 1 HAVING count(*) >= 2) x;
    END IF;
    IF v_ini_h IS NULL THEN
      v_ini_h := v_geral_ini; v_fim_h := v_geral_fim;
    END IF;

    v_lista := '[]'::jsonb; v_livres := 0;
    FOR h IN v_ini_h..v_fim_h LOOP
      v_slot := v_dia + make_time(h, v_minuto, 0);
      CONTINUE WHEN v_slot <= v_agora + interval '15 minutes';
      IF public.fn_agenda_expressa_slot_livre(p_profissional_id, v_slot AT TIME ZONE 'UTC', v_duracao, false) THEN
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_slot, 'HH24:MI'), 'livre', true);
        v_livres := v_livres + 1;
      ELSE
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_slot, 'HH24:MI'), 'livre', false);
      END IF;
    END LOOP;

    CONTINUE WHEN jsonb_array_length(v_lista) = 0;
    v_dias := v_dias || jsonb_build_object(
      'data', to_char(v_dia, 'YYYY-MM-DD'),
      'historico', v_datas >= 6,
      'feriado', v_feriado,
      'livres', v_livres,
      'horarios', v_lista);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'profissional_id', p_profissional_id,
    'semana', v_ini,
    'duracao_minutos', v_duracao,
    'padrao', v_padrao,
    'dias', v_dias);
END;
$$;

-- Cria a agenda pública (mesmo formato das feitas à mão) com os horários
-- escolhidos. p_horarios: 'YYYY-MM-DD HH24:MI' (hora de parede).
CREATE OR REPLACE FUNCTION public.fn_fixos_criar_agenda(
  p_profissional_id uuid,
  p_semana date,
  p_horarios text[],
  p_titulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date := date_trunc('week', p_semana)::date;
  v_padrao jsonb;
  v_duracao int;
  v_slots timestamp[];
  v_ocupados text[];
  v_agenda uuid;
  v_token text;
  v_prof_nome text;
  v_titulo text;
  v_de date; v_ate date;
  v_meses text[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho',
                          'agosto','setembro','outubro','novembro','dezembro'];
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão para criar agenda' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_horarios, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um horário';
  END IF;

  SELECT array_agg(DISTINCT h::timestamp ORDER BY h::timestamp)
    INTO v_slots FROM unnest(p_horarios) h;

  IF EXISTS (SELECT 1 FROM unnest(v_slots) s WHERE s::date < v_ini OR s::date > v_ini + 6) THEN
    RAISE EXCEPTION 'Há horário fora da semana escolhida';
  END IF;

  v_padrao := public.fn_fixos_agenda_padrao(p_profissional_id);
  IF jsonb_array_length(v_padrao->'servicos') = 0 OR jsonb_array_length(v_padrao->'empresas') = 0 THEN
    RAISE EXCEPTION 'Sem agenda anterior desta profissional para copiar serviço e empresa. Crie a primeira pela Agenda.';
  END IF;
  v_duracao := coalesce(nullif((v_padrao->'servicos'->0->>'duracao_minutos')::int, 0), 60);

  -- Confere de novo: alguém pode ter marcado enquanto a tela estava aberta
  SELECT array_agg(to_char(s, 'DD/MM HH24:MI')) INTO v_ocupados
    FROM unnest(v_slots) s
   WHERE NOT public.fn_agenda_expressa_slot_livre(p_profissional_id, s AT TIME ZONE 'UTC', v_duracao, false);
  IF v_ocupados IS NOT NULL THEN
    RAISE EXCEPTION 'Horários que acabaram de ser ocupados: %', array_to_string(v_ocupados, ', ')
      USING HINT = 'horario_ocupado';
  END IF;

  SELECT nome INTO v_prof_nome FROM public.pessoas WHERE id = p_profissional_id;
  v_de := v_slots[1]::date;
  v_ate := v_slots[array_length(v_slots, 1)]::date;
  v_titulo := coalesce(nullif(trim(p_titulo), ''),
    'Agenda motora ' || split_part(v_prof_nome, ' ', 1) || ' '
      || to_char(v_de, 'DD') || ' a ' || to_char(v_ate, 'DD') || ' de '
      || v_meses[extract(month FROM v_ate)::int]);

  -- Mesmo formato do nanoid(10) do app
  LOOP
    v_token := substr(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_'), 1, 10);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agendas_compartilhadas WHERE token = v_token);
  END LOOP;

  INSERT INTO public.agendas_compartilhadas (profissional_id, token, titulo, data_inicio, data_fim, criado_por)
  VALUES (p_profissional_id, v_token, v_titulo, v_de, v_ate, public.get_current_pessoa_id())
  RETURNING id INTO v_agenda;

  INSERT INTO public.agenda_servicos (agenda_id, tipo_servico_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'servicos') x;
  INSERT INTO public.agenda_locais (agenda_id, local_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'locais') x;
  INSERT INTO public.agenda_empresas (agenda_id, empresa_id)
  SELECT v_agenda, (x->>'id')::uuid FROM jsonb_array_elements(v_padrao->'empresas') x;
  INSERT INTO public.agenda_slots (agenda_id, data_hora)
  SELECT v_agenda, s AT TIME ZONE 'UTC' FROM unnest(v_slots) s;

  RETURN jsonb_build_object(
    'ok', true,
    'agenda_id', v_agenda,
    'token', v_token,
    'titulo', v_titulo,
    'slots', array_length(v_slots, 1));
END;
$$;

-- =============================================================================
-- Permissões: nada para anon (default privileges dão EXECUTE ao anon)
-- =============================================================================

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'fn_pacientes_fixos_historico()',
    'fn_pacientes_fixos_historico_gravar()',
    'fn_paciente_fixo_ritmo(text)',
    'fn_paciente_fixo_sessoes(uuid[])',
    'fn_paciente_fixo_get(uuid)',
    'fn_paciente_fixo_salvar(uuid, text, uuid, text, text)',
    'fn_paciente_fixo_encerrar(uuid, text)',
    'fn_paciente_fixo_adiar(uuid, date, text)',
    'fn_paciente_fixo_registrar_envio(uuid, date, uuid, text)',
    'fn_paciente_fixo_da_evolucao()',
    'fn_pacientes_fixos_semana(date)',
    'fn_pacientes_fixos_sugestoes()',
    'fn_fixos_agenda_padrao(uuid)',
    'fn_fixos_horarios_livres(uuid, date)',
    'fn_fixos_criar_agenda(uuid, date, text[], text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
  END LOOP;
END $$;

-- Funções internas (gatilhos e auxiliares) não ficam expostas no PostgREST
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_sessoes(uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_fixos_agenda_padrao(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.fn_paciente_fixo_ritmo(text),
  public.fn_paciente_fixo_get(uuid),
  public.fn_paciente_fixo_salvar(uuid, text, uuid, text, text),
  public.fn_paciente_fixo_encerrar(uuid, text),
  public.fn_paciente_fixo_adiar(uuid, date, text),
  public.fn_paciente_fixo_registrar_envio(uuid, date, uuid, text),
  public.fn_pacientes_fixos_semana(date),
  public.fn_pacientes_fixos_sugestoes(),
  public.fn_fixos_horarios_livres(uuid, date),
  public.fn_fixos_criar_agenda(uuid, date, text[], text)
TO authenticated;
