// Catálogo clínico da evolução motora (versão 1.3).
//
// É uma checklist clínica da Respira Kids para descrever o desempenho e
// acompanhá-lo entre sessões. NÃO é escala diagnóstica, não gera pontuação
// de desenvolvimento e não reproduz itens da AIMS. As janelas de idade servem
// só para sugerir o que mostrar primeiro (referência: janelas de aquisição de
// marcos da OMS); a fisio pode acompanhar qualquer habilidade.
//
// Conteúdo clínico revisável pela equipe: mudar aqui muda a tela e o texto.

import type { AreaMotora, TipoMedidaMotora } from '@/types/evolucao-clinica';

// ------------------------------------------------------------- habilidades

export type EstadoHabilidade =
  | 'nao_observado'
  | 'nao_realiza'
  | 'com_assistencia'
  | 'independente';

export type ConsistenciaHabilidade =
  | 'emergente'
  | 'inconsistente'
  | 'consistente';
export type NivelAssistencia = 'minima' | 'moderada' | 'maxima';
export type SimetriaMovimento =
  | 'simetrico'
  | 'predominio_direito'
  | 'predominio_esquerdo';
export type ControlePostural = 'estavel' | 'oscilante' | 'com_compensacoes';
export type TransferenciaPeso =
  | 'bilateral'
  | 'predominio_direito'
  | 'predominio_esquerdo';
export type ParticipacaoHabilidade = 'ativa' | 'variavel' | 'limitada';
export type LadoHabilidade = 'direito' | 'esquerdo' | 'ambos';

export type MetricaHabilidade =
  | 'tempo_s'
  | 'graus'
  | 'tentativas'
  | 'sucessos'
  | 'distancia_cm'
  | 'passos';

export const UNIDADE_METRICA: Record<MetricaHabilidade, string> = {
  tempo_s: 's',
  graus: '°',
  tentativas: '',
  sucessos: '',
  distancia_cm: 'cm',
  passos: '',
};

export type GrupoHabilidade =
  | 'controle_cervical'
  | 'supino'
  | 'prono'
  | 'rolar'
  | 'sentar'
  | 'transicoes'
  | 'quadrupedia_deslocamento'
  | 'ortostatismo'
  | 'marcha';

export const GRUPOS_HABILIDADE: { id: GrupoHabilidade; nome: string }[] = [
  { id: 'controle_cervical', nome: 'Controle cervical' },
  { id: 'supino', nome: 'Supino' },
  { id: 'prono', nome: 'Prono' },
  { id: 'rolar', nome: 'Rolar' },
  { id: 'sentar', nome: 'Sentar' },
  { id: 'transicoes', nome: 'Transições' },
  { id: 'quadrupedia_deslocamento', nome: 'Quadrupedia e deslocamento' },
  { id: 'ortostatismo', nome: 'Ortostatismo' },
  { id: 'marcha', nome: 'Marcha' },
];

export interface MetricaDaHabilidade {
  id: MetricaHabilidade;
  rotulo: string;
}

export interface HabilidadeCatalogo {
  id: string;
  nome: string;
  grupo: GrupoHabilidade;
  /** Faixa típica (meses) em que costuma ser trabalhada; só para sugerir */
  idade: [number, number];
  /** Medidas quantitativas possíveis (nenhuma é obrigatória) */
  metricas: MetricaDaHabilidade[];
  /** A lateralidade importa (registrar o lado) */
  porLado?: boolean;
  /** Áreas em que costuma aparecer além de desenvolvimento motor */
  areas?: AreaMotora[];
}

const TEMPO = (rotulo = 'Tempo de sustentação'): MetricaDaHabilidade => ({
  id: 'tempo_s',
  rotulo,
});
const TENTATIVAS: MetricaDaHabilidade[] = [
  { id: 'tentativas', rotulo: 'Tentativas' },
  { id: 'sucessos', rotulo: 'Execuções bem-sucedidas' },
];
const DISTANCIA: MetricaDaHabilidade = {
  id: 'distancia_cm',
  rotulo: 'Distância',
};
const PASSOS: MetricaDaHabilidade = { id: 'passos', rotulo: 'Passos' };

export const HABILIDADES: HabilidadeCatalogo[] = [
  // Controle cervical
  {
    id: 'cervical_sustentacao_prono',
    nome: 'Sustentação cervical em prono',
    grupo: 'controle_cervical',
    idade: [0, 6],
    metricas: [TEMPO(), { id: 'graus', rotulo: 'Elevação da cabeça' }],
    areas: ['torcicolo'],
  },
  {
    id: 'cervical_alinhamento',
    nome: 'Alinhamento da cabeça na linha média',
    grupo: 'controle_cervical',
    idade: [0, 6],
    metricas: [TEMPO('Tempo na linha média')],
    areas: ['torcicolo', 'assimetria_craniana'],
  },
  {
    id: 'cervical_rotacao_ativa',
    nome: 'Rotação ativa da cabeça',
    grupo: 'controle_cervical',
    idade: [0, 8],
    metricas: [{ id: 'graus', rotulo: 'Amplitude' }],
    porLado: true,
    areas: ['torcicolo'],
  },
  {
    id: 'cervical_inclinacao_ativa',
    nome: 'Inclinação ativa da cabeça',
    grupo: 'controle_cervical',
    idade: [0, 8],
    metricas: [{ id: 'graus', rotulo: 'Amplitude' }],
    porLado: true,
    areas: ['torcicolo'],
  },
  {
    id: 'visual_acompanhamento',
    nome: 'Acompanhamento visual',
    grupo: 'controle_cervical',
    idade: [0, 4],
    metricas: [{ id: 'graus', rotulo: 'Amplitude do acompanhamento' }],
    porLado: true,
  },
  {
    id: 'cervical_tracao_sentar',
    nome: 'Controle cervical na tração para sentar',
    grupo: 'controle_cervical',
    idade: [2, 7],
    metricas: [],
  },
  {
    id: 'cervical_endireitamento',
    nome: 'Endireitamento da cabeça',
    grupo: 'controle_cervical',
    idade: [3, 9],
    metricas: [],
    porLado: true,
    areas: ['torcicolo'],
  },
  // Supino
  {
    id: 'supino_maos_linha_media',
    nome: 'Mãos na linha média',
    grupo: 'supino',
    idade: [2, 6],
    metricas: [],
  },
  {
    id: 'mao_na_boca',
    nome: 'Mão na boca',
    grupo: 'supino',
    idade: [2, 5],
    metricas: [],
    porLado: true,
  },
  {
    id: 'pe_na_boca',
    nome: 'Pé na boca',
    grupo: 'supino',
    idade: [5, 8],
    metricas: [],
    porLado: true,
  },
  {
    id: 'alcance_objetos',
    nome: 'Alcance de objetos',
    grupo: 'supino',
    idade: [3, 9],
    metricas: TENTATIVAS,
    porLado: true,
  },
  {
    id: 'supino_exploracao_pes',
    nome: 'Exploração dos pés',
    grupo: 'supino',
    idade: [4, 8],
    metricas: [],
  },
  {
    id: 'supino_alcance',
    nome: 'Alcance de brinquedos em supino',
    grupo: 'supino',
    idade: [3, 7],
    metricas: TENTATIVAS,
    porLado: true,
  },
  {
    id: 'supino_movimentos_simetricos',
    nome: 'Movimentos simétricos de membros',
    grupo: 'supino',
    idade: [0, 6],
    metricas: [],
    areas: ['torcicolo'],
  },
  // Prono
  {
    id: 'prono_permanencia',
    nome: 'Permanência em prono',
    grupo: 'prono',
    idade: [0, 8],
    metricas: [TEMPO('Tempo de permanência')],
    areas: ['torcicolo', 'assimetria_craniana'],
  },
  {
    id: 'prono_apoio_antebracos',
    nome: 'Esfinge (apoio em antebraços)',
    grupo: 'prono',
    idade: [2, 6],
    metricas: [TEMPO('Tempo de apoio')],
  },
  {
    id: 'prono_apoio_maos',
    nome: 'Apoio em mãos (braços estendidos)',
    grupo: 'prono',
    idade: [4, 8],
    metricas: [TEMPO('Tempo de apoio')],
  },
  {
    id: 'prono_transferencia_peso',
    nome: 'Transferência de peso em prono',
    grupo: 'prono',
    idade: [4, 8],
    metricas: [],
    porLado: true,
  },
  {
    id: 'prono_alcance',
    nome: 'Alcance em prono',
    grupo: 'prono',
    idade: [4, 9],
    metricas: TENTATIVAS,
    porLado: true,
  },
  // Rolar
  {
    id: 'rolar_supino_lateral',
    nome: 'Rolar de supino para lateral',
    grupo: 'rolar',
    idade: [3, 6],
    metricas: TENTATIVAS,
    porLado: true,
  },
  {
    id: 'rolar_supino_prono',
    nome: 'Rolar de supino para prono',
    grupo: 'rolar',
    idade: [4, 8],
    metricas: TENTATIVAS,
    porLado: true,
  },
  {
    id: 'rolar_prono_supino',
    nome: 'Desrolar (de prono para supino)',
    grupo: 'rolar',
    idade: [4, 8],
    metricas: TENTATIVAS,
    porLado: true,
  },
  // Sentar
  {
    id: 'sentar_com_apoio',
    nome: 'Sentar com apoio',
    grupo: 'sentar',
    idade: [4, 8],
    metricas: [TEMPO('Tempo sentado')],
  },
  {
    id: 'sentar_sem_apoio',
    nome: 'Sentar sem apoio',
    grupo: 'sentar',
    idade: [5, 10],
    metricas: [TEMPO('Tempo sem apoio')],
  },
  {
    id: 'sentar_reacoes',
    nome: 'Equilíbrio e reações posturais sentado',
    grupo: 'sentar',
    idade: [6, 11],
    metricas: [],
    porLado: true,
  },
  // Transições
  {
    id: 'transicao_deitado_sentado',
    nome: 'Deitado para sentado',
    grupo: 'transicoes',
    idade: [6, 11],
    metricas: TENTATIVAS,
  },
  {
    id: 'transicao_sentado_quatro_apoios',
    nome: 'Do sentar para o gatas (sereia)',
    grupo: 'transicoes',
    idade: [7, 11],
    metricas: TENTATIVAS,
  },
  {
    id: 'transicao_puxar_para_pe',
    nome: 'Puxar-se para ficar em pé',
    grupo: 'transicoes',
    idade: [7, 12],
    metricas: TENTATIVAS,
  },
  // Quadrupedia e deslocamento
  {
    id: 'quadrupedia_sustentacao',
    nome: 'Postura de gatas (quatro apoios)',
    grupo: 'quadrupedia_deslocamento',
    idade: [6, 11],
    metricas: [TEMPO()],
  },
  {
    id: 'deslocamento_arrastar',
    nome: 'Arrastar ou pivotear',
    grupo: 'quadrupedia_deslocamento',
    idade: [6, 11],
    metricas: [DISTANCIA],
  },
  {
    id: 'deslocamento_pivotear',
    nome: 'Pivotear',
    grupo: 'quadrupedia_deslocamento',
    idade: [5, 9],
    metricas: [],
    porLado: true,
  },
  {
    id: 'deslocamento_engatinhar',
    nome: 'Engatinhar',
    grupo: 'quadrupedia_deslocamento',
    idade: [6, 13],
    metricas: [DISTANCIA],
  },
  // Ortostatismo
  {
    id: 'ajoelhado',
    nome: 'Ajoelhado',
    grupo: 'ortostatismo',
    idade: [8, 13],
    metricas: [TEMPO('Tempo ajoelhado')],
  },
  {
    id: 'semi_ajoelhado',
    nome: 'Semiajoelhado',
    grupo: 'ortostatismo',
    idade: [9, 15],
    metricas: [TEMPO('Tempo semiajoelhado')],
    porLado: true,
  },
  {
    id: 'em_pe_com_apoio',
    nome: 'Em pé com apoio',
    grupo: 'ortostatismo',
    idade: [6, 12],
    metricas: [TEMPO('Tempo em pé')],
  },
  {
    id: 'em_pe_sem_apoio',
    nome: 'Em pé sem apoio',
    grupo: 'ortostatismo',
    idade: [8, 17],
    metricas: [TEMPO('Tempo em pé')],
  },
  {
    id: 'marcha_lateral',
    nome: 'Marcha lateral com apoio',
    grupo: 'ortostatismo',
    idade: [8, 14],
    metricas: [PASSOS],
  },
  // Marcha
  {
    id: 'marcha_com_apoio',
    nome: 'Passos com apoio',
    grupo: 'marcha',
    idade: [8, 14],
    metricas: [PASSOS, DISTANCIA],
  },
  {
    id: 'marcha_independente',
    nome: 'Passos sem apoio (marcha independente)',
    grupo: 'marcha',
    idade: [9, 18],
    metricas: [PASSOS, DISTANCIA],
  },
  {
    id: 'marcha_habilidades_posteriores',
    nome: 'Habilidades após a marcha (agachar, subir, correr)',
    grupo: 'marcha',
    idade: [14, 36],
    metricas: [],
  },
];

export const HABILIDADE_POR_ID: Record<string, HabilidadeCatalogo> =
  Object.fromEntries(HABILIDADES.map((h) => [h.id, h]));

// --------------------------------------------------- rótulos de registro

export const ESTADOS_HABILIDADE: { id: EstadoHabilidade; rotulo: string }[] = [
  { id: 'nao_observado', rotulo: 'Não observado hoje' },
  { id: 'nao_realiza', rotulo: 'Não realiza' },
  { id: 'com_assistencia', rotulo: 'Com assistência' },
  { id: 'independente', rotulo: 'Independente' },
];

export const ROTULO_ESTADO: Record<EstadoHabilidade, string> =
  Object.fromEntries(ESTADOS_HABILIDADE.map((e) => [e.id, e.rotulo])) as Record<
    EstadoHabilidade,
    string
  >;

export const CONSISTENCIAS: { id: ConsistenciaHabilidade; rotulo: string }[] = [
  { id: 'emergente', rotulo: 'Emergente' },
  { id: 'inconsistente', rotulo: 'Inconsistente' },
  { id: 'consistente', rotulo: 'Consistente' },
];

export const ASSISTENCIAS: { id: NivelAssistencia; rotulo: string }[] = [
  { id: 'minima', rotulo: 'Mínima' },
  { id: 'moderada', rotulo: 'Moderada' },
  { id: 'maxima', rotulo: 'Máxima' },
];

export const SIMETRIAS: { id: SimetriaMovimento; rotulo: string }[] = [
  { id: 'simetrico', rotulo: 'Simétrico' },
  { id: 'predominio_direito', rotulo: 'Predomínio direito' },
  { id: 'predominio_esquerdo', rotulo: 'Predomínio esquerdo' },
];

export const CONTROLES: { id: ControlePostural; rotulo: string }[] = [
  { id: 'estavel', rotulo: 'Estável' },
  { id: 'oscilante', rotulo: 'Oscilante' },
  { id: 'com_compensacoes', rotulo: 'Com compensações' },
];

export const TRANSFERENCIAS: { id: TransferenciaPeso; rotulo: string }[] = [
  { id: 'bilateral', rotulo: 'Bilateral' },
  { id: 'predominio_direito', rotulo: 'Predomínio à direita' },
  { id: 'predominio_esquerdo', rotulo: 'Predomínio à esquerda' },
];

export const PARTICIPACOES_HABILIDADE: {
  id: ParticipacaoHabilidade;
  rotulo: string;
}[] = [
  { id: 'ativa', rotulo: 'Ativa' },
  { id: 'variavel', rotulo: 'Variável' },
  { id: 'limitada', rotulo: 'Limitada' },
];

export const LADOS: { id: LadoHabilidade; rotulo: string }[] = [
  { id: 'ambos', rotulo: 'Ambos' },
  { id: 'direito', rotulo: 'Direito' },
  { id: 'esquerdo', rotulo: 'Esquerdo' },
];

// ----------------------------------------------------------- intervenções

export interface FinalidadeIntervencao {
  id: string;
  nome: string;
  exemplo: string;
  areas?: AreaMotora[];
}

export const FINALIDADES: FinalidadeIntervencao[] = [
  {
    id: 'organizacao_postural',
    nome: 'Organização e alinhamento postural',
    exemplo:
      'Facilitação do alinhamento, posicionamento terapêutico, ajustes de suporte',
  },
  {
    id: 'controle_cervical',
    nome: 'Controle cervical',
    exemplo: 'Rotação ativa, endireitamento, controle antigravitacional',
    areas: ['torcicolo', 'desenvolvimento_motor'],
  },
  {
    id: 'mobilidade_cervical',
    nome: 'Mobilidade cervical',
    exemplo: 'Ganho de amplitude cervical, conforme indicação',
    areas: ['torcicolo'],
  },
  {
    id: 'controle_tronco',
    nome: 'Controle de tronco',
    exemplo: 'Facilitação de estabilidade e ajustes posturais',
  },
  {
    id: 'simetria',
    nome: 'Simetria',
    exemplo:
      'Estímulos bilaterais, transferência de peso, exploração dos dois lados',
  },
  {
    id: 'desenvolvimento_funcional',
    nome: 'Desenvolvimento funcional',
    exemplo: 'Rolar, sentar, transições, quadrupedia e deslocamento',
    areas: ['desenvolvimento_motor'],
  },
  {
    id: 'integracao_sensorio_motora',
    nome: 'Integração sensório-motora',
    exemplo: 'Estímulos visuais, táteis e proprioceptivos conforme indicação',
  },
];

export const FINALIDADE_POR_ID: Record<string, FinalidadeIntervencao> =
  Object.fromEntries(FINALIDADES.map((f) => [f.id, f]));

export const ABORDAGENS: { id: string; nome: string }[] = [
  { id: 'rta', nome: 'RTA (Reequilíbrio Toracoabdominal)' },
  { id: 'busquet', nome: 'Busquet (Cadeias Fisiológicas)' },
  { id: 'bobath', nome: 'Bobath (Neurodesenvolvimento)' },
];

export const ABORDAGEM_CURTA: Record<string, string> = {
  rta: 'RTA',
  busquet: 'Busquet',
  bobath: 'Bobath',
};

export const REGIOES: { id: string; nome: string }[] = [
  { id: 'cranio', nome: 'Crânio' },
  { id: 'cervical', nome: 'Cervical' },
  { id: 'tronco', nome: 'Tronco' },
  { id: 'cintura_escapular', nome: 'Cintura escapular' },
  { id: 'membros_superiores', nome: 'Membros superiores' },
  { id: 'pelve', nome: 'Pelve' },
  { id: 'membros_inferiores', nome: 'Membros inferiores' },
  { id: 'global', nome: 'Global' },
];

export const RECURSOS: { id: string; nome: string }[] = [
  { id: 'terapia_manual', nome: 'Terapia manual' },
  { id: 'estimulo_motor', nome: 'Estímulo motor' },
  { id: 'posicionamento', nome: 'Posicionamento terapêutico' },
  { id: 'atividade_ludica', nome: 'Atividade lúdica / brinquedos' },
  { id: 'estimulos_visuais_auditivos', nome: 'Estímulos visuais e auditivos' },
  {
    id: 'estimulos_tateis_proprioceptivos',
    nome: 'Estímulos táteis e proprioceptivos',
  },
  { id: 'bandagem_elastica', nome: 'Bandagem elástica' },
];

// Fora da tela, mas lidos em registros antigos
export const RECURSOS_ANTIGOS: { id: string; nome: string }[] = [
  { id: 'facilitacao_manual', nome: 'Facilitação manual' },
];

export const nomeDe = (lista: { id: string; nome: string }[], id: string) =>
  lista.find((x) => x.id === id)?.nome ?? id;

// --------------------------------------------------------------- resposta

export const PARTICIPACOES_SESSAO: {
  id: 'boa' | 'variavel' | 'limitada';
  rotulo: string;
}[] = [
  { id: 'boa', rotulo: 'Boa participação' },
  { id: 'variavel', rotulo: 'Participação variável' },
  { id: 'limitada', rotulo: 'Participação limitada' },
];

export const OCORRENCIAS_SESSAO: { id: string; rotulo: string }[] = [
  { id: 'choro_irritabilidade', rotulo: 'Choro ou irritabilidade' },
  { id: 'cansaco', rotulo: 'Sinais de cansaço' },
  { id: 'pausas', rotulo: 'Necessitou de pausas' },
  { id: 'sonolencia', rotulo: 'Sonolência' },
];

export type ResultadoFuncional =
  | 'progresso'
  | 'manteve'
  | 'mais_dificuldade'
  | 'nao_comparavel';

export const RESULTADOS_FUNCIONAIS: {
  id: ResultadoFuncional;
  rotulo: string;
}[] = [
  { id: 'progresso', rotulo: 'Progresso observado' },
  { id: 'manteve', rotulo: 'Manteve o desempenho' },
  { id: 'mais_dificuldade', rotulo: 'Maior dificuldade' },
  { id: 'nao_comparavel', rotulo: 'Não foi possível comparar' },
];

// "Não medi hoje": motivos rápidos. "Não tolerou a avaliação" (achado da
// tentativa) é diferente de "choro ou irritabilidade" (comportamento).
export const MOTIVOS_NAO_MEDIU = [
  'Criança dormindo ou sonolenta',
  'Choro ou irritabilidade',
  'Não tolerou a avaliação',
  'Intercorrência clínica',
  'Priorizada outra demanda',
  'Tempo insuficiente',
  'Equipamento indisponível',
  'Solicitação do responsável',
];

// --------------------------------------------------------------- objetivos

export type MedidaIndicador =
  | 'gonio_dif_rotacao_passiva'
  | 'gonio_dif_rotacao_ativa'
  | 'gonio_dif_inclinacao_passiva'
  | 'mfs_dif'
  | 'cvai'
  | 'cva'
  | 'ci';

export const MEDIDAS_INDICADOR: {
  id: MedidaIndicador;
  nome: string;
  unidade: string;
  area: AreaMotora;
}[] = [
  {
    id: 'gonio_dif_rotacao_passiva',
    nome: 'Diferença de rotação cervical passiva (D × E)',
    unidade: '°',
    area: 'torcicolo',
  },
  {
    id: 'gonio_dif_rotacao_ativa',
    nome: 'Diferença de rotação cervical ativa (D × E)',
    unidade: '°',
    area: 'torcicolo',
  },
  {
    id: 'gonio_dif_inclinacao_passiva',
    nome: 'Diferença de inclinação cervical passiva (D × E)',
    unidade: '°',
    area: 'torcicolo',
  },
  {
    id: 'mfs_dif',
    nome: 'Diferença na MFS (D × E)',
    unidade: '',
    area: 'torcicolo',
  },
  { id: 'cvai', nome: 'CVAI', unidade: '%', area: 'assimetria_craniana' },
  { id: 'cva', nome: 'CVA', unidade: 'mm', area: 'assimetria_craniana' },
  {
    id: 'ci',
    nome: 'Índice cefálico (CI)',
    unidade: '%',
    area: 'assimetria_craniana',
  },
];

export type IndicadorObjetivo =
  | {
      tipo: 'habilidade';
      habilidade: string;
      metrica?: MetricaHabilidade;
      lado?: LadoHabilidade;
    }
  | { tipo: 'medida'; medida: MedidaIndicador };

export interface SugestaoObjetivo {
  descricao: string;
  areas: AreaMotora[];
  indicador: IndicadorObjetivo | null;
}

/**
 * Objetivo do catálogo. Aparece na área em que é trabalhado; tocar nele
 * mostra só a habilidade e as medidas que ele acompanha.
 */
export interface ObjetivoCatalogo {
  id: string;
  descricao: string;
  area: AreaMotora;
  indicador: IndicadorObjetivo | null;
  /** Medidas que aparecem quando o objetivo é trabalhado na sessão */
  medidas: TipoMedidaMotora[];
  /** Região do corpo trabalhada (id em REGIOES); gravada sem aparecer na tela */
  regiao: string;
}

const H = (
  habilidade: string,
  metrica?: MetricaHabilidade
): IndicadorObjetivo =>
  metrica
    ? { tipo: 'habilidade', habilidade, metrica }
    : { tipo: 'habilidade', habilidade };

const DESENV: TipoMedidaMotora[] = ['desenvolvimento_motor'];

const ord = (a: ObjetivoCatalogo, b: ObjetivoCatalogo) =>
  a.descricao.localeCompare(b.descricao, 'pt-BR');

const LISTA_OBJETIVOS: ObjetivoCatalogo[] = [
  // Torcicolo
  {
    id: 'cabeca_linha_media',
    descricao: 'Cabeça alinhada na linha média',
    area: 'torcicolo',
    indicador: H('cervical_alinhamento', 'tempo_s'),
    medidas: ['fsos2'],
    regiao: 'cervical',
  },
  {
    id: 'inclinacao_ativa',
    descricao: 'Inclinação ativa da cabeça para os dois lados',
    area: 'torcicolo',
    indicador: H('cervical_inclinacao_ativa', 'graus'),
    medidas: ['goniometria', 'mfs'],
    regiao: 'cervical',
  },
  {
    id: 'reduzir_dif_rotacao',
    descricao: 'Reduzir a diferença de rotação cervical entre os lados',
    area: 'torcicolo',
    indicador: { tipo: 'medida', medida: 'gonio_dif_rotacao_passiva' },
    medidas: ['goniometria', 'tensao_neuromeningea'],
    regiao: 'cervical',
  },
  {
    id: 'rotacao_ativa',
    descricao: 'Rotação ativa da cabeça para os dois lados',
    area: 'torcicolo',
    indicador: H('cervical_rotacao_ativa', 'graus'),
    medidas: ['goniometria', 'fsos2'],
    regiao: 'cervical',
  },
  // Assimetria craniana
  {
    id: 'reduzir_braquicefalia',
    descricao: 'Reduzir a braquicefalia (índice cefálico)',
    area: 'assimetria_craniana',
    indicador: { tipo: 'medida', medida: 'ci' },
    medidas: ['craniometria'],
    regiao: 'cranio',
  },
  {
    id: 'reduzir_plagiocefalia',
    descricao: 'Reduzir a plagiocefalia (CVAI)',
    area: 'assimetria_craniana',
    indicador: { tipo: 'medida', medida: 'cvai' },
    medidas: ['craniometria'],
    regiao: 'cranio',
  },
  {
    id: 'tempo_prono',
    descricao: 'Aumentar o tempo em prono',
    area: 'assimetria_craniana',
    indicador: H('prono_permanencia', 'tempo_s'),
    medidas: [],
    regiao: 'tronco',
  },
  // Desenvolvimento motor
  ...(
    [
      [
        'acompanhamento_visual',
        'Acompanhamento visual',
        H('visual_acompanhamento'),
        'cervical',
      ],
      ['ajoelhado', 'Ajoelhado', H('ajoelhado', 'tempo_s'), 'pelve'],
      [
        'alcance_objetos',
        'Alcance de objetos',
        H('alcance_objetos'),
        'membros_superiores',
      ],
      [
        'controle_cervical_prono',
        'Controle cervical em prono',
        H('cervical_sustentacao_prono', 'tempo_s'),
        'cervical',
      ],
      [
        'passos_com_apoio',
        'Dar passos com apoio',
        H('marcha_com_apoio', 'passos'),
        'membros_inferiores',
      ],
      [
        'passos_sem_apoio',
        'Dar passos sem apoio',
        H('marcha_independente', 'passos'),
        'membros_inferiores',
      ],
      [
        'desrolar',
        'Desrolar (de prono para supino)',
        H('rolar_prono_supino'),
        'tronco',
      ],
      ['engatinhar', 'Engatinhar', H('deslocamento_engatinhar'), 'global'],
      [
        'esfinge',
        'Esfinge (apoio em antebraços)',
        H('prono_apoio_antebracos', 'tempo_s'),
        'cintura_escapular',
      ],
      [
        'em_pe_com_apoio',
        'Ficar em pé com apoio',
        H('em_pe_com_apoio', 'tempo_s'),
        'membros_inferiores',
      ],
      [
        'em_pe_sem_apoio',
        'Ficar em pé sem apoio',
        H('em_pe_sem_apoio', 'tempo_s'),
        'membros_inferiores',
      ],
      ['mao_na_boca', 'Mão na boca', H('mao_na_boca'), 'membros_superiores'],
      ['pe_na_boca', 'Pé na boca', H('pe_na_boca'), 'membros_inferiores'],
      ['pivotear', 'Pivotear', H('deslocamento_pivotear'), 'tronco'],
      [
        'postura_gatas',
        'Postura de gatas',
        H('quadrupedia_sustentacao', 'tempo_s'),
        'cintura_escapular',
      ],
      ['rolar', 'Rolar para os dois lados', H('rolar_supino_prono'), 'tronco'],
      [
        'semi_ajoelhado',
        'Semiajoelhado',
        H('semi_ajoelhado', 'tempo_s'),
        'pelve',
      ],
      [
        'sentar_com_apoio',
        'Sentar com apoio',
        H('sentar_com_apoio', 'tempo_s'),
        'tronco',
      ],
      [
        'sentar_sem_apoio',
        'Sentar sem apoio',
        H('sentar_sem_apoio', 'tempo_s'),
        'tronco',
      ],
      [
        'deitado_sentado',
        'Transição de deitado para sentado',
        H('transicao_deitado_sentado'),
        'tronco',
      ],
      [
        'sereia',
        'Transição do sentar para o gatas (sereia)',
        H('transicao_sentado_quatro_apoios'),
        'pelve',
      ],
    ] as [string, string, IndicadorObjetivo, string][]
  ).map(([id, descricao, indicador, regiao]) => ({
    id,
    descricao,
    area: 'desenvolvimento_motor' as AreaMotora,
    indicador,
    medidas: DESENV,
    regiao,
  })),
];

/** Em ordem alfabética dentro de cada área */
export const OBJETIVOS_CATALOGO: ObjetivoCatalogo[] = [...LISTA_OBJETIVOS].sort(
  ord
);

export const OBJETIVO_CATALOGO_POR_ID: Record<string, ObjetivoCatalogo> =
  Object.fromEntries(OBJETIVOS_CATALOGO.map((o) => [o.id, o]));

/** Para o editor de objetivos (avaliação e plano): o mesmo catálogo */
export const SUGESTOES_OBJETIVO: SugestaoObjetivo[] = OBJETIVOS_CATALOGO.map(
  (o) => ({ descricao: o.descricao, areas: [o.area], indicador: o.indicador })
);

// ------------------------------------------------------------ orientações

/** Exercícios para casa, por área (só os das áreas da sessão aparecem) */
export const EXERCICIOS_DOMICILIARES: {
  id: string;
  nome: string;
  areas: AreaMotora[];
}[] = [
  {
    id: 'alongamento_cervical',
    nome: 'Alongamento cervical (inclinação e rotação)',
    areas: ['torcicolo'],
  },
  {
    id: 'rotacao_com_estimulo',
    nome: 'Virar a cabeça atrás de brinquedo ou voz',
    areas: ['torcicolo'],
  },
  {
    id: 'carregar_de_lado',
    nome: 'Carregar de lado (posição de alongamento)',
    areas: ['torcicolo'],
  },
  {
    id: 'estimular_rolar',
    nome: 'Estimular o rolar para os dois lados',
    areas: ['desenvolvimento_motor'],
  },
  {
    id: 'estimular_sentar',
    nome: 'Estimular o sentar',
    areas: ['desenvolvimento_motor'],
  },
  {
    id: 'estimular_gatas',
    nome: 'Estimular o gatas e o engatinhar',
    areas: ['desenvolvimento_motor'],
  },
  {
    id: 'estimular_em_pe',
    nome: 'Estimular ficar em pé e dar passos',
    areas: ['desenvolvimento_motor'],
  },
];

export const TUMMY_VEZES = ['1x', '2x', '3x', '4x ou mais'] as const;
export const TUMMY_MINUTOS = [
  '5 min',
  '10 min',
  '15 min',
  '20 min ou mais',
] as const;
export type TummyVezes = (typeof TUMMY_VEZES)[number];
export type TummyMinutos = (typeof TUMMY_MINUTOS)[number];

/** "3x ao dia, 10 min cada" (texto também gravado no campo antigo) */
export function textoTummyTime(
  vezes?: TummyVezes | null,
  minutos?: TummyMinutos | null
): string {
  if (!vezes && !minutos) return '';
  if (vezes && minutos) return `${vezes} ao dia, ${minutos} cada`;
  return vezes ? `${vezes} ao dia` : `${minutos} cada vez`;
}
