-- Fix: vw_pre_cobrancas_completa considerava faturas EXCLUÍDAS (ativo=false) como
-- "aguardando_pagamento". Cenário: admin exclui a fatura que nasceu de um link ->
-- excluirFatura marca a fatura ativo=false e solta as consultas, MAS o pagamento_links
-- ficava 'confirmado' apontando para a fatura morta (link órfão). A view lia essa
-- fatura excluída e mostrava a cobrança como "aguardando", enquanto ela sumia dos
-- detalhes do paciente (consultas sem fatura_id + link com id_asaas). Agora o JOIN só
-- enxerga fatura ATIVA, e um link 'confirmado' cuja fatura foi excluída vira 'cancelada'.
-- (A raiz — cancelar o link órfão ao excluir a fatura — foi corrigida em faturas-api.ts:
--  excluirFatura + ajustarFaturaManual. Backfill dos 5 links órfãos existentes: aplicado.)
CREATE OR REPLACE VIEW public.vw_pre_cobrancas_completa AS
 SELECT pl.id,
    pl.token,
    pl.criado_em,
    pl.vencimento,
    pl.expira_em,
    pl.status AS link_status,
    pl.ativo,
    pl.valor_base,
    pl.empresa_id,
    COALESCE(emp.nome_fantasia, emp.razao_social) AS empresa_nome,
    pl.responsavel_cobranca_id,
    r.nome AS responsavel_nome,
    pl.paciente_id,
    pac.nome AS paciente_nome,
    COALESCE(pl.lembretes_enviados, 0) AS lembretes_enviados,
    pl.ultimo_lembrete_em,
    pl.fatura_id,
    pl.id_asaas,
    f.status AS fatura_status,
    f.pago_em,
    f.valor_total AS fatura_valor_total,
    CASE
      WHEN f.status = 'pago' THEN 'paga'
      WHEN f.status = 'estornado' THEN 'estornada'
      WHEN f.status IN ('pendente', 'atrasado') THEN 'aguardando_pagamento'
      WHEN pl.status = 'cancelado' OR pl.ativo = false OR f.status = 'cancelado' THEN 'cancelada'
      WHEN pl.status = 'confirmado' THEN 'cancelada'
      WHEN pl.status = 'expirado' OR (pl.expira_em IS NOT NULL AND pl.expira_em < now()) THEN 'expirada'
      ELSE 'pendente'
    END AS desfecho,
    ( SELECT count(*)
        FROM agendamentos a
       WHERE a.ativo = true
         AND (a.pagamento_link_id = pl.id
              OR (pl.fatura_id IS NOT NULL AND a.fatura_id = pl.fatura_id))
    ) AS qtd_consultas
   FROM public.pagamento_links pl
     LEFT JOIN public.faturas f ON f.id = pl.fatura_id AND f.ativo = true
     LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
     LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
     LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id;

-- Backfill (já aplicado via MCP em 2026-07-18): cancela os 5 links órfãos existentes
-- (ativos, 'confirmado', apontando para fatura já excluída; consultas já soltas).
UPDATE public.pagamento_links pl
SET status = 'cancelado', ativo = false, atualizado_em = now()
WHERE pl.ativo = true
  AND EXISTS (SELECT 1 FROM public.faturas f WHERE f.id = pl.fatura_id AND f.ativo = false);
