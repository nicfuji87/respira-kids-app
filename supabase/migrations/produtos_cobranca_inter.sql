-- AI dev note: Cobrança Pix da loja pelo Banco Inter, SEM nota fiscal.
-- Decisão do dono (02/08/2026): venda de produto NÃO cria registro em `faturas` —
-- aquela tabela é toda Asaas+NFS-e e é justamente por cair lá que a venda ficava
-- elegível a nota de serviço por engano. A cobrança mora na própria venda.
--
-- A API Pix (padrão Bacen) não devolve link de pagamento como o Asaas: devolve o
-- copia-e-cola. O `cobranca_token` existe para a página pública own-hosted
-- (#/pagamento-produto/:token), que é o que vai no WhatsApp.

alter table public.produto_vendas
  add column if not exists inter_txid text,
  add column if not exists pix_copia_cola text,
  add column if not exists pix_expira_em timestamptz,
  add column if not exists cobranca_token text,
  add column if not exists pago_valor numeric,
  add column if not exists pago_e2eid text;

create unique index if not exists produto_vendas_inter_txid_key
  on public.produto_vendas (inter_txid) where inter_txid is not null;

create unique index if not exists produto_vendas_cobranca_token_key
  on public.produto_vendas (cobranca_token) where cobranca_token is not null;

comment on column public.produto_vendas.inter_txid is
  'txid da cobranca Pix imediata no Banco Inter';
comment on column public.produto_vendas.cobranca_token is
  'token opaco da pagina publica de pagamento (#/pagamento-produto/:token)';
comment on column public.produto_vendas.pago_e2eid is
  'EndToEndId do Pix recebido — rastreabilidade e idempotencia do webhook';

-- ============================================================
-- Webhook de Pix recebido -> marca venda paga -> trigger baixa estoque
-- ============================================================
-- Idempotente por construcao: se a venda ja esta paga, nao faz nada e devolve o
-- estado atual. O Inter reenvia o callback ate 4x (20/30/60/120 min) se o servidor
-- responder erro, entao receber o mesmo evento duas vezes e' o caso normal.
create or replace function public.fn_registrar_pix_recebido(
  p_txid text,
  p_e2eid text default null,
  p_valor numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.produto_vendas;
begin
  if p_txid is null or length(trim(p_txid)) = 0 then
    raise exception 'txid e obrigatorio';
  end if;

  select * into v_venda
    from public.produto_vendas
   where inter_txid = p_txid;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'venda_nao_encontrada', 'txid', p_txid);
  end if;

  if v_venda.status = 'pago' then
    return jsonb_build_object('ok', true, 'ja_processado', true, 'venda_id', v_venda.id);
  end if;

  -- setar status='pago' dispara fn_baixa_estoque_venda (baixa idempotente, expande kits)
  update public.produto_vendas
     set status = 'pago',
         pago_em = coalesce(pago_em, now()),
         pago_valor = coalesce(p_valor, pago_valor),
         pago_e2eid = coalesce(p_e2eid, pago_e2eid)
   where id = v_venda.id;

  return jsonb_build_object('ok', true, 'ja_processado', false, 'venda_id', v_venda.id);
end $$;

revoke all on function public.fn_registrar_pix_recebido(text, text, numeric) from public;
grant execute on function public.fn_registrar_pix_recebido(text, text, numeric) to service_role;

-- ============================================================
-- RPC publica da pagina de pagamento (sem login, so pelo token)
-- ============================================================
-- Devolve o minimo para o cliente pagar e se reconhecer na compra. NAO expõe
-- ids internos, telefone, documento nem dados do paciente alem do primeiro nome.
create or replace function public.fn_public_venda_produto_por_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.produto_vendas;
  v_itens jsonb;
  v_paciente text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_venda
    from public.produto_vendas
   where cobranca_token = p_token
     and ativo;

  if not found then
    return null;
  end if;

  select split_part(nome, ' ', 1) into v_paciente
    from public.pessoas where id = v_venda.paciente_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', p.nome,
           'quantidade', i.quantidade,
           'preco_unitario', i.preco_unitario
         ) order by p.nome), '[]'::jsonb)
    into v_itens
    from public.produto_venda_itens i
    join public.produtos_servicos p on p.id = i.produto_id
   where i.venda_id = v_venda.id;

  return jsonb_build_object(
    'status', v_venda.status,
    'valor_total', v_venda.valor_total,
    'desconto', v_venda.desconto,
    'paciente_primeiro_nome', v_paciente,
    'pix_copia_cola', case when v_venda.status = 'pago' then null else v_venda.pix_copia_cola end,
    'pix_expira_em', v_venda.pix_expira_em,
    'pago_em', v_venda.pago_em,
    'itens', v_itens
  );
end $$;

revoke all on function public.fn_public_venda_produto_por_token(text) from public;
grant execute on function public.fn_public_venda_produto_por_token(text) to anon, authenticated;
