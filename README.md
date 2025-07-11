# 🫁 Respira Kids App

> **Sistema de Prontuário Eletrônico Inteligente para Fisioterapia Respiratória Pediátrica**

## 📋 Sobre o Projeto

O **Respira Kids App** é um sistema completo de gestão de pacientes desenvolvido especificamente para clínicas especializadas em fisioterapia respiratória pediátrica. O sistema oferece diferentes níveis de acesso e funcionalidades para gestão de pacientes, agendamentos e prontuários eletrônicos.

## 🚀 Tecnologias Utilizadas

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS 3.4.16
- **Roteamento**: React Router DOM 6
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Linting**: ESLint + Prettier
- **Git Hooks**: Husky + lint-staged
- **CI/CD**: GitHub Actions
- **Bundle Analysis**: rollup-plugin-visualizer

## 🛠️ Funcionalidades Principais

### 👥 Gestão de Usuários

- Sistema de autenticação seguro
- Diferentes níveis de acesso (Admin, Fisioterapeuta, Recepcionista)
- Perfis de usuário personalizados

### 📊 Prontuário Eletrônico

- Registro completo de pacientes
- Histórico médico detalhado
- Acompanhamento de evolução
- Anexos e documentos

### 📅 Sistema de Agendamentos

- Calendário inteligente
- Controle de disponibilidade
- Notificações automáticas
- Gestão de cancelamentos

### 📈 Relatórios e Analytics

- Dashboards interativos
- Relatórios de atendimento
- Métricas de performance
- Exportação de dados

## 🔧 Instalação e Configuração

### Pré-requisitos

- Node.js 18.x ou superior
- npm ou yarn
- Git

### Passos de instalação

1. **Clone o repositório**

   ```bash
   git clone https://github.com/nicfuji87/respira-kids-app.git
   cd respira-kids-app
   ```

2. **Instale as dependências**

   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**

   ```bash
   cp .env.example .env
   # Edite o arquivo .env com suas credenciais do Supabase
   ```

4. **Inicie o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```

## 🧪 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia servidor de desenvolvimento

# Build e Deploy
npm run build        # Build de produção
npm run preview      # Preview do build de produção
npm run analyze      # Análise do bundle

# Qualidade de Código
npm run lint         # Executa linter
npm run lint:fix     # Corrige problemas do linter
npm run format       # Formata código com Prettier

# Git Hooks
npm run prepare      # Configura Husky
```

## 🔒 Segurança e Qualidade

### Proteções Implementadas

- ✅ **Husky + lint-staged**: Validação automática antes dos commits
- ✅ **GitHub Actions**: CI/CD com verificações obrigatórias
- ✅ **ESLint + Prettier**: Padrões de código rigorosos
- ✅ **TypeScript**: Tipagem estática para maior segurança
- ✅ **Audit de Segurança**: Verificação automática de vulnerabilidades

### Pipeline de CI/CD

- Testes automatizados
- Verificação de linting
- Verificação de formatação
- Type checking
- Build de produção
- Auditoria de segurança
- **Bloqueio de merge** em caso de falhas

## 📁 Estrutura do Projeto

```
respira-kids-app/
├── public/
│   └── images/
│       ├── logos/           # Logos da Respira Kids
│       ├── brand/           # Elementos de marca
│       └── assets/          # Recursos visuais
├── src/
│   ├── components/          # Componentes reutilizáveis
│   ├── pages/              # Páginas da aplicação
│   ├── hooks/              # Custom hooks
│   ├── services/           # Serviços e APIs
│   ├── utils/              # Funções utilitárias
│   ├── types/              # Definições de tipos
│   └── styles/             # Estilos globais
├── .github/
│   └── workflows/          # GitHub Actions
├── .husky/                 # Git hooks
└── docs/                   # Documentação
```

## 🎨 Design System

O projeto utiliza um design system baseado em:

- **Cores**: Paleta focada em tons de azul e verde (saúde respiratória)
- **Tipografia**: Fonte legível e acessível
- **Componentes**: Biblioteca de componentes reutilizáveis
- **Responsividade**: Mobile-first approach

## 🔄 Fluxo de Desenvolvimento

1. **Criar branch** para nova feature
2. **Desenvolver** com commits pequenos e descritivos
3. **Testar** localmente
4. **Criar Pull Request**
5. **Aguardar** aprovação do CI/CD
6. **Merge** após aprovação

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Contato

**Respira Kids** - [GitHub](https://github.com/nicfuji87/respira-kids-app)

---

⭐ **Desenvolvido com ❤️ para cuidar da saúde respiratória das crianças** ⭐
