# Financeiro Respira Kids — Modelo de 3 Carteiras (Especificação)

> Status: **proposta para validação** (não aplicada em produção). Decisões fiscais
> a confirmar com a contadora estão marcadas com 🧾. Junho/2026.

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

### Fórmula da margem (por atendimento, só quando PAGO)

```
margem p/ Clínica = valor_servico − comissão − ( valor_total × Σ alíquotas da empresa )
                    └ líquido ┘    └ já existe ┘   └ bruto (base da NFS-e) ┘
```

- `valor_servico` (líquido/receita) e `valor_total` (bruto cobrado) já existem em `faturas`
  (ver `docs`/memória `faturas-valor-servico`). No PIX, `valor_servico = valor_total`.
- A margem só é gerada quando o atendimento está **pago**; **estorna** se cancelar depois.
- No cartão, o cliente paga o acréscimo (juros) → cobre a taxa ASAAS → empresa recebe
  ≈ `valor_servico`; o imposto incide sobre o `valor_total` (bruto), então a margem do
  cartão é um pouco menor que a do PIX. Comportamento correto e automático.

---

## 2. Fase 0 — Segurança (🔴 urgente, pré-requisito)

### Problema (confirmado)

`pessoa_empresas` tem a policy `pessoa_empresas_anon_crud` (`anon`, `ALL`, `using true`).
A role `anon` é a chave pública embutida no frontend → **qualquer um lê (e escreve) a
tabela inteira, incluindo `api_token_externo`** = chaves ASAAS de produção das 2 empresas.
Confirmado com `SET ROLE anon` (2 empresas + 2 tokens visíveis).

### Quem usa o quê (levantado no código)

- **Token** → `confirm-payment-link` (edge, service_role ✅), `determineApiKeyFromEmpresa`
  (frontend autenticado — lê e repassa no body das edges ⚠️), `integrations-api` (admin, só preview/escrita).
- **Campos públicos** (sem token) → agenda compartilhada (`shared-schedule-api`, fluxo público):
  só `id, razao_social, nome_fantasia, cnpj, ativo`.
- Fluxos públicos de pagamento/cadastro usam RPC `SECURITY DEFINER` / edges (service_role),
  **não** dependem da policy `anon`.

### Correção (sequência segura, sem derrubar pagamentos)

1. **RPC pública de campos não-sensíveis**: `get_empresas_publicas()` `SECURITY DEFINER`
   retornando só `{id, razao_social, nome_fantasia, cnpj, ativo}`. Migrar `shared-schedule-api`
   para ela.
2. **Remover a policy `anon`** de `pessoa_empresas` (anon deixa de acessar a tabela direta).
   Fluxos autenticados seguem via `pessoa_empresas_admin_access` / `pessoa_empresas_staff_read`.
3. **Tirar o token do client** (médio prazo): as edges resolvem o token por `empresaId`
   internamente (service_role); o frontend para de ler/repassar `api_token_externo`. Depois,
   `REVOKE SELECT (api_token_externo)` de `authenticated`. Opção mais forte: mover o token
   para a tabela `api_keys` (já existe, vazia) ou coluna em schema protegido.
4. **Rotacionar as 2 chaves ASAAS** (assumir comprometidas) após o passo 3.

> Passos 1–2 fecham o vazamento e podem ir primeiro. Passo 3–4 endurecem a arquitetura.

---

## 3. Fase 1 — Cadastros (DDL proposto)

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
- **BC (presumido)** 🧾: registros discriminados (ISS 2%, PIS 0,65%, COFINS 3%, IRPJ, CSLL) ou um efetivo (~14–16%).
- Alíquota total vigente = soma das alíquotas ativas na data → entra na fórmula da margem.
- **RBT12 automático**: o sistema calcula a receita bruta dos últimos 12 meses por empresa
  (já tem os dados) e **alerta** quando a FS se aproxima de mudar de faixa → sinal de revisar a alíquota.
  Não replicar a tabela do Simples no app (fator R / Anexo III×V / sublimites mudam muito);
  usar alíquota efetiva + **reconciliação** no fechamento.

### 3.3 Modo do profissional

```sql
alter table public.pessoas
  add column modo_financeiro text
  check (modo_financeiro in ('socia','comissionado','repasse_integral'));
```

- Derivável hoje (tem comissão = comissionado; `id_empresa` = sócia), mas explicitar evita ambiguidade.
- Comissão já existe em `comissao_profissional` (`tipo_recebimento` fixo/percentual, por profissional × serviço).

---

## 4. Fase 2 — Motor de margem (desenho)

Tabela de rastreabilidade (permite estorno e auditoria):

```sql
create table public.margens_atendimento (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id),
  fatura_id uuid references public.faturas(id),
  empresa_id uuid not null references public.pessoa_empresas(id),       -- quem faturou
  centro_destino_id uuid not null references public.centros_financeiros(id), -- Clínica
  valor_bruto numeric(15,2) not null,    -- valor_total (base do imposto)
  valor_servico numeric(15,2) not null,  -- líquido (receita)
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

## 5. Fase 3 — Custos individual × compartilhado

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

## 6. Fase 4 — Extrato/Dashboard por carteira + reconciliação

- **Filtro por carteira** (Consolidado / BC / FS / Clínica) no dashboard → entrega o controle
  individual por empresa **e** o caixa da Clínica num seletor (sem logins separados).
- **Extrato por carteira**: receitas (faturas/margens) − despesas − transferências.
- **Reconciliação mensal de imposto**: comparar imposto estimado (Σ `margens_atendimento.imposto`
  do mês) com o imposto real pago (lançamento do DAS/guias) → lançar a diferença na carteira.
- Resolve a divergência de receita atual (Dashboard usava `agendamentos` pagos, que diverge das
  faturas): receita passa a ser medida no líquido, por carteira.

---

## 7. Pendências para a contadora 🧾

1. **Alíquota efetiva atual** de cada empresa (BC presumido; FS Simples) e quais tributos discriminar.
2. **FS (Simples)**: Anexo III ou V (fator R)? Muda ~8,5% → ~14,2%. RBT12 ≈ R$ 348 mil (perto dos R$ 360 mil da faixa seguinte).
3. **Repasse integral**: o profissional recebe 100% do bruto ou 100% − imposto (a empresa absorve o imposto)?
4. **Venda de produtos** (mordedores/espaçadores): tributação de mercadoria (não serviço) — definir antes da Fase 5.
5. **Comissão percentual**: incide sobre o bruto ou sobre o líquido de imposto? (a fixa não é afetada).

## 8. Roadmap

- **Fase 0** — Segurança do token (passos 1–2 imediatos; 3–4 endurecimento). _Independente._
- **Fase 1** — Cadastros: carteiras, tributos por empresa, modo do profissional.
- **Fase 2** — Motor de margem (pago + estorno).
- **Fase 3** — Custos individual/compartilhado + regra Clínica-paga/rateia.
- **Fase 4** — Extrato/dashboard por carteira + reconciliação.
- **Fase 5** — Venda de produtos como receita da Clínica.
