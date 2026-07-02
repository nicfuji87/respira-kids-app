// AI dev note: Tipos do Processo Seletivo de Estagiários Respira Kids.
// Teste público (#/vaga-estagio) + painel interno (/processo-seletivo).
// Tabela: public.candidaturas_estagio. NÃO é anônimo (coleta dados do candidato).
// O gabarito do situacional vive no servidor (RPC submit_candidatura_estagio) —
// por isso aqui NÃO existe a "resposta correta": o front só conhece os enunciados.

export type StatusCandidatura =
  | 'a_avaliar'
  | 'entrevista'
  | 'descartado'
  | 'aprovado';

/** Perfis do bloco "estilo de trabalho" (não pontua, só orienta a entrevista). */
export type EstiloPerfil =
  | 'executor'
  | 'comunicador'
  | 'cuidadoso'
  | 'analitico';

// =====================================================
// Payload enviado pela página pública
// =====================================================

export interface CandidatoDados {
  nome: string;
  email: string;
  telefone?: string;
  curso?: string;
  instituicao?: string;
  periodo?: string;
  previsao_formatura?: string;
  cidade?: string;
  disponibilidade?: string[];
  como_soube?: string;
  linkedin_url?: string;
}

/** Respostas do situacional: { s1: 'c', s2: 'b', ... } (value da alternativa). */
export type SituacionalRespostas = Record<string, string>;

/** Respostas do estilo: { e1: 'executor', ... } (perfil mapeado da alternativa). */
export type EstiloRespostas = Record<string, string>;

export interface EscritaRespostas {
  motivacao?: string;
  mae_ansiosa?: string;
}

export interface CandidaturaEstagioPayload {
  candidato: CandidatoDados;
  situacional: SituacionalRespostas;
  escrita: EscritaRespostas;
  estilo: EstiloRespostas;
}

// =====================================================
// Linha do banco (já corrigida no servidor)
// =====================================================

export interface SituacionalCorrecaoItem {
  /** id da pergunta (s1..s6). */
  id: string;
  /** alternativa escolhida (a..d) ou null se não respondeu. */
  escolha: string | null;
  /** alternativa correta (a..d). */
  correta: string;
  /** pontos obtidos (0, 1 ou 2). */
  pontos: number;
  acertou: boolean;
  /** resposta que viola segurança (ex.: deixar bebê em sofrimento). */
  perigosa: boolean;
}

export interface CandidaturaEstagioRow {
  id: string;
  created_at: string;

  // Dados
  nome: string;
  email: string;
  telefone: string | null;
  curso: string | null;
  instituicao: string | null;
  periodo: string | null;
  previsao_formatura: string | null;
  cidade: string | null;
  disponibilidade: string[];
  como_soube: string | null;
  linkedin_url: string | null;

  // Situacional
  situacional_respostas: SituacionalRespostas;
  situacional_correcao: SituacionalCorrecaoItem[];
  pontuacao_situacional: number;
  pontuacao_maxima: number;
  tem_resposta_perigosa: boolean;

  // Escrita
  texto_motivacao: string | null;
  texto_mae_ansiosa: string | null;

  // Estilo de trabalho
  estilo_respostas: EstiloRespostas;
  estilo_perfil: EstiloPerfil | null;

  // Avaliação humana
  status: StatusCandidatura;
  avaliacao_nota: number | null;
  avaliacao_observacoes: string | null;
  avaliado_por: string | null;
  avaliado_em: string | null;

  // Ficha de entrevista (roteiro preenchido presencialmente)
  entrevista: EntrevistaFicha;

  ativo: boolean;
}

// =====================================================
// Ficha de entrevista (roteiro do lado interno)
// =====================================================

/** Avaliação rápida de uma pergunta durante a entrevista. */
export type EntrevistaAvaliacao = 'bom' | 'neutro' | 'atencao';

/** Resposta do avaliador para um item do roteiro. */
export interface EntrevistaRespostaItem {
  /** já perguntei / já cobri este ponto. */
  ok?: boolean;
  /** impressão rápida da resposta do candidato. */
  aval?: EntrevistaAvaliacao | null;
  /** anotação livre. */
  nota?: string;
}

/** Ficha completa (armazenada em candidaturas_estagio.entrevista). */
export interface EntrevistaFicha {
  itens?: Record<string, EntrevistaRespostaItem>;
  impressao_geral?: string;
  pontos_fortes?: string;
  pontos_atencao?: string;
  concluida?: boolean;
  atualizado_em?: string;
}

/** Item do roteiro (pergunta a fazer na entrevista). */
export interface EntrevistaItem {
  id: string;
  pergunta: string;
  /** dica para o entrevistador: o que observar / o que é uma boa resposta. */
  dica?: string;
}

/** Bloco do roteiro (grupo de perguntas). */
export interface EntrevistaBloco {
  id: string;
  titulo: string;
  descricao?: string;
  itens: EntrevistaItem[];
}

// =====================================================
// Definição das perguntas (lado público)
// =====================================================

export interface QuestionOption {
  value: string;
  label: string;
  emoji?: string;
}

/**
 * Pergunta situacional (escolha única).
 * `competencia` é meta-informação: aparece SÓ no painel interno, nunca para o
 * candidato (a graça do teste é não entregar o que está sendo avaliado).
 */
export interface SituacionalQuestion {
  id: string; // s1..s6
  competencia: string;
  enunciado: string;
  options: QuestionOption[]; // values 'a'..'d'
}

/** Pergunta do bloco estilo de trabalho (escolha única, não pontua). */
export interface EstiloQuestion {
  id: string; // e1..e5
  pergunta: string;
  /** value de cada opção = EstiloPerfil correspondente. */
  options: QuestionOption[];
}

/** Pergunta escrita (texto longo). */
export interface EscritaQuestion {
  id: keyof EscritaRespostas;
  titulo: string;
  subtitulo?: string;
  placeholder?: string;
  minChars?: number;
  maxChars?: number;
}

export type DadosFieldType = 'text' | 'email' | 'tel' | 'multi' | 'select';

export interface DadosField {
  id: keyof CandidatoDados;
  label: string;
  type: DadosFieldType;
  required?: boolean;
  placeholder?: string;
  /** Para 'multi' e 'select'. */
  options?: QuestionOption[];
  /** Layout: ocupa a linha inteira (true) ou metade (false/omitido). */
  fullWidth?: boolean;
}

// =====================================================
// Painel interno
// =====================================================

export interface ProcessoSeletivoStats {
  total: number;
  aAvaliar: number;
  entrevista: number;
  aprovados: number;
  descartados: number;
  comRespostaPerigosa: number;
  mediaPontuacao: number | null;
  pontuacaoMaxima: number;
}

/** Recomendação automática (sugestão — a decisão final é humana). */
export type RecomendacaoTone = 'forte' | 'mediano' | 'fraco' | 'alerta';

export interface Recomendacao {
  tone: RecomendacaoTone;
  label: string;
}
