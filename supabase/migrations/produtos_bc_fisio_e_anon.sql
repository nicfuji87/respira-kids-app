-- AI dev note: duas coisas pequenas e independentes.
--
-- 1. Venda de produto e' sempre da BC FISIO (a conta do Inter e' dela). O seletor
--    de empresa no carrinho so' dava chance de erro. O default fica no servidor
--    para valer inclusive se alguem chamar a RPC direto.
--    Busca por nome_fantasia em vez de UUID fixo: id gerado nao deve ser
--    hardcoded em migration. Se a empresa for renomeada, a venda nasce sem
--    empresa (recuperavel) em vez de apontar para a errada.
--
-- 2. produtos_servicos era legivel pela role anon (policy herdada), expondo
--    catalogo, preco de venda e saldo de estoque para qualquer um com a anon key.
--    Nenhuma tela publica le essa tabela: a pagina de pagamento usa
--    fn_public_venda_produto_por_token, que e' SECURITY DEFINER e ignora RLS.

create or replace function public.fn_criar_venda_produto(
  p_paciente_id uuid,
  p_responsavel_cobranca_id uuid,
  p_itens jsonb,
  p_empresa_id uuid default null,
  p_observacoes text default null,
  p_desconto numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_produto record;
  v_disp numeric;
  v_total numeric := 0;
  v_venda_id uuid;
  v_pessoa_id uuid;
  v_empresa_id uuid;
begin
  if not (public.is_admin() or public.is_secretaria()) then
    raise exception 'Sem permissão para registrar venda de produto'
      using errcode = '42501';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa de pelo menos um item';
  end if;

  if p_responsavel_cobranca_id is null then
    raise exception 'Defina o responsável de cobrança do paciente antes de vender';
  end if;

  -- produto e' sempre faturado pela BC FISIO (conta do Banco Inter)
  v_empresa_id := coalesce(
    p_empresa_id,
    (select id from public.pessoa_empresas
      where nome_fantasia = 'BC FISIO' and ativo order by created_at limit 1)
  );

  select id into v_pessoa_id from public.pessoas where auth_user_id = auth.uid();

  for v_item in
    select (i->>'produto_id')::uuid as produto_id,
           (i->>'quantidade')::numeric as quantidade
      from jsonb_array_elements(p_itens) i
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida no item';
    end if;

    select id, nome, preco_venda, ativo, vendavel
      into v_produto
      from public.produtos_servicos
     where id = v_item.produto_id;

    if not found then
      raise exception 'Produto % não encontrado', v_item.produto_id;
    end if;
    if not v_produto.ativo or not v_produto.vendavel then
      raise exception 'O produto "%" não está disponível para venda', v_produto.nome;
    end if;

    v_disp := public.fn_disponibilidade_produto(v_item.produto_id);
    if v_disp is not null and v_disp < v_item.quantidade then
      raise exception 'Estoque insuficiente de "%": disponível %, pedido %',
        v_produto.nome, v_disp, v_item.quantidade;
    end if;

    v_total := v_total + coalesce(v_produto.preco_venda, 0) * v_item.quantidade;
  end loop;

  if coalesce(p_desconto, 0) < 0 or coalesce(p_desconto, 0) > v_total then
    raise exception 'Desconto inválido para o total da venda';
  end if;

  insert into public.produto_vendas (
    paciente_id, responsavel_cobranca_id, empresa_id,
    valor_total, desconto, status, observacoes, criado_por
  ) values (
    p_paciente_id, p_responsavel_cobranca_id, v_empresa_id,
    v_total - coalesce(p_desconto, 0), coalesce(p_desconto, 0),
    'rascunho', p_observacoes, v_pessoa_id
  )
  returning id into v_venda_id;

  insert into public.produto_venda_itens (venda_id, produto_id, quantidade, preco_unitario)
  select v_venda_id,
         (i->>'produto_id')::uuid,
         (i->>'quantidade')::numeric,
         coalesce(p.preco_venda, 0)
    from jsonb_array_elements(p_itens) i
    join public.produtos_servicos p on p.id = (i->>'produto_id')::uuid;

  return v_venda_id;
end $$;

-- 2. fecha a leitura anonima do catalogo
drop policy if exists produtos_servicos_select_authenticated on public.produtos_servicos;
create policy produtos_servicos_select_authenticated on public.produtos_servicos
  for select to authenticated
  using (true);

-- 3. evento de pagamento confirmado na allow-list do webhook padrao
update public.webhooks
   set eventos = array_append(eventos, 'venda_produto_paga'),
       updated_at = now()
 where ativo and not ('venda_produto_paga' = any(eventos));
