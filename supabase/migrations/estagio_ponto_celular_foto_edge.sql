-- AI dev note: A selfie do ponto pelo celular NÃO sobe direto pelo anon.
-- Várias policies antigas de storage.objects ("to public", de outros buckets)
-- consultam public.pessoas sem SECURITY DEFINER; como o anon não lê pessoas, o
-- Postgres estoura "permission denied for table pessoas" em QUALQUER insert anônimo
-- no storage, mesmo com uma policy nossa liberando. Em vez de mexer nelas, a foto
-- passa pela edge function estagio-ponto-foto (service role), que confere aqui se o
-- token da estagiária é dono daquela batida recente.

drop policy if exists "estagio-pontos celular insert" on storage.objects;
drop function if exists public._estagio_foto_celular_pendente(text);

create or replace function public.fn_estagio_celular_foto_autorizada(
  p_token text, p_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid uuid;
begin
  v_cid := public._estagio_sessao_cid(p_token);
  if v_cid is null then
    return false;
  end if;
  return exists (
    select 1 from public.estagio_pontos
    where candidatura_id = v_cid
      and origem = 'celular'
      and foto_path = p_path
      and registrado_em > now() - interval '10 minutes'
  );
end;
$$;

revoke all on function public.fn_estagio_celular_foto_autorizada(text, text) from public, anon, authenticated;
grant execute on function public.fn_estagio_celular_foto_autorizada(text, text) to service_role;

-- Advisor: search_path fixo na função de distância.
alter function public._estagio_distancia_m(double precision, double precision, double precision, double precision) set search_path = public;
