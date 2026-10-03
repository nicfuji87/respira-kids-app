-- Atendimento social fora da meta de reativação (decisão do dono, 03/10/2026).
--
-- Social = tipo de serviço "... - SOCIAL" (valor R$ 0). São 231 sessões nos
-- últimos 12 meses, 12 pacientes que só fizeram social e 38 que misturam
-- social com atendimento pago.
--
-- Regras:
--  * Reativação só conta com sessão que gera faturamento (serviço não-social
--    E valor_servico > 0). Paciente misto continua valendo: se voltar para uma
--    sessão paga, conta; se voltar só para a social, não conta.
--  * Quem só tem histórico social sai da lista de contatos, para a secretária
--    não gastar a cota de 150 com família que nunca vira reativação. Ela pode
--    contatar assim mesmo pela busca; só não conta para a meta.
--  * A pesquisa de experiência NÃO exclui social: lá o que importa é ouvir a
--    família, e filtrar por quem paga enviesaria a pesquisa.

CREATE OR REPLACE FUNCTION public.fn_sessao_fatura(p_tipo_servico_id uuid, p_valor numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_valor, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM tipo_servicos ts
       WHERE ts.id = p_tipo_servico_id AND ts.nome ILIKE '%social%'
     );
$$;

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
                ELSE 'outro' END AS servico,
           (COALESCE(a.valor_servico, 0) > 0 AND ts.nome NOT ILIKE '%social%') AS fatura
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
           bool_or(s.quando > v_agora) AS tem_futuro,
           -- Paciente só-social nunca gera reativação que conta
           bool_or(s.fatura AND s.quando <= v_agora) AS ja_faturou
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
      AND COALESCE(h.ja_faturou, false)
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
           WHEN (b.idade_meses IS NOT NULL AND b.idade_meses >= 72) OR b.dias > 365 THEN 3
           WHEN (b.fez_resp AND b.idade_meses IS NOT NULL AND b.idade_meses < 12) THEN 1
           WHEN b.perfil = 'motora_alta' AND v_mes BETWEEN 2 AND 4 THEN 1
           ELSE 2
         END,
         b.id_responsavel, b.resp_nome, b.resp_tel,
         b.total, b.ultimo, b.resultado, b.proximo,
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

-- Reativação só com sessão que fatura
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
   AND fn_sessao_fatura(a.tipo_servico_id, a.valor_servico)
   AND (a.data_hora AT TIME ZONE 'UTC') <= fn_agora_parede()
   AND (a.data_hora AT TIME ZONE 'UTC') >= (pe.data_evento AT TIME ZONE 'America/Sao_Paulo')
   AND (a.data_hora AT TIME ZONE 'UTC') <= (pe.data_evento AT TIME ZONE 'America/Sao_Paulo') + interval '30 days'
  WHERE pe.tipo_evento = 'contato_inatividade'
    AND (pe.dados_evento ->> 'conta_para_meta')::boolean IS TRUE
    AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_inicio AND p_fim
    AND (p_pessoa_id IS NULL OR pe.contatado_por = p_pessoa_id);
$$;

UPDATE tipos_meta
   SET descricao = 'Pacientes contatados que fizeram sessão paga em até 30 dias após o contato (atendimento social não conta). Conta no mês da sessão.'
 WHERE codigo = 'pacientes_reativados';
