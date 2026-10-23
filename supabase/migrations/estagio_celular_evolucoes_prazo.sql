-- AI dev note: Progresso das evoluções no celular da estagiária (#/ponto) +
-- regra de prazo única para toda a clínica.
--
-- PRAZO DA EVOLUÇÃO (decisão do dono, 23/10/2026): 24h depois do início da
-- sessão; sessão de sábado ou domingo vence segunda às 23h59. Antes cada função
-- tinha a sua conta: o bônus das estagiárias já usava a regra do fim de semana,
-- mas as metas da clínica ("Evoluções em até 24h" / "Sessões com evolução")
-- usavam 24h corridas. Agora todas usam fn_evolucao_prazo.
-- Horários em "hora de parede" (data_hora AT TIME ZONE 'UTC', ver
-- agenda-fuso-wall-clock).

create or replace function public.fn_evolucao_prazo(p_inicio timestamp)
returns timestamp
language sql
immutable
set search_path = public
as $$
  select case
    when extract(isodow from p_inicio) in (6, 7) then
      (p_inicio::date + (8 - extract(isodow from p_inicio))::int)
        + interval '23 hours 59 minutes 59 seconds'
    else p_inicio + interval '24 hours'
  end;
$$;

grant execute on function public.fn_evolucao_prazo(timestamp) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Metas da clínica: mesma regra de prazo. Só entram sessões cujo prazo já
-- venceu (antes: "até ontem" = início há mais de 24h, o que contava sábado
-- como perdida no domingo).
-- ---------------------------------------------------------------------------
create or replace function public.fn_calcular_evolucoes_24h(
  p_pessoa_id uuid, p_inicio date, p_fim date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select a.id,
           public.fn_evolucao_prazo(a.data_hora at time zone 'UTC') as prazo
    from agendamentos a
    where a.ativo = true
      and a.paciente_id is not null
      and not (a.status_consulta_id = any (fn_status_sessao_nao_realizada()))
      and (a.data_hora at time zone 'UTC')::date between p_inicio and p_fim
      and (p_pessoa_id is null or a.profissional_id = p_pessoa_id)
  ), v as (
    select s.id,
           exists (
             select 1 from relatorio_evolucao re
             where re.id_agendamento = s.id
               and (re.created_at at time zone 'America/Sao_Paulo') <= s.prazo
           ) as no_prazo
    from s
    where s.prazo <= fn_agora_parede()
  )
  select case when count(*) = 0 then 0
              else round(100.0 * count(*) filter (where no_prazo) / count(*), 1) end
  from v;
$$;

create or replace function public.fn_calcular_evolucoes_cobertura(
  p_pessoa_id uuid, p_inicio date, p_fim date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select a.id,
           exists (select 1 from relatorio_evolucao re where re.id_agendamento = a.id) as tem
    from agendamentos a
    where a.ativo = true
      and a.paciente_id is not null
      and not (a.status_consulta_id = any (fn_status_sessao_nao_realizada()))
      and (a.data_hora at time zone 'UTC')::date between p_inicio and p_fim
      and public.fn_evolucao_prazo(a.data_hora at time zone 'UTC') <= fn_agora_parede()
      and (p_pessoa_id is null or a.profissional_id = p_pessoa_id)
  )
  select case when count(*) = 0 then 0
              else round(100.0 * count(*) filter (where tem) / count(*), 1) end
  from s;
$$;

-- ---------------------------------------------------------------------------
-- Celular da estagiária: calendário do mês + o que falta evoluir + bônus.
-- Mesmo universo do bônus (fn_estagio_bonus_evolucoes): sessões da clínica
-- não canceladas/faltas, domiciliar fora. A meta é da dupla, então as duas
-- veem a clínica inteira.
-- ---------------------------------------------------------------------------
create or replace function public.fn_estagio_celular_evolucoes(
  p_token text, p_mes date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_bonus_base constant numeric := 100;
  c_desconto   constant numeric := 5;
  v_cid    uuid;
  v_agora  timestamp := fn_agora_parede();
  v_inicio date;
  v_fim    date;
  v_result jsonb;
begin
  v_cid := public._estagio_sessao_cid(p_token);
  if v_cid is null then
    return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA');
  end if;

  v_inicio := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim := (v_inicio + interval '1 month - 1 day')::date;

  with base as (
    select a.id,
           (a.data_hora at time zone 'UTC') as inicio,
           public.fn_evolucao_prazo(a.data_hora at time zone 'UTC') as prazo,
           case
             when ts.nome ilike '%avalia%' then 'Avaliação'
             when ts.nome ilike '%respirat%' or ts.nome ilike '%aspira%' then 'Respiratória'
             when ts.nome ilike '%motora%' then 'Motora'
             else ts.nome
           end as grupo,
           split_part(coalesce(pp.nome, ''), ' ', 1) as paciente,
           split_part(coalesce(pr.nome, ''), ' ', 1) as profissional,
           exists (select 1 from relatorio_evolucao re where re.id_agendamento = a.id) as tem_evo,
           (select min(re.created_at at time zone 'America/Sao_Paulo')
              from relatorio_evolucao re where re.id_agendamento = a.id) as evo_em
      from agendamentos a
      join tipo_servicos ts on ts.id = a.tipo_servico_id
      left join pessoas pp on pp.id = a.paciente_id
      left join pessoas pr on pr.id = a.profissional_id
     where a.ativo = true
       and a.paciente_id is not null
       and not (a.status_consulta_id = any (fn_status_sessao_nao_realizada()))
       and not (ts.nome ilike '%domiciliar%')
       and (a.data_hora at time zone 'UTC')::date
           between least(v_inicio, v_agora::date - 7) and v_fim
  ),
  s as (
    select b.*,
           b.inicio <= v_agora as aconteceu,
           b.prazo <= v_agora as venceu,
           (b.evo_em is not null and b.evo_em <= b.prazo) as no_prazo
      from base b
  ),
  mes as (
    select * from s where inicio::date between v_inicio and v_fim
  )
  select jsonb_build_object(
    'ok', true,
    'mes', to_char(v_inicio, 'YYYY-MM'),
    'hoje', v_agora::date,
    'agora', v_agora,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', d.dia,
               'sessoes', d.sessoes,
               'realizadas', d.realizadas,
               'evoluidas', d.evoluidas,
               'faltam', d.faltam,
               'perdidas', d.perdidas
             ) order by d.dia)
        from (
          select inicio::date as dia,
                 count(*) as sessoes,
                 count(*) filter (where aconteceu) as realizadas,
                 count(*) filter (where tem_evo) as evoluidas,
                 count(*) filter (where aconteceu and not tem_evo) as faltam,
                 count(*) filter (where venceu and not no_prazo) as perdidas
            from mes
           group by inicio::date
        ) d
    ), '[]'::jsonb),
    -- No prazo: todas (é o que ainda salva o bônus).
    'no_prazo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional
             ) order by p.prazo)
        from s p
       where p.aconteceu and not p.tem_evo and not p.venceu
    ), '[]'::jsonb),
    -- Vencidas sem evolução nos últimos 7 dias: o bônus já foi, mas o
    -- prontuário ainda precisa ser feito. Mais recentes primeiro.
    'vencidas_total', (
      select count(*) from s
       where aconteceu and not tem_evo and venceu
         and inicio >= v_agora - interval '7 days'
    ),
    'vencidas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional
             ) order by p.inicio desc)
        from (
          select * from s
           where aconteceu and not tem_evo and venceu
             and inicio >= v_agora - interval '7 days'
           order by inicio desc
           limit 30
        ) p
    ), '[]'::jsonb),
    'bonus', (
      select jsonb_build_object(
               'base', c_bonus_base,
               'desconto', c_desconto,
               'perdidas', count(*) filter (where venceu and not no_prazo),
               'contadas', count(*) filter (where venceu),
               'valor', greatest(0, c_bonus_base
                         - c_desconto * count(*) filter (where venceu and not no_prazo)))
        from mes
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.fn_estagio_celular_evolucoes(text, date) from public;
grant execute on function public.fn_estagio_celular_evolucoes(text, date) to anon, authenticated;
