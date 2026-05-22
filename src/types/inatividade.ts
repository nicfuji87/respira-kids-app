// AI dev note: Tipos para o sistema de inatividade de pacientes
// View vw_pacientes_inativos + tabela pessoa_eventos + JSONB controle_inatividade

export type TipoPaciente = 'respiratorio' | 'motor' | 'indefinido';

export type StatusAlertaInatividade =
  | 'ativo'
  | 'alerta_60'
  | 'alerta_180'
  | 'alerta_360'
  | 'alerta_540'
  | 'fora_janela'
  | 'sem_historico'
  | 'nao_contatar'
  | 'indefinido';

export type MotivoNaoContatar = 'solicitado' | 'fora_janela' | 'outro';

export interface ControleInatividade {
  tipo_paciente?: TipoPaciente;
  nao_contatar?: boolean;
  motivo_nao_contatar?: MotivoNaoContatar | null;
  observacoes_controle?: string | null;
}

export interface InactivePatient {
  id: string;
  nome: string;
  data_nascimento: string | null;
  idade_anos: number | null;
  tipo_paciente: TipoPaciente;
  responsavel_id: string | null;
  responsavel_legal_nome: string | null;
  responsavel_telefone: number | null;
  data_ultima_consulta: string | null;
  dias_sem_consulta: number | null;
  nao_contatar: boolean;
  motivo_nao_contatar: string | null;
  observacoes_controle: string | null;
  status_alerta: StatusAlertaInatividade;
  total_contatos: number;
  ultimo_contato: string | null;
}

export type MetodoContato =
  | 'whatsapp'
  | 'email'
  | 'telefone'
  | 'presencial'
  | 'sistema';

// AI dev note: ResultadoContato representa o RETORNO do responsável após o contato
// Fluxo: secretária clica → abre wa.me → conversa → registra o retorno aqui
export type ResultadoContato =
  | 'nao_respondeu'
  | 'marcou_consulta'
  | 'tudo_bem'
  | 'sem_interesse'
  | 'retornar_depois'
  | 'nao_contatar';

export interface DadosContatoInatividade {
  dias_inativos: number;
  alerta: StatusAlertaInatividade;
  tipo_paciente: TipoPaciente;
  status: ResultadoContato;
  resultado?: string;
  proximo_contato?: string;
}

export interface PessoaEvento {
  id: string;
  pessoa_id: string;
  responsavel_id: string | null;
  tipo_evento: string;
  categoria: string | null;
  data_evento: string;
  metodo: MetodoContato | null;
  contatado_por: string | null;
  dados_evento: Record<string, unknown>;
  observacoes: string | null;
  created_at: string;
}

export interface InactivePatientsFilters {
  tipo?: TipoPaciente | 'todos';
  status_alerta?: StatusAlertaInatividade[];
  incluir_nao_contatar?: boolean;
  min_dias?: number;
  max_dias?: number;
  busca?: string;
}
