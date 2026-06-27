-- AI dev note: separa o valor do SERVIÇO (líquido = receita/comissão) do valor_total
-- (BRUTO cobrado = serviço + acréscimo de cartão repassado ao cliente). O valor_total
-- continua sendo a base da NFS-e e da conciliação/caixa. O acréscimo é derivado
-- (valor_total - valor_servico). PIX e faturas legadas: serviço = total (acréscimo 0).
-- Só o fluxo de link público de pagamento tem repasse real (gross-up das taxas).

ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS valor_servico numeric;

COMMENT ON COLUMN public.faturas.valor_servico IS
  'Valor do serviço (líquido) = receita. valor_total é o bruto cobrado (NFS-e/caixa); acréscimo de cartão = valor_total - valor_servico.';

-- Backfill: só o fluxo de link (carrega pagamento_link_id + valor_base) tem acréscimo
-- real; todo o resto recebe serviço = total para não criar acréscimo fantasma em
-- dados legados onde dados_asaas/valores são inconsistentes.
UPDATE public.faturas f
SET valor_servico = CASE
  WHEN (f.dados_asaas->>'pagamento_link_id') IS NOT NULL
       AND NULLIF(f.dados_asaas->>'valor_base', '') IS NOT NULL
    THEN LEAST((f.dados_asaas->>'valor_base')::numeric, f.valor_total)
  ELSE f.valor_total
END
WHERE f.valor_servico IS NULL;

-- Expõe valor_servico na view usada pela listagem de faturas (append no fim:
-- CREATE OR REPLACE VIEW só permite adicionar colunas ao final).
CREATE OR REPLACE VIEW public.vw_faturas_completas AS
 SELECT f.id,
    f.id_asaas,
    f.valor_total,
    f.descricao,
    f.status,
    f.vencimento,
    f.criado_em,
    f.pago_em,
    f.dados_asaas,
    f.observacoes,
    f.link_nfe,
    f.status_nfe,
    f.ativo,
    f.created_at,
    f.updated_at,
    f.paciente_id,
    pac.nome AS paciente_nome,
    pe.id AS empresa_id,
    pe.razao_social AS empresa_razao_social,
    pe.nome_fantasia AS empresa_nome_fantasia,
    pr.id AS responsavel_id,
    pr.nome AS responsavel_nome,
    pr.cpf_cnpj AS responsavel_cpf,
    pr.email AS responsavel_email,
    pc.nome AS criador_nome,
    ( SELECT count(*) AS count
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS qtd_consultas,
    ( SELECT min(a.data_hora) AS min
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS periodo_inicio,
    ( SELECT max(a.data_hora) AS max
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS periodo_fim,
    ( SELECT array_agg(a.data_hora ORDER BY a.data_hora) AS array_agg
           FROM agendamentos a
          WHERE a.fatura_id = f.id AND a.ativo = true) AS datas_consultas,
    ARRAY( SELECT DISTINCT p.nome
           FROM agendamentos a
             JOIN pessoas p ON p.id = a.paciente_id
          WHERE a.fatura_id = f.id AND a.ativo = true
          ORDER BY p.nome) AS pacientes_atendidos,
    ARRAY( SELECT DISTINCT p.nome
           FROM agendamentos a
             JOIN pessoas p ON p.id = a.profissional_id
          WHERE a.fatura_id = f.id AND a.ativo = true
          ORDER BY p.nome) AS profissionais_envolvidos,
    f.valor_servico
   FROM faturas f
     LEFT JOIN pessoa_empresas pe ON pe.id = f.empresa_id
     LEFT JOIN pessoas pr ON pr.id = f.responsavel_cobranca_id
     LEFT JOIN pessoas pac ON pac.id = f.paciente_id
     LEFT JOIN pessoas pc ON pc.id = f.criado_por
  WHERE f.ativo = true;
