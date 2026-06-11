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
-- Parte 3: view enriquecida (conciliação conversa x sistema)
-- security_invoker = on => RLS das tabelas-base aplica para quem consulta.
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
-- pacientes vinculados: a própria pessoa + dependentes (via pessoa_responsaveis)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', z.pid, 'nome', z.pnome)) AS pacientes
  FROM (
    SELECT p.id AS pid, p.nome AS pnome WHERE p.id IS NOT NULL
    UNION
    SELECT pr.id_pessoa, ps.nome
    FROM public.pessoa_responsaveis pr
    JOIN public.pessoas ps ON ps.id = pr.id_pessoa
    WHERE pr.id_responsavel = p.id
      AND COALESCE(pr.ativo, true) = true
  ) z
) pac ON true
-- agendamentos do sistema na janela da conversa (-45d .. +120d)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', a.id,
           'data_hora', a.data_hora,
           'paciente_nome', a.paciente_nome,
           'status_consulta', a.status_consulta_nome,
           'status_pagamento', a.status_pagamento_nome,
           'valor', a.valor_servico,
           'tem_nfe', (a.link_nfe IS NOT NULL),
           'fatura_id', a.fatura_id
         ) ORDER BY a.data_hora) AS agendamentos
  FROM public.vw_agendamentos_completos a
  WHERE a.ativo = true
    AND a.paciente_id IS NOT NULL
    AND (
      a.paciente_id = p.id
      OR a.paciente_id IN (
        SELECT pr.id_pessoa FROM public.pessoa_responsaveis pr
        WHERE pr.id_responsavel = p.id AND COALESCE(pr.ativo, true) = true
      )
    )
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
  WHERE COALESCE(f.ativo, true) = true
    AND f.paciente_id IS NOT NULL
    AND (
      f.paciente_id = p.id
      OR f.paciente_id IN (
        SELECT pr.id_pessoa FROM public.pessoa_responsaveis pr
        WHERE pr.id_responsavel = p.id AND COALESCE(pr.ativo, true) = true
      )
    )
    AND (
      f.status IN ('pendente', 'atrasado')
      OR f.created_at >= COALESCE(w.iniciada_em, w.created_at) - interval '45 days'
    )
) fat ON true;

GRANT SELECT ON public.vw_whatsapp_conversas_enriquecidas TO authenticated;
GRANT SELECT ON public.vw_whatsapp_conversas_enriquecidas TO service_role;
