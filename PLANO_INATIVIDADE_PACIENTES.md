# 📋 Plano de Implementação: Sistema de Inatividade de Pacientes

## 🎯 Objetivo

Sistema para identificar e gerenciar pacientes inativos, permitindo que secretaria entre em contato com responsáveis e controle quem não deve ser contatado.

---

## 📊 Estrutura de Dados

### 1. Campo JSONB em `pessoas`

**Campo:** `controle_inatividade JSONB`

**Estrutura do JSON:**

```json
{
  "tipo_paciente": "respiratorio" | "motor" | "indefinido",
  "nao_contatar": false,
  "motivo_nao_contatar": null | "solicitado" | "fora_janela" | "outro",
  "observacoes_controle": null | "texto livre"
}
```

**Exemplos:**

```json
// Paciente respiratório normal
{
  "tipo_paciente": "respiratorio",
  "nao_contatar": false,
  "motivo_nao_contatar": null,
  "observacoes_controle": null
}

// Paciente motor marcado para não contatar
{
  "tipo_paciente": "motor",
  "nao_contatar": true,
  "motivo_nao_contatar": "solicitado",
  "observacoes_controle": "Responsável pediu para não entrar em contato"
}
```

---

### 2. Tabela Genérica `pessoa_eventos`

**Propósito:** Armazenar qualquer tipo de evento/interação com pessoas (contatos, lembretes, follow-ups, etc.)

**Estrutura:**

```sql
CREATE TABLE pessoa_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  responsavel_id UUID REFERENCES pessoas(id),

  -- Classificação do evento
  tipo_evento TEXT NOT NULL, -- 'contato_inatividade', 'followup', 'lembrete', 'marketing', etc
  categoria TEXT, -- 'inatividade', 'clinico', 'marketing', 'administrativo'

  -- Dados do evento
  data_evento TIMESTAMPTZ DEFAULT now(),
  metodo TEXT, -- 'whatsapp', 'email', 'telefone', 'presencial', 'sistema'
  contatado_por UUID REFERENCES pessoas(id),

  -- Dados flexíveis em JSONB (específicos por tipo de evento)
  dados_evento JSONB DEFAULT '{}'::jsonb,

  -- Observações livres
  observacoes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Índices:**

```sql
CREATE INDEX idx_pessoa_eventos_pessoa ON pessoa_eventos(pessoa_id);
CREATE INDEX idx_pessoa_eventos_tipo ON pessoa_eventos(tipo_evento);
CREATE INDEX idx_pessoa_eventos_categoria ON pessoa_eventos(categoria);
CREATE INDEX idx_pessoa_eventos_data ON pessoa_eventos(data_evento DESC);
CREATE INDEX idx_pessoa_eventos_pessoa_tipo ON pessoa_eventos(pessoa_id, tipo_evento);
```

**Exemplo de registro para contato de inatividade:**

```json
{
  "pessoa_id": "uuid-do-paciente",
  "responsavel_id": "uuid-do-responsavel",
  "tipo_evento": "contato_inatividade",
  "categoria": "inatividade",
  "data_evento": "2025-01-20T10:00:00Z",
  "metodo": "whatsapp",
  "contatado_por": "uuid-da-secretaria",
  "dados_evento": {
    "dias_inativos": 185,
    "alerta": "alerta_180",
    "tipo_paciente": "respiratorio",
    "template_usado": "respiratorio_180",
    "mensagem_enviada": "Olá Maria, notamos que João não compareceu há 6 meses...",
    "status": "contatado",
    "resultado": "agendado",
    "proximo_contato": "2025-07-20T00:00:00Z"
  },
  "observacoes": "Responsável confirmou interesse em retornar"
}
```

---

## 🔧 Funções SQL

### 1. Função para Identificar Tipo de Paciente

```sql
CREATE OR REPLACE FUNCTION identificar_tipo_paciente(p_paciente_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total_respiratorio INTEGER;
  v_total_motor INTEGER;
  v_tipo TEXT;
BEGIN
  -- Contar consultas respiratórias
  SELECT COUNT(*) INTO v_total_respiratorio
  FROM agendamentos a
  JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
  WHERE a.paciente_id = p_paciente_id
    AND a.ativo = true
    AND ts.nome ILIKE '%respiratória%';

  -- Contar consultas motoras
  SELECT COUNT(*) INTO v_total_motor
  FROM agendamentos a
  JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
  WHERE a.paciente_id = p_paciente_id
    AND a.ativo = true
    AND ts.nome ILIKE '%motora%';

  -- Determinar tipo predominante
  IF v_total_motor > v_total_respiratorio THEN
    RETURN 'motor';
  ELSIF v_total_respiratorio > v_total_motor THEN
    RETURN 'respiratorio';
  ELSE
    -- Empate ou nenhum: usar último serviço
    SELECT
      CASE
        WHEN ts.nome ILIKE '%motora%' THEN 'motor'
        WHEN ts.nome ILIKE '%respiratória%' THEN 'respiratorio'
        ELSE 'indefinido'
      END
    INTO v_tipo
    FROM agendamentos a
    JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
    WHERE a.paciente_id = p_paciente_id
      AND a.ativo = true
    ORDER BY a.data_hora DESC
    LIMIT 1;

    RETURN COALESCE(v_tipo, 'indefinido');
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

### 2. View `vw_pacientes_inativos`

```sql
CREATE OR REPLACE VIEW vw_pacientes_inativos AS
WITH ultima_consulta AS (
  SELECT
    paciente_id,
    MAX(data_hora) as data_ultima_consulta
  FROM agendamentos
  WHERE status_consulta_id = (SELECT id FROM consulta_status WHERE codigo = 'finalizado')
    AND ativo = true
  GROUP BY paciente_id
),
dias_inativos AS (
  SELECT
    p.id as paciente_id,
    uc.data_ultima_consulta,
    CASE
      WHEN uc.data_ultima_consulta IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM (CURRENT_DATE - uc.data_ultima_consulta::date))::INTEGER
    END as dias_sem_consulta
  FROM pessoas p
  LEFT JOIN ultima_consulta uc ON uc.paciente_id = p.id
  WHERE p.tipo_pessoa = 'paciente'
    AND p.ativo = true
),
tipo_paciente AS (
  SELECT
    p.id as paciente_id,
    identificar_tipo_paciente(p.id) as tipo
  FROM pessoas p
  WHERE p.tipo_pessoa = 'paciente'
    AND p.ativo = true
)
SELECT
  p.id,
  p.nome,
  p.data_nascimento,
  EXTRACT(YEAR FROM AGE(p.data_nascimento))::INTEGER as idade_anos,

  -- Tipo de paciente (do JSONB ou calculado)
  COALESCE(
    (p.controle_inatividade->>'tipo_paciente')::TEXT,
    tp.tipo
  ) as tipo_paciente,

  -- Responsável legal
  rl.id as responsavel_id,
  rl.nome as responsavel_legal_nome,
  rl.telefone as responsavel_telefone,
  rl.whatsapp_validado as responsavel_whatsapp,

  -- Dados de inatividade
  di.data_ultima_consulta,
  di.dias_sem_consulta,

  -- Controle (do JSONB)
  COALESCE((p.controle_inatividade->>'nao_contatar')::boolean, false) as nao_contatar,
  p.controle_inatividade->>'motivo_nao_contatar' as motivo_nao_contatar,
  p.controle_inatividade->>'observacoes_controle' as observacoes_controle,

  -- Status do alerta
  CASE
    WHEN COALESCE((p.controle_inatividade->>'nao_contatar')::boolean, false) = true THEN 'nao_contatar'
    WHEN COALESCE((p.controle_inatividade->>'tipo_paciente')::TEXT, tp.tipo) = 'respiratorio' THEN
      CASE
        WHEN di.dias_sem_consulta >= 540 THEN 'alerta_540'
        WHEN di.dias_sem_consulta >= 360 THEN 'alerta_360'
        WHEN di.dias_sem_consulta >= 180 THEN 'alerta_180'
        ELSE 'ativo'
      END
    WHEN COALESCE((p.controle_inatividade->>'tipo_paciente')::TEXT, tp.tipo) = 'motor' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(p.data_nascimento)) >= 5 THEN 'fora_janela'
        WHEN di.dias_sem_consulta >= 60 THEN 'alerta_60'
        ELSE 'ativo'
      END
    ELSE 'indefinido'
  END as status_alerta,

  -- Próximo alerta esperado
  CASE
    WHEN COALESCE((p.controle_inatividade->>'tipo_paciente')::TEXT, tp.tipo) = 'respiratorio' THEN
      CASE
        WHEN di.dias_sem_consulta < 180 THEN di.data_ultima_consulta + INTERVAL '180 days'
        WHEN di.dias_sem_consulta < 360 THEN di.data_ultima_consulta + INTERVAL '360 days'
        WHEN di.dias_sem_consulta < 540 THEN di.data_ultima_consulta + INTERVAL '540 days'
        ELSE NULL
      END
    WHEN COALESCE((p.controle_inatividade->>'tipo_paciente')::TEXT, tp.tipo) = 'motor' THEN
      CASE
        WHEN EXTRACT(YEAR FROM AGE(p.data_nascimento)) >= 5 THEN NULL
        WHEN di.dias_sem_consulta < 60 THEN di.data_ultima_consulta + INTERVAL '60 days'
        ELSE NULL
      END
    ELSE NULL
  END as proximo_alerta_esperado,

  -- Histórico de contatos
  (SELECT COUNT(*) FROM pessoa_eventos
   WHERE pessoa_id = p.id
     AND tipo_evento = 'contato_inatividade') as total_contatos,
  (SELECT MAX(data_evento) FROM pessoa_eventos
   WHERE pessoa_id = p.id
     AND tipo_evento = 'contato_inatividade') as ultimo_contato

FROM pessoas p
LEFT JOIN dias_inativos di ON di.paciente_id = p.id
LEFT JOIN tipo_paciente tp ON tp.paciente_id = p.id
LEFT JOIN pessoa_responsaveis pr ON pr.id_pessoa = p.id
  AND pr.tipo_responsabilidade IN ('legal', 'ambos')
  AND pr.ativo = true
  AND (pr.data_fim IS NULL OR pr.data_fim > CURRENT_DATE)
LEFT JOIN pessoas rl ON rl.id = pr.id_responsavel
WHERE p.tipo_pessoa = 'paciente'
  AND p.ativo = true;
```

---

## 💻 Backend/API

### 1. Tipos TypeScript

**`src/types/patient-details.ts`:**

```typescript
// Controle de inatividade (JSONB)
export interface ControleInatividade {
  tipo_paciente?: 'respiratorio' | 'motor' | 'indefinido';
  nao_contatar?: boolean;
  motivo_nao_contatar?: 'solicitado' | 'fora_janela' | 'outro' | null;
  observacoes_controle?: string | null;
}

// Paciente inativo (da view)
export interface InactivePatient {
  id: string;
  nome: string;
  data_nascimento: string;
  idade_anos: number;
  tipo_paciente: 'respiratorio' | 'motor' | 'indefinido';
  responsavel_id: string | null;
  responsavel_legal_nome: string | null;
  responsavel_telefone: number | null;
  responsavel_whatsapp: string | null;
  data_ultima_consulta: string | null;
  dias_sem_consulta: number | null;
  nao_contatar: boolean;
  motivo_nao_contatar: string | null;
  observacoes_controle: string | null;
  status_alerta:
    | 'ativo'
    | 'alerta_180'
    | 'alerta_360'
    | 'alerta_540'
    | 'alerta_60'
    | 'fora_janela'
    | 'nao_contatar'
    | 'indefinido';
  proximo_alerta_esperado: string | null;
  total_contatos: number;
  ultimo_contato: string | null;
}

// Evento de contato
export interface PessoaEvento {
  id: string;
  pessoa_id: string;
  responsavel_id: string | null;
  tipo_evento: string;
  categoria: string | null;
  data_evento: string;
  metodo: 'whatsapp' | 'email' | 'telefone' | 'presencial' | 'sistema' | null;
  contatado_por: string | null;
  dados_evento: Record<string, unknown>;
  observacoes: string | null;
  created_at: string;
}

// Dados específicos para contato de inatividade
export interface DadosContatoInatividade {
  dias_inativos: number;
  alerta:
    | 'alerta_180'
    | 'alerta_360'
    | 'alerta_540'
    | 'alerta_60'
    | 'fora_janela';
  tipo_paciente: 'respiratorio' | 'motor' | 'indefinido';
  template_usado?: string;
  mensagem_enviada?: string;
  status: 'contatado' | 'agendado' | 'cancelado' | 'sem_interesse';
  resultado?: string;
  proximo_contato?: string;
}
```

---

### 2. Funções API em `src/lib/patient-api.ts`

#### 2.1. Buscar Pacientes Inativos

```typescript
/**
 * Buscar pacientes inativos
 * AI dev note: Usa view vw_pacientes_inativos que calcula tudo dinamicamente
 */
export async function fetchInactivePatients(filtros?: {
  tipo?: 'respiratorio' | 'motor' | 'todos';
  status_alerta?: string[];
  incluir_nao_contatar?: boolean;
  min_dias?: number;
  max_dias?: number;
}): Promise<InactivePatient[]> {
  try {
    let query = supabase
      .from('vw_pacientes_inativos')
      .select('*')
      .order('dias_sem_consulta', { ascending: false, nullsLast: true });

    // Filtros
    if (filtros?.tipo && filtros.tipo !== 'todos') {
      query = query.eq('tipo_paciente', filtros.tipo);
    }

    if (filtros?.status_alerta && filtros.status_alerta.length > 0) {
      query = query.in('status_alerta', filtros.status_alerta);
    }

    if (!filtros?.incluir_nao_contatar) {
      query = query.eq('nao_contatar', false);
    }

    if (filtros?.min_dias) {
      query = query.gte('dias_sem_consulta', filtros.min_dias);
    }

    if (filtros?.max_dias) {
      query = query.lte('dias_sem_consulta', filtros.max_dias);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar pacientes inativos:', error);
      throw error;
    }

    return (data || []) as InactivePatient[];
  } catch (err) {
    console.error('Erro ao buscar pacientes inativos:', err);
    return [];
  }
}
```

#### 2.2. Registrar Contato de Inatividade

```typescript
/**
 * Registrar contato de inatividade
 * AI dev note: Salva em pessoa_eventos com tipo 'contato_inatividade'
 */
export async function registerInactivityContact(
  pacienteId: string,
  responsavelId: string | null,
  dados: {
    metodo: 'whatsapp' | 'email' | 'telefone' | 'presencial';
    dias_inativos: number;
    alerta: string;
    tipo_paciente: 'respiratorio' | 'motor' | 'indefinido';
    template_usado?: string;
    mensagem_enviada?: string;
    status?: 'contatado' | 'agendado' | 'cancelado' | 'sem_interesse';
    resultado?: string;
    proximo_contato?: string;
    observacoes?: string;
  }
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!pessoa) {
      throw new Error('Pessoa não encontrada');
    }

    // Preparar dados do evento
    const dadosEvento: DadosContatoInatividade = {
      dias_inativos: dados.dias_inativos,
      alerta: dados.alerta as any,
      tipo_paciente: dados.tipo_paciente,
      template_usado: dados.template_usado,
      mensagem_enviada: dados.mensagem_enviada,
      status: dados.status || 'contatado',
      resultado: dados.resultado,
      proximo_contato: dados.proximo_contato,
    };

    // Inserir evento
    const { error } = await supabase.from('pessoa_eventos').insert({
      pessoa_id: pacienteId,
      responsavel_id: responsavelId,
      tipo_evento: 'contato_inatividade',
      categoria: 'inatividade',
      metodo: dados.metodo,
      contatado_por: pessoa.id,
      dados_evento: dadosEvento,
      observacoes: dados.observacoes,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao registrar contato de inatividade:', err);
    throw err;
  }
}
```

#### 2.3. Marcar/Desmarcar "Não Contatar"

```typescript
/**
 * Marcar paciente para não contatar mais
 * AI dev note: Atualiza JSONB controle_inatividade em pessoas
 */
export async function markPatientDoNotContact(
  pacienteId: string,
  motivo: 'solicitado' | 'fora_janela' | 'outro',
  observacoes?: string
): Promise<void> {
  try {
    // Buscar controle atual
    const { data: pessoa, error: fetchError } = await supabase
      .from('pessoas')
      .select('controle_inatividade, controle_inatividade->>tipo_paciente')
      .eq('id', pacienteId)
      .single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    // Obter tipo de paciente (do JSONB ou calcular)
    let tipoPaciente = pessoa.controle_inatividade?.tipo_paciente;
    if (!tipoPaciente) {
      // Calcular tipo se não existir
      const tipo = await identificarTipoPaciente(pacienteId);
      tipoPaciente = tipo;
    }

    // Atualizar JSONB
    const controleAtualizado = {
      tipo_paciente: tipoPaciente,
      nao_contatar: true,
      motivo_nao_contatar: motivo,
      observacoes_controle: observacoes || null,
    };

    const { error } = await supabase
      .from('pessoas')
      .update({
        controle_inatividade: controleAtualizado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pacienteId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao marcar paciente como não contatar:', err);
    throw err;
  }
}

/**
 * Remover marcação "não contatar"
 */
export async function unmarkPatientDoNotContact(
  pacienteId: string
): Promise<void> {
  try {
    // Buscar controle atual
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('controle_inatividade')
      .eq('id', pacienteId)
      .single();

    const controleAtualizado = {
      ...(pessoa?.controle_inatividade || {}),
      nao_contatar: false,
      motivo_nao_contatar: null,
    };

    const { error } = await supabase
      .from('pessoas')
      .update({
        controle_inatividade: controleAtualizado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pacienteId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao remover marcação não contatar:', err);
    throw err;
  }
}

/**
 * Atualizar tipo de paciente no controle
 */
export async function updatePatientTypeInControl(
  pacienteId: string
): Promise<void> {
  try {
    const tipo = await identificarTipoPaciente(pacienteId);

    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('controle_inatividade')
      .eq('id', pacienteId)
      .single();

    const controleAtualizado = {
      ...(pessoa?.controle_inatividade || {}),
      tipo_paciente: tipo,
    };

    const { error } = await supabase
      .from('pessoas')
      .update({
        controle_inatividade: controleAtualizado,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pacienteId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (err) {
    console.error('Erro ao atualizar tipo de paciente:', err);
    throw err;
  }
}

/**
 * Identificar tipo de paciente (helper)
 */
async function identificarTipoPaciente(
  pacienteId: string
): Promise<'respiratorio' | 'motor' | 'indefinido'> {
  // Buscar consultas do paciente
  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('tipo_servico_id, tipo_servicos!inner(nome)')
    .eq('paciente_id', pacienteId)
    .eq('ativo', true);

  if (!agendamentos || agendamentos.length === 0) {
    return 'indefinido';
  }

  let totalRespiratorio = 0;
  let totalMotor = 0;

  agendamentos.forEach((a: any) => {
    const nomeServico = a.tipo_servicos?.nome || '';
    if (nomeServico.toLowerCase().includes('respiratória')) {
      totalRespiratorio++;
    } else if (nomeServico.toLowerCase().includes('motora')) {
      totalMotor++;
    }
  });

  if (totalMotor > totalRespiratorio) {
    return 'motor';
  } else if (totalRespiratorio > totalMotor) {
    return 'respiratorio';
  } else {
    // Empate: usar último serviço
    const ultimoServico = agendamentos[agendamentos.length - 1];
    const nomeServico = ultimoServico?.tipo_servicos?.nome || '';
    if (nomeServico.toLowerCase().includes('motora')) {
      return 'motor';
    } else if (nomeServico.toLowerCase().includes('respiratória')) {
      return 'respiratorio';
    }
    return 'indefinido';
  }
}
```

#### 2.4. Buscar Histórico de Contatos

```typescript
/**
 * Buscar histórico de contatos de inatividade de um paciente
 */
export async function fetchPatientInactivityContactHistory(
  pacienteId: string
): Promise<PessoaEvento[]> {
  try {
    const { data, error } = await supabase
      .from('pessoa_eventos')
      .select('*')
      .eq('pessoa_id', pacienteId)
      .eq('tipo_evento', 'contato_inatividade')
      .order('data_evento', { ascending: false });

    if (error) {
      console.error('Erro ao buscar histórico de contatos:', error);
      return [];
    }

    return (data || []) as PessoaEvento[];
  } catch (err) {
    console.error('Erro ao buscar histórico de contatos:', err);
    return [];
  }
}
```

#### 2.5. Enviar WhatsApp (via webhook)

```typescript
/**
 * Enviar WhatsApp para responsável sobre inatividade
 * AI dev note: Usa webhook n8n existente
 */
export async function sendInactivityWhatsApp(
  pacienteId: string,
  responsavelId: string,
  template:
    | 'respiratorio_180'
    | 'respiratorio_360'
    | 'respiratorio_540'
    | 'motor_60'
    | 'motor_fora_janela',
  mensagemPersonalizada?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar dados do paciente e responsável
    const { data: paciente } = await supabase
      .from('pessoas')
      .select('nome, data_nascimento')
      .eq('id', pacienteId)
      .single();

    const { data: responsavel } = await supabase
      .from('pessoas')
      .select('nome, whatsapp_validado, telefone')
      .eq('id', responsavelId)
      .single();

    if (!paciente || !responsavel) {
      throw new Error('Paciente ou responsável não encontrado');
    }

    if (!responsavel.whatsapp_validado && !responsavel.telefone) {
      throw new Error('Responsável não possui WhatsApp válido');
    }

    // Templates de mensagem
    const templates = {
      respiratorio_180: `Olá ${responsavel.nome}, notamos que ${paciente.nome} não compareceu há 6 meses. Gostaria de agendar uma consulta?`,
      respiratorio_360: `Olá ${responsavel.nome}, ${paciente.nome} está há 1 ano sem atendimento. Podemos agendar uma consulta quando necessário.`,
      respiratorio_540: `Olá ${responsavel.nome}, ${paciente.nome} está há 1,5 anos sem atendimento. Gostaria de retomar o acompanhamento?`,
      motor_60: `Olá ${responsavel.nome}, ${paciente.nome} está há 60 dias sem atendimento. O tratamento é importante para o desenvolvimento. Podemos agendar?`,
      motor_fora_janela: `Olá ${responsavel.nome}, ${paciente.nome} completou 5 anos. Gostaria de uma avaliação final do tratamento?`,
    };

    const mensagem = mensagemPersonalizada || templates[template];

    // Enviar para webhook (n8n)
    const whatsappJid =
      responsavel.whatsapp_validado ||
      `55${responsavel.telefone}@s.whatsapp.net`;

    const { error: webhookError } = await supabase
      .from('webhook_queue')
      .insert({
        evento: 'contato_inatividade',
        payload: {
          tipo: 'contato_inatividade',
          timestamp: new Date().toISOString(),
          data: {
            paciente_id: pacienteId,
            paciente_nome: paciente.nome,
            responsavel_id: responsavelId,
            responsavel_nome: responsavel.nome,
            responsavel_whatsapp: whatsappJid,
            template: template,
            mensagem: mensagem,
          },
        },
        status: 'pendente',
        tentativas: 0,
        max_tentativas: 3,
        proximo_retry: new Date().toISOString(),
      });

    if (webhookError) {
      throw new Error(webhookError.message);
    }

    return { success: true };
  } catch (err) {
    console.error('Erro ao enviar WhatsApp de inatividade:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}
```

---

## 🎨 Componentes UI

### 1. `InactivePatientsCard.tsx` (Composed)

**Localização:** `src/components/composed/InactivePatientsCard.tsx`

**Funcionalidades:**

- Filtros por tipo (Respiratório/Motor/Todos)
- Filtros por status de alerta (180/360/540/60/Fora Janela)
- Checkbox "Incluir Não Contatar"
- Lista de pacientes com badges
- Botões de ação: "Contatar", "Não Contatar", "Histórico"
- Contador de pacientes por categoria

**Props:**

```typescript
interface InactivePatientsCardProps {
  className?: string;
  onPatientClick?: (patientId: string) => void;
  maxItems?: number;
}
```

---

### 2. `ContactInactivePatientDialog.tsx` (Composed)

**Localização:** `src/components/composed/ContactInactivePatientDialog.tsx`

**Funcionalidades:**

- Modal com dados do paciente e responsável
- Exibe tipo de paciente e status do alerta
- Seleção de método (WhatsApp/Email/Telefone)
- Template de mensagem (editável)
- Campo de observações
- Checkbox "Agendar consulta" (marca status como 'agendado')
- Botão "Enviar" → chama `registerInactivityContact` + `sendInactivityWhatsApp`

**Props:**

```typescript
interface ContactInactivePatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient: InactivePatient;
  onContactSuccess?: () => void;
}
```

---

### 3. `ManageInactivePatientDialog.tsx` (Composed)

**Localização:** `src/components/composed/ManageInactivePatientDialog.tsx`

**Funcionalidades:**

- Modal para gerenciar controle de inatividade
- Toggle "Não Contatar"
- Campo de motivo (solicitado/fora_janela/outro)
- Campo de observações
- Histórico de contatos (tabela)
- Editar observações de contatos anteriores

**Props:**

```typescript
interface ManageInactivePatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient: InactivePatient;
  onUpdateSuccess?: () => void;
}
```

---

### 4. `PatientContactHistory.tsx` (Composed)

**Localização:** `src/components/composed/PatientContactHistory.tsx`

**Funcionalidades:**

- Lista de contatos realizados
- Data, método, status, observações
- Editar observações
- Filtros por método/status

**Props:**

```typescript
interface PatientContactHistoryProps {
  patientId: string;
  className?: string;
}
```

---

## 📊 Regras de Negócio

### Alertas por Tipo

#### Respiratório (a cada 180 dias):

- **180 dias (6 meses)**: "Paciente sem atendimento há 6 meses"
- **360 dias (1 ano)**: "Paciente sem atendimento há 1 ano"
- **540 dias (1,5 anos)**: "Paciente sem atendimento há 1,5 anos"

#### Motor (60 dias):

- **60 dias**: "Paciente sem atendimento há 60 dias"
- **Fora da janela (idade ≥ 5 anos)**: "Paciente completou 5 anos - Fora da janela de tratamento"

---

### Templates de Mensagem

**Respiratório 180 dias:**

```
Olá [Responsável], notamos que [Paciente] não compareceu há 6 meses.
Gostaria de agendar uma consulta quando necessário?
```

**Respiratório 360 dias:**

```
Olá [Responsável], [Paciente] está há 1 ano sem atendimento.
Podemos agendar uma consulta quando necessário.
```

**Respiratório 540 dias:**

```
Olá [Responsável], [Paciente] está há 1,5 anos sem atendimento.
Gostaria de retomar o acompanhamento?
```

**Motor 60 dias:**

```
Olá [Responsável], [Paciente] está há 60 dias sem atendimento.
O tratamento é importante para o desenvolvimento. Podemos agendar?
```

**Motor Fora da Janela:**

```
Olá [Responsável], [Paciente] completou 5 anos.
Gostaria de uma avaliação final do tratamento?
```

---

## 🔐 Permissões (RLS)

### Tabela `pessoa_eventos`

```sql
-- Habilitar RLS
ALTER TABLE pessoa_eventos ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem visualizar
CREATE POLICY "pessoa_eventos_view_all"
ON pessoa_eventos
FOR SELECT
TO authenticated
USING (true);

-- Admin e secretaria podem inserir
CREATE POLICY "pessoa_eventos_admin_secretaria_insert"
ON pessoa_eventos
FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR is_secretaria());

-- Admin e secretaria podem atualizar
CREATE POLICY "pessoa_eventos_admin_secretaria_update"
ON pessoa_eventos
FOR UPDATE
TO authenticated
USING (is_admin() OR is_secretaria())
WITH CHECK (is_admin() OR is_secretaria());
```

### Campo `controle_inatividade` em `pessoas`

- Já coberto pelas políticas RLS existentes de `pessoas`
- Admin e secretaria podem atualizar (via `pessoas_secretaria_update_secure`)

---

## 📝 Ordem de Implementação

1. ✅ **Banco de Dados**
   - Adicionar campo `controle_inatividade` em `pessoas`
   - Criar tabela `pessoa_eventos`
   - Criar função `identificar_tipo_paciente()`
   - Criar view `vw_pacientes_inativos`
   - Criar políticas RLS

2. ✅ **Backend/API**
   - Adicionar tipos TypeScript
   - Criar funções em `patient-api.ts`
   - Testar queries

3. ✅ **Componentes UI**
   - Criar `InactivePatientsCard.tsx`
   - Criar `ContactInactivePatientDialog.tsx`
   - Criar `ManageInactivePatientDialog.tsx`
   - Criar `PatientContactHistory.tsx`

4. ✅ **Integração**
   - Integrar em `AdminDashboard`
   - Integrar em `SecretariaDashboard`
   - Adicionar exports

5. ✅ **Testes**
   - Testar filtros
   - Testar contatos
   - Testar marcação "não contatar"
   - Testar histórico

---

## 🎯 Resumo da Estrutura

| Item               | Quantidade | Descrição                                 |
| ------------------ | ---------- | ----------------------------------------- |
| **Campos novos**   | 1          | `controle_inatividade JSONB` em `pessoas` |
| **Tabelas novas**  | 1          | `pessoa_eventos` (genérica, reutilizável) |
| **Funções SQL**    | 1          | `identificar_tipo_paciente()`             |
| **Views**          | 1          | `vw_pacientes_inativos`                   |
| **Políticas RLS**  | 3          | Para `pessoa_eventos`                     |
| **Funções API**    | 6          | Em `patient-api.ts`                       |
| **Componentes UI** | 4          | Cards e dialogs                           |

**Total:** Estrutura enxuta e eficiente! 🚀
