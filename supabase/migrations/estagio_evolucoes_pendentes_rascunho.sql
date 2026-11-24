-- Lista de evolucoes pendentes para a estagiaria (24/11/2026).
--
-- Tres mudancas pedidas pelo dono:
--  * mostra quando a evolucao foi ABERTA e deixada em rascunho. O rascunho
--    vive em evolucao_rascunhos e nunca contou para o bonus; faltava deixar
--    visivel que alguem comecou e nao terminou (havia 8 assim, a mais antiga
--    de 27/10);
--  * as vencidas passam a cobrir o MES inteiro, nao so os ultimos 7 dias;
--  * as comecadas aparecem primeiro na lista de vencidas: sao as mais
--    baratas de terminar.

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
              from relatorio_evolucao re where re.id_agendamento = a.id) as evo_em,
           (select max(r.atualizado_em at time zone 'America/Sao_Paulo')
              from evolucao_rascunhos r where r.agendamento_id = a.id) as rascunho_em
      from agendamentos a
      join tipo_servicos ts on ts.id = a.tipo_servico_id
      left join pessoas pp on pp.id = a.paciente_id
      left join pessoas pr on pr.id = a.profissional_id
     where a.ativo = true
       and a.paciente_id is not null
       and not (a.status_consulta_id = any (fn_status_sessao_nao_realizada()))
       and not (ts.nome ilike '%domiciliar%')
       and (a.data_hora at time zone 'UTC')::date between v_inicio and v_fim
  ),
  s as (
    select b.*,
           b.inicio <= v_agora as aconteceu,
           b.prazo <= v_agora as venceu,
           (b.evo_em is not null and b.evo_em <= b.prazo) as no_prazo
      from base b
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
            from s
           group by inicio::date
        ) d
    ), '[]'::jsonb),
    'no_prazo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional,
               'rascunho_em', p.rascunho_em
             ) order by p.prazo)
        from s p
       where p.aconteceu and not p.tem_evo and not p.venceu
    ), '[]'::jsonb),
    'vencidas_total', (
      select count(*) from s where aconteceu and not tem_evo and venceu
    ),
    'vencidas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'inicio', p.inicio, 'prazo', p.prazo,
               'grupo', p.grupo, 'paciente', p.paciente,
               'profissional', p.profissional,
               'rascunho_em', p.rascunho_em
             ) order by (p.rascunho_em is not null) desc, p.inicio desc)
        from (
          select * from s
           where aconteceu and not tem_evo and venceu
           order by (rascunho_em is not null) desc, inicio desc
           limit 60
        ) p
    ), '[]'::jsonb),
    'rascunhos_abertos', (
      select count(*) from s where aconteceu and not tem_evo and rascunho_em is not null
    ),
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
