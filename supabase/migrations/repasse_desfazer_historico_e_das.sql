-- =====================================================================
-- Desfazer repasse, histórico de repasses, e alíquota do DAS
-- =====================================================================

-- --------------------------------------------------------------------
-- Desfazer um repasse
--
-- Existe porque o acerto histórico é uma decisão de corte com R$ 146 mil
-- em jogo: se a data escolhida estiver errada, tem que dar para voltar.
-- Recusa desfazer o que já foi pago — aí o dinheiro saiu e desfazer
-- seria mentir sobre o caixa.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_repasse_desfazer(p_repasse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid; v_rep record; v_pago boolean; v_libertadas integer;
BEGIN
  SELECT id INTO v_pessoa FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND role = 'admin'
    AND is_approved AND ativo AND NOT bloqueado;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Só admin pode desfazer repasse';
  END IF;

  SELECT * INTO v_rep FROM public.repasses_profissional WHERE id = p_repasse_id;
  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'Repasse não encontrado';
  END IF;
  IF v_rep.status = 'cancelado' THEN
    RAISE EXCEPTION 'Este repasse já foi desfeito';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.contas_pagar
    WHERE lancamento_id = v_rep.lancamento_id AND status_pagamento = 'pago'
  ) INTO v_pago;

  IF v_pago THEN
    RAISE EXCEPTION 'Este repasse já foi pago — não dá para desfazer sem estornar o pagamento antes';
  END IF;

  UPDATE public.margens_atendimento SET repasse_id = NULL WHERE repasse_id = p_repasse_id;
  GET DIAGNOSTICS v_libertadas = ROW_COUNT;

  IF v_rep.lancamento_id IS NOT NULL THEN
    DELETE FROM public.contas_pagar WHERE lancamento_id = v_rep.lancamento_id;
    UPDATE public.lancamentos_financeiros
    SET status_lancamento = 'cancelado', atualizado_por = v_pessoa, updated_at = now()
    WHERE id = v_rep.lancamento_id;
  END IF;

  UPDATE public.repasses_profissional
  SET status = 'cancelado',
      observacoes = coalesce(observacoes || ' | ', '') || 'Desfeito em ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
      updated_at = now()
  WHERE id = p_repasse_id;

  RETURN jsonb_build_object('repasse_id', p_repasse_id,
                            'margens_liberadas', v_libertadas,
                            'valor', v_rep.valor_total);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_repasse_desfazer(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_repasse_desfazer(uuid) TO authenticated;

-- --------------------------------------------------------------------
-- Histórico de repasses, com a situação da conta a pagar
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_repasses_historico
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.profissional_id,
  p.nome AS profissional,
  r.empresa_id,
  COALESCE(NULLIF(pe.nome_fantasia, ''), pe.razao_social) AS empresa,
  cf.nome AS carteira,
  r.fechado_em,
  r.qtd_atendimentos,
  r.valor_total,
  r.status,
  r.observacoes,
  r.lancamento_id,
  r.created_at,
  cp.status_pagamento,
  cp.data_vencimento,
  cp.data_pagamento
FROM public.repasses_profissional r
JOIN public.pessoas p ON p.id = r.profissional_id
LEFT JOIN public.pessoa_empresas pe ON pe.id = r.empresa_id
LEFT JOIN public.centros_financeiros cf ON cf.id = r.centro_financeiro_id
LEFT JOIN public.contas_pagar cp ON cp.lancamento_id = r.lancamento_id;

COMMENT ON VIEW public.vw_repasses_historico IS
  'Repasses fechados, com a situação da conta a pagar correspondente.';

GRANT SELECT ON public.vw_repasses_historico TO authenticated;

-- --------------------------------------------------------------------
-- Alíquota do DAS: 8,93% redondo, por decisão do dono
-- --------------------------------------------------------------------
UPDATE public.tributos_empresa
SET aliquota_percent = 8.93,
    observacoes = 'Simples Anexo III faixa 3 (RBT12 R$ 385.797,69 apurado em 31/08/2026). Depende do fator R >= 28%; abaixo disso é Anexo V. Confirmar com a contadora.'
WHERE tipo_tributo = 'DAS' AND ativo
  AND empresa_id = (SELECT id FROM public.pessoa_empresas WHERE nome_fantasia = 'F.S PACHECO');

-- --------------------------------------------------------------------
-- Acerto histórico aplicado em 01/09/2026
--
-- Corte em 31/08/2026: toda a comissão de ago/2025 a ago/2026 foi paga
-- fora do sistema. 1.878 atendimentos, R$ 146.111, em 4 repasses
-- (por profissional × empresa). Daqui em diante o fechamento é mensal.
--
--   SELECT public.fn_repasse_acerto_historico('2026-08-31', '...');
-- --------------------------------------------------------------------
