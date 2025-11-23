// AI dev note: Types para sistema de agendas compartilhadas
// Mapeia tabelas: agendas_compartilhadas, agenda_servicos, agenda_locais,
// agenda_empresas, agenda_slots, agenda_selecoes

// ============================================
// INTERFACES BÁSICAS
// ============================================

export interface AgendaCompartilhada {
  id: string;
  profissional_id: string;
  token: string;
  titulo: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string; // YYYY-MM-DD
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaServico {
  id: string;
  agenda_id: string;
  tipo_servico_id: string;
  created_at: string;
}

export interface AgendaLocal {
  id: string;
  agenda_id: string;
  local_id: string;
  created_at: string;
}

export interface AgendaEmpresa {
  id: string;
  agenda_id: string;
  empresa_id: string;
  created_at: string;
}

export interface AgendaSlot {
  id: string;
  agenda_id: string;
  data_hora: string; // ISO timestamp
  disponivel: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgendaSelecao {
  id: string;
  agenda_id: string;
  slot_id: string;
  paciente_id: string;
  responsavel_id: string;
  responsavel_whatsapp: number;
  responsavel_whatsapp_validado_em: string;
  tipo_servico_id: string;
  local_id: string | null;
  empresa_id: string;
  agendamento_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// VIEW STATS
// ============================================

export interface AgendaCompartilhadaStats extends AgendaCompartilhada {
  profissional_nome: string;
  profissional_email: string | null;
  profissional_especialidade: string | null;
  profissional_foto: string | null;
  total_slots: number;
  slots_disponiveis: number;
  slots_ocupados: number;
  total_servicos: number;
  total_locais: number;
  total_empresas: number;
}

// ============================================
// INTERFACES COMPLETAS (COM JOINS)
// ============================================

export interface ServicoDetalhado {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  valor: number;
  cor: string;
  ativo: boolean;
}

export interface LocalDetalhado {
  id: string;
  nome: string;
  tipo_local: 'clinica' | 'domiciliar' | 'externa';
  ativo: boolean;
}

export interface EmpresaDetalhada {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  ativo: boolean;
}

export interface AgendaCompartilhadaCompleta extends AgendaCompartilhadaStats {
  servicos: ServicoDetalhado[];
  locais: LocalDetalhado[];
  empresas: EmpresaDetalhada[];
  slots: AgendaSlot[];
}

export interface AgendaSlotComSelecao extends AgendaSlot {
  selecao?: {
    paciente_nome: string;
    responsavel_nome: string;
    servico_nome: string;
    local_nome: string | null;
    empresa_nome: string;
  };
}

// ============================================
// TYPES PARA INSERÇÃO/ATUALIZAÇÃO
// ============================================

export interface CreateAgendaCompartilhada {
  profissional_id: string;
  token: string;
  titulo: string;
  data_inicio: string;
  data_fim: string;
  criado_por: string;
  servicos_ids: string[]; // IDs dos serviços
  locais_ids: string[]; // IDs dos locais
  empresas_ids: string[]; // IDs das empresas
  slots_data_hora: string[]; // Array de timestamps
}

export interface UpdateAgendaCompartilhada {
  titulo?: string;
  data_inicio?: string;
  data_fim?: string;
  ativo?: boolean;
  servicos_ids?: string[]; // Se fornecido, substitui todos
  locais_ids?: string[]; // Se fornecido, substitui todos
  empresas_ids?: string[]; // Se fornecido, substitui todos
}

export interface AddSlotsData {
  agenda_id: string;
  slots_data_hora: string[]; // Array de timestamps
}

export interface CreateAgendaSelecao {
  agenda_id: string;
  slot_id: string;
  paciente_id: string;
  responsavel_id: string;
  responsavel_whatsapp: number;
  tipo_servico_id: string;
  local_id: string | null;
  empresa_id: string;
}

// ============================================
// TYPES PARA UI
// ============================================

export interface AgendaPublicaInfo {
  id: string;
  token: string;
  titulo: string;
  data_inicio: string;
  data_fim: string;
  profissional_nome: string;
  profissional_especialidade: string | null;
  profissional_foto: string | null;
  slots_disponiveis: number;
  ativo: boolean;
}

export interface SlotDisponivel {
  id: string;
  data_hora: string;
  data_formatada: string; // Ex: "Segunda, 10/11"
  hora_formatada: string; // Ex: "08:00"
}

export interface OpcaoServico {
  id: string;
  nome: string;
  descricao: string | null;
  // AI dev note: Removido duracao_minutos e valor conforme solicitado
}

export interface OpcaoLocal {
  id: string;
  nome: string;
  tipo_local: string;
}

export interface OpcaoEmpresa {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
}

export interface WizardDataSelecao {
  responsavel_id: string;
  responsavel_whatsapp: number;
  paciente_id: string;
  paciente_nome: string;
  tipo_servico_id: string | null;
  tipo_servico_nome: string | null;
  local_id: string | null;
  local_nome: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  slot_id: string | null;
  slot_data_hora: string | null;
}

// ============================================
// TYPES PARA FILTROS
// ============================================

export interface AgendaCompartilhadaFilters {
  profissional_id?: string;
  ativo?: boolean;
  data_inicio?: string;
  data_fim?: string;
}

// ============================================
// TYPES PARA API RESPONSES
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
  isExpired?: boolean; // Indica se a agenda está expirada
}

export interface CreateAgendaResponse {
  agenda: AgendaCompartilhada;
  link: string; // URL completa com token
}
