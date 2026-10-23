-- =====================================================================
-- Programação de medidas: piloto por profissional + medidas sem seção
-- própria concluídas pela evolução (23/10/2026)
-- =====================================================================
-- Piloto: a programação de medidas só vale para quem está liberado
-- (admin sempre; profissional só se estiver em motora_medida_piloto). Quem
-- não está continua com a evolução de antes. As funções checam no banco:
-- não depende só de esconder a tela.
--
-- Medidas sem seção na evolução (MFS, perímetro, reavaliação do
-- desenvolvimento, outra) passam a ter os valores gravados em
-- evolucao_motora_assimetria.medicoes.<tipo>.valores quando a fisio marca
-- "Feita hoje"; a última medida passa a ler esses valores também.
-- =====================================================================

create table if not exists public.motora_medida_piloto (
  pessoa_id uuid primary key references public.pessoas(id) on delete cascade,
  liberado_por uuid references public.pessoas(id),
  created_at timestamptz not null default now()
);

alter table public.motora_medida_piloto enable row level security;

drop policy if exists motora_medida_piloto_leitura on public.motora_medida_piloto;
create policy motora_medida_piloto_leitura on public.motora_medida_piloto
  for select using (
    (select public.fn_rls_admin())
    or pessoa_id = (select public.get_current_pessoa_id())
  );

-- Quem está liberado para usar a programação de medidas
create or replace function public.fn_motora_medidas_liberado()
returns boolean
language sql stable security definer set search_path = public
as $$
  select fn_rls_admin()
      or (fn_rls_profissional()
          and exists (select 1 from motora_medida_piloto
                      where pessoa_id = get_current_pessoa_id()));
$$;

create or replace function public.fn_motora_definir_piloto(
  p_pessoa_id uuid,
  p_liberado boolean
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not fn_rls_admin() then
    raise exception 'apenas admin define o piloto';
  end if;
  if p_liberado then
    insert into motora_medida_piloto (pessoa_id, liberado_por)
    values (p_pessoa_id, get_current_pessoa_id())
    on conflict (pessoa_id) do nothing;
  else
    delete from motora_medida_piloto where pessoa_id = p_pessoa_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Última medida: + valores registrados na evolução para as medidas sem
-- seção própria (situação "medido" com valores completos)
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
  ), med as (
    -- medidas registradas pelo bloco da evolução (sem seção própria)
    select evo.data, m.key as tipo, m.value->'valores' as valores
    from evo, jsonb_each(coalesce(evo.j->'medicoes', '{}'::jsonb)) m
    where m.value->>'situacao' = 'medido' and jsonb_typeof(m.value->'valores') = 'object'
  ), todas as (
    select 'craniometria' as tipo, data, j->'craniometria' as valores, 'evolucao' as fonte
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
    -- valores do bloco da evolução, só quando completos
    union all
    select 'mfs', data, valores, 'evolucao' from med
     where tipo = 'mfs'
       and jsonb_typeof(valores->'mfs_direito') = 'number'
       and jsonb_typeof(valores->'mfs_esquerdo') = 'number'
    union all
    select 'perimetro_cefalico', data, valores, 'evolucao' from med
     where tipo = 'perimetro_cefalico' and jsonb_typeof(valores->'perimetro_cefalico_cm') = 'number'
    union all
    -- mesma regra da tela: AIMS só com percentil; "outro" só com o nome
    select 'desenvolvimento_motor', data, valores, 'evolucao' from med
     where tipo = 'desenvolvimento_motor' and coalesce(valores->>'instrumento', '') <> ''
       and (valores->>'instrumento' <> 'aims' or jsonb_typeof(valores->'percentil') = 'number')
       and (valores->>'instrumento' <> 'outro' or coalesce(valores->>'instrumento_outro', '') <> '')
    union all
    select 'outra', data, valores, 'evolucao' from med
     where tipo = 'outra' and coalesce(valores->>'descricao', '') <> ''
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
-- Leitura e escrita passam a exigir piloto liberado
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
  if not fn_motora_medidas_liberado() then
    raise exception 'programação de medidas não liberada para este usuário';
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

create or replace function public.fn_motora_medidas_previstas(p_agendamento_ids uuid[])
returns table (agendamento_id uuid, tipo text, nome text, estado text, alvo date, ultima_data date)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not fn_motora_medidas_liberado() then
    return;
  end if;

  return query
  with ag as (
    select a.id, a.paciente_id, (a.data_hora at time zone 'UTC')::date as dia
    from agendamentos a
    where a.id = any(p_agendamento_ids) and a.ativo
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

create or replace function public.fn_motora_programar_medida(
  p_paciente_id uuid,
  p_tipo text,
  p_acao text,
  p_data date default null,
  p_descricao text default null,
  p_motivo text default null,
  p_intervalo_dias int default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pessoa uuid := get_current_pessoa_id();
begin
  if not fn_motora_medidas_liberado() then
    raise exception 'programação de medidas não liberada para este usuário';
  end if;
  if not exists (select 1 from motora_medida_config where tipo = p_tipo) then
    raise exception 'tipo de medida desconhecido: %', p_tipo;
  end if;
  if p_acao not in ('programar', 'feita', 'nao_aplicavel', 'suspender', 'reativar') then
    raise exception 'ação desconhecida: %', p_acao;
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
    -- reativar/programar: o motivo antigo ("não se aplica", suspensão) não vale mais
    motivo = case when p_acao in ('programar', 'reativar') then p_motivo
                  else coalesce(p_motivo, mp.motivo) end,
    intervalo_dias = coalesce(p_intervalo_dias, mp.intervalo_dias),
    atualizado_por = v_pessoa,
    updated_at = now()
  where mp.paciente_id = p_paciente_id and mp.tipo = p_tipo;
end;
$$;

revoke all on function public.fn_motora_medidas_liberado() from public, anon;
revoke all on function public.fn_motora_definir_piloto(uuid, boolean) from public, anon;
grant execute on function public.fn_motora_medidas_liberado() to authenticated;
grant execute on function public.fn_motora_definir_piloto(uuid, boolean) to authenticated;

-- Defesa em profundidade: anon não acessa as tabelas de medidas; usuário
-- logado só lê (RLS decide o quê). Escrita só pelas funções SECURITY DEFINER.
revoke all on table public.motora_medida_config, public.motora_medida_programacao, public.motora_medida_piloto from anon;
revoke insert, update, delete, truncate, references, trigger on table public.motora_medida_config, public.motora_medida_programacao, public.motora_medida_piloto from authenticated;
grant select on table public.motora_medida_config, public.motora_medida_programacao, public.motora_medida_piloto to authenticated;
revoke all on function public.fn_motora_estado_medida(date, int, date, date, int, text, date) from public, anon;
