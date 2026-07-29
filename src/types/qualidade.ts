// AI dev note: Tipos do módulo de Qualidade (Manual de Boas Práticas + POPs).
// Por ora só o levantamento; documentos/cronograma/registros entram nas próximas etapas.

export interface LevantamentoAnexo {
  path: string;
  url: string;
  nome: string;
}

export interface LevantamentoRespostaRow {
  id: string;
  created_at: string;
  atualizado_em: string;
  pergunta_id: string;
  bloco: string;
  resposta: string | null;
  nao_sei: boolean;
  nao_aplica: boolean;
  anexos: LevantamentoAnexo[];
  respondido_por: string | null;
}

/** Estado local por pergunta (o que a tela manipula antes de persistir). */
export interface LevantamentoRespostaInput {
  perguntaId: string;
  bloco: string;
  resposta?: string | null;
  naoSei?: boolean;
  naoAplica?: boolean;
  anexos?: LevantamentoAnexo[];
}

export interface LevantamentoProgressoBloco {
  bloco: string;
  total: number;
  respondidas: number;
  criticasTotal: number;
  criticasRespondidas: number;
}

export type PendenciaCategoria =
  | 'licenciamento'
  | 'tributario'
  | 'estrutural'
  | 'pop'
  | 'treinamento';

export type PendenciaStatus = 'pendente' | 'em_andamento' | 'concluido';
export type PendenciaCriticidade = 'alta' | 'media' | 'baixa';

export interface PendenciaRow {
  id: string;
  created_at: string;
  atualizado_em: string;
  titulo: string;
  descricao: string | null;
  categoria: PendenciaCategoria;
  criticidade: PendenciaCriticidade;
  responsavel_sugerido: string | null;
  prazo: string | null;
  status: PendenciaStatus;
  concluido_em: string | null;
  origem: string | null;
  ordem: number;
}

// ============================================================
// Documentos do Manual (Manual de Boas Práticas + POPs versionados)
// ============================================================

export type DocumentoTipo = 'manual' | 'pop' | 'cronograma' | 'anexo';
export type DocumentoStatus = 'rascunho' | 'vigente' | 'substituido';

export interface DocumentoRow {
  id: string;
  created_at: string;
  atualizado_em: string;
  codigo: string;
  versao: number;
  titulo: string;
  tipo: DocumentoTipo;
  conteudo_md: string;
  resumo: string | null;
  status: DocumentoStatus;
  vigente_desde: string | null;
  proxima_revisao: string | null;
  /** FK para rastreio. Nome/registro abaixo são SNAPSHOT — documento aprovado não muda. */
  aprovado_por: string | null;
  aprovado_por_nome: string | null;
  aprovado_por_registro: string | null;
  aprovado_em: string | null;
  contexto_ancora: string[];
  roles_alvo: string[];
  ordem: number;
  ativo: boolean;
}
