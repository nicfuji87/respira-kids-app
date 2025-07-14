// AI dev note: Types específicos para integração do calendário com Supabase
// Mapeia tabelas: agendamentos, pessoas, tipo_servicos, consulta_status, permissoes_agendamento

export interface SupabasePessoa {
  id: string;
  nome: string;
  email: string | null;
  telefone: bigint | null;
  role: 'admin' | 'profissional' | 'secretaria' | null;
  auth_user_id: string | null;
  especialidade: string | null;
  registro_profissional: string | null;
  bio_profissional: string | null;
  foto_perfil: string | null;
  is_approved: boolean;
  profile_complete: boolean;
  ativo: boolean;
  bloqueado: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseTipoServico {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  valor: number;
  cor: string;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseConsultaStatus {
  id: string;
  codigo: string;
  descricao: string;
  cor: string;
  created_at: string;
  updated_at: string;
}

export interface SupabasePagamentoStatus {
  id: string;
  codigo: string;
  descricao: string;
  cor: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseLocalAtendimento {
  id: string;
  nome: string;
  tipo_local: 'clinica' | 'domiciliar' | 'externa';
  ativo: boolean;
  id_endereco: string | null;
  numero_endereco: string | null;
  complemento_endereco: string | null;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseAgendamento {
  id: string;
  data_hora: string; // timestamp with time zone
  paciente_id: string;
  profissional_id: string;
  tipo_servico_id: string;
  local_id: string | null;
  status_consulta_id: string;
  status_pagamento_id: string;
  valor_servico: number;
  id_pagamento_externo: string | null;
  link_nfe: string | null;
  observacao: string | null;
  agendado_por: string;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabasePermissaoAgendamento {
  id: string;
  id_secretaria: string;
  id_profissional: string;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

// Interfaces para dados enriquecidos (com joins)
export interface SupabaseAgendamentoCompleto extends SupabaseAgendamento {
  paciente: SupabasePessoa;
  profissional: SupabasePessoa;
  tipo_servico: SupabaseTipoServico;
  local_atendimento: SupabaseLocalAtendimento | null;
  status_consulta: SupabaseConsultaStatus;
  status_pagamento: SupabasePagamentoStatus;
  agendado_por_pessoa: SupabasePessoa;
}

// Types para filtros e queries
export interface CalendarFilters {
  startDate: Date;
  endDate: Date;
  profissionalId?: string;
  pacienteId?: string;
  tipoServicoId?: string;
  statusConsultaId?: string;
  statusPagamentoId?: string;
  localId?: string;
}

export interface CalendarPermissions {
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canViewAllEvents: boolean;
  allowedProfessionals: string[]; // IDs dos profissionais que pode gerenciar
}

// Types para inserção/atualização
export interface CreateAgendamento {
  data_hora: string;
  paciente_id: string;
  profissional_id: string;
  tipo_servico_id: string;
  local_id?: string;
  status_consulta_id: string;
  status_pagamento_id: string;
  valor_servico: number;
  observacao?: string;
  agendado_por: string;
}

export interface UpdateAgendamento {
  data_hora?: string;
  paciente_id?: string;
  profissional_id?: string;
  tipo_servico_id?: string;
  local_id?: string;
  status_consulta_id?: string;
  status_pagamento_id?: string;
  valor_servico?: number;
  observacao?: string;
  atualizado_por: string;
}

// Types para estatísticas
export interface CalendarStats {
  totalEventos: number;
  proximosEventos: number;
  participantesUnicos: number;
  eventosPorStatus: Record<string, number>;
  eventosPorTipoServico: Record<string, number>;
  valorTotalServicos: number;
}
