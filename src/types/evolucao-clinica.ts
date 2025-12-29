// AI dev note: Tipos para Sistema de Evolução Estruturada
// Suporta: Evolução Respiratória e Evolução Motora/Assimetria

// =========================================================================
// TIPOS BASE
// =========================================================================

export type TipoEvolucao = 'respiratoria' | 'motora_assimetria';

export interface EvolucaoSecao {
  id: string;
  titulo: string;
  icone: string;
  campos: string[];
  ordem: number;
}

// =========================================================================
// EVOLUÇÃO RESPIRATÓRIA
// =========================================================================

// AI dev note: QueixaPrincipalRespiratoria foi integrada em EstadoGeralAntes
// para consolidar as informações iniciais em uma única seção

// Ritmo respiratório baseado na frequência
export type RitmoRespiratorio =
  | 'eupneico'
  | 'bradipneico'
  | 'taquipneico'
  | null;

// Classificação clínica derivada automaticamente
export type ClassificacaoClinicaRespiratoria =
  | 'normal' // Eupneico sem dispneia
  | 'taquipneico_sem_dispneia' // FR alta sem sinais de esforço
  | 'dispneico_sem_taquipneia' // Sinais de esforço com FR normal
  | 'taquidispneico' // FR alta + sinais de esforço
  | null;

export interface PadraoRespiratorio {
  tipo: 'nasal' | 'oral' | 'misto' | null;
  ritmo_respiratorio: RitmoRespiratorio; // Eupneico, Bradipneico, Taquipneico
  dispneia: boolean; // Presença de dispneia (sinais de esforço)
  // Classificação automática derivada
  classificacao_clinica?: ClassificacaoClinicaRespiratoria;
}

export interface SinaisDispneia {
  // Só são preenchidos se dispneia = true
  uso_musculatura_acessoria: boolean;
  batimento_asa_nasal: boolean;
  tiragem_intercostal: boolean;
  tiragem_subcostal: boolean;
  tiragem_supraclavicular: boolean;
  retracao_furcula: boolean; // Retração de fúrcula
  gemencia: boolean;
  postura_antalgica: boolean;
  tempo_expiratorio_prolongado: boolean; // Tempo expiratório prolongado
}

// Ausculta Pulmonar por Hemitórax
export interface AuscultaHemitorax {
  // Murmúrio Vesicular (escolha única)
  murmurio_vesicular: 'preservado' | 'diminuido' | 'abolido' | null;

  // Ruídos Adventícios (múltipla escolha)
  ruidos_ausentes?: boolean;
  sibilos?: boolean;
  roncos?: boolean;
  roncos_transmissao?: boolean; // Roncos de Transmissão
  estertores_finos?: boolean;
  estertores_grossos?: boolean;

  // Localização dos Ruídos (múltipla escolha)
  localizacao_difusos?: boolean;
  localizacao_apice?: boolean;
  localizacao_terco_medio?: boolean;
  localizacao_base?: boolean;
}

export interface AuscultaPulmonar {
  // Hemitórax Direito
  hemitorax_direito: AuscultaHemitorax;
  // Hemitórax Esquerdo
  hemitorax_esquerdo: AuscultaHemitorax;
  // Observações gerais
  observacoes?: string;
}

export interface SecrecaoRespiratoria {
  presente: boolean;
  caracteristica?: 'fluida' | 'espessa' | null;
  cor?: 'clara' | 'amarelada' | 'esverdeada' | null;
  mobilizavel?: boolean;
}

// AI dev note: temperatura_aferida e saturacao_o2 movidos para EstadoGeralAntes
// AI dev note: secrecao removida - agora está em EstadoGeralAntes (via tosse produtiva)
export interface AvaliacaoRespiratoriaAntes {
  padrao_respiratorio: PadraoRespiratorio;
  sinais_dispneia: SinaisDispneia; // Sinais de esforço respiratório (só se dispneia = true)
  ausculta: AuscultaPulmonar;
}

// Avaliação Inicial (Antes) - Ordem: Estado Geral > Sinais Vitais > Contexto > Repercussões > Sinais > Sintomas
export interface EstadoGeralAntes {
  // 1️⃣ Estado Geral da Criança
  // Nível de Consciência: Acordado, Sonolento, Dormindo
  nivel_consciencia?: 'acordado' | 'sonolento' | 'dormindo' | null;
  // Se acordado: Ativo ou Hipoativo
  estado_acordado?: 'ativo' | 'hipoativo' | null;

  // Comportamento/Reação (múltipla escolha)
  comportamento_calmo?: boolean;
  comportamento_irritado?: boolean;
  comportamento_choroso?: boolean;
  comportamento_agitado?: boolean;

  // 2️⃣ Sinais Vitais
  temperatura_aferida?: number; // em graus Celsius
  frequencia_cardiaca?: number; // bpm
  saturacao_o2?: number; // percentual em ar ambiente
  necessita_suporte_o2?: boolean; // Se necessita de suporte de O2
  saturacao_com_suporte?: number; // percentual com suporte O2 (só se necessita_suporte_o2 = true)

  // 3️⃣ Contexto Clínico Recente (múltipla escolha)
  infeccao_recente?: boolean;
  episodios_recorrentes_sibilancia?: boolean;
  contato_pessoas_sintomaticas?: boolean; // Contato recente com pessoas sintomáticas
  uso_medicacao_respiratoria?: boolean;
  inicio_sintomas_dias?: number; // Início dos sintomas há X dias

  // Quadro Compatível Com (múltipla escolha)
  quadro_compativel_com?: string[];

  // Origem da Informação do Quadro (múltipla escolha)
  origem_informacao_quadro?: string[];

  // 4️⃣ Repercussões Funcionais (múltipla escolha)
  dificuldade_alimentar?: boolean;
  interrupcoes_sono?: boolean;
  piora_noturna?: boolean;
  irritabilidade_respiratoria?: boolean; // Irritabilidade associada à respiração

  // 5️⃣ Sinais Associados - Relato do Responsável (múltipla escolha)
  chiado_referido?: boolean; // Sibilo referido pelos responsáveis (não auscultatório)
  cansaco_respiratorio?: boolean;
  esforco_respiratorio?: boolean; // Esforço respiratório percebido
  respiracao_ruidosa?: boolean;
  tosse_seca_referida?: boolean; // Tosse seca referida pelo responsável
  tosse_produtiva_referida?: boolean; // Tosse produtiva referida pelo responsável

  // 6️⃣ Sintomas Respiratórios - Tosse
  tosse?: 'ausente' | 'seca' | 'produtiva' | null;
  // Se produtiva: eficácia
  tosse_eficacia?: 'eficaz' | 'ineficaz' | null;
  // Se eficaz: destino da secreção
  tosse_destino?: 'degluticao' | 'expectoracao' | null;
  // Se expectoração: cor e quantidade
  secrecao_cor?: 'clara' | 'amarelada' | 'esverdeada' | null;
  secrecao_quantidade?: 'pouca' | 'moderada' | 'abundante' | null;

  observacoes?: string;
}

export interface IntervencaoRespiratoria {
  // Técnicas de desobstrução brônquica
  afe: boolean; // Aumento do Fluxo Expiratório
  vibrocompressao: boolean;
  expiração_lenta_prolongada: boolean;
  rta: boolean; // Reequilíbrio Toracoabdominal
  epap: boolean; // EPAP
  epap_selo_dagua: boolean; // EPAP selo d'água
  redirecionamento_fluxo: boolean;
  peep_valor?: number; // Valor da PEEP quando usa EPAP
  posicionamentos_terapeuticos: boolean;
  estimulo_tosse: boolean;
  nebulizacao: boolean;

  // Aspiração
  aspiracao: boolean;
  aspiracao_tipo?: 'invasiva' | 'nao_invasiva' | 'ambas' | null;
  aspiracao_quantidade?: 'pouca' | 'moderada' | 'abundante' | null;
  aspiracao_consistencia?: 'fluida' | 'espessa' | null;
  aspiracao_aspecto?: 'clara' | 'amarelada' | 'esverdeada' | 'purulenta' | null;
  aspiracao_sangramento?: 'nao' | 'rajas_sangue' | 'sangramento_ativo' | null;

  observacoes?: string;
}

export interface AvaliacaoRespiratoriaDepois {
  // Tolerância e Choro (movidos para após sessão)
  tolerancia_manuseio: 'boa' | 'regular' | 'ruim' | null;
  choro_durante_atendimento: 'ausente' | 'leve' | 'moderado' | 'intenso' | null;

  melhora_padrao_respiratorio: boolean;
  // Mudança na Ausculta - opções selecionáveis
  ausculta_sem_alteracao: boolean; // Ausculta igual, sem melhora nem piora
  ausculta_melhorou: boolean;
  ausculta_reducao_roncos: boolean;
  ausculta_reducao_sibilos: boolean;
  ausculta_reducao_estertores: boolean;
  ausculta_melhora_mv: boolean; // Melhora do Murmúrio Vesicular
  eliminacao_secrecao: boolean;
  reducao_desconforto: boolean;
  // Sinais Vitais Após
  saturacao_o2?: number;
  frequencia_cardiaca?: number; // FC após intervenção
  comportamento_crianca?:
    | 'calmo'
    | 'sonolento'
    | 'irritado'
    | 'choroso'
    | 'sem_mudanca'
    | null;
  observacoes?: string;
}

export interface OrientacoesRespiratoria {
  // Higiene Nasal
  higiene_nasal: boolean;
  higiene_nasal_tecnica_demonstrada?: boolean;
  higiene_nasal_frequencia_orientada?: boolean;

  // Posicionamento para Dormir e Repouso
  posicionamento_dormir: boolean;
  posicionamento_cabeca_elevada?: boolean;
  posicionamento_alternancia_decubitos?: boolean;
  posicionamento_prono?: boolean; // Posição prona
  posicionamento_decubito_lateral_direito?: boolean;
  posicionamento_decubito_lateral_esquerdo?: boolean;

  // Sinais de Alerta
  sinais_alerta: boolean;
  sinais_alerta_esforco_respiratorio?: boolean;
  sinais_alerta_piora_tosse_chiado?: boolean;
  sinais_alerta_queda_saturacao?: boolean;
  sinais_alerta_piora_diurese?: boolean; // Piora da diurese
  sinais_alerta_febre?: boolean; // Febre
  sinais_alerta_prostracao?: boolean; // Prostração

  outras?: string;
}

export interface CondutaRespiratoria {
  manter_fisioterapia: boolean;
  frequencia_sugerida?:
    | 'diaria'
    | '2x_semana'
    | '3x_semana'
    | 'semanal'
    | 'quinzenal'
    | 'mensal'
    | null;
  reavaliacao_dias?: number;
  encaminhamento_medico: boolean;
  especialista_encaminhamento?: string;
  motivo_encaminhamento?: string;
  alta_parcial: boolean;
  alta: boolean; // Alta completa do tratamento
  observacoes?: string;
}

export interface EvolucaoRespiratoria {
  estado_geral_antes: EstadoGeralAntes; // Consolidado: Queixa Principal + Sinais Vitais + Estado Geral + Saturação
  avaliacao_antes: AvaliacaoRespiratoriaAntes;
  intervencao: IntervencaoRespiratoria;
  avaliacao_depois: AvaliacaoRespiratoriaDepois;
  orientacoes: OrientacoesRespiratoria;
  conduta: CondutaRespiratoria;
}

// =========================================================================
// EVOLUÇÃO MOTORA / ASSIMETRIA CRANIANA
// =========================================================================

export interface CraniometriaEvolucao {
  diagonal_a_mm?: number;
  diagonal_b_mm?: number;
  comprimento_ap_mm?: number;
  largura_ml_mm?: number;
  perimetro_cefalico_cm?: number;
  // Métricas calculadas automaticamente
  cva_mm?: number;
  cvai_percentual?: number;
  ci_percentual?: number;
  plagiocefalia_severidade?: string;
  braquicefalia_severidade?: string;
}

export interface GoniometriaEvolucao {
  rotacao_ativa_direita?: number;
  rotacao_ativa_esquerda?: number;
  rotacao_passiva_direita?: number;
  rotacao_passiva_esquerda?: number;
  inclinacao_ativa_direita?: number;
  inclinacao_ativa_esquerda?: number;
  inclinacao_passiva_direita?: number;
  inclinacao_passiva_esquerda?: number;
  diferencial_rotacao?: number; // calculado
  diferencial_inclinacao?: number; // calculado
  observacoes?: string;
}

export interface PalpacaoECOMEvolucao {
  ecom_direito_tonus?: 'normal' | 'tenso' | 'tenso_corda' | null;
  ecom_esquerdo_tonus?: 'normal' | 'tenso' | 'tenso_corda' | null;
  nodulo_direito?: boolean;
  nodulo_esquerdo?: boolean;
  nodulo_tamanho?: 'menor_1cm' | '1_3cm' | 'maior_3cm' | null;
  nodulo_localizacao?:
    | 'terco_inferior'
    | 'terco_medio'
    | 'terco_superior'
    | null;
  observacoes?: string;
}

export interface ControleMotorEvolucao {
  supino_linha_media?: 'mantem_firme' | 'cai_preferencia' | 'instavel' | null;
  supino_alcance?: 'maos_joelhos' | 'maos_boca' | 'maos_ar' | 'ausente' | null;
  prono_tolerancia?: 'boa' | 'chora_imediato' | 'cansa_rapido' | null;
  prono_carga_peso?: 'cotovelos' | 'maos_estendidas' | 'nao_levanta' | null;
  prono_controle_cabeca?: '45_graus' | '90_graus' | 'oscila' | null;
  observacoes?: string;
}

export interface IntervencaoMotoraAssimetria {
  alongamentos: boolean;
  fortalecimento: boolean;
  estimulacao_sensorial: boolean;
  posicionamentos_terapeuticos: boolean;
  tummy_time: boolean;
  bandagem_kinesio: boolean;
  orientacao_pais: boolean;
  outras_tecnicas?: string;
  observacoes?: string;
}

export interface RespostaIntervencaoMotora {
  melhora_adm?: boolean;
  reducao_preferencia_postural?: boolean;
  melhora_controle_cervical?: boolean;
  tolerancia_prono_melhorou?: boolean;
  pais_seguindo_orientacoes?: boolean;
  observacoes?: string;
}

export interface OrientacoesMotoraAssimetria {
  posicionamento_sono: boolean;
  tummy_time_frequencia?: string;
  exercicios_domiciliares: boolean;
  sinais_alerta: boolean;
  uso_capacete?: boolean;
  outras?: string;
}

export interface CondutaMotoraAssimetria {
  manter_fisioterapia: boolean;
  frequencia_sugerida?:
    | 'diaria'
    | '2x_semana'
    | '3x_semana'
    | 'semanal'
    | 'quinzenal'
    | null;
  reavaliacao_dias?: number;
  encaminhamento_medico: boolean;
  indicacao_capacete?: boolean;
  motivo_encaminhamento?: string;
  observacoes?: string;
}

export interface EvolucaoMotoraAssimetria {
  craniometria?: CraniometriaEvolucao;
  goniometria?: GoniometriaEvolucao;
  palpacao?: PalpacaoECOMEvolucao;
  controle_motor?: ControleMotorEvolucao;
  intervencao: IntervencaoMotoraAssimetria;
  resposta: RespostaIntervencaoMotora;
  orientacoes: OrientacoesMotoraAssimetria;
  conduta: CondutaMotoraAssimetria;
}

// =========================================================================
// INTERFACE COMPLETA DA EVOLUÇÃO
// =========================================================================

export interface EvolucaoClinica {
  id: string;
  id_agendamento: string;
  tipo_relatorio_id: string;
  tipo_evolucao: TipoEvolucao;

  // Dados estruturados
  evolucao_respiratoria?: EvolucaoRespiratoria;
  evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;

  // Texto livre (mantido para compatibilidade)
  conteudo?: string;
  pdf_url?: string;

  // Auditoria
  criado_por?: string;
  atualizado_por?: string;
  created_at: string;
  updated_at: string;
}

// =========================================================================
// SEÇÕES DA EVOLUÇÃO
// =========================================================================

export const EVOLUCAO_RESPIRATORIA_SECOES: EvolucaoSecao[] = [
  {
    id: 'estado_geral_antes',
    titulo: 'Avaliação Inicial (Antes)',
    icone: '👶',
    campos: [
      'queixa_principal', // Tosse, chiado, cansaço, secreção
      'sinais_vitais', // Temperatura
      'estado_crianca', // Nível de alerta, tolerância
      'saturacao', // SpO2
    ],
    ordem: 1,
  },
  {
    id: 'avaliacao_antes',
    titulo: 'Avaliação Respiratória (Antes)',
    icone: '🫁',
    campos: ['padrao_respiratorio', 'sinais_dispneia', 'ausculta', 'secrecao'],
    ordem: 2,
  },
  {
    id: 'intervencao',
    titulo: 'Intervenção Realizada',
    icone: '🩺',
    campos: [
      'tecnicas_desobstrucao',
      'posicionamentos',
      'aspiracao',
      'nebulizacao',
    ],
    ordem: 3,
  },
  {
    id: 'avaliacao_depois',
    titulo: 'Resposta ao Tratamento (Depois)',
    icone: '📈',
    campos: ['melhora_padrao', 'ausculta', 'secrecao_eliminada', 'saturacao'],
    ordem: 4,
  },
  {
    id: 'orientacoes',
    titulo: 'Orientações aos Responsáveis',
    icone: '📝',
    campos: ['higiene_nasal', 'posicionamento', 'sinais_alerta', 'cuidados'],
    ordem: 5,
  },
  {
    id: 'conduta',
    titulo: 'Conduta e Plano',
    icone: '✅',
    campos: ['frequencia', 'reavaliacao', 'encaminhamento', 'alta'],
    ordem: 6,
  },
];

export const EVOLUCAO_MOTORA_ASSIMETRIA_SECOES: EvolucaoSecao[] = [
  {
    id: 'craniometria',
    titulo: 'Medidas Craniométricas',
    icone: '📐',
    campos: ['diagonais', 'comprimento', 'largura', 'perimetro'],
    ordem: 1,
  },
  {
    id: 'goniometria',
    titulo: 'Goniometria Cervical',
    icone: '📏',
    campos: ['rotacao', 'inclinacao', 'diferencial'],
    ordem: 2,
  },
  {
    id: 'palpacao',
    titulo: 'Palpação ECOM',
    icone: '👋',
    campos: ['tonus', 'nodulo'],
    ordem: 3,
  },
  {
    id: 'controle_motor',
    titulo: 'Controle Motor',
    icone: '🏋️',
    campos: ['supino', 'prono'],
    ordem: 4,
  },
  {
    id: 'intervencao',
    titulo: 'Intervenção Realizada',
    icone: '🩺',
    campos: ['alongamentos', 'fortalecimento', 'estimulacao', 'tummy_time'],
    ordem: 5,
  },
  {
    id: 'resposta',
    titulo: 'Resposta ao Tratamento',
    icone: '📈',
    campos: ['melhora_adm', 'controle_cervical', 'tolerancia_prono'],
    ordem: 6,
  },
  {
    id: 'orientacoes',
    titulo: 'Orientações aos Responsáveis',
    icone: '📝',
    campos: ['posicionamento', 'tummy_time', 'exercicios'],
    ordem: 7,
  },
  {
    id: 'conduta',
    titulo: 'Conduta e Plano',
    icone: '✅',
    campos: ['frequencia', 'reavaliacao', 'encaminhamento', 'capacete'],
    ordem: 8,
  },
];

// =========================================================================
// FUNÇÕES UTILITÁRIAS
// =========================================================================

/**
 * Cria um objeto vazio de evolução respiratória
 */
export function criarEvolucaoRespiratoriaVazia(): EvolucaoRespiratoria {
  return {
    estado_geral_antes: {
      // 1️⃣ Estado Geral da Criança
      nivel_consciencia: null, // acordado, sonolento, dormindo
      estado_acordado: null, // ativo, hipoativo (se acordado)
      comportamento_calmo: false,
      comportamento_irritado: false,
      comportamento_choroso: false,
      comportamento_agitado: false,
      // 2️⃣ Sinais Vitais
      temperatura_aferida: undefined,
      frequencia_cardiaca: undefined,
      saturacao_o2: undefined,
      necessita_suporte_o2: false,
      saturacao_com_suporte: undefined,
      // 3️⃣ Contexto Clínico
      infeccao_recente: false,
      episodios_recorrentes_sibilancia: false,
      contato_pessoas_sintomaticas: false,
      uso_medicacao_respiratoria: false,
      inicio_sintomas_dias: undefined,
      quadro_compativel_com: [],
      origem_informacao_quadro: [],
      // 4️⃣ Repercussões Funcionais
      dificuldade_alimentar: false,
      interrupcoes_sono: false,
      piora_noturna: false,
      irritabilidade_respiratoria: false,
      // 5️⃣ Sinais Associados
      chiado_referido: false,
      cansaco_respiratorio: false,
      esforco_respiratorio: false,
      respiracao_ruidosa: false,
      // 6️⃣ Sintomas Respiratórios - Tosse
      tosse: null,
      tosse_eficacia: null,
      tosse_destino: null,
      secrecao_cor: null,
      secrecao_quantidade: null,
    },
    avaliacao_antes: {
      padrao_respiratorio: {
        tipo: null,
        ritmo_respiratorio: null,
        dispneia: false,
        classificacao_clinica: null,
      },
      sinais_dispneia: {
        uso_musculatura_acessoria: false,
        batimento_asa_nasal: false,
        tiragem_intercostal: false,
        tiragem_subcostal: false,
        tiragem_supraclavicular: false,
        retracao_furcula: false,
        gemencia: false,
        postura_antalgica: false,
        tempo_expiratorio_prolongado: false,
      },
      ausculta: {
        hemitorax_direito: {
          murmurio_vesicular: null,
          ruidos_ausentes: false,
          sibilos: false,
          roncos: false,
          estertores_finos: false,
          estertores_grossos: false,
          localizacao_difusos: false,
          localizacao_apice: false,
          localizacao_terco_medio: false,
          localizacao_base: false,
        },
        hemitorax_esquerdo: {
          murmurio_vesicular: null,
          ruidos_ausentes: false,
          sibilos: false,
          roncos: false,
          estertores_finos: false,
          estertores_grossos: false,
          localizacao_difusos: false,
          localizacao_apice: false,
          localizacao_terco_medio: false,
          localizacao_base: false,
        },
      },
    },
    intervencao: {
      afe: false,
      vibrocompressao: false,
      expiração_lenta_prolongada: false,
      rta: false,
      epap: false,
      epap_selo_dagua: false,
      redirecionamento_fluxo: false,
      posicionamentos_terapeuticos: false,
      estimulo_tosse: false,
      nebulizacao: false,
      aspiracao: false,
    },
    avaliacao_depois: {
      tolerancia_manuseio: null,
      choro_durante_atendimento: null,
      melhora_padrao_respiratorio: false,
      ausculta_sem_alteracao: false,
      ausculta_melhorou: false,
      ausculta_reducao_roncos: false,
      ausculta_reducao_sibilos: false,
      ausculta_reducao_estertores: false,
      ausculta_melhora_mv: false,
      eliminacao_secrecao: false,
      reducao_desconforto: false,
      frequencia_cardiaca: undefined,
    },
    orientacoes: {
      higiene_nasal: false,
      posicionamento_dormir: false,
      sinais_alerta: false,
    },
    conduta: {
      manter_fisioterapia: true,
      frequencia_sugerida: null,
      encaminhamento_medico: false,
      alta_parcial: false,
      alta: false,
    },
  };
}

/**
 * Cria um objeto vazio de evolução motora/assimetria
 */
export function criarEvolucaoMotoraAssimetriaVazia(): EvolucaoMotoraAssimetria {
  return {
    craniometria: {},
    goniometria: {},
    palpacao: {},
    controle_motor: {},
    intervencao: {
      alongamentos: false,
      fortalecimento: false,
      estimulacao_sensorial: false,
      posicionamentos_terapeuticos: false,
      tummy_time: false,
      bandagem_kinesio: false,
      orientacao_pais: false,
    },
    resposta: {},
    orientacoes: {
      posicionamento_sono: false,
      exercicios_domiciliares: false,
      sinais_alerta: false,
    },
    conduta: {
      manter_fisioterapia: true,
      frequencia_sugerida: null,
      encaminhamento_medico: false,
    },
  };
}

/**
 * Calcula métricas craniométricas automaticamente
 */
export function calcularMetricasCraniometriaEvolucao(
  medidas: CraniometriaEvolucao
): CraniometriaEvolucao {
  const resultado = { ...medidas };

  // CVA = |Diagonal A - Diagonal B|
  if (medidas.diagonal_a_mm && medidas.diagonal_b_mm) {
    resultado.cva_mm = Math.abs(medidas.diagonal_a_mm - medidas.diagonal_b_mm);

    // CVAI = (CVA / Maior Diagonal) * 100
    const maiorDiagonal = Math.max(
      medidas.diagonal_a_mm,
      medidas.diagonal_b_mm
    );
    resultado.cvai_percentual = (resultado.cva_mm / maiorDiagonal) * 100;

    // Classificação Plagiocefalia
    if (resultado.cvai_percentual < 3.5) {
      resultado.plagiocefalia_severidade = 'normal';
    } else if (resultado.cvai_percentual < 6.25) {
      resultado.plagiocefalia_severidade = 'leve';
    } else if (resultado.cvai_percentual < 8.75) {
      resultado.plagiocefalia_severidade = 'moderada';
    } else if (resultado.cvai_percentual < 11) {
      resultado.plagiocefalia_severidade = 'severa';
    } else {
      resultado.plagiocefalia_severidade = 'muito_severa';
    }
  }

  // CI = (Largura / Comprimento) * 100
  if (medidas.largura_ml_mm && medidas.comprimento_ap_mm) {
    resultado.ci_percentual =
      (medidas.largura_ml_mm / medidas.comprimento_ap_mm) * 100;

    // Classificação Braquicefalia/Escafocefalia
    if (resultado.ci_percentual < 75) {
      resultado.braquicefalia_severidade = 'escafocefalia';
    } else if (resultado.ci_percentual <= 85) {
      resultado.braquicefalia_severidade = 'normal';
    } else if (resultado.ci_percentual <= 90) {
      resultado.braquicefalia_severidade = 'braquicefalia_leve';
    } else if (resultado.ci_percentual <= 100) {
      resultado.braquicefalia_severidade = 'braquicefalia_moderada';
    } else {
      resultado.braquicefalia_severidade = 'braquicefalia_severa';
    }
  }

  return resultado;
}

/**
 * Calcula a classificação clínica respiratória automaticamente
 * Baseado no ritmo (taquipneico) e presença de dispneia (sinais de esforço)
 *
 * Regras:
 * - Taquipneia = frequência elevada
 * - Dispneia = sinais de esforço (tiragens, batimento asa nasal, etc.)
 * - Taquidispneia = frequência + esforço
 */
export function calcularClassificacaoClinica(
  ritmo: RitmoRespiratorio,
  dispneia: boolean
): ClassificacaoClinicaRespiratoria {
  if (!ritmo) return null;

  const isTaquipneico = ritmo === 'taquipneico';

  if (isTaquipneico && dispneia) {
    return 'taquidispneico'; // FR alta + sinais de esforço
  } else if (isTaquipneico && !dispneia) {
    return 'taquipneico_sem_dispneia'; // FR alta sem sinais de esforço
  } else if (!isTaquipneico && dispneia) {
    return 'dispneico_sem_taquipneia'; // Sinais de esforço com FR normal
  } else {
    return 'normal'; // Eupneico ou Bradipneico sem dispneia
  }
}

/**
 * Gera texto descritivo da classificação para uso em relatórios
 */
export function getTextoClassificacaoClinica(
  classificacao: ClassificacaoClinicaRespiratoria
): string {
  switch (classificacao) {
    case 'taquidispneico':
      return 'Criança apresenta taquipneia associada a sinais de desconforto respiratório, caracterizando quadro de taquidispneia no momento da avaliação.';
    case 'taquipneico_sem_dispneia':
      return 'Criança taquipneica, sem sinais clínicos de dispneia no momento.';
    case 'dispneico_sem_taquipneia':
      return 'Criança apresenta sinais de esforço respiratório (dispneia), porém com frequência respiratória dentro da normalidade.';
    case 'normal':
      return 'Criança sem sinais de alteração respiratória no momento da avaliação.';
    default:
      return '';
  }
}

/**
 * Verifica se uma seção está completa
 */
export function verificarSecaoEvolucaoCompleta(
  tipoEvolucao: TipoEvolucao,
  secaoId: string,
  dados: EvolucaoRespiratoria | EvolucaoMotoraAssimetria | null
): 'completo' | 'parcial' | 'vazio' {
  if (!dados) return 'vazio';

  // Lógica específica por tipo e seção
  if (tipoEvolucao === 'respiratoria') {
    const evolucao = dados as EvolucaoRespiratoria;

    switch (secaoId) {
      case 'estado_geral_antes': {
        const e = evolucao.estado_geral_antes;
        // 1. Estado Geral da Criança - obrigatório (nível de consciência)
        const temEstadoGeral = !!e.nivel_consciencia;
        // 2. Sinais Vitais - SpO2 é importante
        const temSinaisVitais = e.saturacao_o2 !== undefined;
        // 3. Contexto ou Sintomas preenchidos
        const temContextoOuSintomas =
          e.tosse ||
          e.chiado_referido ||
          e.cansaco_respiratorio ||
          e.infeccao_recente ||
          e.inicio_sintomas_dias;

        if (temEstadoGeral && temSinaisVitais) return 'completo';
        if (temEstadoGeral || temSinaisVitais || temContextoOuSintomas)
          return 'parcial';
        return 'vazio';
      }
      case 'avaliacao_antes': {
        const a = evolucao.avaliacao_antes;
        const temPadrao = a.padrao_respiratorio?.tipo;
        const temAuscultaD = a.ausculta?.hemitorax_direito?.murmurio_vesicular;
        const temAuscultaE = a.ausculta?.hemitorax_esquerdo?.murmurio_vesicular;
        const temAusculta = temAuscultaD || temAuscultaE;
        if (temPadrao && temAusculta) return 'completo';
        if (temPadrao || temAusculta) return 'parcial';
        return 'vazio';
      }
      case 'intervencao': {
        const i = evolucao.intervencao;
        const temTecnica =
          i.afe ||
          i.vibrocompressao ||
          i.expiração_lenta_prolongada ||
          i.rta ||
          i.epap ||
          i.epap_selo_dagua ||
          i.redirecionamento_fluxo ||
          i.posicionamentos_terapeuticos ||
          i.estimulo_tosse ||
          i.aspiracao ||
          i.nebulizacao;
        return temTecnica ? 'completo' : 'vazio';
      }
      case 'avaliacao_depois': {
        const d = evolucao.avaliacao_depois;
        const temResposta =
          d.melhora_padrao_respiratorio !== undefined ||
          d.eliminacao_secrecao !== undefined ||
          d.reducao_desconforto !== undefined;
        return temResposta ? 'completo' : 'vazio';
      }
      case 'orientacoes': {
        const o = evolucao.orientacoes;
        const temOrientacao =
          o.higiene_nasal || o.posicionamento_dormir || o.sinais_alerta;
        return temOrientacao ? 'completo' : 'vazio';
      }
      case 'conduta': {
        const c = evolucao.conduta;
        return c.manter_fisioterapia !== undefined ? 'completo' : 'vazio';
      }
    }
  }

  return 'vazio';
}

/**
 * Mapeia tipo de serviço para tipo de evolução
 */
export function getTipoEvolucaoPorServico(
  nomeServico: string
): TipoEvolucao | null {
  const nomeLower = nomeServico.toLowerCase();

  if (
    nomeLower.includes('respira') ||
    nomeLower.includes('pulmonar') ||
    nomeLower.includes('bronqu') ||
    nomeLower.includes('pneumo')
  ) {
    return 'respiratoria';
  }

  if (
    nomeLower.includes('motor') ||
    nomeLower.includes('torcicolo') ||
    nomeLower.includes('assimetria') ||
    nomeLower.includes('crân') ||
    nomeLower.includes('cervic') ||
    nomeLower.includes('plagio')
  ) {
    return 'motora_assimetria';
  }

  return null;
}
