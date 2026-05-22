// AI dev note: Tipos para o programa de metas
// Tabelas metas, tipos_meta, meta_acompanhamento e view vw_metas_dashboard

export type MetaEscopo = 'individual' | 'clinica';

export type MetaStatus = 'ativa' | 'pausada' | 'concluida' | 'cancelada';

export type MetaStatusAtingimento = 'atingida' | 'em_andamento' | 'atrasada';

export type MetaCategoria =
  | 'atendimento'
  | 'qualidade'
  | 'produtividade'
  | 'reativacao'
  | 'relacionamento';

export type MetaRoleAlvo = 'todos' | 'admin' | 'profissional' | 'secretaria';

export interface TipoMeta {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: MetaCategoria;
  unidade_medida: string;
  role_alvo: MetaRoleAlvo;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Meta {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo_meta_id: string;
  escopo: MetaEscopo;
  pessoa_id: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  mes_referencia: number;
  ano_referencia: number;
  valor_meta: number;
  valor_minimo: number | null;
  valor_atual: number;
  status: MetaStatus;
  criado_por: string;
  created_at: string;
  updated_at: string;
}

export interface MetaDashboard {
  id: string;
  titulo: string;
  descricao: string | null;
  escopo: MetaEscopo;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  pessoa_role: string | null;
  tipo_meta_id: string;
  tipo_meta_codigo: string;
  tipo_meta_nome: string;
  categoria: MetaCategoria;
  unidade_medida: string;
  role_alvo: MetaRoleAlvo;
  periodo_inicio: string;
  periodo_fim: string;
  mes_referencia: number;
  ano_referencia: number;
  valor_meta: number;
  valor_minimo: number | null;
  valor_atual: number;
  status: MetaStatus;
  percentual_atingido: number;
  dias_restantes: number;
  status_atingimento: MetaStatusAtingimento;
  created_at: string;
  updated_at: string;
}

export interface MetaAcompanhamento {
  id: string;
  meta_id: string;
  data_referencia: string;
  valor_atual: number;
  percentual_atingido: number;
  created_at: string;
}

export interface CreateMetaInput {
  titulo: string;
  descricao?: string | null;
  tipo_meta_id: string;
  escopo: MetaEscopo;
  pessoa_id?: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  valor_meta: number;
  valor_minimo?: number | null;
}

export interface MetasFilters {
  pessoa_id?: string | null;
  role_alvo?: MetaRoleAlvo | null;
  mes?: number;
  ano?: number;
  status?: MetaStatus[];
  categoria?: MetaCategoria[];
}
