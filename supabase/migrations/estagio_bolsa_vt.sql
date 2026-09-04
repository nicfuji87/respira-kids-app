-- =====================================================================
-- Bolsa e vale-transporte de estágio
--
-- Valores do dono (31/08/2026): bolsa R$ 1.000/mês, VT R$ 11 por dia
-- presente (R$ 5,50 cada trecho). Fica por estagiária, não global — o
-- próximo contrato não vai ter o mesmo valor.
--
-- O VT conta dia com registro de ENTRADA no ponto. Usar entrada (e não o
-- par entrada+saída) porque esquecer de bater a saída é comum e não
-- deveria custar a passagem de quem veio trabalhar.
--
-- Estágio atende a clínica inteira, então a conta nasce na carteira
-- Clínica com natureza compartilhado — diferente da comissão, que é
-- custo individual da empresa que faturou.
-- =====================================================================

ALTER TABLE public.candidaturas_estagio
  ADD COLUMN IF NOT EXISTS valor_bolsa_mensal numeric(10,2),
  ADD COLUMN IF NOT EXISTS valor_vt_dia       numeric(10,2);

COMMENT ON COLUMN public.candidaturas_estagio.valor_bolsa_mensal IS 'Bolsa-auxílio mensal em reais.';
COMMENT ON COLUMN public.candidaturas_estagio.valor_vt_dia IS 'Vale-transporte por dia presente (ida + volta).';

UPDATE public.candidaturas_estagio
SET valor_bolsa_mensal = 1000.00, valor_vt_dia = 11.00
WHERE ativo AND status = 'aprovado'
  AND valor_bolsa_mensal IS NULL AND valor_vt_dia IS NULL;

INSERT INTO public.categorias_contabeis (codigo, nome, descricao, categoria_pai_id, nivel, ativo)
SELECT 'BOLSA_ESTAGIO', 'Bolsa de estágio', 'Bolsa-auxílio mensal de estagiária.',
       (SELECT id FROM public.categorias_contabeis WHERE codigo = 'CUSTO_FIXO'), 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.categorias_contabeis WHERE codigo = 'BOLSA_ESTAGIO');

INSERT INTO public.categorias_contabeis (codigo, nome, descricao, categoria_pai_id, nivel, ativo)
SELECT 'VT_ESTAGIO', 'Vale-transporte', 'Vale-transporte por dia presente.',
       (SELECT id FROM public.categorias_contabeis WHERE codigo = 'GASTO_VAR'), 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.categorias_contabeis WHERE codigo = 'VT_ESTAGIO');

CREATE TABLE IF NOT EXISTS public.fechamentos_estagio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id   uuid NOT NULL REFERENCES public.candidaturas_estagio(id),
  competencia      date NOT NULL,
  dias_presenca    integer NOT NULL DEFAULT 0,
  valor_bolsa      numeric(10,2) NOT NULL DEFAULT 0,
  valor_vt         numeric(10,2) NOT NULL DEFAULT 0,
  valor_total      numeric(10,2) NOT NULL DEFAULT 0,
  lancamento_id    uuid REFERENCES public.lancamentos_financeiros(id),
  criado_por       uuid REFERENCES public.pessoas(id),
  created_at       timestamptz DEFAULT now(),
  UNIQUE (candidatura_id, competencia)
);

COMMENT ON TABLE public.fechamentos_estagio IS
  'Fechamento mensal de bolsa e VT por estagiária. A chave única (candidatura, competência) é o que impede lançar o mesmo mês duas vezes.';

ALTER TABLE public.fechamentos_estagio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fechamentos_estagio_staff ON public.fechamentos_estagio;
CREATE POLICY fechamentos_estagio_staff ON public.fechamentos_estagio
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_rls_admin_secretaria_completo()));
GRANT SELECT ON public.fechamentos_estagio TO authenticated;

CREATE OR REPLACE VIEW public.vw_fechamento_estagio_mes
WITH (security_invoker = true) AS
SELECT
  c.id                              AS candidatura_id,
  c.nome                            AS estagiaria,
  d.competencia,
  d.dias_presenca,
  COALESCE(c.valor_bolsa_mensal, 0) AS valor_bolsa,
  COALESCE(c.valor_vt_dia, 0)       AS valor_vt_dia,
  round(d.dias_presenca * COALESCE(c.valor_vt_dia, 0), 2) AS valor_vt,
  round(COALESCE(c.valor_bolsa_mensal, 0)
        + d.dias_presenca * COALESCE(c.valor_vt_dia, 0), 2) AS valor_total,
  f.id IS NOT NULL                  AS ja_lancado,
  f.lancamento_id
FROM public.candidaturas_estagio c
JOIN (
  SELECT candidatura_id,
         date_trunc('month', registrado_em)::date AS competencia,
         count(DISTINCT registrado_em::date)      AS dias_presenca
  FROM public.estagio_pontos
  WHERE ativo AND tipo = 'entrada'
  GROUP BY 1, 2
) d ON d.candidatura_id = c.id
LEFT JOIN public.fechamentos_estagio f
       ON f.candidatura_id = c.id AND f.competencia = d.competencia
WHERE c.ativo AND c.status = 'aprovado';

GRANT SELECT ON public.vw_fechamento_estagio_mes TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_estagio_fechar_mes(
  p_candidatura_id uuid,
  p_competencia    date,
  p_vencimento     date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_pessoa uuid; v_r record; v_venc date;
  v_centro uuid; v_lanc uuid; v_fech uuid;
BEGIN
  SELECT id INTO v_pessoa FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND role = ANY (ARRAY['admin','secretaria'])
    AND is_approved AND ativo AND NOT bloqueado;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para fechar bolsa e VT de estágio';
  END IF;

  SELECT * INTO v_r FROM public.vw_fechamento_estagio_mes
  WHERE candidatura_id = p_candidatura_id
    AND competencia = date_trunc('month', p_competencia)::date;

  IF v_r IS NULL THEN
    RAISE EXCEPTION 'Sem ponto registrado para esta estagiária nesta competência';
  END IF;
  IF v_r.ja_lancado THEN
    RAISE EXCEPTION 'Competência % já foi lançada para %', to_char(v_r.competencia,'MM/YYYY'), v_r.estagiaria;
  END IF;
  IF v_r.valor_total <= 0 THEN
    RAISE EXCEPTION 'Cadastre a bolsa e o VT desta estagiária antes de fechar';
  END IF;

  v_venc   := COALESCE(p_vencimento, (date_trunc('month', p_competencia) + interval '1 month 4 days')::date);
  v_centro := (SELECT id FROM public.centros_financeiros WHERE tipo = 'comum' LIMIT 1);

  INSERT INTO public.lancamentos_financeiros (
    tipo_lancamento, categoria_contabil_id, descricao,
    data_emissao, data_competencia, data_vencimento,
    valor_total, quantidade_parcelas, status_lancamento, origem_lancamento,
    centro_financeiro_id, natureza_custo, pago, criado_por, atualizado_por, observacoes
  ) VALUES (
    'despesa',
    (SELECT id FROM public.categorias_contabeis WHERE codigo = 'BOLSA_ESTAGIO'),
    format('Estágio %s - %s', v_r.estagiaria, to_char(v_r.competencia, 'MM/YYYY')),
    CURRENT_DATE, v_r.competencia, v_venc,
    v_r.valor_total, 1, 'validado', 'repasse',
    v_centro, 'compartilhado', false, v_pessoa, v_pessoa,
    format('Bolsa R$ %s + VT R$ %s (%s dias presentes)',
           v_r.valor_bolsa, v_r.valor_vt, v_r.dias_presenca)
  ) RETURNING id INTO v_lanc;

  INSERT INTO public.contas_pagar (
    lancamento_id, numero_parcela, total_parcelas, valor_parcela, data_vencimento
  ) VALUES (v_lanc, 1, 1, v_r.valor_total, v_venc);

  INSERT INTO public.fechamentos_estagio (
    candidatura_id, competencia, dias_presenca, valor_bolsa, valor_vt,
    valor_total, lancamento_id, criado_por
  ) VALUES (
    p_candidatura_id, v_r.competencia, v_r.dias_presenca, v_r.valor_bolsa,
    v_r.valor_vt, v_r.valor_total, v_lanc, v_pessoa
  ) RETURNING id INTO v_fech;

  RETURN jsonb_build_object(
    'fechamento_id', v_fech, 'lancamento_id', v_lanc,
    'estagiaria', v_r.estagiaria, 'competencia', v_r.competencia,
    'dias', v_r.dias_presenca, 'bolsa', v_r.valor_bolsa,
    'vt', v_r.valor_vt, 'total', v_r.valor_total, 'vencimento', v_venc);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_estagio_fechar_mes(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_estagio_fechar_mes(uuid, date, date) TO authenticated;
