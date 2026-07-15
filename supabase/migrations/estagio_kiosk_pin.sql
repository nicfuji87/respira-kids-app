-- AI dev note: Lockdown do quiosque de ponto — PIN para sair da tela cheia (impede
-- a estagiária de cair no painel admin). Hash bcrypt via pgcrypto (schema
-- extensions). A tabela NÃO é acessível por authenticated (só service_role); tudo
-- passa por RPCs SECURITY DEFINER, então o hash nunca chega ao cliente.
-- Definir/remover: apenas admin. Validar/consultar: qualquer sessão staff (a que
-- hospeda o quiosque). Front: KioskPinConfig (admin) + KioskExitDialog.
create table if not exists public.estagio_kiosk_config (
  id boolean primary key default true,
  pin_hash text not null,
  updated_by uuid references public.pessoas(id),
  updated_at timestamptz not null default now(),
  constraint estagio_kiosk_config_singleton check (id)
);

alter table public.estagio_kiosk_config enable row level security;

create policy estagio_kiosk_config_service_role
  on public.estagio_kiosk_config for all
  to service_role using (true) with check (true);

-- Define/atualiza o PIN (apenas admin).
create or replace function public.estagio_kiosk_set_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.pessoas
    where auth_user_id = auth.uid() and role = 'admin' and ativo = true
  ) then
    raise exception 'Apenas admin pode definir o PIN do quiosque';
  end if;
  if p_pin is null or length(p_pin) < 4 then
    raise exception 'PIN invalido';
  end if;
  insert into public.estagio_kiosk_config (id, pin_hash, updated_by, updated_at)
  values (
    true,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    (select id from public.pessoas where auth_user_id = auth.uid() limit 1),
    now()
  )
  on conflict (id) do update
    set pin_hash = excluded.pin_hash,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

-- Remove o PIN (desliga o lockdown) — apenas admin.
create or replace function public.estagio_kiosk_clear_pin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.pessoas
    where auth_user_id = auth.uid() and role = 'admin' and ativo = true
  ) then
    raise exception 'Apenas admin pode remover o PIN do quiosque';
  end if;
  delete from public.estagio_kiosk_config where id;
end;
$$;

-- Existe PIN configurado?
create or replace function public.estagio_kiosk_has_pin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.estagio_kiosk_config where id);
$$;

-- Valida o PIN digitado para sair do quiosque (true se sem PIN => sem lockdown).
create or replace function public.estagio_kiosk_check_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select pin_hash into v_hash from public.estagio_kiosk_config where id;
  if v_hash is null then
    return true;
  end if;
  return v_hash = extensions.crypt(p_pin, v_hash);
end;
$$;

grant execute on function public.estagio_kiosk_set_pin(text) to authenticated;
grant execute on function public.estagio_kiosk_clear_pin() to authenticated;
grant execute on function public.estagio_kiosk_has_pin() to authenticated;
grant execute on function public.estagio_kiosk_check_pin(text) to authenticated;
