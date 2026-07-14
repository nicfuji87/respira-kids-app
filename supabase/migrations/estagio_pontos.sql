-- AI dev note: Controle de ponto dos estagiários (foto-comprovante) + base do
-- vale-transporte. Cada linha é UMA batida (entrada OU saída). Serve para:
--   (a) folha de frequência entregue à instituição de ensino;
--   (b) cálculo do VT = dias de presença × valor/dia do contrato (auxilioTransporte).
-- Estagiário (Lei 11.788) NÃO tem vínculo empregatício → não se aplica a Portaria
-- 671/2021 (REP eletrônico); controle interno simples é suficiente.
-- Identidade via candidatura_id (o estagiário vive em candidaturas_estagio; não em
-- pessoas). A foto é só comprovante visual do check-in/out (sem match biométrico /
-- sem template facial → LGPD leve), guardada no bucket privado 'estagio-pontos'.

create table if not exists public.estagio_pontos (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references public.candidaturas_estagio(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  registrado_em timestamptz not null default now(),
  foto_path text,          -- caminho no bucket estagio-pontos (comprovante da batida)
  dispositivo text,        -- user agent / rótulo do tablet que registrou
  origem text not null default 'kiosk' check (origem in ('kiosk', 'manual')),
  observacao text,         -- usado em ajustes manuais (ex.: esqueceu de bater a saída)
  registrado_por uuid references public.pessoas(id), -- sessão staff do quiosque / autor do ajuste
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estagio_pontos_candidatura
  on public.estagio_pontos (candidatura_id);
create index if not exists idx_estagio_pontos_registrado_em
  on public.estagio_pontos (registrado_em);

drop trigger if exists update_estagio_pontos_updated_at on public.estagio_pontos;
create trigger update_estagio_pontos_updated_at
  before update on public.estagio_pontos
  for each row execute function public.update_updated_at_column();

alter table public.estagio_pontos enable row level security;

-- Mesmo padrão de acesso do módulo: admin + secretaria (staff) + service_role.
create policy estagio_pontos_service_role
  on public.estagio_pontos for all
  to service_role using (true) with check (true);

create policy estagio_pontos_staff_select
  on public.estagio_pontos for select to authenticated
  using (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_pontos_staff_insert
  on public.estagio_pontos for insert to authenticated
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_pontos_staff_update
  on public.estagio_pontos for update to authenticated
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

-- Bucket privado para os comprovantes (selfie do check-in/out).
insert into storage.buckets (id, name, public)
values ('estagio-pontos', 'estagio-pontos', false)
on conflict (id) do nothing;

-- Staff (admin + secretaria) faz tudo dentro do bucket. Sem WITH CHECK explícito:
-- em policy ALL o Postgres reusa a expressão USING também no INSERT (mesmo padrão
-- das policies de respira-contracts).
drop policy if exists "estagio-pontos staff all" on storage.objects;
create policy "estagio-pontos staff all"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'estagio-pontos'
    and exists (
      select 1 from public.pessoas
      where pessoas.auth_user_id = auth.uid()
        and pessoas.role = any (array['admin', 'secretaria'])
        and pessoas.ativo = true
    )
  );
