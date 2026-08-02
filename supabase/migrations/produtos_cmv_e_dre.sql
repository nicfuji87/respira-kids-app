-- AI dev note: CMV e receita de produto no financeiro.
--
-- O KPI "Valor em estoque" usava preco_venda, o que inflava o ativo (mostrava o
-- que a mercadoria vale na prateleira do cliente, nao o que custou). Na pratica
-- deu quase 3x: R$ 4.692 a preco de venda contra R$ 1.627 a custo.
--
-- Fonte do custo, em ordem:
--   1. custo medio ponderado das ENTRADAS que informaram custo_unitario
--   2. produtos_servicos.preco_referencia (custo de compra do cadastro)
--   3. desconhecido -> NULL de proposito. Nao assumimos 0: custo zero faria a
--      margem parecer 100% e o estoque parecer de graca. Melhor a tela dizer
--      "sem custo informado" do que mentir um numero.

create or replace view public.vw_produto_custo as
with medio as (
  select produto_id,
         round(sum(custo_unitario * quantidade) / nullif(sum(quantidade), 0), 2) as custo_medio
    from public.estoque_movimentos
   where quantidade > 0
     and custo_unitario is not null
     and custo_unitario > 0
   group by produto_id
)
select
  p.id as produto_id,
  p.nome,
  p.estoque_atual,
  p.preco_venda,
  m.custo_medio,
  nullif(p.preco_referencia, 0) as custo_referencia,
  coalesce(m.custo_medio, nullif(p.preco_referencia, 0)) as custo_efetivo,
  (coalesce(m.custo_medio, nullif(p.preco_referencia, 0)) is null) as custo_desconhecido
from public.produtos_servicos p
left join medio m on m.produto_id = p.id
where p.vendavel;

comment on view public.vw_produto_custo is
  'Custo unitario por produto vendavel. custo_efetivo NULL = nunca foi informado custo.';

grant select on public.vw_produto_custo to authenticated;

-- ============================================================
-- Receita e CMV de venda de produto por mes/empresa
-- ============================================================
create or replace view public.vw_produto_vendas_mes as
select
  date_trunc('month', coalesce(v.pago_em, v.created_at))::date as mes,
  v.empresa_id,
  count(*) as vendas,
  round(sum(v.valor_total), 2) as receita_bruta,
  round(sum(coalesce(itens.cmv, 0)), 2) as cmv,
  round(sum(v.valor_total) - sum(coalesce(itens.cmv, 0)), 2) as margem,
  bool_or(coalesce(itens.tem_item_sem_custo, false)) as cmv_incompleto
from public.produto_vendas v
left join lateral (
  select
    sum(i.quantidade * c.custo_efetivo) as cmv,
    bool_or(c.custo_efetivo is null) as tem_item_sem_custo
    from public.produto_venda_itens i
    join public.vw_produto_custo c on c.produto_id = i.produto_id
   where i.venda_id = v.id
) itens on true
where v.status = 'pago' and v.ativo
group by 1, 2;

comment on view public.vw_produto_vendas_mes is
  'Receita, CMV e margem das vendas de produto pagas. cmv_incompleto = algum item sem custo.';

grant select on public.vw_produto_vendas_mes to authenticated;

-- ============================================================
-- DRE passa a enxergar a venda de produto
-- ============================================================
-- Colunas antigas mantidas com o mesmo significado (receita e despesa agora
-- somam o produto tambem, o que e' correto); receita_produto e cmv_produto
-- entram no fim para dar visibilidade sem quebrar quem le a view.
create or replace view public.vw_dre_mensal as
with receita_empresa as (
  select f.mes, c.id as centro_id, c.nome as carteira, 'empresa'::text as tipo,
         f.faturamento_servico as receita
    from vw_faturamento_empresa_mes f
    join centros_financeiros c on c.empresa_id = f.empresa_id
), receita_clinica as (
  select m.mes, c.id, c.nome, 'comum'::text as text, sum(m.margem) as receita
    from vw_caixa_clinica_resumo m
    cross join lateral (
      select centros_financeiros.id, centros_financeiros.nome
        from centros_financeiros where centros_financeiros.tipo = 'comum' limit 1
    ) c
   group by m.mes, c.id, c.nome
), receita as (
  select mes, centro_id, carteira, tipo, receita from receita_empresa
  union all
  select mes, id, nome, text, receita from receita_clinica
), produto as (
  select pv.mes, c.id as centro_id,
         sum(pv.receita_bruta) as receita_produto,
         sum(pv.cmv) as cmv_produto
    from vw_produto_vendas_mes pv
    join centros_financeiros c on c.empresa_id = pv.empresa_id
   group by pv.mes, c.id
), despesa as (
  select d.mes, d.centro_financeiro_id as centro_id, sum(d.total) as despesa
    from vw_despesas_carteira_mes d
   where d.centro_financeiro_id is not null
   group by d.mes, d.centro_financeiro_id
), meses as (
  select mes, centro_id from receita
  union select mes, centro_id from despesa
  union select mes, centro_id from produto
)
select
  m.mes,
  m.centro_id as centro_financeiro_id,
  c.nome as carteira,
  c.tipo as carteira_tipo,
  s.nome as socio,
  round(coalesce(r.receita, 0) + coalesce(p.receita_produto, 0), 2) as receita,
  round(coalesce(d.despesa, 0) + coalesce(p.cmv_produto, 0), 2) as despesa,
  round(
    (coalesce(r.receita, 0) + coalesce(p.receita_produto, 0))
    - (coalesce(d.despesa, 0) + coalesce(p.cmv_produto, 0)), 2
  ) as resultado,
  round(coalesce(p.receita_produto, 0), 2) as receita_produto,
  round(coalesce(p.cmv_produto, 0), 2) as cmv_produto
from meses m
join centros_financeiros c on c.id = m.centro_id
left join pessoas s on s.id = c.pessoa_socio_id
left join receita r on r.mes = m.mes and r.centro_id = m.centro_id
left join despesa d on d.mes = m.mes and d.centro_id = m.centro_id
left join produto p on p.mes = m.mes and p.centro_id = m.centro_id;
