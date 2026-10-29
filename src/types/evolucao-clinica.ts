// AI dev note: Tipos para Sistema de Evolução Estruturada
// Suporta: Evolução Respiratória e Evolução Motora/Assimetria

import type {
  EstadoHabilidade,
  ConsistenciaHabilidade,
  NivelAssistencia,
  SimetriaMovimento,
  ControlePostural,
  TransferenciaPeso,
  ParticipacaoHabilidade,
  LadoHabilidade,
  MetricaHabilidade,
  ResultadoFuncional,
  IndicadorObjetivo,
  TummyVezes,
  TummyMinutos,
} from '@/lib/motora-catalogo';

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
  // Seção preenchida só quando indicada (ex.: medidas). Não entra no progresso.
  opcional?: boolean;
  // Evolução motora: áreas a que a seção pertence. Sem áreas = seção comum,
  // que aparece em toda sessão.
  areas?: AreaMotora[];
}

// =========================================================================
// ÁREAS DA EVOLUÇÃO MOTORA
// =========================================================================

/**
 * Áreas que a fisio marca como trabalhadas na sessão. Uma sessão, uma
 * evolução, uma ou mais áreas: cada área acrescenta as suas seções e o
 * fechamento (intervenção, resposta, orientações, conduta) é um só.
 * O serviço da agenda não muda (continua "Fisioterapia Motora").
 */
export type AreaMotora =
  | 'torcicolo'
  | 'assimetria_craniana'
  | 'desenvolvimento_motor';

export const AREAS_MOTORAS: {
  id: AreaMotora;
  titulo: string;
  curto: string;
  descricao: string;
}[] = [
  {
    id: 'torcicolo',
    titulo: 'Torcicolo',
    curto: 'Torcicolo',
    descricao: 'Mobilidade cervical, ECOM e simetria postural',
  },
  {
    id: 'assimetria_craniana',
    titulo: 'Assimetria craniana',
    curto: 'Crânio',
    descricao: 'Plagiocefalia, braquicefalia e craniometria',
  },
  {
    id: 'desenvolvimento_motor',
    titulo: 'Desenvolvimento motor',
    curto: 'Desenvolvimento',
    descricao: 'Marcos motores e controle postural',
  },
];

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
  tipo: 'nasal' | 'oral' | 'misto' | 'traqueostomizado' | null;
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

// Ruídos adventícios que pedem localização (cada um tem a sua)
export type RuidoAdventicio =
  | 'sibilos'
  | 'roncos'
  | 'roncos_transmissao'
  | 'estertores_finos'
  | 'estertores_grossos';

export type LocalizacaoRuido = 'difusos' | 'apice' | 'terco_medio' | 'base';

export const RUIDOS_ADVENTICIOS: { valor: RuidoAdventicio; label: string }[] = [
  { valor: 'sibilos', label: 'Sibilos' },
  { valor: 'roncos', label: 'Roncos' },
  { valor: 'roncos_transmissao', label: 'Roncos de Transmissão' },
  { valor: 'estertores_finos', label: 'Estertores finos' },
  { valor: 'estertores_grossos', label: 'Estertores grossos' },
];

export const LOCALIZACOES_RUIDO: { valor: LocalizacaoRuido; label: string }[] =
  [
    { valor: 'difusos', label: 'Difusos' },
    { valor: 'apice', label: 'Ápice' },
    { valor: 'terco_medio', label: 'Terço médio' },
    { valor: 'base', label: 'Base' },
  ];

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

  // Onde está cada ruído (ex.: roncos na base, sibilos difusos).
  // Desde 23/10/2026 a localização é por ruído, não mais uma só por hemitórax.
  localizacao_ruidos?: Partial<Record<RuidoAdventicio, LocalizacaoRuido[]>>;

  // @deprecated Localização única por hemitórax (registros antigos). Não
  // preencher em novos: use `localizacao_ruidos`.
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
  temperatura_nao_aferida?: boolean; // marca explícita "não medido" (distingue de esquecido)
  frequencia_cardiaca?: number; // bpm
  frequencia_cardiaca_nao_aferida?: boolean; // marca explícita "não medido"
  saturacao_o2?: number; // percentual em ar ambiente
  saturacao_nao_aferida?: boolean; // marca explícita "não medido"
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
  // @deprecated Tosse consolidada no campo único `tosse` (item 6). Mantidos
  // apenas para leitura de registros antigos; não preencher em novos.
  tosse_seca_referida?: boolean;
  tosse_produtiva_referida?: boolean;

  // 6️⃣ Sintomas Respiratórios - Tosse
  tosse?: 'ausente' | 'seca' | 'produtiva' | null;
  // Se produtiva: eficácia
  tosse_eficacia?: 'eficaz' | 'pouco_eficaz' | 'ineficaz' | null;
  // Se eficaz: destino da secreção (não abre para "pouco eficaz" nem "ineficaz")
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
  inspiracao_forcada?: boolean;
  expiracao_forcada?: boolean;
  rta: boolean; // Reequilíbrio Toracoabdominal
  epap: boolean; // EPAP
  epap_selo_dagua: boolean; // EPAP selo d'água
  redirecionamento_fluxo: boolean;
  peep_valor?: number; // Valor da PEEP quando usa EPAP
  posicionamentos_terapeuticos: boolean;
  estimulo_tosse: boolean;
  nebulizacao: boolean;
  ambu: boolean; // Hiperinsuflação manual com reanimador (Ambu)
  acapella: boolean; // Dispositivo de PEP oscilatório
  shaker: boolean; // Dispositivo de PEP oscilatório
  lavagem_nasal: boolean; // Lavagem/higiene nasal realizada na sessão

  // Aspiração
  aspiracao: boolean;
  aspiracao_tipo?: 'invasiva' | 'nao_invasiva' | 'ambas' | null;
  aspiracao_quantidade?: 'pouca' | 'moderada' | 'abundante' | null;
  aspiracao_consistencia?: 'fluida' | 'semi_espessa' | 'espessa' | null;
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
  ausculta_pouca_melhora?: boolean; // Melhora discreta (entre "igual" e "houve melhora")
  ausculta_reducao_roncos: boolean;
  ausculta_reducao_sibilos: boolean;
  ausculta_reducao_estertores: boolean;
  ausculta_melhora_mv: boolean; // Melhora do Murmúrio Vesicular
  eliminacao_secrecao: boolean;
  reducao_desconforto: boolean;
  // Sinais Vitais Após
  saturacao_o2?: number;
  saturacao_nao_aferida?: boolean; // marca explícita "não medido"
  frequencia_cardiaca?: number; // FC após intervenção
  frequencia_cardiaca_nao_aferida?: boolean; // marca explícita "não medido"
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
  higiene_nasal_frequencia_conforme_necessidade?: boolean;

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

  // Marca explícita de que não houve orientação (distingue de esquecido)
  sem_orientacao?: boolean;
  sem_orientacao_motivo?: MotivoSemOrientacao | null;
}

/** Por que a sessão terminou sem orientação aos responsáveis. */
export type MotivoSemOrientacao =
  | 'mantem_anteriores'
  | 'responsavel_ausente'
  | 'sem_necessidade';

export const MOTIVOS_SEM_ORIENTACAO: {
  valor: MotivoSemOrientacao;
  label: string;
}[] = [
  { valor: 'mantem_anteriores', label: 'Mantém as orientações já dadas' },
  { valor: 'responsavel_ausente', label: 'Responsável não estava' },
  { valor: 'sem_necessidade', label: 'Sem necessidade hoje' },
];

export function textoSemOrientacao(motivo?: MotivoSemOrientacao | null) {
  const m = MOTIVOS_SEM_ORIENTACAO.find((x) => x.valor === motivo);
  return `Nenhuma orientação nesta sessão${m ? ` (${m.label.toLowerCase()})` : ''}`;
}

export interface CondutaRespiratoria {
  manter_fisioterapia: boolean;
  // @deprecated Saiu do formulário em 23/10/2026: a frequência real se mede
  // pelas sessões feitas na agenda. Mantido para ler registros antigos.
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
  // Fórmula e faixas usadas no cálculo (ver PROTOCOLO_CRANIOMETRIA)
  protocolo?: string;
}

/**
 * Convenção usada nos cálculos do crânio, gravada junto de cada resultado
 * para que medidas futuras só sejam comparadas com a mesma definição.
 * CVAI = |A − B| ÷ maior diagonal × 100, faixas da escala de Atlanta (CHOA);
 * CI = largura ÷ comprimento × 100, faixas [mín, máx) 75/85/90/100. Mesma convenção
 * é usada na avaliação clínica (avaliacoes-clinicas.ts).
 */
export const PROTOCOLO_CRANIOMETRIA =
  'cvai-maior-diagonal-choa_ci-75-85-90-100_v1';

export interface GoniometriaEvolucao {
  rotacao_ativa_direita?: number;
  rotacao_ativa_esquerda?: number;
  rotacao_passiva_direita?: number;
  rotacao_passiva_esquerda?: number;
  inclinacao_ativa_direita?: number;
  inclinacao_ativa_esquerda?: number;
  inclinacao_passiva_direita?: number;
  inclinacao_passiva_esquerda?: number;
  // Diferença entre os lados |D − E|, calculada (ver calcularDiferencasGoniometria)
  diferenca_rotacao_ativa?: number;
  diferenca_rotacao_passiva?: number;
  diferenca_inclinacao_ativa?: number;
  diferenca_inclinacao_passiva?: number;
  // Compatibilidade: diferença passiva (ou ativa, se só ela foi medida)
  diferencial_rotacao?: number;
  diferencial_inclinacao?: number;
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
  // Desde 1.4: musculatura cervical posterior e anterior, e bloqueios
  cervical_posterior?: TensaoRegiao;
  cervical_anterior?: TensaoRegiao;
  bloqueios?: BloqueioArticular[];
  observacoes?: string;
}

export type LadoMaisTenso = 'direito' | 'esquerdo' | 'ambos';

/** Tônus de uma região e, se tensa, o lado mais tenso */
export interface TensaoRegiao {
  tonus: 'normal' | 'tensa';
  lado?: LadoMaisTenso;
}

export type LocalBloqueio = 'quadril' | 'escapula' | 'cranio';

export const LOCAIS_BLOQUEIO: { id: LocalBloqueio; nome: string }[] = [
  { id: 'cranio', nome: 'Crânio' },
  { id: 'escapula', nome: 'Escápula' },
  { id: 'quadril', nome: 'Quadril' },
];

export const LADOS_MAIS_TENSO: { id: LadoMaisTenso; nome: string }[] = [
  { id: 'direito', nome: 'Direito' },
  { id: 'esquerdo', nome: 'Esquerdo' },
  { id: 'ambos', nome: 'Ambos' },
];

/** Bloqueio articular: onde e o lado mais tenso */
export interface BloqueioArticular {
  local: LocalBloqueio;
  lado?: LadoMaisTenso;
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

/**
 * Resposta observada na sessão. Campo ausente = não registrado (nunca "não").
 * 'nao_avaliado' = a profissional declarou que não observou isso hoje.
 */
export type RespostaObservada = boolean | 'nao_avaliado';

/**
 * Relato do responsável sobre o programa domiciliar. É relato, não observação
 * da profissional; por isso tem "não informado" em vez de "não avaliado".
 */
export type AdesaoDomiciliar = 'sim' | 'parcial' | 'nao' | 'nao_informado';

export interface RespostaIntervencaoMotora {
  // Melhoras observadas, sempre em relação à sessão anterior
  melhora_adm?: RespostaObservada | null;
  reducao_preferencia_postural?: RespostaObservada | null;
  melhora_controle_cervical?: RespostaObservada | null;
  tolerancia_prono_melhorou?: RespostaObservada | null;
  adesao_domiciliar?: AdesaoDomiciliar | null;
  // Campo antigo ("Pais seguindo orientações"), substituído por
  // adesao_domiciliar. Só lido em registros antigos; não é mais gravado.
  pais_seguindo_orientacoes?: RespostaObservada | null;
  observacoes?: string;
}

export interface OrientacoesMotoraAssimetria {
  // Sono seguro: de barriga para cima, sem posicionadores (rótulo da tela)
  posicionamento_sono: boolean;
  // Posicionamento e brincadeiras com a criança acordada (lado não preferido)
  posicionamento_vigilia?: boolean;
  tummy_time_frequencia?: string;
  exercicios_domiciliares: boolean;
  sinais_alerta: boolean;
  uso_capacete?: boolean;
  outras?: string;
  // Desde 1.4 (capacete e "exercícios domiciliares" genérico saíram da tela)
  colo_alternando?: boolean;
  tempo_no_chao?: boolean;
  exercicios?: string[]; // ids em EXERCICIOS_DOMICILIARES
  tummy_time_vezes?: TummyVezes | null;
  tummy_time_minutos?: TummyMinutos | null;
  // Marca explícita de que não houve orientação (distingue de esquecido)
  sem_orientacao?: boolean;
  sem_orientacao_motivo?: MotivoSemOrientacao | null;
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

export interface AutoriaEvolucao {
  pessoa_id: string;
  nome?: string | null;
  registro_profissional?: string | null;
  em: string; // ISO
}

/**
 * Versão do formulário gravada em cada evolução motora. Registros sem versão
 * são da versão original: neles, "encaminhamento médico = não" pode ser só o
 * valor padrão do formulário, e não uma decisão clínica.
 */
export const VERSAO_FORMULARIO_MOTORA = '1.4';

/**
 * Formato 1.3: objetivos + habilidades + intervenções por finalidade +
 * resposta da sessão. Registros anteriores continuam abrindo no formato em que
 * foram gravados (controle motor, intervenção e resposta antigos).
 */
export const ehFormatoMotoraV13 = (
  ev: Pick<EvolucaoMotoraAssimetria, 'versao_formulario'> | null | undefined
) => Number(ev?.versao_formulario ?? 0) >= 1.3;

/**
 * Formato 1.4: objetivos por área (do catálogo) puxam a habilidade e as
 * medidas; intervenção num quadro só; orientações e palpação ampliadas.
 */
export const ehFormatoMotoraV14 = (
  ev: Pick<EvolucaoMotoraAssimetria, 'versao_formulario'> | null | undefined
) => Number(ev?.versao_formulario ?? 0) >= 1.4;

/** Toda assimetria craniana vem com torcicolo (o inverso não). */
export function normalizarAreas(areas: AreaMotora[]): AreaMotora[] {
  const set = new Set(areas);
  if (set.has('assimetria_craniana')) set.add('torcicolo');
  return AREAS_MOTORAS.map((a) => a.id).filter((id) => set.has(id));
}

// -------------------------------------------------------------------------
// Medidas programadas (craniometria, goniometria, MFS…)
// -------------------------------------------------------------------------

/** Mesmos tipos da tabela motora_medida_config */
export type TipoMedidaMotora =
  | 'craniometria'
  | 'goniometria'
  | 'mfs'
  | 'desenvolvimento_motor'
  | 'perimetro_cefalico'
  | 'outra'
  | 'fsos2'
  | 'tensao_neuromeningea';

export const NOME_MEDIDA_MOTORA: Record<TipoMedidaMotora, string> = {
  craniometria: 'Craniometria',
  goniometria: 'Goniometria cervical',
  mfs: 'MFS',
  desenvolvimento_motor: 'Reavaliação do desenvolvimento motor',
  perimetro_cefalico: 'Perímetro cefálico',
  outra: 'Outra reavaliação',
  fsos2: 'FSOS-2',
  tensao_neuromeningea: 'Tensão neuromeníngea',
};

/**
 * O que a fisio registrou sobre uma medida nesta sessão. Ausente = "sem
 * registro nesta evolução" (NÃO quer dizer que não mediu).
 * - medido: mediu e registrou (abre os campos ou o resultado no bloco)
 * - nao_medido: não mediu hoje; o lembrete continua e volta na próxima sessão
 * - nao_precisa: não precisa mais acompanhar; para de lembrar (volta se
 *   alguém escolher uma próxima medição na conduta)
 */
export type SituacaoMedicao = 'medido' | 'nao_medido' | 'nao_precisa';

export interface MedicaoSessao {
  situacao: SituacaoMedicao;
  motivo?: string;
  // Medidas sem seção própria (MFS, perímetro, desenvolvimento, outra):
  // resultado registrado no próprio bloco ao marcar "Medi hoje"
  valores?: Record<string, string | number>;
  // Escalas com a mesma estrutura da avaliação (FSOS-2, tensão
  // neuromeníngea), para comparar com ela item a item
  dados?: Record<string, unknown>;
}

// -------------------------------------------------------------------------
// Formato 1.3: habilidades, objetivos da sessão, intervenções e resposta
// -------------------------------------------------------------------------

export type MetricasHabilidade = Partial<Record<MetricaHabilidade, number>>;

/**
 * Uma habilidade registrada nesta sessão. Campo ausente = não registrado
 * (nunca zero). Números só quando efetivamente mensurados.
 */
export interface RegistroHabilidade {
  habilidade: string; // id do catálogo (src/lib/motora-catalogo.ts)
  lado?: LadoHabilidade;
  estado: EstadoHabilidade;
  consistencia?: ConsistenciaHabilidade;
  assistencia?: NivelAssistencia;
  simetria?: SimetriaMovimento;
  controle?: ControlePostural;
  transferencia_peso?: TransferenciaPeso;
  participacao?: ParticipacaoHabilidade;
  metricas?: MetricasHabilidade;
  observacao?: string;
  // Último registro anterior (copiado ao abrir), para o texto e a comparação
  // não mudarem se o histórico for editado depois
  anterior?: {
    data: string;
    estado: EstadoHabilidade;
    assistencia?: NivelAssistencia;
    metricas?: MetricasHabilidade;
  };
  // Registro da avaliação (registro zero), copiado ao abrir, quando é
  // diferente do último registro
  avaliacao?: {
    data: string;
    estado: EstadoHabilidade;
    assistencia?: NivelAssistencia;
    metricas?: MetricasHabilidade;
  };
}

/** Resultado de um objetivo do plano nesta sessão (cópia do que era o objetivo) */
export interface ObjetivoSessao {
  objetivo_id: string;
  descricao: string;
  // Desde 1.4: de onde veio no catálogo, área e medidas que ele puxa
  catalogo_id?: string;
  area?: AreaMotora;
  medidas?: TipoMedidaMotora[];
  // Escolhido do catálogo nesta sessão: entra no plano ao salvar
  novo_no_plano?: {
    descricao: string;
    areas: AreaMotora[];
    indicador: IndicadorObjetivo | null;
  };
  resultado?: ResultadoFuncional;
  rotulo_indicador?: string;
  unidade?: string;
  valor?: number;
  valor_anterior?: number;
  data_anterior?: string;
  meta?: number;
  observacao?: string;
}

/** Intervenção pela finalidade, com abordagem e região/função */
export interface IntervencaoFinalidade {
  finalidade: string; // id em FINALIDADES (ou 'outra')
  finalidade_outra?: string;
  abordagens?: string[];
  abordagem_outra?: string;
  regioes?: string[];
  recursos?: string[];
  detalhe?: string;
}

/** Intervenção da sessão num quadro só (1.4): finalidades, regiões, recursos */
export interface IntervencaoSessaoMotora {
  finalidades?: string[]; // ids em FINALIDADES
  finalidade_outra?: string;
  regioes?: string[];
  recursos?: string[];
  detalhe?: string;
}

export interface RespostaSessaoMotora {
  participacao?: 'boa' | 'variavel' | 'limitada';
  ocorrencias?: string[];
  ocorrencia_outra?: string;
  // Só quando nenhum objetivo foi trabalhado (senão vai por objetivo)
  resultado_geral?: ResultadoFuncional;
  intercorrencias?: string;
  // Relato do responsável: separado da observação da fisio
  relato_familia?: string;
  adesao_domiciliar?: AdesaoDomiciliar | null;
  observacoes?: string;
}

/** Idade no dia da sessão (cópia, para o texto) */
export interface IdadeSessao {
  cronologica_meses: number;
  cronologica_texto: string;
  corrigida_texto?: string;
  observacao?: string;
}

export interface ProximaReavaliacao {
  data: string; // YYYY-MM-DD
  descricao?: string; // para "outra"
}

export interface EvolucaoMotoraAssimetria {
  versao_formulario?: string;
  // Áreas trabalhadas na sessão (desde a versão 1.2). Ausente = registro
  // anterior às áreas: mostra todas as seções. Lista vazia = ainda não
  // escolhidas.
  areas?: AreaMotora[];
  // Medidas: o que foi feito com cada medida hoje e a próxima reavaliação
  // programada na conduta (aplicados na programação do paciente ao salvar)
  medicoes?: Partial<Record<TipoMedidaMotora, MedicaoSessao>>;
  proximas_reavaliacoes?: Partial<Record<TipoMedidaMotora, ProximaReavaliacao>>;
  // Formato 1.3
  idade_sessao?: IdadeSessao;
  habilidades?: RegistroHabilidade[];
  objetivos_sessao?: ObjetivoSessao[];
  intervencoes?: IntervencaoFinalidade[];
  intervencao_sessao?: IntervencaoSessaoMotora;
  resposta_sessao?: RespostaSessaoMotora;
  autor?: AutoriaEvolucao;
  ultima_edicao?: AutoriaEvolucao;
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

// Ordem: seções de cada área (torcicolo → crânio → desenvolvimento) e depois
// o fechamento comum.
export const EVOLUCAO_MOTORA_ASSIMETRIA_SECOES: EvolucaoSecao[] = [
  {
    id: 'goniometria',
    titulo: 'Goniometria Cervical',
    icone: '📏',
    campos: ['rotacao', 'inclinacao', 'diferencial'],
    ordem: 1,
    opcional: true,
    areas: ['torcicolo'],
  },
  {
    id: 'palpacao',
    titulo: 'Palpação (ECOM e cervical)',
    icone: '👋',
    campos: ['tonus', 'nodulo'],
    ordem: 2,
    opcional: true,
    areas: ['torcicolo'],
  },
  {
    id: 'craniometria',
    titulo: 'Medidas Craniométricas',
    icone: '📐',
    campos: ['diagonais', 'comprimento', 'largura', 'perimetro'],
    ordem: 3,
    opcional: true,
    areas: ['assimetria_craniana'],
  },
  {
    // Essencial só quando desenvolvimento motor é trabalhado
    // (ver secaoMotoraEssencial); no torcicolo é complementar.
    id: 'controle_motor',
    titulo: 'Controle Motor',
    icone: '🏋️',
    campos: ['supino', 'prono'],
    ordem: 4,
    areas: ['desenvolvimento_motor', 'torcicolo'],
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
    opcional: true,
  },
  {
    id: 'conduta',
    titulo: 'Conduta e Plano',
    icone: '✅',
    campos: ['frequencia', 'reavaliacao', 'encaminhamento', 'capacete'],
    ordem: 8,
  },
];

const SECAO_MOTORA = (id: string) =>
  EVOLUCAO_MOTORA_ASSIMETRIA_SECOES.find((s) => s.id === id)!;

/** Formato 1.3: objetivos e habilidades primeiro, depois medidas e o fechamento */
export const EVOLUCAO_MOTORA_SECOES_V13: EvolucaoSecao[] = [
  {
    // Essencial quando desenvolvimento motor é trabalhado (secaoMotoraEssencial)
    id: 'objetivos_habilidades',
    titulo: 'Objetivos e habilidades',
    icone: '🎯',
    campos: ['objetivos', 'habilidades'],
    ordem: 1,
  },
  { ...SECAO_MOTORA('goniometria'), ordem: 2 },
  { ...SECAO_MOTORA('palpacao'), ordem: 3 },
  { ...SECAO_MOTORA('craniometria'), ordem: 4 },
  {
    id: 'intervencoes',
    titulo: 'Intervenções realizadas',
    icone: '🩺',
    campos: ['finalidade', 'abordagem', 'regiao'],
    ordem: 5,
  },
  {
    id: 'resposta_sessao',
    titulo: 'Resposta e participação',
    icone: '📈',
    campos: ['participacao', 'resultado', 'intercorrencias'],
    ordem: 6,
  },
  { ...SECAO_MOTORA('orientacoes'), ordem: 7 },
  { ...SECAO_MOTORA('conduta'), ordem: 8 },
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
      temperatura_nao_aferida: false,
      frequencia_cardiaca: undefined,
      saturacao_o2: undefined,
      saturacao_nao_aferida: false,
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
      inspiracao_forcada: false,
      expiracao_forcada: false,
      rta: false,
      epap: false,
      epap_selo_dagua: false,
      redirecionamento_fluxo: false,
      posicionamentos_terapeuticos: false,
      estimulo_tosse: false,
      nebulizacao: false,
      ambu: false,
      acapella: false,
      shaker: false,
      lavagem_nasal: false,
      aspiracao: false,
    },
    avaliacao_depois: {
      tolerancia_manuseio: null,
      choro_durante_atendimento: null,
      melhora_padrao_respiratorio: false,
      ausculta_sem_alteracao: false,
      ausculta_melhorou: false,
      ausculta_pouca_melhora: false,
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
 * Retorna uma avaliação respiratória "normal" (exame sem alterações), usada
 * pelo botão "Exame respiratório normal" (charting by exception): o
 * profissional aplica o padrão normal e edita apenas as exceções.
 */
export function getAvaliacaoRespiratoriaNormal(): AvaliacaoRespiratoriaAntes {
  const hemitoraxNormal = (): AuscultaHemitorax => ({
    murmurio_vesicular: 'preservado',
    ruidos_ausentes: true,
    sibilos: false,
    roncos: false,
    roncos_transmissao: false,
    estertores_finos: false,
    estertores_grossos: false,
    localizacao_ruidos: {},
    localizacao_difusos: false,
    localizacao_apice: false,
    localizacao_terco_medio: false,
    localizacao_base: false,
  });
  return {
    padrao_respiratorio: {
      tipo: 'nasal',
      ritmo_respiratorio: 'eupneico',
      dispneia: false,
      classificacao_clinica: 'normal',
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
      hemitorax_direito: hemitoraxNormal(),
      hemitorax_esquerdo: hemitoraxNormal(),
    },
  };
}

/**
 * Ruídos de um hemitórax para o texto da evolução, cada um com a sua
 * localização: ["Roncos (ápice, base)", "Sibilos (difusos)"].
 */
export function descreverRuidosHemitorax(h: AuscultaHemitorax): string[] {
  const ruidos: string[] = [];
  if (h.ruidos_ausentes) ruidos.push('Sem ruídos adventícios');
  RUIDOS_ADVENTICIOS.forEach(({ valor, label }) => {
    if (!h[valor]) return;
    const locais = (h.localizacao_ruidos?.[valor] || [])
      .map((l) => LOCALIZACOES_RUIDO.find((o) => o.valor === l)?.label || l)
      .map((l) => l.toLowerCase());
    ruidos.push(locais.length > 0 ? `${label} (${locais.join(', ')})` : label);
  });
  return ruidos;
}

/**
 * Seções que o carry-forward preenche e que precisam de revisão explícita
 * antes de salvar. `avaliacao_depois` fica de fora de propósito: a resposta ao
 * tratamento é o resultado desta sessão e nunca pode vir pronta.
 */
export const SECOES_REAPROVEITAVEIS_RESPIRATORIA = [
  'estado_geral_antes',
  'avaliacao_antes',
  'intervencao',
  'orientacoes',
  'conduta',
] as const;

/**
 * Cria uma nova evolução respiratória reaproveitando a última do paciente.
 *
 * Copia o quadro clínico, o exame, as técnicas aplicadas, as orientações e a
 * conduta — tudo o que serve de ponto de partida numa sessão de seguimento.
 * NÃO copia:
 * - valores medidos nesta sessão (temperatura, FC, SpO₂) — teriam que ser
 *   remedidos e um número herdado vira dado falso no prontuário;
 * - o que a aspiração produziu (quantidade, aspecto, consistência, sangramento);
 * - a resposta ao tratamento (`avaliacao_depois`), que só existe depois de
 *   atender;
 * - observações em texto livre, que descrevem aquela sessão específica.
 *
 * Quem chama deve marcar as seções copiadas como pendentes de revisão
 * (ver SECOES_REAPROVEITAVEIS_RESPIRATORIA) — o objetivo é encurtar o
 * preenchimento, não documentar achado que ninguém examinou.
 */
// Copia a ausculta de um hemitórax sem a localização antiga (única por
// hemitórax), que não diz qual ruído estava onde.
function copiarHemitorax(h: AuscultaHemitorax): AuscultaHemitorax {
  const loc = h.localizacao_ruidos || {};
  return {
    ...h,
    localizacao_ruidos: Object.fromEntries(
      Object.entries(loc).map(([k, v]) => [k, [...(v || [])]])
    ),
    localizacao_difusos: false,
    localizacao_apice: false,
    localizacao_terco_medio: false,
    localizacao_base: false,
  };
}

export function criarEvolucaoRespiratoriaDeAnterior(
  anterior: EvolucaoRespiratoria
): EvolucaoRespiratoria {
  const nova = criarEvolucaoRespiratoriaVazia();
  const ant = anterior.estado_geral_antes || ({} as EstadoGeralAntes);

  // Estado geral: copia tudo menos os vitais medidos e as observações
  nova.estado_geral_antes = {
    ...nova.estado_geral_antes,
    ...ant,
    temperatura_aferida: undefined,
    temperatura_nao_aferida: undefined,
    frequencia_cardiaca: undefined,
    frequencia_cardiaca_nao_aferida: undefined,
    saturacao_o2: undefined,
    saturacao_nao_aferida: undefined,
    saturacao_com_suporte: undefined,
    observacoes: undefined,
  };

  // Exame respiratório (padrão, sinais de esforço e ausculta). Registros
  // antigos podem vir sem um hemitórax: o que faltar fica no padrão vazio.
  if (anterior.avaliacao_antes) {
    const ant = anterior.avaliacao_antes;
    const vazia = nova.avaliacao_antes;
    nova.avaliacao_antes = {
      padrao_respiratorio: {
        ...vazia.padrao_respiratorio,
        ...ant.padrao_respiratorio,
      },
      sinais_dispneia: { ...vazia.sinais_dispneia, ...ant.sinais_dispneia },
      ausculta: {
        hemitorax_direito: ant.ausculta?.hemitorax_direito
          ? copiarHemitorax(ant.ausculta.hemitorax_direito)
          : vazia.ausculta.hemitorax_direito,
        hemitorax_esquerdo: ant.ausculta?.hemitorax_esquerdo
          ? copiarHemitorax(ant.ausculta.hemitorax_esquerdo)
          : vazia.ausculta.hemitorax_esquerdo,
      },
    };
  }

  // Intervenção: mantém as técnicas, zera o que a aspiração produziu
  if (anterior.intervencao) {
    nova.intervencao = {
      ...anterior.intervencao,
      aspiracao_quantidade: null,
      aspiracao_consistencia: null,
      aspiracao_aspecto: null,
      aspiracao_sangramento: null,
      observacoes: undefined,
    };
  }

  // Plano terapêutico (estável)
  if (anterior.conduta)
    nova.conduta = { ...anterior.conduta, frequencia_sugerida: null };
  if (anterior.orientacoes) nova.orientacoes = { ...anterior.orientacoes };
  return nova;
}

/**
 * Cria um objeto vazio de evolução motora/assimetria
 */
export function criarEvolucaoMotoraAssimetriaVazia(): EvolucaoMotoraAssimetria {
  return {
    areas: [],
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
    // Evolução nova já nasce no formato 1.3
    versao_formulario: VERSAO_FORMULARIO_MOTORA,
    habilidades: [],
    objetivos_sessao: [],
    intervencoes: [],
    resposta_sessao: {},
  };
}

/**
 * Calcula métricas craniométricas automaticamente
 */
export function calcularMetricasCraniometriaEvolucao(
  medidas: CraniometriaEvolucao
): CraniometriaEvolucao {
  // Recalcula do zero: apagar uma medida também apaga o índice que dependia dela
  const resultado: CraniometriaEvolucao = {
    ...medidas,
    cva_mm: undefined,
    cvai_percentual: undefined,
    ci_percentual: undefined,
    plagiocefalia_severidade: undefined,
    braquicefalia_severidade: undefined,
    protocolo: undefined,
  };

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

    // Classificação Braquicefalia/Escafocefalia. Faixas [mín, máx), iguais às
    // da avaliação (BRAQUICEFALIA_CLASSIFICACAO): 85% já é braquicefalia leve.
    if (resultado.ci_percentual < 75) {
      resultado.braquicefalia_severidade = 'escafocefalia';
    } else if (resultado.ci_percentual < 85) {
      resultado.braquicefalia_severidade = 'normal';
    } else if (resultado.ci_percentual < 90) {
      resultado.braquicefalia_severidade = 'braquicefalia_leve';
    } else if (resultado.ci_percentual < 100) {
      resultado.braquicefalia_severidade = 'braquicefalia_moderada';
    } else {
      resultado.braquicefalia_severidade = 'braquicefalia_severa';
    }
  }

  if (
    resultado.cvai_percentual !== undefined ||
    resultado.ci_percentual !== undefined
  ) {
    resultado.protocolo = PROTOCOLO_CRANIOMETRIA;
  }

  return resultado;
}

/** Rótulos das classificações do crânio, para tela e texto */
export const ROTULO_PLAGIOCEFALIA: Record<string, string> = {
  normal: 'sem plagiocefalia',
  leve: 'plagiocefalia leve',
  moderada: 'plagiocefalia moderada',
  severa: 'plagiocefalia severa',
  muito_severa: 'plagiocefalia muito severa',
};

export const ROTULO_BRAQUICEFALIA: Record<string, string> = {
  escafocefalia: 'escafocefalia',
  normal: 'proporção normal',
  braquicefalia_leve: 'braquicefalia leve',
  braquicefalia_moderada: 'braquicefalia moderada',
  braquicefalia_severa: 'braquicefalia severa',
};

/**
 * Classifica a diferença entre os lados da rotação cervical. Mesmas faixas e
 * mesmas fronteiras da avaliação clínica (GONIOMETRIA_CLASSIFICACAO_ASSIMETRIA,
 * intervalos [mín, máx)): menos de 5° normal, de 5° a menos de 15° leve,
 * de 15° a menos de 30° moderada, 30° ou mais severa. Mudar a fronteira aqui
 * exige mudar a avaliação junto, senão as duas telas divergem.
 */
export const TEXTO_FAIXAS_DIFERENCA_CERVICAL =
  'menos de 5° normal; de 5° a menos de 15° leve; de 15° a menos de 30° moderada; 30° ou mais severa';

/** Lado com menor amplitude (para onde o movimento está mais limitado) */
export function ladoMenorAmplitude(
  direita: number | undefined,
  esquerda: number | undefined
): 'direita' | 'esquerda' | undefined {
  if (typeof direita !== 'number' || typeof esquerda !== 'number')
    return undefined;
  if (direita === esquerda) return undefined;
  return direita < esquerda ? 'direita' : 'esquerda';
}

export function classificarDiferencaCervical(
  diferenca: number | undefined
): 'normal' | 'leve' | 'moderada' | 'severa' | undefined {
  if (diferenca === undefined) return undefined;
  if (diferenca < 5) return 'normal';
  if (diferenca < 15) return 'leve';
  if (diferenca < 30) return 'moderada';
  return 'severa';
}

/**
 * Calcula |D − E| da rotação e da inclinação, ativa e passiva. Só calcula
 * quando os dois lados foram medidos (0° é uma medida válida).
 */
export function calcularDiferencasGoniometria(
  g: GoniometriaEvolucao
): GoniometriaEvolucao {
  const dif = (d?: number, e?: number) =>
    typeof d === 'number' && typeof e === 'number'
      ? Math.abs(d - e)
      : undefined;

  const resultado: GoniometriaEvolucao = {
    ...g,
    diferenca_rotacao_ativa: dif(
      g.rotacao_ativa_direita,
      g.rotacao_ativa_esquerda
    ),
    diferenca_rotacao_passiva: dif(
      g.rotacao_passiva_direita,
      g.rotacao_passiva_esquerda
    ),
    diferenca_inclinacao_ativa: dif(
      g.inclinacao_ativa_direita,
      g.inclinacao_ativa_esquerda
    ),
    diferenca_inclinacao_passiva: dif(
      g.inclinacao_passiva_direita,
      g.inclinacao_passiva_esquerda
    ),
  };
  resultado.diferencial_rotacao =
    resultado.diferenca_rotacao_passiva ?? resultado.diferenca_rotacao_ativa;
  resultado.diferencial_inclinacao =
    resultado.diferenca_inclinacao_passiva ??
    resultado.diferenca_inclinacao_ativa;
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
          i.inspiracao_forcada ||
          i.expiracao_forcada ||
          i.rta ||
          i.epap ||
          i.epap_selo_dagua ||
          i.redirecionamento_fluxo ||
          i.posicionamentos_terapeuticos ||
          i.estimulo_tosse ||
          i.aspiracao ||
          i.nebulizacao ||
          i.ambu ||
          i.acapella ||
          i.shaker ||
          i.lavagem_nasal;
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
          o.higiene_nasal ||
          o.posicionamento_dormir ||
          o.sinais_alerta ||
          o.sem_orientacao ||
          temTexto(o.outras);
        return temOrientacao ? 'completo' : 'vazio';
      }
      case 'conduta': {
        const c = evolucao.conduta;
        return c.manter_fisioterapia !== undefined ? 'completo' : 'vazio';
      }
    }
  }

  if (tipoEvolucao === 'motora_assimetria') {
    return verificarSecaoMotoraCompleta(
      secaoId,
      dados as EvolucaoMotoraAssimetria
    );
  }

  return 'vazio';
}

const temTexto = (s?: string | null) => !!s && s.trim().length > 0;
const temNumero = (n?: number | null) => typeof n === 'number';

function verificarSecaoMotoraCompleta(
  secaoId: string,
  ev: EvolucaoMotoraAssimetria
): 'completo' | 'parcial' | 'vazio' {
  switch (secaoId) {
    case 'craniometria': {
      const c = ev.craniometria || {};
      const medidas = [
        c.diagonal_a_mm,
        c.diagonal_b_mm,
        c.comprimento_ap_mm,
        c.largura_ml_mm,
        c.perimetro_cefalico_cm,
      ].filter(temNumero).length;
      if (temNumero(c.diagonal_a_mm) && temNumero(c.diagonal_b_mm))
        return 'completo';
      return medidas > 0 ? 'parcial' : 'vazio';
    }
    case 'goniometria': {
      const g = ev.goniometria || {};
      const rotacaoCompleta =
        (temNumero(g.rotacao_passiva_direita) &&
          temNumero(g.rotacao_passiva_esquerda)) ||
        (temNumero(g.rotacao_ativa_direita) &&
          temNumero(g.rotacao_ativa_esquerda));
      if (rotacaoCompleta) return 'completo';
      const algum = [
        g.rotacao_ativa_direita,
        g.rotacao_ativa_esquerda,
        g.rotacao_passiva_direita,
        g.rotacao_passiva_esquerda,
        g.inclinacao_ativa_direita,
        g.inclinacao_ativa_esquerda,
        g.inclinacao_passiva_direita,
        g.inclinacao_passiva_esquerda,
      ].some(temNumero);
      return algum || temTexto(g.observacoes) ? 'parcial' : 'vazio';
    }
    case 'palpacao': {
      const p = ev.palpacao || {};
      if (p.ecom_direito_tonus && p.ecom_esquerdo_tonus) return 'completo';
      return p.ecom_direito_tonus ||
        p.ecom_esquerdo_tonus ||
        p.nodulo_direito ||
        p.nodulo_esquerdo ||
        p.cervical_posterior ||
        p.cervical_anterior ||
        (p.bloqueios || []).length > 0 ||
        temTexto(p.observacoes)
        ? 'parcial'
        : 'vazio';
    }
    case 'controle_motor': {
      const c = ev.controle_motor || {};
      const algum =
        c.supino_linha_media ||
        c.supino_alcance ||
        c.prono_tolerancia ||
        c.prono_carga_peso ||
        c.prono_controle_cabeca ||
        temTexto(c.observacoes);
      return algum ? 'completo' : 'vazio';
    }
    case 'intervencao': {
      const i = ev.intervencao;
      const algum =
        i.alongamentos ||
        i.fortalecimento ||
        i.estimulacao_sensorial ||
        i.posicionamentos_terapeuticos ||
        i.tummy_time ||
        i.bandagem_kinesio ||
        i.orientacao_pais ||
        temTexto(i.outras_tecnicas);
      return algum ? 'completo' : 'vazio';
    }
    case 'resposta': {
      const r = ev.resposta || {};
      // Só contam as perguntas que aparecem para as áreas da sessão
      const itens = [
        ...itensRespostaVisiveis(ev.areas).map((id) => r[id]),
        // registro antigo pode ter só o campo anterior
        r.adesao_domiciliar ?? r.pais_seguindo_orientacoes,
      ];
      const respondidos = itens.filter(
        (v) => v !== undefined && v !== null
      ).length;
      if (respondidos === itens.length) return 'completo';
      return respondidos > 0 || temTexto(r.observacoes) ? 'parcial' : 'vazio';
    }
    case 'objetivos_habilidades': {
      if (ehFormatoMotoraV14(ev)) {
        const objs = ev.objetivos_sessao || [];
        if (objs.length === 0) return 'vazio';
        return objs.every((o) => !!o.resultado) ? 'completo' : 'parcial';
      }
      const registrou =
        (ev.habilidades || []).length > 0 ||
        (ev.objetivos_sessao || []).some((o) => !!o.resultado);
      return registrou ? 'completo' : 'vazio';
    }
    case 'intervencoes': {
      const i = ev.intervencao_sessao;
      if ((i?.finalidades || []).length > 0 || temTexto(i?.finalidade_outra))
        return 'completo';
      if ((ev.intervencoes || []).length > 0) return 'completo';
      return (i?.regioes || []).length || (i?.recursos || []).length
        ? 'parcial'
        : 'vazio';
    }
    case 'resposta_sessao': {
      const r = ev.resposta_sessao || {};
      if (r.participacao) return 'completo';
      return (r.ocorrencias || []).length > 0 ||
        temTexto(r.intercorrencias) ||
        temTexto(r.relato_familia) ||
        temTexto(r.observacoes) ||
        !!r.adesao_domiciliar
        ? 'parcial'
        : 'vazio';
    }
    case 'orientacoes': {
      const o = ev.orientacoes;
      return o.posicionamento_sono ||
        o.posicionamento_vigilia ||
        o.exercicios_domiciliares ||
        o.sinais_alerta ||
        o.uso_capacete ||
        o.colo_alternando ||
        o.tempo_no_chao ||
        (o.exercicios || []).length > 0 ||
        !!o.tummy_time_vezes ||
        !!o.tummy_time_minutos ||
        o.sem_orientacao ||
        temTexto(o.tummy_time_frequencia) ||
        temTexto(o.outras)
        ? 'completo'
        : 'vazio';
    }
    case 'conduta': {
      const c = ev.conduta;
      if (c.manter_fisioterapia === false) return 'completo';
      if (c.manter_fisioterapia && c.frequencia_sugerida) return 'completo';
      return 'parcial';
    }
  }
  return 'vazio';
}

// -------------------------------------------------------------------------
// Áreas: o que aparece, o que conta no progresso e o que é gravado
// -------------------------------------------------------------------------

/** Registro anterior às áreas (sem `areas`): tudo aparece, como antes. */
export function temAreasDefinidas(ev: EvolucaoMotoraAssimetria): boolean {
  return Array.isArray(ev.areas);
}

const areaAtiva = (areas: AreaMotora[] | undefined, a: AreaMotora) =>
  areas === undefined || areas.includes(a);

/** Medidas puxadas pelos objetivos trabalhados hoje (formato 1.4). */
export function medidasDoDia(
  ev: Pick<EvolucaoMotoraAssimetria, 'objetivos_sessao'>
): TipoMedidaMotora[] {
  const set = new Set<TipoMedidaMotora>();
  for (const o of ev.objetivos_sessao || [])
    for (const m of o.medidas || []) set.add(m);
  return [...set];
}

const temAlgumNumero = (o: object | undefined) =>
  !!o && Object.values(o).some((v) => typeof v === 'number');

/**
 * Seções da evolução motora que aparecem para as áreas marcadas. No 1.4
 * (com a evolução), goniometria e craniometria só aparecem quando um objetivo
 * trabalhado hoje pede a medida, ou se já têm valores.
 */
export function secoesMotorasVisiveis(
  areas: AreaMotora[] | undefined,
  v13 = false,
  ev?: EvolucaoMotoraAssimetria
): EvolucaoSecao[] {
  const porArea = (
    v13 ? EVOLUCAO_MOTORA_SECOES_V13 : EVOLUCAO_MOTORA_ASSIMETRIA_SECOES
  ).filter((s) => !s.areas || s.areas.some((a) => areaAtiva(areas, a)));
  if (!ev || !ehFormatoMotoraV14(ev)) return porArea;
  const doDia = medidasDoDia(ev);
  return porArea.filter((s) => {
    if (s.id === 'goniometria')
      return doDia.includes('goniometria') || temAlgumNumero(ev.goniometria);
    if (s.id === 'craniometria')
      return doDia.includes('craniometria') || temAlgumNumero(ev.craniometria);
    return true;
  });
}

/**
 * Se a seção conta no progresso. Controle motor só é essencial quando
 * desenvolvimento motor foi trabalhado; no torcicolo ele é complementar.
 */
export function secaoMotoraEssencial(
  secao: EvolucaoSecao,
  areas: AreaMotora[] | undefined,
  ev?: Pick<EvolucaoMotoraAssimetria, 'versao_formulario'>
): boolean {
  if (secao.opcional) return false;
  // No 1.4 o objetivo é o eixo da sessão em qualquer área
  if (secao.id === 'objetivos_habilidades' && ev && ehFormatoMotoraV14(ev))
    return true;
  if (secao.id === 'controle_motor' || secao.id === 'objetivos_habilidades')
    return areaAtiva(areas, 'desenvolvimento_motor');
  return true;
}

// -------------------------------------------------------------------------
// O que ficou em branco: lista mostrada antes de salvar
// -------------------------------------------------------------------------

export interface PendenciaEvolucao {
  secaoId: string;
  item: string;
}

const ORIENTACAO_PENDENTE =
  'Orientações (ou marque "Nenhuma orientação nesta sessão")';

/** Hemitórax sem ruído e com murmúrio preservado. */
const hemitoraxLimpo = (h?: AuscultaHemitorax) =>
  !!h &&
  h.murmurio_vesicular === 'preservado' &&
  !RUIDOS_ADVENTICIOS.some(({ valor }) => h[valor]);

/**
 * Ausculta inicial sem nada a melhorar: a "mudança na ausculta" depois da
 * sessão não se aplica.
 */
export function auscultaInicialLimpa(ev: EvolucaoRespiratoria): boolean {
  const a = ev.avaliacao_antes?.ausculta;
  return (
    hemitoraxLimpo(a?.hemitorax_direito) &&
    hemitoraxLimpo(a?.hemitorax_esquerdo)
  );
}

/**
 * Itens da evolução respiratória sem resposta. Cada um tem uma resposta
 * possível mesmo quando nada foi feito ("não aferida", "nenhuma orientação"),
 * então a lista sempre pode ser zerada.
 */
export function pendenciasEvolucaoRespiratoria(
  ev: EvolucaoRespiratoria
): PendenciaEvolucao[] {
  const p: PendenciaEvolucao[] = [];
  const add = (secaoId: string, item: string) => p.push({ secaoId, item });
  const vazio = (v: unknown) => v === undefined || v === null || v === '';

  const e = ev.estado_geral_antes || ({} as EstadoGeralAntes);
  if (!e.nivel_consciencia) add('estado_geral_antes', 'Nível de consciência');
  if (vazio(e.temperatura_aferida) && !e.temperatura_nao_aferida)
    add('estado_geral_antes', 'Temperatura (valor ou "não aferida")');
  if (vazio(e.frequencia_cardiaca) && !e.frequencia_cardiaca_nao_aferida)
    add('estado_geral_antes', 'FC (valor ou "não aferida")');
  if (vazio(e.saturacao_o2) && !e.saturacao_nao_aferida)
    add('estado_geral_antes', 'SpO₂ (valor ou "não aferida")');
  if (vazio(e.tosse) && !e.tosse_seca_referida && !e.tosse_produtiva_referida)
    add('estado_geral_antes', 'Tosse');

  const a = ev.avaliacao_antes;
  if (!a?.padrao_respiratorio?.tipo)
    add('avaliacao_antes', 'Tipo de respiração (nasal, oral, misto…)');
  if (!a?.padrao_respiratorio?.ritmo_respiratorio)
    add('avaliacao_antes', 'Ritmo respiratório');
  if (!a?.ausculta?.hemitorax_direito?.murmurio_vesicular)
    add('avaliacao_antes', 'Murmúrio vesicular do hemitórax direito');
  if (!a?.ausculta?.hemitorax_esquerdo?.murmurio_vesicular)
    add('avaliacao_antes', 'Murmúrio vesicular do hemitórax esquerdo');

  if (
    verificarSecaoEvolucaoCompleta('respiratoria', 'intervencao', ev) ===
    'vazio'
  )
    add('intervencao', 'Nenhuma técnica marcada');

  const d = ev.avaliacao_depois || ({} as AvaliacaoRespiratoriaDepois);
  if (!d.tolerancia_manuseio) add('avaliacao_depois', 'Tolerância ao manuseio');
  if (!d.choro_durante_atendimento)
    add('avaliacao_depois', 'Choro durante o atendimento');
  if (
    !auscultaInicialLimpa(ev) &&
    !d.ausculta_sem_alteracao &&
    !d.ausculta_melhorou &&
    !d.ausculta_pouca_melhora
  )
    add('avaliacao_depois', 'Mudança na ausculta pulmonar');
  if (vazio(d.saturacao_o2) && !d.saturacao_nao_aferida)
    add('avaliacao_depois', 'SpO₂ após (valor ou "não aferida")');
  if (vazio(d.frequencia_cardiaca) && !d.frequencia_cardiaca_nao_aferida)
    add('avaliacao_depois', 'FC após (valor ou "não aferida")');
  if (!d.comportamento_crianca)
    add('avaliacao_depois', 'Comportamento da criança após a sessão');

  if (
    verificarSecaoEvolucaoCompleta('respiratoria', 'orientacoes', ev) ===
    'vazio'
  )
    add('orientacoes', ORIENTACAO_PENDENTE);
  return p;
}

/**
 * Seções da evolução motora sem resposta: as essenciais das áreas marcadas e
 * as orientações (que agora têm "Nenhuma orientação nesta sessão"). As
 * medidas têm a própria checagem ("Medi hoje" sem resultado).
 */
export function pendenciasEvolucaoMotora(
  ev: EvolucaoMotoraAssimetria
): PendenciaEvolucao[] {
  const p: PendenciaEvolucao[] = [];
  for (const s of secoesMotorasVisiveis(ev.areas, ehFormatoMotoraV13(ev), ev)) {
    if (s.id === 'orientacoes') {
      if (verificarSecaoMotoraCompleta('orientacoes', ev) === 'vazio')
        p.push({ secaoId: s.id, item: ORIENTACAO_PENDENTE });
      continue;
    }
    if (!secaoMotoraEssencial(s, ev.areas, ev)) continue;
    if (verificarSecaoMotoraCompleta(s.id, ev) === 'vazio')
      p.push({
        secaoId: s.id,
        item:
          s.id === 'objetivos_habilidades' && ehFormatoMotoraV14(ev)
            ? 'Marque pelo menos um objetivo trabalhado hoje'
            : s.titulo,
      });
    // 1.4: cada objetivo trabalhado precisa do resultado
    if (s.id === 'objetivos_habilidades' && ehFormatoMotoraV14(ev))
      for (const o of ev.objetivos_sessao || [])
        if (!o.resultado)
          p.push({ secaoId: s.id, item: `Resultado: ${o.descricao}` });
  }
  return p;
}

/** Perguntas de "melhora" da resposta e as áreas em que fazem sentido. */
export const RESPOSTA_MOTORA_POR_AREA: Record<
  | 'melhora_adm'
  | 'reducao_preferencia_postural'
  | 'melhora_controle_cervical'
  | 'tolerancia_prono_melhorou',
  AreaMotora[]
> = {
  melhora_adm: ['torcicolo'],
  reducao_preferencia_postural: ['torcicolo', 'assimetria_craniana'],
  melhora_controle_cervical: ['torcicolo', 'desenvolvimento_motor'],
  tolerancia_prono_melhorou: [
    'torcicolo',
    'assimetria_craniana',
    'desenvolvimento_motor',
  ],
};

export function itensRespostaVisiveis(
  areas: AreaMotora[] | undefined
): (keyof typeof RESPOSTA_MOTORA_POR_AREA)[] {
  return (
    Object.keys(
      RESPOSTA_MOTORA_POR_AREA
    ) as (keyof typeof RESPOSTA_MOTORA_POR_AREA)[]
  ).filter((id) =>
    RESPOSTA_MOTORA_POR_AREA[id].some((a) => areaAtiva(areas, a))
  );
}

/** Capacete (orientação e indicação) só aparece na assimetria craniana. */
export const capaceteVisivel = (areas: AreaMotora[] | undefined) =>
  areaAtiva(areas, 'assimetria_craniana');

/**
 * Áreas sugeridas a partir de uma evolução anterior: as áreas gravadas nela
 * ou, em registro antigo, as áreas cujos campos foram preenchidos.
 */
export function inferirAreasMotoras(
  ev: EvolucaoMotoraAssimetria | null | undefined
): AreaMotora[] {
  if (!ev) return [];
  if (Array.isArray(ev.areas)) return [...ev.areas];
  const preenchido = (o?: object | null) =>
    !!o &&
    Object.values(o).some(
      (v) => v !== undefined && v !== null && v !== '' && v !== false
    );
  const areas: AreaMotora[] = [];
  if (preenchido(ev.goniometria) || preenchido(ev.palpacao))
    areas.push('torcicolo');
  if (preenchido(ev.craniometria)) areas.push('assimetria_craniana');
  if (preenchido(ev.controle_motor)) areas.push('desenvolvimento_motor');
  return areas;
}

/**
 * Antes de gravar: tira o que pertence a áreas desmarcadas, para o registro
 * não guardar dado escondido. Enquanto a fisio edita, nada é apagado (marcar
 * de novo a área traz o que já tinha sido preenchido).
 */
export function limparAreasNaoTrabalhadas(
  ev: EvolucaoMotoraAssimetria
): EvolucaoMotoraAssimetria {
  if (!Array.isArray(ev.areas)) return ev;
  const areas = ev.areas;
  const tem = (a: AreaMotora) => areas.includes(a);
  const limpo: EvolucaoMotoraAssimetria = { ...ev };
  if (!tem('torcicolo')) {
    delete limpo.goniometria;
    delete limpo.palpacao;
  }
  if (!tem('assimetria_craniana')) delete limpo.craniometria;
  if (!tem('torcicolo') && !tem('desenvolvimento_motor'))
    delete limpo.controle_motor;

  const visiveis = itensRespostaVisiveis(areas);
  const resposta = { ...ev.resposta };
  for (const id of Object.keys(
    RESPOSTA_MOTORA_POR_AREA
  ) as (keyof typeof RESPOSTA_MOTORA_POR_AREA)[]) {
    if (!visiveis.includes(id)) delete resposta[id];
  }
  limpo.resposta = resposta;

  if (!capaceteVisivel(areas)) {
    limpo.orientacoes = { ...ev.orientacoes };
    delete limpo.orientacoes.uso_capacete;
    limpo.conduta = { ...ev.conduta };
    delete limpo.conduta.indicacao_capacete;
    if (!limpo.conduta.encaminhamento_medico)
      delete limpo.conduta.motivo_encaminhamento;
  }
  return limpo;
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
