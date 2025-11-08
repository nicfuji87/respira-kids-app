# 📊 Documentação Sistema Financeiro Respira Kids

Bem-vindo à documentação completa do Sistema Financeiro Respira Kids. Este sistema foi desenvolvido para atender todas as necessidades de gestão financeira da clínica, desde o controle básico de despesas até relatórios gerenciais avançados.

## 📚 Documentos Disponíveis

### 1. [Sistema Financeiro Completo](./SISTEMA_FINANCEIRO_COMPLETO.md)

Documentação técnica detalhada incluindo:

- Arquitetura completa do sistema
- Descrição de todas as funcionalidades
- Guias de uso passo a passo
- Referência técnica de tabelas e componentes

### 2. [Guia de Início Rápido](./FINANCEIRO_QUICK_START.md)

Para começar rapidamente:

- Primeiros passos e configurações
- Fluxos principais do dia a dia
- Checklist de tarefas diárias/semanais
- Atalhos e dicas úteis

### 3. [Lançamentos Recorrentes](./LANCAMENTOS_RECORRENTES.md)

Documentação específica sobre:

- Configuração de despesas fixas
- Processamento automático
- Configuração do cron job
- Monitoramento e logs

### 4. [Queries SQL Úteis](./FINANCEIRO_SQL_QUERIES.md)

Consultas SQL para:

- Dashboard e relatórios
- Análises gerenciais
- Troubleshooting
- Manutenção do sistema

## 🎯 Objetivos do Sistema

O Sistema Financeiro foi projetado para:

1. **Automatizar** processos repetitivos (lançamentos recorrentes, divisão entre sócios)
2. **Centralizar** todas as informações financeiras em um único lugar
3. **Facilitar** a tomada de decisões com dashboards e relatórios
4. **Integrar** com sistemas externos (IA para processamento de notas)
5. **Garantir** compliance e auditoria com rastreabilidade completa

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │     │   Integrações   │
│   React/TS      │────▶│   Supabase      │────▶│   n8n + IA      │
│   Componentes   │     │   PostgreSQL    │     │   Cron Jobs     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 🔑 Principais Funcionalidades

### Controle de Lançamentos

- ✅ Despesas e receitas com múltiplos itens
- ✅ Upload de documentos fiscais
- ✅ Parcelamento automático
- ✅ Categorização contábil hierárquica

### Contas a Pagar/Receber

- ✅ Gestão de vencimentos
- ✅ Alertas automáticos
- ✅ Registro de pagamentos
- ✅ Múltiplas formas de pagamento

### Divisão entre Sócios

- ✅ Configurável por período
- ✅ Percentuais customizáveis
- ✅ Relatórios individualizados
- ✅ Cálculo automático

### Automações

- ✅ Lançamentos recorrentes
- ✅ Processamento de notas por IA
- ✅ Geração de contas automática
- ✅ Alertas de vencimento

### Relatórios e Dashboard

- ✅ Visão em tempo real
- ✅ Gráficos interativos
- ✅ Exportação para CSV
- ✅ Análises comparativas

## 👥 Perfis de Usuário

### Admin

- Acesso total ao sistema
- Configurações avançadas
- Relatórios gerenciais
- Gestão de usuários

### Secretaria

- Lançamentos e pagamentos
- Validação de pré-lançamentos
- Cadastros auxiliares
- Sem acesso a relatórios

### Profissional

- Visualiza comissões
- Acompanha divisões
- Sem acesso ao financeiro geral

## 🚀 Como Começar

1. **Configure os cadastros básicos**
   - Categorias contábeis
   - Formas de pagamento
   - Contas bancárias
   - Fornecedores

2. **Defina a divisão entre sócios**
   - Percentuais padrão
   - Período de vigência

3. **Cadastre lançamentos recorrentes**
   - Despesas fixas mensais
   - Configure processamento automático

4. **Comece a lançar**
   - Despesas do dia a dia
   - Receitas da clínica

5. **Acompanhe pelo dashboard**
   - Métricas em tempo real
   - Alertas de vencimento

## 🔧 Manutenção

### Backup

- Automático diário (Supabase)
- Exportação manual via relatórios

### Monitoramento

- Logs de processamento recorrente
- Dashboard de sistema (Supabase)
- Alertas por email (configurável)

### Atualizações

- Versionamento semântico
- Changelog documentado
- Testes antes de produção

## 📞 Suporte

### Problemas Comuns

Consulte o [Guia de Início Rápido](./FINANCEIRO_QUICK_START.md#-problemas-comuns)

### Dúvidas Técnicas

Veja a [Documentação Completa](./SISTEMA_FINANCEIRO_COMPLETO.md)

### Queries e Relatórios

Use as [Queries SQL](./FINANCEIRO_SQL_QUERIES.md)

## 🔄 Atualizações Recentes

### v1.0.0 (Novembro 2024)

- ✨ Lançamento inicial do sistema completo
- 🚀 Dashboard financeiro com gráficos
- 💰 Gestão completa de contas a pagar
- 🤖 Integração com IA para pré-lançamentos
- 🔄 Lançamentos recorrentes automáticos
- 📊 Relatórios gerenciais exportáveis
- 👥 Divisão configurável entre sócios

## 🎯 Roadmap

### Próximas Funcionalidades

- [ ] App mobile para aprovações
- [ ] Integração com bancos (OFX)
- [ ] Previsão de fluxo de caixa
- [ ] Orçamento vs Realizado
- [ ] API pública para integrações

---

**Sistema Financeiro Respira Kids** - Gestão financeira inteligente e automatizada 💚

_Última atualização: Novembro 2024_
