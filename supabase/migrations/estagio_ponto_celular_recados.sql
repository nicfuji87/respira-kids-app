-- AI dev note: Ponto pelo celular da estagiária + recados entre turnos.
--
-- 1) ACESSO PRÓPRIO (sem Supabase Auth): a estagiária não vira usuário do app.
--    Ela entra em #/ponto (rota pública) com login + senha que o admin cadastra.
--    O login gera um token de sessão guardado no celular (só o hash fica no banco).
--    Tudo passa por RPCs SECURITY DEFINER que recebem o token; as tabelas de
--    acesso/sessão são só service_role. Por isso ela não enxerga NADA além do
--    próprio ponto e dos recados — não há role nova nem policy "to authenticated"
--    que ela possa herdar.
--
-- 2) LOCALIZAÇÃO OBRIGATÓRIA no celular: a batida só é aceita com lat/lng e
--    dentro da cerca da clínica (estagio_ponto_geofence). A conta é feita aqui no
--    servidor, com a mesma folga do quiosque (precisão do GPS, no máximo 150 m).
--    Sem cerca ativa, o ponto pelo celular fica bloqueado.
--
-- 3) FOTO: a RPC registra a batida já com foto_path = 'celular/<cid>/<uuid>.jpg';
--    o celular sobe a selfie nesse caminho. A policy de storage para o anon criada
--    no fim deste arquivo NÃO funcionou (policies antigas consultam pessoas) e foi
--    trocada pela edge function estagio-ponto-foto — ver
--    estagio_ponto_celular_foto_edge.sql, que a remove.
--
-- 4) RECADOS: na saída a estagiária pode deixar um recado para o próximo turno.
--    Na entrada, as outras veem os recados dos últimos 3 dias que ainda não leram;
--    bater a entrada marca como lido. Vale no celular e no quiosque (tablet).

-- ---------------------------------------------------------------------------
-- Origem nova da batida
-- ---------------------------------------------------------------------------
alter table public.estagio_pontos drop constraint if exists estagio_pontos_origem_check;
alter table public.estagio_pontos
  add constraint estagio_pontos_origem_check
  check (origem in ('kiosk', 'manual', 'celular'));

create index if not exists idx_estagio_pontos_foto_path
  on public.estagio_pontos (foto_path) where origem = 'celular';

-- ---------------------------------------------------------------------------
-- Acesso (login + senha) e sessões
-- ---------------------------------------------------------------------------
create table if not exists public.estagio_acessos (
  candidatura_id uuid primary key references public.candidaturas_estagio(id) on delete cascade,
  login text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  falhas integer not null default 0,
  bloqueado_ate timestamptz,
  ultimo_login timestamptz,
  updated_by uuid references public.pessoas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_estagio_acessos_login
  on public.estagio_acessos (lower(login));

create table if not exists public.estagio_sessoes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  candidatura_id uuid not null references public.candidaturas_estagio(id) on delete cascade,
  dispositivo text,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '180 days',
  revogado_em timestamptz
);
create index if not exists idx_estagio_sessoes_cid on public.estagio_sessoes (candidatura_id);

alter table public.estagio_acessos enable row level security;
alter table public.estagio_sessoes enable row level security;

drop policy if exists estagio_acessos_service_role on public.estagio_acessos;
create policy estagio_acessos_service_role on public.estagio_acessos
  for all to service_role using (true) with check (true);
drop policy if exists estagio_sessoes_service_role on public.estagio_sessoes;
create policy estagio_sessoes_service_role on public.estagio_sessoes
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Recados entre turnos
-- ---------------------------------------------------------------------------
create table if not exists public.estagio_recados (
  id uuid primary key default gen_random_uuid(),
  candidatura_id uuid not null references public.candidaturas_estagio(id) on delete cascade,
  ponto_id uuid references public.estagio_pontos(id) on delete set null,
  texto text not null check (length(btrim(texto)) between 1 and 1000),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_estagio_recados_created on public.estagio_recados (created_at desc);

create table if not exists public.estagio_recado_leituras (
  recado_id uuid not null references public.estagio_recados(id) on delete cascade,
  candidatura_id uuid not null references public.candidaturas_estagio(id) on delete cascade,
  lido_em timestamptz not null default now(),
  primary key (recado_id, candidatura_id)
);

alter table public.estagio_recados enable row level security;
alter table public.estagio_recado_leituras enable row level security;

drop policy if exists estagio_recados_service_role on public.estagio_recados;
create policy estagio_recados_service_role on public.estagio_recados
  for all to service_role using (true) with check (true);
drop policy if exists estagio_recados_staff on public.estagio_recados;
create policy estagio_recados_staff on public.estagio_recados
  for all to authenticated
  using ((select public.fn_rls_admin_secretaria_ativo()))
  with check ((select public.fn_rls_admin_secretaria_ativo()));

drop policy if exists estagio_recado_leituras_service_role on public.estagio_recado_leituras;
create policy estagio_recado_leituras_service_role on public.estagio_recado_leituras
  for all to service_role using (true) with check (true);
drop policy if exists estagio_recado_leituras_staff on public.estagio_recado_leituras;
create policy estagio_recado_leituras_staff on public.estagio_recado_leituras
  for all to authenticated
  using ((select public.fn_rls_admin_secretaria_ativo()))
  with check ((select public.fn_rls_admin_secretaria_ativo()));

-- ---------------------------------------------------------------------------
-- Helpers internos (sem grant para anon/authenticated)
-- ---------------------------------------------------------------------------

-- Token -> candidatura_id (null se a sessão não vale mais). Atualiza ultimo_uso.
create or replace function public._estagio_sessao_cid(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sessao public.estagio_sessoes;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select s.* into v_sessao
  from public.estagio_sessoes s
  join public.estagio_acessos a on a.candidatura_id = s.candidatura_id and a.ativo
  join public.candidaturas_estagio c on c.id = s.candidatura_id
    and c.status = 'aprovado' and c.ativo
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revogado_em is null
    and s.expira_em > now();
  if v_sessao.id is null then
    return null;
  end if;
  update public.estagio_sessoes set ultimo_uso = now() where id = v_sessao.id;
  return v_sessao.candidatura_id;
end;
$$;

-- Recados que a estagiária ainda não leu (das outras, últimos 3 dias).
create or replace function public._estagio_recados_pendentes(p_cid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'texto', r.texto,
           'autor', split_part(c.nome, ' ', 1),
           'created_at', r.created_at
         ) order by r.created_at desc), '[]'::jsonb)
  from public.estagio_recados r
  join public.candidaturas_estagio c on c.id = r.candidatura_id
  where r.ativo
    and r.candidatura_id <> p_cid
    and r.created_at > now() - interval '3 days'
    and not exists (
      select 1 from public.estagio_recado_leituras l
      where l.recado_id = r.id and l.candidatura_id = p_cid
    );
$$;

-- Distância em metros (Haversine).
create or replace function public._estagio_distancia_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Storage: o anon só pode criar a foto de uma batida de celular recém-registrada.
create or replace function public._estagio_foto_celular_pendente(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.estagio_pontos
    where origem = 'celular'
      and foto_path = p_name
      and registrado_em > now() - interval '10 minutes'
  );
$$;

revoke all on function public._estagio_sessao_cid(text) from public, anon, authenticated;
revoke all on function public._estagio_recados_pendentes(uuid) from public, anon, authenticated;
revoke all on function public._estagio_distancia_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
-- A policy de storage roda como o papel de quem faz o upload; precisa de execute.
revoke all on function public._estagio_foto_celular_pendente(text) from public;
grant execute on function public._estagio_foto_celular_pendente(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs do celular (anon) — sempre respondem jsonb {ok, ...}; nunca raise, para
-- que o contador de tentativas erradas não seja desfeito por rollback.
-- ---------------------------------------------------------------------------

create or replace function public.fn_estagio_celular_login(
  p_login text, p_senha text, p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_acesso public.estagio_acessos;
  v_nome text;
  v_token text;
begin
  select a.* into v_acesso
  from public.estagio_acessos a
  where lower(a.login) = lower(btrim(coalesce(p_login, '')));

  if v_acesso.candidatura_id is null or not v_acesso.ativo then
    return jsonb_build_object('ok', false, 'erro', 'LOGIN_INVALIDO');
  end if;

  if v_acesso.bloqueado_ate is not null and v_acesso.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'BLOQUEADO',
      'ate', v_acesso.bloqueado_ate);
  end if;

  if v_acesso.senha_hash <> extensions.crypt(coalesce(p_senha, ''), v_acesso.senha_hash) then
    update public.estagio_acessos
      set falhas = case when falhas + 1 >= 5 then 0 else falhas + 1 end,
          bloqueado_ate = case when falhas + 1 >= 5
                               then now() + interval '15 minutes' end
      where candidatura_id = v_acesso.candidatura_id;
    return jsonb_build_object('ok', false, 'erro', 'LOGIN_INVALIDO');
  end if;

  select nome into v_nome from public.candidaturas_estagio
  where id = v_acesso.candidatura_id and status = 'aprovado' and ativo;
  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'LOGIN_INVALIDO');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.estagio_sessoes (token_hash, candidatura_id, dispositivo)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'),
          v_acesso.candidatura_id, left(p_dispositivo, 200));

  update public.estagio_acessos
    set falhas = 0, bloqueado_ate = null, ultimo_login = now()
    where candidatura_id = v_acesso.candidatura_id;

  return jsonb_build_object('ok', true, 'token', v_token, 'nome', v_nome);
end;
$$;

create or replace function public.fn_estagio_celular_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid uuid;
  v_nome text;
  v_hoje jsonb;
  v_ultimo text;
  v_cerca public.estagio_ponto_geofence;
  v_meu jsonb;
begin
  v_cid := public._estagio_sessao_cid(p_token);
  if v_cid is null then
    return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA');
  end if;

  select nome into v_nome from public.candidaturas_estagio where id = v_cid;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'registrado_em', registrado_em)
           order by registrado_em), '[]'::jsonb)
    into v_hoje
  from public.estagio_pontos
  where candidatura_id = v_cid and ativo
    and (registrado_em at time zone 'America/Sao_Paulo')::date
        = (now() at time zone 'America/Sao_Paulo')::date;

  select tipo into v_ultimo from public.estagio_pontos
  where candidatura_id = v_cid and ativo
    and (registrado_em at time zone 'America/Sao_Paulo')::date
        = (now() at time zone 'America/Sao_Paulo')::date
  order by registrado_em desc limit 1;

  select * into v_cerca from public.estagio_ponto_geofence
  order by updated_at desc limit 1;

  -- Último recado que ela deixou (e quem já leu), para dar retorno.
  select jsonb_build_object(
           'texto', r.texto,
           'created_at', r.created_at,
           'lido_por', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'nome', split_part(c.nome, ' ', 1), 'lido_em', l.lido_em)
                    order by l.lido_em)
             from public.estagio_recado_leituras l
             join public.candidaturas_estagio c on c.id = l.candidatura_id
             where l.recado_id = r.id), '[]'::jsonb))
    into v_meu
  from public.estagio_recados r
  where r.candidatura_id = v_cid and r.ativo
    and r.created_at > now() - interval '3 days'
  order by r.created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'nome', v_nome,
    'hoje', v_hoje,
    'proxima', case when v_ultimo = 'entrada' then 'saida' else 'entrada' end,
    'recados', public._estagio_recados_pendentes(v_cid),
    'meu_recado', v_meu,
    'cerca', case when v_cerca.id is null then null else jsonb_build_object(
      'lat', v_cerca.lat, 'lng', v_cerca.lng,
      'raio_m', v_cerca.raio_m, 'ativo', v_cerca.ativo) end
  );
end;
$$;

create or replace function public.fn_estagio_celular_registrar(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_precisao double precision,
  p_checklist jsonb default null,
  p_recado text default null,
  p_recados_lidos uuid[] default null,
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid uuid;
  v_cerca public.estagio_ponto_geofence;
  v_dist double precision;
  v_ultimo public.estagio_pontos;
  v_tipo text;
  v_ponto_id uuid := gen_random_uuid();
  v_path text;
  v_agora timestamptz := now();
begin
  v_cid := public._estagio_sessao_cid(p_token);
  if v_cid is null then
    return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA');
  end if;

  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'erro', 'SEM_LOCALIZACAO');
  end if;

  select * into v_cerca from public.estagio_ponto_geofence
  where ativo order by updated_at desc limit 1;
  if v_cerca.id is null then
    return jsonb_build_object('ok', false, 'erro', 'CERCA_DESLIGADA');
  end if;

  v_dist := public._estagio_distancia_m(p_lat, p_lng, v_cerca.lat, v_cerca.lng);
  if v_dist > v_cerca.raio_m + least(coalesce(p_precisao, 0), 150) then
    return jsonb_build_object('ok', false, 'erro', 'FORA_DA_CLINICA',
      'distancia_m', round(v_dist));
  end if;

  select * into v_ultimo from public.estagio_pontos
  where candidatura_id = v_cid and ativo
    and (registrado_em at time zone 'America/Sao_Paulo')::date
        = (v_agora at time zone 'America/Sao_Paulo')::date
  order by registrado_em desc limit 1;

  -- Toque duplo / reenvio: não cria duas batidas seguidas em menos de 1 minuto.
  if v_ultimo.id is not null and v_ultimo.registrado_em > v_agora - interval '1 minute' then
    return jsonb_build_object('ok', false, 'erro', 'ACABOU_DE_REGISTRAR',
      'tipo', v_ultimo.tipo, 'registrado_em', v_ultimo.registrado_em);
  end if;

  v_tipo := case when v_ultimo.tipo = 'entrada' then 'saida' else 'entrada' end;
  v_path := 'celular/' || v_cid || '/' || v_ponto_id || '.jpg';

  insert into public.estagio_pontos (
    id, candidatura_id, tipo, registrado_em, foto_path, dispositivo, origem,
    lat, lng, precisao_m, checklist
  ) values (
    v_ponto_id, v_cid, v_tipo, v_agora, v_path, left(p_dispositivo, 200), 'celular',
    p_lat, p_lng, p_precisao,
    case when v_tipo = 'saida' then p_checklist end
  );

  if v_tipo = 'saida' and length(btrim(coalesce(p_recado, ''))) > 0 then
    insert into public.estagio_recados (candidatura_id, ponto_id, texto)
    values (v_cid, v_ponto_id, left(btrim(p_recado), 1000));
  end if;

  -- Bater a entrada com os recados na tela = ciente.
  if v_tipo = 'entrada' and p_recados_lidos is not null then
    insert into public.estagio_recado_leituras (recado_id, candidatura_id)
    select r.id, v_cid
    from public.estagio_recados r
    where r.id = any (p_recados_lidos) and r.candidatura_id <> v_cid
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'tipo', v_tipo,
    'registrado_em', v_agora, 'foto_path', v_path);
end;
$$;

create or replace function public.fn_estagio_celular_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.estagio_sessoes set revogado_em = now()
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and revogado_em is null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fn_estagio_celular_login(text, text, text) from public;
revoke all on function public.fn_estagio_celular_status(text) from public;
revoke all on function public.fn_estagio_celular_registrar(text, double precision, double precision, double precision, jsonb, text, uuid[], text) from public;
revoke all on function public.fn_estagio_celular_logout(text) from public;
grant execute on function public.fn_estagio_celular_login(text, text, text) to anon, authenticated;
grant execute on function public.fn_estagio_celular_status(text) to anon, authenticated;
grant execute on function public.fn_estagio_celular_registrar(text, double precision, double precision, double precision, jsonb, text, uuid[], text) to anon, authenticated;
grant execute on function public.fn_estagio_celular_logout(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs da equipe (cadastro do acesso + recados no quiosque)
-- ---------------------------------------------------------------------------

-- Cria/atualiza o acesso. Senha nula = mantém a atual (só troca o login).
-- Trocar a senha derruba as sessões abertas (desloga o celular antigo).
create or replace function public.fn_estagio_acesso_salvar(
  p_candidatura_id uuid, p_login text, p_senha text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login text := lower(btrim(coalesce(p_login, '')));
  v_existe boolean;
begin
  if not public.fn_rls_admin_aprovado_ativo() then
    raise exception 'Apenas admin pode cadastrar o acesso da estagiária';
  end if;
  if v_login !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Login inválido: use de 3 a 40 letras minúsculas, números, ponto, hífen ou _';
  end if;
  if p_senha is not null and length(p_senha) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres';
  end if;
  if not exists (select 1 from public.candidaturas_estagio
                 where id = p_candidatura_id and status = 'aprovado' and ativo) then
    raise exception 'Estagiária não encontrada ou não aprovada';
  end if;
  if exists (select 1 from public.estagio_acessos
             where lower(login) = v_login and candidatura_id <> p_candidatura_id) then
    raise exception 'Esse login já é de outra estagiária';
  end if;

  select exists (select 1 from public.estagio_acessos
                 where candidatura_id = p_candidatura_id) into v_existe;

  if not v_existe then
    if p_senha is null then
      raise exception 'Defina uma senha para o primeiro acesso';
    end if;
    insert into public.estagio_acessos (candidatura_id, login, senha_hash, updated_by)
    values (p_candidatura_id, v_login,
            extensions.crypt(p_senha, extensions.gen_salt('bf')),
            (select id from public.pessoas where auth_user_id = auth.uid() limit 1));
  else
    update public.estagio_acessos set
      login = v_login,
      senha_hash = case when p_senha is null then senha_hash
                        else extensions.crypt(p_senha, extensions.gen_salt('bf')) end,
      ativo = true,
      falhas = 0,
      bloqueado_ate = null,
      updated_by = (select id from public.pessoas where auth_user_id = auth.uid() limit 1),
      updated_at = now()
    where candidatura_id = p_candidatura_id;

    if p_senha is not null then
      update public.estagio_sessoes set revogado_em = now()
      where candidatura_id = p_candidatura_id and revogado_em is null;
    end if;
  end if;
end;
$$;

-- Desliga o acesso e desloga o celular.
create or replace function public.fn_estagio_acesso_desativar(p_candidatura_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_rls_admin_aprovado_ativo() then
    raise exception 'Apenas admin pode desativar o acesso';
  end if;
  update public.estagio_acessos set ativo = false, updated_at = now()
  where candidatura_id = p_candidatura_id;
  update public.estagio_sessoes set revogado_em = now()
  where candidatura_id = p_candidatura_id and revogado_em is null;
end;
$$;

-- Lista para a tela de cadastro (sem hash).
create or replace function public.fn_estagio_acessos_listar()
returns table (
  candidatura_id uuid,
  nome text,
  login text,
  ativo boolean,
  ultimo_login timestamptz,
  bloqueado_ate timestamptz,
  celulares_conectados bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fn_rls_admin_secretaria_ativo() then
    raise exception 'Sem permissão';
  end if;
  return query
  select c.id, c.nome, a.login, coalesce(a.ativo, false), a.ultimo_login,
         a.bloqueado_ate,
         (select count(*) from public.estagio_sessoes s
          where s.candidatura_id = c.id and s.revogado_em is null and s.expira_em > now())
  from public.candidaturas_estagio c
  left join public.estagio_acessos a on a.candidatura_id = c.id
  where c.status = 'aprovado' and c.ativo
  order by c.nome;
end;
$$;

-- Quiosque: recados que a estagiária escolhida ainda não leu.
create or replace function public.fn_estagio_recados_pendentes(p_candidatura_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fn_rls_admin_secretaria_ativo() then
    raise exception 'Sem permissão';
  end if;
  return public._estagio_recados_pendentes(p_candidatura_id);
end;
$$;

-- Painel: recados recentes com quem já leu.
create or replace function public.fn_estagio_recados_recentes(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fn_rls_admin_secretaria_ativo() then
    raise exception 'Sem permissão';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'texto', r.texto,
             'autor', c.nome,
             'created_at', r.created_at,
             'lido_por', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nome', split_part(c2.nome, ' ', 1), 'lido_em', l.lido_em)
                      order by l.lido_em)
               from public.estagio_recado_leituras l
               join public.candidaturas_estagio c2 on c2.id = l.candidatura_id
               where l.recado_id = r.id), '[]'::jsonb)
           ) order by r.created_at desc), '[]'::jsonb)
    from public.estagio_recados r
    join public.candidaturas_estagio c on c.id = r.candidatura_id
    where r.ativo and r.created_at > now() - make_interval(days => greatest(p_dias, 1))
  );
end;
$$;

revoke all on function public.fn_estagio_acesso_salvar(uuid, text, text) from public, anon;
revoke all on function public.fn_estagio_acesso_desativar(uuid) from public, anon;
revoke all on function public.fn_estagio_acessos_listar() from public, anon;
revoke all on function public.fn_estagio_recados_pendentes(uuid) from public, anon;
revoke all on function public.fn_estagio_recados_recentes(integer) from public, anon;
grant execute on function public.fn_estagio_acesso_salvar(uuid, text, text) to authenticated;
grant execute on function public.fn_estagio_acesso_desativar(uuid) to authenticated;
grant execute on function public.fn_estagio_acessos_listar() to authenticated;
grant execute on function public.fn_estagio_recados_pendentes(uuid) to authenticated;
grant execute on function public.fn_estagio_recados_recentes(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: upload da selfie pelo celular (anon), só no caminho reservado
-- ---------------------------------------------------------------------------
drop policy if exists "estagio-pontos celular insert" on storage.objects;
create policy "estagio-pontos celular insert"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'estagio-pontos'
    and name like 'celular/%'
    and public._estagio_foto_celular_pendente(name)
  );
