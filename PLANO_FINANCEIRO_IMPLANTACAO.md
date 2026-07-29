# Plano de implantação — Módulo Financeiro (gestão interna)

Data do levantamento: 29/07/2026
Escopo: lançamento de notas, contas fixas, contas a pagar, carteiras/DRE e **leitura automática de documentos por IA** (sem WhatsApp).

---

## 1. Diagnóstico — o que já existe

O módulo **não precisa ser construído do zero**. A modelagem e a UI estão quase completas; o que falta é _ligar os fios_ e corrigir o que quebrou. Números reais do banco de produção:

### 1.1 Banco (15 tabelas financeiras já modeladas)

| Tabela                              |    Linhas | Situação                                                                             |
| ----------------------------------- | --------: | ------------------------------------------------------------------------------------ |
| `lancamentos_financeiros`           |       755 | Em uso. 686 importados (mai/2023–nov/2025), 58 recorrentes, 9 manuais, 2 de teste IA |
| `lancamento_itens`                  |        19 | Praticamente vazia — quase nenhum lançamento tem itens detalhados                    |
| `lancamento_divisao_socios`         |     **0** | **Morta** — 636 lançamentos marcados `eh_divisao_socios` sem nenhum rateio gravado   |
| `contas_pagar`                      |     **9** | **Quase morta** — 746 lançamentos não têm parcela/vencimento                         |
| `lancamentos_recorrentes`           | 17 ativos | Cadastradas, mas **paradas desde jan/2026**                                          |
| `lancamentos_recorrentes_historico` |         0 | Escrita por uma função; a UI lê outra tabela                                         |
| `lancamentos_recorrentes_log`       |         0 | Tabela que a UI lê                                                                   |
| `categorias_contabeis`              |        46 | OK (hierarquia Grupo > Classificação)                                                |
| `fornecedores`                      |       137 | OK                                                                                   |
| `produtos_servicos`                 |        12 | OK (compartilhada com o módulo Produtos/Estoque)                                     |
| `contas_bancarias`                  |         2 | OK                                                                                   |
| `formas_pagamento`                  |         7 | OK                                                                                   |
| `centros_financeiros`               |         3 | BC FISIO (0 lanç.), F.S PACHECO (0 lanç.), Clínica (636 lanç.)                       |
| `tributos_empresa`                  |         6 | OK                                                                                   |
| `configuracao_divisao_socios`       |         2 | OK (50/50)                                                                           |
| `margens_atendimento`               |     1.664 | OK — alimenta o caixa da Clínica                                                     |

Views prontas: `vw_caixa_clinica_resumo`, `vw_despesas_carteira_mes`, `vw_faturamento_empresa_mes`, `vw_margens_clinica`.

### 1.2 Frontend (16 mil linhas já escritas)

`FinanceiroPage` → aba **Gestão Financeira** → `FinancialTemplate` com 7 abas funcionais:
Dashboard, Carteiras, Lançamentos, Contas a Pagar, **Pré-Lançamentos**, Recorrentes, Cadastros (7 sub-abas), Relatórios.

Destaques do que já está pronto e pode ser reaproveitado:

- `PreLancamentoValidation.tsx` (1.188 linhas) — **tela de validação humana já existe e já filtra por `origem_lancamento = 'api_ia'`**. Edição inline, aprovação linha a linha, sugestão de produto por similaridade (`buscarProdutosSimilares`).
- `LancamentoForm.tsx` (1.276 linhas) — form completo com itens, parcelas, divisão de sócios e upload de arquivo.
- `ProdutoSugestaoModal.tsx` — casamento item da nota ↔ produto do catálogo.
- `CaixaClinicaPanel` / `ResumoCarteiras` — consolidação receita × despesa por carteira.

### 1.3 Infra de IA já existente (padrão a seguir)

- `api_keys` — chave OpenAI ativa.
- `ai_prompts` — 3 prompts versionados no banco (`prompt_content` + `openai_model`), editáveis pela UI.
- Edge functions `enhance-text`, `transcribe-audio`, `patient-history-ai` — padrão consolidado: busca chave em `api_keys`, prompt em `ai_prompts`, chama OpenAI.

**Conclusão:** o esqueleto de "IA lê e preenche o banco" foi desenhado (`origem_lancamento='api_ia'`, `dados_ia jsonb`, `status_lancamento='pre_lancamento'`, tela de validação), mas **o motor de ingestão nunca foi construído**. Existem 2 registros `api_ia` de nov/2024, ambos com `dados_ia` nulo — testes manuais.

---

## 2. Os furos que impedem o "funcionar de vez"

### 🔴 F0 — A chave da OpenAI está exposta para qualquer um com a anon key

A policy `api_keys_select_service_fixed` em `api_keys` é:

```sql
(auth.uid() IS NULL) OR is_admin()
```

Aplicada ao role `public` (que inclui `anon`). Com a anon key — que está no bundle do frontend — `auth.uid()` é NULL, a condição vira `true` e **um `SELECT encrypted_key FROM api_keys` devolve a chave da OpenAI e as credenciais da Evolution API em texto plano**. É a mesma classe do vazamento do token ASAAS via `pessoa_empresas`.

Relacionado: `document_storage_anon_crud` dá `ALL ... USING (true)` para `anon` na tabela que indexa **todos** os arquivos (inclusive contratos e documentos financeiros).

Também no radar (advisory do Supabase): 4 tabelas sem RLS — `paciente_pediatra`, `_bkp_contract_pessoa_migration`, `_bkp_merge_pessoas_duplicadas`, `_bkp_consolidacao_pediatras`.

### 🔴🔴 F0-bis — A família `*_anon_crud`: a anon key lê e escreve o banco inteiro

Descoberto em 29/07/2026 ao varrer as policies depois de fechar `api_keys`. Existem ~14 policies no padrão `<tabela>_anon_crud`, todas `FOR ALL ... USING (true) WITH CHECK (true)` para o role `anon`, nas tabelas centrais do sistema:

`pessoas`, `agendamentos`, `relatorio_evolucao`, `faturas`, `user_contracts`, `pessoa_responsaveis`, `pessoa_indicacoes`, `enderecos`, `session_media`, `midias_sessao`, `profissional_servicos`, `permissoes_agendamento`, `contract_templates`.

**Confirmado na prática**, com a anon key que está no bundle público do site (contagem via `Prefer: count=exact`, sem baixar dado pessoal):

| Tabela               | Acesso do anon                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `pessoas`            | lê as **3.424** pessoas (nome, CPF, telefone, e-mail, endereço de pacientes e responsáveis) |
| `relatorio_evolucao` | lê as **812** evoluções clínicas                                                            |
| `faturas`            | lê as **3.702** faturas                                                                     |
| `pessoas` (escrita)  | `PATCH` aceito (**HTTP 204**) — testado com id inexistente, nada foi alterado               |

Ou seja: qualquer pessoa que abra o site e copie a chave do bundle consegue **ler prontuário e cadastro de paciente e alterar/apagar registro**. É ordens de grandeza mais grave que a chave da OpenAI, e é exposição de dado de saúde (LGPD).

**Por que não dá para simplesmente apagar as policies:** as páginas públicas consultam essas tabelas direto com a anon key —

- `src/lib/shared-schedule-api.ts` (agenda pública) → `agendamentos`, `agenda_*`, `pessoa_empresas`, `tipo_servicos`
- `src/lib/payment-links-api.ts` (página de pagamento) → `agendamentos`, `pessoas`, `pagamento_links`, `webhook_queue`
- `PatientRegistrationSteps` (cadastro público) → `pessoa_responsaveis`, `user_contracts`, `agenda_slots`

Derrubar as policies sem substituir esses acessos quebra cadastro de paciente, agenda compartilhada e página de pagamento — fluxos que envolvem dinheiro e captação.

**Correção proposta** (mesmo padrão já aplicado em `pessoa_empresas` em jun/2026): trocar CRUD amplo por acesso estreito e escopado pelo token público — RPC `SECURITY DEFINER` (ou edge function) que recebe o token da agenda/link de pagamento e devolve **apenas** o que aquele token dá direito, e então revogar o `anon` da tabela. Uma tabela por vez, com teste do fluxo público a cada passo.

#### Método usado para separar o que é público de verdade

Grafo de imports a partir de `src/components/PublicRouter.tsx`, **ignorando `import type`** (apagado no build). Sem esse filtro o grafo mente: `calendar-mappers.ts:15` faz `import type { AdminUser }` de `AdminCalendarTemplate`, o que arrastava todo o calendário admin (`patient-api`, `calendar-services`, `AppointmentDetailsManager`) para dentro do "alcance público" — código que nunca entra no bundle e nunca roda para um visitante anônimo.

Resultado: **126 arquivos** compõem o bundle público de verdade.

#### O que já foi fechado (lotes 1 e 2)

`relatorio_evolucao`, `faturas`, `session_media`, `midias_sessao`, `profissional_servicos`, `permissoes_agendamento`, `pessoa_indicacoes` — zero uso público.

Sobre `faturas`, havia uma dúvida legítima: o workflow n8n `[Sistema RK] Webhook Asaas` faz `PATCH /rest/v1/faturas` a cada poucos segundos. Inspecionado o nó `Credenciais`: ele manda `apikey: <anon>` mas `Authorization: Bearer <service_role>`. O PostgREST deriva o role do `Authorization`, então o workflow roda como service_role e ignora RLS — revogar o anon não o afeta. **Efeito colateral achado:** esse JWT de service_role está em texto plano num nó Set do n8n (e existe um workflow `[N8N] Backup` que exporta workflows).

#### Lote 3 — o que falta, e por que exige RPC

| Tabela                | Uso público real                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pessoas`             | `findPersonByCpf`/`findPersonByPhone` (responsável financeiro), checagem de telefone já cadastrado, CPF dos responsáveis no contrato, autorizações, `link_contrato`, lista de pediatras |
| `agendamentos`        | `shared-schedule-api.ts:64,151` — criar/reagendar consulta pela agenda compartilhada                                                                                                    |
| `pessoa_responsaveis` | cadastro público e wizard da agenda                                                                                                                                                     |
| `user_contracts`      | geração/assinatura do contrato no cadastro público                                                                                                                                      |
| `enderecos`           | `AddressStep` — busca e criação por CEP                                                                                                                                                 |
| `contract_templates`  | leitura do template ativo                                                                                                                                                               |

RPCs a criar (todas `SECURITY DEFINER`, entrada estreita, saída só com o necessário):
`fn_public_buscar_pessoa_por_cpf`, `fn_public_buscar_pessoa_por_telefone`, `fn_public_listar_pediatras`, `fn_public_salvar_autorizacoes`, `fn_public_registrar_link_contrato`, `fn_public_upsert_endereco`, mais as escopadas por token da agenda compartilhada. Depois de cada uma, revogar o `anon` da tabela correspondente e testar o fluxo público ponta a ponta.

⚠️ Hoje qualquer um consegue **consultar uma pessoa pelo CPF** pela anon key. Mesmo depois da RPC isso continua possível por design (o fluxo público precisa), então a RPC deve ter rate limiting e devolver o mínimo — id e nome, nunca o registro inteiro.

**Prioridade: acima de tudo neste documento.** O financeiro pode esperar; isto não.

### 🔴 F1 — As contas fixas pararam de ser geradas em janeiro

Três problemas encadeados:

1. **Não existe cron.** Os 11 jobs do `pg_cron` cuidam de webhooks, lembretes e cobrança. Nenhum chama a geração de recorrentes.
2. **A função que a UI chama está quebrada.** O botão "Processar agora" (`RecorrenciaLogViewer.tsx:117`) chama `processar_lancamentos_recorrentes_manual()`, que referencia as colunas `data_proxima_recorrencia` e `ajustar_fim_semana` — **que não existem** em `lancamentos_recorrentes`. Também tenta gravar a string `'system'` em colunas `uuid`. Ela falha em toda execução.
3. **Duas funções concorrentes, três destinos de log.** `gerar_lancamentos_recorrentes()` (a que funciona, mas não é chamada por ninguém) grava em `lancamentos_recorrentes_historico`; a quebrada gravaria em `lancamentos_recorrentes_log`; a UI lê `lancamentos_recorrentes_log`. As três estão vazias.

**Impacto:** as 17 contas fixas (condomínio, energia, limpeza, contabilidade, ISS/PIS/COFINS/INSS/IRPJ, assinaturas) não são lançadas desde **jan/2026** — 6 meses de despesa fora do sistema, ~100 lançamentos faltando.

Bugs adicionais na função boa, a corrigir junto:

- `make_date(ano, mes, rec.dia_vencimento)` estoura com `dia_vencimento = 30/31` em fevereiro.
- Não preenche `centro_financeiro_id`, `natureza_custo`, `data_vencimento`, `empresa_fatura_id` — colunas criadas depois dela.
- Não faz backfill de meses perdidos (gera só a competência corrente).
- Sem idempotência: se rodar duas vezes no mesmo dia, duplica.

### 🟠 F2 — Não existe ingestão de notas (o pedido central)

Não há edge function, fila, parser de XML nem chamada de visão. Hoje, lançar uma nota = digitar tudo à mão no `LancamentoForm`. Só **4 dos 755 lançamentos** têm arquivo anexado.

### 🟠 F3 — Contas a Pagar não é usada de verdade

746 dos 755 lançamentos não têm parcela em `contas_pagar`; `data_vencimento` está nulo em 753. O controle de pagamento hoje é o booleano `lancamentos_financeiros.pago`. Consequência: **não existe agenda de vencimentos nem fluxo de caixa projetado** — o sistema só sabe o passado.

### 🟠 F4 — As carteiras dos sócios estão zeradas

Os 119 lançamentos de natureza `individual` têm `pessoa_responsavel_id` preenchido mas `centro_financeiro_id` **nulo** → não aparecem em nenhuma carteira. BC FISIO e F.S PACHECO mostram 0 despesas.

E `lancamento_divisao_socios` vazia quebra duas coisas: o rateio 50/50 nunca é materializado, e a policy `lancamentos_financeiros_select_socio` (que depende dessa tabela) **nunca devolve nada** — um sócio não-admin não enxerga despesa alguma.

### 🟡 F5 — Documentos fiscais vão para bucket público

`LancamentoForm.tsx:361` sobe o anexo em `respira-documents` (bucket **público**) e grava a `publicUrl`. Nota fiscal tem CNPJ, valores e endereço; a URL é adivinhável e não expira.

### 🟡 F6 — Colunas duplicadas em `lancamentos_recorrentes`

`valor_fixo` × `valor`, `periodicidade` × `frequencia_recorrencia`, `proximo_lancamento` × `proxima_data_geracao`. Cada função usa um par diferente — origem provável da quebra.

---

## 3. Arquitetura da ingestão por IA (sem WhatsApp)

### 3.1 Princípio

**A IA extrai; o sistema decide; o humano confirma.** A IA nunca escolhe fornecedor, categoria ou centro de custo — ela devolve os dados brutos do documento, e regras determinísticas (CNPJ, histórico, similaridade) fazem o resto. Nada entra como `validado` sem passar pela tela de Pré-Lançamentos.

### 3.2 Fluxo

```
[Upload in-app: PDF / XML / foto]
        │  (bucket PRIVADO respira-financeiro)
        ▼
[documentos_fiscais]  ← fila, com hash p/ deduplicação
        │
        ▼
[edge: parse-documento-fiscal]
        ├── XML (NF-e 4.00 / NFS-e)  → parser determinístico, confiança 1.0, ZERO custo de IA
        ├── PDF com texto            → extrai texto → LLM (modo texto, barato)
        └── PDF escaneado / foto     → LLM com visão
        │
        ▼  (Structured Output com json_schema — sem parsing de texto livre)
[enriquecimento determinístico]
        ├── fornecedor  ← match por CNPJ normalizado; cria se não existir
        ├── categoria   ← moda das últimas N notas do mesmo fornecedor → regra por palavra-chave → null
        ├── produto     ← buscarProdutosSimilares() (já existe)
        ├── centro/natureza ← default compartilhado/Clínica
        └── dedupe      ← hash do arquivo + (CNPJ, número da nota)
        │
        ▼
[lancamentos_financeiros: status='pre_lancamento', origem='api_ia', dados_ia=jsonb]
        │
        ▼
[Tela Pré-Lançamentos — validação humana]  ← JÁ EXISTE
        │
        ▼
[validado] → lancamento_itens + contas_pagar (parcelas) + divisão sócios
```

### 3.3 Nova tabela `documentos_fiscais`

```sql
create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'respira-financeiro',
  caminho text not null,
  nome_original text not null,
  mime_type text,
  tamanho_bytes bigint,
  hash_sha256 text unique,                    -- deduplicação
  tipo_detectado text,                        -- nfe_xml | nfse_xml | danfe_pdf | nfse_pdf | boleto | cupom | recibo | desconhecido
  status text not null default 'recebido',    -- recebido|processando|extraido|erro|duplicado|descartado|consumido
  dados_extraidos jsonb,
  confianca numeric,                          -- 0..1 global
  modelo text, tokens_input int, tokens_output int, custo_usd numeric,
  erro_msg text, tentativas int not null default 0,
  lancamento_id uuid references lancamentos_financeiros(id),
  enviado_por uuid references pessoas(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 3.4 Contrato de saída da IA (json_schema)

```jsonc
{
  "emitente": { "cnpj": "…", "razao_social": "…", "nome_fantasia": "…" },
  "documento": {
    "tipo": "nfe|nfse|boleto|cupom|recibo",
    "numero": "…",
    "serie": "…",
    "chave_acesso": "…",
    "data_emissao": "AAAA-MM-DD",
  },
  "valores": { "total": 0, "descontos": 0, "impostos": 0 },
  "vencimentos": [{ "data": "AAAA-MM-DD", "valor": 0, "linha_digitavel": "…" }],
  "itens": [
    {
      "descricao": "…",
      "quantidade": 1,
      "valor_unitario": 0,
      "valor_total": 0,
      "ncm": "…",
    },
  ],
  "competencia_sugerida": "AAAA-MM-01",
  "observacoes": "…",
  "confianca_por_campo": { "emitente.cnpj": 0.99, "valores.total": 0.97 },
}
```

O prompt vai para `ai_prompts` (`prompt_name='extrair_documento_fiscal'`), editável pela UI sem redeploy — mesmo padrão de `enhance-text`.

### 3.5 Por que XML não passa pela IA

Nota fiscal eletrônica brasileira tem XML com layout fixo (NF-e 4.00, NFS-e ABRASF/padrão nacional). Parser determinístico = 100% de acerto, custo zero e sem alucinação. A IA fica só para PDF/foto. Vale orientar o financeiro a **sempre pedir o XML ao fornecedor** — mais barato e mais confiável.

### 3.6 Custo estimado

~R$ 0,01–0,05 por documento em PDF/imagem. A ~60 notas/mês, algo como **R$ 1–3/mês**. Irrelevante frente ao tempo de digitação.

### 3.7 Entrada por e-mail (fase 2, opcional)

A maior parte das notas chega por e-mail. Um endereço dedicado (ex.: `notas@respirakids.com.br`) cujos anexos caem direto na fila eliminaria o upload manual. Fica fora do escopo inicial por depender de integração externa — o upload in-app cobre 100% dos casos primeiro.

---

## 4. Plano por fases

### Fase 0 — Segurança (bloqueante, ~1 dia)

| #   | Ação                                                                                                                                                                                                       | Onde                                                                              | Status             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| 0.1 | Fechar `api_keys`: dropar `api_keys_select_service_fixed` e a policy de secretaria; coluna gerada `chave_mascarada`; `REVOKE ALL` de anon e `SELECT` por coluna (sem `encrypted_key`) para authenticated   | migration `seguranca_api_keys_fecha_leitura_anon` + `src/lib/integrations-api.ts` | ✅ **29/07/2026**  |
| 0.2 | Remover `document_storage_anon_crud` (era `ALL USING(true)` para anon) + `REVOKE ALL` de anon                                                                                                              | migration `seguranca_document_storage_remove_anon`                                | ✅ **29/07/2026**  |
| 0.3 | Rotacionar a chave da OpenAI (esteve exposta)                                                                                                                                                              | painel OpenAI + `api_keys`                                                        | ⬜ decisão do dono |
| 0.4 | Criar bucket **privado** `respira-financeiro` (PDF/XML/JPG/PNG, 10 MB) + policy admin/secretaria                                                                                                           | migration `bucket_privado_respira_financeiro`                                     | ✅ **29/07/2026**  |
| 0.5 | Upload passa a ir para o bucket privado, `arquivo_url` guarda o caminho e a leitura usa URL assinada. Não havia arquivo a migrar (os anexos existentes apontavam para uchat.com.au; 2 valores-lixo limpos) | `src/lib/financeiro-storage.ts`, `LancamentoForm.tsx`, `LancamentoList.tsx`       | ✅ **29/07/2026**  |
| 0.6 | 4 tabelas sem RLS: `paciente_pediatra` ganhou RLS + policy de staff e perdeu o `anon`; as 3 `_bkp_*` perderam todos os grants e ganharam RLS sem policy (bloqueio total, intencional)                      | migration `seguranca_rls_paciente_pediatra_e_backups`                             | ✅ **29/07/2026**  |

### Fase 1 — Contas fixas voltam a rodar ✅ **APLICADA em 29/07/2026**

| #   | Ação                                                                                                                                                                                                                                   | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 | `fn_gerar_lancamentos_recorrentes(p_ate, p_desde)` — função única, com catch-up, vencimento por `least(dia, último dia do mês)`, carteira/natureza/empresa, item do lançamento, parcela em `contas_pagar` e log em duas granularidades | ✅     |
| 1.2 | `processar_lancamentos_recorrentes_manual()` (quebrada) e `gerar_lancamentos_recorrentes()` (órfã) removidas                                                                                                                           | ✅     |
| 1.3 | Idempotência: índice único `(lancamento_recorrente_id, data_competencia)`                                                                                                                                                              | ✅     |
| 1.4 | Classificação na regra: `centro_financeiro_id`, `natureza_custo`, `empresa_fatura_id`, `pessoa_responsavel_id` em `lancamentos_recorrentes`                                                                                            | ✅     |
| 1.5 | Vínculo restaurado: 45 dos 58 lançamentos históricos religados à sua regra pela descrição                                                                                                                                              | ✅     |
| 1.6 | `pg_cron` diário às 06:00 BRT (`0 9 * * *`, jobid 13)                                                                                                                                                                                  | ✅     |
| 1.7 | Botão "Processar agora" apontando para a função nova                                                                                                                                                                                   | ✅     |
| 1.8 | Catch-up executado: **52 lançamentos** (fev–jun/2026 com 7 cada + jul/2026 com 17)                                                                                                                                                     | ✅     |

**Decisão de projeto tomada no caminho:** a primeira versão do catch-up voltava até `data_inicio` quando a regra nunca havia gerado nada, e criou **128** lançamentos — inventando 2 anos de impostos zerados (COFINS, PIS, ISS, INSS, IRPJ, IRRF, CSLL e contabilidade foram cadastrados em 2025 e nunca rodaram). Isso poluiria o DRE inteiro. Foi desfeito e a regra virou: **regra sem histórico começa no mês corrente**; backfill retroativo só via `p_desde`, explicitamente.

**Pendente de você:** 39 dos 52 nasceram como **pré-lançamento com valor 0** (energia, condomínio, limpeza, Claro, Uchat e os impostos são de valor variável) — precisam do valor real na aba Pré-Lançamentos. Os 13 de valor fixo já entraram validados.

**Fica para depois:** expor os campos de carteira/natureza no `LancamentoRecorrenteForm` (hoje usam o default Clínica/compartilhado) e limpar as colunas duplicadas de `lancamentos_recorrentes` (`valor`/`valor_fixo`, `periodicidade`/`frequencia_recorrencia`, `proximo_lancamento`/`proxima_data_geracao`).

### Fase 2 — Ingestão por IA ✅ **APLICADA em 29/07/2026**

| #   | Ação                                                                                                                                                                                                             | Status   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 2.1 | Tabela `documentos_fiscais` (fila) com dedupe por `hash_sha256`, RLS admin/secretaria, sem acesso do anon                                                                                                        | ✅       |
| 2.2 | Enriquecimento determinístico: `fn_financeiro_sugerir_fornecedor` (CNPJ exato → similaridade de nome via pg_trgm), `fn_financeiro_categoria_sugerida` (moda do fornecedor), `fn_financeiro_lancamento_duplicado` | ✅       |
| 2.3 | Edge function `parse-documento-fiscal`: XML por parser determinístico, PDF/imagem por IA com structured output                                                                                                   | ✅       |
| 2.4 | RPC `fn_financeiro_criar_prelancamento` — do documento extraído ao pré-lançamento, com itens                                                                                                                     | ✅       |
| 2.5 | Prompt `extrair_documento_fiscal` em `ai_prompts` (editável pela UI, sem redeploy)                                                                                                                               | ✅       |
| 2.6 | UI: `DocumentoFiscalUpload` (dropzone múltipla) no topo da aba Pré-Lançamentos                                                                                                                                   | ✅       |
| 2.7 | Preview do documento lado a lado na tela de validação                                                                                                                                                            | ⬜ falta |
| 2.8 | Cron de retentativa automática para documentos em `erro`                                                                                                                                                         | ⬜ falta |

**Decisões que se firmaram na construção:**

- **XML não passa por IA.** Layout fixo (NF-e 4.00 e NFS-e ABRASF) → parser determinístico, confiança 1.0, custo zero, zero alucinação. A UI orienta a preferir o XML.
- **Nenhum fornecedor tem CNPJ cadastrado hoje** (0 de 137). Casar só por CNPJ não acharia nada, então a similaridade de nome é o caminho principal — e a base **se cura sozinha**: ao aprovar uma nota, o CNPJ do documento é gravado no fornecedor casado.
- Sufixos societários (LTDA, S.A., ME, EIRELI) saem da comparação: sem isso "FORNECEDOR QUE NÃO EXISTE LTDA" casava com "Kabum S.A." só pelo "LTDA".
- Fornecedor com score < 0.6 fica **em branco** — quem valida escolhe. Categoria sem histórico cai em "A classificar" (código 9.99), criada para isso.
- Dedupe olha o CNPJ em `dados_ia`, não só o do fornecedor: como o pré-lançamento nasce sem fornecedor, casar só pela FK deixaria passar a mesma nota duas vezes.

**Limitação conhecida:** PDF **escaneado** (sem camada de texto) não é lido — rasterizar PDF no edge runtime não é viável. A função devolve erro pedindo o XML ou uma foto do documento (foto vai por visão e funciona).

**Verificação feita:** parser de XML validado localmente contra NF-e 4.00 e NFS-e ABRASF (emitente, número, chave, datas, valores, duplicatas e itens conferidos); cadeia extração → pré-lançamento testada no banco, incluindo o caminho de duplicidade com CNPJ formatado diferente (`12.345.678/0001-99` × `12345678000199`). **Falta o teste com arquivo real** subindo pela tela — não consigo escrever no bucket privado sem a service key.

### Fase 3 — Contas a pagar e fluxo de caixa (~2–3 dias)

| #   | Ação                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Decidir `contas_pagar` como fonte única de vencimento/pagamento; `lancamentos_financeiros.pago` vira derivado por trigger |
| 3.2 | Backfill: 1 parcela para os 746 lançamentos órfãos (vencimento = competência; já pagas marcadas como pagas)               |
| 3.3 | Tela Contas a Pagar: agenda de vencimentos, atrasados em destaque, baixa em lote com anexo de comprovante                 |
| 3.4 | Projeção de caixa: contas a pagar futuras × recorrentes previstas × faturamento previsto                                  |

### Fase 4 — Carteiras e DRE fecham (~2–3 dias)

| #   | Ação                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Backfill `centro_financeiro_id` nos 119 lançamentos individuais a partir de `pessoa_responsavel_id`                                                                     |
| 4.2 | Materializar `lancamento_divisao_socios` na validação (trigger ou passo do fluxo) + backfill dos 636 pendentes → destrava a policy do sócio                             |
| 4.3 | View `vw_dre_mensal`: receita (`vw_faturamento_empresa_mes` / `vw_caixa_clinica_resumo`) − despesas (`vw_despesas_carteira_mes`), por carteira, competência **e** caixa |
| 4.4 | Tela DRE mensal/anual com drill-down até o lançamento                                                                                                                   |

### Fase 5 — Depois (não bloqueia)

- Entrada por e-mail dedicado.
- Conciliação bancária (OFX/extrato) contra `contas_pagar` e faturas pagas.
- Notas de **saída** (NFS-e da clínica) hoje vivem só no ASAAS — trazer para o DRE.

---

## 5. Decisões que preciso de você

1. **Competência ou caixa** como visão padrão do DRE? (recomendo competência como padrão, com toggle para caixa)
2. **`contas_pagar` como fonte única** de vencimento/pagamento? (recomendo sim — sem isso não existe fluxo de caixa projetado)
3. **Backfill fev–jul/2026**: as contas variáveis (energia, condomínio, limpeza, impostos) entram zeradas para você preencher, ou prefere lançar só a partir de agosto e tratar o passado à parte?
4. **Provedor de IA**: seguir com OpenAI (chave e padrão já existem no projeto)?
5. **Quem pode subir documento**: só admin, ou secretaria também?

---

## 6. Riscos

| Risco                                                        | Mitigação                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| IA errar valor/CNPJ e entrar despesa errada                  | Nunca grava `validado`; confiança por campo visível; XML sem IA      |
| Nota duplicada (mesmo doc subido 2×)                         | Hash do arquivo + chave (CNPJ, número)                               |
| Backfill dos recorrentes duplicar o que já existe            | Índice único `(recorrente, competência)` antes do backfill           |
| Alterar `pago`/`contas_pagar` bagunçar relatórios existentes | Migration em transação + conferência dos totais por mês antes/depois |
| Custo de IA fugir do controle                                | Limite de tentativas, custo gravado por documento, XML primeiro      |

---

## 7. Esforço consolidado

| Fase | Escopo                 |     Estimativa |
| ---- | ---------------------- | -------------: |
| 0    | Segurança              |          1 dia |
| 1    | Contas fixas           |       2–3 dias |
| 2    | **Ingestão por IA**    |       5–8 dias |
| 3    | Contas a pagar / caixa |       2–3 dias |
| 4    | Carteiras / DRE        |       2–3 dias |
|      | **Total**              | **12–18 dias** |

Fases 0 e 1 são independentes da 2 e destravam valor imediato (6 meses de despesa fixa que estão fora do sistema). A Fase 2 pode começar em paralelo assim que a 0 estiver fechada.
