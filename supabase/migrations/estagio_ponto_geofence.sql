-- AI dev note: Cerca virtual (geofence) do ponto do estagiário. Guarda o centro
-- (lat/lng) da clínica + raio em metros. Se `ativo`, a batida só é permitida
-- dentro do raio — o quiosque nem abre a câmera fora dele (bloqueia e aponta a
-- indisponibilidade). Config de linha única (mantém 1 registro; o front lê o ativo
-- mais recente). Gerenciada em GeofenceConfig.tsx (admin/secretaria).
create table if not exists public.estagio_ponto_geofence (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  raio_m integer not null default 200,
  ativo boolean not null default true,
  updated_by uuid references public.pessoas(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.estagio_ponto_geofence enable row level security;

create policy estagio_geofence_service_role
  on public.estagio_ponto_geofence for all
  to service_role using (true) with check (true);

create policy estagio_geofence_staff_select
  on public.estagio_ponto_geofence for select to authenticated
  using (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_geofence_staff_insert
  on public.estagio_ponto_geofence for insert to authenticated
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = any (array['admin', 'secretaria'])
      and pessoas.ativo = true
  ));

create policy estagio_geofence_staff_update
  on public.estagio_ponto_geofence for update to authenticated
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
