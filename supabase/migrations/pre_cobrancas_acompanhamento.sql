-- Acompanhamento de pré-cobranças + contador de lembretes das faturas ASAAS
-- --------------------------------------------------------------------------
-- Motivação: depois que a régua de lembrete das PRÉ-cobranças entrou no ar, o
-- dono ficou sem visibilidade do funil (quantas pré-cobranças de um lote foram
-- pagas x seguem em aberto) e sem enxergar quantos lembretes cada cobrança já
-- recebeu. Esta migration entrega:
--   1. Contador de lembretes nas COBRANÇAS ASAAS reais (faturas) — a régua das
--      pré-cobranças já tinha `pagamento_links.lembretes_enviados`.
--   2. RPC para o fluxo n8n do dono registrar cada lembrete de fatura enviado.
--   3. Exposição do contador na view de faturas.
--   4. View de acompanhamento (funil) das pré-cobranças, com o desfecho de cada
--      link (paga / aguardando pagamento / pendente / expirada / cancelada).
-- Tudo aditivo — nenhuma coluna/loja existente é removida ou alterada.

-- ==========================================================================
-- 1. Contador de lembretes nas COBRANÇAS ASAAS reais
-- ==========================================================================
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS lembretes_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_lembrete_em timestamptz;

COMMENT ON COLUMN public.faturas.lembretes_enviados IS
  'Nº de lembretes de inadimplência já enviados desta cobrança ASAAS. Incrementado pelo fluxo n8n via fn_registrar_lembrete_fatura.';

-- ==========================================================================
-- 2. RPC que o fluxo n8n chama ao enviar um lembrete de fatura ASAAS vencida.
--    Uso no n8n (nó Supabase -> RPC): fn_registrar_lembrete_fatura com
--    p_id_asaas = {{ id da cobrança no ASAAS, ex.: pay_xxx }}.
--    Retorna o novo total de lembretes (NULL = fatura não encontrada/ inativa).
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_lembrete_fatura(p_id_asaas text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo integer;
BEGIN
  UPDATE public.faturas
     SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
         ultimo_lembrete_em = now()
   WHERE id_asaas = p_id_asaas
     AND ativo = true
   RETURNING lembretes_enviados INTO v_novo;
  RETURN v_novo;
END;
$function$;

-- ==========================================================================
-- 3. vw_faturas_completas: recriada acrescentando ao FIM (CREATE OR REPLACE só
--    permite adicionar colunas no fim) lembretes_enviados, ultimo_lembrete_em e
--    pagamento_link_id (derivado de dados_asaas -> origem link de pagamento).
-- ==========================================================================
CREATE OR REPLACE VIEW public.vw_faturas_completas AS
 SELECT f.id,
    f.id_asaas,
    f.valor_total,
    f.descricao,
    f.status,
    f.vencimento,
    f.criado_em,
    f.pago_em,
    f.dados_asaas,
    f.observacoes,
    f.link_nfe,
    f.status_nfe,
    f.ativo,
    f.created_at,
    f.updated_at,
    f.paciente_id,
    pac.nome AS paciente_nome,
    pe.id AS empresa_id,
    pe.razao_social AS empresa_razao_social,
    pe.nome_fantasia AS empresa_nome_fantasia,
    pr.id AS responsavel_id,
    pr.nome AS responsavel_nome,
    pr.cpf_cnpj AS responsavel_cpf,
    pr.email AS responsavel_email,
    pc.nome AS criador_nome,
    ( SELECT count(*) AS count
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS qtd_consultas,
    ( SELECT min(a.data_hora) AS min
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS periodo_inicio,
    ( SELECT max(a.data_hora) AS max
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS periodo_fim,
    ( SELECT array_agg(a.data_hora ORDER BY a.data_hora) AS array_agg
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS datas_consultas,
    ARRAY( SELECT DISTINCT p.nome
           FROM agendamentos a
             JOIN pessoas p ON p.id = a.paciente_id
          WHERE a.fatura_id = f.id AND a.ativo = true
          ORDER BY p.nome) AS pacientes_atendidos,
    ARRAY( SELECT DISTINCT p.nome
           FROM agendamentos a
             JOIN pessoas p ON p.id = a.profissional_id
          WHERE a.fatura_id = f.id AND a.ativo = true
          ORDER BY p.nome) AS profissionais_envolvidos,
    f.valor_servico,
    f.lembretes_enviados,
    f.ultimo_lembrete_em,
    (f.dados_asaas ->> 'pagamento_link_id') AS pagamento_link_id
   FROM faturas f
     LEFT JOIN pessoa_empresas pe ON pe.id = f.empresa_id
     LEFT JOIN pessoas pr ON pr.id = f.responsavel_cobranca_id
     LEFT JOIN pessoas pac ON pac.id = f.paciente_id
     LEFT JOIN pessoas pc ON pc.id = f.criado_por
  WHERE f.ativo = true;

-- ==========================================================================
-- 4. vw_pre_cobrancas_completa: 1 linha por pagamento_link (TODOS os status),
--    com o desfecho consolidado + join da fatura resultante + contador de
--    lembretes. Base do painel de funil. Segue o mesmo padrão de segurança da
--    vw_faturas_completas (view definer) + GRANT SELECT a authenticated.
--    Desfecho:
--      paga                -> fatura paga
--      estornada           -> fatura estornada
--      aguardando_pagamento-> cobrança ASAAS criada, ainda não paga
--      cancelada           -> link cancelado/inativo ou fatura cancelada
--      expirada            -> link expirado (sem pagamento)
--      pendente            -> pré-cobrança ainda em aberto (no prazo ou vencida)
-- ==========================================================================
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
      WHEN pl.status = 'expirado' OR (pl.expira_em IS NOT NULL AND pl.expira_em < now()) THEN 'expirada'
      ELSE 'pendente'
    END AS desfecho,
    ( SELECT count(*)
        FROM agendamentos a
       WHERE a.ativo = true
         AND (a.pagamento_link_id = pl.id
              OR (pl.fatura_id IS NOT NULL AND a.fatura_id = pl.fatura_id))
    ) AS qtd_consultas
   FROM pagamento_links pl
     LEFT JOIN faturas f ON f.id = pl.fatura_id
     LEFT JOIN pessoas r ON r.id = pl.responsavel_cobranca_id
     LEFT JOIN pessoas pac ON pac.id = pl.paciente_id
     LEFT JOIN pessoa_empresas emp ON emp.id = pl.empresa_id;

GRANT SELECT ON public.vw_pre_cobrancas_completa TO authenticated;
