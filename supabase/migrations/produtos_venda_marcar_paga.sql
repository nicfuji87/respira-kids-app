-- AI dev note: RPC para o n8n marcar a venda de produto como paga após confirmar o
-- pagamento no ASAAS. Setar status='pago' dispara o trigger fn_baixa_estoque_venda,
-- que baixa o estoque (expandindo kits) de forma idempotente. Opcionalmente vincula a
-- fatura ASAAS criada pelo n8n. SECURITY DEFINER + acesso só a service_role (n8n).

create or replace function public.marcar_venda_produto_paga(
  p_venda_id uuid,
  p_fatura_id uuid default null
)
returns public.produto_vendas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.produto_vendas;
begin
  update public.produto_vendas
    set status = 'pago',
        fatura_id = coalesce(p_fatura_id, fatura_id),
        pago_em = coalesce(pago_em, now())
    where id = p_venda_id
    returning * into v_row;

  if not found then
    raise exception 'Venda de produto % não encontrada', p_venda_id;
  end if;

  return v_row;
end $$;

-- Somente o n8n (service_role) pode marcar como paga.
revoke all on function public.marcar_venda_produto_paga(uuid, uuid) from public;
grant execute on function public.marcar_venda_produto_paga(uuid, uuid) to service_role;
