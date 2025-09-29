// AI dev note: Interfaces para gerenciamento de usuários - baseado na view vw_usuarios_admin
export interface Usuario {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string | null;
  telefone: number | null;
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  registro_profissional: string | null;
  especialidade: string | null;
  bio_profissional: string | null;
  foto_perfil: string | null;
  numero_endereco: string | null;
  complemento_endereco: string | null;
  role: 'admin' | 'profissional' | 'secretaria' | null;
  is_approved: boolean;
  profile_complete: boolean;
  ativo: boolean;
  bloqueado: boolean;
  created_at: string;
  updated_at: string;

  // Dados do tipo de pessoa
  tipo_pessoa_id: string | null;
  tipo_pessoa_codigo: string | null;
  tipo_pessoa_nome: string | null;
  tipo_pessoa_descricao: string | null;

  // Dados do endereço
  endereco_id: string | null;
  cep: string | null;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  endereco_completo: string | null;

  // Métricas
  total_agendamentos: number;
  agendamentos_ultimo_mes: number;
  ultimo_agendamento: string | null;

  // Empresa (se aplicável)
  empresa_id: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  empresa_cnpj: string | null;

  // AI dev note: Novos campos para pediatras - FASE 4 do plano aprovado
  pediatra_id?: string | null;
  pediatra_crm?: string | null;
  pediatra_especialidade?: string | null;
  pediatra_observacoes?: string | null;
  is_pediatra?: boolean;
  total_pacientes_pediatra?: number;
  pacientes_ativos_pediatra?: number;

  // Novos campos para pacientes
  pediatras_nomes?: string | null;
  total_pediatras?: number;

  // Campos de responsáveis
  responsavel_legal_nome?: string | null;

  // AI dev note: Campos de status de pagamento
  total_consultas_pagamento?: number;
  consultas_pagas?: number;
  consultas_atrasadas?: number;
  consultas_pendentes?: number;
  todas_consultas_pagas?: boolean;
  tem_consultas_atrasadas?: boolean;
}

export interface UsuarioFilters {
  busca?: string;
  tipo_pessoa?: string;
  role?: string;
  is_approved?: boolean;
  ativo?: boolean;
  bloqueado?: boolean;
}

export interface UsuarioMetrics {
  total_usuarios: number;
  pendentes_aprovacao: number;
  usuarios_ativos: number;
  usuarios_bloqueados: number;
  novos_ultimo_mes: number;
  por_tipo: Array<{
    tipo: string;
    quantidade: number;
  }>;
  por_role: Array<{
    role: string;
    quantidade: number;
  }>;
}

export interface UsuarioUpdate {
  nome?: string;
  email?: string;
  telefone?: number | null;
  cpf_cnpj?: string | null;
  data_nascimento?: string | null;
  registro_profissional?: string | null;
  especialidade?: string | null;
  bio_profissional?: string | null;
  numero_endereco?: string | null;
  complemento_endereco?: string | null;
  role?: 'admin' | 'profissional' | 'secretaria' | null;
  is_approved?: boolean;
  profile_complete?: boolean;
  ativo?: boolean;
  bloqueado?: boolean;
  id_tipo_pessoa?: string | null;
  id_endereco?: string | null;
  id_empresa?: string | null;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedUsuarios {
  data: Usuario[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
