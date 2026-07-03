-- AI dev note: Contratos (Termo de Compromisso de Estágio) dos candidatos aprovados.
-- Espelha o essencial de user_contracts, mas referencia a candidatura (candidatos
-- não estão em `pessoas`). O signatário na Assinafy é o próprio estagiário
-- (nome/email/telefone/cpf vêm da candidatura). Fluxo: front preenche o template
-- (conteudo_final) → send-estagio-contract-webhook gera PDF + enfileira
-- 'contrato_estagio_gerado' → n8n → Assinafy → grava assinatura.

create table if not exists public.estagio_contratos (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references public.candidaturas_estagio(id) on delete cascade,
  nome_contrato text,
  status_contrato text not null default 'rascunho'
    check (status_contrato in ('rascunho', 'gerado', 'assinado')),
  conteudo_final text,
  variaveis_utilizadas jsonb not null default '{}'::jsonb,
  arquivo_url text,
  link_contrato text,
  data_geracao timestamptz,
  data_assinatura timestamptz,
  criado_por uuid references public.pessoas(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estagio_contratos_candidatura
  on public.estagio_contratos (candidatura_id);

-- updated_at automático (reusa a função padrão do projeto)
drop trigger if exists update_estagio_contratos_updated_at on public.estagio_contratos;
create trigger update_estagio_contratos_updated_at
  before update on public.estagio_contratos
  for each row execute function public.update_updated_at_column();

alter table public.estagio_contratos enable row level security;

-- Mesmo padrão de acesso do módulo: admin + secretaria (staff) e service_role.
create policy estagio_contratos_service_role
  on public.estagio_contratos for all
  to service_role using (true) with check (true);

create policy estagio_contratos_staff_select
  on public.estagio_contratos for select to authenticated
  using (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_contratos_staff_insert
  on public.estagio_contratos for insert to authenticated
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_contratos_staff_update
  on public.estagio_contratos for update to authenticated
  using (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ))
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));
