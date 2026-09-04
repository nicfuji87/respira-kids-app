# Plano — conta chega por e-mail, é paga pelo Inter e cai no sistema

Data: 05/08/2026 · Status: PROPOSTA (nada aplicado)

Objetivo: o boleto/nota que hoje chega no e-mail e é pago na mão vira um fluxo
rastreado — recebido, entendido, casado com a conta prevista, aprovado por gente,
pago pelo Inter, baixado no sistema e conferido contra o extrato. Com aviso no
WhatsApp quando uma conta fixa é paga e quando aparece uma conta que ninguém
esperava.

---

## 1. O que já existe (e por isso não vamos reconstruir)

| Peça                                                 | Onde                                                                          | Estado                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Upload de documento + dedupe SHA-256                 | bucket `respira-financeiro` + `documentos_fiscais`                            | pronto                                             |
| Extração XML determinística / PDF e foto por IA      | edge `parse-documento-fiscal`                                                 | pronto                                             |
| Fornecedor e categoria por regra (nunca pelo modelo) | `fn_financeiro_sugerir_fornecedor`, `fn_financeiro_categoria_sugerida`        | pronto                                             |
| Pré-lançamento com validação humana                  | `fn_financeiro_criar_prelancamento` + `PreLancamentoValidation`               | pronto                                             |
| Contas fixas geram parcelas previstas                | `fn_gerar_lancamentos_recorrentes` + cron 06:00                               | pronto                                             |
| Agenda de vencimentos como fonte única               | `contas_pagar` + `vw_contas_pagar`; `lancamentos_financeiros.pago` é derivado | pronto                                             |
| Baixa em lote                                        | `fn_financeiro_baixar_contas(ids, data, forma, conta, obs)`                   | pronto                                             |
| Saldo e extrato do Inter                             | edge `inter-conta` (`extrato.read`)                                           | pronto                                             |
| Pagamento boleto/DARF/Pix pelo Inter                 | edge `inter-pagar` + `_shared/inter.ts` + auditoria `inter_pagamentos`        | pronto, mas manual e com código de barras digitado |
| Avisos no WhatsApp                                   | `webhook_queue` → roteador `[RK] Webhook` → Uazapi                            | pronto                                             |
| Leitura de e-mail no n8n                             | nó IMAP já em uso no `[RK] Webhook Recebe Email`                              | padrão provado                                     |

Ou seja: **as duas pontas existem**. Falta o meio — e-mail → documento, boleto →
código de barras validado, boleto → parcela prevista, pagamento → baixa, extrato →
conferência.

---

## 2. Desenho: 5 estágios, uma trava em cada

```
 e-mail  ──▶ documento ──▶ conta identificada ──▶ APROVAÇÃO HUMANA ──▶ Inter ──▶ baixa
   │            │                 │                                      │
 remetente   checksum da      casa com parcela                       extrato D-1
 conhecido?  linha digitável  prevista?                              bate?
```

Regra que atravessa tudo: **a IA extrai, o sistema decide, a pessoa autoriza o que
sai da conta.** É a mesma regra que já rege o `parse-documento-fiscal` — só está
sendo estendida para o dinheiro.

### Estágio 1 — Recebe (n8n → edge)

Caixa dedicada (ex. `contas@respirakids.com.br`) ou um label "Contas" na caixa
atual. Workflow novo `[RK] Financeiro Recebe Conta`:

IMAP/Gmail trigger → para cada anexo (PDF, XML, JPG/PNG) → `POST` para uma edge
nova `receber-documento-email` com header `x-rk-secret`.

Três decisões que importam:

- **O n8n só transporta.** Quem grava no bucket e em `documentos_fiscais` é a edge,
  com o mesmo dedupe SHA-256 do upload in-app. Duas implementações de dedupe = a
  mesma conta entrando duas vezes por caminhos diferentes.
- **O n8n não carrega a `service_role`.** Header com segredo dedicado. Hoje o Set
  "Credenciais" do roteador tem a service_role em texto — não repetir o padrão
  (e vale corrigir aquele à parte).
- **E-mail sem anexo também vale.** Muito boleto vem só com a linha digitável no
  corpo. O corpo em texto vira um documento `tipo='email_texto'` e segue o mesmo
  caminho.

Segurança: qualquer um pode mandar e-mail para essa caixa. Remetente fora da
allowlist (domínios dos fornecedores conhecidos) → status `quarentena`, não
processa sozinho, aparece na tela para alguém liberar. Isso corta de uma vez
boleto fraudado e injeção de prompt no extrator.

### Estágio 2 — Entende (extração + validação determinística)

Estender `parse-documento-fiscal` com um bloco novo no schema:

```jsonc
"pagamento": {
  "linha_digitavel": "…",   // 47 (bancário) ou 48 (arrecadação) dígitos
  "beneficiario_nome": "…",
  "beneficiario_cnpj": "…",
  "vencimento": "AAAA-MM-DD",
  "valor": 1234.56
}
```

**A linha digitável não pode vir do modelo sem conferência.** Ordem de preferência:

1. **Regex no texto do PDF** (o `unpdf` já extrai texto): 47/48 dígitos. Determinístico,
   custo zero — mesma lógica que fez o XML não passar por IA.
2. IA só como fallback (foto, PDF sem camada de texto).

E, venha de onde vier, passa por `validarLinhaDigitavel()`:

- **Bancário (47 dígitos):** DV módulo 10 dos campos 1–3, DV geral módulo 11 na
  posição 5 do código de barras, fator de vencimento (pos. 6–9) → data, valor
  (pos. 10–19) → confrontar com o valor lido no papel.
- **Arrecadação/concessionária (começa com 8, 48 dígitos):** 4 blocos de 12, DV por
  módulo 10 ou 11 conforme o 3º dígito; valor nas posições 5–15; não tem fator de
  vencimento.
- Gotcha do fator de vencimento: ele estourou 9999 em 21/02/2025 e reiniciou em 1000. Boleto novo com cálculo antigo dá data em 1997. Tratar o rollover.

Se checksum falhar, ou o valor do código ≠ valor extraído, ou o vencimento
divergir: o documento **não** entra na fila de pagamento. Vira pendência de
conferência com aviso. É exatamente aqui que se evita pagar R$ 12.345,00 num
boleto que dizia R$ 1.234,50.

### Estágio 3 — Casa com a conta prevista (o risco de duplicidade)

As contas fixas **já criam** a parcela em `contas_pagar` todo dia 06:00. Se o boleto
que chega por e-mail virar um lançamento novo, a mesma conta de luz aparece duas
vezes na DRE. Então o padrão é **casar, não criar**.

RPC nova `fn_financeiro_casar_conta_pagar(p_documento_id)`:

1. Fornecedor por CNPJ do beneficiário (reusa `fn_financeiro_sugerir_fornecedor`).
2. Candidatas: `contas_pagar` em aberto, mesmo fornecedor, vencimento ±5 dias,
   valor dentro de ±2% (ou diferença explicável por juros/desconto).
3. Resultado:
   - **1 candidata** → vincula documento ↔ parcela, status `identificada`.
   - **0 candidatas** → status `nao_identificada` → **aviso** (o que você pediu).
     Vira um pré-lançamento normal, para virar despesa nova depois da validação humana.
   - **2+** → `ambigua`, escolha humana na tela.

Duas colunas novas em `contas_pagar`: `documento_fiscal_id` e
`codigo_barras` (o da parcela, já validado).

### Estágio 4 — Paga (Inter, sempre com aprovação humana)

Tela nova **"A pagar hoje"**: parcelas com vencimento ≤ hoje+2, boleto validado,
beneficiário visível, seleção múltipla, um botão "Pagar selecionadas".

Ajuste no `inter-pagar`: aceitar `conta_pagar_id` em vez de `valor` + `codigo_barras`
soltos. **O servidor lê o valor e o código de barras do banco** — o cliente não
manda nenhum dos dois. Hoje a UI manda o código digitado à mão; com o e-mail no
circuito isso vira o elo fraco.

Alerta obrigatório no card: **CNPJ do beneficiário ≠ CNPJ do fornecedor cadastrado**.
Boleto trocado por e-mail é a fraude mais comum em clínica pequena, e o único filtro
que funciona é alguém ver o nome de quem vai receber.

Nada de pagamento automático — e a razão é técnica, não só de prudência:
dependendo da alçada configurada na conta PJ, o Inter devolve o pagamento como
`AGUARDANDO_APROVACAO` (aprovação no Internet Banking PJ), e pode terminar em
`REALIZADO`, `AGENDADO`, `REPROVADO` ou `APROVACAO_EXPIRADA`. Um "pago" gravado na
hora da chamada seria mentira.

Por isso: guardar o `codigoSolicitacao` da resposta e criar um cron
`inter-conferir-pagamentos` (15 em 15 min, horário comercial) que consulta com o
escopo `pagamento-boleto.read` e só então conclui.

Limites: os defaults hoje são `INTER_LIMITE_UNITARIO=2000` e `INTER_LIMITE_DIARIO=5000`.
Aluguel e DAS provavelmente estouram. Ajustar conscientemente antes de ligar o fluxo —
não descobrir no primeiro pagamento grande.

### Estágio 5 — Baixa e conferência

`REALIZADO` → `fn_financeiro_baixar_contas([parcela], data_pagamento, forma='Boleto Inter',
conta_bancaria=Inter, obs=auditoria_id)`. O trigger já deriva
`lancamentos_financeiros.pago`. Pré-requisito: **cadastrar a conta do Inter em
`contas_bancarias`** (hoje só existem a da BC e a Nubank da Clínica).

Conciliação — cron diário `inter-conciliar-extrato`: puxa o extrato de D-1 pelo
`inter-conta`, casa cada débito com `inter_pagamentos` e com as parcelas baixadas.
Débito sem correspondência = **saída não identificada** → aviso. É isso que pega o
pagamento feito na mão pelo app do Inter, que hoje simplesmente some do sistema —
o mesmo tipo de furo que já custou 41 faturas pagas ficarem pendentes no lado Asaas.

---

## 3. Sobre "atualizar a DRE" — uma correção de expectativa

A DRE hoje é **caixa para receita** (`pago_em`) e **competência para despesa**
(`data_competencia`). Então:

- O que muda a DRE é o **lançamento validado** (estágio 3), não o pagamento.
- O que o pagamento muda é **fluxo de caixa e contas a pagar** (estágio 5).

Isso está certo do ponto de vista contábil e não recomendo mexer de graça. Mas
significa que uma conta que chega em agosto e é paga em setembro **entra na DRE de
agosto**. Se a intenção for ver a DRE "pelo que saiu do banco", é outra decisão —
e aí muda `vw_dre_mensal`, não este fluxo.

Detalhe que costuma passar: para a despesa cair na carteira certa, o pré-lançamento
precisa sair com `centro_financeiro_id` e `natureza_custo` preenchidos. Herdar da
regra recorrente quando o boleto casou com uma parcela recorrente resolve a maioria
dos casos sozinho.

---

## 4. Avisos no WhatsApp

Reusa `webhook_queue` → roteador `[RK] Webhook` → sub-workflow novo
`[RK] Webhook Financeiro`. Eventos:

| Evento                   | Quando                                                            | Urgência |
| ------------------------ | ----------------------------------------------------------------- | -------- |
| `conta_paga`             | pagamento vira REALIZADO                                          | imediato |
| `conta_nao_identificada` | boleto chegou e não casa com nenhuma parcela prevista             | imediato |
| `boleto_divergente`      | checksum, valor ou beneficiário não conferem                      | imediato |
| `pagamento_falhou`       | erro, REPROVADO ou APROVACAO_EXPIRADA                             | imediato |
| `saida_nao_identificada` | débito no extrato sem origem no sistema                           | imediato |
| `contas_do_dia`          | digest 8h: o que vence hoje/amanhã e o que está pronto para pagar | diário   |
| `conta_sem_boleto`       | parcela prevista venceu e nenhum boleto chegou                    | diário   |

Regra anti-ruído: **rotina vira digest, exceção vira mensagem.** Se cada boleto
recebido virar um WhatsApp, em duas semanas ninguém lê — e o aviso que importa
(`conta_nao_identificada`) se perde no meio.

O inverso da conta não identificada merece atenção igual: a conta fixa cuja fatura
**não chegou** e ninguém percebeu. É o mesmo tipo de furo silencioso do faturamento
mensal — ausência não gera evento, então tem que ser um cron que procura o que
falta.

---

## 5. Fases

**Fase 1 — E-mail vira documento** (baixo risco, nada de dinheiro)
Caixa/label + workflow n8n + edge `receber-documento-email` + allowlist de remetentes.
Ganho imediato: para de imprimir/baixar anexo à mão. Reaproveita todo o resto.

**Fase 2 — Boleto vira conta identificada**
Bloco `pagamento` no extrator + `validarLinhaDigitavel()` + `fn_financeiro_casar_conta_pagar`

- colunas em `contas_pagar` + eventos `conta_nao_identificada` / `boleto_divergente` /
  `conta_sem_boleto`. Ainda sem pagar nada pelo sistema — mas já é aqui que a maior
  parte do trabalho manual some.

**Fase 3 — Pagar pela fila**
Tela "A pagar hoje" + `inter-pagar` por `conta_pagar_id` + cron de status +
baixa automática + `conta_paga`. Estrear com um boleto pequeno e limite baixo.

**Fase 4 — Conciliar o extrato**
Cron `inter-conciliar-extrato` + `saida_nao_identificada` + tela de conciliação.

Fases 1 e 2 valem sozinhas, mesmo que 3 nunca seja ligada. Se em algum momento a
decisão for "prefiro pagar na mão", o sistema continua sabendo o que chegou, o que
venceu e o que ninguém pagou — que é a parte que hoje não existe.

---

## 6. Pré-requisitos e riscos

- [ ] Caixa de e-mail dedicada (ou label) e credencial IMAP/Gmail no n8n
- [ ] Conta do Inter cadastrada em `contas_bancarias`
- [ ] `INTER_LIMITE_UNITARIO` / `INTER_LIMITE_DIARIO` revistos
- [ ] Confirmar se a conta PJ tem alçada de aprovação ligada (muda o estágio 4)
- [ ] Segredo dedicado para o n8n chamar a edge (não usar service_role)
- [ ] Testar boleto de arrecadação (código iniciando em 8) no endpoint de pagamento
      do Inter com valor baixo — nem todo boleto de concessionária passa por lá
- [ ] Allowlist inicial de remetentes (os fornecedores recorrentes)

Riscos, em ordem de gravidade:

1. **Duplicidade na DRE** — boleto criando despesa nova em vez de casar com a parcela
   recorrente. Mitigado pelo estágio 3; é o item a testar com mais cuidado.
2. **Boleto fraudado** — mitigado pela allowlist de remetente + checagem de CNPJ do
   beneficiário + aprovação humana com o nome à vista.
3. **Leitura errada da linha digitável** — mitigado pelo checksum e pela conferência
   valor-do-código × valor-do-papel. Sem isso, não ligar a Fase 3.
4. **Ruído de notificação** — mitigado pelo digest.
