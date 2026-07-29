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
