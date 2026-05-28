// AI dev note: Tipos da Pesquisa de Experiência Respira Kids
// Pesquisa pública, anônima. Sem dados pessoais identificáveis.
// Tabela: public.pesquisas_experiencia

/**
 * Chaves que correspondem 1:1 às colunas da tabela pesquisas_experiencia.
 * Mantidas como union type para tipagem segura nos componentes.
 */
export type PesquisaExperienciaField =
  // Jornada
  | 'como_conheceu'
  | 'profissional_indicou'
  | 'motivo_principal'
  | 'tempo_acompanhamento'
  // Demografia
  | 'idade_filho'
  | 'quantidade_filhos'
  | 'faixa_etaria'
  | 'profissao'
  // Emocional
  | 'motivos_confianca'
  | 'como_se_sente'
  | 'ambiente_transmite'
  | 'como_definiria'
  | 'se_fosse_pessoa'
  | 'conteudo_redes'
  | 'hoje_ve_como'
  // Reflexivo
  | 'nota_confianca'
  | 'nota_indicacao'
  | 'o_que_mais_ama'
  | 'o_que_melhorar';

/**
 * Resposta acumulada da pesquisa (estado do formulário no client).
 * Todos os campos opcionais — campo só preenchido quando a mãe responde.
 */
export interface PesquisaExperienciaResposta {
  // Jornada
  como_conheceu?: string;
  profissional_indicou?: string;
  motivo_principal?: string;
  tempo_acompanhamento?: string;

  // Demografia
  idade_filho?: string;
  quantidade_filhos?: string;
  faixa_etaria?: string;
  profissao?: string;

  // Emocional
  motivos_confianca?: string[];
  como_se_sente?: string[];
  ambiente_transmite?: string[];
  como_definiria?: string[];
  se_fosse_pessoa?: string[];
  conteudo_redes?: string;
  hoje_ve_como?: string;

  // Reflexivo
  nota_confianca?: number;
  nota_indicacao?: number;
  o_que_mais_ama?: string;
  o_que_melhorar?: string;
}

export interface PesquisaExperienciaRow extends PesquisaExperienciaResposta {
  id: string;
  created_at: string;
}

/**
 * Estrutura de definição de uma pergunta do fluxo.
 */
export type QuestionType =
  | 'single-choice'
  | 'multi-choice'
  | 'scale-10'
  | 'short-text';

export interface QuestionOption {
  value: string;
  label: string;
  emoji?: string;
}

export interface SurveyQuestion {
  id: PesquisaExperienciaField;
  type: QuestionType;
  title: string;
  subtitle?: string;
  helper?: string;
  /** Texto exibido no botão quando o tipo da pergunta é "scale-10" ou "short-text". */
  ctaLabel?: string;
  /** Para multi-choice: limite máximo de seleções. */
  maxSelections?: number;
  /** Se true, a pergunta pode ser pulada (avança para a próxima). */
  optional?: boolean;
  /** Opções para single-choice / multi-choice. */
  options?: QuestionOption[];
  /** Condição para exibir esta pergunta. */
  visibleWhen?: (resposta: PesquisaExperienciaResposta) => boolean;
}

/**
 * Estatísticas agregadas para o dashboard.
 */
export interface NpsBreakdown {
  promotores: number;
  neutros: number;
  detratores: number;
  total: number;
  /** NPS clássico: %promotores - %detratores (-100 a 100) */
  nps: number;
}

export interface DistribuicaoItem {
  value: string;
  label: string;
  count: number;
  percent: number;
}

export interface PesquisaExperienciaStats {
  totalRespostas: number;
  respostasUltimos30Dias: number;
  respostasUltimos7Dias: number;
  notaConfiancaMedia: number | null;
  notaIndicacaoMedia: number | null;
  nps: NpsBreakdown;
  /** Distribuição das notas 1-10 (índice = nota - 1) */
  distribuicaoConfianca: number[];
  distribuicaoIndicacao: number[];
  /** Respostas por dia (últimos 30 dias). */
  respostasPorDia: Array<{ data: string; total: number }>;
  /** Top respostas para campos single-choice. */
  distribuicaoComoConheceu: DistribuicaoItem[];
  distribuicaoMotivoPrincipal: DistribuicaoItem[];
  distribuicaoTempoAcompanhamento: DistribuicaoItem[];
  distribuicaoIdadeFilho: DistribuicaoItem[];
  distribuicaoFaixaEtaria: DistribuicaoItem[];
  distribuicaoConteudoRedes: DistribuicaoItem[];
  distribuicaoHojeVeComo: DistribuicaoItem[];
  /** Top respostas para multi-choice (cada opção marcada conta 1). */
  distribuicaoMotivosConfianca: DistribuicaoItem[];
  distribuicaoComoSeSente: DistribuicaoItem[];
  distribuicaoAmbienteTransmite: DistribuicaoItem[];
  distribuicaoComoDefiniria: DistribuicaoItem[];
  distribuicaoSeFossePessoa: DistribuicaoItem[];
}
