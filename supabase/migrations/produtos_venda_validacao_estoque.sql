-- AI dev note: Validação de estoque na venda de produto. Antes disso a venda era
-- montada em duas queries soltas no cliente (produto_vendas + itens), sem olhar saldo:
-- dava pra vender item zerado e uma falha no insert dos itens deixava venda órfã.
--
-- fn_disponibilidade_produto: quanto dá pra vender AGORA.
--   null  = ilimitado (produto que não controla estoque)
--   kit   = mínimo entre os componentes que controlam estoque (kit não tem saldo próprio)
-- fn_criar_venda_produto: cria venda + itens numa transação só, validando disponibilidade.
--
-- A baixa (fn_baixa_estoque_venda, no pagamento) continua SEM bloqueio proposital: se o
-- saldo estiver furado, o pagamento já entrou e travar a baixa perderia o registro da
-- saída. O saldo negativo fica visível no Estoque como anomalia a corrigir.

create or replace function public.fn_disponibilidade_produto(p_produto_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_produto record;
  v_disp numeric;
begin
  select controla_estoque, eh_kit, estoque_atual
    into v_produto
    from public.produtos_servicos
   where id = p_produto_id;

  if not found then
    raise exception 'Produto % não encontrado', p_produto_id;
  end if;

  if v_produto.eh_kit then
    -- kit é limitado pelo componente mais escasso; componentes sem controle não limitam
    select min(floor(c.estoque_atual / k.quantidade))
      into v_disp
      from public.produto_kit_componentes k
      join public.produtos_servicos c on c.id = k.componente_produto_id
     where k.kit_produto_id = p_produto_id
       and c.controla_estoque;

    -- kit sem composição (ou só com componentes livres) não tem o que baixar:
    -- 0 força configurar a composição antes de vender.
    return coalesce(v_disp, 0);
  end if;

  if not v_produto.controla_estoque then
    return null; -- ilimitado
  end if;

  return greatest(v_produto.estoque_atual, 0);
end $$;

comment on function public.fn_disponibilidade_produto(uuid) is
  'Quantidade vendável agora. null = ilimitado. Kit = mínimo entre componentes.';

-- p_itens: [{"produto_id": uuid, "quantidade": numeric}]
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

  select id into v_pessoa_id from public.pessoas where auth_user_id = auth.uid();

  -- valida tudo ANTES de gravar: ou a venda inteira entra, ou nada entra
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
    p_paciente_id, p_responsavel_cobranca_id, p_empresa_id,
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

comment on function public.fn_criar_venda_produto(uuid, uuid, jsonb, uuid, text, numeric) is
  'Cria venda de produto + itens em transação única, validando estoque. Preço vem do catálogo (servidor).';

revoke all on function public.fn_criar_venda_produto(uuid, uuid, jsonb, uuid, text, numeric) from public;
grant execute on function public.fn_criar_venda_produto(uuid, uuid, jsonb, uuid, text, numeric) to authenticated;
grant execute on function public.fn_disponibilidade_produto(uuid) to authenticated;
