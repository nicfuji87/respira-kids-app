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

// AI dev note: Interface para dados da view vw_agendamentos_completos (estrutura flat)
// Atualizada para refletir exatamente os campos retornados pela view otimizada
export interface SupabaseAgendamentoCompletoFlat {
  // Campos do agendamento
  id: string;
  data_hora: string;
  paciente_id: string;
  profissional_id: string;
  tipo_servico_id: string;
  local_id: string | null;
  status_consulta_id: string;
  status_pagamento_id: string;
  valor_servico: string; // numeric vem como string do Supabase
  id_pagamento_externo: string | null;
  link_nfe: string | null;
  observacao: string | null;
  ativo: boolean;
  fatura_id: string | null;
  cobranca_gerada_em: string | null;
  google_event_id: string | null;
  empresa_fatura_id: string;
  agendado_por_id: string;
  created_at: string;
  updated_at: string;

  // Dados do paciente
  paciente_nome: string;
  paciente_cpf: string | null;
  paciente_telefone: number | null;
  paciente_email: string | null;
  paciente_data_nascimento: string | null;
  paciente_role: string | null;
  paciente_foto_perfil: string | null;
  paciente_is_approved: boolean;
  paciente_profile_complete: boolean;
  paciente_ativo: boolean;

  // Dados do profissional
  profissional_nome: string;
  profissional_email: string | null;
  profissional_telefone: number | null;
  profissional_role: string | null;
  profissional_registro_profissional: string | null;
  profissional_especialidade: string | null;
  profissional_bio_profissional: string | null;
  profissional_foto_perfil: string | null;
  profissional_is_approved: boolean;
  profissional_profile_complete: boolean;
  profissional_ativo: boolean;

  // Dados do serviço
  servico_nome: string;
  servico_duracao: number;
  servico_cor: string;
  tipo_servico_descricao: string | null;
  tipo_servico_duracao_minutos: number;
  tipo_servico_valor: string;
  tipo_servico_cor: string;
  tipo_servico_ativo: boolean;

  // Dados do local
  local_nome: string | null;
  local_atendimento_id: string | null;
  local_atendimento_tipo_local: string | null;
  local_atendimento_ativo: boolean | null;

  // Status Consulta
  status_consulta_codigo: string;
  status_consulta_nome: string;
  status_consulta_cor: string;

  // Status Pagamento
  status_pagamento_codigo: string;
  status_pagamento_nome: string;
  status_pagamento_cor: string;

  // Empresa de Faturamento
  empresa_fatura_razao_social: string | null;
  empresa_fatura_nome_fantasia: string | null;
  empresa_fatura_cnpj: string | null;
  empresa_fatura_ativo: boolean;

  // Responsáveis (NOVOS)
  responsavel_legal_id: string | null;
  responsavel_legal_nome: string | null;
  responsavel_financeiro_id: string | null;
  responsavel_financeiro_nome: string | null;
  responsavel_cobranca_id: string;
  responsavel_cobranca_nome: string | null;

  // Agendado Por (NOVOS)
  agendado_por_nome: string | null;

  // Auditoria (NOVOS)
  criado_por: string | null;
  criado_por_nome: string | null;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;

  // Comissão (NOVOS)
  comissao_tipo_recebimento: string | null;
  comissao_valor_fixo: string | null;
  comissao_valor_percentual: string | null;
  comissao_valor_calculado: string;

  // Aliases para compatibilidade com webhooks (NOVOS)
  tipo_servico_nome: string;
  local_atendimento_nome: string | null;
  status_consulta_descricao: string;
  status_pagamento_descricao: string;

  // Evolução
  possui_evolucao: string; // 'sim' ou 'não'

  // Agenda Compartilhada (NOVO)
  agenda_compartilhada_id: string | null;
}

// Interfaces para dados enriquecidos (com joins) - MANTIDO PARA COMPATIBILIDADE
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
  empresa_fatura: string;
  agenda_compartilhada_id?: string; // AI dev note: Rastrear origem de agendas compartilhadas
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
  empresa_fatura?: string;
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

// AI dev note: Types para Relatórios de Evolução
export interface SupabaseRelatoriosTipo {
  id: string;
  codigo: string;
  descricao: string;
  created_at: string;
}

export interface SupabaseRelatorioEvolucao {
  id: string;
  id_agendamento: string;
  tipo_relatorio_id: string;
  pdf_url: string | null;
  conteudo: string | null;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
  // AI dev note: Campos JSONB para evolução estruturada
  tipo_evolucao?: 'respiratoria' | 'motora_assimetria' | null;
  evolucao_respiratoria?: Record<string, unknown> | null;
  evolucao_motora_assimetria?: Record<string, unknown> | null;
}

// AI dev note: Interface completa de evolução com dados de usuário para histórico
export interface SupabaseRelatorioEvolucaoCompleto
  extends SupabaseRelatorioEvolucao {
  criado_por_nome: string | null;
  atualizado_por_nome: string | null;
  tipo_relatorio: SupabaseRelatoriosTipo;
}

// Types para inserção/atualização de evolução
export interface SaveEvolucaoData {
  id_agendamento: string;
  conteudo: string;
  criado_por: string;
  // AI dev note: Campos JSONB para evolução estruturada
  tipo_evolucao?: 'respiratoria' | 'motora_assimetria';
  evolucao_respiratoria?: Record<string, unknown>;
  evolucao_motora_assimetria?: Record<string, unknown>;
}

export interface UpdateEvolucaoData {
  id: string;
  conteudo: string;
  atualizado_por: string;
}

export interface UpdateEvolucaoData {
  id: string;
  conteudo: string;
  atualizado_por: string;
}
