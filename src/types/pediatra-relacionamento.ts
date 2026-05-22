// AI dev note: Tipos para relacionamento com pediatras (admin/sócios)
// Usa view vw_pediatras_relacionamento + pessoa_eventos com tipo_evento 'contato_pediatra' e 'envio_evolucao_pediatra'

export type StatusRelacionamentoPediatra =
  | 'em_dia'
  | 'devido'
  | 'esfriando'
  | 'sem_contato';

export interface PediatraRelacionamento {
  pessoa_pediatra_id: string;
  pediatra_id: string;
  pediatra_nome: string;
  crm: string | null;
  especialidade: string | null;
  telefone: number | null;
  email: string | null;
  total_pacientes_vinculados: number;
  pacientes_ativos_90d: number;
  total_eventos: number;
  ultimo_contato: string | null;
  novas_indicacoes_90d: number;
  dias_desde_ultimo_contato: number | null;
  status_relacionamento: StatusRelacionamentoPediatra;
}

export type TipoContatoPediatra =
  | 'contato_pediatra'
  | 'envio_evolucao_pediatra';

export interface DadosContatoPediatra {
  motivo?: string;
  paciente_id?: string;
  paciente_nome?: string;
  evolucao_resumo?: string;
  template_usado?: string;
  mensagem_enviada?: string;
  proximo_contato?: string;
}

export interface PediatrasFilters {
  status?: StatusRelacionamentoPediatra[];
  min_pacientes?: number;
  busca?: string;
}
