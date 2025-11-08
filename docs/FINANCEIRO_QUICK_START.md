# Sistema Financeiro - Guia Rápido

## 🚀 Primeiros Passos

### 1. Configurações Iniciais (Admin)

#### A. Cadastrar Categorias Contábeis

```
Financeiro > Cadastros > Categorias
├── Despesas Operacionais
│   ├── Aluguel e Condomínio
│   ├── Energia Elétrica
│   ├── Água e Esgoto
│   └── Internet e Telefone
├── Materiais e Insumos
│   ├── Material Médico
│   ├── Material de Escritório
│   └── Material de Limpeza
└── Receitas
    ├── Consultas
    ├── Exames
    └── Procedimentos
```

#### B. Cadastrar Formas de Pagamento

```
PIX (requer conta bancária) ✓
Cartão de Crédito
Boleto Bancário
Transferência (requer conta bancária) ✓
Dinheiro
```

#### C. Cadastrar Contas Bancárias

```
Conta Clínica - Banco do Brasil - CC
Conta Bruna - Banco Itaú - CC
Conta Flavia - Banco Santander - CC
```

#### D. Configurar Divisão entre Sócios

```
Bruna: 50%
Flavia: 50%
Período: Janeiro/2024 até (em aberto)
```

### 2. Fluxos Principais

#### 📝 Lançar Despesa Manual

1. **Financeiro > Despesas > Novo Lançamento**
2. Preencher dados básicos
3. Adicionar itens se necessário
4. Definir se é divisão entre sócios
5. Salvar → Gera contas a pagar automaticamente

#### 🔄 Criar Despesa Recorrente

1. **Financeiro > Recorrentes > Novo Recorrente**
2. Ex: Aluguel - R$ 5.000 - Mensal - Dia 10
3. Marcar "Ajustar para dia útil"
4. Sistema criará automaticamente todo mês

#### 💰 Registrar Pagamento

1. **Financeiro > Contas a Pagar**
2. Localizar conta (use filtros)
3. Clicar em "Registrar Pagamento"
4. Informar data, forma de pagamento e conta

#### 🤖 Validar Pré-Lançamentos (IA)

1. **Financeiro > Pré-Lançamentos**
2. Revisar dados enviados
3. Editar se necessário
4. Validar ✓ ou Rejeitar ✗

#### 📊 Gerar Relatório Mensal

1. **Financeiro > Relatórios**
2. Selecionar período
3. Aplicar filtros desejados
4. Gerar → Exportar CSV

## 📋 Checklist Diário

### Manhã (Secretária)

- [ ] Verificar contas vencendo hoje
- [ ] Validar pré-lançamentos pendentes
- [ ] Registrar pagamentos realizados

### Tarde (Secretária)

- [ ] Lançar novas despesas/receitas
- [ ] Atualizar status de pagamentos

### Semanal (Admin)

- [ ] Revisar dashboard financeiro
- [ ] Conferir lançamentos recorrentes
- [ ] Gerar relatório semanal

### Mensal (Admin)

- [ ] Fechar mês anterior
- [ ] Gerar relatórios mensais
- [ ] Revisar divisão entre sócios
- [ ] Planejar orçamento próximo mês

## ⚡ Atalhos Úteis

### Filtros Rápidos

- **Vencidas**: Contas com atraso
- **Hoje**: Vence hoje
- **Semana**: Próximos 7 dias
- **Mês Atual**: Competência atual

### Status de Lançamento

- 🟡 **Pré-lançamento**: Aguardando validação
- 🟢 **Validado**: Confirmado e ativo
- 🔴 **Cancelado**: Anulado

### Status de Pagamento

- ⏳ **Pendente**: Aguardando pagamento
- ✅ **Pago**: Pagamento confirmado
- ❌ **Cancelado**: Conta cancelada

## 🔧 Problemas Comuns

### "Não consigo ver o financeiro"

- Verifique se seu perfil é Admin ou Secretaria
- Profissionais não têm acesso ao módulo completo

### "Lançamento recorrente não foi criado"

1. Verifique se está ativo
2. Confirme a data de próxima recorrência
3. Execute processamento manual se necessário

### "Divisão não está funcionando"

1. Confirme se marcou "Dividir entre sócios"
2. Verifique configuração de divisão ativa
3. Use divisão customizada se percentual diferente

### "Relatório não exporta"

1. Reduza período selecionado
2. Remova filtros muito específicos
3. Tente novamente em horário de menor uso

## 📞 Suporte

### Documentação Completa

`docs/SISTEMA_FINANCEIRO_COMPLETO.md`

### Logs de Sistema

- **Lançamentos Recorrentes**: Financeiro > Recorrentes > Histórico
- **Erros de Processamento**: Verificar logs no Supabase

### Backup e Segurança

- Backups automáticos diários (Supabase)
- Soft delete preserva dados
- Auditoria completa de alterações

---

**Dica Final**: Mantenha cadastros atualizados (fornecedores, categorias) para melhor organização e relatórios precisos! 📈
