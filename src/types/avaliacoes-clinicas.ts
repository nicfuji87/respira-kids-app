// AI dev note: Types para Avaliações Clínicas TM/AC
// Torcicolo Muscular Congênito / Assimetria Craniana

// =====================================================
// ENUMS E TIPOS AUXILIARES
// =====================================================

export type AvaliacaoStatus = 'rascunho' | 'finalizada' | 'revisao';

export type ApresentacaoFetal = 'cefalica' | 'pelvica' | 'transversa' | 'outra';

export type TipoParto = 'normal' | 'cesarea';

export type LocalInternacao = 'alojamento_conjunto' | 'uti_neonatal' | 'outro';

export type PreferenciaRotacao = 'direita' | 'esquerda' | 'sem_preferencia';

export type InclinacaoLateral = 'direita' | 'esquerda' | 'ausente';

export type TipoTorcicolo = 'postural' | 'congenito';

export type TorcicoloNodulo = 'com_nodulo' | 'sem_nodulo';

// Nova classificação clínica de Torcicolo (padrão ouro)
export type TorcicoloTipoClinico = 'POST' | 'MT' | 'SMT' | 'outros';
export type AtitudeCabeca =
  | 'centralizada'
  | 'inclinada_dir_rodada_esq'
  | 'inclinada_esq_rodada_dir'
  | 'atipica';
export type ElevacaoOmbro = 'ausente' | 'direito_elevado' | 'esquerdo_elevado';
export type TonusECOM = 'normal' | 'tenso_corda';
export type LocalizacaoNodulo =
  | 'ausente'
  | 'terco_inferior'
  | 'terco_medio'
  | 'terco_superior';
export type TamanhoNodulo = 'menor_1cm' | '1_3cm' | 'maior_3cm';

// Interface para dados detalhados de Torcicolo
export interface TorcicoloDetalhado {
  // Inspeção Visual
  atitude_cabeca?: AtitudeCabeca;
  atitude_cabeca_obs?: string; // Para "atípica"
  elevacao_ombro?: ElevacaoOmbro;

  // Palpação ECOM Direito
  ecom_direito_tonus?: TonusECOM;
  ecom_direito_nodulo?: LocalizacaoNodulo;
  ecom_direito_nodulo_tamanho?: TamanhoNodulo;

  // Palpação ECOM Esquerdo
  ecom_esquerdo_tonus?: TonusECOM;
  ecom_esquerdo_nodulo?: LocalizacaoNodulo;
  ecom_esquerdo_nodulo_tamanho?: TamanhoNodulo;

  // Diagnóstico
  tipo_clinico?: TorcicoloTipoClinico;
  tipo_clinico_outros?: string; // Se "outros"
  lado_afetado?: 'direito' | 'esquerdo' | 'bilateral';

  // Grau calculado automaticamente
  grau_calculado?: number; // 1 a 8
  grau_descricao?: string;

  // Observações
  observacoes?: string;
}

// Constantes para UI - Tipo de Torcicolo
export const ATITUDE_CABECA_OPCOES = [
  {
    valor: 'centralizada',
    label: 'Centralizada',
    descricao: 'Cabeça alinhada, sem preferência',
    icone: '⬆️',
  },
  {
    valor: 'inclinada_dir_rodada_esq',
    label: 'Inclinada D / Rodada E',
    descricao: 'Padrão típico - ECOM direito afetado',
    icone: '↗️',
  },
  {
    valor: 'inclinada_esq_rodada_dir',
    label: 'Inclinada E / Rodada D',
    descricao: 'Padrão típico - ECOM esquerdo afetado',
    icone: '↖️',
  },
  {
    valor: 'atipica',
    label: 'Atípica',
    descricao: 'Inclina e roda para o mesmo lado - investigar!',
    icone: '⚠️',
  },
] as const;

export const ELEVACAO_OMBRO_OPCOES = [
  { valor: 'ausente', label: 'Ausente', descricao: 'Ombros simétricos' },
  {
    valor: 'direito_elevado',
    label: 'Direito Elevado',
    descricao: 'Ombro direito mais alto',
  },
  {
    valor: 'esquerdo_elevado',
    label: 'Esquerdo Elevado',
    descricao: 'Ombro esquerdo mais alto',
  },
] as const;

export const TONUS_ECOM_OPCOES = [
  { valor: 'normal', label: 'Normal', descricao: 'Músculo com tônus normal' },
  {
    valor: 'tenso_corda',
    label: 'Tenso/Corda',
    descricao: 'Músculo tenso, em corda',
  },
] as const;

export const LOCALIZACAO_NODULO_OPCOES = [
  { valor: 'ausente', label: 'Ausente', descricao: 'Sem nódulo palpável' },
  {
    valor: 'terco_inferior',
    label: 'Terço Inferior',
    descricao: 'Nódulo no terço inferior do ECOM',
  },
  {
    valor: 'terco_medio',
    label: 'Terço Médio',
    descricao: 'Nódulo no terço médio do ECOM',
  },
  {
    valor: 'terco_superior',
    label: 'Terço Superior',
    descricao: 'Nódulo no terço superior do ECOM',
  },
] as const;

export const TAMANHO_NODULO_OPCOES = [
  { valor: 'menor_1cm', label: '< 1cm', descricao: 'Nódulo pequeno' },
  { valor: '1_3cm', label: '1-3cm', descricao: 'Nódulo médio' },
  { valor: 'maior_3cm', label: '> 3cm', descricao: 'Nódulo grande' },
] as const;

export const TIPO_CLINICO_TORCICOLO_OPCOES = [
  {
    valor: 'POST',
    label: 'POST - Postural',
    descricao: 'Preferência postural, ADM passiva completa',
    cor: 'bg-green-500',
  },
  {
    valor: 'MT',
    label: 'MT - Muscular',
    descricao: 'Restrição de ADM passiva, sem massa palpável',
    cor: 'bg-yellow-500',
  },
  {
    valor: 'SMT',
    label: 'SMT - Muscular c/ Massa',
    descricao: 'Restrição de ADM + nódulo/massa no ECOM',
    cor: 'bg-red-500',
  },
  {
    valor: 'outros',
    label: 'Outros',
    descricao: 'Ocular, ósseo, neurológico - encaminhar',
    cor: 'bg-purple-500',
  },
] as const;

export type TensaoNeuromeningeaLegado = 'negativa' | 'positiva';

// Nova estrutura detalhada para Tensão Neuromeníngea
export type TensaoNeuromeningeaStatus = 'normal' | 'alterado' | 'nao_testado';
export type TensaoNeuromeningeaSintoma =
  | 'choro'
  | 'resistencia'
  | 'retracao'
  | 'assimetria'
  | 'dor';
export type TensaoNeuromeningeaEndFeel =
  | 'normal'
  | 'resistencia'
  | 'rigido'
  | 'vazio';

export interface TensaoNeuromeningeaAvaliacao {
  status?: TensaoNeuromeningeaStatus;
  sintomas?: TensaoNeuromeningeaSintoma[];
  endFeel?: TensaoNeuromeningeaEndFeel;
  observacoes?: string;
}

export interface TensaoNeuromeningeaDetalhada {
  // Membros superiores
  membro_superior_direito?: TensaoNeuromeningeaAvaliacao;
  membro_superior_esquerdo?: TensaoNeuromeningeaAvaliacao;
  // Membros inferiores (SLR)
  membro_inferior_direito?: TensaoNeuromeningeaAvaliacao;
  membro_inferior_esquerdo?: TensaoNeuromeningeaAvaliacao;
  // Neuroeixo
  flexao_passiva_pescoco?: TensaoNeuromeningeaAvaliacao;
  // Observações gerais
  observacoes_gerais?: string;
}

// Constantes para UI
export const TENSAO_SINTOMAS_OPCOES = [
  {
    valor: 'choro',
    label: 'Choro imediato',
    icone: '😢',
    descricao: 'Choro ao realizar o teste',
  },
  {
    valor: 'resistencia',
    label: 'Resistência muscular',
    icone: '💪',
    descricao: 'Aumento da resistência (guarding)',
  },
  {
    valor: 'retracao',
    label: 'Retração do membro',
    icone: '↩️',
    descricao: 'Recoil - membro volta rapidamente',
  },
  {
    valor: 'assimetria',
    label: 'Assimetria',
    icone: '⚖️',
    descricao: 'Diferença comparada ao outro lado',
  },
  {
    valor: 'dor',
    label: 'Expressão de dor',
    icone: '😣',
    descricao: 'Expressão facial de desconforto',
  },
] as const;

export const TENSAO_END_FEEL_OPCOES = [
  {
    valor: 'normal',
    label: 'Normal',
    descricao: 'Sensação final suave e elástica',
  },
  {
    valor: 'resistencia',
    label: 'Resistência',
    descricao: 'Resistência aumentada antes do fim esperado',
  },
  { valor: 'rigido', label: 'Rígido', descricao: 'Bloqueio firme e duro' },
  {
    valor: 'vazio',
    label: 'Vazio',
    descricao: 'Parada por dor antes de resistência mecânica',
  },
] as const;

export type Tonus = 'normal' | 'aumentado' | 'reduzido';

export type PreferenciaManual = 'direita' | 'esquerda' | 'indefinida';

export type ReavaliacaoRecomendada =
  | '1_semana'
  | '2_semanas'
  | '1_mes'
  | 'outro';

export type AssimetriaTipo =
  | 'craniana'
  | 'facial'
  | 'mandibular'
  | 'olhos'
  | 'orelhas'
  | 'falhas_cabelo'
  | 'assadura_cervical'
  | 'outra';

export type PlagiocefaliaTipo = 'aboboda' | 'base' | 'mista';

export type OutrasAssimetrias =
  | 'braquicefalia'
  | 'escafocefalia'
  | 'assimetria_facial';

export type ReflexoBusca = 'presente' | 'ausente';

export type LiquidoAmniotico =
  | 'normal'
  | 'oligoamnio'
  | 'polidramnio'
  | 'outro';

export type InstrumentoParto =
  | 'forceps'
  | 'vacuo_extrator'
  | 'kristeller'
  | 'episiotomia'
  | 'outro';

// Tipos para Características do Bebê
export type EstadoEmocional =
  | 'calmo'
  | 'irritado'
  | 'choroso'
  | 'agitado'
  | 'sonolento'
  | 'alerta';

export type OndeDorme =
  | 'berco_quarto_pais'
  | 'berco_quarto_proprio'
  | 'cama_pais'
  | 'carrinho'
  | 'bebe_conforto'
  | 'outro';

export type QualidadeSono =
  | 'bom'
  | 'regular'
  | 'ruim'
  | 'fragmentado'
  | 'dorme_pouco'
  | 'dorme_muito'
  | 'variado';

export type PosicaoPreferencia =
  | 'direita'
  | 'esquerda'
  | 'costas'
  | 'brucos'
  | 'sem_preferencia';

export type SimNaoSuspeita = 'sim' | 'nao' | 'suspeita';

export type TipoRefluxo = 'fisiologico' | 'patologico';

// Marcos Motores por faixa etária
export interface MarcoMotor {
  id: string;
  faixa: string;
  descricao: string;
  idade_min_meses: number;
  idade_max_meses: number;
}

export interface MarcosMotoresAtingidos {
  [marcoId: string]: boolean;
}

// Interface para informações de cada gestação (quando gestação múltipla)
export interface GestacaoInfo {
  numero: number; // 1, 2, 3...
  idade_gestacional_semanas?: number;
  observacoes?: string;
}

// =====================================================
// INTERFACES DE CAMPOS JSONB
// =====================================================

export interface Goniometria {
  rotacao?: {
    ativa_direita?: number;
    passiva_direita?: number;
    ativa_esquerda?: number;
    passiva_esquerda?: number;
  };
  inclinacao?: {
    ativa_direita?: number;
    passiva_direita?: number;
    ativa_esquerda?: number;
    passiva_esquerda?: number;
  };
  // Campos de avaliação qualitativa
  rotacao_qualidade?: 'sem_restricao' | 'leve' | 'moderada' | 'severa';
  inclinacao_qualidade?: 'sem_restricao' | 'leve' | 'moderada' | 'severa';
  sensacao_final?: 'rigida' | 'elastica' | 'com_dor' | 'normal';
  observacoes?: string;
}

// Valores de Referência por Idade para Goniometria Cervical
// Fonte: Klackenberg et al. (2005) - TABLE 4
export const GONIOMETRIA_REFERENCIA_IDADE = [
  { idade_meses: 2, rotacao_media: 105.2, inclinacao_media: 68.1 },
  { idade_meses: 4, rotacao_media: 111.8, inclinacao_media: 69.5 },
  { idade_meses: 6, rotacao_media: 112.4, inclinacao_media: 69.2 },
  { idade_meses: 10, rotacao_media: 111.7, inclinacao_media: 70.0 },
] as const;

// Classificação de Severidade da Assimetria (baseado em Cheng et al.)
export const GONIOMETRIA_CLASSIFICACAO_ASSIMETRIA = [
  { nivel: 'normal', label: 'Normal', min: 0, max: 5, cor: 'bg-green-500' },
  { nivel: 'leve', label: 'Leve', min: 5, max: 15, cor: 'bg-yellow-500' },
  {
    nivel: 'moderada',
    label: 'Moderada',
    min: 15,
    max: 30,
    cor: 'bg-orange-500',
  },
  {
    nivel: 'severa',
    label: 'Severa',
    min: 30,
    max: Infinity,
    cor: 'bg-red-500',
  },
] as const;

// Opções de qualidade do movimento
export const GONIOMETRIA_QUALIDADE_OPCOES = [
  {
    valor: 'sem_restricao',
    label: 'Sem restrição',
    descricao: 'Amplitude completa',
  },
  {
    valor: 'leve',
    label: 'Restrição Leve',
    descricao: 'Restrição no fim da ADM',
  },
  {
    valor: 'moderada',
    label: 'Restrição Moderada',
    descricao: 'Restrição no meio da ADM',
  },
  {
    valor: 'severa',
    label: 'Restrição Severa',
    descricao: 'Grande limitação de movimento',
  },
] as const;

export const GONIOMETRIA_SENSACAO_FINAL_OPCOES = [
  {
    valor: 'normal',
    label: 'Normal',
    descricao: 'Sensação final suave e elástica',
  },
  {
    valor: 'rigida',
    label: 'Rígida',
    descricao: 'Bloqueio firme, resistência óssea ou muscular',
  },
  {
    valor: 'elastica',
    label: 'Elástica',
    descricao: 'Resistência com retorno elástico',
  },
  {
    valor: 'com_dor',
    label: 'Com dor',
    descricao: 'Limitação por dor antes do fim da ADM',
  },
] as const;

// Tipos para Função Visual
export type RastreioVisual =
  | 'simetrico'
  | 'restrito_direita'
  | 'restrito_esquerda';
export type ContatoVisual = 'sustentado' | 'fugaz' | 'ausente';
export type AlinhamentoOcular = 'normal' | 'convergente' | 'divergente';

// Tipos para Função Oral
export type VedamentoLabial = 'labios_fechados' | 'labios_abertos';
export type AnatomiaLingua = 'normal' | 'frenulo_curto' | 'em_coracao';
export type CoordenacaoSDR = 'coordenada' | 'cansaco_pausas' | 'engasgos_tosse';
export type ReflexoGag = 'normal' | 'hiperativo' | 'hipoativo';

// Tipos para Função Auditiva
export type LocalizacaoSonora = 'vira_rapido' | 'vira_lento' | 'indiferente';
export type ReacaoRuidos =
  | 'normal'
  | 'susto_exacerbado'
  | 'choro'
  | 'indiferente';

export interface FuncoesSensoriais {
  visual?: {
    acompanha_alvo?: boolean; // Campo legado
    rastreio_visual?: RastreioVisual;
    contato_visual?: ContatoVisual;
    alinhamento_ocular?: AlinhamentoOcular;
    observacoes?: string;
  };
  auditiva?: {
    busca_fonte_sonora?: boolean; // Campo legado
    localizacao_sonora?: LocalizacaoSonora;
    reacao_ruidos?: ReacaoRuidos;
    observacoes?: string;
  };
  oral?: {
    reflexo_busca?: ReflexoBusca;
    succao?: string; // Campo legado
    degluticao?: string; // Campo legado
    vedamento_labial?: VedamentoLabial;
    anatomia_lingua?: AnatomiaLingua;
    frenectomia?: 'nao' | 'sim' | 'aguardando';
    coordenacao_sdr?: CoordenacaoSDR;
    reflexo_gag?: ReflexoGag;
    observacoes?: string;
  };
}

// Constantes para UI - Função Visual
export const RASTREIO_VISUAL_OPCOES = [
  {
    valor: 'simetrico',
    label: 'Simétrico',
    descricao: 'Rastreia igualmente para ambos os lados',
    icone: '✓',
  },
  {
    valor: 'restrito_direita',
    label: 'Restrito à Direita',
    descricao: 'Dificuldade em olhar para a direita',
    icone: '👉',
  },
  {
    valor: 'restrito_esquerda',
    label: 'Restrito à Esquerda',
    descricao: 'Dificuldade em olhar para a esquerda',
    icone: '👈',
  },
] as const;

export const CONTATO_VISUAL_OPCOES = [
  {
    valor: 'sustentado',
    label: 'Sustentado',
    descricao: 'Mantém contato visual por tempo adequado',
  },
  {
    valor: 'fugaz',
    label: 'Fugaz',
    descricao: 'Contato visual breve e intermitente',
  },
  {
    valor: 'ausente',
    label: 'Ausente',
    descricao: 'Não estabelece contato visual',
  },
] as const;

export const ALINHAMENTO_OCULAR_OPCOES = [
  { valor: 'normal', label: 'Normal', descricao: 'Olhos alinhados' },
  {
    valor: 'convergente',
    label: 'Convergente',
    descricao: 'Estrabismo convergente (olhos para dentro)',
  },
  {
    valor: 'divergente',
    label: 'Divergente',
    descricao: 'Estrabismo divergente (olhos para fora)',
  },
] as const;

// Constantes para UI - Função Oral
export const VEDAMENTO_LABIAL_OPCOES = [
  {
    valor: 'labios_fechados',
    label: 'Lábios Fechados',
    descricao: 'Respiração nasal (normal)',
    icone: '👄',
  },
  {
    valor: 'labios_abertos',
    label: 'Lábios Abertos',
    descricao: 'Respiração oral (atenção!)',
    icone: '😮',
  },
] as const;

export const ANATOMIA_LINGUA_OPCOES = [
  {
    valor: 'normal',
    label: 'Normal',
    descricao: 'Anatomia e mobilidade normais',
  },
  {
    valor: 'frenulo_curto',
    label: 'Frênulo Curto',
    descricao: 'Língua presa - pode causar tensão cervical anterior',
  },
  {
    valor: 'em_coracao',
    label: 'Em Coração',
    descricao: 'Formato em coração ao protrair (sugestivo de anquiloglossia)',
  },
] as const;

export const FRENECTOMIA_OPCOES = [
  { valor: 'nao', label: 'Não', descricao: 'Não realizou frenectomia' },
  { valor: 'sim', label: 'Sim', descricao: 'Já realizou frenectomia' },
  {
    valor: 'aguardando',
    label: 'Aguardando',
    descricao: 'Indicada, aguardando procedimento',
  },
] as const;

export const COORDENACAO_SDR_OPCOES = [
  {
    valor: 'coordenada',
    label: 'Coordenada',
    descricao: 'Sucção/Deglutição/Respiração em harmonia',
  },
  {
    valor: 'cansaco_pausas',
    label: 'Cansaço/Pausas',
    descricao: 'Precisa de pausas frequentes durante mamada',
  },
  {
    valor: 'engasgos_tosse',
    label: 'Engasgos/Tosse',
    descricao: 'Apresenta engasgos ou tosse durante alimentação',
  },
] as const;

export const REFLEXO_GAG_OPCOES = [
  {
    valor: 'normal',
    label: 'Normal',
    descricao: 'Reflexo de vômito presente e adequado',
  },
  {
    valor: 'hiperativo',
    label: 'Hiperativo',
    descricao: 'Ânsia fácil, hipersensibilidade oral',
  },
  {
    valor: 'hipoativo',
    label: 'Hipoativo',
    descricao: 'Reflexo diminuído ou ausente',
  },
] as const;

// Constantes para UI - Função Auditiva
export const LOCALIZACAO_SONORA_OPCOES = [
  {
    valor: 'vira_rapido',
    label: 'Vira a cabeça rápido',
    descricao: 'Localiza e vira prontamente para o som',
  },
  {
    valor: 'vira_lento',
    label: 'Vira lentamente',
    descricao: 'Localiza mas vira com atraso',
  },
  {
    valor: 'indiferente',
    label: 'Indiferente',
    descricao: 'Não demonstra reação ao som',
  },
] as const;

export const REACAO_RUIDOS_OPCOES = [
  { valor: 'normal', label: 'Normal', descricao: 'Reação adequada a sons' },
  {
    valor: 'susto_exacerbado',
    label: 'Susto Exacerbado',
    descricao: 'Moro intenso, indicativo de SNA em alerta',
  },
  { valor: 'choro', label: 'Choro', descricao: 'Chora ao ouvir ruídos' },
  {
    valor: 'indiferente',
    label: 'Indiferente',
    descricao: 'Não reage a ruídos',
  },
] as const;

// =====================================================
// MEDIDAS CRANIOMÉTRICAS (Cefalometria Completa)
// =====================================================

// Tipos para classificação
export type PlagiocefaliaSeveridade =
  | 'normal'
  | 'leve'
  | 'moderada'
  | 'severa'
  | 'muito_severa';
export type BraquicefaliaSeveridade =
  | 'escafocefalia'
  | 'normal'
  | 'braquicefalia_leve'
  | 'braquicefalia_moderada'
  | 'braquicefalia_severa';
export type FormatoCraniano =
  | 'normal'
  | 'plagiocefalia'
  | 'braquicefalia'
  | 'escafocefalia'
  | 'misto';
export type EarShift =
  | 'alinhadas'
  | 'direita_anterior'
  | 'esquerda_anterior'
  | 'menor_5mm'
  | 'maior_5mm';
export type BossingFrontal =
  | 'ausente'
  | 'mesmo_lado_achatamento'
  | 'lado_oposto'
  | 'bilateral';

export interface MedidasCraniometricas {
  // Medidas das diagonais (para Plagiocefalia)
  diagonal_a_mm?: number; // Diagonal maior (Testa Esq → Nuca Dir ou inversa)
  diagonal_b_mm?: number; // Diagonal menor (Testa Dir → Nuca Esq ou inversa)

  // Medidas de dimensão (para Braquicefalia/Escafocefalia)
  comprimento_ap_mm?: number; // Comprimento Antero-Posterior (Glabela → Opistocrânio)
  largura_ml_mm?: number; // Largura Médio-Lateral (Eurion → Eurion)

  // Perímetro
  perimetro_cefalico_cm?: number;

  // Métricas calculadas automaticamente
  cva_mm?: number; // Cranial Vault Asymmetry (|Diag A - Diag B|)
  cvai_percentual?: number; // CVAI (CVA / Maior Diagonal * 100)
  ci_percentual?: number; // Índice Cefálico (Largura / Comprimento * 100)

  // Classificações automáticas
  plagiocefalia_severidade?: PlagiocefaliaSeveridade;
  braquicefalia_severidade?: BraquicefaliaSeveridade;
  formato_craniano?: FormatoCraniano;

  // Controle de qualidade
  pontos_marcados_fita?: boolean; // Se usou fita para marcar pontos

  // Campos legados para compatibilidade
  diagonal_direita_30?: number;
  diagonal_esquerda_30?: number;
  assimetria_mm?: number;
  circunferencia_cm?: number;
}

export interface AssimetriaCraniana {
  plagiocefalia?: {
    tipo?: PlagiocefaliaTipo;
    severidade?: PlagiocefaliaSeveridade; // Novo: preenchido automaticamente
  };

  // Observações qualitativas
  ear_shift?: EarShift; // Desalinhamento das orelhas
  ear_shift_lado?: 'direita' | 'esquerda'; // Qual lado está anteriorizado
  bossing_frontal?: BossingFrontal; // Proeminência da testa
  bossing_frontal_lado?: 'direita' | 'esquerda' | 'bilateral';
  assimetria_facial?: boolean;
  assimetria_facial_descricao?: string;

  outras?: OutrasAssimetrias[];
  observacoes?: string;
}

// Constantes para classificação de Plagiocefalia (baseado em CVAI - Escala CHOA)
export const PLAGIOCEFALIA_CLASSIFICACAO = [
  {
    nivel: 1,
    label: 'Normal',
    severidade: 'normal' as PlagiocefaliaSeveridade,
    cvai_min: 0,
    cvai_max: 3.5,
    cor: 'bg-green-500',
    emoji: '🟢',
  },
  {
    nivel: 2,
    label: 'Leve',
    severidade: 'leve' as PlagiocefaliaSeveridade,
    cvai_min: 3.5,
    cvai_max: 6.25,
    cor: 'bg-yellow-500',
    emoji: '🟡',
  },
  {
    nivel: 3,
    label: 'Moderada',
    severidade: 'moderada' as PlagiocefaliaSeveridade,
    cvai_min: 6.25,
    cvai_max: 8.75,
    cor: 'bg-orange-500',
    emoji: '🟠',
  },
  {
    nivel: 4,
    label: 'Severa',
    severidade: 'severa' as PlagiocefaliaSeveridade,
    cvai_min: 8.75,
    cvai_max: 11.0,
    cor: 'bg-red-500',
    emoji: '🔴',
  },
  {
    nivel: 5,
    label: 'Muito Severa',
    severidade: 'muito_severa' as PlagiocefaliaSeveridade,
    cvai_min: 11.0,
    cvai_max: 100,
    cor: 'bg-red-700',
    emoji: '🔴🔴',
  },
] as const;

// Constantes para classificação de Braquicefalia/Escafocefalia (baseado em CI)
export const BRAQUICEFALIA_CLASSIFICACAO = [
  {
    label: 'Escafocefalia',
    severidade: 'escafocefalia' as BraquicefaliaSeveridade,
    ci_min: 0,
    ci_max: 75,
    cor: 'bg-purple-500',
    descricao: 'Cabeça alongada/estreita',
  },
  {
    label: 'Normal (Mesocefálico)',
    severidade: 'normal' as BraquicefaliaSeveridade,
    ci_min: 75,
    ci_max: 85,
    cor: 'bg-green-500',
    descricao: 'Proporção normal',
  },
  {
    label: 'Braquicefalia Leve',
    severidade: 'braquicefalia_leve' as BraquicefaliaSeveridade,
    ci_min: 85,
    ci_max: 90,
    cor: 'bg-yellow-500',
    descricao: 'Cabeça levemente achatada',
  },
  {
    label: 'Braquicefalia Moderada',
    severidade: 'braquicefalia_moderada' as BraquicefaliaSeveridade,
    ci_min: 90,
    ci_max: 100,
    cor: 'bg-orange-500',
    descricao: 'Cabeça moderadamente achatada',
  },
  {
    label: 'Braquicefalia Severa',
    severidade: 'braquicefalia_severa' as BraquicefaliaSeveridade,
    ci_min: 100,
    ci_max: 200,
    cor: 'bg-red-500',
    descricao: 'Cabeça severamente achatada',
  },
] as const;

// Opções para Ear Shift
export const EAR_SHIFT_OPCOES = [
  { valor: 'alinhadas', label: 'Alinhadas', descricao: 'Orelhas simétricas' },
  { valor: 'menor_5mm', label: '< 5mm', descricao: 'Desalinhamento discreto' },
  {
    valor: 'maior_5mm',
    label: '> 5mm',
    descricao: 'Desalinhamento significativo - base craniana afetada',
  },
] as const;

// Opções para Bossing Frontal
export const BOSSING_FRONTAL_OPCOES = [
  { valor: 'ausente', label: 'Ausente', descricao: 'Testa simétrica' },
  {
    valor: 'mesmo_lado_achatamento',
    label: 'Mesmo lado do achatamento',
    descricao: 'Compensação típica',
  },
  {
    valor: 'lado_oposto',
    label: 'Lado oposto ao achatamento',
    descricao: 'Padrão atípico',
  },
  {
    valor: 'bilateral',
    label: 'Bilateral',
    descricao: 'Ambos os lados proeminentes',
  },
] as const;

/**
 * Calcula as métricas craniométricas automaticamente
 */
export function calcularMetricasCraniometricas(
  medidas: MedidasCraniometricas
): {
  cva_mm: number | null;
  cvai_percentual: number | null;
  ci_percentual: number | null;
  plagiocefalia_severidade: PlagiocefaliaSeveridade | null;
  braquicefalia_severidade: BraquicefaliaSeveridade | null;
  formato_craniano: FormatoCraniano;
  alertas: string[];
} {
  const alertas: string[] = [];

  // Calcular CVA (Assimetria Absoluta em mm)
  let cva_mm: number | null = null;
  let cvai_percentual: number | null = null;
  let plagiocefalia_severidade: PlagiocefaliaSeveridade | null = null;

  if (medidas.diagonal_a_mm && medidas.diagonal_b_mm) {
    const maiorDiagonal = Math.max(
      medidas.diagonal_a_mm,
      medidas.diagonal_b_mm
    );
    const menorDiagonal = Math.min(
      medidas.diagonal_a_mm,
      medidas.diagonal_b_mm
    );

    cva_mm = maiorDiagonal - menorDiagonal;
    cvai_percentual = (cva_mm / maiorDiagonal) * 100;

    // Classificar plagiocefalia
    for (const nivel of PLAGIOCEFALIA_CLASSIFICACAO) {
      if (
        cvai_percentual >= nivel.cvai_min &&
        cvai_percentual < nivel.cvai_max
      ) {
        plagiocefalia_severidade = nivel.severidade;
        if (nivel.nivel >= 3) {
          alertas.push(
            `⚠️ Plagiocefalia ${nivel.label} detectada (CVAI: ${cvai_percentual.toFixed(1)}%)`
          );
        }
        break;
      }
    }
  }

  // Calcular CI (Índice Cefálico)
  let ci_percentual: number | null = null;
  let braquicefalia_severidade: BraquicefaliaSeveridade | null = null;

  if (
    medidas.comprimento_ap_mm &&
    medidas.largura_ml_mm &&
    medidas.comprimento_ap_mm > 0
  ) {
    ci_percentual = (medidas.largura_ml_mm / medidas.comprimento_ap_mm) * 100;

    // Classificar braquicefalia
    for (const nivel of BRAQUICEFALIA_CLASSIFICACAO) {
      if (ci_percentual >= nivel.ci_min && ci_percentual < nivel.ci_max) {
        braquicefalia_severidade = nivel.severidade;
        if (nivel.severidade === 'escafocefalia') {
          alertas.push(
            `⚠️ Escafocefalia detectada (CI: ${ci_percentual.toFixed(1)}%)`
          );
        } else if (nivel.severidade.includes('braquicefalia')) {
          alertas.push(
            `⚠️ ${nivel.label} detectada (CI: ${ci_percentual.toFixed(1)}%)`
          );
        }
        break;
      }
    }
  }

  // Determinar formato craniano
  let formato_craniano: FormatoCraniano = 'normal';

  const temPlagiocefalia =
    plagiocefalia_severidade && plagiocefalia_severidade !== 'normal';
  const temBraquicefalia =
    braquicefalia_severidade &&
    braquicefalia_severidade.includes('braquicefalia');
  const temEscafocefalia = braquicefalia_severidade === 'escafocefalia';

  if (temPlagiocefalia && (temBraquicefalia || temEscafocefalia)) {
    formato_craniano = 'misto';
    alertas.push(
      '📋 Formato misto: Plagiocefalia + alteração de índice cefálico. Tratamento combinado necessário.'
    );
  } else if (temPlagiocefalia) {
    formato_craniano = 'plagiocefalia';
  } else if (temBraquicefalia) {
    formato_craniano = 'braquicefalia';
  } else if (temEscafocefalia) {
    formato_craniano = 'escafocefalia';
  }

  return {
    cva_mm,
    cvai_percentual,
    ci_percentual,
    plagiocefalia_severidade,
    braquicefalia_severidade,
    formato_craniano,
    alertas,
  };
}

/**
 * Retorna a cor de fundo baseada no CVAI
 */
export function getCorPlagiocefalia(cvai: number | null | undefined): string {
  if (cvai == null) return 'bg-gray-200';
  for (const nivel of PLAGIOCEFALIA_CLASSIFICACAO) {
    if (cvai >= nivel.cvai_min && cvai < nivel.cvai_max) {
      return nivel.cor;
    }
  }
  return 'bg-gray-200';
}

/**
 * Retorna a cor de fundo baseada no CI
 */
export function getCorBraquicefalia(ci: number | null | undefined): string {
  if (ci == null) return 'bg-gray-200';
  for (const nivel of BRAQUICEFALIA_CLASSIFICACAO) {
    if (ci >= nivel.ci_min && ci < nivel.ci_max) {
      return nivel.cor;
    }
  }
  return 'bg-gray-200';
}

// FSOS-2 - Functional Symmetry Observation Scale Version 2
// 7 itens por posição, pontuação 0-4 cada
export interface FSOS2ItemsPorPosicao {
  rotacao_cabeca?: number; // 0-4
  flexao_lateral_retificacao?: number; // 0-4
  reequilibrio_lateral_tronco?: number; // 0-4
  uso_bracos?: number; // 0-4
  uso_maos?: number; // 0-4
  transicoes_movimento?: number; // 0-4
  alinhamento_postural?: number; // 0-4
  observacoes?: string;
}

export interface FSOS2 {
  supino?: FSOS2ItemsPorPosicao;
  prono?: FSOS2ItemsPorPosicao;
  sentado?: FSOS2ItemsPorPosicao;
  em_pe?: FSOS2ItemsPorPosicao;
  // Campos legados mantidos para compatibilidade
  supino_legado?: string;
  prono_4apoios?: string;
  sentado_legado?: string;
  em_pe_legado?: string;
  score_total?: number;
}

export const FSOS2_ITENS = [
  {
    id: 'rotacao_cabeca',
    label: 'Rotação de cabeça',
    descricao:
      'O bebê gira a cabeça para os dois lados? Permanece olhando preferencialmente para um lado?',
  },
  {
    id: 'flexao_lateral_retificacao',
    label: 'Flexão lateral do tronco / Retificação da cabeça',
    descricao:
      'Quando o tronco inclina para um lado, o bebê corrige a cabeça? Reage ao desequilíbrio pelas duas laterais?',
  },
  {
    id: 'reequilibrio_lateral_tronco',
    label: 'Reequilíbrio lateral do tronco',
    descricao:
      'O bebê ativa o tronco dos dois lados? Faz pequenas rotações de tronco simétricas?',
  },
  {
    id: 'uso_bracos',
    label: 'Uso dos braços',
    descricao:
      'Alcance bilateral, leva mãos à linha média igualmente, eleva ambos os braços com similar força?',
  },
  {
    id: 'uso_maos',
    label: 'Uso das mãos',
    descricao:
      'Manipulação de objetos dos dois lados, exploração do corpo, toque simétrico?',
  },
  {
    id: 'transicoes_movimento',
    label: 'Transições de movimento',
    descricao:
      'Rola para ambos os lados? Move pelve e tronco simetricamente? Inicia movimentos com ambos os lados?',
  },
  {
    id: 'alinhamento_postural',
    label: 'Alinhamento postural',
    descricao:
      'Cabeça no centro, tronco alinhado, pelve equilibrada, ausência de torção para um lado?',
  },
] as const;

export const FSOS2_PONTUACAO = [
  {
    valor: 0,
    label: '0 - Não observado',
    descricao: 'Nenhuma ativação, nenhum movimento, não demonstra o item',
  },
  {
    valor: 1,
    label: '1 - Ocasional',
    descricao:
      'Realiza o movimento de um lado ocasionalmente, mas não consistente',
  },
  {
    valor: 2,
    label: '2 - Intermitente',
    descricao: 'Movimento aparece às vezes, mas irregular e imprevisível',
  },
  {
    valor: 3,
    label: '3 - Frequente',
    descricao:
      'Observado na maior parte das vezes, ainda com diferença entre lados',
  },
  {
    valor: 4,
    label: '4 - Consistente',
    descricao: 'Sempre realizado e igual dos dois lados (simétrico)',
  },
] as const;

export const FSOS2_POSICOES = [
  { id: 'supino', label: 'Supino', icone: '🔄' },
  { id: 'prono', label: 'Prono', icone: '⬇️' },
  { id: 'sentado', label: 'Sentado', icone: '🪑' },
  { id: 'em_pe', label: 'Em pé', icone: '🧍' },
] as const;

// MFS - Muscle Function Scale for Infants (Escala de Função Muscular)
// Avalia a força/resistência dos flexores laterais do pescoço
export const MFS_PONTUACAO = [
  {
    valor: 0,
    angulo: '< 0°',
    descricao: 'Cabeça abaixo da linha horizontal',
    cor: 'bg-red-500',
  },
  {
    valor: 1,
    angulo: '0°',
    descricao: 'Cabeça na linha horizontal',
    cor: 'bg-orange-500',
  },
  {
    valor: 2,
    angulo: '> 0° - < 15°',
    descricao: 'Cabeça acima de 0° e menos de 15° acima da horizontal',
    cor: 'bg-yellow-500',
  },
  {
    valor: 3,
    angulo: '> 15° - < 45°',
    descricao: 'Cabeça entre 15° e 45° acima da horizontal',
    cor: 'bg-lime-500',
  },
  {
    valor: 4,
    angulo: '> 45° - < 75°',
    descricao: 'Cabeça entre 45° e 75° acima da horizontal',
    cor: 'bg-green-500',
  },
  {
    valor: 5,
    angulo: '> 75°',
    descricao: 'Cabeça mais de 75° acima da horizontal',
    cor: 'bg-emerald-600',
  },
] as const;

// Valores de referência por idade para MFS
export const MFS_REFERENCIA_IDADE = [
  { idade: '2 meses', media: 1.0, variacao: '0 a 2' },
  { idade: '4 meses', media: 2.6, variacao: '1 a 4' },
  { idade: '6 meses', media: 3.0, variacao: '2 a 4' },
  { idade: '10 meses', media: 3.4, variacao: '3 a 4' },
] as const;

// Tipos de Assistência Ventilatória
export type TipoAssistenciaVentilatoria =
  | 'o2_cateter'
  | 'o2_mascara'
  | 'hood'
  | 'canula_alto_fluxo'
  | 'cpap'
  | 'bipap'
  | 'vni'
  | 'vmi'
  | 'outro';

export const TIPOS_ASSISTENCIA_VENTILATORIA = [
  {
    valor: 'o2_cateter',
    label: 'O₂ por cateter nasal',
    descricao: 'Oxigênio por cateter nasal',
  },
  {
    valor: 'o2_mascara',
    label: 'O₂ por máscara',
    descricao: 'Oxigênio por máscara facial',
  },
  { valor: 'hood', label: 'Hood/Capacete', descricao: 'Capacete de oxigênio' },
  {
    valor: 'canula_alto_fluxo',
    label: 'Cânula de Alto Fluxo',
    descricao: 'CNAF - Cânula Nasal de Alto Fluxo',
  },
  {
    valor: 'cpap',
    label: 'CPAP',
    descricao: 'Pressão Positiva Contínua nas Vias Aéreas',
  },
  {
    valor: 'bipap',
    label: 'BiPAP',
    descricao: 'Dois níveis de pressão positiva',
  },
  { valor: 'vni', label: 'VNI', descricao: 'Ventilação Não Invasiva' },
  {
    valor: 'vmi',
    label: 'VMI',
    descricao: 'Ventilação Mecânica Invasiva (intubação)',
  },
  { valor: 'outro', label: 'Outro', descricao: 'Outro tipo' },
] as const;

// =====================================================
// ITEM 18: CONTROLE MOTOR CERVICAL (antes "Funcionalidade Cervical")
// Foco: Biomecânica e controle motor, não visual
// =====================================================

// Tipos para Controle Motor
export type ManutencaoLinhaMeadia =
  | 'mantem_firme'
  | 'cai_preferencia'
  | 'instavel';
export type AlcanceLinhaMeadia =
  | 'maos_joelhos'
  | 'maos_boca'
  | 'maos_ar'
  | 'ausente';
export type ToleranciaTummyTime = 'boa' | 'chora_imediato' | 'cansa_rapido';
export type CargaPesoProno = 'cotovelos' | 'maos_estendidas' | 'nao_levanta';
export type ControleCabecaProno = 'graus_45' | 'graus_90' | 'oscila';

export interface FuncionalidadeCervical {
  // SUPINO (Barriga para cima)
  supino?: {
    manutencao_linha_media?: ManutencaoLinhaMeadia;
    alcance_linha_media?: AlcanceLinhaMeadia;
    observacoes?: string;
  };
  // PRONO (Tummy Time)
  prono?: {
    tolerancia?: ToleranciaTummyTime;
    carga_peso?: CargaPesoProno;
    controle_cabeca?: ControleCabecaProno;
    observacoes?: string;
  };
  // Campos legados para compatibilidade
  sentado?: { observacoes?: string };
  em_pe?: { observacoes?: string };
}

// Constantes para UI - Controle Motor
export const MANUTENCAO_LINHA_MEDIA_OPCOES = [
  {
    valor: 'mantem_firme',
    label: 'Mantém firme',
    descricao: 'Cabeça estável no centro',
    cor: 'bg-green-500',
  },
  {
    valor: 'cai_preferencia',
    label: 'Cai para preferência',
    descricao: 'Tende a virar para um lado',
    cor: 'bg-yellow-500',
  },
  {
    valor: 'instavel',
    label: 'Instável',
    descricao: 'Não consegue manter no meio',
    cor: 'bg-red-500',
  },
] as const;

export const ALCANCE_LINHA_MEDIA_OPCOES = [
  {
    valor: 'maos_joelhos',
    label: 'Mãos nos joelhos',
    descricao: 'Alcança membros inferiores',
  },
  { valor: 'maos_boca', label: 'Mãos na boca', descricao: 'Leva mãos à boca' },
  {
    valor: 'maos_ar',
    label: 'Mãos no ar',
    descricao: 'Movimenta mãos sem alcançar linha média',
  },
  { valor: 'ausente', label: 'Ausente', descricao: 'Não alcança linha média' },
] as const;

export const TOLERANCIA_TUMMY_TIME_OPCOES = [
  {
    valor: 'boa',
    label: 'Boa',
    descricao: 'Tolera bem, explora',
    cor: 'bg-green-500',
  },
  {
    valor: 'chora_imediato',
    label: 'Chora imediato',
    descricao: 'Rejeita a posição',
    cor: 'bg-red-500',
  },
  {
    valor: 'cansa_rapido',
    label: 'Cansa rápido',
    descricao: 'Tolera poucos minutos',
    cor: 'bg-yellow-500',
  },
] as const;

export const CARGA_PESO_PRONO_OPCOES = [
  { valor: 'cotovelos', label: 'Cotovelos', descricao: 'Apoio nos antebraços' },
  {
    valor: 'maos_estendidas',
    label: 'Mãos estendidas',
    descricao: 'Braços estendidos (avançado)',
  },
  { valor: 'nao_levanta', label: 'Não levanta', descricao: 'Face no chão' },
] as const;

export const CONTROLE_CABECA_PRONO_OPCOES = [
  { valor: 'graus_45', label: '45°', descricao: 'Elevação parcial' },
  { valor: 'graus_90', label: '90°', descricao: 'Elevação completa' },
  { valor: 'oscila', label: 'Oscila', descricao: 'Instável, não sustenta' },
] as const;

// =====================================================
// ITEM 19: RESPOSTA POSTURAL (Testes Provocativos)
// =====================================================

export type HeadLag = 'ausente' | 'parcial' | 'total';
export type AtivacaoFlexores = 'ativa' | 'passivo';
export type PadraoLandau = 'extensao_global' | 'hipotonico' | 'misto';

export interface RespostaPostural {
  // Teste de Tração (Pull-to-Sit)
  tracao?: {
    head_lag?: HeadLag;
    ativacao_flexores?: AtivacaoFlexores;
    observacoes?: string;
  };
  // Reflexo de Landau (Suspensão Ventral)
  landau?: {
    padrao?: PadraoLandau;
    observacoes?: string;
  };
  // Repercussões gerais
  repercussoes_tronco_membros?: string;
}

// Constantes para UI - Resposta Postural
export const HEAD_LAG_OPCOES = [
  {
    valor: 'ausente',
    label: 'Ausente (Normal)',
    descricao: 'Cabeça acompanha o tronco',
    cor: 'bg-green-500',
  },
  {
    valor: 'parcial',
    label: 'Parcial',
    descricao: 'Leve atraso, mas recupera',
    cor: 'bg-yellow-500',
  },
  {
    valor: 'total',
    label: 'Total',
    descricao: 'Cabeça pendurada - RED FLAG',
    cor: 'bg-red-500',
  },
] as const;

export const ATIVACAO_FLEXORES_OPCOES = [
  {
    valor: 'ativa',
    label: 'Ativa',
    descricao: 'Sente força nos braços do bebê',
  },
  {
    valor: 'passivo',
    label: 'Passivo',
    descricao: 'Bebê não puxa, só é puxado',
  },
] as const;

export const PADRAO_LANDAU_OPCOES = [
  {
    valor: 'extensao_global',
    label: 'Extensão Global (Aviãozinho)',
    descricao: 'Padrão normal - extensão de cabeça, tronco e pernas',
    cor: 'bg-green-500',
  },
  {
    valor: 'hipotonico',
    label: 'Hipotônico (U invertido)',
    descricao: 'Bebê "dobra" - baixo tônus',
    cor: 'bg-red-500',
  },
  {
    valor: 'misto',
    label: 'Misto',
    descricao: 'Padrão inconsistente',
    cor: 'bg-yellow-500',
  },
] as const;

// =====================================================
// ITEM 20: AIMS (Alberta Infant Motor Scale)
// Score internacional com cálculo de percentil automático
// =====================================================

export interface AIMS {
  // Scores brutos por sub-escala
  prono?: number; // 0 a 21
  supino?: number; // 0 a 9
  sentado?: number; // 0 a 12
  em_pe?: number; // 0 a 16

  // Calculados automaticamente
  score_total?: number; // Soma (máx: 58)
  percentil?: number;
  classificacao?: AIMSClassificacao;

  // Metadados
  idade_meses_avaliacao?: number;
  data_avaliacao?: string;
}

export type AIMSClassificacao = 'atipico' | 'suspeito' | 'normal';

// =====================================================
// AIMS - 58 ITENS DETALHADOS (Piper & Darrah, 1994)
// =====================================================

export interface AIMSItem {
  id: string;
  nome: string;
  descricao: string;
  idade_tipica_meses: number; // Idade em que tipicamente aparece
}

// PRONO - 21 itens
export const AIMS_ITENS_PRONO: AIMSItem[] = [
  {
    id: 'P1',
    nome: 'Prono 1 - Flexão fisiológica',
    descricao: 'Cabeça rotacionada, quadris e joelhos flexionados',
    idade_tipica_meses: 0,
  },
  {
    id: 'P2',
    nome: 'Prono 2 - Cabeça linha média',
    descricao: 'Levanta cabeça brevemente, queixo fora da superfície',
    idade_tipica_meses: 1,
  },
  {
    id: 'P3',
    nome: 'Apoio antebraço 1',
    descricao: 'Apoio instável em antebraços, cabeça 45°',
    idade_tipica_meses: 2,
  },
  {
    id: 'P4',
    nome: 'Apoio antebraço 2',
    descricao: 'Apoio estável em antebraços, cabeça 45-90°',
    idade_tipica_meses: 3,
  },
  {
    id: 'P5',
    nome: 'Apoio antebraço 3',
    descricao: 'Apoio em antebraços, cabeça 90°, peito elevado',
    idade_tipica_meses: 4,
  },
  {
    id: 'P6',
    nome: 'Apoio mãos 1',
    descricao: 'Apoio em mãos estendidas, instável',
    idade_tipica_meses: 5,
  },
  {
    id: 'P7',
    nome: 'Apoio mãos 2',
    descricao: 'Apoio em mãos estendidas, estável',
    idade_tipica_meses: 5,
  },
  {
    id: 'P8',
    nome: 'Apoio mãos 3',
    descricao: 'Apoio em uma mão, alcança com a outra',
    idade_tipica_meses: 6,
  },
  {
    id: 'P9',
    nome: 'Nadando',
    descricao: 'Extensão de braços e pernas simultaneamente',
    idade_tipica_meses: 5,
  },
  {
    id: 'P10',
    nome: 'Rolar prono→supino 1',
    descricao: 'Rola sem rotação de tronco (em bloco)',
    idade_tipica_meses: 4,
  },
  {
    id: 'P11',
    nome: 'Rolar prono→supino 2',
    descricao: 'Rola com rotação de tronco',
    idade_tipica_meses: 5,
  },
  {
    id: 'P12',
    nome: 'Pivotear 1',
    descricao: 'Gira sobre o abdômen (início)',
    idade_tipica_meses: 6,
  },
  {
    id: 'P13',
    nome: 'Pivotear 2',
    descricao: 'Pivoteia em círculo completo',
    idade_tipica_meses: 7,
  },
  {
    id: 'P14',
    nome: '4 apoios 1',
    descricao: 'Posição de 4 apoios instável, balança',
    idade_tipica_meses: 7,
  },
  {
    id: 'P15',
    nome: '4 apoios 2',
    descricao: 'Posição de 4 apoios estável',
    idade_tipica_meses: 8,
  },
  {
    id: 'P16',
    nome: '4 apoios 3',
    descricao: '4 apoios com alcance de uma mão',
    idade_tipica_meses: 8,
  },
  {
    id: 'P17',
    nome: 'Engatinhar 1',
    descricao: 'Rasteja/arrasta (movimento inicial)',
    idade_tipica_meses: 8,
  },
  {
    id: 'P18',
    nome: 'Engatinhar 2',
    descricao: 'Engatinha recíproco (início)',
    idade_tipica_meses: 9,
  },
  {
    id: 'P19',
    nome: 'Engatinhar 3',
    descricao: 'Engatinha recíproco maduro',
    idade_tipica_meses: 10,
  },
  {
    id: 'P20',
    nome: 'Engatinhar 4',
    descricao: 'Engatinha rápido e coordenado',
    idade_tipica_meses: 11,
  },
  {
    id: 'P21',
    nome: 'Andar de urso',
    descricao: 'Anda com mãos e pés (sem joelhos)',
    idade_tipica_meses: 12,
  },
];

// SUPINO - 9 itens
export const AIMS_ITENS_SUPINO: AIMSItem[] = [
  {
    id: 'S1',
    nome: 'Supino 1 - Flexão fisiológica',
    descricao: 'Postura fisiológica de flexão',
    idade_tipica_meses: 0,
  },
  {
    id: 'S2',
    nome: 'Supino 2 - Cabeça linha média',
    descricao: 'Mantém cabeça na linha média',
    idade_tipica_meses: 2,
  },
  {
    id: 'S3',
    nome: 'Supino 3 - Mãos linha média',
    descricao: 'Traz mãos à linha média/boca',
    idade_tipica_meses: 3,
  },
  {
    id: 'S4',
    nome: 'Extensão ativa',
    descricao: 'Eleva pernas, alcança joelhos/pés',
    idade_tipica_meses: 4,
  },
  {
    id: 'S5',
    nome: 'Rolar supino→lateral',
    descricao: 'Rola para o lado',
    idade_tipica_meses: 4,
  },
  {
    id: 'S6',
    nome: 'Rolar supino→prono 1',
    descricao: 'Rola sem rotação (em bloco)',
    idade_tipica_meses: 5,
  },
  {
    id: 'S7',
    nome: 'Rolar supino→prono 2',
    descricao: 'Rola com rotação de tronco',
    idade_tipica_meses: 6,
  },
  {
    id: 'S8',
    nome: 'Puxar para sentar 1',
    descricao: 'Participa ativamente, cabeça alinha',
    idade_tipica_meses: 5,
  },
  {
    id: 'S9',
    nome: 'Puxar para sentar 2',
    descricao: 'Puxa ativamente com os braços',
    idade_tipica_meses: 6,
  },
];

// SENTADO - 12 itens
export const AIMS_ITENS_SENTADO: AIMSItem[] = [
  {
    id: 'Sit1',
    nome: 'Sentar com apoio 1',
    descricao: 'Sentado com apoio, cabeça instável',
    idade_tipica_meses: 3,
  },
  {
    id: 'Sit2',
    nome: 'Sentar com apoio 2',
    descricao: 'Sentado com apoio, cabeça estável',
    idade_tipica_meses: 4,
  },
  {
    id: 'Sit3',
    nome: 'Sentar apoio braços frente',
    descricao: 'Sentado com apoio das mãos à frente',
    idade_tipica_meses: 5,
  },
  {
    id: 'Sit4',
    nome: 'Sentar apoio braços lateral',
    descricao: 'Sentado com apoio lateral dos braços',
    idade_tipica_meses: 6,
  },
  {
    id: 'Sit5',
    nome: 'Sentar sem apoio 1',
    descricao: 'Sentado sem apoio, instável',
    idade_tipica_meses: 6,
  },
  {
    id: 'Sit6',
    nome: 'Sentar sem apoio 2',
    descricao: 'Sentado sem apoio, estável',
    idade_tipica_meses: 7,
  },
  {
    id: 'Sit7',
    nome: 'Sentar com rotação',
    descricao: 'Sentado com rotação de tronco',
    idade_tipica_meses: 8,
  },
  {
    id: 'Sit8',
    nome: 'Sentar alcance lateral',
    descricao: 'Sentado, alcança objetos lateralmente',
    idade_tipica_meses: 8,
  },
  {
    id: 'Sit9',
    nome: 'Sentar → prono',
    descricao: 'Transição de sentado para prono',
    idade_tipica_meses: 8,
  },
  {
    id: 'Sit10',
    nome: 'Sentar → 4 apoios',
    descricao: 'Transição de sentado para 4 apoios',
    idade_tipica_meses: 9,
  },
  {
    id: 'Sit11',
    nome: '4 apoios → sentar',
    descricao: 'Transição de 4 apoios para sentado',
    idade_tipica_meses: 9,
  },
  {
    id: 'Sit12',
    nome: 'Sentar lateral',
    descricao: 'Sentado de lado com apoio de uma mão',
    idade_tipica_meses: 10,
  },
];

// EM PÉ - 16 itens
export const AIMS_ITENS_EM_PE: AIMSItem[] = [
  {
    id: 'St1',
    nome: 'Em pé apoiado 1',
    descricao: 'Em pé com apoio, sustenta peso parcial',
    idade_tipica_meses: 5,
  },
  {
    id: 'St2',
    nome: 'Em pé apoiado 2',
    descricao: 'Em pé com apoio, sustenta peso total',
    idade_tipica_meses: 6,
  },
  {
    id: 'St3',
    nome: 'Em pé apoiado 3',
    descricao: 'Em pé apoiado, levanta um pé',
    idade_tipica_meses: 8,
  },
  {
    id: 'St4',
    nome: 'Puxa p/ ficar de pé 1',
    descricao: 'Puxa para ficar de pé via ajoelhado',
    idade_tipica_meses: 8,
  },
  {
    id: 'St5',
    nome: 'Puxa p/ ficar de pé 2',
    descricao: 'Puxa para ficar de pé via semi-ajoelhado',
    idade_tipica_meses: 9,
  },
  {
    id: 'St6',
    nome: 'Puxa p/ ficar de pé 3',
    descricao: 'Puxa para ficar de pé via agachamento',
    idade_tipica_meses: 10,
  },
  {
    id: 'St7',
    nome: 'Cruising 1',
    descricao: 'Anda de lado apoiado (sem rotação)',
    idade_tipica_meses: 9,
  },
  {
    id: 'St8',
    nome: 'Cruising 2',
    descricao: 'Cruising com rotação de tronco',
    idade_tipica_meses: 10,
  },
  {
    id: 'St9',
    nome: 'Fica de pé sozinho',
    descricao: 'Fica em pé sem apoio momentaneamente',
    idade_tipica_meses: 11,
  },
  {
    id: 'St10',
    nome: 'Primeiros passos',
    descricao: 'Dá passos iniciais com apoio mínimo',
    idade_tipica_meses: 11,
  },
  {
    id: 'St11',
    nome: 'Anda sozinho 1',
    descricao: 'Anda independente, base larga, braços em guarda alta',
    idade_tipica_meses: 12,
  },
  {
    id: 'St12',
    nome: 'Anda sozinho 2',
    descricao: 'Anda com braços em guarda média',
    idade_tipica_meses: 13,
  },
  {
    id: 'St13',
    nome: 'Anda sozinho 3',
    descricao: 'Anda com braços baixos, marcha mais madura',
    idade_tipica_meses: 14,
  },
  {
    id: 'St14',
    nome: 'Agacha e levanta',
    descricao: 'Agacha para pegar objeto e levanta',
    idade_tipica_meses: 13,
  },
  {
    id: 'St15',
    nome: 'Anda de lado',
    descricao: 'Anda de lado sem apoio',
    idade_tipica_meses: 15,
  },
  {
    id: 'St16',
    nome: 'Anda para trás',
    descricao: 'Anda para trás',
    idade_tipica_meses: 16,
  },
];

// Todos os itens organizados
export const AIMS_TODOS_ITENS = {
  prono: AIMS_ITENS_PRONO,
  supino: AIMS_ITENS_SUPINO,
  sentado: AIMS_ITENS_SENTADO,
  em_pe: AIMS_ITENS_EM_PE,
};

// Interface atualizada para AIMS com itens individuais
export interface AIMSDetalhada {
  // Itens marcados (objeto com id do item como chave)
  itens_marcados: Record<string, boolean>;

  // Scores calculados automaticamente
  prono?: number;
  supino?: number;
  sentado?: number;
  em_pe?: number;
  score_total?: number;
  percentil?: number;
  classificacao?: AIMSClassificacao;
  idade_meses_avaliacao?: number;
}

// Tabela de referência AIMS (Piper & Darrah, 1994)
// Valores aproximados de percentis por idade e score total
export const AIMS_REFERENCIA_PERCENTIL: {
  idade_meses: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}[] = [
  { idade_meses: 1, p5: 3, p10: 3, p25: 4, p50: 5, p75: 6, p90: 7 },
  { idade_meses: 2, p5: 4, p10: 5, p25: 6, p50: 7, p75: 8, p90: 9 },
  { idade_meses: 3, p5: 6, p10: 7, p25: 8, p50: 10, p75: 11, p90: 13 },
  { idade_meses: 4, p5: 8, p10: 9, p25: 11, p50: 13, p75: 15, p90: 17 },
  { idade_meses: 5, p5: 10, p10: 12, p25: 14, p50: 17, p75: 20, p90: 23 },
  { idade_meses: 6, p5: 13, p10: 15, p25: 18, p50: 22, p75: 26, p90: 30 },
  { idade_meses: 7, p5: 16, p10: 19, p25: 23, p50: 28, p75: 33, p90: 38 },
  { idade_meses: 8, p5: 20, p10: 24, p25: 29, p50: 34, p75: 40, p90: 45 },
  { idade_meses: 9, p5: 25, p10: 29, p25: 35, p50: 41, p75: 46, p90: 50 },
  { idade_meses: 10, p5: 30, p10: 35, p25: 41, p50: 46, p75: 51, p90: 54 },
  { idade_meses: 11, p5: 36, p10: 41, p25: 46, p50: 51, p75: 54, p90: 56 },
  { idade_meses: 12, p5: 42, p10: 46, p25: 51, p50: 54, p75: 56, p90: 57 },
  { idade_meses: 13, p5: 46, p10: 50, p25: 53, p50: 56, p75: 57, p90: 58 },
  { idade_meses: 14, p5: 50, p10: 53, p25: 55, p50: 57, p75: 58, p90: 58 },
  { idade_meses: 15, p5: 53, p10: 55, p25: 56, p50: 57, p75: 58, p90: 58 },
  { idade_meses: 16, p5: 55, p10: 56, p25: 57, p50: 58, p75: 58, p90: 58 },
  { idade_meses: 17, p5: 56, p10: 57, p25: 57, p50: 58, p75: 58, p90: 58 },
  { idade_meses: 18, p5: 57, p10: 57, p25: 58, p50: 58, p75: 58, p90: 58 },
];

// =====================================================
// AUTOMAÇÃO DO GRAU DE SEVERIDADE (Item 21)
// =====================================================

export interface SeveridadeCalculada {
  grau: number;
  titulo: string;
  grupo: 'precoce' | 'tardio' | 'muito_tardio';
  cor: string;
  corTailwind: string;
  prognostico: {
    min_meses: number;
    max_meses: number;
    mensagem: string;
  };
  criterios: {
    idade_grupo: string;
    deficit_rotacao: string;
    nodulo: boolean;
  };
}

export const PROGNOSTICO_POR_GRAU: Record<
  number,
  { min: number; max: number; msg: string }
> = {
  0: { min: 0, max: 0, msg: 'Sem restrição significativa.' },
  1: {
    min: 1.5,
    max: 2,
    msg: 'Tratamento de curta duração com excelente prognóstico.',
  },
  2: {
    min: 2,
    max: 3,
    msg: 'Resposta rápida esperada ao tratamento conservador.',
  },
  3: {
    min: 3,
    max: 4,
    msg: 'Necessário acompanhamento intensivo devido à fibrose.',
  },
  4: {
    min: 3,
    max: 4,
    msg: 'Tratamento prolongado pela idade de início tardio.',
  },
  5: {
    min: 5,
    max: 6,
    msg: 'Prognóstico moderado, risco de tratamento cirúrgico se não responder.',
  },
  6: {
    min: 6,
    max: 7,
    msg: 'Tratamento intensivo necessário, monitorar evolução.',
  },
  7: {
    min: 7,
    max: 9,
    msg: 'Tratamento de longo prazo devido à fibrose e idade avançada.',
  },
  8: {
    min: 9,
    max: 12,
    msg: 'Prognóstico reservado. Considerar avaliação cirúrgica.',
  },
};

/**
 * Calcula automaticamente o Grau de Severidade do Torcicolo
 * Baseado em: Cheng et al. + regras clínicas padrão
 */
export function calcularSeveridadeAutomatica(
  idadeMeses: number,
  diffRotacao: number | undefined,
  temNodulo: boolean
): SeveridadeCalculada {
  const diff = diffRotacao ?? 0;

  // GRUPO: MUITO TARDIO (> 12 meses)
  if (idadeMeses > 12) {
    const prog = PROGNOSTICO_POR_GRAU[8];
    return {
      grau: 8,
      titulo: 'Muito Tardia',
      grupo: 'muito_tardio',
      cor: '#7F1D1D',
      corTailwind: 'bg-red-900 text-white',
      prognostico: {
        min_meses: prog.min,
        max_meses: prog.max,
        mensagem: prog.msg,
      },
      criterios: {
        idade_grupo: '>12 meses',
        deficit_rotacao: `${diff}°`,
        nodulo: temNodulo,
      },
    };
  }

  // GRUPO: PRECOCE (0 a 6 meses)
  if (idadeMeses <= 6) {
    // Grau 3: > 30° ou Massa/Nódulo
    if (temNodulo || diff > 30) {
      const prog = PROGNOSTICO_POR_GRAU[3];
      return {
        grau: 3,
        titulo: 'Precoce Severa',
        grupo: 'precoce',
        cor: '#DC2626',
        corTailwind: 'bg-red-600 text-white',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: '0-6 meses',
          deficit_rotacao: diff > 30 ? `${diff}° (>30°)` : `${diff}°`,
          nodulo: temNodulo,
        },
      };
    }
    // Grau 2: 15° a 30°
    if (diff >= 15 && diff <= 30) {
      const prog = PROGNOSTICO_POR_GRAU[2];
      return {
        grau: 2,
        titulo: 'Precoce Moderada',
        grupo: 'precoce',
        cor: '#F97316',
        corTailwind: 'bg-orange-500 text-white',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: '0-6 meses',
          deficit_rotacao: `${diff}° (15-30°)`,
          nodulo: temNodulo,
        },
      };
    }
    // Grau 1: < 15° (Postural)
    const prog = PROGNOSTICO_POR_GRAU[1];
    return {
      grau: 1,
      titulo: 'Precoce Leve',
      grupo: 'precoce',
      cor: '#EAB308',
      corTailwind: 'bg-yellow-500 text-black',
      prognostico: {
        min_meses: prog.min,
        max_meses: prog.max,
        mensagem: prog.msg,
      },
      criterios: {
        idade_grupo: '0-6 meses',
        deficit_rotacao: `${diff}° (<15°)`,
        nodulo: temNodulo,
      },
    };
  }

  // GRUPO: TARDIO (7 a 12 meses)
  if (idadeMeses >= 7 && idadeMeses <= 12) {
    // Grau 7: Nódulo (7-12m) OU > 30° (10-12m)
    if (temNodulo || (idadeMeses >= 10 && diff > 30)) {
      const prog = PROGNOSTICO_POR_GRAU[7];
      return {
        grau: 7,
        titulo: 'Tardia Extrema',
        grupo: 'tardio',
        cor: '#991B1B',
        corTailwind: 'bg-red-800 text-white',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: '7-12 meses',
          deficit_rotacao: `${diff}°`,
          nodulo: temNodulo,
        },
      };
    }
    // Grau 6: >= 15° (7-9m) OU 15°-30° (10-12m)
    if (
      (idadeMeses <= 9 && diff >= 15) ||
      (idadeMeses >= 10 && diff >= 15 && diff <= 30)
    ) {
      const prog = PROGNOSTICO_POR_GRAU[6];
      return {
        grau: 6,
        titulo: 'Tardia Severa',
        grupo: 'tardio',
        cor: '#DC2626',
        corTailwind: 'bg-red-600 text-white',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: idadeMeses <= 9 ? '7-9 meses' : '10-12 meses',
          deficit_rotacao: `${diff}° (≥15°)`,
          nodulo: temNodulo,
        },
      };
    }
    // Grau 5: < 15° (10-12m)
    if (idadeMeses >= 10 && diff < 15) {
      const prog = PROGNOSTICO_POR_GRAU[5];
      return {
        grau: 5,
        titulo: 'Tardia Moderada',
        grupo: 'tardio',
        cor: '#F97316',
        corTailwind: 'bg-orange-500 text-white',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: '10-12 meses',
          deficit_rotacao: `${diff}° (<15°)`,
          nodulo: temNodulo,
        },
      };
    }
    // Grau 4: < 15° (7-9m)
    if (idadeMeses <= 9 && diff < 15) {
      const prog = PROGNOSTICO_POR_GRAU[4];
      return {
        grau: 4,
        titulo: 'Tardia Leve',
        grupo: 'tardio',
        cor: '#EAB308',
        corTailwind: 'bg-yellow-500 text-black',
        prognostico: {
          min_meses: prog.min,
          max_meses: prog.max,
          mensagem: prog.msg,
        },
        criterios: {
          idade_grupo: '7-9 meses',
          deficit_rotacao: `${diff}° (<15°)`,
          nodulo: temNodulo,
        },
      };
    }
  }

  // Fallback: Sem classificação (sem torcicolo ou dados insuficientes)
  const prog = PROGNOSTICO_POR_GRAU[0];
  return {
    grau: 0,
    titulo: 'Não Classificado',
    grupo: 'precoce',
    cor: '#9CA3AF',
    corTailwind: 'bg-gray-400 text-white',
    prognostico: {
      min_meses: prog.min,
      max_meses: prog.max,
      mensagem: prog.msg,
    },
    criterios: {
      idade_grupo: `${idadeMeses} meses`,
      deficit_rotacao: `${diff}°`,
      nodulo: temNodulo,
    },
  };
}

// =====================================================
// GERADOR DE DIAGNÓSTICO INTELIGENTE (Item 23)
// =====================================================

export interface DiagnosticoGerado {
  texto_completo: string;
  secoes: {
    identificacao: string;
    queixa_anamnese: string;
    achados_fisicos: string;
    classificacao_torcicolo: string;
    assimetria_craniana: string;
    desenvolvimento_motor: string;
    conclusao_funcional: string;
    plano_tratamento: string;
  };
  tags_detectadas: string[];
  data_geracao: string;
}

/**
 * Gera diagnóstico cinético-funcional automaticamente
 * baseado em todos os dados da avaliação
 */
export function gerarDiagnosticoAutomatico(
  avaliacao: AvaliacaoClinica,
  patientName: string,
  patientAgeMonths: number,
  nomePai?: string,
  nomeMae?: string
): DiagnosticoGerado {
  const tags: string[] = [];
  const secoes: DiagnosticoGerado['secoes'] = {
    identificacao: '',
    queixa_anamnese: '',
    achados_fisicos: '',
    classificacao_torcicolo: '',
    assimetria_craniana: '',
    desenvolvimento_motor: '',
    conclusao_funcional: '',
    plano_tratamento: '',
  };

  // ========== 1. IDENTIFICAÇÃO ==========
  const idadeFormatada =
    patientAgeMonths < 12
      ? `${patientAgeMonths} ${patientAgeMonths === 1 ? 'mês' : 'meses'}`
      : `${Math.floor(patientAgeMonths / 12)} ano${Math.floor(patientAgeMonths / 12) > 1 ? 's' : ''} e ${patientAgeMonths % 12} ${patientAgeMonths % 12 === 1 ? 'mês' : 'meses'}`;

  let responsaveis = '';
  if (nomePai && nomeMae) {
    responsaveis = `, filho(a) de ${nomePai} e ${nomeMae}`;
  } else if (nomePai) {
    responsaveis = `, filho(a) de ${nomePai}`;
  } else if (nomeMae) {
    responsaveis = `, filho(a) de ${nomeMae}`;
  }

  secoes.identificacao = `Paciente ${patientName}, ${idadeFormatada}${responsaveis}.`;

  // ========== 2. QUEIXA E ANAMNESE ==========
  const queixas: string[] = [];
  if (avaliacao.queixa_principal) {
    queixas.push(
      `Queixa principal: ${avaliacao.queixa_principal.replace(/<[^>]*>/g, '').trim()}`
    );
  }
  if (avaliacao.tipo_parto) {
    queixas.push(`nascido de parto ${avaliacao.tipo_parto.toLowerCase()}`);
    tags.push(`PARTO_${avaliacao.tipo_parto.toUpperCase()}`);
  }
  if (avaliacao.idade_gestacional_semanas) {
    queixas.push(
      `${avaliacao.idade_gestacional_semanas} semanas de idade gestacional`
    );
  }
  if (avaliacao.intercorrencias_prenatais) {
    queixas.push(
      `intercorrências pré-natais: ${avaliacao.intercorrencias_prenatais.replace(/<[^>]*>/g, '').trim()}`
    );
  }
  secoes.queixa_anamnese =
    queixas.length > 0 ? queixas.join('. ').replace(/\.\./g, '.') + '.' : '';

  // ========== 3. ACHADOS FÍSICOS (Goniometria + Palpação) ==========
  const achados: string[] = [];
  const gonio = avaliacao.goniometria;
  const torcicolo = avaliacao.torcicolo_detalhado;

  // Calcular déficit de rotação
  let deficitRotacao = 0;
  let ladoRestrito = '';
  if (gonio?.rotacao) {
    const rotDir = gonio.rotacao.passiva_direita ?? 0;
    const rotEsq = gonio.rotacao.passiva_esquerda ?? 0;
    deficitRotacao = Math.abs(rotDir - rotEsq);
    if (rotDir < rotEsq) {
      ladoRestrito = 'direita';
    } else if (rotEsq < rotDir) {
      ladoRestrito = 'esquerda';
    }

    if (deficitRotacao > 5) {
      achados.push(
        `déficit de amplitude de movimento cervical passiva de ${deficitRotacao}° em rotação para a ${ladoRestrito}`
      );
      tags.push(
        `ROTACAO_DEFICIT_${deficitRotacao > 30 ? 'SEVERO' : deficitRotacao > 15 ? 'MODERADO' : 'LEVE'}`
      );
    }
  }

  // Inclinação
  if (gonio?.inclinacao) {
    const incDir = gonio.inclinacao.passiva_direita ?? 0;
    const incEsq = gonio.inclinacao.passiva_esquerda ?? 0;
    const deficitInc = Math.abs(incDir - incEsq);
    if (deficitInc > 5) {
      achados.push(`assimetria de inclinação lateral de ${deficitInc}°`);
    }
  }

  // Nódulo/Palpação (usando a estrutura correta)
  const temNoduloDir =
    torcicolo?.ecom_direito_nodulo &&
    torcicolo.ecom_direito_nodulo !== 'ausente';
  const temNoduloEsq =
    torcicolo?.ecom_esquerdo_nodulo &&
    torcicolo.ecom_esquerdo_nodulo !== 'ausente';
  const temNodulo = temNoduloDir || temNoduloEsq;
  if (temNodulo) {
    const ladoNodulo = temNoduloDir ? 'direito' : 'esquerdo';
    const locNodulo = temNoduloDir
      ? torcicolo?.ecom_direito_nodulo
      : torcicolo?.ecom_esquerdo_nodulo;
    achados.push(
      `presença de nódulo fibroso no terço ${locNodulo || 'médio'} do ECOM ${ladoNodulo}`
    );
    tags.push('NODULO_PRESENTE');
  } else if (torcicolo) {
    achados.push('sem presença de nódulo palpável no momento');
    tags.push('NODULO_AUSENTE');
  }

  // Tônus
  if (
    torcicolo?.ecom_direito_tonus === 'tenso_corda' ||
    torcicolo?.ecom_esquerdo_tonus === 'tenso_corda'
  ) {
    const ladoTenso =
      torcicolo?.ecom_direito_tonus === 'tenso_corda' ? 'direito' : 'esquerdo';
    achados.push(`hipertonia do ECOM ${ladoTenso}`);
  }

  secoes.achados_fisicos =
    achados.length > 0
      ? `Ao exame físico, evidencia-se ${achados.join(', ')}.`
      : '';

  // ========== 4. CLASSIFICAÇÃO DO TORCICOLO ==========
  const severidade = calcularSeveridadeAutomatica(
    patientAgeMonths,
    deficitRotacao,
    !!temNodulo
  );
  if (severidade.grau > 0) {
    const tipoClinico =
      torcicolo?.tipo_clinico || 'torcicolo muscular congênito';
    secoes.classificacao_torcicolo = `Quadro cinético-funcional compatível com ${tipoClinico} - Grau ${severidade.grau} (${severidade.titulo})${ladoRestrito ? ` à ${ladoRestrito}` : ''}.`;
    tags.push(`TMC_GRAU_${severidade.grau}`);
    tags.push(`TMC_${severidade.grupo.toUpperCase()}`);
  }

  // ========== 5. ASSIMETRIA CRANIANA ==========
  const cranio: string[] = [];
  const craniometria = avaliacao.medidas_craniometricas;
  const assimetria = avaliacao.assimetria_craniana;

  // Calcular CVAI se temos os dados
  if (craniometria?.diagonal_a_mm && craniometria?.diagonal_b_mm) {
    const cva = Math.abs(
      craniometria.diagonal_a_mm - craniometria.diagonal_b_mm
    );
    const cvai = (cva / craniometria.diagonal_a_mm) * 100;

    let classPlagio = 'normal';
    if (cvai >= 11) classPlagio = 'muito severa';
    else if (cvai >= 8.75) classPlagio = 'severa';
    else if (cvai >= 6.25) classPlagio = 'moderada';
    else if (cvai >= 3.5) classPlagio = 'leve';

    if (cvai >= 3.5) {
      cranio.push(`plagiocefalia ${classPlagio} (CVAI: ${cvai.toFixed(1)}%)`);
      tags.push(`PLAGIOCEFALIA_${classPlagio.toUpperCase().replace(' ', '_')}`);
    }
  }

  // Índice Cefálico (Braquicefalia)
  if (craniometria?.comprimento_ap_mm && craniometria?.largura_ml_mm) {
    const ci =
      (craniometria.largura_ml_mm / craniometria.comprimento_ap_mm) * 100;
    if (ci > 90) {
      const classBraqui = ci > 100 ? 'severa' : ci > 95 ? 'moderada' : 'leve';
      cranio.push(`braquicefalia ${classBraqui} (IC: ${ci.toFixed(1)}%)`);
      tags.push(`BRAQUICEFALIA_${classBraqui.toUpperCase()}`);
    } else if (ci < 75) {
      cranio.push(`escafocefalia (IC: ${ci.toFixed(1)}%)`);
      tags.push('ESCAFOCEFALIA');
    }
  }

  // Ear shift
  if (assimetria?.ear_shift && assimetria.ear_shift !== 'alinhadas') {
    cranio.push(`desalinhamento auricular (${assimetria.ear_shift})`);
  }

  secoes.assimetria_craniana =
    cranio.length > 0 ? `Associado a ${cranio.join(' e ')}.` : '';

  // ========== 6. DESENVOLVIMENTO MOTOR ==========
  const motor: string[] = [];
  const aims = avaliacao.aims_detalhada || avaliacao.aims;
  const funcCervical = avaliacao.funcionalidade_cervical;

  if (aims?.percentil !== undefined) {
    const classificacaoAIMS =
      aims.percentil < 5
        ? 'atraso motor significativo'
        : aims.percentil < 10
          ? 'atraso motor'
          : aims.percentil < 25
            ? 'desenvolvimento motor limítrofe'
            : 'desenvolvimento motor adequado para a idade';

    motor.push(`${classificacaoAIMS} (AIMS percentil ${aims.percentil})`);

    if (aims.percentil < 10) {
      tags.push('ATRASO_MOTOR');
    }
  }

  // Controle cervical (usando estrutura atual)
  if (
    funcCervical?.supino?.manutencao_linha_media === 'cai_preferencia' ||
    funcCervical?.supino?.manutencao_linha_media === 'instavel'
  ) {
    motor.push('dificuldade na manutenção da cabeça na linha média em supino');
    tags.push('CONTROLE_CERVICAL_ALTERADO');
  }
  if (
    funcCervical?.prono?.tolerancia === 'chora_imediato' ||
    funcCervical?.prono?.tolerancia === 'cansa_rapido'
  ) {
    motor.push('baixa tolerância ao posicionamento em prono');
  }

  // MFS (usando campos corretos)
  if (
    avaliacao.mfs_esquerdo !== undefined &&
    avaliacao.mfs_direito !== undefined &&
    avaliacao.mfs_esquerdo !== null &&
    avaliacao.mfs_direito !== null
  ) {
    const diffMFS = Math.abs(avaliacao.mfs_esquerdo - avaliacao.mfs_direito);
    if (diffMFS > 0) {
      motor.push(
        `assimetria na força de flexores laterais cervicais (MFS: D${avaliacao.mfs_direito}/E${avaliacao.mfs_esquerdo})`
      );
    }
  }

  secoes.desenvolvimento_motor =
    motor.length > 0
      ? `Quanto ao desenvolvimento motor, observa-se ${motor.join(', ')}.`
      : '';

  // ========== 7. CONCLUSÃO FUNCIONAL ==========
  const funcoes = avaliacao.funcoes_sensoriais;
  const conclusoes: string[] = [];

  // Visual (usando estrutura correta)
  if (
    funcoes?.visual?.rastreio_visual === 'restrito_direita' ||
    funcoes?.visual?.rastreio_visual === 'restrito_esquerda'
  ) {
    const ladoNegl =
      funcoes.visual.rastreio_visual === 'restrito_direita'
        ? 'direita'
        : 'esquerda';
    conclusoes.push(`sinais de negligência visual à ${ladoNegl}`);
    tags.push('NEGLIGENCIA_VISUAL');
  }

  // Oral
  if (funcoes?.oral?.vedamento_labial === 'labios_abertos') {
    conclusoes.push('padrão respirador oral');
    tags.push('RESPIRADOR_ORAL');
  }
  if (
    funcoes?.oral?.anatomia_lingua === 'frenulo_curto' ||
    funcoes?.oral?.anatomia_lingua === 'em_coracao'
  ) {
    conclusoes.push('freio lingual curto');
    tags.push('FRENULO_CURTO');
  }

  // Tensão neural (usando estrutura correta)
  const tensao = avaliacao.tensao_neuromeningea_detalhada;
  if (
    tensao?.membro_superior_direito?.status === 'alterado' ||
    tensao?.membro_superior_esquerdo?.status === 'alterado'
  ) {
    conclusoes.push('teste de tensão neural positivo em membros superiores');
    tags.push('TENSAO_NEURAL_POSITIVA');
  }

  secoes.conclusao_funcional =
    conclusoes.length > 0
      ? `Funcionalmente, apresenta ${conclusoes.join(', ')}.`
      : '';

  // ========== 8. PLANO DE TRATAMENTO ==========
  if (severidade.grau > 0) {
    secoes.plano_tratamento = `Prognóstico estimado: ${severidade.prognostico.min_meses} a ${severidade.prognostico.max_meses} meses de tratamento. ${severidade.prognostico.mensagem}`;
  }
  if (avaliacao.plano_tratamento) {
    secoes.plano_tratamento += ` ${avaliacao.plano_tratamento.replace(/<[^>]*>/g, '').trim()}`;
  }

  // ========== MONTAR TEXTO COMPLETO ==========
  const partesTexto = [
    secoes.identificacao,
    secoes.queixa_anamnese,
    secoes.achados_fisicos,
    secoes.classificacao_torcicolo,
    secoes.assimetria_craniana,
    secoes.desenvolvimento_motor,
    secoes.conclusao_funcional,
    secoes.plano_tratamento,
  ].filter((s) => s.length > 0);

  return {
    texto_completo: partesTexto.join('\n\n'),
    secoes,
    tags_detectadas: tags,
    data_geracao: new Date().toISOString(),
  };
}

/**
 * Calcula o percentil AIMS baseado na idade e score total
 */
export function calcularPercentilAIMS(
  idadeMeses: number,
  scoreTotal: number
): { percentil: number; classificacao: AIMSClassificacao } {
  // Encontrar a faixa de idade mais próxima
  let ref = AIMS_REFERENCIA_PERCENTIL[0];
  for (const r of AIMS_REFERENCIA_PERCENTIL) {
    if (r.idade_meses <= idadeMeses) {
      ref = r;
    } else {
      break;
    }
  }

  // Determinar percentil aproximado
  let percentil = 50;
  if (scoreTotal <= ref.p5) {
    percentil = 5;
  } else if (scoreTotal <= ref.p10) {
    percentil = 10;
  } else if (scoreTotal <= ref.p25) {
    percentil = 25;
  } else if (scoreTotal <= ref.p50) {
    percentil = 50;
  } else if (scoreTotal <= ref.p75) {
    percentil = 75;
  } else if (scoreTotal <= ref.p90) {
    percentil = 90;
  } else {
    percentil = 95;
  }

  // Classificação
  let classificacao: AIMSClassificacao = 'normal';
  if (percentil <= 5) {
    classificacao = 'atipico';
  } else if (percentil <= 10) {
    classificacao = 'suspeito';
  }

  return { percentil, classificacao };
}

/**
 * Retorna a cor baseada na classificação AIMS
 */
export function getCorClassificacaoAIMS(
  classificacao: AIMSClassificacao | undefined
): string {
  switch (classificacao) {
    case 'atipico':
      return 'bg-red-500';
    case 'suspeito':
      return 'bg-yellow-500';
    case 'normal':
      return 'bg-green-500';
    default:
      return 'bg-gray-300';
  }
}

export interface ObjetivosTratamento {
  curto_prazo?: string;
  medio_prazo?: string;
  longo_prazo?: string;
}

// =====================================================
// INTERFACE PRINCIPAL DA AVALIAÇÃO
// =====================================================

export interface AvaliacaoClinica {
  id: string;
  pessoa_id: string;
  data_avaliacao: string;
  idade_semanas?: number | null;
  status: AvaliacaoStatus;

  // Seção 1: Cadastro do Paciente
  pai_id?: string | null;
  mae_id?: string | null;
  nome_pai?: string | null;
  nome_mae?: string | null;
  obstetra_id?: string | null;

  // Seção 2: Queixa Principal
  queixa_principal?: string | null;

  // Seção 3.1: Pré-natal
  numero_gestacoes?: number | null;
  gestacao_multipla?: boolean | null;
  idade_gestacional_semanas?: number | null; // Para gestação única
  gestacoes_info?: GestacaoInfo[] | null; // Para múltiplas gestações
  liquido_amniotico?: LiquidoAmniotico | null;
  liquido_amniotico_outro?: string | null;
  apresentacao_fetal?: ApresentacaoFetal | null;
  apresentacao_fetal_outra?: string | null;
  encaixe_precoce?: SimNaoNaoSabe | null;
  circular_cordao?: SimNaoNaoSabe | null;
  intercorrencias_prenatais?: string | null;

  // Seção 3.2: Peri-natal
  tipo_parto?: TipoParto | null;
  forceps?: boolean | null; // Mantido para compatibilidade
  vacuo_extrator?: boolean | null; // Mantido para compatibilidade
  instrumentos_parto?: InstrumentoParto[] | null; // Novo campo unificado
  instrumentos_parto_outro?: string | null; // Especificação quando "outro"
  duracao_trabalho_parto?: string | null;
  duracao_trabalho_parto_minutos?: number | null;
  intercorrencias_perinatais?: string | null;

  // Seção 3.3: Pós-natal
  apgar_1min?: number | null;
  apgar_5min?: number | null;
  tempo_internacao?: string | null; // Mantido para compatibilidade
  tempo_internacao_dias?: number | null; // Novo campo numérico
  local_internacao?: LocalInternacao | null;
  local_internacao_outro?: string | null;
  assistencia_ventilatoria?: boolean | null;
  tipos_assistencia_ventilatoria?: TipoAssistenciaVentilatoria[] | null; // Array de tipos selecionados
  tipo_assistencia_ventilatoria_outro?: string | null; // Se selecionou "outro"
  tempo_assistencia_ventilatoria_dias?: number | null; // Tempo em dias
  tipo_assistencia_ventilatoria?: string | null; // Campo legado mantido para compatibilidade
  idade_inclinacao_cabeca?: string | null; // Mantido para compatibilidade
  idade_inclinacao_cabeca_dias?: number | null; // Novo campo numérico
  assimetrias_percebidas?: AssimetriaTipo[];
  assimetrias_percebidas_outra?: string | null; // Especificação quando "outra"

  // Seção 4: Características Gerais do Bebê
  estado_emocional?: string | null; // Mantido para compatibilidade
  estado_emocional_opcoes?: EstadoEmocional[] | null; // Novo: múltipla seleção
  onde_dorme?: string | null; // Mantido para compatibilidade
  onde_dorme_opcao?: OndeDorme | null; // Novo: seleção única
  onde_dorme_outro?: string | null; // Especificação quando "outro"
  periodo_qualidade_sono?: string | null; // Mantido para compatibilidade
  qualidade_sono_opcao?: QualidadeSono | null; // Novo: seleção única
  posicao_preferencia?: string | null; // Mantido para compatibilidade
  posicao_preferencia_opcao?: PosicaoPreferencia | null; // Novo: seleção única
  refluxo?: boolean | null; // Mantido para compatibilidade
  refluxo_status?: SimNaoSuspeita | null; // Novo: sim/não/suspeita
  refluxo_tipo?: TipoRefluxo | null; // Se sim, fisiológico ou patológico
  aplv?: SimNaoSuspeita | null; // Novo: APLV
  disquesia?: SimNaoSuspeita | null; // Novo: Disquesia
  constipacao?: boolean | null;
  habilidades_motoras?: string | null;

  // Seção 5: Marcos Motores (antiga Observação Postural)
  marcos_motores_atingidos?: MarcosMotoresAtingidos | null; // JSONB com {marcoId: true/false}

  // Seção 6: Tipo de Torcicolo (agora inclui observação postural)
  preferencia_rotacao_cervical?: PreferenciaRotacao | null;
  inclinacao_lateral?: InclinacaoLateral | null;
  observacoes_posturais?: string | null;
  tem_torcicolo?: boolean | null; // Sim ou Não
  tipo_torcicolo?: TipoTorcicolo | null; // Legado: Postural ou Congênito
  torcicolo_nodulo?: TorcicoloNodulo | null; // Legado: Com nódulo ou Sem nódulo
  nodulo_ecm?: boolean | null; // Mantido para compatibilidade
  torcicolo_detalhado?: TorcicoloDetalhado | null; // Nova estrutura completa
  // Campo removido: assimetria_facial (já existe em assimetrias_percebidas)

  // Seção 7: Goniometria Cervical
  goniometria?: Goniometria;

  // Seção 8: Escala MFS
  mfs_direito?: number | null;
  mfs_esquerdo?: number | null;
  mfs_observacoes?: string | null;

  // Seção 9: Tensão Neuromeníngea
  tensao_neuromeningea?: TensaoNeuromeningeaLegado | null; // Campo legado
  tensao_neuromeningea_obs?: string | null; // Campo legado
  tensao_neuromeningea_detalhada?: TensaoNeuromeningeaDetalhada | null; // Nova estrutura

  // Seção 10: Funções Sensoriais
  funcoes_sensoriais?: FuncoesSensoriais;

  // Seção 11: Medidas Craniométricas
  medidas_craniometricas?: MedidasCraniometricas;

  // Seção 12: Assimetria Craniana
  assimetria_craniana?: AssimetriaCraniana;

  // Seção 13: Palpação Muscular
  tonus?: Tonus | null;
  nodulos_presentes?: boolean | null;
  nodulos_localizacao?: string | null;

  // Seção 14: Responsividade e Comportamento Motor
  preferencia_manual?: PreferenciaManual | null;
  reacoes_posturais?: string | null;
  engajamento_visual?: string | null;

  // Seção 15: FSOS-2
  fsos2?: FSOS2;

  // Seção 16: Controle Motor Cervical (antes "Funcionalidade Cervical")
  funcionalidade_cervical?: FuncionalidadeCervical;

  // Seção 17: Resposta Postural
  resposta_postural?: RespostaPostural; // Nova estrutura
  landau?: string | null; // Legado
  teste_tracao?: string | null; // Legado
  repercussoes_tronco_membros?: string | null; // Legado

  // Seção 18: AIMS (Alberta Infant Motor Scale)
  aims?: AIMS;
  aims_detalhada?: AIMSDetalhada; // Nova estrutura com itens individuais

  // Seção 19: Grau de Severidade
  grau_severidade?: number | null;
  grau_severidade_obs?: string | null;

  // Seção 20: Exames Complementares
  exames_complementares?: string | null;

  // Seção 21: Diagnóstico Cinético-Funcional
  diagnostico_cinetico_funcional?: string | null;

  // Seção 22: Objetivos do Tratamento
  objetivos_tratamento?: ObjetivosTratamento;

  // Seção 23: Plano de Tratamento
  plano_tratamento?: string | null;

  // Seção 24: Reavaliação Recomendada
  reavaliacao_recomendada?: ReavaliacaoRecomendada | null;
  reavaliacao_outro?: string | null;

  // Seção 25: Observações Gerais
  observacoes_gerais?: string | null;

  // Integração com a evolução motora
  // Habilidades no mesmo catálogo da evolução (registro zero da criança)
  habilidades?: import('@/types/evolucao-clinica').RegistroHabilidade[] | null;
  tipo_avaliacao?: 'inicial' | 'reavaliacao';
  avaliacao_anterior_id?: string | null;
  agendamento_id?: string | null;

  // Metadados
  avaliador_id?: string | null;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// TIPOS PARA CRIAÇÃO/ATUALIZAÇÃO
// =====================================================

export type AvaliacaoClinicaCreate = Omit<
  AvaliacaoClinica,
  'id' | 'created_at' | 'updated_at'
>;

export type AvaliacaoClinicaUpdate = Partial<
  Omit<AvaliacaoClinica, 'id' | 'pessoa_id' | 'created_at' | 'updated_at'>
>;

// =====================================================
// TIPOS PARA LISTAGEM
// =====================================================

export interface AvaliacaoClinicaListItem {
  id: string;
  pessoa_id: string;
  data_avaliacao: string;
  status: AvaliacaoStatus;
  grau_severidade?: number | null;
  tipo_torcicolo?: TipoTorcicolo | null;
  avaliador_id?: string | null;
  avaliador_nome?: string;
  tipo_avaliacao?: 'inicial' | 'reavaliacao';
  agendamento_id?: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// DEFINIÇÃO DAS SEÇÕES PARA NAVEGAÇÃO
// =====================================================

/**
 * Categoria da seção - determina cor e agrupamento
 * - comum: Seções aplicáveis a todas as avaliações (cinza)
 * - tmc: Torcicolo Muscular Congênito (verde/emerald)
 * - assimetria_craniana: Plagiocefalia/Braquicefalia (azul/sky)
 */
export type CategoriaSecao = 'comum' | 'tmc' | 'assimetria_craniana';

/**
 * Grupos lógicos para organização visual
 */
export type GrupoSecao =
  | 'anamnese' // Histórico do paciente
  | 'exame_torcicolo' // Exame físico específico TMC
  | 'exame_cranio' // Exame físico específico AC
  | 'neuromotor' // Avaliação neuromotora
  | 'classificacao' // Grau de severidade
  | 'conclusao'; // Diagnóstico e plano

export interface GrupoSecaoInfo {
  id: GrupoSecao;
  titulo: string;
  descricao: string;
  cor: string; // Tailwind color class
  corBg: string; // Background color class
  corBorder: string; // Border color class
  icone: string; // Emoji ou ícone
  ordem: number;
}

export const GRUPOS_SECOES: GrupoSecaoInfo[] = [
  {
    id: 'anamnese',
    titulo: 'Anamnese',
    descricao: 'Histórico do paciente e gestação',
    cor: 'text-slate-700',
    corBg: 'bg-slate-50',
    corBorder: 'border-slate-300',
    icone: '📋',
    ordem: 1,
  },
  {
    id: 'exame_torcicolo',
    titulo: 'Exame Físico - Torcicolo',
    descricao: 'Avaliação específica de TMC',
    cor: 'text-emerald-700',
    corBg: 'bg-emerald-50',
    corBorder: 'border-emerald-400',
    icone: '🟢',
    ordem: 2,
  },
  {
    id: 'exame_cranio',
    titulo: 'Exame Físico - Crânio',
    descricao: 'Avaliação de assimetria craniana',
    cor: 'text-sky-700',
    corBg: 'bg-sky-50',
    corBorder: 'border-sky-400',
    icone: '🔵',
    ordem: 3,
  },
  {
    id: 'neuromotor',
    titulo: 'Avaliação Neuromotora',
    descricao: 'Funções sensoriais e motoras',
    cor: 'text-violet-700',
    corBg: 'bg-violet-50',
    corBorder: 'border-violet-400',
    icone: '🟣',
    ordem: 4,
  },
  {
    id: 'classificacao',
    titulo: 'Classificação',
    descricao: 'Grau de severidade e prognóstico',
    cor: 'text-amber-700',
    corBg: 'bg-amber-50',
    corBorder: 'border-amber-400',
    icone: '⭐',
    ordem: 5,
  },
  {
    id: 'conclusao',
    titulo: 'Conclusão',
    descricao: 'Diagnóstico, objetivos e plano',
    cor: 'text-gray-700',
    corBg: 'bg-gray-50',
    corBorder: 'border-gray-300',
    icone: '✅',
    ordem: 6,
  },
];

export interface AvaliacaoSecao {
  id: string;
  numero: number;
  titulo: string;
  descricao?: string;
  campos: string[];
  /** Categoria: comum (ambos), tmc (torcicolo), assimetria_craniana */
  categoria: CategoriaSecao;
  /** Grupo para agrupamento visual */
  grupo: GrupoSecao;
}

export const AVALIACOES_SECOES: AvaliacaoSecao[] = [
  // =====================================================
  // GRUPO: ANAMNESE (Seções 1-7)
  // =====================================================
  {
    id: 'cadastro',
    numero: 1,
    titulo: 'Cadastro do Paciente',
    descricao: 'Dados do paciente, responsáveis e médicos',
    campos: ['nome_pai', 'nome_mae', 'obstetra_id'],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'queixa',
    numero: 2,
    titulo: 'Queixa Principal',
    descricao: 'Relato dos pais',
    campos: ['queixa_principal'],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'prenatal',
    numero: 3,
    titulo: 'Pré-natal',
    descricao: 'Histórico gestacional',
    campos: [
      'numero_gestacoes',
      'idade_gestacional_semanas',
      'gestacoes_info',
      'liquido_amniotico',
      'liquido_amniotico_outro',
      'apresentacao_fetal',
      'encaixe_precoce',
      'circular_cordao',
      'intercorrencias_prenatais',
    ],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'perinatal',
    numero: 4,
    titulo: 'Peri-natal',
    descricao: 'Dados do parto',
    campos: [
      'tipo_parto',
      'instrumentos_parto',
      'instrumentos_parto_outro',
      'duracao_trabalho_parto_minutos',
      'intercorrencias_perinatais',
    ],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'posnatal',
    numero: 5,
    titulo: 'Pós-natal',
    descricao: 'Após nascimento',
    campos: [
      'apgar_1min',
      'apgar_5min',
      'tempo_internacao_dias',
      'local_internacao',
      'assistencia_ventilatoria',
      'idade_inclinacao_cabeca_dias',
      'assimetrias_percebidas',
      'assimetrias_percebidas_outra',
    ],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'caracteristicas',
    numero: 6,
    titulo: 'Características do Bebê',
    descricao: 'Estado geral',
    campos: [
      'estado_emocional_opcoes',
      'onde_dorme_opcao',
      'qualidade_sono_opcao',
      'posicao_preferencia_opcao',
      'refluxo_status',
      'refluxo_tipo',
      'aplv',
      'disquesia',
      'habilidades_motoras',
    ],
    categoria: 'comum',
    grupo: 'anamnese',
  },
  {
    id: 'marcos_motores',
    numero: 7,
    titulo: 'Marcos Motores',
    descricao: 'Desenvolvimento motor por idade',
    campos: ['marcos_motores_atingidos'],
    categoria: 'comum',
    grupo: 'anamnese',
  },

  // =====================================================
  // GRUPO: EXAME FÍSICO - TORCICOLO (Seções 8-12)
  // =====================================================
  {
    id: 'torcicolo',
    numero: 8,
    titulo: 'Tipo de Torcicolo',
    descricao: 'Classificação e observação postural',
    campos: [
      'preferencia_rotacao_cervical',
      'inclinacao_lateral',
      'observacoes_posturais',
      'tem_torcicolo',
      'tipo_torcicolo',
      'torcicolo_nodulo',
    ],
    categoria: 'tmc',
    grupo: 'exame_torcicolo',
  },
  {
    id: 'goniometria',
    numero: 9,
    titulo: 'Goniometria',
    descricao: 'Medidas cervicais',
    campos: ['goniometria'],
    categoria: 'tmc',
    grupo: 'exame_torcicolo',
  },
  {
    id: 'palpacao',
    numero: 10,
    titulo: 'Palpação ECOM',
    descricao: 'Tônus, nódulos e fibrose',
    campos: ['tonus', 'nodulos_presentes', 'nodulos_localizacao'],
    categoria: 'tmc',
    grupo: 'exame_torcicolo',
  },
  {
    id: 'mfs',
    numero: 11,
    titulo: 'Escala MFS',
    descricao: 'Função muscular',
    campos: ['mfs_direito', 'mfs_esquerdo', 'mfs_observacoes'],
    categoria: 'tmc',
    grupo: 'exame_torcicolo',
  },
  {
    id: 'tensao',
    numero: 12,
    titulo: 'Tensão Neuromeníngea',
    descricao: 'Testes neurodinâmicos',
    campos: ['tensao_neuromeningea', 'tensao_neuromeningea_obs'],
    categoria: 'tmc',
    grupo: 'exame_torcicolo',
  },

  // =====================================================
  // GRUPO: EXAME FÍSICO - CRÂNIO (Seções 13-15)
  // =====================================================
  {
    id: 'craniometria',
    numero: 13,
    titulo: 'Medidas Craniométricas',
    descricao: 'CVA / CVAI / CI',
    campos: ['medidas_craniometricas'],
    categoria: 'assimetria_craniana',
    grupo: 'exame_cranio',
  },
  {
    id: 'assimetria',
    numero: 14,
    titulo: 'Assimetria Craniana',
    descricao: 'Plagiocefalia / Braquicefalia',
    campos: ['assimetria_craniana'],
    categoria: 'assimetria_craniana',
    grupo: 'exame_cranio',
  },
  {
    id: 'fsos2',
    numero: 15,
    titulo: 'FSOS-2',
    descricao: 'Escala de simetria facial',
    campos: ['fsos2'],
    categoria: 'assimetria_craniana',
    grupo: 'exame_cranio',
  },

  // =====================================================
  // GRUPO: AVALIAÇÃO NEUROMOTORA (Seções 16-20)
  // =====================================================
  {
    id: 'sensoriais',
    numero: 16,
    titulo: 'Funções Sensoriais',
    descricao: 'Visual, auditiva, oral',
    campos: ['funcoes_sensoriais'],
    categoria: 'comum',
    grupo: 'neuromotor',
  },
  {
    id: 'motor',
    numero: 17,
    titulo: 'Comportamento Motor',
    descricao: 'Responsividade',
    campos: ['preferencia_manual', 'reacoes_posturais', 'engajamento_visual'],
    categoria: 'tmc',
    grupo: 'neuromotor',
  },
  {
    id: 'funcionalidade',
    numero: 18,
    titulo: 'Controle Motor Cervical',
    descricao: 'Supino e Prono',
    campos: ['funcionalidade_cervical'],
    categoria: 'tmc',
    grupo: 'neuromotor',
  },
  {
    id: 'resposta',
    numero: 19,
    titulo: 'Resposta Postural',
    descricao: 'Pull-to-Sit / Landau',
    campos: ['landau', 'teste_tracao', 'repercussoes_tronco_membros'],
    categoria: 'tmc',
    grupo: 'neuromotor',
  },
  {
    id: 'aims',
    numero: 20,
    titulo: 'AIMS',
    descricao: 'Alberta Infant Motor Scale',
    campos: ['aims'],
    categoria: 'tmc',
    grupo: 'neuromotor',
  },

  // =====================================================
  // GRUPO: CLASSIFICAÇÃO (Seção 21)
  // =====================================================
  {
    id: 'severidade',
    numero: 21,
    titulo: 'Grau de Severidade',
    descricao: 'Estratificação 1-8 (Automático)',
    campos: ['grau_severidade', 'grau_severidade_obs'],
    categoria: 'tmc',
    grupo: 'classificacao',
  },

  // =====================================================
  // GRUPO: CONCLUSÃO (Seções 22-27)
  // =====================================================
  {
    id: 'exames',
    numero: 22,
    titulo: 'Exames Complementares',
    descricao: 'Ultrassom, RX, etc.',
    campos: ['exames_complementares'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
  {
    id: 'diagnostico',
    numero: 23,
    titulo: 'Diagnóstico',
    descricao: 'Cinético-funcional',
    campos: ['diagnostico_cinetico_funcional'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
  {
    id: 'objetivos',
    numero: 24,
    titulo: 'Objetivos do Tratamento',
    descricao: 'Curto/Médio/Longo prazo',
    campos: ['objetivos_tratamento'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
  {
    id: 'plano',
    numero: 25,
    titulo: 'Plano de Tratamento',
    descricao: 'Condutas e frequência',
    campos: ['plano_tratamento'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
  {
    id: 'reavaliacao',
    numero: 26,
    titulo: 'Reavaliação',
    descricao: 'Próxima avaliação',
    campos: ['reavaliacao_recomendada', 'reavaliacao_outro'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
  {
    id: 'observacoes',
    numero: 27,
    titulo: 'Observações Gerais',
    descricao: 'Notas adicionais',
    campos: ['observacoes_gerais'],
    categoria: 'comum',
    grupo: 'conclusao',
  },
];

/**
 * Retorna as seções agrupadas por grupo
 */
export function getSecoesAgrupadas(): Map<GrupoSecao, AvaliacaoSecao[]> {
  const grupos = new Map<GrupoSecao, AvaliacaoSecao[]>();

  for (const secao of AVALIACOES_SECOES) {
    const grupoAtual = grupos.get(secao.grupo) || [];
    grupoAtual.push(secao);
    grupos.set(secao.grupo, grupoAtual);
  }

  return grupos;
}

/**
 * Retorna informações do grupo pelo ID
 */
export function getGrupoInfo(grupoId: GrupoSecao): GrupoSecaoInfo | undefined {
  return GRUPOS_SECOES.find((g) => g.id === grupoId);
}

/**
 * Retorna a cor do badge baseado na categoria
 */
export function getCorCategoria(categoria: CategoriaSecao): {
  bg: string;
  text: string;
  border: string;
  badge: 'default' | 'secondary' | 'outline';
} {
  switch (categoria) {
    case 'tmc':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-300',
        badge: 'default',
      };
    case 'assimetria_craniana':
      return {
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-300',
        badge: 'secondary',
      };
    default:
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        border: 'border-gray-200',
        badge: 'outline',
      };
  }
}

// =====================================================
// LABELS E OPÇÕES PARA UI
// =====================================================

export const GRAUS_SEVERIDADE = [
  // Precoce (0 a 6 meses)
  {
    valor: 1,
    label: 'Grau 1 - Precoce Leve',
    categoria: 'Precoce',
    descricao:
      '0-6 meses: apenas postura preferencial ou diferença na rotação cervical passiva < 15°',
  },
  {
    valor: 2,
    label: 'Grau 2 - Precoce Moderada',
    categoria: 'Precoce',
    descricao:
      '0-6 meses: diferença na rotação cervical passiva entre 15° e 30°',
  },
  {
    valor: 3,
    label: 'Grau 3 - Precoce Severa',
    categoria: 'Precoce',
    descricao:
      '0-6 meses: diferença na rotação cervical passiva > 30° ou com massa no ECOM',
  },
  // Tardio (7+ meses)
  {
    valor: 4,
    label: 'Grau 4 - Tardia Leve',
    categoria: 'Tardio',
    descricao:
      '7-9 meses: apenas postura preferencial ou diferença na rotação cervical passiva < 15°',
  },
  {
    valor: 5,
    label: 'Grau 5 - Tardia Moderada',
    categoria: 'Tardio',
    descricao:
      '10-12 meses: apenas postura preferencial ou diferença na rotação cervical passiva < 15°',
  },
  {
    valor: 6,
    label: 'Grau 6 - Tardia Severa',
    categoria: 'Tardio',
    descricao:
      '7-9 meses com diferença de 15°, ou 10-12 meses com diferença entre 15° e 30°',
  },
  {
    valor: 7,
    label: 'Grau 7 - Tardia Extrema',
    categoria: 'Tardio',
    descricao:
      '7-12 meses com massa no ECOM, ou 10-12 meses com diferença > 30°',
  },
  {
    valor: 8,
    label: 'Grau 8 - Muito Tardia',
    categoria: 'Tardio',
    descricao:
      '> 12 meses: qualquer assimetria, preferência postural, diferença na rotação ou massa no ECOM',
  },
];

// Tempos estimados de tratamento por grau (baseado em Cheng et al., 2001)
export const TEMPO_TRATAMENTO_ESTIMADO: Record<number, string> = {
  1: '2-4 semanas (apenas orientação)',
  2: '1-2 meses',
  3: '2-4 meses',
  4: '2-3 meses',
  5: '3-4 meses',
  6: '4-6 meses',
  7: '6+ meses (considerar encaminhamento)',
  8: '6-12 meses (monitorar evolução, possível cirurgia)',
};

/**
 * Calcula automaticamente o grau de severidade do torcicolo
 * Baseado em Cheng et al., 2001 e prática clínica padrão
 *
 * @param ageInMonths - Idade do bebê em meses
 * @param rotationDeficit - Diferença em graus entre rotação D e E (da goniometria)
 * @param hasNodule - Se há nódulo/massa palpável no ECOM
 * @returns Objeto com grau (1-8), descrição e tempo estimado
 */
export function calcularGrauSeveridadeTorcicolo(
  ageInMonths: number,
  rotationDeficit: number, // Math.abs(rotação_dir - rotação_esq)
  hasNodule: boolean
): {
  grau: number;
  descricao: string;
  tempoTratamento: string;
  alertas: string[];
} {
  const alertas: string[] = [];
  let grau = 1;
  let descricao = '';

  // Detectar Red Flags
  if (hasNodule && rotationDeficit > 30) {
    alertas.push(
      '⚠️ Nódulo + restrição severa: considerar acompanhamento especializado'
    );
  }

  // GRUPO 1: Diagnóstico Precoce (< 6 meses)
  if (ageInMonths < 6) {
    if (hasNodule) {
      grau = 3;
      descricao = 'Severa Precoce (Com Nódulo)';
      alertas.push(
        'Nódulo detectado em fase precoce - bom prognóstico se tratamento iniciado'
      );
    } else if (rotationDeficit > 30) {
      grau = 3;
      descricao = 'Severa Precoce (> 30°)';
      alertas.push('Restrição significativa, tratamento intensivo recomendado');
    } else if (rotationDeficit >= 15) {
      grau = 2;
      descricao = 'Moderada Precoce (15-30°)';
    } else if (rotationDeficit > 0) {
      grau = 1;
      descricao = 'Leve Precoce (< 15°)';
      alertas.push('Excelente prognóstico com tratamento precoce');
    } else {
      grau = 1;
      descricao = 'Postural (Sem restrição passiva)';
      alertas.push(
        'Apenas preferência postural - orientação domiciliar pode ser suficiente'
      );
    }
  }
  // GRUPO 2: Diagnóstico 6-9 meses
  else if (ageInMonths >= 6 && ageInMonths < 10) {
    if (hasNodule) {
      grau = 7;
      descricao = 'Severa Tardia (Com Nódulo)';
      alertas.push('⚠️ Nódulo persistente após 6 meses - avaliar evolução');
    } else if (rotationDeficit > 30) {
      grau = 6;
      descricao = 'Severa Tardia (> 30°)';
    } else if (rotationDeficit >= 15) {
      grau = 6;
      descricao = 'Moderada-Severa Tardia (15-30°)';
    } else if (rotationDeficit > 0) {
      grau = 4;
      descricao = 'Leve Tardia (< 15°)';
    } else {
      grau = 4;
      descricao = 'Postural Tardio';
    }
  }
  // GRUPO 3: Diagnóstico 10-12 meses
  else if (ageInMonths >= 10 && ageInMonths <= 12) {
    if (hasNodule) {
      grau = 7;
      descricao = 'Extrema Tardia (Com Nódulo)';
      alertas.push('⚠️ Considerar encaminhamento ortopédico/cirúrgico');
    } else if (rotationDeficit > 30) {
      grau = 7;
      descricao = 'Extrema Tardia (> 30°)';
    } else if (rotationDeficit >= 15) {
      grau = 6;
      descricao = 'Severa Tardia (15-30°)';
    } else {
      grau = 5;
      descricao = 'Moderada Tardia (< 15°)';
    }
  }
  // GRUPO 4: Diagnóstico > 12 meses
  else {
    grau = 8;
    descricao = 'Muito Tardia (> 12 meses)';
    alertas.push('⚠️ Diagnóstico tardio - tempo de tratamento prolongado');
    if (hasNodule) {
      alertas.push(
        '⚠️ Com nódulo: avaliar necessidade de intervenção cirúrgica'
      );
    }
    if (rotationDeficit > 15) {
      alertas.push('Restrição presente - associar terapia manual intensiva');
    }
  }

  return {
    grau,
    descricao: `Grau ${grau}: ${descricao}`,
    tempoTratamento:
      TEMPO_TRATAMENTO_ESTIMADO[grau] || 'Avaliar individualmente',
    alertas,
  };
}

/**
 * Detecta inconsistências entre classificação manual e dados objetivos
 */
export function detectarInconsistenciasTorcicolo(
  tipoClinico: TorcicoloTipoClinico | undefined,
  rotationDeficit: number,
  hasNodule: boolean
): string[] {
  const inconsistencias: string[] = [];

  if (tipoClinico === 'POST' && rotationDeficit >= 10) {
    inconsistencias.push(
      `⚠️ Inconsistência: Classificado como "Postural" mas há restrição de ${rotationDeficit}° na goniometria. Considere reclassificar como MT ou SMT.`
    );
  }

  if (tipoClinico === 'MT' && hasNodule) {
    inconsistencias.push(
      '⚠️ Inconsistência: Classificado como "Muscular sem massa" mas há nódulo palpável. Deve ser classificado como SMT.'
    );
  }

  if (tipoClinico === 'SMT' && !hasNodule) {
    inconsistencias.push(
      '⚠️ Atenção: Classificado como "Muscular COM massa" mas nenhum nódulo foi registrado na palpação.'
    );
  }

  if (tipoClinico === 'POST' && hasNodule) {
    inconsistencias.push(
      '⚠️ Inconsistência grave: Classificado como "Postural" mas há nódulo palpável. Deve ser classificado como SMT.'
    );
  }

  return inconsistencias;
}

export const ASSIMETRIAS_OPCOES = [
  { valor: 'craniana', label: 'Craniana' },
  { valor: 'facial', label: 'Facial' },
  { valor: 'mandibular', label: 'Mandibular' },
  { valor: 'olhos', label: 'Nivelamento dos olhos' },
  { valor: 'orelhas', label: 'Nivelamento das orelhas' },
  { valor: 'falhas_cabelo', label: 'Falhas de cabelo' },
  { valor: 'assadura_cervical', label: 'Assadura cervical' },
  { valor: 'outra', label: 'Outra' },
];

export const APRESENTACAO_FETAL_OPCOES = [
  { valor: 'cefalica', label: 'Cefálica' },
  { valor: 'pelvica', label: 'Pélvica' },
  { valor: 'transversa', label: 'Transversa' },
  { valor: 'outra', label: 'Outra' },
];

export const LIQUIDO_AMNIOTICO_OPCOES = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'oligoamnio', label: 'Oligoâmnio (reduzido)' },
  { valor: 'polidramnio', label: 'Polidrâmnio (aumentado)' },
  { valor: 'outro', label: 'Outro' },
];

export const INSTRUMENTOS_PARTO_OPCOES = [
  { valor: 'forceps', label: 'Fórceps' },
  { valor: 'vacuo_extrator', label: 'Vácuo-extrator' },
  { valor: 'kristeller', label: 'Manobra de Kristeller' },
  { valor: 'episiotomia', label: 'Episiotomia' },
  { valor: 'outro', label: 'Outro' },
];

export const ESTADO_EMOCIONAL_OPCOES = [
  { valor: 'calmo', label: 'Calmo' },
  { valor: 'irritado', label: 'Irritado' },
  { valor: 'choroso', label: 'Choroso' },
  { valor: 'agitado', label: 'Agitado' },
  { valor: 'sonolento', label: 'Sonolento' },
  { valor: 'alerta', label: 'Alerta' },
];

export const ONDE_DORME_OPCOES = [
  { valor: 'berco_quarto_pais', label: 'Berço no quarto dos pais' },
  { valor: 'berco_quarto_proprio', label: 'Berço no quarto próprio' },
  { valor: 'cama_pais', label: 'Cama dos pais' },
  { valor: 'carrinho', label: 'Carrinho' },
  { valor: 'bebe_conforto', label: 'Bebê conforto' },
  { valor: 'outro', label: 'Outro' },
];

export const QUALIDADE_SONO_OPCOES = [
  { valor: 'bom', label: 'Bom' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'ruim', label: 'Ruim' },
  { valor: 'fragmentado', label: 'Fragmentado (acorda várias vezes)' },
  { valor: 'dorme_pouco', label: 'Dorme pouco' },
  { valor: 'dorme_muito', label: 'Dorme muito' },
  { valor: 'variado', label: 'Variado' },
];

export const POSICAO_PREFERENCIA_OPCOES = [
  { valor: 'direita', label: 'Direita' },
  { valor: 'esquerda', label: 'Esquerda' },
  { valor: 'costas', label: 'De costas (supino)' },
  { valor: 'brucos', label: 'De bruços (prono)' },
  { valor: 'sem_preferencia', label: 'Sem preferência' },
];

export const SIM_NAO_SUSPEITA_OPCOES = [
  { valor: 'sim', label: 'Sim' },
  { valor: 'nao', label: 'Não' },
  { valor: 'suspeita', label: 'Suspeita' },
];

// AI dev note: Opções para campos que podem ter resposta "não sabe" (ex: encaixe_precoce, circular_cordao)
export const SIM_NAO_NAO_SABE_OPCOES = [
  { valor: 'sim', label: 'Sim' },
  { valor: 'nao', label: 'Não' },
  { valor: 'nao_sabe', label: 'Não sabe' },
];

export type SimNaoNaoSabe = 'sim' | 'nao' | 'nao_sabe';

export const TIPO_REFLUXO_OPCOES = [
  { valor: 'fisiologico', label: 'Fisiológico' },
  { valor: 'patologico', label: 'Patológico' },
];

export const LOCAL_INTERNACAO_OPCOES = [
  { valor: 'alojamento_conjunto', label: 'Alojamento conjunto' },
  { valor: 'uti_neonatal', label: 'UTI Neonatal' },
  { valor: 'outro', label: 'Outro' },
];

export const PLAGIOCEFALIA_TIPO_OPCOES = [
  { valor: 'aboboda', label: 'Abóboda craniana' },
  { valor: 'base', label: 'Base craniana' },
  { valor: 'mista', label: 'Mista' },
];

export const OUTRAS_ASSIMETRIAS_OPCOES = [
  { valor: 'braquicefalia', label: 'Braquicefalia' },
  { valor: 'escafocefalia', label: 'Escafocefalia' },
  { valor: 'assimetria_facial', label: 'Assimetria facial isolada' },
];

export const REAVALIACAO_OPCOES = [
  { valor: '1_semana', label: '1 semana' },
  { valor: '2_semanas', label: '2 semanas' },
  { valor: '1_mes', label: '1 mês' },
  { valor: 'outro', label: 'Outro' },
];

// Marcos Motores organizados por faixa etária
export const MARCOS_MOTORES: MarcoMotor[] = [
  // 0-2 meses
  {
    id: '0_2_1',
    faixa: '0–2 meses',
    descricao: 'Elevação breve da cabeça em prono',
    idade_min_meses: 0,
    idade_max_meses: 2,
  },
  {
    id: '0_2_2',
    faixa: '0–2 meses',
    descricao: 'Movimentos globais e desorganizados',
    idade_min_meses: 0,
    idade_max_meses: 2,
  },
  {
    id: '0_2_3',
    faixa: '0–2 meses',
    descricao: 'Mãos fechadas na maior parte do tempo',
    idade_min_meses: 0,
    idade_max_meses: 2,
  },
  {
    id: '0_2_4',
    faixa: '0–2 meses',
    descricao:
      'Reflexos primitivos ativos (tônico-cervical, preensão palmar, sucção)',
    idade_min_meses: 0,
    idade_max_meses: 2,
  },

  // 2-3 meses
  {
    id: '2_3_1',
    faixa: '2–3 meses',
    descricao:
      'Controle cervical inicial, sustentando a cabeça por alguns segundos',
    idade_min_meses: 2,
    idade_max_meses: 3,
  },
  {
    id: '2_3_2',
    faixa: '2–3 meses',
    descricao: 'Abertura espontânea das mãos',
    idade_min_meses: 2,
    idade_max_meses: 3,
  },
  {
    id: '2_3_3',
    faixa: '2–3 meses',
    descricao: 'Mãos no centro (linha média)',
    idade_min_meses: 2,
    idade_max_meses: 3,
  },
  {
    id: '2_3_4',
    faixa: '2–3 meses',
    descricao: 'Início do apoio nos antebraços em prono',
    idade_min_meses: 2,
    idade_max_meses: 3,
  },

  // 3-4 meses
  {
    id: '3_4_1',
    faixa: '3–4 meses',
    descricao: 'Sustenta bem a cabeça',
    idade_min_meses: 3,
    idade_max_meses: 4,
  },
  {
    id: '3_4_2',
    faixa: '3–4 meses',
    descricao: 'Maior controle de tronco superior',
    idade_min_meses: 3,
    idade_max_meses: 4,
  },
  {
    id: '3_4_3',
    faixa: '3–4 meses',
    descricao: 'Rolamento acidental (geralmente de prono → supino)',
    idade_min_meses: 3,
    idade_max_meses: 4,
  },
  {
    id: '3_4_4',
    faixa: '3–4 meses',
    descricao: 'Leva objetos à boca',
    idade_min_meses: 3,
    idade_max_meses: 4,
  },
  {
    id: '3_4_5',
    faixa: '3–4 meses',
    descricao: 'Chutes e movimentos mais simétricos',
    idade_min_meses: 3,
    idade_max_meses: 4,
  },

  // 4-5 meses
  {
    id: '4_5_1',
    faixa: '4–5 meses',
    descricao: 'Rolamento de supino → lateral',
    idade_min_meses: 4,
    idade_max_meses: 5,
  },
  {
    id: '4_5_2',
    faixa: '4–5 meses',
    descricao: 'Aumento da estabilidade de tronco',
    idade_min_meses: 4,
    idade_max_meses: 5,
  },
  {
    id: '4_5_3',
    faixa: '4–5 meses',
    descricao: 'Apoio em cotovelos com elevação alta do peito',
    idade_min_meses: 4,
    idade_max_meses: 5,
  },
  {
    id: '4_5_4',
    faixa: '4–5 meses',
    descricao: 'Pega palmar voluntária começa a surgir',
    idade_min_meses: 4,
    idade_max_meses: 5,
  },

  // 5-6 meses
  {
    id: '5_6_1',
    faixa: '5–6 meses',
    descricao: 'Rolamento voluntário em ambos os sentidos',
    idade_min_meses: 5,
    idade_max_meses: 6,
  },
  {
    id: '5_6_2',
    faixa: '5–6 meses',
    descricao: 'Apoio com braços estendidos em prono',
    idade_min_meses: 5,
    idade_max_meses: 6,
  },
  {
    id: '5_6_3',
    faixa: '5–6 meses',
    descricao: 'Sentado com apoio anterior ou lateral',
    idade_min_meses: 5,
    idade_max_meses: 6,
  },
  {
    id: '5_6_4',
    faixa: '5–6 meses',
    descricao: 'Começa a transferir objetos entre as mãos',
    idade_min_meses: 5,
    idade_max_meses: 6,
  },

  // 6-7 meses
  {
    id: '6_7_1',
    faixa: '6–7 meses',
    descricao: 'Senta sem apoio por alguns segundos',
    idade_min_meses: 6,
    idade_max_meses: 7,
  },
  {
    id: '6_7_2',
    faixa: '6–7 meses',
    descricao: 'Pega radial-palmar',
    idade_min_meses: 6,
    idade_max_meses: 7,
  },
  {
    id: '6_7_3',
    faixa: '6–7 meses',
    descricao: 'Movimentos mais coordenados entre mãos',
    idade_min_meses: 6,
    idade_max_meses: 7,
  },
  {
    id: '6_7_4',
    faixa: '6–7 meses',
    descricao: 'Início do pivot no chão (gira sobre o abdômen)',
    idade_min_meses: 6,
    idade_max_meses: 7,
  },

  // 7-8 meses
  {
    id: '7_8_1',
    faixa: '7–8 meses',
    descricao: 'Sentado estável com mãos livres',
    idade_min_meses: 7,
    idade_max_meses: 8,
  },
  {
    id: '7_8_2',
    faixa: '7–8 meses',
    descricao: 'Início do arrastar no chão (exército)',
    idade_min_meses: 7,
    idade_max_meses: 8,
  },
  {
    id: '7_8_3',
    faixa: '7–8 meses',
    descricao: 'Tenta assumir a posição de quatro apoios (gatinhar)',
    idade_min_meses: 7,
    idade_max_meses: 8,
  },
  {
    id: '7_8_4',
    faixa: '7–8 meses',
    descricao: 'Pega radial-digital',
    idade_min_meses: 7,
    idade_max_meses: 8,
  },

  // 8-9 meses
  {
    id: '8_9_1',
    faixa: '8–9 meses',
    descricao: 'Gatinhar em quatro apoios',
    idade_min_meses: 8,
    idade_max_meses: 9,
  },
  {
    id: '8_9_2',
    faixa: '8–9 meses',
    descricao: 'Sentado sólido, com rotações e transições',
    idade_min_meses: 8,
    idade_max_meses: 9,
  },
  {
    id: '8_9_3',
    faixa: '8–9 meses',
    descricao: 'Puxar-se para colocar de pé (pull to stand)',
    idade_min_meses: 8,
    idade_max_meses: 9,
  },
  {
    id: '8_9_4',
    faixa: '8–9 meses',
    descricao: 'Pinça inferior (dedo polegar + lateral do indicador)',
    idade_min_meses: 8,
    idade_max_meses: 9,
  },

  // 9-10 meses
  {
    id: '9_10_1',
    faixa: '9–10 meses',
    descricao: 'Anda apoiado nos móveis (cruising)',
    idade_min_meses: 9,
    idade_max_meses: 10,
  },
  {
    id: '9_10_2',
    faixa: '9–10 meses',
    descricao: 'Fica em pé com apoio firme',
    idade_min_meses: 9,
    idade_max_meses: 10,
  },
  {
    id: '9_10_3',
    faixa: '9–10 meses',
    descricao: 'Agacha com apoio',
    idade_min_meses: 9,
    idade_max_meses: 10,
  },
  {
    id: '9_10_4',
    faixa: '9–10 meses',
    descricao: 'Transições independentes (sentado ↔ quatro apoios ↔ joelhos)',
    idade_min_meses: 9,
    idade_max_meses: 10,
  },

  // 10-12 meses
  {
    id: '10_12_1',
    faixa: '10–12 meses',
    descricao: 'Permanece em pé alguns segundos sem apoio',
    idade_min_meses: 10,
    idade_max_meses: 12,
  },
  {
    id: '10_12_2',
    faixa: '10–12 meses',
    descricao: 'Dá passos com auxílio',
    idade_min_meses: 10,
    idade_max_meses: 12,
  },
  {
    id: '10_12_3',
    faixa: '10–12 meses',
    descricao: 'Pinça superior bem definida',
    idade_min_meses: 10,
    idade_max_meses: 12,
  },
  {
    id: '10_12_4',
    faixa: '10–12 meses',
    descricao:
      'Começa a andar independentemente (variação normal entre 10 e 18 meses)',
    idade_min_meses: 10,
    idade_max_meses: 12,
  },

  // 12-15 meses
  {
    id: '12_15_1',
    faixa: '12–15 meses',
    descricao: 'Anda sozinho',
    idade_min_meses: 12,
    idade_max_meses: 15,
  },
  {
    id: '12_15_2',
    faixa: '12–15 meses',
    descricao: 'Sobe degraus engatinhando',
    idade_min_meses: 12,
    idade_max_meses: 15,
  },
  {
    id: '12_15_3',
    faixa: '12–15 meses',
    descricao: 'Empurra brinquedos com rodas',
    idade_min_meses: 12,
    idade_max_meses: 15,
  },
  {
    id: '12_15_4',
    faixa: '12–15 meses',
    descricao: 'Lança bola sem direção',
    idade_min_meses: 12,
    idade_max_meses: 15,
  },

  // 15-18 meses
  {
    id: '15_18_1',
    faixa: '15–18 meses',
    descricao: 'Corre de forma inicial',
    idade_min_meses: 15,
    idade_max_meses: 18,
  },
  {
    id: '15_18_2',
    faixa: '15–18 meses',
    descricao: 'Sobe degraus com apoio',
    idade_min_meses: 15,
    idade_max_meses: 18,
  },
  {
    id: '15_18_3',
    faixa: '15–18 meses',
    descricao: 'Tira meias e tenta vestir peças simples',
    idade_min_meses: 15,
    idade_max_meses: 18,
  },
  {
    id: '15_18_4',
    faixa: '15–18 meses',
    descricao: 'Senta e levanta sem apoio de mãos',
    idade_min_meses: 15,
    idade_max_meses: 18,
  },

  // 18-24 meses
  {
    id: '18_24_1',
    faixa: '18–24 meses',
    descricao: 'Corre melhor, com menos quedas',
    idade_min_meses: 18,
    idade_max_meses: 24,
  },
  {
    id: '18_24_2',
    faixa: '18–24 meses',
    descricao: 'Chuta bola',
    idade_min_meses: 18,
    idade_max_meses: 24,
  },
  {
    id: '18_24_3',
    faixa: '18–24 meses',
    descricao: 'Sobe e desce degraus com apoio',
    idade_min_meses: 18,
    idade_max_meses: 24,
  },
  {
    id: '18_24_4',
    faixa: '18–24 meses',
    descricao: 'Pula com os dois pés saindo do chão',
    idade_min_meses: 18,
    idade_max_meses: 24,
  },
  {
    id: '18_24_5',
    faixa: '18–24 meses',
    descricao: 'Começa a desenhar rabiscos voluntários',
    idade_min_meses: 18,
    idade_max_meses: 24,
  },

  // 2-3 anos (24-36 meses)
  {
    id: '24_36_1',
    faixa: '2–3 anos',
    descricao: 'Corre com coordenação',
    idade_min_meses: 24,
    idade_max_meses: 36,
  },
  {
    id: '24_36_2',
    faixa: '2–3 anos',
    descricao: 'Sobe escadas alternando pés (para subir)',
    idade_min_meses: 24,
    idade_max_meses: 36,
  },
  {
    id: '24_36_3',
    faixa: '2–3 anos',
    descricao: 'Anda para trás',
    idade_min_meses: 24,
    idade_max_meses: 36,
  },
  {
    id: '24_36_4',
    faixa: '2–3 anos',
    descricao: 'Arremessa e chuta bola com direção',
    idade_min_meses: 24,
    idade_max_meses: 36,
  },
  {
    id: '24_36_5',
    faixa: '2–3 anos',
    descricao: 'Começa a pedalar triciclo',
    idade_min_meses: 24,
    idade_max_meses: 36,
  },

  // 3-4 anos (36-48 meses)
  {
    id: '36_48_1',
    faixa: '3–4 anos',
    descricao: 'Salta de uma altura pequena',
    idade_min_meses: 36,
    idade_max_meses: 48,
  },
  {
    id: '36_48_2',
    faixa: '3–4 anos',
    descricao: 'Equilibra-se em um pé por ~2 segundos',
    idade_min_meses: 36,
    idade_max_meses: 48,
  },
  {
    id: '36_48_3',
    faixa: '3–4 anos',
    descricao: 'Sobe e desce escadas alternando os pés',
    idade_min_meses: 36,
    idade_max_meses: 48,
  },
  {
    id: '36_48_4',
    faixa: '3–4 anos',
    descricao: 'Corre, desvia e muda direção',
    idade_min_meses: 36,
    idade_max_meses: 48,
  },

  // 4-5 anos (48-60 meses)
  {
    id: '48_60_1',
    faixa: '4–5 anos',
    descricao: 'Equilíbrio em um pé por 4–5 segundos',
    idade_min_meses: 48,
    idade_max_meses: 60,
  },
  {
    id: '48_60_2',
    faixa: '4–5 anos',
    descricao: 'Pula em um pé (início da habilidade)',
    idade_min_meses: 48,
    idade_max_meses: 60,
  },
  {
    id: '48_60_3',
    faixa: '4–5 anos',
    descricao: 'Coordena saltos consecutivos',
    idade_min_meses: 48,
    idade_max_meses: 60,
  },
  {
    id: '48_60_4',
    faixa: '4–5 anos',
    descricao: 'Arremesso e recepção de bola mais precisos',
    idade_min_meses: 48,
    idade_max_meses: 60,
  },
  {
    id: '48_60_5',
    faixa: '4–5 anos',
    descricao:
      'Maior destreza fina (corta com tesoura, desenha formas simples)',
    idade_min_meses: 48,
    idade_max_meses: 60,
  },
];
