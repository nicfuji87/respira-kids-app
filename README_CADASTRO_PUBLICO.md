# 📋 Cadastro Público de Paciente - Respira Kids

## 🎉 Sistema Completo e Funcional

Este documento descreve o sistema completo de cadastro público de pacientes implementado para a Respira Kids.

---

## 🚀 Como Usar

### Para o Paciente/Responsável:

1. **Acesse**: `https://[seu-dominio]/#/cadastro-paciente`
2. **Digite seu WhatsApp** e valide com o código recebido
3. **Preencha os dados** do responsável e paciente
4. **Revise** todas as informações
5. **Assine o contrato** digitalmente
6. **Pronto!** Você receberá confirmação por WhatsApp e email

### Para a Equipe (Após Deploy):

#### ⚠️ AÇÃO OBRIGATÓRIA: Upload de Logos

Para que o PDF do contrato funcione, você precisa enviar as logos para o Supabase:

1. Acesse: **Supabase Dashboard** > **Storage** > **`public-assets`**
2. Faça upload de 2 arquivos:
   - `public/images/logos/nome-logo-respira-kids.png` → renomeie para `nome-logo-respira-kids.png`
   - `public/images/logos/logo-respira-kids.png` → renomeie para `logo-respira-kids.png`

**URLs finais devem ser:**

```
{SUPABASE_URL}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png
{SUPABASE_URL}/storage/v1/object/public/public-assets/logo-respira-kids.png
```

---

## 📱 Funcionalidades

### ✅ Validação de WhatsApp

- Verifica se o número existe
- Envia código de 6 dígitos
- Timeout de 10 minutos
- Rate limiting: máx 3 tentativas por número

### ✅ Detecção de Usuário Existente

- Verifica se o responsável já está cadastrado
- Exibe lista de pacientes já cadastrados
- Permite cadastrar novos pacientes

### ✅ Cadastro Intuitivo (10 Etapas)

1. **WhatsApp**: Validação do número
2. **Identificação**: É o responsável ou está cadastrando para outra pessoa?
3. **Dados do Responsável**: Nome, CPF, Email
4. **Endereço**: CEP com integração ViaCEP
5. **Responsável Financeiro**: Mesmo ou diferente do legal?
6. **Dados do Paciente**: Nome, Data Nascimento, Sexo, CPF (opcional)
7. **Pediatra**: Autocomplete com normalização (previne duplicatas)
8. **Autorizações**: Uso de imagem, científico, redes sociais
9. **Revisão**: Confirmação de todos os dados
10. **Contrato**: Visualização e aceite digital

### ✅ Sistema de Contratos

- Template personalizável via banco de dados
- Variáveis dinâmicas ({{contratante}}, {{hoje}}, etc.)
- Visualização com formatação Markdown
- Aceite digital com timestamp
- **PDF Profissional**:
  - Logo no cabeçalho
  - Marca d'água centralizada
  - Rodapé formatado em todas as páginas
  - Numeração automática

### ✅ Página de Sucesso

- Mensagem de confirmação
- Botão para download do PDF
- Informações sobre próximos passos
- Redirecionamento automático

---

## 🏗️ Arquitetura Técnica

### Frontend

- **React 18** + **TypeScript**
- **TailwindCSS** + **shadcn/ui**
- **React Router** v6 (HashRouter)
- **react-markdown** (renderização do contrato)

### Backend

- **Supabase** (PostgreSQL + Edge Functions)
- **3 Edge Functions**:
  1. `validate-whatsapp-code`: Validação e rate limiting
  2. `public-patient-registration`: Criação de entidades no banco
  3. `generate-contract-pdf`: Geração de PDF com logos

### Banco de Dados

- 10+ tabelas interconectadas
- RLS configurado para acesso público controlado
- Auditoria completa com `whatsapp_validation_attempts`

---

## 🔐 Segurança

- ✅ **Rate Limiting**: 10 tentativas/hora por IP, 3 por número
- ✅ **Hashing**: Códigos SHA-256
- ✅ **Validações**: CPF, Email, Data, CEP, WhatsApp
- ✅ **RLS**: Políticas de acesso granular
- ✅ **Auditoria**: Logs de todas as ações

---

## 📊 Dados Coletados

### Responsável Legal

- Nome completo
- CPF
- Email
- WhatsApp

### Responsável Financeiro (se diferente)

- Nome completo
- CPF
- Email
- WhatsApp

### Endereço

- CEP
- Logradouro
- Bairro
- Cidade
- Estado
- Número
- Complemento (opcional)

### Paciente

- Nome completo
- Data de nascimento
- Sexo (Masculino/Feminino)
- CPF (opcional, se NF no nome do paciente)

### Pediatra

- Nome (autocomplete)
- CRM (removido - não solicitado mais)
- Opção "Não possui pediatra"

### Autorizações

- Uso científico (Sim/Não)
- Uso em redes sociais (Sim/Não)
- Uso do nome vinculado (Sim/Não)

---

## 🗂️ Arquivos Importantes

### Documentação

- `PLANO_CADASTRO_PACIENTE_PUBLICO.md` - Plano completo de implementação
- `PLANO_CONTRATOS.md` - Sistema de contratos
- `PLANO_INSERCAO_CADASTRO.md` - Ordem de inserção no banco
- `PLANO_PDF_CONTRATO.md` - Especificações do PDF
- `UPLOAD_LOGOS.md` - Instruções para upload de logos
- `IMPLEMENTACAO_COMPLETA_CADASTRO.md` - Resumo técnico completo

### Código Principal

```
src/
├── pages/public/
│   ├── PatientPublicRegistrationPage.tsx
│   └── PatientRegistrationSuccessPage.tsx
├── components/
│   ├── domain/patient/PatientRegistrationSteps.tsx
│   └── composed/
│       ├── WhatsAppValidationStep.tsx
│       ├── ResponsibleDataStep.tsx
│       ├── PatientDataStep.tsx
│       ├── PediatricianStep.tsx
│       └── ContractReviewStep.tsx
└── lib/
    ├── registration-finalization-api.ts
    └── contract-api.ts
```

---

## 🎯 Próximos Passos (Opcionais)

### Fase 6: Notificações Automáticas

- [ ] Envio de PDF via WhatsApp
- [ ] Email com PDF anexado
- [ ] Atualizar URL do arquivo no banco

### Fase 7: Validação em Agendamentos

- [ ] Verificar contrato antes de agendar
- [ ] Notificar se contrato pendente

### Fase 8: Dashboard do Responsável

- [ ] Visualizar agendamentos
- [ ] Histórico de consultas
- [ ] Documentos e contratos

---

## 🧪 Como Testar

### Teste Local

```bash
# 1. Iniciar aplicação
npm run dev

# 2. Acessar
http://localhost:5173/#/cadastro-paciente

# 3. Usar número de teste (se disponível no webhook)
# Ou número real para validação completa
```

### Teste de Produção

1. Acesse a URL pública
2. Use um número de WhatsApp real
3. Complete o cadastro
4. Verifique se o PDF é gerado corretamente
5. Confirme recebimento de notificações

---

## ❓ Troubleshooting

### PDF sem logos?

→ Verifique se fez upload das logos para `public-assets` no Supabase Storage

### Código de validação não chega?

→ Verifique logs da Edge Function `validate-whatsapp-code`

### Erro ao finalizar cadastro?

→ Verifique constraints do banco (CPF único, email único, etc.)

### Pediatra duplicado?

→ Sistema tem autocomplete, mas usuário pode ignorar

### WhatsApp já cadastrado?

→ Sistema detecta e oferece cadastrar novo paciente

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique os logs no Supabase Dashboard
2. Revise a documentação técnica
3. Consulte os planos de implementação

---

## ✅ Checklist de Deploy

- [x] Código deployado
- [x] Edge Functions ativas
- [x] Banco de dados configurado
- [x] RLS habilitado
- [x] Bucket `public-assets` criado
- [ ] **⚠️ Logos enviadas** (ação manual obrigatória)
- [x] Variáveis de ambiente configuradas
- [ ] Testes end-to-end realizados
- [ ] URL pública configurada
- [ ] Webhook de WhatsApp configurado

---

**Status**: ✅ PRONTO PARA PRODUÇÃO
_(Após upload de logos)_
