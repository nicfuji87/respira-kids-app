-- AI dev note: Fluxo de link público de pagamento (PIX x Cartão com repasse de taxas).
-- Ao "gerar cobrança", a secretaria cria um pagamento_links (intent) e reserva as
-- consultas. A cobrança no Asaas + a fatura só são criadas quando o cliente escolhe
-- a forma na página pública (#/pagamento/:token), via edge function confirm-payment-link.
--
-- Componentes:
--   1. Tabela pagamento_links (o intent / link público)
--   2. agendamentos.pagamento_link_id (reserva da consulta enquanto o link está pendente)
--   3. pessoa_empresas.taxas_cartao (tabela de taxas configurável por empresa)
--   4. RLS (admin/secretaria/service_role) + RPC pública SECURITY DEFINER por token

-- ============================================================
-- 1. pessoa_empresas.taxas_cartao (config de taxas por empresa)
-- ============================================================
-- Default vindo dos prints (MDR + antecipação automática). Ajustável por empresa.
ALTER TABLE public.pessoa_empresas
  ADD COLUMN IF NOT EXISTS taxas_cartao jsonb NOT NULL DEFAULT '{
    "max_parcelas": 6,
    "pix": { "percent": 0, "fixo": 0 },
    "cartao": {
      "fixo": 0.49,
      "faixas": [
        { "min": 1, "max": 1, "mdr": 2.99, "antecipacao_mes": 1.15, "meses": 1 },
        { "min": 2, "max": 6, "mdr": 3.49, "antecipacao_mes": 1.60, "meses": null }
      ]
    }
  }'::jsonb;

-- ============================================================
-- 2. Tabela pagamento_links
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagamento_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,

  paciente_id uuid NOT NULL REFERENCES public.pessoas(id),
  responsavel_cobranca_id uuid NOT NULL REFERENCES public.pessoas(id),
  empresa_id uuid NOT NULL REFERENCES public.pessoa_empresas(id),

  valor_base numeric NOT NULL CHECK (valor_base > 0),
  descricao text,
  vencimento date,

  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'expirado', 'cancelado')),
  forma_escolhida text
    CHECK (forma_escolhida IS NULL OR forma_escolhida IN ('pix', 'credit_card')),
  installment_count int,

  fatura_id uuid REFERENCES public.faturas(id),
  id_asaas text,

  taxas_snapshot jsonb NOT NULL,
  opcoes_snapshot jsonb,

  expira_em timestamptz,
  criado_por uuid REFERENCES public.pessoas(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_pagamento_links_token ON public.pagamento_links(token);
CREATE INDEX IF NOT EXISTS idx_pagamento_links_status ON public.pagamento_links(status);
CREATE INDEX IF NOT EXISTS idx_pagamento_links_empresa ON public.pagamento_links(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagamento_links_paciente ON public.pagamento_links(paciente_id);

-- ============================================================
-- 3. agendamentos.pagamento_link_id (reserva da consulta)
-- ============================================================
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS pagamento_link_id uuid REFERENCES public.pagamento_links(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_pagamento_link
  ON public.agendamentos(pagamento_link_id);

-- ============================================================
-- 4. RLS (espelha o padrão de faturas: admin + secretaria + service_role)
-- ============================================================
ALTER TABLE public.pagamento_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagamento_links_admin_full ON public.pagamento_links;
CREATE POLICY pagamento_links_admin_full ON public.pagamento_links
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS pagamento_links_secretaria_full ON public.pagamento_links;
CREATE POLICY pagamento_links_secretaria_full ON public.pagamento_links
  FOR ALL USING (public.is_secretaria()) WITH CHECK (public.is_secretaria());

DROP POLICY IF EXISTS pagamento_links_service_role_bypass ON public.pagamento_links;
CREATE POLICY pagamento_links_service_role_bypass ON public.pagamento_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. RPC pública SECURITY DEFINER (leitura por token, sem dados sensíveis)
-- ============================================================
-- Retorna a visão pública do link (PagamentoLinkPublico). Como é SECURITY DEFINER,
-- roda com privilégios do owner e ignora RLS — por isso só expõe campos não sensíveis
-- (nunca a API key da empresa). É a única porta de leitura pública (anon).
CREATE OR REPLACE FUNCTION public.get_pagamento_link_publico(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.pagamento_links%ROWTYPE;
  v_paciente_nome text;
  v_empresa_nome text;
  v_datas text[];
  v_expirado boolean;
BEGIN
  SELECT * INTO v_link FROM public.pagamento_links
  WHERE token = p_token AND ativo = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT nome INTO v_paciente_nome FROM public.pessoas WHERE id = v_link.paciente_id;
  SELECT COALESCE(nome_fantasia, razao_social) INTO v_empresa_nome
  FROM public.pessoa_empresas WHERE id = v_link.empresa_id;

  SELECT array_agg(to_char(a.data_hora, 'YYYY-MM-DD') ORDER BY a.data_hora)
  INTO v_datas
  FROM public.agendamentos a
  WHERE a.pagamento_link_id = v_link.id;

  v_expirado := v_link.expira_em IS NOT NULL AND v_link.expira_em < now();

  RETURN jsonb_build_object(
    'token', v_link.token,
    'status', v_link.status,
    'paciente_nome', COALESCE(v_paciente_nome, 'Paciente'),
    'empresa_nome', COALESCE(v_empresa_nome, ''),
    'valor_base', v_link.valor_base,
    'descricao', v_link.descricao,
    'vencimento', v_link.vencimento,
    'forma_escolhida', v_link.forma_escolhida,
    'installment_count', v_link.installment_count,
    'opcoes', v_link.opcoes_snapshot,
    'datas_consultas', COALESCE(to_jsonb(v_datas), '[]'::jsonb),
    'expira_em', v_link.expira_em,
    'expirado', v_expirado
  );
END;
$$;

-- Permitir execução pela página pública (anon) e usuários autenticados.
GRANT EXECUTE ON FUNCTION public.get_pagamento_link_publico(text) TO anon, authenticated;
