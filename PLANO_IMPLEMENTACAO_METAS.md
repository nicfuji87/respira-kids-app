# 📊 Plano de Implementação: Sistema de Metas - Respira Kids

## 🎯 Objetivo

Implementar um sistema completo de gestão de metas individuais e por equipe, com acompanhamento em tempo real, notificações automáticas e relatórios comparativos.

---

## 📋 Análise do Contexto Atual

### Dados do Sistema

- **Profissionais ativos:** 3
  - Bruna Cury Lourenço Peres (103 agendamentos/mês)
  - Beatriz Perisse (60 agendamentos/mês)
  - Flávia da Silva Pacheco (59 agendamentos/mês)

- **Agendamentos:**
  - Total: 6.506
  - Finalizados: 5.817
  - Agendados: 472
  - Confirmados: 170

- **Evoluções:**
  - Total: 159
  - Agendamentos com evolução: 141
  - Profissionais que fizeram evoluções: 3

### Estrutura Existente

- ✅ Tabela `pessoas` com roles (admin, profissional, secretaria)
- ✅ Tabela `agendamentos` com status de consulta
- ✅ Tabela `relatorio_evolucao` para evoluções
- ✅ Sistema de webhooks configurado
- ✅ Dashboard existente
- ✅ Sistema de notificações push

---

## 🏗️ Arquitetura do Sistema de Metas

### 1. Estrutura de Banco de Dados

#### Tabela: `metas`

```sql
CREATE TABLE metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo_meta_id UUID NOT NULL REFERENCES tipos_meta(id),

  -- Escopo (individual ou equipe)
  escopo TEXT NOT NULL CHECK (escopo IN ('individual', 'equipe')),
  pessoa_id UUID REFERENCES pessoas(id), -- NULL se for equipe
  equipe_id UUID REFERENCES equipes(id), -- NULL se for individual

  -- Período
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  mes_referencia INTEGER NOT NULL, -- 1-12
  ano_referencia INTEGER NOT NULL,

  -- Valores da meta
  valor_meta NUMERIC(10,2) NOT NULL,
  valor_minimo NUMERIC(10,2), -- Opcional
  valor_maximo NUMERIC(10,2), -- Opcional
  valor_atual NUMERIC(10,2) DEFAULT 0,
  unidade_medida TEXT NOT NULL, -- 'consultas', 'evolucoes', 'percentual', etc

  -- Status e controle
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'concluida', 'cancelada')),
  obrigatoria BOOLEAN DEFAULT false,
  ajustavel BOOLEAN DEFAULT true, -- Permite ajuste durante o período

  -- Bonificação
  tem_bonificacao BOOLEAN DEFAULT false,
  valor_bonificacao NUMERIC(10,2),
  tipo_bonificacao TEXT CHECK (tipo_bonificacao IN ('fixo', 'percentual')),

  -- Auditoria
  criado_por UUID NOT NULL REFERENCES pessoas(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  aprovado_por UUID REFERENCES pessoas(id),
  aprovado_em TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_metas_pessoa ON metas(pessoa_id) WHERE pessoa_id IS NOT NULL;
CREATE INDEX idx_metas_equipe ON metas(equipe_id) WHERE equipe_id IS NOT NULL;
CREATE INDEX idx_metas_periodo ON metas(ano_referencia, mes_referencia);
CREATE INDEX idx_metas_status ON metas(status);
CREATE INDEX idx_metas_tipo ON metas(tipo_meta_id);
```

#### Tabela: `tipos_meta`

```sql
CREATE TABLE tipos_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL, -- 'consultas_realizadas', 'evolucoes_realizadas', 'taxa_retencao', etc
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN ('atendimento', 'qualidade', 'produtividade')),
  unidade_medida TEXT NOT NULL,
  formula_calculo TEXT, -- SQL ou descrição da fórmula
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tipos padrão sugeridos baseados nos dados
INSERT INTO tipos_meta (codigo, nome, descricao, categoria, unidade_medida, formula_calculo) VALUES
('consultas_realizadas', 'Consultas Realizadas', 'Número de consultas finalizadas no período', 'atendimento', 'consultas', 'COUNT agendamentos com status_consulta = finalizado'),
('consultas_agendadas', 'Consultas Agendadas', 'Número de consultas agendadas no período', 'atendimento', 'consultas', 'COUNT agendamentos com status_consulta = agendado'),
('evolucoes_realizadas', 'Evoluções Realizadas', 'Número de evoluções registradas no período', 'produtividade', 'evolucoes', 'COUNT relatorio_evolucao'),
('taxa_retencao_pacientes', 'Taxa de Retenção', 'Percentual de pacientes que retornam', 'qualidade', 'percentual', 'CALCULAR retorno de pacientes'),
('taxa_comparecimento', 'Taxa de Comparecimento', 'Percentual de consultas que não foram faltas', 'qualidade', 'percentual', 'CALCULAR comparecimento vs faltas');
```

#### Tabela: `equipes`

```sql
CREATE TABLE equipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  lider_id UUID REFERENCES pessoas(id),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de membros da equipe
CREATE TABLE equipe_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id UUID NOT NULL REFERENCES equipes(id),
  pessoa_id UUID NOT NULL REFERENCES pessoas(id),
  data_entrada DATE DEFAULT CURRENT_DATE,
  data_saida DATE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(equipe_id, pessoa_id, data_entrada)
);
```

#### Tabela: `meta_historico`

```sql
CREATE TABLE meta_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id UUID NOT NULL REFERENCES metas(id),
  valor_anterior NUMERIC(10,2),
  valor_novo NUMERIC(10,2),
  motivo TEXT,
  alterado_por UUID NOT NULL REFERENCES pessoas(id),
  alterado_em TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabela: `meta_ajustes`

```sql
CREATE TABLE meta_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id UUID NOT NULL REFERENCES metas(id),
  valor_anterior NUMERIC(10,2) NOT NULL,
  valor_novo NUMERIC(10,2) NOT NULL,
  motivo TEXT NOT NULL,
  aprovado BOOLEAN DEFAULT false,
  aprovado_por UUID REFERENCES pessoas(id),
  aprovado_em TIMESTAMPTZ,
  solicitado_por UUID NOT NULL REFERENCES pessoas(id),
  solicitado_em TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tabela: `meta_acompanhamento`

```sql
CREATE TABLE meta_acompanhamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id UUID NOT NULL REFERENCES metas(id),
  data_referencia DATE NOT NULL,
  valor_atual NUMERIC(10,2) NOT NULL,
  percentual_atingido NUMERIC(5,2) NOT NULL,
  dias_restantes INTEGER NOT NULL,
  projecao_final NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meta_id, data_referencia)
);
```

#### View: `vw_metas_dashboard`

```sql
CREATE VIEW vw_metas_dashboard AS
SELECT
  m.id,
  m.titulo,
  m.escopo,
  m.pessoa_id,
  p.nome as pessoa_nome,
  m.equipe_id,
  e.nome as equipe_nome,
  tm.codigo as tipo_meta_codigo,
  tm.nome as tipo_meta_nome,
  tm.categoria,
  m.periodo_inicio,
  m.periodo_fim,
  m.mes_referencia,
  m.ano_referencia,
  m.valor_meta,
  m.valor_atual,
  m.unidade_medida,
  m.status,
  m.obrigatoria,
  m.tem_bonificacao,
  m.valor_bonificacao,
  -- Cálculos
  ROUND((m.valor_atual / NULLIF(m.valor_meta, 0)) * 100, 2) as percentual_atingido,
  (m.periodo_fim - CURRENT_DATE) as dias_restantes,
  CASE
    WHEN m.valor_atual >= m.valor_meta THEN 'atingida'
    WHEN m.valor_atual >= COALESCE(m.valor_minimo, m.valor_meta * 0.8) THEN 'em_andamento'
    ELSE 'atrasada'
  END as status_atingimento
FROM metas m
LEFT JOIN pessoas p ON p.id = m.pessoa_id
LEFT JOIN equipes e ON e.id = m.equipe_id
LEFT JOIN tipos_meta tm ON tm.id = m.tipo_meta_id
WHERE m.status = 'ativa';
```

---

## 📊 Tipos de Metas Sugeridas

### 1. Metas de Atendimento

#### 1.1 Consultas Realizadas

- **Código:** `consultas_realizadas`
- **Unidade:** Consultas
- **Cálculo:** COUNT de agendamentos com `status_consulta = 'finalizado'` no período
- **Sugestão baseada em dados:**
  - Bruna: 100-120 consultas/mês
  - Beatriz: 60-80 consultas/mês
  - Flávia: 60-80 consultas/mês

#### 1.2 Consultas Agendadas

- **Código:** `consultas_agendadas`
- **Unidade:** Consultas
- **Cálculo:** COUNT de agendamentos com `status_consulta = 'agendado'` no período

### 2. Metas de Produtividade

#### 2.1 Evoluções Realizadas

- **Código:** `evolucoes_realizadas`
- **Unidade:** Evoluções
- **Cálculo:** COUNT de `relatorio_evolucao` no período
- **Sugestão:** 1 evolução por consulta finalizada (meta de qualidade)

### 3. Metas de Qualidade

#### 3.1 Taxa de Retenção de Pacientes

- **Código:** `taxa_retencao_pacientes`
- **Unidade:** Percentual
- **Cálculo:** (Pacientes que retornaram / Total de pacientes) \* 100
- **Sugestão:** 70-80%

#### 3.2 Taxa de Comparecimento

- **Código:** `taxa_comparecimento`
- **Unidade:** Percentual
- **Cálculo:** (Consultas realizadas / Consultas agendadas) \* 100
- **Sugestão:** 85-95%

---

## 🔄 Fluxo de Implementação

### Fase 1: Estrutura Base (Semana 1)

#### 1.1 Migrações de Banco de Dados

- [ ] Criar tabela `tipos_meta`
- [ ] Inserir tipos de meta padrão
- [ ] Criar tabela `equipes`
- [ ] Criar tabela `equipe_membros`
- [ ] Criar tabela `metas`
- [ ] Criar tabela `meta_historico`
- [ ] Criar tabela `meta_ajustes`
- [ ] Criar tabela `meta_acompanhamento`
- [ ] Criar view `vw_metas_dashboard`
- [ ] Criar índices e constraints
- [ ] Configurar RLS (Row Level Security)

#### 1.2 Types TypeScript

- [ ] Criar `src/types/metas.ts` com interfaces:
  - `Meta`
  - `TipoMeta`
  - `Equipe`
  - `MetaAcompanhamento`
  - `MetaAjuste`
  - `CreateMeta`
  - `UpdateMeta`

### Fase 2: APIs e Serviços (Semana 1-2)

#### 2.1 API de Metas

- [ ] Criar `src/lib/metas-api.ts`:
  - `fetchMetas(filters)`
  - `fetchMetaById(id)`
  - `createMeta(data)`
  - `updateMeta(id, data)`
  - `deleteMeta(id)`
  - `fetchMetasPorPessoa(pessoaId, periodo)`
  - `fetchMetasPorEquipe(equipeId, periodo)`

#### 2.2 API de Tipos de Meta

- [ ] Criar `src/lib/tipos-meta-api.ts`:
  - `fetchTiposMeta()`
  - `createTipoMeta(data)`
  - `updateTipoMeta(id, data)`

#### 2.3 API de Equipes

- [ ] Criar `src/lib/equipes-api.ts`:
  - `fetchEquipes()`
  - `createEquipe(data)`
  - `addMembroEquipe(equipeId, pessoaId)`
  - `removeMembroEquipe(equipeId, pessoaId)`

#### 2.4 Cálculo de Valores

- [ ] Criar `src/lib/calculo-metas.ts`:
  - `calcularValorAtual(meta)` - Calcula valor atual baseado no tipo
  - `calcularProjecao(meta)` - Projeta valor final
  - `atualizarValorMeta(metaId)` - Atualiza valor atual de uma meta

#### 2.5 Funções SQL para Cálculo

- [ ] Criar função `fn_calcular_consultas_realizadas(pessoa_id, periodo_inicio, periodo_fim)`
- [ ] Criar função `fn_calcular_evolucoes_realizadas(pessoa_id, periodo_inicio, periodo_fim)`
- [ ] Criar função `fn_calcular_taxa_retencao(pessoa_id, periodo_inicio, periodo_fim)`
- [ ] Criar função `fn_calcular_taxa_comparecimento(pessoa_id, periodo_inicio, periodo_fim)`

### Fase 3: Componentes Composed (Semana 2)

#### 3.1 Componentes de Formulário

- [ ] `src/components/composed/MetaForm.tsx`
  - Formulário para criar/editar meta
  - Seleção de tipo, escopo, período
  - Validação de valores mínimos/máximos
  - Campos de bonificação

- [ ] `src/components/composed/TipoMetaForm.tsx`
  - Formulário para criar/editar tipo de meta

- [ ] `src/components/composed/EquipeForm.tsx`
  - Formulário para criar/editar equipe
  - Seleção de membros

#### 3.2 Componentes de Visualização

- [ ] `src/components/composed/MetaCard.tsx`
  - Card com informações da meta
  - Barra de progresso
  - Status visual

- [ ] `src/components/composed/MetaProgressBar.tsx`
  - Barra de progresso animada
  - Indicadores de status

- [ ] `src/components/composed/MetaList.tsx`
  - Lista de metas com filtros
  - Ordenação e paginação

#### 3.3 Componentes de Acompanhamento

- [ ] `src/components/composed/MetaAcompanhamentoChart.tsx`
  - Gráfico de evolução da meta
  - Projeção de conclusão

- [ ] `src/components/composed/MetaComparativo.tsx`
  - Comparação entre períodos
  - Comparação entre pessoas/equipes

### Fase 4: Componentes Domain (Semana 2-3)

#### 4.1 Gerenciamento de Metas

- [ ] `src/components/domain/metas/MetaManagement.tsx`
  - CRUD completo de metas
  - Acesso apenas para admin
  - Integração com MetaForm e MetaList

#### 4.2 Dashboard de Metas

- [ ] `src/components/domain/metas/MetasDashboard.tsx`
  - Visão geral de todas as metas
  - Filtros por pessoa, equipe, período
  - Gráficos e estatísticas

#### 4.3 Acompanhamento Individual

- [ ] `src/components/domain/metas/MetaAcompanhamentoIndividual.tsx`
  - Visualização das próprias metas
  - Progresso em tempo real
  - Histórico de ajustes

#### 4.4 Acompanhamento de Equipe

- [ ] `src/components/domain/metas/MetaAcompanhamentoEquipe.tsx`
  - Metas da equipe
  - Comparação entre membros
  - Ranking de desempenho

#### 4.5 Gerenciamento de Tipos

- [ ] `src/components/domain/metas/TipoMetaManagement.tsx`
  - CRUD de tipos de meta
  - Acesso apenas para admin

#### 4.6 Gerenciamento de Equipes

- [ ] `src/components/domain/metas/EquipeManagement.tsx`
  - CRUD de equipes
  - Gerenciamento de membros
  - Acesso apenas para admin

### Fase 5: Páginas e Rotas (Semana 3)

#### 5.1 Páginas

- [ ] `src/pages/MetasPage.tsx`
  - Página principal de metas
  - Tabs: Minhas Metas, Equipe, Gerenciar (admin)
  - Integração com componentes domain

- [ ] `src/pages/MetasAdminPage.tsx`
  - Página de administração (apenas admin)
  - Gerenciamento de tipos, equipes, todas as metas

#### 5.2 Rotas

- [ ] Adicionar rotas em `src/App.tsx`:
  - `/metas` - Página principal
  - `/metas/admin` - Administração (apenas admin)

#### 5.3 Navegação

- [ ] Adicionar item "Metas" no menu:
  - Admin: Sempre visível
  - Profissional: Sempre visível
  - Secretaria: Sempre visível

### Fase 6: Atualização Automática (Semana 3-4)

#### 6.1 Cron Job para Atualização

- [ ] Criar função SQL `fn_atualizar_valores_metas()`
- [ ] Criar cron job para executar diariamente:
  ```sql
  SELECT cron.schedule(
    'atualizar-metas-diario',
    '0 1 * * *', -- Todo dia às 1h
    $$SELECT fn_atualizar_valores_metas()$$
  );
  ```

#### 6.2 Trigger para Atualização em Tempo Real

- [ ] Criar trigger em `agendamentos`:
  - Ao finalizar consulta → atualizar meta de consultas
- [ ] Criar trigger em `relatorio_evolucao`:
  - Ao criar evolução → atualizar meta de evoluções

#### 6.3 Função de Cálculo Automático

- [ ] Criar função `fn_atualizar_meta(meta_id)`:
  - Calcula valor atual baseado no tipo
  - Atualiza `valor_atual` na tabela `metas`
  - Insere registro em `meta_acompanhamento`
  - Verifica se meta foi atingida

### Fase 7: Notificações (Semana 4)

#### 7.1 Notificações Push

- [ ] Integrar com sistema de push existente
- [ ] Criar tipos de notificação:
  - `meta_criada`
  - `meta_atualizada`
  - `meta_proxima_vencimento` (7 dias antes)
  - `meta_atingida`
  - `meta_ajustada`

#### 7.2 Webhooks

- [ ] Adicionar evento `meta_atingida` ao webhook configurado
- [ ] Adicionar evento `meta_proxima_vencimento` ao webhook
- [ ] Criar payloads para webhooks de metas

#### 7.3 Alertas

- [ ] Criar função `fn_verificar_metas_proximas_vencimento()`
- [ ] Cron job semanal para verificar:
  ```sql
  SELECT cron.schedule(
    'verificar-metas-vencimento',
    '0 9 * * 1', -- Toda segunda às 9h
    $$SELECT fn_verificar_metas_proximas_vencimento()$$
  );
  ```

### Fase 8: Relatórios (Semana 4-5)

#### 8.1 Relatórios de Metas

- [ ] `src/components/domain/metas/MetaRelatorio.tsx`
  - Relatório de desempenho individual
  - Relatório de desempenho de equipe
  - Comparação entre períodos
  - Gráficos e estatísticas

#### 8.2 Views SQL para Relatórios

- [ ] Criar view `vw_metas_relatorio_periodo`
- [ ] Criar view `vw_metas_relatorio_comparativo`
- [ ] Criar view `vw_metas_ranking`

#### 8.3 Exportação

- [ ] Função para exportar relatório em CSV (se necessário no futuro)

### Fase 9: Ajustes e Bonificações (Semana 5)

#### 9.1 Sistema de Ajustes

- [ ] `src/components/domain/metas/MetaAjusteDialog.tsx`
  - Dialog para solicitar ajuste de meta
  - Campo de motivo obrigatório
  - Aprovação (se necessário)

#### 9.2 Sistema de Bonificações

- [ ] Campo de bonificação já na estrutura
- [ ] Cálculo automático de bonificação ao atingir meta
- [ ] Registro de bonificações (tabela separada se necessário)

### Fase 10: Testes e Validação (Semana 5-6)

#### 10.1 Testes de Integração

- [ ] Testar criação de metas individuais
- [ ] Testar criação de metas de equipe
- [ ] Testar cálculo automático de valores
- [ ] Testar notificações
- [ ] Testar ajustes de meta

#### 10.2 Validação de Dados

- [ ] Validar cálculos com dados reais
- [ ] Verificar performance de queries
- [ ] Testar RLS e permissões

---

## 🔔 Sistema de Notificações

### Eventos de Webhook

#### 1. Meta Criada

```json
{
  "tipo": "meta_criada",
  "timestamp": "2025-11-14T10:00:00Z",
  "data": {
    "meta_id": "uuid",
    "titulo": "Consultas Realizadas - Novembro 2025",
    "pessoa_id": "uuid",
    "pessoa_nome": "Bruna Cury",
    "valor_meta": 100,
    "periodo_fim": "2025-11-30"
  }
}
```

#### 2. Meta Próxima do Vencimento (7 dias)

```json
{
  "tipo": "meta_proxima_vencimento",
  "timestamp": "2025-11-14T10:00:00Z",
  "data": {
    "meta_id": "uuid",
    "titulo": "Consultas Realizadas - Novembro 2025",
    "pessoa_id": "uuid",
    "pessoa_nome": "Bruna Cury",
    "valor_meta": 100,
    "valor_atual": 75,
    "percentual_atingido": 75,
    "dias_restantes": 7
  }
}
```

#### 3. Meta Atingida

```json
{
  "tipo": "meta_atingida",
  "timestamp": "2025-11-14T10:00:00Z",
  "data": {
    "meta_id": "uuid",
    "titulo": "Consultas Realizadas - Novembro 2025",
    "pessoa_id": "uuid",
    "pessoa_nome": "Bruna Cury",
    "valor_meta": 100,
    "valor_atual": 100,
    "percentual_atingido": 100,
    "tem_bonificacao": true,
    "valor_bonificacao": 500
  }
}
```

---

## 📈 Sugestões de Metas Iniciais

### Metas Individuais Sugeridas (Baseadas em Dados)

#### Para Bruna Cury Lourenço Peres

- **Consultas Realizadas:** 100-120/mês
- **Evoluções Realizadas:** 100-120/mês (1 por consulta)
- **Taxa de Comparecimento:** 90%

#### Para Beatriz Perisse

- **Consultas Realizadas:** 60-80/mês
- **Evoluções Realizadas:** 60-80/mês
- **Taxa de Comparecimento:** 90%

#### Para Flávia da Silva Pacheco

- **Consultas Realizadas:** 60-80/mês
- **Evoluções Realizadas:** 60-80/mês
- **Taxa de Comparecimento:** 90%

### Metas de Equipe (Se Criar Equipe "Fisioterapeutas")

- **Total de Consultas:** 220-280/mês
- **Total de Evoluções:** 220-280/mês
- **Taxa de Retenção:** 75%

---

## 🎨 Interface do Usuário

### Dashboard de Metas

#### Visão Individual

- Cards com cada meta
- Barra de progresso visual
- Percentual atingido
- Dias restantes
- Gráfico de evolução semanal

#### Visão de Equipe

- Lista de membros
- Metas da equipe
- Ranking de desempenho
- Comparação entre membros

#### Visão Admin

- Todas as metas do sistema
- Filtros avançados
- Criação/edição de metas
- Gerenciamento de tipos e equipes

---

## 🔒 Permissões e Segurança

### RLS (Row Level Security)

#### Tabela `metas`

- **SELECT:**
  - Próprias metas (pessoa_id = auth.uid())
  - Metas da equipe (se membro)
  - Todas (se admin)
- **INSERT:** Apenas admin
- **UPDATE:**
  - Ajustes: próprio usuário
  - Outros: apenas admin
- **DELETE:** Apenas admin

#### Tabela `equipes`

- **SELECT:** Todos podem ver equipes ativas
- **INSERT/UPDATE/DELETE:** Apenas admin

---

## 📝 Observações Importantes

### Sobre Períodos

- **Sugestão:** Período mensal é ideal para começar
- **Múltiplos períodos:** Permitir, mas focar no período atual
- **Histórico:** Manter todos os períodos para comparação

### Sobre Acompanhamento

- **Semanal:** Atualização automática diária, visualização semanal
- **Notificações:** Push semanal com resumo de progresso

### Sobre Ajustes

- **Permitir ajustes:** Sim, mas registrar motivo
- **Aprovação:** Não necessária inicialmente, mas registrar quem ajustou

### Sobre Bonificações

- **Estrutura pronta:** Campos na tabela
- **Implementação futura:** Pode ser integrado com sistema financeiro depois

---

## 🚀 Próximos Passos

1. **Revisar plano** com equipe
2. **Priorizar fases** conforme necessidade
3. **Criar equipes** iniciais (se necessário)
4. **Definir metas iniciais** para novembro/dezembro 2025
5. **Iniciar Fase 1** - Estrutura Base

---

## 📚 Referências Técnicas

### Arquitetura Seguida

- ✅ Padrão: PRIMITIVE > COMPOSED > DOMAIN > TEMPLATE
- ✅ Integração com sistema existente
- ✅ Reutilização de componentes
- ✅ TypeScript para type safety
- ✅ Supabase para backend

### Integrações Existentes

- ✅ Sistema de webhooks
- ✅ Sistema de notificações push
- ✅ Dashboard responsivo
- ✅ Sistema de agendamentos
- ✅ Sistema de evoluções

---

**Data de Criação:** 14/11/2025  
**Versão:** 1.0  
**Status:** Plano de Implementação
