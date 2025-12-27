// AI dev note: API para Avaliações Clínicas TM/AC
// Funções para CRUD de avaliações de Torcicolo Muscular / Assimetria Craniana

import { supabase } from './supabase';
import type {
  AvaliacaoClinica,
  AvaliacaoClinicaCreate,
  AvaliacaoClinicaUpdate,
  AvaliacaoClinicaListItem,
} from '@/types/avaliacoes-clinicas';

// =====================================================
// FUNÇÕES DE LEITURA
// =====================================================

/**
 * Busca todas as avaliações de um paciente
 */
export async function fetchAvaliacoesByPaciente(
  pessoaId: string
): Promise<AvaliacaoClinicaListItem[]> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .select(
      `
      id,
      pessoa_id,
      data_avaliacao,
      status,
      grau_severidade,
      tipo_torcicolo,
      avaliador_id,
      created_at,
      updated_at,
      avaliador:pessoas!avaliacoes_clinicas_avaliador_id_fkey(nome)
    `
    )
    .eq('pessoa_id', pessoaId)
    .order('data_avaliacao', { ascending: false });

  if (error) {
    console.error('Erro ao buscar avaliações:', error);
    throw error;
  }

  // Mapear para incluir o nome do avaliador
  return (data || []).map((item) => {
    const avaliador = item.avaliador as unknown as { nome: string } | null;
    return {
      ...item,
      avaliador_nome: avaliador?.nome || undefined,
      avaliador: undefined,
    };
  }) as AvaliacaoClinicaListItem[];
}

/**
 * Busca uma avaliação específica por ID
 */
export async function fetchAvaliacaoById(
  id: string
): Promise<AvaliacaoClinica | null> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Não encontrado
    }
    console.error('Erro ao buscar avaliação:', error);
    throw error;
  }

  return data as AvaliacaoClinica;
}

// =====================================================
// FUNÇÕES DE CRIAÇÃO E ATUALIZAÇÃO
// =====================================================

/**
 * Cria uma nova avaliação
 */
export async function createAvaliacao(
  avaliacao: AvaliacaoClinicaCreate
): Promise<AvaliacaoClinica> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .insert(avaliacao)
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar avaliação:', error);
    throw error;
  }

  return data as AvaliacaoClinica;
}

/**
 * Atualiza uma avaliação existente
 */
export async function updateAvaliacao(
  id: string,
  updates: AvaliacaoClinicaUpdate
): Promise<AvaliacaoClinica> {
  const { data, error } = await supabase
    .from('avaliacoes_clinicas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar avaliação:', error);
    throw error;
  }

  return data as AvaliacaoClinica;
}

/**
 * Auto-save: Atualiza apenas os campos modificados (debounced no componente)
 */
export async function autoSaveAvaliacao(
  id: string,
  updates: Partial<AvaliacaoClinicaUpdate>
): Promise<void> {
  const { error } = await supabase
    .from('avaliacoes_clinicas')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Erro no auto-save:', error);
    throw error;
  }
}

/**
 * Finaliza uma avaliação (muda status para 'finalizada')
 */
export async function finalizarAvaliacao(
  id: string
): Promise<AvaliacaoClinica> {
  return updateAvaliacao(id, { status: 'finalizada' });
}

/**
 * Reabre uma avaliação para revisão
 */
export async function reabrirAvaliacao(id: string): Promise<AvaliacaoClinica> {
  return updateAvaliacao(id, { status: 'revisao' });
}

// =====================================================
// FUNÇÕES DE EXCLUSÃO
// =====================================================

/**
 * Deleta uma avaliação (apenas rascunhos podem ser deletados)
 */
export async function deleteAvaliacao(id: string): Promise<void> {
  // Primeiro verificar se é rascunho
  const avaliacao = await fetchAvaliacaoById(id);

  if (!avaliacao) {
    throw new Error('Avaliação não encontrada');
  }

  if (avaliacao.status !== 'rascunho') {
    throw new Error('Apenas avaliações em rascunho podem ser excluídas');
  }

  const { error } = await supabase
    .from('avaliacoes_clinicas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao deletar avaliação:', error);
    throw error;
  }
}

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Calcula a idade em semanas baseado na data de nascimento
 */
export function calcularIdadeSemanas(
  dataNascimento: string | Date | null
): number | null {
  if (!dataNascimento) return null;

  const nascimento = new Date(dataNascimento);
  const hoje = new Date();

  const diffMs = hoje.getTime() - nascimento.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const semanas = Math.floor(diffDays / 7);

  return semanas;
}

/**
 * Mapeamento de nomes técnicos para nomes legíveis (para exibir no tooltip)
 */
export const NOMES_CAMPOS: Record<string, string> = {
  // Pré-natal
  numero_gestacoes: 'Número de gestações',
  idade_gestacional_semanas: 'Idade gestacional',
  gestacoes_info: 'Informações das gestações',
  liquido_amniotico: 'Líquido amniótico',
  liquido_amniotico_outro: 'Líquido amniótico (especificar)',
  apresentacao_fetal: 'Apresentação fetal',
  apresentacao_fetal_outra: 'Apresentação fetal (especificar)',
  encaixe_precoce: 'Encaixe precoce',
  circular_cordao: 'Circular de cordão',
  intercorrencias_prenatais: 'Intercorrências pré-natais',
  // Peri-natal
  tipo_parto: 'Tipo de parto',
  instrumentos_parto: 'Instrumentos utilizados',
  instrumentos_parto_outro: 'Instrumentos (especificar)',
  duracao_trabalho_parto_minutos: 'Duração do trabalho de parto',
  intercorrencias_perinatais: 'Intercorrências peri-natais',
  // Pós-natal
  apgar_1min: 'APGAR 1 minuto',
  apgar_5min: 'APGAR 5 minutos',
  tempo_internacao_dias: 'Tempo de internação',
  local_internacao: 'Local de internação',
  local_internacao_outro: 'Local de internação (especificar)',
  assistencia_ventilatoria: 'Assistência ventilatória',
  tipos_assistencia_ventilatoria: 'Tipos de assistência ventilatória',
  tipo_assistencia_ventilatoria_outro: 'Assistência ventilatória (especificar)',
  tempo_assistencia_ventilatoria_dias: 'Tempo de assistência ventilatória',
  idade_inclinacao_cabeca_dias: 'Idade quando notou inclinação',
  // Marcos motores
  marcos_motores: 'Marcos motores atingidos',
  // Queixa
  queixa_principal: 'Queixa principal',
  // Torcicolo
  tipo_torcicolo: 'Tipo de torcicolo',
  lado_afetado_torcicolo: 'Lado afetado',
  torcicolo_detalhado: 'Detalhes do torcicolo',
  // Goniometria
  goniometria: 'Goniometria cervical',
  // MFS
  mfs_direito: 'MFS direito',
  mfs_esquerdo: 'MFS esquerdo',
  // Tensão
  tensao_neuromeningea: 'Tensão neuromeníngea',
  // Sensorial
  funcoes_sensoriais: 'Funções sensoriais',
  // Craniometria
  medidas_craniometricas: 'Medidas craniométricas',
  // Assimetria
  assimetria_craniana: 'Assimetria craniana',
  // FSOS2
  fsos2: 'FSOS-2',
  // Funcionalidade
  funcionalidade_cervical: 'Funcionalidade cervical',
  // Resposta postural
  resposta_postural: 'Resposta postural',
  // AIMS
  aims_detalhada: 'AIMS detalhada',
  // Severidade
  grau_severidade: 'Grau de severidade',
  severidade_calculada: 'Classificação de severidade',
  // Diagnóstico
  diagnostico_cinetico_funcional: 'Diagnóstico cinético-funcional',
  diagnostico_gerado: 'Diagnóstico gerado',
  // Objetivos
  objetivos_tratamento: 'Objetivos do tratamento',
  plano_tratamento: 'Plano de tratamento',
  reavaliacao_recomendada: 'Reavaliação recomendada',
  // Exames
  exames_complementares: 'Exames complementares',
};

/**
 * Retorna o nome legível de um campo
 */
export function getNomeCampo(campo: string): string {
  return NOMES_CAMPOS[campo] || campo.replace(/_/g, ' ');
}

/**
 * AI dev note: Campos condicionais - só são obrigatórios se outro campo tiver um valor específico
 * Formato: campo_condicional -> { dependeDe: campo_pai, valorRequerido: valor | array de valores }
 * Se valorRequerido for undefined, significa que o campo só é obrigatório se o pai estiver preenchido
 */
const CAMPOS_CONDICIONAIS: Record<
  string,
  { dependeDe: string; valorRequerido?: unknown | unknown[] }
> = {
  // Pré-natal: idade_gestacional só se não for gestação múltipla
  idade_gestacional_semanas: {
    dependeDe: 'gestacao_multipla',
    valorRequerido: false,
  },
  // gestacoes_info só se for gestação múltipla
  gestacoes_info: { dependeDe: 'gestacao_multipla', valorRequerido: true },
  // Campos "outro" só são obrigatórios se o campo principal for "outro"
  liquido_amniotico_outro: {
    dependeDe: 'liquido_amniotico',
    valorRequerido: 'outro',
  },
  apresentacao_fetal_outra: {
    dependeDe: 'apresentacao_fetal',
    valorRequerido: 'outra',
  },
  local_internacao_outro: {
    dependeDe: 'local_internacao',
    valorRequerido: 'outro',
  },
  instrumentos_parto_outro: {
    dependeDe: 'instrumentos_parto',
    valorRequerido: ['outro'],
  },
  tipo_assistencia_ventilatoria_outro: {
    dependeDe: 'tipos_assistencia_ventilatoria',
    valorRequerido: ['outro'],
  },
  // Assistência ventilatória só se boolean for true
  tipos_assistencia_ventilatoria: {
    dependeDe: 'assistencia_ventilatoria',
    valorRequerido: true,
  },
  tempo_assistencia_ventilatoria_dias: {
    dependeDe: 'assistencia_ventilatoria',
    valorRequerido: true,
  },
};

/**
 * Verifica se um campo condicional é obrigatório no contexto atual
 */
function isCampoObrigatorio(
  campo: string,
  avaliacao: AvaliacaoClinica
): boolean {
  const condicao = CAMPOS_CONDICIONAIS[campo];
  if (!condicao) return true; // Campo não condicional é sempre obrigatório

  const valorPai = avaliacao[condicao.dependeDe as keyof AvaliacaoClinica];

  // Se o valor requerido não for definido, o campo é obrigatório se o pai estiver preenchido
  if (condicao.valorRequerido === undefined) {
    return valorPai !== null && valorPai !== undefined && valorPai !== '';
  }

  // Verifica se o valor do pai corresponde ao valor requerido
  if (Array.isArray(condicao.valorRequerido)) {
    // Para arrays (ex: instrumentos_parto contém "outro")
    if (Array.isArray(valorPai)) {
      return condicao.valorRequerido.some((v) =>
        (valorPai as unknown[]).includes(v)
      );
    }
    return (condicao.valorRequerido as unknown[]).includes(valorPai);
  }

  return valorPai === condicao.valorRequerido;
}

/**
 * Verifica se um valor está preenchido
 */
function isValorPreenchido(valor: unknown): boolean {
  if (valor === null || valor === undefined || valor === '') return false;

  if (typeof valor === 'object') {
    if (Array.isArray(valor)) {
      return valor.length > 0;
    }
    if (Object.keys(valor as object).length > 0) {
      // Verificar se pelo menos um campo interno está preenchido
      return Object.values(valor as object).some(
        (v) => v !== null && v !== undefined && v !== ''
      );
    }
    return false;
  }

  return true;
}

/**
 * Verifica se uma seção está completa baseado nos campos preenchidos
 * Considera campos condicionais (ex: idade_gestacional só se não for gestação múltipla)
 */
export function verificarSecaoCompleta(
  avaliacao: AvaliacaoClinica,
  campos: string[]
): 'completo' | 'parcial' | 'vazio' {
  const resultado = verificarSecaoCompletaDetalhado(avaliacao, campos);
  return resultado.status;
}

/**
 * Verifica se uma seção está completa e retorna detalhes dos campos faltantes
 */
export function verificarSecaoCompletaDetalhado(
  avaliacao: AvaliacaoClinica,
  campos: string[]
): {
  status: 'completo' | 'parcial' | 'vazio';
  camposObrigatorios: string[];
  camposPreenchidos: string[];
  camposFaltantes: string[];
} {
  const camposObrigatorios: string[] = [];
  const camposPreenchidos: string[] = [];
  const camposFaltantes: string[] = [];

  for (const campo of campos) {
    // Verifica se o campo é obrigatório no contexto atual
    if (!isCampoObrigatorio(campo, avaliacao)) {
      continue; // Campo condicional não obrigatório, pula
    }

    camposObrigatorios.push(campo);

    const valor = avaliacao[campo as keyof AvaliacaoClinica];

    if (isValorPreenchido(valor)) {
      camposPreenchidos.push(campo);
    } else {
      camposFaltantes.push(campo);
    }
  }

  let status: 'completo' | 'parcial' | 'vazio';
  if (camposPreenchidos.length === 0) {
    status = 'vazio';
  } else if (camposFaltantes.length === 0) {
    status = 'completo';
  } else {
    status = 'parcial';
  }

  return {
    status,
    camposObrigatorios,
    camposPreenchidos,
    camposFaltantes,
  };
}

/**
 * Calcula o progresso geral da avaliação
 */
export function calcularProgressoAvaliacao(avaliacao: AvaliacaoClinica): {
  total: number;
  preenchidos: number;
  percentual: number;
} {
  const camposRelevantes = [
    'queixa_principal',
    'numero_gestacoes',
    'tipo_parto',
    'apgar_1min',
    'estado_emocional',
    'preferencia_rotacao_cervical',
    'tipo_torcicolo',
    'goniometria',
    'mfs_direito',
    'tensao_neuromeningea',
    'funcoes_sensoriais',
    'medidas_craniometricas',
    'assimetria_craniana',
    'tonus',
    'preferencia_manual',
    'fsos2',
    'funcionalidade_cervical',
    'landau',
    'aims',
    'grau_severidade',
    'exames_complementares',
    'diagnostico_cinetico_funcional',
    'objetivos_tratamento',
    'plano_tratamento',
    'reavaliacao_recomendada',
  ];

  let preenchidos = 0;

  for (const campo of camposRelevantes) {
    const valor = avaliacao[campo as keyof AvaliacaoClinica];
    if (valor !== null && valor !== undefined && valor !== '') {
      if (typeof valor === 'object') {
        if (Array.isArray(valor)) {
          if (valor.length > 0) preenchidos++;
        } else if (Object.keys(valor).length > 0) {
          preenchidos++;
        }
      } else {
        preenchidos++;
      }
    }
  }

  return {
    total: camposRelevantes.length,
    preenchidos,
    percentual: Math.round((preenchidos / camposRelevantes.length) * 100),
  };
}

/**
 * Obtém o label do grau de severidade
 */
export function getLabelGrauSeveridade(grau: number | null): string {
  const labels: Record<number, string> = {
    1: 'Pré-clínico',
    2: 'Leve precoce (3-6 sem)',
    3: 'Moderado precoce (7-12 sem)',
    4: 'Grave precoce (>3m)',
    5: 'Tardio leve',
    6: 'Tardio moderado',
    7: 'Tardio grave',
    8: 'Com nódulos',
  };

  return grau ? labels[grau] || 'Não classificado' : 'Não classificado';
}

/**
 * Obtém a cor do grau de severidade para UI
 */
export function getCorGrauSeveridade(
  grau: number | null
): 'green' | 'yellow' | 'orange' | 'red' | 'gray' {
  if (!grau) return 'gray';
  if (grau <= 2) return 'green';
  if (grau <= 4) return 'yellow';
  if (grau <= 6) return 'orange';
  return 'red';
}

/**
 * Formata a idade de forma amigável
 * - Até 30 dias: "12 dias"
 * - Acima de 30 dias: "1 mês e 3 dias"
 * - Acima de 1 ano: "2 anos, 3 meses e 1 dia"
 */
export function formatarIdade(dataNascimento: string | Date | null): string {
  if (!dataNascimento) return '';

  const nascimento = new Date(dataNascimento);
  const hoje = new Date();

  // Calcular diferença em milissegundos
  const diffMs = hoje.getTime() - nascimento.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Até 30 dias: mostrar apenas dias
  if (diffDays <= 30) {
    return diffDays === 1 ? '1 dia' : `${diffDays} dias`;
  }

  // Calcular anos, meses e dias
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  let meses = hoje.getMonth() - nascimento.getMonth();
  let dias = hoje.getDate() - nascimento.getDate();

  // Ajustar se os dias são negativos
  if (dias < 0) {
    meses--;
    // Pegar o último dia do mês anterior
    const ultimoDiaMesAnterior = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      0
    ).getDate();
    dias += ultimoDiaMesAnterior;
  }

  // Ajustar se os meses são negativos
  if (meses < 0) {
    anos--;
    meses += 12;
  }

  // Montar string de resultado
  const partes: string[] = [];

  if (anos > 0) {
    partes.push(anos === 1 ? '1 ano' : `${anos} anos`);
  }

  if (meses > 0) {
    partes.push(meses === 1 ? '1 mês' : `${meses} meses`);
  }

  if (dias > 0) {
    partes.push(dias === 1 ? '1 dia' : `${dias} dias`);
  }

  // Se não tem nada (nasceu hoje)
  if (partes.length === 0) {
    return '0 dias';
  }

  // Formatar com vírgulas e "e"
  if (partes.length === 1) {
    return partes[0];
  } else if (partes.length === 2) {
    return `${partes[0]} e ${partes[1]}`;
  } else {
    return `${partes[0]}, ${partes[1]} e ${partes[2]}`;
  }
}

/**
 * Formata a idade a partir de semanas (para exibição no modal)
 */
export function formatarIdadeSemanas(semanas: number | null): string {
  if (semanas === null || semanas === undefined) return '';

  const dias = semanas * 7;

  // Até 30 dias: mostrar apenas dias
  if (dias <= 30) {
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }

  // Calcular anos, meses e dias restantes
  const anos = Math.floor(dias / 365);
  const diasRestantes = dias % 365;
  const meses = Math.floor(diasRestantes / 30);
  const diasFinais = diasRestantes % 30;

  // Montar string de resultado
  const partes: string[] = [];

  if (anos > 0) {
    partes.push(anos === 1 ? '1 ano' : `${anos} anos`);
  }

  if (meses > 0) {
    partes.push(meses === 1 ? '1 mês' : `${meses} meses`);
  }

  if (diasFinais > 0 && partes.length < 2) {
    // Só mostrar dias se tiver no máximo 1 parte (anos ou meses)
    partes.push(diasFinais === 1 ? '1 dia' : `${diasFinais} dias`);
  }

  // Se não tem nada
  if (partes.length === 0) {
    return '0 dias';
  }

  // Formatar com vírgulas e "e"
  if (partes.length === 1) {
    return partes[0];
  } else if (partes.length === 2) {
    return `${partes[0]} e ${partes[1]}`;
  } else {
    return `${partes[0]}, ${partes[1]} e ${partes[2]}`;
  }
}
