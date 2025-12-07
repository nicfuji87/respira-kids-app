// AI dev note: Tipos específicos para sistema de faturas/cobranças ASAAS
// Estrutura híbrida mantendo compatibilidade com agendamentos existentes

export interface Fatura {
  id: string;

  // Identificadores
  id_asaas: string; // ID da fatura no ASAAS (ex: pay_xyz)
  numero_interno?: string | null; // Numeração interna (ex: RK-2025-001)

  // Dados da fatura
  valor_total: number;
  descricao?: string | null;

  // Status e controle
  status: 'pendente' | 'pago' | 'cancelado' | 'atrasado' | 'estornado';

  // Relacionamentos
  empresa_id: string;
  responsavel_cobranca_id: string;
  paciente_id?: string | null; // AI dev note: ID do paciente relacionado à fatura

  // Datas importantes
  vencimento?: string | null; // Date string
  criado_em: string; // Timestamp string
  pago_em?: string | null; // Timestamp string

  // Auditoria
  criado_por?: string | null;
  atualizado_por?: string | null;

  // Dados adicionais do ASAAS
  dados_asaas?: Record<string, unknown> | null; // JSONB
  observacoes?: string | null;

  // NFe fields
  link_nfe?: string | null; // URL da NFe ou estados: 'sincronizando', 'erro'
  status_nfe?: string | null; // Detalhes do erro quando link_nfe = 'erro'

  // Controle padrão
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Interface estendida com dados relacionados para exibição
export interface FaturaComDetalhes extends Fatura {
  // Dados do paciente
  paciente_nome?: string;

  // Dados da empresa
  empresa_razao_social?: string;
  empresa_nome_fantasia?: string;

  // Dados do responsável
  responsavel_nome?: string;
  responsavel_cpf?: string;

  // Dados do criador
  criador_nome?: string;

  // Dados dos agendamentos relacionados
  qtd_consultas?: number;
  consultas_periodo?: {
    inicio: string;
    fim: string;
  };
  datas_consultas?: string[]; // Array com datas individuais de cada consulta
  pacientes_atendidos?: string[]; // Lista de nomes
  profissionais_envolvidos?: string[]; // Lista de nomes

  // URL para visualizar no ASAAS
  url_asaas?: string;
}

// Interface para criação de nova fatura
export interface CriarFaturaInput {
  id_asaas: string;
  valor_total: number;
  descricao?: string;
  empresa_id: string;
  responsavel_cobranca_id: string;
  paciente_id: string; // AI dev note: ID do paciente relacionado à fatura (obrigatório)
  vencimento?: string;
  dados_asaas?: Record<string, unknown>;
  observacoes?: string;
  agendamento_ids: string[]; // IDs dos agendamentos a vincular
}

// Interface para atualização de fatura
export interface AtualizarFaturaInput {
  status?: Fatura['status'];
  pago_em?: string;
  dados_asaas?: Record<string, unknown>;
  observacoes?: string;
}

// Interface para listagem de faturas com filtros
export interface FaturaFiltros {
  paciente_id?: string;
  empresa_id?: string;
  responsavel_id?: string;
  status?: Fatura['status'];
  periodo_inicio?: string;
  periodo_fim?: string;
  limit?: number;
  offset?: number;
}

// Interface para métricas de faturas
export interface FaturaMetricas {
  total_faturas: number;
  valor_total: number;
  valor_pendente: number;
  valor_pago: number;
  valor_atrasado: number;
  faturas_vencendo: number; // Próximos 7 dias
}
