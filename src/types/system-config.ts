// AI dev note: Tipos para configurações do sistema baseados nas tabelas Supabase
// Incluem entidades, DTOs e interfaces para operações CRUD

// Base types para auditoria
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface AuditableEntity extends BaseEntity {
  criado_por?: string;
  atualizado_por?: string;
}

// === LOCAIS DE ATENDIMENTO ===
export interface LocalAtendimento extends AuditableEntity {
  nome: string;
  tipo_local: 'clinica' | 'domiciliar' | 'externa';
  ativo: boolean;
  id_endereco?: string;
  numero_endereco?: string;
  complemento_endereco?: string;
  // Dados do endereço (joined)
  endereco?: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
}

export interface LocalAtendimentoCreateInput {
  nome: string;
  tipo_local: 'clinica' | 'domiciliar' | 'externa';
  ativo?: boolean;
  numero_endereco?: string;
  complemento_endereco?: string;
  endereco?: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
}

export interface LocalAtendimentoUpdateInput extends Partial<LocalAtendimentoCreateInput> {
  id: string;
}

// === TIPOS DE SERVIÇOS ===
export interface TipoServico extends AuditableEntity {
  nome: string;
  descricao?: string;
  duracao_minutos: number;
  valor: number;
  cor: string;
  ativo: boolean;
}

export interface TipoServicoCreateInput {
  nome: string;
  descricao?: string;
  duracao_minutos?: number;
  valor?: number;
  cor?: string;
  ativo?: boolean;
}

export interface TipoServicoUpdateInput extends Partial<TipoServicoCreateInput> {
  id: string;
}

// === STATUS DE CONSULTA ===
export interface ConsultaStatus extends BaseEntity {
  codigo: string;
  descricao: string;
  cor: string;
}

export interface ConsultaStatusCreateInput {
  codigo: string;
  descricao: string;
  cor: string;
}

export interface ConsultaStatusUpdateInput extends Partial<ConsultaStatusCreateInput> {
  id: string;
}

// === STATUS DE PAGAMENTO ===
export interface PagamentoStatus extends BaseEntity {
  codigo: string;
  descricao: string;
  cor: string;
}

export interface PagamentoStatusCreateInput {
  codigo: string;
  descricao: string;
  cor: string;
}

export interface PagamentoStatusUpdateInput extends Partial<PagamentoStatusCreateInput> {
  id: string;
}

// === TIPOS DE PESSOA ===
export interface PessoaTipo extends BaseEntity {
  codigo: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
}

export interface PessoaTipoCreateInput {
  codigo: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

export interface PessoaTipoUpdateInput extends Partial<PessoaTipoCreateInput> {
  id: string;
}

// === ENDEREÇOS ===
export interface Endereco extends BaseEntity {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface EnderecoCreateInput {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface EnderecoUpdateInput extends Partial<EnderecoCreateInput> {
  id: string;
}

// === CONTRACT TEMPLATES ===
export interface ContractTemplate extends AuditableEntity {
  nome: string;
  descricao?: string;
  conteudo_template: string;
  variaveis_disponiveis?: string[];
  versao: number;
  ativo: boolean;
  template_principal_id?: string;
}

export interface ContractTemplateCreateInput {
  nome: string;
  descricao?: string;
  conteudo_template: string;
  variaveis_disponiveis?: string[];
  versao?: number;
  ativo?: boolean;
  template_principal_id?: string;
}

export interface ContractTemplateUpdateInput extends Partial<ContractTemplateCreateInput> {
  id: string;
}

// === TIPOS GENÉRICOS PARA CRUD ===
export type SystemEntity = 
  | LocalAtendimento 
  | TipoServico 
  | ConsultaStatus 
  | PagamentoStatus 
  | PessoaTipo 
  | Endereco
  | ContractTemplate;

export type SystemEntityType = 
  | 'locais_atendimento'
  | 'tipo_servicos' 
  | 'consulta_status'
  | 'pagamento_status'
  | 'pessoa_tipos'
  | 'enderecos'
  | 'contract_templates';

export interface SystemEntityConfig {
  tableName: SystemEntityType;
  displayName: string;
  description: string;
  hasStatus: boolean;
  hasAudit: boolean;
}

// === RESPOSTAS DAS APIS ===
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// === FILTROS E BUSCA ===
export interface SystemEntityFilters {
  search?: string;
  ativo?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// === MENSAGENS DE ERRO ===
export interface DatabaseError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

// === HISTORICO DE MUDANÇAS ===
export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  user_id?: string;
  created_at: string;
}

// === CONFIGURAÇÕES DO SISTEMA ===
export const SYSTEM_ENTITIES_CONFIG: Record<SystemEntityType, SystemEntityConfig> = {
  locais_atendimento: {
    tableName: 'locais_atendimento',
    displayName: 'Locais de Atendimento',
    description: 'Gerenciar locais onde os atendimentos são realizados',
    hasStatus: true,
    hasAudit: true,
  },
  tipo_servicos: {
    tableName: 'tipo_servicos',
    displayName: 'Tipos de Serviços',
    description: 'Configurar serviços oferecidos pela clínica',
    hasStatus: true,
    hasAudit: true,
  },
  consulta_status: {
    tableName: 'consulta_status',
    displayName: 'Status de Consulta',
    description: 'Definir status possíveis para consultas',
    hasStatus: false,
    hasAudit: false,
  },
  pagamento_status: {
    tableName: 'pagamento_status',
    displayName: 'Status de Pagamento',
    description: 'Definir status possíveis para pagamentos',
    hasStatus: false,
    hasAudit: false,
  },
  pessoa_tipos: {
    tableName: 'pessoa_tipos',
    displayName: 'Tipos de Pessoa',
    description: 'Categorizar tipos de pessoas no sistema',
    hasStatus: true,
    hasAudit: false,
  },
  enderecos: {
    tableName: 'enderecos',
    displayName: 'Endereços',
    description: 'Gerenciar endereços utilizados no sistema',
    hasStatus: false,
    hasAudit: false,
  },
  contract_templates: {
    tableName: 'contract_templates',
    displayName: 'Templates de Contrato',
    description: 'Gerenciar modelos de contratos editáveis',
    hasStatus: true,
    hasAudit: true,
  },
}; 