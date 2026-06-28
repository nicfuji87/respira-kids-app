-- Imposto no gross-up do cartão + margem sobre o líquido
-- ============================================================
-- Contexto: no cartão, as taxas do Asaas já são repassadas ao cliente (gross-up em
-- src/lib/payment-fees.ts). Como a NFS-e é emitida sobre o BRUTO (valor_total), o
-- acréscimo gera imposto que a clínica vinha absorvendo. Agora o cliente também paga
-- esse imposto (gross-up combinado), deixando a clínica neutra vs. PIX.
--
-- As MESMAS alíquotas alimentam dois lugares (precisam ser consistentes):
--   1) gross-up do checkout (cobra o imposto do acréscimo do cliente);
--   2) margem do Caixa da Clínica (fn_processar_margens_fatura).
-- Esta migration cria a fonte única (fn_aliquota_imposto_bruto) e corrige a margem
-- para descontar imposto sobre o LÍQUIDO (o do acréscimo virou passthrough do cliente).

-- 1) Fonte única da alíquota: soma dos tributos base='bruto' vigentes da empresa.
--    base='liquido' NÃO entra (não muda com o acréscimo do cartão). SECURITY DEFINER
--    para o checkout (authenticated) chamar via RPC; a margem chama internamente.
create or replace function public.fn_aliquota_imposto_bruto(
  p_empresa_id uuid,
  p_data date default current_date
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(aliquota_percent), 0)::numeric
  from public.tributos_empresa
  where empresa_id = p_empresa_id
    and ativo
    and base = 'bruto'
    and p_data between vigencia_inicio and coalesce(vigencia_fim, '9999-12-31');
$$;

grant execute on function public.fn_aliquota_imposto_bruto(uuid, date) to authenticated;

-- 2) Margem: imposto passa a incidir sobre o LÍQUIDO (valor_servico), não o bruto.
--    Motivo: com o gross-up, o cliente paga o imposto do acréscimo (entra e sai do
--    caixa = passthrough); a Clínica só arca com o imposto do serviço. PIX não muda
--    (bruto = líquido). Usa a fonte única acima (filtra base='bruto'). NÃO reprocessa
--    as margens já gravadas — vale para novas execuções do trigger (daqui pra frente).
create or replace function public.fn_processar_margens_fatura(p_fatura_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fatura record;
  v_clinica_id uuid;
  v_acrescimo numeric;
  v_count integer := 0;
  r record;
begin
  select id, valor_total, valor_servico, status into v_fatura from public.faturas where id = p_fatura_id;
  if not found or v_fatura.status <> 'pago' then return 0; end if;

  select id into v_clinica_id from public.centros_financeiros where tipo = 'comum' and ativo limit 1;
  v_acrescimo := greatest(coalesce(v_fatura.valor_total,0) - coalesce(v_fatura.valor_servico, v_fatura.valor_total), 0);

  for r in
    select a.id as agend_id, a.valor_servico, a.empresa_fatura, a.tipo_servico_id, a.profissional_id
    from public.agendamentos a
    join public.pessoas p on p.id = a.profissional_id and p.modo_financeiro = 'comissionado'
    where a.fatura_id = p_fatura_id and a.empresa_fatura is not null and coalesce(a.valor_servico,0) > 0
  loop
    declare
      v_comissao numeric := 0; v_aliquota numeric := 0;
      v_base_bruto numeric; v_imposto numeric; v_margem numeric; v_cp record;
    begin
      select tipo_recebimento, valor_fixo, valor_percentual into v_cp
      from public.comissao_profissional
      where id_profissional = r.profissional_id and id_servico = r.tipo_servico_id and ativo limit 1;
      if found then
        if v_cp.tipo_recebimento = 'fixo' then v_comissao := coalesce(v_cp.valor_fixo,0);
        elsif v_cp.tipo_recebimento = 'percentual' then v_comissao := r.valor_servico * coalesce(v_cp.valor_percentual,0)/100; end if;
      end if;

      -- Alíquota de imposto sobre o bruto (base='bruto', vigente). Fonte única,
      -- a mesma do gross-up do cartão (consistência checkout x margem).
      v_aliquota := public.fn_aliquota_imposto_bruto(r.empresa_fatura, current_date);

      -- valor_bruto: referência (serviço + acréscimo rateado) para auditoria/NFS-e.
      v_base_bruto := r.valor_servico + case when coalesce(v_fatura.valor_servico,0) > 0
                        then v_acrescimo * (r.valor_servico / v_fatura.valor_servico) else 0 end;

      -- Imposto que ONERA a Clínica = sobre o LÍQUIDO (valor_servico). O imposto do
      -- acréscimo do cartão já foi pago pelo cliente (gross-up); no PIX não há acréscimo.
      v_imposto := round(r.valor_servico * v_aliquota / 100, 2);
      v_margem  := round(r.valor_servico - v_comissao - v_imposto, 2);

      insert into public.margens_atendimento (
        agendamento_id, fatura_id, empresa_id, centro_destino_id,
        valor_bruto, valor_servico, comissao, imposto, aliquota_aplicada, margem, status
      ) values (
        r.agend_id, p_fatura_id, r.empresa_fatura, v_clinica_id,
        round(v_base_bruto,2), r.valor_servico, round(v_comissao,2), v_imposto, v_aliquota, v_margem, 'provisorio'
      )
      on conflict (agendamento_id) do update set
        fatura_id = excluded.fatura_id, empresa_id = excluded.empresa_id,
        valor_bruto = excluded.valor_bruto, valor_servico = excluded.valor_servico,
        comissao = excluded.comissao, imposto = excluded.imposto,
        aliquota_aplicada = excluded.aliquota_aplicada, margem = excluded.margem,
        atualizado_em = now()
      where public.margens_atendimento.status <> 'estornado';
      v_count := v_count + 1;
    end;
  end loop;
  return v_count;
end; $function$;
