-- AI dev note: Cancelamento e estorno de venda de produto.
-- Dois caminhos, porque as consequências são diferentes:
--   nao paga  -> so' marca cancelada (estoque nunca foi baixado)
--   paga      -> devolve as unidades ao estoque + exige devolucao Pix (feita na
--                edge function, porque envolve dinheiro saindo da conta)
--
-- O estorno de estoque NAO reusa fn_estoque_aplica_movimento por delete: apagar o
-- movimento de saida apagaria o historico. Gravamos um movimento de 'entrada' com
-- venda_id, deixando os dois lados visiveis na auditoria.

alter table public.produto_vendas
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por uuid references public.pessoas(id),
  add column if not exists motivo_cancelamento text,
  add column if not exists estorno_e2eid text,
  add column if not exists estorno_valor numeric;

-- Devolve ao estoque o que a venda baixou. Idempotente: se ja' existe entrada de
-- estorno para a venda, nao faz de novo.
create or replace function public.fn_estornar_estoque_venda(
  p_venda_id uuid,
  p_motivo text default 'Estorno de venda cancelada'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov record;
  v_qtd integer := 0;
begin
  if exists (
    select 1 from public.estoque_movimentos
     where venda_id = p_venda_id and tipo = 'entrada'
  ) then
    return 0; -- ja' estornado
  end if;

  -- espelha cada saida da venda com uma entrada de mesma magnitude
  for v_mov in
    select produto_id, quantidade
      from public.estoque_movimentos
     where venda_id = p_venda_id and tipo = 'saida_venda'
  loop
    insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, venda_id)
    values (v_mov.produto_id, 'entrada', abs(v_mov.quantidade), p_motivo, p_venda_id);
    v_qtd := v_qtd + 1;
  end loop;

  return v_qtd;
end $$;

comment on function public.fn_estornar_estoque_venda(uuid, text) is
  'Devolve ao estoque as unidades baixadas por uma venda. Idempotente.';

-- Cancela a venda no banco. A parte externa (cancelar cobranca / devolver Pix no
-- Inter) fica na edge function; aqui so' o estado interno.
create or replace function public.fn_cancelar_venda_produto(
  p_venda_id uuid,
  p_motivo text default null,
  p_estorno_e2eid text default null,
  p_estorno_valor numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.produto_vendas;
  v_pessoa_id uuid;
  v_estornados integer := 0;
begin
  select id into v_pessoa_id from public.pessoas where auth_user_id = auth.uid();

  select * into v_venda from public.produto_vendas where id = p_venda_id for update;
  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  if v_venda.status = 'cancelado' then
    return jsonb_build_object('ok', true, 'ja_cancelada', true, 'venda_id', p_venda_id);
  end if;

  -- venda paga: as unidades ja' sairam, precisam voltar
  if v_venda.status = 'pago' then
    v_estornados := public.fn_estornar_estoque_venda(
      p_venda_id, coalesce(p_motivo, 'Estorno de venda cancelada')
    );
  end if;

  update public.produto_vendas
     set status = 'cancelado',
         cancelado_em = now(),
         cancelado_por = v_pessoa_id,
         motivo_cancelamento = p_motivo,
         estorno_e2eid = coalesce(p_estorno_e2eid, estorno_e2eid),
         estorno_valor = coalesce(p_estorno_valor, estorno_valor)
   where id = p_venda_id;

  return jsonb_build_object(
    'ok', true,
    'ja_cancelada', false,
    'venda_id', p_venda_id,
    'era_paga', v_venda.status = 'pago',
    'produtos_estornados', v_estornados
  );
end $$;

revoke all on function public.fn_cancelar_venda_produto(uuid, text, text, numeric) from public;
grant execute on function public.fn_cancelar_venda_produto(uuid, text, text, numeric) to service_role;
revoke all on function public.fn_estornar_estoque_venda(uuid, text) from public;
grant execute on function public.fn_estornar_estoque_venda(uuid, text) to service_role;
