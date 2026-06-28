-- Alíquota de imposto UNIFORME no gross-up do cartão (maior entre as empresas)
-- ============================================================
-- Decisão do dono: o acréscimo de imposto no cartão é o MESMO em qualquer CNPJ, pra o
-- cliente não ver % diferentes em cobranças separadas (16% dos pacientes são atendidos
-- pelas 2 empresas; as taxas Asaas já são iguais entre elas). Usa a MAIOR alíquota
-- entre as empresas ativas — assim nenhuma empresa absorve imposto (a do link sempre
-- está incluída no máximo). A empresa de MENOR imposto cobra mais do que recolhe e fica
-- com um pequeno excedente (a favor da clínica).
--
-- ESCOPO: isto é só o PREÇO ao cliente (gross-up). A margem/recolhimento continua
-- usando a alíquota REAL de cada empresa (fn_aliquota_imposto_bruto) — ver
-- fn_processar_margens_fatura. NÃO unificar a margem, ou a contabilidade quebra.
create or replace function public.fn_aliquota_imposto_repasse(
  p_data date default current_date
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(soma), 0)::numeric
  from (
    select te.empresa_id, sum(te.aliquota_percent) as soma
    from public.tributos_empresa te
    join public.pessoa_empresas e on e.id = te.empresa_id and e.ativo
    where te.ativo
      and te.base = 'bruto'
      and p_data between te.vigencia_inicio and coalesce(te.vigencia_fim, '9999-12-31')
    group by te.empresa_id
  ) s;
$$;

grant execute on function public.fn_aliquota_imposto_repasse(date) to authenticated;
