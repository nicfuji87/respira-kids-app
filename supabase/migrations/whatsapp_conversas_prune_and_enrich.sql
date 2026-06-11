-- AI dev note: Enxuga a whatsapp_conversas (remove parâmetros de baixo valor da IA),
-- vincula a conversa a uma pessoa pelo telefone (backfill pessoa_id) e cria a view
-- enriquecida usada pelo dashboard para a conciliação conversa x sistema.
-- Aplicada via Supabase MCP em 2026-06-11.

-- =====================================================
-- Parte 1: remover colunas de baixo valor (IA)
-- (os CHECK constraints dessas colunas caem junto)
-- =====================================================
ALTER TABLE public.whatsapp_conversas
  DROP COLUMN IF EXISTS intencoes_secundarias,
  DROP COLUMN IF EXISTS etapa_conversa,
  DROP COLUMN IF EXISTS idade_paciente_mencionada,
  DROP COLUMN IF EXISTS sintomas_mencionados,
  DROP COLUMN IF EXISTS sinais_alerta_clinicos,
  DROP COLUMN IF EXISTS urgencia_clinica,
  DROP COLUMN IF EXISTS necessita_triagem_humana,
  DROP COLUMN IF EXISTS solicitacao_mesmo_dia,
  DROP COLUMN IF EXISTS pesquisa_satisfacao_enviada,
  DROP COLUMN IF EXISTS qualidade_atendimento,
  DROP COLUMN IF EXISTS dados_sensiveis_detectados,
  DROP COLUMN IF EXISTS tipos_dados_sensiveis,
  DROP COLUMN IF EXISTS risco_lgpd,
  DROP COLUMN IF EXISTS indicacao_pediatra_mencionada,
  DROP COLUMN IF EXISTS solicitou_encaixe,
  DROP COLUMN IF EXISTS confianca_analise;

-- =====================================================
-- Parte 2: vincular conversa -> pessoa (telefone exato)
-- =====================================================
UPDATE public.whatsapp_conversas w
SET pessoa_id = sub.id
FROM (
  SELECT DISTINCT ON (telefone::text) telefone::text AS tel, id
  FROM public.pessoas
  WHERE telefone IS NOT NULL
  ORDER BY telefone::text, created_at ASC
) sub
WHERE sub.tel = w.contato_telefone
  AND w.pessoa_id IS DISTINCT FROM sub.id;

-- =====================================================
-- Parte 3: índice funcional p/ casar telefone (evita seq scan por linha)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_pessoas_telefone_text
  ON public.pessoas ((telefone::text))
  WHERE telefone IS NOT NULL;

-- =====================================================
-- Parte 4: view enriquecida (conciliação conversa x sistema)
-- security_invoker = on => RLS das tabelas-base aplica para quem consulta.
-- Usa tabelas base + índices (idx_agendamentos_paciente_data, idx_faturas_paciente_id,
-- idx_pessoas_telefone_text) — ~50ms para ~300 conversas. NÃO usar
-- vw_agendamentos_completos aqui (join de ~10 tabelas estoura o statement_timeout).
-- =====================================================
CREATE OR REPLACE VIEW public.vw_whatsapp_conversas_enriquecidas
WITH (security_invoker = on) AS
SELECT
  w.*,
  p.id   AS pessoa_vinculada_id,
  p.nome AS pessoa_vinculada_nome,
  (p.id IS NOT NULL) AS cliente_cadastrado,
  COALESCE(pac.pacientes, '[]'::jsonb)   AS pacientes_vinculados,
  COALESCE(ag.agendamentos, '[]'::jsonb) AS agendamentos_sistema,
  COALESCE(fat.faturas, '[]'::jsonb)     AS faturas_sistema
FROM public.whatsapp_conversas w
-- pessoa pelo telefone (match exato)
LEFT JOIN LATERAL (
  SELECT pp.id, pp.nome
  FROM public.pessoas pp
  WHERE pp.telefone IS NOT NULL
    AND pp.telefone::text = w.contato_telefone
  ORDER BY pp.created_at ASC
  LIMIT 1
) p ON true
-- conjunto de pacientes: a própria pessoa + dependentes ativos (calculado uma vez)
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT pid) AS ids
  FROM (
    SELECT p.id AS pid WHERE p.id IS NOT NULL
    UNION
    SELECT pr.id_pessoa
    FROM public.pessoa_responsaveis pr
    WHERE pr.id_responsavel = p.id AND COALESCE(pr.ativo, true) = true
  ) s
) pids ON true
-- nomes dos pacientes vinculados
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', ps.id, 'nome', ps.nome)) AS pacientes
  FROM public.pessoas ps
  WHERE pids.ids IS NOT NULL AND ps.id = ANY(pids.ids)
) pac ON true
-- agendamentos do sistema na janela da conversa (-45d .. +120d)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', a.id,
           'data_hora', a.data_hora,
           'paciente_nome', pn.nome,
           'status_consulta', cs.descricao,
           'status_pagamento', ps2.descricao,
           'valor', a.valor_servico,
           'tem_nfe', (a.link_nfe IS NOT NULL),
           'fatura_id', a.fatura_id
         ) ORDER BY a.data_hora) AS agendamentos
  FROM public.agendamentos a
  LEFT JOIN public.pessoas pn ON pn.id = a.paciente_id
  LEFT JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  LEFT JOIN public.pagamento_status ps2 ON ps2.id = a.status_pagamento_id
  WHERE pids.ids IS NOT NULL
    AND a.ativo = true
    AND a.paciente_id = ANY(pids.ids)
    AND a.data_hora >= COALESCE(w.iniciada_em, w.created_at) - interval '45 days'
    AND a.data_hora <= COALESCE(w.ultima_mensagem_em, w.created_at) + interval '120 days'
) ag ON true
-- faturas do sistema (em aberto sempre + recentes na janela)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', f.id,
           'status', f.status,
           'status_nfe', f.status_nfe,
           'tem_nfe', (f.link_nfe IS NOT NULL),
           'vencimento', f.vencimento,
           'valor', f.valor_total
         ) ORDER BY f.created_at DESC) AS faturas
  FROM public.faturas f
  WHERE pids.ids IS NOT NULL
    AND COALESCE(f.ativo, true) = true
    AND f.paciente_id = ANY(pids.ids)
    AND (
      f.status IN ('pendente', 'atrasado')
      OR f.created_at >= COALESCE(w.iniciada_em, w.created_at) - interval '45 days'
    )
) fat ON true;

GRANT SELECT ON public.vw_whatsapp_conversas_enriquecidas TO authenticated;
GRANT SELECT ON public.vw_whatsapp_conversas_enriquecidas TO service_role;

-- =====================================================
-- Parte 5: RPC de leitura (SECURITY DEFINER)
-- O dashboard lê por aqui, não pela view direta: a view é security_invoker e,
-- sob o role authenticated, aplicaria RLS (is_admin/is_secretaria) em cada
-- tabela-base do join — caro e sujeito a falta de grant (erro 500). A função
-- checa o papel uma vez (mesma regra da RLS da tabela) e roda a view como dono.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_whatsapp_conversas_enriquecidas()
RETURNS SETOF public.vw_whatsapp_conversas_enriquecidas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.vw_whatsapp_conversas_enriquecidas
  ORDER BY ultima_mensagem_em DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_conversas_enriquecidas() FROM public;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_conversas_enriquecidas() TO authenticated;
