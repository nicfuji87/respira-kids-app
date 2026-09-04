-- =====================================================================
-- Repasse de comissão a profissionais — regime de caixa
--
-- Decisão do dono (31/08/2026): a profissional recebe quando o cliente
-- paga. Cliente inadimplente, ela não recebe. Cliente que paga DEPOIS de
-- já termos pago o fechamento, a diferença precisa aparecer para ser paga.
--
-- Consequência de desenho: o pendente NÃO é filtrado por data de
-- atendimento. É tudo que tem margem gerada — e a margem só nasce quando
-- a fatura é paga (trigger `faturas_margens_aiu`) — e ainda não entrou em
-- nenhum repasse. Um atendimento de junho cuja fatura só foi paga em
-- setembro entra sozinho no fechamento de setembro, sem ninguém lembrar.
--
-- O repasse é por (profissional × empresa): a Beatriz tem atendimento
-- faturado pela BC e pela F.S, e cada empresa paga a comissão do que ela
-- mesma faturou. Por isso a conta a pagar nasce na carteira da empresa,
-- com natureza `individual`.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. Categoria contábil da comissão
-- --------------------------------------------------------------------
INSERT INTO public.categorias_contabeis (codigo, nome, descricao, categoria_pai_id, nivel, ativo)
SELECT 'COMISSAO_PROF',
       'Comissão de profissionais',
       'Repasse de comissão por atendimento, pago depois que o cliente paga.',
       (SELECT id FROM public.categorias_contabeis WHERE codigo = 'GASTO_VAR'),
       2, true
WHERE NOT EXISTS (SELECT 1 FROM public.categorias_contabeis WHERE codigo = 'COMISSAO_PROF');

-- --------------------------------------------------------------------
-- 2. Cabeçalho do repasse
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.repasses_profissional (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id      uuid NOT NULL REFERENCES public.pessoas(id),
  empresa_id           uuid REFERENCES public.pessoa_empresas(id),
  centro_financeiro_id uuid REFERENCES public.centros_financeiros(id),
  fechado_em           date NOT NULL DEFAULT CURRENT_DATE,
  qtd_atendimentos     integer NOT NULL DEFAULT 0,
  valor_total          numeric(12,2) NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'aberto'
                       CHECK (status IN ('aberto', 'pago', 'cancelado', 'acerto_historico')),
  lancamento_id        uuid REFERENCES public.lancamentos_financeiros(id),
  observacoes          text,
  criado_por           uuid REFERENCES public.pessoas(id),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

COMMENT ON TABLE public.repasses_profissional IS
  'Fechamento de comissão por profissional e empresa. status=acerto_historico marca o que foi acertado fora do sistema antes da virada.';

ALTER TABLE public.margens_atendimento
  ADD COLUMN IF NOT EXISTS repasse_id uuid REFERENCES public.repasses_profissional(id);

COMMENT ON COLUMN public.margens_atendimento.repasse_id IS
  'Repasse que já pagou esta comissão. NULL = ainda devido à profissional.';

-- O pendente é lido por este índice em toda abertura de tela.
CREATE INDEX IF NOT EXISTS idx_margens_repasse_pendente
  ON public.margens_atendimento (repasse_id) WHERE repasse_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_repasses_profissional_prof
  ON public.repasses_profissional (profissional_id, empresa_id, status);

ALTER TABLE public.repasses_profissional ENABLE ROW LEVEL SECURITY;

-- helper SECURITY DEFINER embrulhado em (select ...): chamar direto faz a
-- subconsulta reentrar na própria policy e estourar statement timeout.
DROP POLICY IF EXISTS repasses_admin_secretaria ON public.repasses_profissional;
CREATE POLICY repasses_admin_secretaria ON public.repasses_profissional
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_rls_admin_secretaria_completo()));

GRANT SELECT ON public.repasses_profissional TO authenticated;

-- --------------------------------------------------------------------
-- 3. Origem própria no lançamento, para a tela saber de onde veio
-- --------------------------------------------------------------------
ALTER TABLE public.lancamentos_financeiros
  DROP CONSTRAINT IF EXISTS lancamentos_financeiros_origem_lancamento_check;
ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT lancamentos_financeiros_origem_lancamento_check
  CHECK (origem_lancamento IN ('manual', 'api_ia', 'importacao', 'recorrente', 'repasse'));

-- --------------------------------------------------------------------
-- 4. O que está devido agora
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_repasses_pendentes
WITH (security_invoker = true) AS
SELECT
  a.profissional_id,
  p.nome                                        AS profissional,
  m.empresa_id,
  COALESCE(NULLIF(pe.nome_fantasia, ''), pe.razao_social) AS empresa,
  cf.id                                         AS centro_financeiro_id,
  cf.nome                                       AS carteira,
  count(*)                                      AS qtd_atendimentos,
  round(sum(m.comissao), 2)                     AS valor_devido,
  min(a.data_hora)::date                        AS atendimento_mais_antigo,
  max(a.data_hora)::date                        AS atendimento_mais_recente,
  -- pagamento que chegou depois do último fechamento é o caso que o dono
  -- pediu para não perder de vista
  -- timestamp, não data: pagamento que entra no mesmo dia do fechamento
  -- é justamente o caso mais provável e precisa ser sinalizado.
  count(*) FILTER (
    WHERE m.gerado_em > COALESCE(
      (SELECT max(r.created_at) FROM public.repasses_profissional r
        WHERE r.profissional_id = a.profissional_id
          AND r.empresa_id IS NOT DISTINCT FROM m.empresa_id
          AND r.status <> 'cancelado'), '-infinity'::timestamptz)
  ) AS chegou_apos_ultimo_fechamento,
  min(m.gerado_em) FILTER (
    WHERE m.gerado_em > COALESCE(
      (SELECT max(r.created_at) FROM public.repasses_profissional r
        WHERE r.profissional_id = a.profissional_id
          AND r.empresa_id IS NOT DISTINCT FROM m.empresa_id
          AND r.status <> 'cancelado'), '-infinity'::timestamptz)
  ) AS primeira_chegada_apos_fechamento
FROM public.margens_atendimento m
JOIN public.agendamentos a  ON a.id = m.agendamento_id
JOIN public.pessoas p       ON p.id = a.profissional_id
LEFT JOIN public.pessoa_empresas pe  ON pe.id = m.empresa_id
LEFT JOIN public.centros_financeiros cf ON cf.empresa_id = m.empresa_id AND cf.tipo = 'empresa'
WHERE m.repasse_id IS NULL
  AND m.status <> 'estornado'
  AND m.comissao > 0
GROUP BY 1,2,3,4,5,6;

COMMENT ON VIEW public.vw_repasses_pendentes IS
  'Comissão devida por profissional e empresa: atendimento cuja fatura já foi paga e que ainda não entrou em repasse. Sem recorte de data — pagamento atrasado entra sozinho.';

GRANT SELECT ON public.vw_repasses_pendentes TO authenticated;

-- --------------------------------------------------------------------
-- 5. Comissão paga que virou estorno depois — dinheiro a recuperar
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_repasses_a_recuperar
WITH (security_invoker = true) AS
SELECT
  a.profissional_id,
  p.nome                     AS profissional,
  m.empresa_id,
  COALESCE(NULLIF(pe.nome_fantasia, ''), pe.razao_social) AS empresa,
  m.repasse_id,
  r.fechado_em               AS repasse_em,
  count(*)                   AS qtd_atendimentos,
  round(sum(m.comissao), 2)  AS valor_a_recuperar,
  max(m.estornado_em)        AS estornado_em
FROM public.margens_atendimento m
JOIN public.agendamentos a ON a.id = m.agendamento_id
JOIN public.pessoas p      ON p.id = a.profissional_id
JOIN public.repasses_profissional r ON r.id = m.repasse_id
LEFT JOIN public.pessoa_empresas pe ON pe.id = m.empresa_id
WHERE m.status = 'estornado'
  AND m.repasse_id IS NOT NULL
  AND r.status <> 'cancelado'
GROUP BY 1,2,3,4,5,6;

COMMENT ON VIEW public.vw_repasses_a_recuperar IS
  'A comissão foi paga e depois a fatura do cliente foi cancelada ou estornada. Valor a descontar no próximo repasse.';

GRANT SELECT ON public.vw_repasses_a_recuperar TO authenticated;

-- --------------------------------------------------------------------
-- 6. Acerto histórico — a virada de chave
--
-- As profissionais já receberam de agosto/2025 até hoje, por fora. Sem
-- esta marcação o primeiro fechamento anunciaria um ano de retroativo já
-- quitado. Roda UMA vez, com a data que o dono escolher.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_repasse_acerto_historico(
  p_ate        date,
  p_observacao text DEFAULT 'Acerto histórico: pago fora do sistema antes da virada.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_grupo  record;
  v_rep    uuid;
  v_n      integer := 0;
  v_total  numeric := 0;
BEGIN
  SELECT id INTO v_pessoa FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND role = 'admin'
    AND is_approved AND ativo AND NOT bloqueado;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Só admin pode registrar acerto histórico de repasse';
  END IF;

  FOR v_grupo IN
    SELECT a.profissional_id, m.empresa_id,
           count(*) qtd, sum(m.comissao) valor
    FROM public.margens_atendimento m
    JOIN public.agendamentos a ON a.id = m.agendamento_id
    WHERE m.repasse_id IS NULL
      AND m.status <> 'estornado'
      AND m.comissao > 0
      AND a.data_hora < (p_ate + 1)
    GROUP BY 1, 2
  LOOP
    INSERT INTO public.repasses_profissional (
      profissional_id, empresa_id, centro_financeiro_id, fechado_em,
      qtd_atendimentos, valor_total, status, observacoes, criado_por
    ) VALUES (
      v_grupo.profissional_id, v_grupo.empresa_id,
      (SELECT id FROM public.centros_financeiros
        WHERE empresa_id = v_grupo.empresa_id AND tipo = 'empresa' LIMIT 1),
      p_ate, v_grupo.qtd, round(v_grupo.valor, 2),
      'acerto_historico', p_observacao, v_pessoa
    ) RETURNING id INTO v_rep;

    UPDATE public.margens_atendimento m
    SET repasse_id = v_rep
    FROM public.agendamentos a
    WHERE a.id = m.agendamento_id
      AND m.repasse_id IS NULL
      AND m.status <> 'estornado'
      AND m.comissao > 0
      AND a.data_hora < (p_ate + 1)
      AND a.profissional_id = v_grupo.profissional_id
      AND m.empresa_id IS NOT DISTINCT FROM v_grupo.empresa_id;

    v_n     := v_n + v_grupo.qtd;
    v_total := v_total + v_grupo.valor;
  END LOOP;

  RETURN jsonb_build_object('atendimentos', v_n, 'total', round(v_total, 2), 'ate', p_ate);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_repasse_acerto_historico(date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_repasse_acerto_historico(date, text) TO authenticated;

-- --------------------------------------------------------------------
-- 7. Fechar o repasse: vira conta a pagar na carteira da empresa
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_repasse_fechar(
  p_profissional_id uuid,
  p_empresa_id      uuid,
  p_vencimento      date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa    uuid;
  v_nome      text;
  v_centro    uuid;
  v_cat       uuid;
  v_qtd       integer;
  v_total     numeric;
  v_rep       uuid;
  v_lanc      uuid;
  v_venc      date;
  v_recuperar numeric := 0;
BEGIN
  SELECT id INTO v_pessoa FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND role = 'admin'
    AND is_approved AND ativo AND NOT bloqueado;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Só admin pode fechar repasse de comissão';
  END IF;

  SELECT nome INTO v_nome FROM public.pessoas WHERE id = p_profissional_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Profissional não encontrado';
  END IF;

  SELECT count(*), round(coalesce(sum(m.comissao), 0), 2)
    INTO v_qtd, v_total
  FROM public.margens_atendimento m
  JOIN public.agendamentos a ON a.id = m.agendamento_id
  WHERE m.repasse_id IS NULL
    AND m.status <> 'estornado'
    AND m.comissao > 0
    AND a.profissional_id = p_profissional_id
    AND m.empresa_id IS NOT DISTINCT FROM p_empresa_id;

  IF v_qtd = 0 THEN
    RETURN jsonb_build_object('atendimentos', 0, 'total', 0,
                              'mensagem', 'Nada devido a esta profissional nesta empresa.');
  END IF;

  -- comissão já paga cuja fatura foi estornada depois: informa, não desconta
  -- sozinho — quem decide se abate ou cobra à parte é uma pessoa.
  SELECT coalesce(sum(valor_a_recuperar), 0) INTO v_recuperar
  FROM public.vw_repasses_a_recuperar
  WHERE profissional_id = p_profissional_id
    AND empresa_id IS NOT DISTINCT FROM p_empresa_id;

  v_venc  := coalesce(p_vencimento, CURRENT_DATE + 5);
  v_centro := (SELECT id FROM public.centros_financeiros
               WHERE empresa_id = p_empresa_id AND tipo = 'empresa' LIMIT 1);
  v_cat    := (SELECT id FROM public.categorias_contabeis WHERE codigo = 'COMISSAO_PROF');

  INSERT INTO public.repasses_profissional (
    profissional_id, empresa_id, centro_financeiro_id, fechado_em,
    qtd_atendimentos, valor_total, status, criado_por
  ) VALUES (
    p_profissional_id, p_empresa_id, v_centro, CURRENT_DATE,
    v_qtd, v_total, 'aberto', v_pessoa
  ) RETURNING id INTO v_rep;

  INSERT INTO public.lancamentos_financeiros (
    tipo_lancamento, categoria_contabil_id, descricao,
    data_emissao, data_competencia, data_vencimento,
    valor_total, quantidade_parcelas, status_lancamento, origem_lancamento,
    centro_financeiro_id, natureza_custo, empresa_fatura_id,
    pessoa_responsavel_id, pago, criado_por, atualizado_por
  ) VALUES (
    'despesa', v_cat,
    format('Comissão %s - %s atend. - %s', v_nome, v_qtd, to_char(CURRENT_DATE, 'MM/YYYY')),
    CURRENT_DATE, date_trunc('month', CURRENT_DATE)::date, v_venc,
    v_total, 1, 'validado', 'repasse',
    v_centro, 'individual', p_empresa_id,
    p_profissional_id, false, v_pessoa, v_pessoa
  ) RETURNING id INTO v_lanc;

  INSERT INTO public.contas_pagar (
    lancamento_id, numero_parcela, total_parcelas, valor_parcela, data_vencimento
  ) VALUES (v_lanc, 1, 1, v_total, v_venc);

  UPDATE public.repasses_profissional SET lancamento_id = v_lanc, updated_at = now()
  WHERE id = v_rep;

  UPDATE public.margens_atendimento m
  SET repasse_id = v_rep
  FROM public.agendamentos a
  WHERE a.id = m.agendamento_id
    AND m.repasse_id IS NULL
    AND m.status <> 'estornado'
    AND m.comissao > 0
    AND a.profissional_id = p_profissional_id
    AND m.empresa_id IS NOT DISTINCT FROM p_empresa_id;

  RETURN jsonb_build_object(
    'repasse_id',   v_rep,
    'lancamento_id', v_lanc,
    'atendimentos', v_qtd,
    'total',        v_total,
    'vencimento',   v_venc,
    'a_recuperar',  v_recuperar
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_repasse_fechar(uuid, uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_repasse_fechar(uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.fn_repasse_fechar IS
  'Fecha a comissão devida a uma profissional por uma empresa e cria a conta a pagar na carteira dessa empresa. Pega tudo que ainda não foi repassado, inclusive atendimento antigo cuja fatura só foi paga agora.';
