# Financeiro Respira Kids — Modelo de 3 Carteiras (Especificação)

> Status (atualizado jun/2026): **Fases 1 e 2 + gross-up de imposto no cartão estão
> APLICADOS em produção**. Fase 3 com DDL aplicado (lógica de rateio pendente). Fases 0,
> 4 e 5 pendentes ou parciais — ver marcadores ✅/🟡/⚠️/⬜ por seção. Decisões fiscais a
> confirmar com a contadora: 🧾.

## 1. Visão geral

O financeiro **não** tem uma "receita única da Respira Kids". São **3 carteiras
(centros financeiros)**, cada uma com extrato e saldo próprios:

| Carteira          | É                                                 | Receita                                               | Despesas                                                                        |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 🟦 **BC FISIO**   | CNPJ Bruna (lucro presumido)                      | O que a BC fatura                                     | Impostos/contabilidade da BC (individual) + cota de custos comuns quando rateia |
| 🟪 **FS PACHECO** | CNPJ Flávia (Simples)                             | O que a FS fatura                                     | Impostos/contabilidade da FS (individual) + cota de custos comuns quando rateia |
| 🟩 **CLÍNICA**    | Caixa comum (conta Nubank, hoje sob o CNPJ da BC) | Margem dos comissionados + (futuro) venda de produtos | Custos compartilhados (secretária, limpeza…) quando há caixa                    |

Três modos de profissional:

- **Sócia** (Bruna/Flávia): 100% fica na carteira da própria empresa.
- **Comissionado** (ex. Beatriz): a empresa que faturou paga comissão + imposto; a **margem** vai para a Clínica.
- **Repasse integral** (sem comissão): recebe tudo; margem da Clínica = 0.

Tipos de movimento: **receita** (entra), **despesa** (sai) e **transferência**
(entre carteiras — não é receita nem despesa; ex.: margem da empresa → Clínica).

### Fórmula da margem (por atendimento, só quando PAGO) — ✅ no ar

```
margem p/ Clínica = valor_servico − comissão − ( valor_servico × Σ alíquotas base='bruto' )
                    └ líquido ┘    └ já existe ┘   └ imposto sobre o LÍQUIDO ┘
```

- `valor_servico` (líquido/receita) e `valor_total` (bruto cobrado) já existem em `faturas`
  (ver memória `faturas-valor-servico`). No PIX, `valor_servico = valor_total`.
- A margem só é gerada quando o atendimento está **pago**; **estorna** se cancelar depois.
- **Imposto sobre o LÍQUIDO** (não o bruto): no cartão o cliente paga o imposto do
  acréscimo (gross-up, ver §1.1), que vira _passthrough_ — entra e sai do caixa. Então só
  o imposto do serviço onera a Clínica, e a margem do cartão fica **neutra vs. PIX**.
  Implementado em `fn_processar_margens_fatura`, com a alíquota **real** de cada empresa
  via `fn_aliquota_imposto_bruto` (filtra `base='bruto'`).

### 1.1 Gross-up de imposto no cartão (preço ao cliente) — ✅ FEITO

No cartão, além da taxa do Asaas, o cliente paga o **imposto sobre o acréscimo** (a
NFS-e sai sobre o bruto). Fórmula em `payment-fees.ts`:
`bruto = (valor_servico × (1 − i) + tarifa_fixa) / (1 − taxa_asaas − i)`. Resultado: a
clínica recebe o líquido após Asaas **e** imposto = `valor_servico` (neutra vs. PIX).

- **Preço uniforme entre CNPJs**: `i` = a **MAIOR** alíquota `base='bruto'` entre as
  empresas ativas (`fn_aliquota_imposto_repasse`), pra o cliente não ver % diferente nas
  cobranças separadas das 2 empresas (16% dos pacientes são atendidos pelas duas; as
  taxas Asaas já são iguais). Congelada no `taxas_snapshot` do link na criação.
- A empresa de **menor** imposto cobra a maior e fica com pequeno excedente (a favor da
  clínica). Nunca usar a menor/média (reintroduz vazamento de imposto).
- **PIX não tem imposto** (sem acréscimo).

---

## 2. Fase 0 — Segurança (⚠️ REVISAR) — pré-requisito

> Status (jun/2026): a policy `pessoa_empresas_anon_crud` **não está mais presente** no
> banco (verificado), mas `get_empresas_publicas` **não existe** e o token segue lido no
> client. **Reauditar** antes de considerar resolvido — passos 3–4 abaixo pendentes.

### Problema (confirmado originalmente)

`pessoa_empresas` tinha a policy `pessoa_empresas_anon_crud` (`anon`, `ALL`, `using true`).
A role `anon` é a chave pública embutida no frontend → **qualquer um lia (e escrevia) a
tabela inteira, incluindo `api_token_externo`** = chaves ASAAS de produção das 2 empresas.
Confirmado à época com `SET ROLE anon` (2 empresas + 2 tokens visíveis).

### Quem usa o quê (levantado no código)

- **Token** → `confirm-payment-link` (edge, service_role ✅), `determineApiKeyFromEmpresa`
  (frontend autenticado — lê e repassa no body das edges ⚠️), `integrations-api` (admin, só preview/escrita).
- **Campos públicos** (sem token) → agenda compartilhada (`shared-schedule-api`, fluxo público):
  só `id, razao_social, nome_fantasia, cnpj, ativo`.
- Fluxos públicos de pagamento/cadastro usam RPC `SECURITY DEFINER` / edges (service_role),
  **não** dependem da policy `anon`.

### Correção (sequência segura, sem derrubar pagamentos)

1. ✅/❓ **RPC pública de campos não-sensíveis**: `get_empresas_publicas()` `SECURITY DEFINER`
   retornando só `{id, razao_social, nome_fantasia, cnpj, ativo}`. **Não encontrada no banco
   — confirmar como a agenda compartilhada lê hoje.**
2. ✅ **Remover a policy `anon`** de `pessoa_empresas` — a policy `pessoa_empresas_anon_crud`
   não está mais presente (verificado jun/2026).
3. ⬜ **Tirar o token do client** (médio prazo): as edges resolvem o token por `empresaId`
   internamente (service_role); o frontend para de ler/repassar `api_token_externo`. Depois,
   `REVOKE SELECT (api_token_externo)` de `authenticated`. Opção mais forte: mover o token
   para a tabela `api_keys` (já existe, vazia) ou coluna em schema protegido.
4. ⬜ **Rotacionar as 2 chaves ASAAS** (assumir comprometidas) após o passo 3.

---

## 3. Fase 1 — Cadastros — ✅ APLICADO (DDL no banco)

> No ar: `centros_financeiros` (BC e FS = `empresa`, Clínica Respira Kids = `comum`),
> `tributos_empresa` (com dados estimados: BC 13,33% / FS 8,5%), `pessoas.modo_financeiro`.
> UI em `TributosEmpresaManager` (aba Tributos). DDL abaixo = referência do que existe.

### 3.1 Carteiras

```sql
create table public.centros_financeiros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                         -- 'BC FISIO' | 'F.S PACHECO' | 'Clínica Respira Kids'
  tipo text not null check (tipo in ('empresa','comum')),
  empresa_id uuid references public.pessoa_empresas(id),       -- preenchido p/ tipo='empresa'
  conta_bancaria_id uuid references public.contas_bancarias(id), -- conta principal (Nubank p/ Clínica)
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- seed: BC (empresa), FS (empresa), Clínica (comum + conta Nubank a cadastrar)
```

### 3.2 Tributos por empresa (com vigência — cadastro manual)

```sql
create table public.tributos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.pessoa_empresas(id),
  tipo_tributo text not null,            -- 'ISS','INSS','PIS','COFINS','IRPJ','CSLL','DAS','OUTRO'
  aliquota_percent numeric(6,3) not null,-- ex.: 8.510
  base text not null default 'bruto' check (base in ('bruto','liquido')),
  vigencia_inicio date not null,
  vigencia_fim date,                     -- null = vigente
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz default now()
);
```

- **FS (Simples)** 🧾: 1 registro `DAS` com a **alíquota efetiva** atual (hoje ≈ 8,5% se Anexo III).
- **BC (presumido)** 🧾: registros discriminados (ISS 2%, PIS 0,65%, COFINS 3%, IRPJ 4,8%, CSLL 2,88% = 13,33%) ou um efetivo (~14–16%).
- Alíquota total vigente `base='bruto'` = soma das ativas na data. Duas leituras:
  `fn_aliquota_imposto_bruto(empresa, data)` (real, p/ a margem) e
  `fn_aliquota_imposto_repasse(data)` (a maior, p/ o preço do cartão — ver §1.1).
- **RBT12 automático** (⬜ pendente): calcular a receita bruta dos últimos 12 meses por
  empresa e **alertar** quando a FS se aproxima de mudar de faixa → sinal de revisar a
  alíquota. Não replicar a tabela do Simples no app (fator R / Anexo III×V / sublimites
  mudam muito); usar alíquota efetiva + **reconciliação** no fechamento.

### 3.3 Modo do profissional — ✅ aplicado

```sql
alter table public.pessoas
  add column modo_financeiro text
  check (modo_financeiro in ('socia','comissionado','repasse_integral'));
```

- Comissão já existe em `comissao_profissional` (`tipo_recebimento` fixo/percentual, por profissional × serviço).

---

## 4. Fase 2 — Motor de margem — ✅ APLICADO

> No ar: `fn_processar_margens_fatura` (trigger `faturas_margens_aiu`), tabela
> `margens_atendimento` (~1460 linhas), views `vw_caixa_clinica_resumo` /
> `vw_margens_clinica`, UI `CaixaClinicaPanel` + `ResumoCarteiras` (aba Carteiras). O
> imposto incide sobre o LÍQUIDO (ver §1). `aliquota_aplicada` = estimativa → reconciliar
> (Fase 4). DDL abaixo = referência.

Tabela de rastreabilidade (permite estorno e auditoria):

```sql
create table public.margens_atendimento (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id),
  fatura_id uuid references public.faturas(id),
  empresa_id uuid not null references public.pessoa_empresas(id),       -- quem faturou
  centro_destino_id uuid not null references public.centros_financeiros(id), -- Clínica
  valor_bruto numeric(15,2) not null,    -- valor_total (referência/auditoria)
  valor_servico numeric(15,2) not null,  -- líquido (receita) = base do imposto da margem
  comissao numeric(15,2) not null default 0,
  imposto numeric(15,2) not null default 0,
  aliquota_aplicada numeric(6,3),        -- snapshot
  margem numeric(15,2) not null,         -- valor_servico - comissao - imposto
  status text not null default 'provisorio'
    check (status in ('provisorio','confirmado','estornado')),
  gerado_em timestamptz default now(),
  estornado_em timestamptz
);
```

- **Gatilho**: agendamento de comissionado passa a `pago` (ou fatura paga) → cria a linha.
- **Estorno**: cancelado/estornado → `status='estornado'` (sai do caixa da Clínica).
- Saldo de margem da Clínica = Σ `margem` não-estornada. `aliquota_aplicada` = estimativa;
  reconciliação mensal ajusta contra o imposto real pago.

---

## 5. Fase 3 — Custos individual × compartilhado — 🟡 DDL aplicado, lógica pendente

> As colunas `natureza_custo` e `centro_financeiro_id` **já existem** em
> `lancamentos_financeiros`. Falta a **regra Clínica-paga/rateia** (lógica de app).

```sql
alter table public.lancamentos_financeiros
  add column natureza_custo text check (natureza_custo in ('individual','compartilhado')),
  add column centro_financeiro_id uuid references public.centros_financeiros(id);
```

- **Individual** (imposto, contabilidade): `centro = empresa` específica.
- **Compartilhado** (secretária, limpeza): no pagamento, regra **Clínica paga / senão rateia**:
  - saldo Clínica ≥ valor → debita a Clínica;
  - saldo Clínica < valor → rateia 50/50 entre BC e FS (gera 2 lançamentos ou transferências
    das sócias → Clínica). O sistema **sugere** com base no saldo; a pessoa confirma.

---

## 6. Fase 4 — Extrato/Dashboard por carteira + reconciliação — 🟡 PARCIAL

> Já existe a aba **Carteiras** (`ResumoCarteiras` + `CaixaClinicaPanel`). Falta o filtro
> consolidado no dashboard principal e a **reconciliação** imposto estimado × real.

- **Filtro por carteira** (Consolidado / BC / FS / Clínica) no dashboard → entrega o controle
  individual por empresa **e** o caixa da Clínica num seletor (sem logins separados).
- **Extrato por carteira**: receitas (faturas/margens) − despesas − transferências.
- **Reconciliação mensal de imposto**: comparar imposto estimado (Σ `margens_atendimento.imposto`
  do mês) com o imposto real pago (lançamento do DAS/guias) → lançar a diferença na carteira.
- Resolve a divergência de receita atual (Dashboard usava `agendamentos` pagos, que diverge das
  faturas): receita passa a ser medida no líquido, por carteira.

---

## 7. Pendências para a contadora 🧾

1. **Alíquota efetiva atual** de cada empresa (BC presumido; FS Simples) e quais tributos discriminar. _Hoje cadastradas como ESTIMADO: BC 13,33% / FS 8,5%._
2. **FS (Simples)**: Anexo III ou V (fator R)? Muda ~8,5% → ~14,2%. RBT12 ≈ R$ 348 mil (perto dos R$ 360 mil da faixa seguinte).
3. **Repasse integral**: o profissional recebe 100% do bruto ou 100% − imposto (a empresa absorve o imposto)?
4. **Venda de produtos** (mordedores/espaçadores): tributação de mercadoria (não serviço) — definir antes da Fase 5.
5. **Comissão percentual**: incide sobre o bruto ou sobre o líquido de imposto? (a fixa não é afetada).

## 8. Roadmap

- ⚠️ **Fase 0** — Segurança do token: policy `anon` removida; **reauditar** (RPC pública, tirar token do client, rotacionar chaves).
- ✅ **Fase 1** — Cadastros: carteiras, tributos por empresa, modo do profissional. **No ar.**
- ✅ **Fase 2** — Motor de margem (pago + estorno) + gross-up de imposto no cartão. **No ar.**
- 🟡 **Fase 3** — Custos individual/compartilhado: DDL aplicado; falta a regra Clínica-paga/rateia.
- 🟡 **Fase 4** — Extrato/dashboard por carteira (aba Carteiras feita) + reconciliação (pendente).
- ⬜ **Fase 5** — Venda de produtos como receita da Clínica.
