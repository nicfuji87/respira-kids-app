-- AI dev note: Restringe DEFINIR/EDITAR o geofence ao role admin. A LEITURA
-- continua admin+secretaria (o fluxo de ponto roda sob a sessão da secretaria e
-- precisa ler a cerca para aplicar o bloqueio).
drop policy if exists estagio_geofence_staff_insert on public.estagio_ponto_geofence;
drop policy if exists estagio_geofence_staff_update on public.estagio_ponto_geofence;

create policy estagio_geofence_admin_insert
  on public.estagio_ponto_geofence for insert to authenticated
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = 'admin'
      and pessoas.ativo = true
  ));

create policy estagio_geofence_admin_update
  on public.estagio_ponto_geofence for update to authenticated
  using (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = 'admin'
      and pessoas.ativo = true
  ))
  with check (exists (
    select 1 from public.pessoas
    where pessoas.auth_user_id = auth.uid()
      and pessoas.role = 'admin'
      and pessoas.ativo = true
  ));
