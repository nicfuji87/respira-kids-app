-- Metas v2: reativação justa + evoluções da clínica + níveis de bônus + base dos relatórios
--
-- Regras (combinadas com a gestão em 18/09/2026, ver docs no app /metas):
--  * "Sessão realizada" = agendamento ativo, já passou e NÃO está cancelado,
--    reagendado, com erro ou com falta.
--  * data_hora é hora de parede gravada como UTC (ver memória agenda-fuso-wall-clock):
--    comparar sempre com agora em America/Sao_Paulo, nunca com now() cru.
--  * Contato de reativação só conta para a meta se, no momento do contato:
--      - o paciente está há 60+ dias sem sessão realizada (e no máximo 540);
--      - não tem nada agendado para frente;
--      - não recebeu outro contato válido nos últimos 90 dias
--        (exceto quando a família pediu "retornar depois" e a data chegou).
--  * Reativação = paciente com contato válido que tem sessão realizada em até
--    30 dias depois do contato. Conta no mês em que a sessão acontece.
--  * Qualquer serviço conta (motora ou respiratória). Perfil só muda a mensagem.

CREATE INDEX IF NOT EXISTS idx_relatorio_evolucao_agendamento
  ON public.relatorio_evolucao (id_agendamento);

-- ---------------------------------------------------------------------------
-- 1. Helpers de tempo e de "sessão realizada"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_agora_parede()
RETURNS timestamp
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo');
$$;

-- Status que NÃO contam como sessão realizada
CREATE OR REPLACE FUNCTION public.fn_status_sessao_nao_realizada()
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM consulta_status
  WHERE codigo IN ('cancelado', 'reagendado', 'erro', 'faltou');
$$;

-- ---------------------------------------------------------------------------
-- 2. Lista de reativação (substitui o uso de vw_pacientes_inativos na UI)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_reativacao_lista();
CREATE OR REPLACE FUNCTION public.fn_reativacao_lista()
RETURNS TABLE (
  id uuid,
  nome text,
  sexo text,
  data_nascimento date,
  idade_meses integer,
  perfil text,               -- 'respiratorio' | 'motora_alta' | 'motora_e_respiratoria'
  ultimo_servico text,       -- 'respiratoria' | 'motora' | 'outro'
  data_ultima_sessao date,
  dias_sem_sessao integer,
  faixa text,                -- '60-90' | '90-180' | '180-365' | '365-540'
  prioridade integer,        -- 1 alta, 2 média, 3 baixa
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_telefone text,
  total_contatos integer,
  ultimo_contato_em timestamptz,
  ultimo_resultado text,
  proximo_contato date,
  em_carencia boolean,
  nao_contatar boolean,
  conta_para_meta boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje date := (fn_agora_parede())::date;
  v_agora timestamp := fn_agora_parede();
  v_mes integer := EXTRACT(month FROM fn_agora_parede())::int;
  v_excluir uuid[] := fn_status_sessao_nao_realizada();
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  WITH sessoes AS (
    SELECT a.paciente_id,
           (a.data_hora AT TIME ZONE 'UTC') AS quando,
           CASE WHEN ts.nome ILIKE '%motor%' THEN 'motora'
                WHEN ts.nome ILIKE '%respirat%' OR ts.nome ILIKE '%aspira%' THEN 'respiratoria'
                ELSE 'outro' END AS servico
    FROM agendamentos a
    LEFT JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
    WHERE a.ativo = true
      AND a.paciente_id IS NOT NULL
      AND NOT (a.status_consulta_id = ANY (v_excluir))
  ),
  hist AS (
    SELECT s.paciente_id,
           max(s.quando) FILTER (WHERE s.quando <= v_agora) AS ultima,
           bool_or(s.servico = 'respiratoria' AND s.quando <= v_agora) AS fez_resp,
           bool_or(s.servico = 'motora' AND s.quando <= v_agora) AS fez_motora,
           bool_or(s.quando > v_agora) AS tem_futuro
    FROM sessoes s
    GROUP BY s.paciente_id
  ),
  ult AS (
    SELECT DISTINCT ON (s.paciente_id) s.paciente_id, s.servico
    FROM sessoes s
    WHERE s.quando <= v_agora
    ORDER BY s.paciente_id, s.quando DESC
  ),
  resp AS (
    SELECT DISTINCT ON (pr.id_pessoa) pr.id_pessoa, pr.id_responsavel,
           pr_p.nome, pr_p.telefone::text AS telefone
    FROM pessoa_responsaveis pr
    JOIN pessoas pr_p ON pr_p.id = pr.id_responsavel
    WHERE pr.ativo = true AND pr.tipo_responsabilidade IN ('legal', 'ambos')
    ORDER BY pr.id_pessoa, (pr.tipo_responsabilidade = 'legal') DESC, pr.created_at
  ),
  cont AS (
    SELECT pe.pessoa_id,
           count(*)::int AS total,
           max(pe.data_evento) AS ultimo,
           max(pe.data_evento) FILTER (WHERE (pe.dados_evento ->> 'conta_para_meta')::boolean) AS ultimo_valido
    FROM pessoa_eventos pe
    WHERE pe.tipo_evento = 'contato_inatividade'
    GROUP BY pe.pessoa_id
  ),
  ult_cont AS (
    SELECT DISTINCT ON (pe.pessoa_id) pe.pessoa_id,
           pe.dados_evento ->> 'status' AS resultado,
           NULLIF(pe.dados_evento ->> 'proximo_contato', '')::date AS proximo
    FROM pessoa_eventos pe
    WHERE pe.tipo_evento = 'contato_inatividade'
    ORDER BY pe.pessoa_id, pe.data_evento DESC
  ),
  base AS (
    SELECT p.id, p.nome, p.sexo::text AS sexo, p.data_nascimento,
           CASE WHEN p.data_nascimento IS NULL THEN NULL
                ELSE ((v_hoje - p.data_nascimento) / 30.4375)::int END AS idade_meses,
           CASE WHEN h.fez_resp AND h.fez_motora THEN 'motora_e_respiratoria'
                WHEN h.fez_motora THEN 'motora_alta'
                ELSE 'respiratorio' END AS perfil,
           u.servico AS ultimo_servico,
           h.ultima::date AS data_ultima,
           (v_hoje - h.ultima::date) AS dias,
           h.fez_resp,
           r.id_responsavel, r.nome AS resp_nome, r.telefone AS resp_tel,
           COALESCE(c.total, 0) AS total,
           c.ultimo, c.ultimo_valido,
           uc.resultado, uc.proximo,
           COALESCE((p.controle_inatividade ->> 'nao_contatar')::boolean, false) AS nao_contatar
    FROM pessoas p
    JOIN pessoa_tipos pt ON pt.id = p.id_tipo_pessoa AND pt.codigo = 'paciente'
    JOIN hist h ON h.paciente_id = p.id
    LEFT JOIN ult u ON u.paciente_id = p.id
    LEFT JOIN resp r ON r.id_pessoa = p.id
    LEFT JOIN cont c ON c.pessoa_id = p.id
    LEFT JOIN ult_cont uc ON uc.pessoa_id = p.id
    WHERE p.ativo = true
      AND h.ultima IS NOT NULL
      AND NOT COALESCE(h.tem_futuro, false)
      AND (v_hoje - h.ultima::date) BETWEEN 60 AND 540
  )
  SELECT b.id, b.nome, b.sexo, b.data_nascimento, b.idade_meses, b.perfil, b.ultimo_servico,
         b.data_ultima, b.dias,
         CASE WHEN b.dias < 90 THEN '60-90'
              WHEN b.dias < 180 THEN '90-180'
              WHEN b.dias <= 365 THEN '180-365'
              ELSE '365-540' END,
         CASE
           -- baixa: 6+ anos ou mais de 1 ano sem vir
           WHEN (b.idade_meses IS NOT NULL AND b.idade_meses >= 72) OR b.dias > 365 THEN 3
           -- alta: bebê (<1 ano) que já fez respiratória; ou alta da motora
           -- no começo da estação respiratória (fev-abr)
           WHEN (b.fez_resp AND b.idade_meses IS NOT NULL AND b.idade_meses < 12) THEN 1
           WHEN b.perfil = 'motora_alta' AND v_mes BETWEEN 2 AND 4 THEN 1
           ELSE 2
         END,
         b.id_responsavel, b.resp_nome, b.resp_tel,
         b.total, b.ultimo, b.resultado, b.proximo,
         -- carência: contato válido há menos de 90 dias, a não ser que a
         -- família tenha pedido retorno numa data que já chegou
         (b.ultimo_valido IS NOT NULL
           AND b.ultimo_valido > now() - interval '90 days'
           AND NOT (b.resultado = 'retornar_depois' AND b.proximo IS NOT NULL AND b.proximo <= v_hoje)),
         b.nao_contatar,
         (b.dias <= 540
           AND NOT b.nao_contatar
           AND NOT (b.ultimo_valido IS NOT NULL
                    AND b.ultimo_valido > now() - interval '90 days'
                    AND NOT (b.resultado = 'retornar_depois' AND b.proximo IS NOT NULL AND b.proximo <= v_hoje)))
  FROM base b;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reativacao_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reativacao_lista() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Registro do contato (o servidor decide se conta para a meta)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_registrar_contato_reativacao(
  p_paciente_id uuid,
  p_metodo text,
  p_resultado text,
  p_observacoes text DEFAULT NULL,
  p_proximo_contato date DEFAULT NULL,
  p_mensagem text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu uuid;
  v_linha record;
  v_conta boolean := false;
  v_motivo text := NULL;
  v_dias integer;
  v_ultima timestamp;
  v_futuro boolean;
  v_excluir uuid[] := fn_status_sessao_nao_realizada();
  v_agora timestamp := fn_agora_parede();
  v_resp uuid;
BEGIN
  IF NOT fn_rls_admin_secretaria_ativo() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_resultado NOT IN ('nao_respondeu','marcou_consulta','tudo_bem','sem_interesse','retornar_depois','nao_contatar') THEN
    RAISE EXCEPTION 'Resultado inválido: %', p_resultado;
  END IF;

  SELECT id INTO v_eu FROM pessoas WHERE auth_user_id = auth.uid() LIMIT 1;

  SELECT max(a.data_hora AT TIME ZONE 'UTC') FILTER (WHERE (a.data_hora AT TIME ZONE 'UTC') <= v_agora),
         bool_or((a.data_hora AT TIME ZONE 'UTC') > v_agora)
    INTO v_ultima, v_futuro
  FROM agendamentos a
  WHERE a.paciente_id = p_paciente_id
    AND a.ativo = true
    AND NOT (a.status_consulta_id = ANY (v_excluir));

  v_dias := CASE WHEN v_ultima IS NULL THEN NULL ELSE (v_agora::date - v_ultima::date) END;

  -- Mesma regra da lista: reaproveita o cálculo de carência/perfil
  SELECT * INTO v_linha FROM fn_reativacao_lista() l WHERE l.id = p_paciente_id;

  IF v_ultima IS NULL THEN
    v_motivo := 'sem sessão realizada';
  ELSIF COALESCE(v_futuro, false) THEN
    v_motivo := 'já tinha sessão agendada';
  ELSIF v_dias < 60 THEN
    v_motivo := 'menos de 60 dias sem sessão';
  ELSIF v_dias > 540 THEN
    v_motivo := 'mais de 540 dias sem sessão';
  ELSIF v_linha.id IS NULL OR NOT v_linha.conta_para_meta THEN
    v_motivo := CASE WHEN v_linha.nao_contatar THEN 'família pediu para não contatar'
                     ELSE 'já recebeu contato nos últimos 90 dias' END;
  ELSE
    v_conta := true;
  END IF;

  SELECT r.id_responsavel INTO v_resp
  FROM pessoa_responsaveis r
  WHERE r.id_pessoa = p_paciente_id AND r.ativo AND r.tipo_responsabilidade IN ('legal','ambos')
  ORDER BY (r.tipo_responsabilidade = 'legal') DESC, r.created_at
  LIMIT 1;

  INSERT INTO pessoa_eventos (pessoa_id, responsavel_id, tipo_evento, categoria, metodo,
                              contatado_por, dados_evento, observacoes)
  VALUES (
    p_paciente_id, v_resp, 'contato_inatividade', 'inatividade', p_metodo, v_eu,
    jsonb_build_object(
      'status', p_resultado,
      'dias_inativos', v_dias,
      'perfil', v_linha.perfil,
      'prioridade', v_linha.prioridade,
      'proximo_contato', p_proximo_contato,
      'mensagem_enviada', p_mensagem,
      'conta_para_meta', v_conta,
      'motivo_nao_conta', v_motivo
    ),
    p_observacoes
  );

  IF p_resultado = 'nao_contatar' THEN
    UPDATE pessoas
       SET controle_inatividade = COALESCE(controle_inatividade, '{}'::jsonb)
             || jsonb_build_object('nao_contatar', true, 'motivo_nao_contatar', 'solicitado'),
           updated_at = now()
     WHERE id = p_paciente_id;
  END IF;

  RETURN jsonb_build_object('conta_para_meta', v_conta, 'motivo', v_motivo);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_contato_reativacao(uuid, text, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_contato_reativacao(uuid, text, text, text, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cálculo das metas de reativação (mesma assinatura: fn_atualizar_meta chama)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_calcular_contatos_inatividade(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT pe.pessoa_id)::numeric
  FROM pessoa_eventos pe
  WHERE pe.tipo_evento = 'contato_inatividade'
    AND (pe.dados_evento ->> 'conta_para_meta')::boolean IS TRUE
    AND (pe.data_evento AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_inicio AND p_fim
    AND (p_pessoa_id IS NULL OR pe.contatado_por = p_pessoa_id);
$$;

CREATE OR REPLACE FUNCTION public.fn_calcular_pacientes_reativados(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT pe.pessoa_id)::numeric
  FROM pessoa_eventos pe
  JOIN agendamentos a
    ON a.paciente_id = pe.pessoa_id
   AND a.ativo = true
   AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
   AND (a.data_hora AT TIME ZONE 'UTC') <= fn_agora_parede()
   AND (a.data_hora AT TIME ZONE 'UTC') >= (pe.data_evento AT TIME ZONE 'America/Sao_Paulo')
   AND (a.data_hora AT TIME ZONE 'UTC') <= (pe.data_evento AT TIME ZONE 'America/Sao_Paulo') + interval '30 days'
  WHERE pe.tipo_evento = 'contato_inatividade'
    AND (pe.dados_evento ->> 'conta_para_meta')::boolean IS TRUE
    AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_inicio AND p_fim
    AND (p_pessoa_id IS NULL OR pe.contatado_por = p_pessoa_id);
$$;

-- ---------------------------------------------------------------------------
-- 5. Metas de evolução (da clínica, não por pessoa)
--    Base: sessões realizadas no período que já passaram há 24h+.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_calcular_evolucoes_cobertura(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT a.id,
           EXISTS (SELECT 1 FROM relatorio_evolucao re WHERE re.id_agendamento = a.id) AS tem
    FROM agendamentos a
    WHERE a.ativo = true
      AND a.paciente_id IS NOT NULL
      AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
      AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_inicio AND p_fim
      AND (a.data_hora AT TIME ZONE 'UTC') <= fn_agora_parede() - interval '24 hours'
      AND (p_pessoa_id IS NULL OR a.profissional_id = p_pessoa_id)
  )
  SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE round(100.0 * count(*) FILTER (WHERE tem) / count(*), 1) END
  FROM s;
$$;

CREATE OR REPLACE FUNCTION public.fn_calcular_evolucoes_24h(p_pessoa_id uuid, p_inicio date, p_fim date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT a.id,
           EXISTS (
             SELECT 1 FROM relatorio_evolucao re
             WHERE re.id_agendamento = a.id
               AND (re.created_at AT TIME ZONE 'America/Sao_Paulo')
                   <= (a.data_hora AT TIME ZONE 'UTC') + interval '24 hours'
           ) AS no_prazo
    FROM agendamentos a
    WHERE a.ativo = true
      AND a.paciente_id IS NOT NULL
      AND NOT (a.status_consulta_id = ANY (fn_status_sessao_nao_realizada()))
      AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_inicio AND p_fim
      AND (a.data_hora AT TIME ZONE 'UTC') <= fn_agora_parede() - interval '24 hours'
      AND (p_pessoa_id IS NULL OR a.profissional_id = p_pessoa_id)
  )
  SELECT CASE WHEN count(*) = 0 THEN 0
              ELSE round(100.0 * count(*) FILTER (WHERE no_prazo) / count(*), 1) END
  FROM s;
$$;

INSERT INTO tipos_meta (codigo, nome, descricao, categoria, unidade_medida, role_alvo, ativo)
VALUES
  ('evolucoes_cobertura', 'Sessões com Evolução',
   '% das sessões realizadas que têm evolução registrada (conta sessões com 24h+)',
   'qualidade', 'percentual', 'todos', true),
  ('evolucoes_24h', 'Evoluções em até 24h',
   '% das sessões realizadas com evolução registrada em até 24h após a sessão',
   'produtividade', 'percentual', 'todos', true)
ON CONFLICT (codigo) DO NOTHING;

UPDATE tipos_meta
   SET descricao = 'Pacientes parados (60+ dias, sem agendamento) contatados no mês; cada família conta 1 vez a cada 90 dias'
 WHERE codigo = 'contatos_inatividade';
UPDATE tipos_meta
   SET descricao = 'Pacientes contatados que fizeram sessão em até 30 dias após o contato (conta no mês da sessão)'
 WHERE codigo = 'pacientes_reativados';

-- ---------------------------------------------------------------------------
-- 6. Níveis de bônus e pré-requisito nas metas
-- ---------------------------------------------------------------------------

ALTER TABLE metas ADD COLUMN IF NOT EXISTS niveis jsonb;              -- [{"valor":12,"bonus":150}, ...] em ordem crescente
ALTER TABLE metas ADD COLUMN IF NOT EXISTS requisito_meta_id uuid REFERENCES metas(id) ON DELETE SET NULL;

COMMENT ON COLUMN metas.niveis IS 'Níveis de premiação: array de {valor, bonus}. Nível atingido = maior valor <= valor_atual.';
COMMENT ON COLUMN metas.requisito_meta_id IS 'Meta que precisa estar batida para o bônus desta valer (ex.: mínimo de contatos).';

CREATE OR REPLACE FUNCTION public.fn_atualizar_meta(p_meta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo text;
  v_pessoa uuid;
  v_inicio date;
  v_fim date;
  v_valor numeric;
  v_valor_meta numeric;
BEGIN
  SELECT tm.codigo, m.pessoa_id, m.periodo_inicio, m.periodo_fim, m.valor_meta
    INTO v_codigo, v_pessoa, v_inicio, v_fim, v_valor_meta
  FROM metas m
  JOIN tipos_meta tm ON tm.id = m.tipo_meta_id
  WHERE m.id = p_meta_id;

  IF v_codigo IS NULL THEN RETURN 0; END IF;

  v_valor := CASE v_codigo
    WHEN 'consultas_realizadas' THEN fn_calcular_consultas_realizadas(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_no_prazo' THEN fn_calcular_evolucoes_no_prazo(v_pessoa, v_inicio, v_fim)
    WHEN 'taxa_comparecimento' THEN fn_calcular_taxa_comparecimento(v_pessoa, v_inicio, v_fim)
    WHEN 'contatos_inatividade' THEN fn_calcular_contatos_inatividade(v_pessoa, v_inicio, v_fim)
    WHEN 'pacientes_reativados' THEN fn_calcular_pacientes_reativados(v_pessoa, v_inicio, v_fim)
    WHEN 'contatos_pediatras' THEN fn_calcular_contatos_pediatras(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_para_pediatras' THEN fn_calcular_evolucoes_para_pediatras(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_cobertura' THEN fn_calcular_evolucoes_cobertura(v_pessoa, v_inicio, v_fim)
    WHEN 'evolucoes_24h' THEN fn_calcular_evolucoes_24h(v_pessoa, v_inicio, v_fim)
    ELSE 0
  END;

  UPDATE metas SET valor_atual = v_valor, updated_at = now() WHERE id = p_meta_id;

  INSERT INTO meta_acompanhamento (meta_id, data_referencia, valor_atual, percentual_atingido)
  VALUES (p_meta_id, (fn_agora_parede())::date, v_valor, CASE WHEN v_valor_meta > 0 THEN ROUND(v_valor / v_valor_meta * 100, 2) ELSE 0 END)
  ON CONFLICT (meta_id, data_referencia) DO UPDATE
    SET valor_atual = EXCLUDED.valor_atual,
        percentual_atingido = EXCLUDED.percentual_atingido;

  RETURN v_valor;
END;
$function$;

-- Só recalcula metas cujo período já começou e ainda não fechou há mais de 35 dias
-- (o mês anterior continua atualizando enquanto reativações de 30 dias podem cair nele).
CREATE OR REPLACE FUNCTION public.fn_atualizar_todas_metas_ativas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_meta_id uuid;
  v_hoje date := (fn_agora_parede())::date;
BEGIN
  FOR v_meta_id IN
    SELECT id FROM metas
    WHERE status = 'ativa'
      AND periodo_inicio <= v_hoje
      AND periodo_fim >= v_hoje - 35
  LOOP
    PERFORM fn_atualizar_meta(v_meta_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

DROP VIEW IF EXISTS vw_metas_dashboard;
CREATE VIEW vw_metas_dashboard AS
SELECT m.id,
    m.titulo,
    m.descricao,
    m.escopo,
    m.pessoa_id,
    p.nome AS pessoa_nome,
    p.role AS pessoa_role,
    tm.id AS tipo_meta_id,
    tm.codigo AS tipo_meta_codigo,
    tm.nome AS tipo_meta_nome,
    tm.categoria,
    tm.unidade_medida,
    tm.role_alvo,
    m.periodo_inicio,
    m.periodo_fim,
    m.mes_referencia,
    m.ano_referencia,
    m.valor_meta,
    m.valor_minimo,
    m.valor_atual,
    m.status,
    round(((m.valor_atual / NULLIF(m.valor_meta, 0)) * 100), 2) AS percentual_atingido,
    GREATEST((m.periodo_fim - (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0) AS dias_restantes,
    CASE
        WHEN (m.valor_atual >= m.valor_meta) THEN 'atingida'
        WHEN (m.valor_atual >= COALESCE(m.valor_minimo, (m.valor_meta * 0.8))) THEN 'em_andamento'
        ELSE 'atrasada'
    END AS status_atingimento,
    m.created_at,
    m.updated_at,
    m.niveis,
    m.requisito_meta_id,
    req.titulo AS requisito_titulo,
    req.valor_atual AS requisito_valor_atual,
    req.valor_meta AS requisito_valor_meta,
    (req.id IS NULL OR req.valor_atual >= req.valor_meta) AS requisito_ok,
    (SELECT max((n ->> 'bonus')::numeric)
       FROM jsonb_array_elements(COALESCE(m.niveis, '[]'::jsonb)) n
      WHERE (n ->> 'valor')::numeric <= m.valor_atual) AS bonus_nivel,
    (SELECT count(*)::int
       FROM jsonb_array_elements(COALESCE(m.niveis, '[]'::jsonb)) n
      WHERE (n ->> 'valor')::numeric <= m.valor_atual) AS nivel_atingido
FROM metas m
JOIN tipos_meta tm ON tm.id = m.tipo_meta_id
LEFT JOIN pessoas p ON p.id = m.pessoa_id
LEFT JOIN metas req ON req.id = m.requisito_meta_id;

REVOKE ALL ON vw_metas_dashboard FROM anon;
GRANT SELECT ON vw_metas_dashboard TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Recalcular metas de hora em hora (08h–20h de Brasília = 11h–23h UTC)
-- ---------------------------------------------------------------------------

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'metas_recalculo_horario';
SELECT cron.schedule('metas_recalculo_horario', '5 11-23 * * *',
  $$SELECT public.fn_atualizar_todas_metas_ativas();$$);

-- ---------------------------------------------------------------------------
-- 8. Base dos relatórios (admin): uma linha compacta por agendamento + contatos
--    Uma chamada só, em JSON, para não bater no limite de 1000 linhas do PostgREST.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_relatorios_base()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT fn_rls_admin() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- IDs viram índices (posição nos arrays pacientes/profissionais/servicos)
  -- para o payload ficar leve: nenhum nome de paciente sai daqui.
  WITH ag AS (
    SELECT a.*, cs.codigo AS status_codigo
    FROM agendamentos a
    JOIN consulta_status cs ON cs.id = a.status_consulta_id
    WHERE a.ativo = true AND a.paciente_id IS NOT NULL
  ),
  pac AS (
    SELECT p.id, p.data_nascimento, (row_number() OVER (ORDER BY p.id)) - 1 AS ix
    FROM pessoas p WHERE p.id IN (SELECT DISTINCT paciente_id FROM ag)
  ),
  prof AS (
    SELECT p.id, p.nome, (row_number() OVER (ORDER BY p.nome)) - 1 AS ix
    FROM pessoas p WHERE p.id IN (SELECT DISTINCT profissional_id FROM ag)
  ),
  serv AS (
    SELECT ts.id, ts.nome, (row_number() OVER (ORDER BY ts.nome)) - 1 AS ix,
           CASE WHEN ts.nome ILIKE '%motor%' THEN 'motora'
                WHEN ts.nome ILIKE '%respirat%' OR ts.nome ILIKE '%aspira%' THEN 'respiratoria'
                ELSE 'outro' END AS grupo
    FROM tipo_servicos ts
  ),
  ev AS (
    SELECT id_agendamento, min(created_at) AS primeira
    FROM relatorio_evolucao GROUP BY id_agendamento
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'hoje', (fn_agora_parede())::date,
    'pacientes', (SELECT jsonb_agg(data_nascimento ORDER BY ix) FROM pac),
    'profissionais', (SELECT jsonb_agg(nome ORDER BY ix) FROM prof),
    'servicos', (SELECT jsonb_agg(jsonb_build_object('nome', nome, 'grupo', grupo) ORDER BY ix) FROM serv),
    -- [data_hora_parede, paciente_ix, profissional_ix, servico_ix, status, valor, horas_ate_evolucao|null]
    'sessoes', (
      SELECT jsonb_agg(jsonb_build_array(
        to_char(ag.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
        pac.ix, prof.ix, serv.ix,
        ag.status_codigo,
        ag.valor_servico,
        round((extract(epoch FROM ((ev.primeira AT TIME ZONE 'America/Sao_Paulo') - (ag.data_hora AT TIME ZONE 'UTC'))) / 3600.0)::numeric, 1)
      ) ORDER BY ag.data_hora)
      FROM ag
      JOIN pac ON pac.id = ag.paciente_id
      LEFT JOIN prof ON prof.id = ag.profissional_id
      LEFT JOIN serv ON serv.id = ag.tipo_servico_id
      LEFT JOIN ev ON ev.id_agendamento = ag.id
    ),
    -- [data_contato_parede, paciente_ix, conta_para_meta, resultado]
    'contatos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_array(
        to_char(pe.data_evento AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'),
        pac.ix,
        COALESCE((pe.dados_evento ->> 'conta_para_meta')::boolean, false),
        pe.dados_evento ->> 'status'
      ) ORDER BY pe.data_evento), '[]'::jsonb)
      FROM pessoa_eventos pe
      JOIN pac ON pac.id = pe.pessoa_id
      WHERE pe.tipo_evento = 'contato_inatividade'
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_relatorios_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_relatorios_base() TO authenticated;
