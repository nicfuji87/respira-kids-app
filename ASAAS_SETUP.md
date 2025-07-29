# 🔧 Configuração da Integração Asaas

Este documento explica como configurar a integração com o Asaas para geração de cobranças.

## 📋 Pré-requisitos

1. **Conta no Asaas**: Tenha uma conta ativa no [Asaas](https://www.asaas.com)
2. **API Key do Asaas**: Obtenha sua API key no painel do Asaas
3. **Edge Functions**: Certifique-se de que as Edge Functions estão deployadas no Supabase

## 🚀 Configuração das API Keys

### 1. API Key Global (Recomendado)

Para usar uma API key global para toda a aplicação:

```sql
-- Inserir API key global na tabela api_keys
INSERT INTO public.api_keys (
  service_name,
  encrypted_key,
  is_active,
  created_at
) VALUES (
  'asaas',
  'SUA_API_KEY_DO_ASAAS_AQUI',
  true,
  NOW()
);
```

### 2. API Key Individual por Empresa

Para usar API keys específicas por empresa:

```sql
-- Atualizar empresa com API key individual
UPDATE public.pessoa_empresas 
SET api_token_externo = 'SUA_API_KEY_INDIVIDUAL_AQUI'
WHERE id = 'ID_DA_EMPRESA';
```

## 📊 Deploy das Edge Functions

Deploy das funções necessárias:

```bash
# Navegue até o diretório do projeto
cd respira-kids-app

# Deploy das Edge Functions
supabase functions deploy asaas-search-customer
supabase functions deploy asaas-create-customer
supabase functions deploy asaas-disable-notifications  
supabase functions deploy asaas-create-payment
```

## 🔄 Fluxo de Funcionamento

### 1. Seleção de Consultas
- Usuário navega para "Detalhes do Paciente" → "Lista de Consultas"
- Clica em "Escolher consultas para gerar cobrança"
- Seleciona as consultas desejadas
- Clica em "Gerar cobrança de X consulta(s)"

### 2. Processamento Backend
1. **Verificação de Permissão**: Apenas `admin` e `secretaria` podem gerar cobranças
2. **Determinação da API Key**: 
   - Prioriza API individual da empresa (se usuário admin/secretaria)
   - Fallback para API global
3. **Verificação do Cliente**:
   - Busca `id_asaas` do responsável pela cobrança
   - Se não existir, verifica se cliente já existe no Asaas por CPF
   - Se cliente existir no Asaas: atualiza `id_asaas` no Supabase
   - Se não existir: cria novo cliente no Asaas
   - Sempre atualiza `id_asaas` na tabela `pessoas`
4. **Desabilitação de Notificações**: Remove notificações nativas do Asaas
5. **Criação da Cobrança**:
   - Tipo: PIX apenas
   - Vencimento: 2 dias após a data atual
   - Descrição: Template automático com detalhes das sessões
6. **Vinculação**: Atualiza `id_pagamento_externo` nos agendamentos

### 3. Template de Descrição

A descrição é gerada automaticamente seguindo o template:

```
"X sessões de fisioterapia motora. Atendimento realizado ao paciente [Nome] CPF [CPF], pela [Profissional] CPF [CPF] [Registro]. Nos dias [data] (R$ valor), [data] (R$ valor)"
```

## 🐛 Debug e Logs

### Console do Navegador
- Abra DevTools (F12) → Console
- Logs detalhados aparecem com emojis para fácil identificação:
  - 🚀 Início do processo
  - 👤 Busca de dados do paciente
  - 💳 Criação de cliente
  - 🔕 Desabilitação de notificações
  - 📝 Geração de descrição
  - ✅ Sucesso
  - ❌ Erros

### Logs das Edge Functions
```bash
# Ver logs em tempo real
supabase functions logs asaas-search-customer
supabase functions logs asaas-create-customer
supabase functions logs asaas-disable-notifications
supabase functions logs asaas-create-payment
```

## 🔄 Melhorias Implementadas (v2.0)

### ✅ Verificação de Cliente Existente
O sistema agora verifica se o responsável pela cobrança já possui cadastro no Asaas antes de criar um novo:

1. **Busca por CPF**: Consulta a API do Asaas usando o CPF do responsável
2. **Atualização Automática**: Se encontrar, atualiza o `id_asaas` no Supabase
3. **Criação Inteligente**: Só cria novo cliente se não existir

### ✅ Dados Completos do Profissional
- Busca automática de CPF e registro profissional na descrição da cobrança
- Template mais preciso com CREFITO quando disponível

### ✅ Logs Aprimorados
- Emojis para fácil identificação de cada etapa
- Logs detalhados em todas as operações
- Debugging simplificado

### ✅ API Key Individual Corrigida
- Corrigido erro 406 na busca de API keys por empresa
- Logs detalhados da seleção de API key

## 🛠️ Resolução de Problemas

### Erro: "API key do Asaas não configurada"
- Verifique se inseriu a API key na tabela `api_keys`
- Confirme que `is_active = true`

### Erro: "Responsável pela cobrança não encontrado"
- Verifique se o paciente tem `responsavel_cobranca_id` definido
- Use o seletor "Responsável pela Cobrança" nas Informações Pessoais

### Erro: "Timeout na criação do cliente"
- Verifique conectividade com API do Asaas
- Confirme se a API key está válida

### Erro: "Erro 401 ao criar cliente no Asaas"
- API key inválida ou expirada
- Verifique permissões da API key no painel do Asaas

### Erro: "Failed to send a request to the Edge Function" (CORS)
- Edge Functions não estão deployadas
- Execute: `supabase functions deploy [nome-da-funcao]`
- Verifique se o projeto Supabase está configurado corretamente

### Erro: "Erro na comunicação com o serviço de criação de cliente"
- Verifique se todas as Edge Functions foram deployadas
- Confirme se o Supabase CLI está configurado
- Teste as funções individualmente nos logs

## 📚 Recursos Adicionais

- [Documentação API Asaas](https://docs.asaas.com/)
- [Painel do Asaas](https://www.asaas.com/login)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## 🚦 Ambiente de Teste

Para testar em ambiente sandbox do Asaas:

1. Use API key de sandbox
2. Modifique `baseUrl` nas Edge Functions para sandbox:
   ```typescript
   baseUrl: 'https://sandbox.asaas.com/api/v3'
   ```
3. Consultas criadas não geram cobranças reais

---

**⚠️ Importante**: Mantenha suas API keys seguras e nunca as exponha em código front-end. 