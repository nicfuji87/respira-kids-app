-- AI dev note: Auditoria de dinheiro SAINDO da conta do Inter pelo app.
--
-- Regra da casa: toda tentativa de pagamento grava linha ANTES de chamar o banco
-- (status 'enviando') e atualiza depois. Se a edge function morrer no meio, sobra
-- o rastro de que algo foi tentado — o pior cenario e' um pagamento no banco sem
-- registro nenhum aqui.
--
-- Ninguem escreve nesta tabela pelo cliente: so' service_role (a edge function).
-- Admin le. Secretaria nao ve pagamento nenhum.

create table if not exists public.inter_pagamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('boleto', 'darf', 'pix')),
  valor numeric not null check (valor > 0),
  descricao text,

  -- destino (o que faz sentido varia por tipo)
  codigo_barras text,
  chave_pix text,
  favorecido text,

  status text not null default 'enviando'
    check (status in ('enviando', 'sucesso', 'erro')),
  resposta jsonb,
  erro text,

  -- quem mandou: sempre uma pessoa, nunca "o sistema"
  solicitado_por uuid not null references public.pessoas(id),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists inter_pagamentos_criado_em_idx
  on public.inter_pagamentos (criado_em desc);

comment on table public.inter_pagamentos is
  'Auditoria de pagamentos/transferencias feitos pela conta do Inter via app.';

alter table public.inter_pagamentos enable row level security;

drop policy if exists inter_pagamentos_admin_le on public.inter_pagamentos;
create policy inter_pagamentos_admin_le on public.inter_pagamentos
  for select to authenticated using (is_admin());

drop policy if exists inter_pagamentos_service on public.inter_pagamentos;
create policy inter_pagamentos_service on public.inter_pagamentos
  for all to service_role using (true) with check (true);

-- Quanto ja' saiu hoje, para a edge function conferir o teto diario.
-- Conta 'enviando' junto com 'sucesso' de proposito: uma operacao em voo
-- (ou que travou) precisa ocupar espaco no teto ate' ser resolvida.
create or replace function public.fn_inter_total_pago_hoje()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(valor), 0)
    from public.inter_pagamentos
   where status in ('enviando', 'sucesso')
     and criado_em >= date_trunc('day', now());
$$;

revoke all on function public.fn_inter_total_pago_hoje() from public;
grant execute on function public.fn_inter_total_pago_hoje() to service_role;
