-- Progresso das evoluções com uma fonte só (07/11/2026).
--
-- Antes, a tela da estagiária (fn_estagio_celular_evolucoes) calculava o
-- próprio bônus com base fixa de R$ 100 contando motora: mostraria R$ 0 em
-- novembro enquanto o card das reuniões e a aba Pagamento do admin mostram
-- R$ 45. Agora as três telas leem fn_estagio_evolucoes_dados, que tira o
-- bônus de fn_estagio_bonus_evolucoes.
--
-- O calendário e as listas seguem mostrando TODAS as sessões, inclusive as
-- motoras: evoluir é obrigação de prontuário mesmo quando não conta no bônus.
-- bonus.motora_fora avisa a tela disso.

CREATE OR REPLACE FUNCTION public.fn_estagio_celular_evolucoes(p_token text, p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cid uuid;
begin
  v_cid := public._estagio_sessao_cid(p_token);
  if v_cid is null then
    return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA');
  end if;

  return jsonb_build_object('ok', true) || fn_estagio_evolucoes_dados(p_mes);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_estagio_evolucoes_dados(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_agora  timestamp := fn_agora_parede();
  v_inicio date;
  v_fim    date;
  v_bonus  jsonb;
  v_result jsonb;
begin
  v_inicio := date_trunc('month', coalesce(p_mes, v_agora::date))::date;
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  v_bonus := fn_estagio_bonus_evolucoes(v_inicio);

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
    'no_prazo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional
             ) order by p.prazo)
        from s p
       where p.aconteceu and not p.tem_evo and not p.venceu
    ), '[]'::jsonb),
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
    'bonus', jsonb_build_object(
      'base', (v_bonus ->> 'bonus_base')::numeric,
      'base_cheia', (v_bonus ->> 'bonus_base_cheio')::numeric,
      'proporcional', (v_bonus ->> 'proporcional')::boolean,
      'desconto', (v_bonus ->> 'desconto_por_perdida')::numeric,
      'perdidas', (v_bonus ->> 'perdidas')::int,
      'contadas', (v_bonus ->> 'contadas')::int,
      'valor', (v_bonus ->> 'bonus')::numeric,
      'motora_fora', NOT coalesce((v_bonus ->> 'conta_motora')::boolean, false),
      'motora_desde', v_bonus ->> 'motora_desde'
    )
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_estagio_evolucoes_progresso(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not fn_rls_admin_secretaria_ativo() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  return fn_estagio_evolucoes_dados(p_mes);
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.fn_estagio_evolucoes_progresso(date) TO authenticated;
