-- Medidas da evolução motora: versão enxuta, liberada para toda a equipe.
-- O piloto por profissional saiu: admin e profissional usam; secretaria e
-- anon continuam sem acesso (as funções de leitura e escrita checam isto).
-- Aplicar DEPOIS do deploy do front sem o piloto (o front antigo mostraria a
-- versão longa para todas).

create or replace function public.fn_motora_medidas_liberado()
returns boolean
language sql stable security definer set search_path = public
as $$
  select fn_rls_admin() or fn_rls_profissional();
$$;

drop function if exists public.fn_motora_definir_piloto(uuid, boolean);
drop table if exists public.motora_medida_piloto;
