-- Rascunho da evolução no servidor ("Salvar e continuar depois").
--
-- Gravar em relatorio_evolucao finaliza a consulta, enfileira o histórico por
-- IA e dispara webhooks, então uma evolução incompleta não pode ir para lá.
-- O rascunho fica aqui, um por agendamento, e abre em qualquer aparelho.
-- "Finalizar" grava a evolução de verdade e apaga o rascunho.
--
-- Acesso só pelas funções abaixo, com a mesma regra de quem grava evolução:
-- admin, ou a profissional do próprio agendamento.

create table if not exists public.evolucao_rascunhos (
  agendamento_id uuid primary key references public.agendamentos(id) on delete cascade,
  tipo_evolucao text not null check (tipo_evolucao in ('respiratoria', 'motora_assimetria')),
  dados jsonb not null,
  atualizado_por uuid references public.pessoas(id),
  atualizado_em timestamptz not null default now()
);

alter table public.evolucao_rascunhos enable row level security;
revoke all on public.evolucao_rascunhos from anon, authenticated;

create or replace function public.fn_evolucao_rascunho_pode(p_agendamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(fn_rls_admin(), false)
    or (
      coalesce(fn_rls_profissional(), false)
      and exists (
        select 1 from agendamentos a
        where a.id = p_agendamento_id
          and a.profissional_id = get_current_pessoa_id()
      )
    );
$$;

create or replace function public.fn_evolucao_rascunho_salvar(
  p_agendamento_id uuid,
  p_tipo_evolucao text,
  p_dados jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_em timestamptz := now();
begin
  if not fn_evolucao_rascunho_pode(p_agendamento_id) then
    raise exception 'Sem permissão para salvar rascunho desta consulta';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Rascunho inválido';
  end if;
  if octet_length(p_dados::text) > 500000 then
    raise exception 'Rascunho grande demais';
  end if;

  insert into evolucao_rascunhos (agendamento_id, tipo_evolucao, dados, atualizado_por, atualizado_em)
  values (p_agendamento_id, p_tipo_evolucao, p_dados, get_current_pessoa_id(), v_em)
  on conflict (agendamento_id) do update
    set tipo_evolucao = excluded.tipo_evolucao,
        dados = excluded.dados,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = excluded.atualizado_em;
  return v_em;
end;
$$;

create or replace function public.fn_evolucao_rascunho_obter(p_agendamento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not fn_evolucao_rascunho_pode(p_agendamento_id) then
    return null;
  end if;
  select jsonb_build_object(
      'tipo_evolucao', r.tipo_evolucao,
      'dados', r.dados,
      'atualizado_em', r.atualizado_em,
      'atualizado_por_nome', p.nome
    )
    into v
  from evolucao_rascunhos r
  left join pessoas p on p.id = r.atualizado_por
  where r.agendamento_id = p_agendamento_id;
  return v;
end;
$$;

create or replace function public.fn_evolucao_rascunho_apagar(p_agendamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_evolucao_rascunho_pode(p_agendamento_id) then
    raise exception 'Sem permissão para apagar rascunho desta consulta';
  end if;
  delete from evolucao_rascunhos where agendamento_id = p_agendamento_id;
end;
$$;

revoke all on function public.fn_evolucao_rascunho_pode(uuid) from public, anon;
revoke all on function public.fn_evolucao_rascunho_salvar(uuid, text, jsonb) from public, anon;
revoke all on function public.fn_evolucao_rascunho_obter(uuid) from public, anon;
revoke all on function public.fn_evolucao_rascunho_apagar(uuid) from public, anon;
-- fn_evolucao_rascunho_pode é só interna (as outras rodam como dono)
grant execute on function public.fn_evolucao_rascunho_salvar(uuid, text, jsonb) to authenticated;
grant execute on function public.fn_evolucao_rascunho_obter(uuid) to authenticated;
grant execute on function public.fn_evolucao_rascunho_apagar(uuid) to authenticated;
