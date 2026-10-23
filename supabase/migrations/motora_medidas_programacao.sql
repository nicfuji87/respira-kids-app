-- =====================================================================
-- Programação de medidas da evolução motora (23/10/2026)
-- =====================================================================
-- Lembra a fisio ANTES da sessão que uma medida está prevista (agenda e
-- detalhe da consulta) e deixa a evolução registrar o que aconteceu:
-- medido hoje, adiado, dispensado nesta ocasião ou não aplicável.
--
-- Regras:
--  - Campo vazio na evolução NÃO quer dizer "não medido": é só "sem registro".
--  - A data alvo vem da última medida registrada + intervalo, ou de uma
--    reprogramação feita pela fisio. Reprogramação vale até a próxima medida.
--  - Janela: a medida fica "prevista" a partir de (alvo - janela) dias, para
--    a sessão anterior à data aproveitar; depois do alvo fica "atrasada".
--  - Intervalo padrão de cada medida é da CLÍNICA e começa vazio (sem
--    lembrete automático) até a equipe validar os números; a fisio pode
--    programar a próxima data por criança a qualquer momento.
--  - Última medida = a mais recente entre evoluções motoras, avaliações
--    clínicas e "feita hoje" marcado na evolução (ultima_realizada), de
--    QUALQUER profissional. Por isso o cálculo é feito aqui, em funções
--    SECURITY DEFINER que só devolvem o resumo da medida, para admin e
--    profissional. Secretaria não recebe dado clínico.
--  - Data da sessão = hora de parede: (data_hora at time zone 'UTC')::date.
-- =====================================================================

create table if not exists public.motora_medida_config (
  tipo text primary key,
  nome text not null,
  ordem int not null,
  intervalo_padrao_dias int
    check (intervalo_padrao_dias is null or intervalo_padrao_dias between 1 and 365),
  janela_antes_dias int not null default 7
    check (janela_antes_dias between 0 and 60),
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  atualizado_por uuid references public.pessoas(id)
);

insert into public.motora_medida_config (tipo, nome, ordem) values
  ('craniometria', 'Craniometria', 1),
  ('goniometria', 'Goniometria cervical', 2),
  ('mfs', 'MFS', 3),
  ('desenvolvimento_motor', 'Reavaliação do desenvolvimento motor', 4),
  ('perimetro_cefalico', 'Perímetro cefálico', 5),
  ('outra', 'Outra reavaliação', 6)
on conflict (tipo) do nothing;

create table if not exists public.motora_medida_programacao (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pessoas(id) on delete cascade,
  tipo text not null references public.motora_medida_config(tipo),
  status text not null default 'ativa'
    check (status in ('ativa', 'suspensa', 'nao_aplicavel')),
  intervalo_dias int check (intervalo_dias is null or intervalo_dias between 1 and 365),
  proxima_data date,
  programado_em date,
  ultima_realizada date,
  descricao text,
  motivo text,
  atualizado_por uuid references public.pessoas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paciente_id, tipo)
);

alter table public.motora_medida_config enable row level security;
alter table public.motora_medida_programacao enable row level security;

-- Leitura direta só para admin e profissional; escrita só pelas funções abaixo
drop policy if exists motora_medida_config_leitura on public.motora_medida_config;
create policy motora_medida_config_leitura on public.motora_medida_config
  for select using ((select public.fn_rls_admin()) or (select public.fn_rls_profissional()));

drop policy if exists motora_medida_programacao_leitura on public.motora_medida_programacao;
create policy motora_medida_programacao_leitura on public.motora_medida_programacao
  for select using ((select public.fn_rls_admin()) or (select public.fn_rls_profissional()));

-- ---------------------------------------------------------------------
-- Regra da janela (pura, testável)
-- ---------------------------------------------------------------------
create or replace function public.fn_motora_estado_medida(
  p_ultima date,
  p_intervalo int,
  p_proxima date,
  p_programado_em date,
  p_janela int,
  p_status text,
  p_data date
) returns table (estado text, alvo date, origem text)
language sql immutable
as $$
  with b as (
    select
      -- reprogramação vale enquanto não houver medida depois dela
      (p_proxima is not null and (p_ultima is null or p_programado_em is null or p_ultima <= p_programado_em)) as reprog
  ), a as (
    select
      case
        when p_status in ('suspensa', 'nao_aplicavel') then null
        when b.reprog then p_proxima
        when p_ultima is not null and p_intervalo is not null then p_ultima + p_intervalo
      end as alvo,
      case
        when p_status in ('suspensa', 'nao_aplicavel') then null
        when b.reprog then 'reprogramada'
        when p_ultima is not null and p_intervalo is not null then 'intervalo'
      end as origem
    from b
  )
  select
    case
      when p_status = 'suspensa' then 'suspensa'
      when p_status = 'nao_aplicavel' then 'nao_aplicavel'
      when a.alvo is null then 'sem_programacao'
      when p_data < a.alvo - coalesce(p_janela, 0) then 'em_dia'
      when p_data <= a.alvo then 'prevista'
      else 'atrasada'
    end,
    a.alvo,
    a.origem
  from a;
$$;

-- ---------------------------------------------------------------------
-- Últimas medidas registradas (evolução motora + avaliação + feita hoje)
-- ---------------------------------------------------------------------
create or replace function public.fn_motora_ultimas_medidas_interno(
  p_paciente_id uuid,
  p_ate date,
  p_excluir_agendamento uuid
) returns table (tipo text, data date, valores jsonb, fonte text)
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
  ), todas as (
    -- craniometria: as duas diagonais ou comprimento + largura
    select 'craniometria' as tipo, data, j->'craniometria' as valores, 'evolucao' as fonte
      from evo
     where (jsonb_typeof(j->'craniometria'->'diagonal_a_mm') = 'number' and jsonb_typeof(j->'craniometria'->'diagonal_b_mm') = 'number')
        or (jsonb_typeof(j->'craniometria'->'comprimento_ap_mm') = 'number' and jsonb_typeof(j->'craniometria'->'largura_ml_mm') = 'number')
    union all
    select 'craniometria', data, medidas_craniometricas, 'avaliacao'
      from aval
     where (jsonb_typeof(medidas_craniometricas->'diagonal_a_mm') = 'number' and jsonb_typeof(medidas_craniometricas->'diagonal_b_mm') = 'number')
        or (jsonb_typeof(medidas_craniometricas->'comprimento_ap_mm') = 'number' and jsonb_typeof(medidas_craniometricas->'largura_ml_mm') = 'number')
    -- goniometria: qualquer ângulo medido
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
    -- perímetro cefálico
    union all
    select 'perimetro_cefalico', data, jsonb_build_object('perimetro_cefalico_cm', j->'craniometria'->'perimetro_cefalico_cm'), 'evolucao'
      from evo where jsonb_typeof(j->'craniometria'->'perimetro_cefalico_cm') = 'number'
    union all
    select 'perimetro_cefalico', data, jsonb_build_object('perimetro_cefalico_cm', medidas_craniometricas->'perimetro_cefalico_cm'), 'avaliacao'
      from aval where jsonb_typeof(medidas_craniometricas->'perimetro_cefalico_cm') = 'number'
    -- MFS e desenvolvimento motor: avaliação clínica
    union all
    select 'mfs', data, jsonb_build_object('mfs_direito', mfs_direito, 'mfs_esquerdo', mfs_esquerdo), 'avaliacao'
      from aval where mfs_direito is not null or mfs_esquerdo is not null
    union all
    select 'desenvolvimento_motor', data,
           jsonb_strip_nulls(jsonb_build_object('percentil', coalesce(aims_detalhada->'percentil', aims->'percentil'))),
           'avaliacao'
      from aval
     -- a avaliação sempre grava uma estrutura de AIMS vazia: só conta se houve
     -- percentil ou pelo menos um marco motor marcado
     where coalesce(aims_detalhada->>'percentil', aims->>'percentil') is not null
        or exists (select 1 from jsonb_each(coalesce(marcos_motores_atingidos, '{}'::jsonb)) m
                   where m.value = 'true'::jsonb)
    -- "feita hoje" marcado na evolução (qualquer tipo)
    union all
    select mp.tipo, mp.ultima_realizada, null::jsonb, 'marcada'
      from motora_medida_programacao mp
     where mp.paciente_id = p_paciente_id and mp.ultima_realizada is not null and mp.ultima_realizada <= p_ate
  )
  select distinct on (tipo) tipo, data, valores, fonte
  from todas
  order by tipo, data desc, (valores is null);
$$;

revoke all on function public.fn_motora_ultimas_medidas_interno(uuid, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Situação de cada medida de um paciente numa data (evolução e detalhe)
-- ---------------------------------------------------------------------
create or replace function public.fn_motora_medidas_paciente(
  p_paciente_id uuid,
  p_data date,
  p_excluir_agendamento uuid default null
) returns table (
  tipo text, nome text, ordem int,
  status text, intervalo_dias int, janela_dias int,
  proxima_data date, programado_em date, descricao text, motivo text,
  ultima_data date, ultima_valores jsonb, ultima_fonte text,
  estado text, alvo date, origem text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (fn_rls_admin() or fn_rls_profissional()) then
    raise exception 'sem permissão para ver medidas clínicas';
  end if;

  return query
  select c.tipo, c.nome, c.ordem,
         coalesce(mp.status, 'ativa'),
         coalesce(mp.intervalo_dias, c.intervalo_padrao_dias),
         c.janela_antes_dias,
         mp.proxima_data, mp.programado_em, mp.descricao, mp.motivo,
         u.data, u.valores, u.fonte,
         e.estado, e.alvo, e.origem
  from motora_medida_config c
  left join motora_medida_programacao mp
         on mp.paciente_id = p_paciente_id and mp.tipo = c.tipo
  left join fn_motora_ultimas_medidas_interno(p_paciente_id, p_data, p_excluir_agendamento) u
         on u.tipo = c.tipo
  cross join lateral fn_motora_estado_medida(
         u.data, coalesce(mp.intervalo_dias, c.intervalo_padrao_dias),
         mp.proxima_data, mp.programado_em, c.janela_antes_dias,
         coalesce(mp.status, 'ativa'), p_data) e
  where c.ativo
  order by c.ordem;
end;
$$;

-- ---------------------------------------------------------------------
-- Medidas previstas/atrasadas por consulta (lembrete na agenda)
-- Secretaria e paciente recebem lista vazia (sem dado clínico).
-- ---------------------------------------------------------------------
create or replace function public.fn_motora_medidas_previstas(p_agendamento_ids uuid[])
returns table (agendamento_id uuid, tipo text, nome text, estado text, alvo date, ultima_data date)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (fn_rls_admin() or fn_rls_profissional()) then
    return;
  end if;

  return query
  with ag as (
    select a.id, a.paciente_id, (a.data_hora at time zone 'UTC')::date as dia
    from agendamentos a
    where a.id = any(p_agendamento_ids) and a.ativo
      -- só crianças com alguma medida ou programação: evita trabalho à toa
      and (exists (select 1 from motora_medida_programacao mp where mp.paciente_id = a.paciente_id)
           or exists (select 1 from motora_medida_config c where c.ativo and c.intervalo_padrao_dias is not null))
  )
  select ag.id, c.tipo, c.nome, e.estado, e.alvo, u.data
  from ag
  cross join motora_medida_config c
  left join motora_medida_programacao mp on mp.paciente_id = ag.paciente_id and mp.tipo = c.tipo
  left join lateral fn_motora_ultimas_medidas_interno(ag.paciente_id, ag.dia, ag.id) u on u.tipo = c.tipo
  cross join lateral fn_motora_estado_medida(
         u.data, coalesce(mp.intervalo_dias, c.intervalo_padrao_dias),
         mp.proxima_data, mp.programado_em, c.janela_antes_dias,
         coalesce(mp.status, 'ativa'), ag.dia) e
  where c.ativo and e.estado in ('prevista', 'atrasada')
  order by ag.id, c.ordem;
end;
$$;

-- ---------------------------------------------------------------------
-- Escrita: programar / adiar / marcar feita / não aplicável / suspender
-- ---------------------------------------------------------------------
create or replace function public.fn_motora_programar_medida(
  p_paciente_id uuid,
  p_tipo text,
  p_acao text,                 -- 'programar' | 'feita' | 'nao_aplicavel' | 'suspender' | 'reativar'
  p_data date default null,    -- programar: nova data alvo; feita: dia da sessão
  p_descricao text default null,
  p_motivo text default null,
  p_intervalo_dias int default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pessoa uuid := get_current_pessoa_id();
begin
  if not (fn_rls_admin() or fn_rls_profissional()) then
    raise exception 'sem permissão para programar medidas';
  end if;
  if not exists (select 1 from motora_medida_config where tipo = p_tipo) then
    raise exception 'tipo de medida desconhecido: %', p_tipo;
  end if;
  if p_acao in ('programar', 'feita') and p_data is null then
    raise exception 'informe a data';
  end if;

  insert into motora_medida_programacao (paciente_id, tipo, atualizado_por)
  values (p_paciente_id, p_tipo, v_pessoa)
  on conflict (paciente_id, tipo) do nothing;

  update motora_medida_programacao mp set
    status = case p_acao
               when 'nao_aplicavel' then 'nao_aplicavel'
               when 'suspender' then 'suspensa'
               when 'programar' then 'ativa'
               when 'reativar' then 'ativa'
               else mp.status end,
    -- feita: cumpre a programação que estava vencendo (alvo até data + janela);
    -- programação para mais longe continua valendo
    proxima_data = case
                     when p_acao = 'programar' then p_data
                     when p_acao = 'feita' and mp.proxima_data is not null
                          and mp.proxima_data <= p_data + coalesce(
                                (select c.janela_antes_dias from motora_medida_config c where c.tipo = p_tipo), 0)
                       then null
                     else mp.proxima_data end,
    programado_em = case when p_acao = 'programar' then current_date else mp.programado_em end,
    ultima_realizada = case when p_acao = 'feita'
                            then greatest(coalesce(mp.ultima_realizada, p_data), p_data)
                            else mp.ultima_realizada end,
    descricao = coalesce(p_descricao, mp.descricao),
    motivo = coalesce(p_motivo, mp.motivo),
    intervalo_dias = coalesce(p_intervalo_dias, mp.intervalo_dias),
    atualizado_por = v_pessoa,
    updated_at = now()
  where mp.paciente_id = p_paciente_id and mp.tipo = p_tipo;
end;
$$;

create or replace function public.fn_motora_salvar_config_medida(
  p_tipo text,
  p_intervalo_padrao_dias int,
  p_janela_antes_dias int,
  p_ativo boolean
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not fn_rls_admin() then
    raise exception 'apenas admin altera os intervalos das medidas';
  end if;
  update motora_medida_config set
    intervalo_padrao_dias = p_intervalo_padrao_dias,
    janela_antes_dias = coalesce(p_janela_antes_dias, janela_antes_dias),
    ativo = coalesce(p_ativo, ativo),
    atualizado_por = get_current_pessoa_id(),
    updated_at = now()
  where tipo = p_tipo;
  if not found then
    raise exception 'tipo de medida desconhecido: %', p_tipo;
  end if;
end;
$$;

revoke all on function public.fn_motora_medidas_paciente(uuid, date, uuid) from public, anon;
revoke all on function public.fn_motora_medidas_previstas(uuid[]) from public, anon;
revoke all on function public.fn_motora_programar_medida(uuid, text, text, date, text, text, int) from public, anon;
revoke all on function public.fn_motora_salvar_config_medida(text, int, int, boolean) from public, anon;
grant execute on function public.fn_motora_medidas_paciente(uuid, date, uuid) to authenticated;
grant execute on function public.fn_motora_medidas_previstas(uuid[]) to authenticated;
grant execute on function public.fn_motora_programar_medida(uuid, text, text, date, text, text, int) to authenticated;
grant execute on function public.fn_motora_salvar_config_medida(text, int, int, boolean) to authenticated;
grant execute on function public.fn_motora_estado_medida(date, int, date, date, int, text, date) to authenticated;
