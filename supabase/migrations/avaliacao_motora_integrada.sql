-- Avaliação motora integrada à evolução:
-- - a avaliação grava habilidades no mesmo catálogo da evolução (registro zero);
-- - reavaliação (tipo + avaliação anterior) e ligação com a consulta da agenda;
-- - FSOS-2 e tensão neuromeníngea viram medidas comparáveis (evolução e
--   avaliação), com lembrete como as demais;
-- - histórico motor passa a incluir as avaliações;
-- - convite de anamnese respondida pelos pais (link com token).

-- ------------------------------------------------------------ avaliação

alter table public.avaliacoes_clinicas
  add column if not exists habilidades jsonb,
  add column if not exists tipo_avaliacao text not null default 'inicial',
  add column if not exists avaliacao_anterior_id uuid references public.avaliacoes_clinicas(id) on delete set null,
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null;

do $$ begin
  alter table public.avaliacoes_clinicas
    add constraint avaliacoes_clinicas_tipo_chk check (tipo_avaliacao in ('inicial', 'reavaliacao'));
exception when duplicate_object then null; end $$;

create index if not exists avaliacoes_clinicas_agendamento_idx
  on public.avaliacoes_clinicas (agendamento_id) where agendamento_id is not null;

-- ------------------------------------------------- novas medidas seriadas

insert into public.motora_medida_config (tipo, nome, ordem, intervalo_padrao_dias, janela_antes_dias, ativo)
values ('fsos2', 'FSOS-2', 7, null, 7, true),
       ('tensao_neuromeningea', 'Tensão neuromeníngea', 8, null, 7, true)
on conflict (tipo) do nothing;

-- FSOS-2: total dos itens pontuados (0–4) e quantos itens foram pontuados.
-- Total só é comparável entre registros com o mesmo número de itens.
create or replace function public.fn_motora_fsos2_resumo(j jsonb)
returns jsonb
language sql immutable
as $$
  select case when count(*) = 0 then null else
    jsonb_build_object('total', sum((e.value)::numeric), 'itens', count(*)) end
  from jsonb_each(coalesce(j, '{}'::jsonb)) p,
       jsonb_each(case when jsonb_typeof(p.value) = 'object' then p.value else '{}'::jsonb end) e
  where p.key in ('supino', 'prono', 'sentado', 'em_pe')
    and jsonb_typeof(e.value) = 'number';
$$;

-- Tensão neuromeníngea: testes alterados e testes realizados
create or replace function public.fn_motora_tensao_resumo(j jsonb)
returns jsonb
language sql immutable
as $$
  select case when count(*) filter (where t.value->>'status' in ('normal', 'alterado')) = 0 then null else
    jsonb_build_object(
      'alterados', count(*) filter (where t.value->>'status' = 'alterado'),
      'testados', count(*) filter (where t.value->>'status' in ('normal', 'alterado'))) end
  from jsonb_each(coalesce(j, '{}'::jsonb)) t
  where jsonb_typeof(t.value) = 'object';
$$;

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
    select evo.data, m.key as tipo, m.value->'valores' as valores, m.value->'dados' as dados
    from evo, jsonb_each(coalesce(evo.j->'medicoes', '{}'::jsonb)) m
    where m.value->>'situacao' = 'medido'
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
         jsonb_strip_nulls(jsonb_build_object(
           'instrumento', case when coalesce(aims_detalhada->>'percentil', aims->>'percentil') is not null then 'aims' end,
           'percentil', coalesce(aims_detalhada->'percentil', aims->'percentil'),
           'score_total', coalesce(aims_detalhada->'score_total', aims->'score_total'))),
         'avaliacao'
    from aval
   where coalesce(aims_detalhada->>'percentil', aims->>'percentil') is not null
      or exists (select 1 from jsonb_each(coalesce(marcos_motores_atingidos, '{}'::jsonb)) m
                 where m.value = 'true'::jsonb)
  union all
  select 'fsos2', data, fn_motora_fsos2_resumo(fsos2) || jsonb_build_object('dados', fsos2), 'avaliacao'
    from aval where fn_motora_fsos2_resumo(fsos2) is not null
  union all
  select 'tensao_neuromeningea', data,
         fn_motora_tensao_resumo(tensao_neuromeningea_detalhada) || jsonb_build_object('dados', tensao_neuromeningea_detalhada),
         'avaliacao'
    from aval where fn_motora_tensao_resumo(tensao_neuromeningea_detalhada) is not null
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
   where tipo = 'desenvolvimento_motor' and jsonb_typeof(valores) = 'object'
     and coalesce(valores->>'instrumento', '') <> ''
     and (valores->>'instrumento' <> 'aims' or jsonb_typeof(valores->'percentil') = 'number')
     and (valores->>'instrumento' <> 'outro' or coalesce(valores->>'instrumento_outro', '') <> '')
  union all
  select 'outra', data, valores, 'evolucao' from med
   where tipo = 'outra' and jsonb_typeof(valores) = 'object' and coalesce(valores->>'descricao', '') <> ''
  union all
  select 'fsos2', data, fn_motora_fsos2_resumo(dados) || jsonb_build_object('dados', dados), 'evolucao' from med
   where tipo = 'fsos2' and fn_motora_fsos2_resumo(dados) is not null
  union all
  select 'tensao_neuromeningea', data, fn_motora_tensao_resumo(dados) || jsonb_build_object('dados', dados), 'evolucao' from med
   where tipo = 'tensao_neuromeningea' and fn_motora_tensao_resumo(dados) is not null;
$$;

revoke all on function public.fn_motora_medidas_todas_interno(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.fn_motora_fsos2_resumo(jsonb) from public, anon;
revoke all on function public.fn_motora_tensao_resumo(jsonb) from public, anon;

-- Histórico motor: evoluções E avaliações (registro zero e reavaliações)
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
      select jsonb_agg(x.j order by x.data, x.ordem)
        from (
          select (a.data_hora at time zone 'UTC')::date as data, 1 as ordem,
                 jsonb_build_object(
                   'agendamento_id', a.id,
                   'data', (a.data_hora at time zone 'UTC')::date,
                   'profissional', p.nome,
                   'fonte', 'evolucao',
                   'versao', re.evolucao_motora_assimetria->>'versao_formulario',
                   'areas', re.evolucao_motora_assimetria->'areas',
                   'habilidades', re.evolucao_motora_assimetria->'habilidades',
                   'objetivos_sessao', re.evolucao_motora_assimetria->'objetivos_sessao') as j
            from relatorio_evolucao re
            join agendamentos a on a.id = re.id_agendamento
            left join pessoas p on p.id = a.profissional_id
           where a.paciente_id = p_paciente_id
             and re.tipo_evolucao = 'motora_assimetria'
             and re.evolucao_motora_assimetria is not null
          union all
          select ac.data_avaliacao, 0,
                 jsonb_build_object(
                   'agendamento_id', null,
                   'avaliacao_id', ac.id,
                   'data', ac.data_avaliacao,
                   'profissional', p.nome,
                   'fonte', 'avaliacao',
                   'tipo_avaliacao', ac.tipo_avaliacao,
                   'habilidades', ac.habilidades,
                   'objetivos_sessao', null)
            from avaliacoes_clinicas ac
            left join pessoas p on p.id = ac.avaliador_id
           where ac.pessoa_id = p_paciente_id
             and jsonb_typeof(ac.habilidades) = 'array'
        ) x), '[]'::jsonb),
    'avaliacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ac.id, 'data', ac.data_avaliacao, 'tipo', ac.tipo_avaliacao,
               'status', ac.status) order by ac.data_avaliacao)
        from avaliacoes_clinicas ac where ac.pessoa_id = p_paciente_id), '[]'::jsonb),
    'medidas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'data', m.data, 'valores', m.valores, 'fonte', m.fonte)
             order by m.data)
        from fn_motora_medidas_todas_interno(p_paciente_id, '9999-12-31'::date, null) m), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

-- ------------------------------------------------ anamnese pelos pais

create table if not exists public.anamnese_convites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  paciente_id uuid not null references public.pessoas(id) on delete cascade,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  respondido_em timestamptz,
  respostas jsonb,
  aplicado_em timestamptz,
  aplicado_avaliacao_id uuid references public.avaliacoes_clinicas(id) on delete set null
);

create index if not exists anamnese_convites_paciente_idx on public.anamnese_convites (paciente_id, criado_em desc);

alter table public.anamnese_convites enable row level security;
drop policy if exists anamnese_convites_leitura on public.anamnese_convites;
create policy anamnese_convites_leitura on public.anamnese_convites
  for select to authenticated
  using ((select fn_rls_admin()) or (select fn_rls_profissional()) or (select fn_rls_secretaria()));
revoke all on table public.anamnese_convites from anon;
revoke insert, update, delete, truncate, references, trigger on table public.anamnese_convites from authenticated;
grant select on table public.anamnese_convites to authenticated;

-- Campos que os pais podem responder (o resto é ignorado)
create or replace function public.fn_anamnese_campos_permitidos()
returns text[]
language sql immutable
as $$
  select array[
    'queixa_principal', 'numero_gestacoes', 'gestacao_multipla', 'idade_gestacional_semanas',
    'liquido_amniotico', 'apresentacao_fetal', 'encaixe_precoce', 'circular_cordao',
    'intercorrencias_prenatais', 'tipo_parto', 'instrumentos_parto', 'duracao_trabalho_parto_minutos',
    'intercorrencias_perinatais', 'tempo_internacao_dias', 'local_internacao',
    'assistencia_ventilatoria', 'idade_inclinacao_cabeca_dias', 'assimetrias_percebidas',
    'assimetrias_percebidas_outra', 'estado_emocional_opcoes', 'onde_dorme_opcao',
    'qualidade_sono_opcao', 'posicao_preferencia_opcao', 'refluxo_status', 'aplv', 'disquesia',
    'observacoes_familia'
  ];
$$;

-- Staff cria o convite e recebe o token (para montar o link do WhatsApp)
create or replace function public.fn_anamnese_criar_convite(p_paciente_id uuid, p_agendamento_id uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not (fn_rls_admin() or fn_rls_profissional() or fn_rls_secretaria()) then
    raise exception 'sem permissão para enviar a anamnese';
  end if;
  insert into anamnese_convites (token, paciente_id, agendamento_id, criado_por)
  values (v_token, p_paciente_id, p_agendamento_id, get_current_pessoa_id());
  return v_token;
end;
$$;

-- Público (link): o que a página precisa mostrar. Só o primeiro nome.
create or replace function public.fn_public_anamnese_buscar(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  c anamnese_convites;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into c from anamnese_convites where token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'nome', split_part((select nome from pessoas where id = c.paciente_id), ' ', 1),
    'expirado', c.expira_em < now() or c.aplicado_em is not null,
    'respondido_em', c.respondido_em,
    'respostas', case when c.expira_em >= now() and c.aplicado_em is null then c.respostas end);
end;
$$;

-- Público (link): grava as respostas (só os campos permitidos)
create or replace function public.fn_public_anamnese_responder(p_token text, p_respostas jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_limpo jsonb;
begin
  if p_token is null or length(p_token) < 32 or jsonb_typeof(p_respostas) <> 'object' then
    return false;
  end if;
  if length(p_respostas::text) > 20000 then
    raise exception 'respostas grandes demais';
  end if;
  select id into v_id from anamnese_convites
   where token = p_token and expira_em >= now() and aplicado_em is null;
  if v_id is null then return false; end if;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_limpo
    from jsonb_each(p_respostas) as e(k, v)
   where k = any(fn_anamnese_campos_permitidos());
  update anamnese_convites set respostas = v_limpo, respondido_em = now() where id = v_id;
  return true;
end;
$$;

-- Staff marca as respostas como aplicadas a uma avaliação
create or replace function public.fn_anamnese_marcar_aplicada(p_convite_id uuid, p_avaliacao_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (fn_rls_admin() or fn_rls_profissional()) then
    raise exception 'sem permissão';
  end if;
  update anamnese_convites set aplicado_em = now(), aplicado_avaliacao_id = p_avaliacao_id
   where id = p_convite_id;
end;
$$;

revoke all on function public.fn_anamnese_criar_convite(uuid, uuid) from public, anon;
revoke all on function public.fn_anamnese_marcar_aplicada(uuid, uuid) from public, anon;
revoke all on function public.fn_anamnese_campos_permitidos() from public;
grant execute on function public.fn_anamnese_criar_convite(uuid, uuid) to authenticated;
grant execute on function public.fn_anamnese_marcar_aplicada(uuid, uuid) to authenticated;
grant execute on function public.fn_public_anamnese_buscar(text) to anon, authenticated;
grant execute on function public.fn_public_anamnese_responder(text, jsonb) to anon, authenticated;

-- Caminho de busca fixo nas funções auxiliares (aviso do verificador)
alter function public.fn_motora_fsos2_resumo(jsonb) set search_path = public;
alter function public.fn_motora_tensao_resumo(jsonb) set search_path = public;
alter function public.fn_anamnese_campos_permitidos() set search_path = public;
