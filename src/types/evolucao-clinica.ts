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

export interface QueixaPrincipalRespiratoria {
  tosse?: 'seca' | 'produtiva' | null;
  chiado?: boolean;
  cansaco_respiratorio?: boolean;
  secrecao_cor?: 'clara' | 'amarelada' | 'esverdeada' | null;
  secrecao_quantidade?: 'pouca' | 'moderada' | 'abundante' | null;
  dificuldade_alimentar?: boolean;
  piora_noturna?: boolean;
  infeccao_recente?: boolean;
  episodios_recentes?: string;
  observacoes?: string;
}

export interface PadraoRespiratorio {
  tipo: 'nasal' | 'oral' | 'misto' | null;
  ritmo: 'regular' | 'irregular' | null;
  taquipneia: boolean;
  uso_musculatura_acessoria: boolean;
}

export interface SinaisDesconforto {
  batimento_asa_nasal: boolean;
  tiragem_intercostal: boolean;
  tiragem_subcostal: boolean;
  tiragem_supraclavicular: boolean;
  gemencia: boolean;
  postura_antalgica: boolean;
}

export interface AuscultaPulmonar {
  murmurio_vesicular: 'preservado' | 'diminuido' | 'abolido' | null;
  sibilos: boolean;
  roncos: boolean;
  estertores: 'ausente' | 'finos' | 'grossos' | null;
  lateralidade?: string; // ex: "base direita", "ápice esquerdo"
  observacoes?: string;
}

export interface SecrecaoRespiratoria {
  presente: boolean;
  caracteristica?: 'fluida' | 'espessa' | null;
  cor?: 'clara' | 'amarelada' | 'esverdeada' | null;
  mobilizavel?: boolean;
}

export interface AvaliacaoRespiratoriaAntes {
  padrao_respiratorio: PadraoRespiratorio;
  sinais_desconforto: SinaisDesconforto;
  ausculta: AuscultaPulmonar;
  secrecao: SecrecaoRespiratoria;
  saturacao_o2?: number; // percentual em ar ambiente
  saturacao_com_suporte?: number; // percentual com suporte O2
}

export interface EstadoGeralCrianca {
  nivel_alerta: 'ativo' | 'sonolento' | 'irritado' | null;
  tolerancia_manuseio: 'boa' | 'regular' | 'ruim' | null;
  choro_durante_atendimento: boolean;
  interferencia_sono?: boolean;
  interferencia_alimentacao?: boolean;
  observacoes?: string;
}

export interface IntervencaoRespiratoria {
  // Técnicas de desobstrução brônquica
  afe: boolean; // Aumento do Fluxo Expiratório
  drr: boolean; // Drenagem Rítmica Respiratória
  vibrocompressao: boolean;
  expiração_lenta_prolongada: boolean;
  // Outras técnicas
  posicionamentos_terapeuticos: boolean;
  estimulo_tosse: boolean;
  aspiracao: boolean;
  nebulizacao: boolean;
  // Descrição livre
  outras_tecnicas?: string;
  observacoes?: string;
}

export interface AvaliacaoRespiratoriaDepois {
  melhora_padrao_respiratorio: boolean;
  mudanca_ausculta?: string;
  eliminacao_secrecao: boolean;
  quantidade_secrecao_eliminada?: 'pouca' | 'moderada' | 'abundante' | null;
  reducao_desconforto: boolean;
  saturacao_o2?: number;
  comportamento_crianca?:
    | 'calmo'
    | 'sonolento'
    | 'irritado'
    | 'sem_mudanca'
    | null;
  observacoes?: string;
}

export interface OrientacoesRespiratoria {
  higiene_nasal: boolean;
  posicionamento_dormir: boolean;
  sinais_alerta: boolean;
  frequencia_sessoes?: string;
  cuidados_domiciliares?: string;
  outras?: string;
}

export interface CondutaRespiratoria {
  manter_fisioterapia: boolean;
  frequencia_sugerida?: 'diaria' | '2x_semana' | '3x_semana' | 'semanal' | null;
  reavaliacao_dias?: number;
  encaminhamento_medico: boolean;
  motivo_encaminhamento?: string;
  alta_parcial: boolean;
  observacoes?: string;
}

export interface EvolucaoRespiratoria {
  queixa_principal: QueixaPrincipalRespiratoria;
  avaliacao_antes: AvaliacaoRespiratoriaAntes;
  estado_geral: EstadoGeralCrianca;
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
    id: 'queixa',
    titulo: 'Queixa Principal',
    icone: '💬',
    campos: [
      'tosse',
      'chiado',
      'cansaco_respiratorio',
      'secrecao',
      'piora_noturna',
    ],
    ordem: 1,
  },
  {
    id: 'avaliacao_antes',
    titulo: 'Avaliação Respiratória (Antes)',
    icone: '🫁',
    campos: [
      'padrao_respiratorio',
      'sinais_desconforto',
      'ausculta',
      'secrecao',
      'saturacao',
    ],
    ordem: 2,
  },
  {
    id: 'estado_geral',
    titulo: 'Estado Geral',
    icone: '👶',
    campos: [
      'nivel_alerta',
      'tolerancia_manuseio',
      'choro',
      'sono_alimentacao',
    ],
    ordem: 3,
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
    ordem: 4,
  },
  {
    id: 'avaliacao_depois',
    titulo: 'Resposta ao Tratamento (Depois)',
    icone: '📈',
    campos: ['melhora_padrao', 'ausculta', 'secrecao_eliminada', 'saturacao'],
    ordem: 5,
  },
  {
    id: 'orientacoes',
    titulo: 'Orientações aos Responsáveis',
    icone: '📝',
    campos: ['higiene_nasal', 'posicionamento', 'sinais_alerta', 'cuidados'],
    ordem: 6,
  },
  {
    id: 'conduta',
    titulo: 'Conduta e Plano',
    icone: '✅',
    campos: ['frequencia', 'reavaliacao', 'encaminhamento', 'alta'],
    ordem: 7,
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
    queixa_principal: {
      tosse: null,
      chiado: false,
      cansaco_respiratorio: false,
      secrecao_cor: null,
      secrecao_quantidade: null,
      dificuldade_alimentar: false,
      piora_noturna: false,
      infeccao_recente: false,
    },
    avaliacao_antes: {
      padrao_respiratorio: {
        tipo: null,
        ritmo: null,
        taquipneia: false,
        uso_musculatura_acessoria: false,
      },
      sinais_desconforto: {
        batimento_asa_nasal: false,
        tiragem_intercostal: false,
        tiragem_subcostal: false,
        tiragem_supraclavicular: false,
        gemencia: false,
        postura_antalgica: false,
      },
      ausculta: {
        murmurio_vesicular: null,
        sibilos: false,
        roncos: false,
        estertores: null,
      },
      secrecao: {
        presente: false,
        caracteristica: null,
        cor: null,
        mobilizavel: false,
      },
    },
    estado_geral: {
      nivel_alerta: null,
      tolerancia_manuseio: null,
      choro_durante_atendimento: false,
    },
    intervencao: {
      afe: false,
      drr: false,
      vibrocompressao: false,
      expiração_lenta_prolongada: false,
      posicionamentos_terapeuticos: false,
      estimulo_tosse: false,
      aspiracao: false,
      nebulizacao: false,
    },
    avaliacao_depois: {
      melhora_padrao_respiratorio: false,
      eliminacao_secrecao: false,
      reducao_desconforto: false,
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
      case 'queixa': {
        const q = evolucao.queixa_principal;
        const temAlgo =
          q.tosse ||
          q.chiado ||
          q.cansaco_respiratorio ||
          q.secrecao_cor ||
          q.dificuldade_alimentar ||
          q.piora_noturna;
        return temAlgo ? 'completo' : 'vazio';
      }
      case 'avaliacao_antes': {
        const a = evolucao.avaliacao_antes;
        const temPadrao = a.padrao_respiratorio?.tipo;
        const temAusculta = a.ausculta?.murmurio_vesicular;
        if (temPadrao && temAusculta) return 'completo';
        if (temPadrao || temAusculta) return 'parcial';
        return 'vazio';
      }
      case 'estado_geral': {
        const e = evolucao.estado_geral;
        return e.nivel_alerta && e.tolerancia_manuseio
          ? 'completo'
          : e.nivel_alerta || e.tolerancia_manuseio
            ? 'parcial'
            : 'vazio';
      }
      case 'intervencao': {
        const i = evolucao.intervencao;
        const temTecnica =
          i.afe ||
          i.drr ||
          i.vibrocompressao ||
          i.expiração_lenta_prolongada ||
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
