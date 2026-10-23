-- Evolução motora 1.3: plano terapêutico (objetivos longitudinais), histórico
-- de alterações (objetivos e evoluções) e o histórico do paciente usado na
-- evolução e nos gráficos.
--
-- Acesso: admin e profissional (fn_motora_medidas_liberado). Secretaria e anon
-- não leem nem gravam. Escrita só pelas funções SECURITY DEFINER.

-- ---------------------------------------------------------------- objetivos

create table if not exists public.motora_objetivos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pessoas(id) on delete cascade,
  descricao text not null check (length(trim(descricao)) > 0),
  -- torcicolo / assimetria_craniana / desenvolvimento_motor (uma ou mais)
  areas text[] not null default '{}',
  -- o que acompanha o objetivo (ver src/lib/motora-catalogo.ts):
  -- {tipo:'habilidade', habilidade, metrica?, lado?} | {tipo:'medida', medida}
  -- null = objetivo funcional descrito só em texto
  indicador jsonb,
  valor_inicial numeric,
  meta numeric,
  meta_texto text,
  status text not null default 'ativo'
    check (status in ('ativo', 'atingido', 'suspenso', 'encerrado')),
  motivo_status text,
  origem text not null default 'evolucao'
    check (origem in ('evolucao', 'avaliacao', 'plano')),
  origem_id uuid,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.pessoas(id),
  atualizado_em timestamptz not null default now(),
  encerrado_em date
);

create index if not exists motora_objetivos_paciente_idx
  on public.motora_objetivos (paciente_id, status);

create table if not exists public.motora_objetivos_historico (
  id bigserial primary key,
  objetivo_id uuid not null references public.motora_objetivos(id) on delete cascade,
  acao text not null,            -- criado | editado | status
  dados jsonb not null,          -- como o objetivo ficou
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);

create index if not exists motora_objetivos_historico_obj_idx
  on public.motora_objetivos_historico (objetivo_id, alterado_em);

create or replace function public.fn_motora_objetivos_historico_trg()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - 'atualizado_em' = to_jsonb(old) - 'atualizado_em' then
    return new;
  end if;
  insert into motora_objetivos_historico (objetivo_id, acao, dados, alterado_por)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'criado'
         when new.status is distinct from old.status then 'status'
         else 'editado' end,
    to_jsonb(new),
    coalesce(get_current_pessoa_id(), new.atualizado_por)
  );
  return new;
end;
$$;

drop trigger if exists motora_objetivos_historico_trg on public.motora_objetivos;
create trigger motora_objetivos_historico_trg
  after insert or update on public.motora_objetivos
  for each row execute function public.fn_motora_objetivos_historico_trg();

alter table public.motora_objetivos enable row level security;
alter table public.motora_objetivos_historico enable row level security;

drop policy if exists motora_objetivos_leitura on public.motora_objetivos;
create policy motora_objetivos_leitura on public.motora_objetivos
  for select to authenticated
  using ((select fn_rls_admin()) or (select fn_rls_profissional()));

drop policy if exists motora_objetivos_historico_leitura on public.motora_objetivos_historico;
create policy motora_objetivos_historico_leitura on public.motora_objetivos_historico
  for select to authenticated
  using ((select fn_rls_admin()) or (select fn_rls_profissional()));

revoke all on table public.motora_objetivos, public.motora_objetivos_historico from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.motora_objetivos, public.motora_objetivos_historico from authenticated;
grant select on table public.motora_objetivos, public.motora_objetivos_historico to authenticated;
revoke all on sequence public.motora_objetivos_historico_id_seq from anon, authenticated;

-- Cria (com o id dado pelo app) ou edita um objetivo. Campos ausentes no
-- JSON ficam como estão; status muda por fn_motora_objetivo_status.
create or replace function public.fn_motora_objetivo_salvar(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_pessoa uuid := get_current_pessoa_id();
  v_id uuid := coalesce((p->>'id')::uuid, gen_random_uuid());
  v_desc text := nullif(trim(p->>'descricao'), '');
begin
  if not fn_motora_medidas_liberado() then
    raise exception 'sem permissão para o plano terapêutico';
  end if;

  if not exists (select 1 from motora_objetivos where id = v_id) then
    if v_desc is null then raise exception 'informe a descrição do objetivo'; end if;
    if (p->>'paciente_id') is null then raise exception 'informe o paciente'; end if;
    insert into motora_objetivos (
      id, paciente_id, descricao, areas, indicador, valor_inicial, meta,
      meta_texto, origem, origem_id, criado_por, atualizado_por)
    values (
      v_id, (p->>'paciente_id')::uuid, v_desc,
      coalesce(array(select jsonb_array_elements_text(p->'areas')), '{}'),
      case when jsonb_typeof(p->'indicador') = 'object' then p->'indicador' end,
      (p->>'valor_inicial')::numeric, (p->>'meta')::numeric,
      nullif(trim(p->>'meta_texto'), ''),
      coalesce(p->>'origem', 'evolucao'), (p->>'origem_id')::uuid,
      v_pessoa, v_pessoa);
  else
    update motora_objetivos o set
      descricao = coalesce(v_desc, o.descricao),
      areas = case when p ? 'areas'
                   then array(select jsonb_array_elements_text(p->'areas')) else o.areas end,
      indicador = case when p ? 'indicador'
                       then (case when jsonb_typeof(p->'indicador') = 'object' then p->'indicador' end)
                       else o.indicador end,
      valor_inicial = case when p ? 'valor_inicial' then (p->>'valor_inicial')::numeric else o.valor_inicial end,
      meta = case when p ? 'meta' then (p->>'meta')::numeric else o.meta end,
      meta_texto = case when p ? 'meta_texto' then nullif(trim(p->>'meta_texto'), '') else o.meta_texto end,
      atualizado_por = v_pessoa,
      atualizado_em = now()
    where o.id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.fn_motora_objetivo_status(
  p_id uuid, p_status text, p_motivo text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not fn_motora_medidas_liberado() then
    raise exception 'sem permissão para o plano terapêutico';
  end if;
  if p_status not in ('ativo', 'atingido', 'suspenso', 'encerrado') then
    raise exception 'situação desconhecida: %', p_status;
  end if;
  update motora_objetivos set
    status = p_status,
    motivo_status = nullif(trim(p_motivo), ''),
    encerrado_em = case when p_status = 'ativo' then null else current_date end,
    atualizado_por = get_current_pessoa_id(),
    atualizado_em = now()
  where id = p_id;
  if not found then raise exception 'objetivo não encontrado'; end if;
end;
$$;

-- ------------------------------------------- histórico das evoluções

create table if not exists public.relatorio_evolucao_historico (
  id bigserial primary key,
  relatorio_id uuid not null references public.relatorio_evolucao(id) on delete cascade,
  -- como o registro estava ANTES desta alteração
  conteudo text,
  evolucao_respiratoria jsonb,
  evolucao_motora_assimetria jsonb,
  atualizado_por_antes uuid,
  atualizado_em_antes timestamptz,
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);

create index if not exists relatorio_evolucao_historico_rel_idx
  on public.relatorio_evolucao_historico (relatorio_id, alterado_em);

create or replace function public.fn_relatorio_evolucao_historico_trg()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.conteudo is not distinct from new.conteudo
     and old.evolucao_respiratoria is not distinct from new.evolucao_respiratoria
     and old.evolucao_motora_assimetria is not distinct from new.evolucao_motora_assimetria then
    return new;
  end if;
  insert into relatorio_evolucao_historico (
    relatorio_id, conteudo, evolucao_respiratoria, evolucao_motora_assimetria,
    atualizado_por_antes, atualizado_em_antes, alterado_por)
  values (
    old.id, old.conteudo, old.evolucao_respiratoria, old.evolucao_motora_assimetria,
    old.atualizado_por, old.updated_at,
    coalesce(get_current_pessoa_id(), new.atualizado_por));
  return new;
end;
$$;

drop trigger if exists relatorio_evolucao_historico_trg on public.relatorio_evolucao;
create trigger relatorio_evolucao_historico_trg
  after update on public.relatorio_evolucao
  for each row execute function public.fn_relatorio_evolucao_historico_trg();

alter table public.relatorio_evolucao_historico enable row level security;
drop policy if exists relatorio_evolucao_historico_leitura on public.relatorio_evolucao_historico;
create policy relatorio_evolucao_historico_leitura on public.relatorio_evolucao_historico
  for select to authenticated
  using ((select fn_rls_admin()) or (select fn_rls_profissional()));
revoke all on table public.relatorio_evolucao_historico from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.relatorio_evolucao_historico from authenticated;
grant select on table public.relatorio_evolucao_historico to authenticated;
revoke all on sequence public.relatorio_evolucao_historico_id_seq from anon, authenticated;

-- ------------------------------------------- medidas: série completa

-- Todas as medidas da criança (evolução + avaliação), não só a última.
-- fn_motora_ultimas_medidas_interno passa a ler daqui.
create or replace function public.fn_motora_medidas_todas_interno(
  p_paciente_id uuid, p_ate date, p_excluir_agendamento uuid
) returns table(tipo text, data date, valores jsonb, fonte text)
language sql stable security definer set search_path = public
as $$
  with evo as (
    select (a.data_hora at time zone 'UTC')::date as data,
           re.evolucao_motora_assimetria as j
    from relatorio_evolucao re
    join agendamentos a on a.id = re.id_agendamento
    where a.paciente_id = p_paciente_id
      and re.tipo_evolucao = 'motora_assimetria'
      and re.evolucao_motora_assimetria is not null
      and (p_excluir_agendamento is null or a.id <> p_excluir_agendamento)
      and (a.data_hora at time zone 'UTC')::date <= p_ate
  ), aval as (
    select ac.data_avaliacao as data, ac.*
    from avaliacoes_clinicas ac
    where ac.pessoa_id = p_paciente_id and ac.data_avaliacao <= p_ate
  ), med as (
    select evo.data, m.key as tipo, m.value->'valores' as valores
    from evo, jsonb_each(coalesce(evo.j->'medicoes', '{}'::jsonb)) m
    where m.value->>'situacao' = 'medido' and jsonb_typeof(m.value->'valores') = 'object'
  )
  select 'craniometria', data, j->'craniometria', 'evolucao'
    from evo
   where (jsonb_typeof(j->'craniometria'->'diagonal_a_mm') = 'number' and jsonb_typeof(j->'craniometria'->'diagonal_b_mm') = 'number')
      or (jsonb_typeof(j->'craniometria'->'comprimento_ap_mm') = 'number' and jsonb_typeof(j->'craniometria'->'largura_ml_mm') = 'number')
  union all
  select 'craniometria', data, medidas_craniometricas, 'avaliacao'
    from aval
   where (jsonb_typeof(medidas_craniometricas->'diagonal_a_mm') = 'number' and jsonb_typeof(medidas_craniometricas->'diagonal_b_mm') = 'number')
      or (jsonb_typeof(medidas_craniometricas->'comprimento_ap_mm') = 'number' and jsonb_typeof(medidas_craniometricas->'largura_ml_mm') = 'number')
  union all
  select 'goniometria', data, j->'goniometria', 'evolucao'
    from evo
   where exists (select 1 from jsonb_each(coalesce(j->'goniometria', '{}'::jsonb)) e
                 where e.key ~ '^(rotacao|inclinacao)_(ativa|passiva)_(direita|esquerda)$'
                   and jsonb_typeof(e.value) = 'number')
  union all
  select 'goniometria', data,
         jsonb_strip_nulls(jsonb_build_object(
           'rotacao_ativa_direita', goniometria->'rotacao'->'ativa_direita',
           'rotacao_ativa_esquerda', goniometria->'rotacao'->'ativa_esquerda',
           'rotacao_passiva_direita', goniometria->'rotacao'->'passiva_direita',
           'rotacao_passiva_esquerda', goniometria->'rotacao'->'passiva_esquerda',
           'inclinacao_ativa_direita', goniometria->'inclinacao'->'ativa_direita',
           'inclinacao_ativa_esquerda', goniometria->'inclinacao'->'ativa_esquerda',
           'inclinacao_passiva_direita', goniometria->'inclinacao'->'passiva_direita',
           'inclinacao_passiva_esquerda', goniometria->'inclinacao'->'passiva_esquerda')),
         'avaliacao'
    from aval
   where exists (select 1 from jsonb_each(coalesce(goniometria->'rotacao', '{}'::jsonb) || coalesce(goniometria->'inclinacao', '{}'::jsonb)) e
                 where jsonb_typeof(e.value) = 'number')
  union all
  select 'perimetro_cefalico', data, jsonb_build_object('perimetro_cefalico_cm', j->'craniometria'->'perimetro_cefalico_cm'), 'evolucao'
    from evo where jsonb_typeof(j->'craniometria'->'perimetro_cefalico_cm') = 'number'
  union all
  select 'perimetro_cefalico', data, jsonb_build_object('perimetro_cefalico_cm', medidas_craniometricas->'perimetro_cefalico_cm'), 'avaliacao'
    from aval where jsonb_typeof(medidas_craniometricas->'perimetro_cefalico_cm') = 'number'
  union all
  select 'mfs', data, jsonb_build_object('mfs_direito', mfs_direito, 'mfs_esquerdo', mfs_esquerdo), 'avaliacao'
    from aval where mfs_direito is not null or mfs_esquerdo is not null
  union all
  select 'desenvolvimento_motor', data,
         jsonb_strip_nulls(jsonb_build_object('percentil', coalesce(aims_detalhada->'percentil', aims->'percentil'))),
         'avaliacao'
    from aval
   where coalesce(aims_detalhada->>'percentil', aims->>'percentil') is not null
      or exists (select 1 from jsonb_each(coalesce(marcos_motores_atingidos, '{}'::jsonb)) m
                 where m.value = 'true'::jsonb)
  union all
  select 'mfs', data, valores, 'evolucao' from med
   where tipo = 'mfs'
     and jsonb_typeof(valores->'mfs_direito') = 'number'
     and jsonb_typeof(valores->'mfs_esquerdo') = 'number'
  union all
  select 'perimetro_cefalico', data, valores, 'evolucao' from med
   where tipo = 'perimetro_cefalico' and jsonb_typeof(valores->'perimetro_cefalico_cm') = 'number'
  union all
  select 'desenvolvimento_motor', data, valores, 'evolucao' from med
   where tipo = 'desenvolvimento_motor' and coalesce(valores->>'instrumento', '') <> ''
     and (valores->>'instrumento' <> 'aims' or jsonb_typeof(valores->'percentil') = 'number')
     and (valores->>'instrumento' <> 'outro' or coalesce(valores->>'instrumento_outro', '') <> '')
  union all
  select 'outra', data, valores, 'evolucao' from med
   where tipo = 'outra' and coalesce(valores->>'descricao', '') <> '';
$$;

create or replace function public.fn_motora_ultimas_medidas_interno(
  p_paciente_id uuid, p_ate date, p_excluir_agendamento uuid
) returns table(tipo text, data date, valores jsonb, fonte text)
language sql stable security definer set search_path = public
as $$
  with todas as (
    select * from fn_motora_medidas_todas_interno(p_paciente_id, p_ate, p_excluir_agendamento)
    union all
    select mp.tipo, mp.ultima_realizada, null::jsonb, 'marcada'
      from motora_medida_programacao mp
     where mp.paciente_id = p_paciente_id and mp.ultima_realizada is not null
       and mp.ultima_realizada <= p_ate
  )
  select distinct on (tipo) tipo, data, valores, fonte
  from todas
  order by tipo, data desc, (valores is null);
$$;

revoke all on function public.fn_motora_medidas_todas_interno(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.fn_motora_ultimas_medidas_interno(uuid, date, uuid) from public, anon, authenticated;

-- ------------------------------------------- histórico do paciente

-- Tudo o que a evolução e os gráficos precisam numa chamada:
-- evoluções motoras (habilidades, objetivos da sessão), série de medidas,
-- nascimento e idade gestacional (a mais recente registrada em avaliação).
create or replace function public.fn_motora_historico(p_paciente_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r jsonb;
begin
  if not fn_motora_medidas_liberado() then
    raise exception 'sem permissão para o histórico motor';
  end if;
  select jsonb_build_object(
    'data_nascimento', (select data_nascimento from pessoas where id = p_paciente_id),
    'idade_gestacional_semanas', (
      select ac.idade_gestacional_semanas from avaliacoes_clinicas ac
       where ac.pessoa_id = p_paciente_id and ac.idade_gestacional_semanas is not null
       order by ac.data_avaliacao desc limit 1),
    'evolucoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'agendamento_id', a.id,
               'data', (a.data_hora at time zone 'UTC')::date,
               'profissional', p.nome,
               'versao', re.evolucao_motora_assimetria->>'versao_formulario',
               'areas', re.evolucao_motora_assimetria->'areas',
               'habilidades', re.evolucao_motora_assimetria->'habilidades',
               'objetivos_sessao', re.evolucao_motora_assimetria->'objetivos_sessao')
             order by a.data_hora)
        from relatorio_evolucao re
        join agendamentos a on a.id = re.id_agendamento
        left join pessoas p on p.id = a.profissional_id
       where a.paciente_id = p_paciente_id
         and re.tipo_evolucao = 'motora_assimetria'
         and re.evolucao_motora_assimetria is not null), '[]'::jsonb),
    'medidas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'data', m.data, 'valores', m.valores, 'fonte', m.fonte)
             order by m.data)
        from fn_motora_medidas_todas_interno(p_paciente_id, '9999-12-31'::date, null) m), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

revoke all on function public.fn_motora_objetivo_salvar(jsonb) from public, anon;
revoke all on function public.fn_motora_objetivo_status(uuid, text, text) from public, anon;
revoke all on function public.fn_motora_historico(uuid) from public, anon;
revoke all on function public.fn_motora_objetivos_historico_trg() from public, anon, authenticated;
revoke all on function public.fn_relatorio_evolucao_historico_trg() from public, anon, authenticated;
grant execute on function public.fn_motora_objetivo_salvar(jsonb) to authenticated;
grant execute on function public.fn_motora_objetivo_status(uuid, text, text) to authenticated;
grant execute on function public.fn_motora_historico(uuid) to authenticated;
