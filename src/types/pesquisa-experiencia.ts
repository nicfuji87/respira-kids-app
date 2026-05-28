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
  | 'pediatra_id'
  | 'pediatra_nome_outro'
  | 'profissional_indicou'
  | 'motivo_principal'
  | 'tempo_acompanhamento'
  // Demografia
  | 'idade_filho'
  | 'quantidade_filhos'
  | 'faixa_etaria'
  | 'profissao'
  // Emocional / Marca
  | 'motivos_confianca'
  | 'como_se_sente'
  | 'ambiente_transmite'
  | 'como_definiria'
  | 'conteudo_redes'
  | 'hoje_ve_como'
  // Critério decisivo + surpresa
  | 'criterio_decisao'
  | 'surpresa_positiva'
  // Percepção de valor
  | 'entrega_atendimento'
  | 'o_que_vale_pena'
  | 'comparacao_outras_experiencias'
  | 'traz_tranquilidade'
  | 'custo_beneficio'
  // Reflexivo / NPS
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
  /** Quando como_conheceu = 'pediatra' e respondente escolheu pediatra da lista. */
  pediatra_id?: string;
  /** Quando como_conheceu = 'pediatra' e respondente escolheu "Outro" (nome livre). */
  pediatra_nome_outro?: string;
  profissional_indicou?: string;
  motivo_principal?: string;
  tempo_acompanhamento?: string;

  // Demografia
  idade_filho?: string;
  quantidade_filhos?: string;
  faixa_etaria?: string;
  profissao?: string;

  // Emocional / Marca
  motivos_confianca?: string[];
  como_se_sente?: string[];
  ambiente_transmite?: string[];
  como_definiria?: string[];
  conteudo_redes?: string;
  hoje_ve_como?: string;

  // Critério decisivo + surpresa
  criterio_decisao?: string;
  surpresa_positiva?: string[];

  // Percepção de valor
  entrega_atendimento?: string;
  o_que_vale_pena?: string[];
  comparacao_outras_experiencias?: string;
  traz_tranquilidade?: string;
  custo_beneficio?: string;

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
  | 'short-text'
  | 'pediatra-search';

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

// =====================================================
// Tipos do Dashboard
// =====================================================

/**
 * Categoria de respondente baseada na nota NPS.
 */
export type NpsCategory = 'promotor' | 'neutro' | 'detrator';

/**
 * Filtros aplicáveis no dashboard.
 */
export interface DashboardFilters {
  /** ISO date (YYYY-MM-DD) - inclusive. */
  startDate?: string;
  /** ISO date (YYYY-MM-DD) - inclusive. */
  endDate?: string;
  /** Lista de canais de aquisição (como_conheceu). Vazio = todos. */
  canais?: string[];
  /** Lista de pediatra_id. */
  pediatras?: string[];
  /** Lista de tempo_acompanhamento. */
  temposAcompanhamento?: string[];
  /** Lista de idade_filho. */
  idadesFilho?: string[];
  /** Lista de motivo_principal. */
  motivos?: string[];
  /** Categorias de NPS. */
  npsCategorias?: NpsCategory[];
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
  distribuicaoProfissao: DistribuicaoItem[];
  distribuicaoQuantidadeFilhos: DistribuicaoItem[];
  distribuicaoConteudoRedes: DistribuicaoItem[];
  distribuicaoHojeVeComo: DistribuicaoItem[];
  distribuicaoCriterioDecisao: DistribuicaoItem[];
  distribuicaoEntregaAtendimento: DistribuicaoItem[];
  distribuicaoComparacaoOutras: DistribuicaoItem[];
  distribuicaoTrazTranquilidade: DistribuicaoItem[];
  distribuicaoCustoBeneficio: DistribuicaoItem[];
  /** Top respostas para multi-choice (cada opção marcada conta 1). */
  distribuicaoMotivosConfianca: DistribuicaoItem[];
  distribuicaoComoSeSente: DistribuicaoItem[];
  distribuicaoAmbienteTransmite: DistribuicaoItem[];
  distribuicaoComoDefiniria: DistribuicaoItem[];
  distribuicaoSurpresaPositiva: DistribuicaoItem[];
  distribuicaoOQueValePena: DistribuicaoItem[];
}

/**
 * Insight: NPS segmentado por uma dimensão (canal, tempo, etc.)
 */
export interface NpsSegmento {
  key: string;
  label: string;
  nps: NpsBreakdown;
  /** Média do NPS bruto (notas 1-10) — útil quando a contagem é pequena. */
  mediaNotaIndicacao: number | null;
  mediaNotaConfianca: number | null;
}

/**
 * Ranking de pediatras com NPS médio (para descobrir quem indica E gera bons clientes).
 */
export interface RankingPediatra {
  pediatra_id: string;
  nome: string;
  total_indicacoes: number;
  nps: NpsBreakdown;
  mediaNotaConfianca: number | null;
  mediaNotaIndicacao: number | null;
}

/**
 * Correlação entre uma escala 1-10 e a nota de indicação (NPS).
 * Útil para entender: "quem confia mais, indica mais?"
 */
export interface CorrelacaoNotas {
  /** Coeficiente de Pearson (-1 a 1). */
  coeficiente: number;
  total: number;
  /** Pares para scatter plot. */
  pontos: Array<{ x: number; y: number; count: number }>;
}

/**
 * Perfil resumido de um grupo (promotores, neutros, detratores).
 */
export interface PerfilGrupo {
  totalRespondentes: number;
  mediaNotaConfianca: number | null;
  mediaNotaIndicacao: number | null;
  topMotivosConfianca: DistribuicaoItem[];
  topComoSeSente: DistribuicaoItem[];
  topMotivoPrincipal: DistribuicaoItem[];
  topIdadeFilho: DistribuicaoItem[];
  topTempoAcompanhamento: DistribuicaoItem[];
  topComoConheceu: DistribuicaoItem[];
  topProfissao: DistribuicaoItem[];
  topFaixaEtaria: DistribuicaoItem[];
  topCustoBeneficio: DistribuicaoItem[];
  topOQueValePena: DistribuicaoItem[];
  topSurpresaPositiva: DistribuicaoItem[];
  comentariosAma: string[];
  comentariosMelhorar: string[];
}

export interface PesquisaExperienciaInsights {
  npsPorCanal: NpsSegmento[];
  npsPorTempoAcompanhamento: NpsSegmento[];
  npsPorIdadeFilho: NpsSegmento[];
  npsPorMotivo: NpsSegmento[];
  rankingPediatras: RankingPediatra[];
  correlacaoConfiancaIndicacao: CorrelacaoNotas;
  correlacaoCustoBeneficioIndicacao: CorrelacaoNotas;
  perfilPromotores: PerfilGrupo;
  perfilDetratores: PerfilGrupo;
  perfilNeutros: PerfilGrupo;
}
