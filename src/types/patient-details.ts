// AI dev note: Tipos específicos para detalhes completos de pacientes
// Interfaces para todos os componentes da página de detalhes do paciente

import type { SupabasePessoa } from './supabase-calendar';
import type { SessionMedia } from './session-media';

// Interface estendida do paciente com dados de responsáveis
export interface PatientDetails extends SupabasePessoa {
  // Dados pessoais adicionais
  cpf_cnpj?: string | null;
  data_nascimento?: string | null;
  sexo?: 'M' | 'F' | 'O' | null;
  numero_endereco?: string | null;
  complemento_endereco?: string | null;

  // Campos de consentimento
  autorizacao_uso_cientifico?: boolean;
  autorizacao_uso_redes_sociais?: boolean;
  autorizacao_uso_nome?: boolean;

  // Dados de responsáveis (vindos de views/joins)
  nomes_responsaveis?: string;
  responsavel_legal_id?: string;
  responsavel_legal_nome?: string;
  responsavel_legal_email?: string;
  responsavel_legal_telefone?: number;
  responsavel_financeiro_id?: string;
  responsavel_financeiro_nome?: string;
  responsavel_financeiro_email?: string;
  responsavel_financeiro_telefone?: number;
  responsavel_financeiro_cpf?: string;
  responsavel_financeiro_cep?: string;
  responsavel_financeiro_numero?: string;

  // AI dev note: Responsável pela cobrança/NFe - obrigatório
  responsavel_cobranca_id: string;
  responsavel_cobranca_nome: string;

  // Dados de endereço
  endereco?: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
  } | null;

  // Origem da indicação
  origem_indicacao?: string | null;

  // Anamnese
  anamnese?: string | null;

  // AI dev note: Novos campos de pediatras - vindos da view atualizada
  pediatras_nomes?: string | null;
  pediatras_crms?: string | null;
  pediatras_especialidades?: string | null;
  total_pediatras?: number | null;
  pediatras_ids?: string | null;
}

// Interface genérica para qualquer pessoa (paciente/responsável/profissional)
export interface PersonDetails extends PatientDetails {
  // Campos específicos para identificar tipo de pessoa
  tipo_pessoa?: string; // codigo do tipo: 'paciente', 'responsavel', 'profissional', etc.
  pessoa_tipo_nome?: string; // nome do tipo: 'Paciente', 'Responsável', 'Profissional', etc.
}

// Interface para métricas do paciente
export interface PatientMetrics {
  total_consultas: number;
  total_faturado: number; // Novo: apenas cobrança gerada + pendente + pago + atrasado
  total_agendado?: number; // Novo: total de todos os agendamentos (antigo total_faturado)
  valor_pendente: number;
  valor_em_atraso: number;
  dias_em_atraso: number;
  ultima_consulta: string | null;
  dias_desde_ultima_consulta: number | null;
  // Novos campos para métricas expandidas
  consultas_finalizadas?: number;
  consultas_agendadas?: number;
  consultas_canceladas?: number;
  valor_pago?: number;
  valor_cancelado?: number; // Valor das consultas canceladas
}

// Interface para consultas recentes
export interface RecentConsultation {
  id: string;
  data_hora: string;
  servico_nome: string;
  local_nome: string;
  valor_servico: number;
  status_consulta: string;
  status_pagamento: string;
  status_cor_consulta: string;
  status_cor_pagamento: string;
  profissional_nome?: string;
  possui_evolucao?: string;
  empresa_fatura_nome?: string; // Empresa responsável pelo faturamento
  id_pagamento_externo?: string; // ID da cobrança no ASAAS (compatibilidade)
  fatura_id?: string; // Nova referência estruturada à tabela faturas
  selectable?: boolean; // Para modo de seleção de cobrança
  // AI dev note: Campos de comissão para controle de exibição por role
  comissao_tipo_recebimento?: string | null;
  // AI dev note: Campos adicionais da view vw_agendamentos_completos para filtros de fatura
  status_consulta_codigo?: string; // Código do status da consulta (ex: 'cancelado', 'finalizado')
  status_pagamento_codigo?: string; // Código do status de pagamento (ex: 'pago', 'pendente')
}

// Interface para dados de consentimento
export interface PatientConsent {
  autorizacao_uso_cientifico: boolean;
  autorizacao_uso_redes_sociais: boolean;
  autorizacao_uso_nome: boolean;
}

// Interface para props do PatientConsentForm
export interface PatientConsentFormProps {
  patientId: string;
  initialValues: PatientConsent;
  onUpdate: (consent: PatientConsent) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

// Interface para props do PatientMetrics
export interface PatientMetricsProps {
  patientId: string;
  className?: string;
  // AI dev note: Role para controlar exibição de valores (comissão vs valor integral)
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

// Interface para props das consultas recentes
export interface RecentConsultationsProps {
  patientId: string;
  onConsultationClick?: (consultationId: string) => void;
  className?: string;
  // AI dev note: Role para controlar exibição de valores (comissão vs valor integral)
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

// Interface para galeria de mídia
export interface MediaGalleryProps {
  patientId: string;
  className?: string;
}

// Interface para histórico do paciente com IA
export interface PatientHistoryProps {
  patientId: string;
  className?: string;
}

// Interface para anamnese
export interface PatientAnamnesisProps {
  patientId: string;
  initialValue?: string;
  onUpdate: (anamnese: string) => Promise<void>;
  className?: string;
}

// Interface para histórico do paciente
export interface PatientHistoryProps {
  patientId: string;
  className?: string;
}

// Interface para relatório de evolução
export interface RelatorioEvolucao {
  id: string;
  id_agendamento: string;
  tipo_relatorio_id: string;
  pdf_url?: string | null;
  conteudo?: string | null;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
  transcricao?: boolean | null;
}

// Interface para seção de informações pessoais
export interface PatientPersonalInfoProps {
  patient: PatientDetails;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  className?: string;
  onResponsibleClick?: (responsibleId: string) => void;
}

// Interface para mídia agrupada por sessão
export interface SessionMediaGroup {
  agendamento_id: string;
  data_hora: string;
  medias: SessionMedia[];
}

// Interface para API responses
export interface PatientDetailsResponse {
  patient: PatientDetails | null;
  error?: string;
}

export interface PatientMetricsResponse {
  metrics: PatientMetrics;
  error?: string;
}

export interface RecentConsultationsResponse {
  consultations: RecentConsultation[];
  total_count: number;
  has_more: boolean;
  error?: string;
}

export interface SessionMediaResponse {
  media_groups: SessionMediaGroup[];
  error?: string;
}
