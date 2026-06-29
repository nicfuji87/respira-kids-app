-- Caixa da Clínica: saldo real (saldo inicial + data de corte)
-- ============================================================
-- O Caixa da Clínica exibia Σ de todas as margens (resultado histórico), não o
-- dinheiro em conta. Passa a ter um SALDO REAL = saldo inicial da conta Nubank (caixa
-- comum, CNPJ da BC) numa data de corte + movimentos reais (lançamentos pagos no centro
-- Clínica) após o corte. A margem vira indicador de "resultado gerado (a conciliar)".
-- Ver CaixaClinicaPanel. Os 636 lançamentos antigos do centro Clínica (competência até
-- jan/2026) já estão refletidos no saldo inicial — por isso o cálculo só conta o que
-- tem data_competencia > data_saldo_inicial.

-- 1) Data de corte do saldo inicial
alter table public.contas_bancarias
  add column if not exists data_saldo_inicial date;
comment on column public.contas_bancarias.data_saldo_inicial is
  'Data de corte: o saldo_inicial vale a partir desta data; lançamentos anteriores já estão refletidos nele.';

-- 2) Conta Nubank da Clínica + vínculo ao centro comum (idempotente)
do $$
declare
  v_centro uuid;
  v_conta uuid;
  v_pessoa uuid;
begin
  select id, conta_bancaria_id into v_centro, v_conta
  from public.centros_financeiros where tipo = 'comum' limit 1;

  if v_centro is not null and v_conta is null then
    -- titular no CNPJ da BC (mesma pessoa da conta ASAAS existente), mas é o caixa comum
    select pessoa_id into v_pessoa from public.contas_bancarias order by created_at limit 1;

    -- agencia/conta/digito são NOT NULL; placeholders (a completar pelo form, não
    -- afetam o saldo).
    insert into public.contas_bancarias
      (pessoa_id, tipo_conta, banco_codigo, banco_nome, agencia, conta, digito,
       titular, saldo_inicial, data_saldo_inicial, ativo, observacoes)
    values
      (v_pessoa, 'corrente', '260', 'NU PAGAMENTOS S.A.', '0001', '0000000', '0',
       'Clínica Respira Kids (Nubank/CNPJ BC)', 55543.46, '2026-06-29', true,
       'Caixa comum da Clínica. Ag/conta a completar. Saldo inicial informado pelo dono em 29/06/2026.')
    returning id into v_conta;

    update public.centros_financeiros
    set conta_bancaria_id = v_conta, updated_at = now()
    where id = v_centro;
  end if;
end $$;
