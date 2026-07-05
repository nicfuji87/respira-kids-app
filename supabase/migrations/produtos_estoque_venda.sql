-- AI dev note: Módulo Produtos — catálogo vendável + estoque + venda com cobrança ASAAS.
-- Reaproveita produtos_servicos como catálogo ÚNICO (custos + venda) via flags
-- vendavel/controla_estoque. estoque_movimentos é o razão único de estoque; a coluna
-- produtos_servicos.estoque_atual é cache mantido por trigger.
-- Venda: produto_vendas + produto_venda_itens; kits via produto_kit_componentes.
-- Cobrança = fatura ASAAS normal marcada com faturas.origem='produto' (o n8n lê essa flag
-- no webhook de pagamento recebido e transfere o valor p/ o Nubank — Nubank é DESTINO).
-- Baixa de estoque dispara a partir de produto_vendas (status -> 'pago'), NÃO da faturas
-- (tabela quente), para risco zero no fluxo de cobrança de atendimento.

-- =====================================================================
-- 1. Catálogo único: estender produtos_servicos com campos de venda/estoque
-- =====================================================================
alter table public.produtos_servicos
  add column if not exists vendavel boolean not null default false,
  add column if not exists controla_estoque boolean not null default false,
  add column if not exists eh_kit boolean not null default false,
  add column if not exists categoria_venda text,
  add column if not exists preco_venda numeric,
  add column if not exists estoque_minimo numeric not null default 0,
  add column if not exists estoque_atual numeric not null default 0,
  add column if not exists foto_url text;

-- categoria_venda restrita (permite null p/ itens de custo não-vendáveis)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.produtos_servicos'::regclass
      and conname = 'produtos_servicos_categoria_venda_check'
  ) then
    alter table public.produtos_servicos
      add constraint produtos_servicos_categoria_venda_check
      check (categoria_venda is null or categoria_venda in ('espacador', 'brinquedo', 'outro'));
  end if;
end $$;

-- codigo passa a ter default automático (era NOT NULL sem default => UI não precisa exigir)
alter table public.produtos_servicos
  alter column codigo set default ('PRD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

-- updated_at automático (produtos_servicos não tinha trigger)
drop trigger if exists update_produtos_servicos_updated_at on public.produtos_servicos;
create trigger update_produtos_servicos_updated_at
  before update on public.produtos_servicos
  for each row execute function public.update_updated_at_column();

create index if not exists idx_produtos_servicos_vendavel
  on public.produtos_servicos (vendavel) where vendavel = true;

-- =====================================================================
-- 2. Composição de kits (lista de materiais)
--    Um kit (produto vendável, eh_kit=true) consome N unidades de componentes.
--    Ex.: "Tapete sensorial (Kit)" consome 4x "Tapete sensorial (unidade)".
-- =====================================================================
create table if not exists public.produto_kit_componentes (
  id uuid primary key default gen_random_uuid(),
  kit_produto_id uuid not null references public.produtos_servicos(id) on delete cascade,
  componente_produto_id uuid not null references public.produtos_servicos(id) on delete restrict,
  quantidade numeric not null default 1 check (quantidade > 0),
  created_at timestamptz not null default now(),
  unique (kit_produto_id, componente_produto_id),
  check (kit_produto_id <> componente_produto_id)
);
create index if not exists idx_kit_componentes_kit
  on public.produto_kit_componentes (kit_produto_id);

-- =====================================================================
-- 3. Vendas de produto
-- =====================================================================
create table if not exists public.produto_vendas (
  id uuid primary key default gen_random_uuid(),
  responsavel_cobranca_id uuid not null references public.pessoas(id),
  paciente_id uuid references public.pessoas(id),
  empresa_id uuid references public.pessoa_empresas(id),
  valor_total numeric not null default 0,
  desconto numeric not null default 0,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'aguardando_pagamento', 'pago', 'cancelado')),
  fatura_id uuid references public.faturas(id),
  observacoes text,
  pago_em timestamptz,
  criado_por uuid references public.pessoas(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_produto_vendas_status on public.produto_vendas (status);
create index if not exists idx_produto_vendas_responsavel on public.produto_vendas (responsavel_cobranca_id);
create index if not exists idx_produto_vendas_fatura on public.produto_vendas (fatura_id);

drop trigger if exists update_produto_vendas_updated_at on public.produto_vendas;
create trigger update_produto_vendas_updated_at
  before update on public.produto_vendas
  for each row execute function public.update_updated_at_column();

create table if not exists public.produto_venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.produto_vendas(id) on delete cascade,
  produto_id uuid not null references public.produtos_servicos(id),
  quantidade numeric not null check (quantidade > 0),
  preco_unitario numeric not null,
  subtotal numeric generated always as (quantidade * preco_unitario) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_produto_venda_itens_venda on public.produto_venda_itens (venda_id);

-- =====================================================================
-- 4. Razão único de estoque + cache estoque_atual
-- =====================================================================
create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos_servicos(id),
  tipo text not null check (tipo in ('entrada', 'saida_venda', 'ajuste', 'perda')),
  -- delta COM sinal: +entrada/ajuste-positivo, -saida_venda/perda/ajuste-negativo
  quantidade numeric not null check (quantidade <> 0),
  custo_unitario numeric,
  motivo text,
  venda_id uuid references public.produto_vendas(id) on delete set null,
  criado_por uuid references public.pessoas(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_estoque_movimentos_produto on public.estoque_movimentos (produto_id);
create index if not exists idx_estoque_movimentos_venda on public.estoque_movimentos (venda_id);

create or replace function public.fn_estoque_aplica_movimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.produtos_servicos
      set estoque_atual = coalesce(estoque_atual, 0) + new.quantidade
      where id = new.produto_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.produtos_servicos
      set estoque_atual = coalesce(estoque_atual, 0) - old.quantidade
      where id = old.produto_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_estoque_aplica_movimento_ins on public.estoque_movimentos;
create trigger trg_estoque_aplica_movimento_ins
  after insert on public.estoque_movimentos
  for each row execute function public.fn_estoque_aplica_movimento();

drop trigger if exists trg_estoque_aplica_movimento_del on public.estoque_movimentos;
create trigger trg_estoque_aplica_movimento_del
  after delete on public.estoque_movimentos
  for each row execute function public.fn_estoque_aplica_movimento();

-- =====================================================================
-- 5. faturas.origem — discriminador p/ o n8n (produto => transfere p/ Nubank)
-- =====================================================================
alter table public.faturas
  add column if not exists origem text not null default 'atendimento';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.faturas'::regclass
      and conname = 'faturas_origem_check'
  ) then
    alter table public.faturas
      add constraint faturas_origem_check check (origem in ('atendimento', 'produto'));
  end if;
end $$;

-- =====================================================================
-- 6. Baixa de estoque ao confirmar a venda (dispara na produto_vendas, não na faturas).
--    Expande kits em componentes. Idempotente.
-- =====================================================================
create or replace function public.fn_baixa_estoque_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_comp record;
begin
  -- só age na transição PARA 'pago'
  if new.status <> 'pago' or new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'pago' then
    return new; -- já estava pago
  end if;

  -- idempotência dura: se já há saída dessa venda, não repete
  if exists (
    select 1 from public.estoque_movimentos
    where venda_id = new.id and tipo = 'saida_venda'
  ) then
    new.pago_em := coalesce(new.pago_em, now());
    return new;
  end if;

  for v_item in
    select i.produto_id, i.quantidade, p.eh_kit, p.controla_estoque
    from public.produto_venda_itens i
    join public.produtos_servicos p on p.id = i.produto_id
    where i.venda_id = new.id
  loop
    if v_item.eh_kit then
      -- consome os componentes do kit
      for v_comp in
        select componente_produto_id, quantidade
        from public.produto_kit_componentes
        where kit_produto_id = v_item.produto_id
      loop
        insert into public.estoque_movimentos
          (produto_id, tipo, quantidade, motivo, venda_id, criado_por)
        values
          (v_comp.componente_produto_id, 'saida_venda',
           -1 * v_item.quantidade * v_comp.quantidade,
           'Baixa por venda (kit)', new.id, new.criado_por);
      end loop;
    elsif v_item.controla_estoque then
      insert into public.estoque_movimentos
        (produto_id, tipo, quantidade, motivo, venda_id, criado_por)
      values
        (v_item.produto_id, 'saida_venda', -1 * v_item.quantidade,
         'Baixa por venda', new.id, new.criado_por);
    end if;
  end loop;

  new.pago_em := coalesce(new.pago_em, now());
  return new;
end $$;

drop trigger if exists trg_baixa_estoque_venda on public.produto_vendas;
create trigger trg_baixa_estoque_venda
  before update on public.produto_vendas
  for each row execute function public.fn_baixa_estoque_venda();

-- =====================================================================
-- 7. RLS — admin + secretaria (staff) e service_role (n8n)
-- =====================================================================
alter table public.produto_kit_componentes enable row level security;
alter table public.produto_vendas         enable row level security;
alter table public.produto_venda_itens    enable row level security;
alter table public.estoque_movimentos     enable row level security;

-- produto_kit_componentes
drop policy if exists produto_kit_componentes_service on public.produto_kit_componentes;
create policy produto_kit_componentes_service on public.produto_kit_componentes
  for all to service_role using (true) with check (true);
drop policy if exists produto_kit_componentes_admin on public.produto_kit_componentes;
create policy produto_kit_componentes_admin on public.produto_kit_componentes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists produto_kit_componentes_secretaria on public.produto_kit_componentes;
create policy produto_kit_componentes_secretaria on public.produto_kit_componentes
  for all to authenticated using (public.is_secretaria()) with check (public.is_secretaria());

-- produto_vendas
drop policy if exists produto_vendas_service on public.produto_vendas;
create policy produto_vendas_service on public.produto_vendas
  for all to service_role using (true) with check (true);
drop policy if exists produto_vendas_admin on public.produto_vendas;
create policy produto_vendas_admin on public.produto_vendas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists produto_vendas_secretaria on public.produto_vendas;
create policy produto_vendas_secretaria on public.produto_vendas
  for all to authenticated using (public.is_secretaria()) with check (public.is_secretaria());

-- produto_venda_itens
drop policy if exists produto_venda_itens_service on public.produto_venda_itens;
create policy produto_venda_itens_service on public.produto_venda_itens
  for all to service_role using (true) with check (true);
drop policy if exists produto_venda_itens_admin on public.produto_venda_itens;
create policy produto_venda_itens_admin on public.produto_venda_itens
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists produto_venda_itens_secretaria on public.produto_venda_itens;
create policy produto_venda_itens_secretaria on public.produto_venda_itens
  for all to authenticated using (public.is_secretaria()) with check (public.is_secretaria());

-- estoque_movimentos
drop policy if exists estoque_movimentos_service on public.estoque_movimentos;
create policy estoque_movimentos_service on public.estoque_movimentos
  for all to service_role using (true) with check (true);
drop policy if exists estoque_movimentos_admin on public.estoque_movimentos;
create policy estoque_movimentos_admin on public.estoque_movimentos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists estoque_movimentos_secretaria on public.estoque_movimentos;
create policy estoque_movimentos_secretaria on public.estoque_movimentos
  for all to authenticated using (public.is_secretaria()) with check (public.is_secretaria());
