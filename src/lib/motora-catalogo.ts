// Catálogo clínico da evolução motora (versão 1.3).
//
// É uma checklist clínica da Respira Kids para descrever o desempenho e
// acompanhá-lo entre sessões. NÃO é escala diagnóstica, não gera pontuação
// de desenvolvimento e não reproduz itens da AIMS. As janelas de idade servem
// só para sugerir o que mostrar primeiro (referência: janelas de aquisição de
// marcos da OMS); a fisio pode acompanhar qualquer habilidade.
//
// Conteúdo clínico revisável pela equipe: mudar aqui muda a tela e o texto.

import type { AreaMotora } from '@/types/evolucao-clinica';

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
    nome: 'Apoio em antebraços',
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
    nome: 'Rolar de prono para supino',
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
    nome: 'Sentado para quatro apoios',
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
    nome: 'Sustentação em quatro apoios',
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
    id: 'deslocamento_engatinhar',
    nome: 'Engatinhar',
    grupo: 'quadrupedia_deslocamento',
    idade: [6, 13],
    metricas: [DISTANCIA],
  },
  // Ortostatismo
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
    nome: 'Marcha independente',
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
  { id: 'cervical', nome: 'Cervical' },
  { id: 'tronco', nome: 'Tronco' },
  { id: 'cintura_escapular', nome: 'Cintura escapular' },
  { id: 'membros_superiores', nome: 'Membros superiores' },
  { id: 'pelve', nome: 'Pelve' },
  { id: 'membros_inferiores', nome: 'Membros inferiores' },
  { id: 'global', nome: 'Global' },
];

export const RECURSOS: { id: string; nome: string }[] = [
  { id: 'facilitacao_manual', nome: 'Facilitação manual' },
  { id: 'posicionamento', nome: 'Posicionamento terapêutico' },
  { id: 'atividade_ludica', nome: 'Atividade lúdica / brinquedos' },
  { id: 'estimulos_visuais_auditivos', nome: 'Estímulos visuais e auditivos' },
  {
    id: 'estimulos_tateis_proprioceptivos',
    nome: 'Estímulos táteis e proprioceptivos',
  },
  { id: 'bandagem_elastica', nome: 'Bandagem elástica' },
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
  | 'cva';

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

export const SUGESTOES_OBJETIVO: SugestaoObjetivo[] = [
  {
    descricao: 'Reduzir a diferença de rotação cervical entre os lados',
    areas: ['torcicolo'],
    indicador: { tipo: 'medida', medida: 'gonio_dif_rotacao_passiva' },
  },
  {
    descricao: 'Rotação ativa da cabeça para os dois lados',
    areas: ['torcicolo'],
    indicador: { tipo: 'habilidade', habilidade: 'cervical_rotacao_ativa' },
  },
  {
    descricao: 'Manter a cabeça alinhada na linha média',
    areas: ['torcicolo', 'assimetria_craniana'],
    indicador: { tipo: 'habilidade', habilidade: 'cervical_alinhamento' },
  },
  {
    descricao: 'Reduzir a assimetria craniana (CVAI)',
    areas: ['assimetria_craniana'],
    indicador: { tipo: 'medida', medida: 'cvai' },
  },
  {
    descricao: 'Aumentar o tempo de permanência em prono',
    areas: ['assimetria_craniana', 'torcicolo', 'desenvolvimento_motor'],
    indicador: {
      tipo: 'habilidade',
      habilidade: 'prono_permanencia',
      metrica: 'tempo_s',
    },
  },
  {
    descricao: 'Melhorar o controle cervical em prono',
    areas: ['desenvolvimento_motor', 'torcicolo'],
    indicador: {
      tipo: 'habilidade',
      habilidade: 'cervical_sustentacao_prono',
      metrica: 'tempo_s',
    },
  },
  {
    descricao: 'Apoio simétrico em antebraços',
    areas: ['desenvolvimento_motor'],
    indicador: { tipo: 'habilidade', habilidade: 'prono_apoio_antebracos' },
  },
  {
    descricao: 'Rolar para os dois lados',
    areas: ['desenvolvimento_motor'],
    indicador: { tipo: 'habilidade', habilidade: 'rolar_supino_prono' },
  },
  {
    descricao: 'Sentar sem apoio',
    areas: ['desenvolvimento_motor'],
    indicador: {
      tipo: 'habilidade',
      habilidade: 'sentar_sem_apoio',
      metrica: 'tempo_s',
    },
  },
  {
    descricao: 'Realizar a transição de deitado para sentado',
    areas: ['desenvolvimento_motor'],
    indicador: { tipo: 'habilidade', habilidade: 'transicao_deitado_sentado' },
  },
  {
    descricao: 'Ficar em pé com apoio',
    areas: ['desenvolvimento_motor'],
    indicador: {
      tipo: 'habilidade',
      habilidade: 'em_pe_com_apoio',
      metrica: 'tempo_s',
    },
  },
  {
    descricao: 'Dar passos com apoio',
    areas: ['desenvolvimento_motor'],
    indicador: {
      tipo: 'habilidade',
      habilidade: 'marcha_com_apoio',
      metrica: 'passos',
    },
  },
];
