// AI dev note: Perguntas da Pesquisa de Experiência Respira Kids
// Auto-avanço em single-choice e pediatra-search. Multi-choice, scale-10 e short-text
// exigem botão "Continuar".
//
// REGRAS ANTI-VIÉS — respeitar ao editar/incluir pergunta:
// 1. Nenhum ornamento (emoji, ícone, cor) em parte das alternativas: o que se
//    destaca visualmente é o que recebe o clique.
// 2. Enunciado não pode pressupor a resposta. "O que mais te surpreendeu
//    POSITIVAMENTE" e "O que você mais AMA" já entregam a conclusão pronta.
// 3. Toda lista de atributos precisa de alternativas negativas/neutras. Lista só
//    com adjetivo bom força elogio mesmo de quem está insatisfeita.
// 4. Escala fechada tem que ser simétrica: mesmo número de degraus para cada lado
//    (ex.: "muito mais" ... "muito menos" do que eu esperava).
// 5. Sempre existe saída: "Nada em especial" / "Ainda não tenho opinião formada".
// 6. Ordem: as notas (confiança e NPS) vêm ANTES do bloco de percepção de marca.
//    Responder 10 perguntas elogiosas antes do NPS inflava a nota (efeito priming).
//
// Os `value` são a chave gravada no banco e o que o dashboard agrega — nunca
// renomear um value existente, só acrescentar novos.

import type { SurveyQuestion } from '@/types/pesquisa-experiencia';

const PEDIATRA_OUTRO_VALUE = '__outro__';

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  // ============================================================
  // INÍCIO: jornada de descoberta (fatos, sem julgamento)
  // ============================================================
  {
    id: 'como_conheceu',
    type: 'single-choice',
    title: 'Como você conheceu a Respira Kids?',
    options: [
      { value: 'pediatra', label: 'Pediatra' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'google', label: 'Google' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'outra_mae', label: 'Outra mãe ou família' },
      { value: 'grupo_whatsapp', label: 'Grupo de WhatsApp' },
      { value: 'hospital', label: 'Hospital' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  // Quando "Pediatra" foi escolhido: busca + opção "Outro"
  {
    id: 'pediatra_id',
    type: 'pediatra-search',
    title: 'Qual pediatra te indicou a Respira Kids?',
    subtitle:
      'Pode digitar para buscar. Se não estiver na lista, escolha "Outro".',
    optional: true,
    visibleWhen: (r) => r.como_conheceu === 'pediatra',
  },
  {
    id: 'profissional_indicou',
    type: 'short-text',
    title: 'Qual profissional indicou a Respira Kids?',
    subtitle: 'Pode ser o nome de um especialista do hospital, por exemplo.',
    helper: 'Se preferir não responder, é só seguir.',
    optional: true,
    ctaLabel: 'Continuar',
    visibleWhen: (r) => r.como_conheceu === 'hospital',
  },
  {
    id: 'criterio_decisao',
    type: 'single-choice',
    title: 'O que foi decisivo para você escolher a Respira Kids?',
    options: [
      { value: 'confianca_profissional', label: 'Confiança no profissional' },
      { value: 'indicacao', label: 'Indicação de alguém' },
      {
        value: 'referencias_online',
        label: 'Referências online (Instagram, Google)',
      },
      { value: 'conveniencia', label: 'Conveniência (local, horários)' },
      { value: 'conteudo', label: 'Conteúdo nas redes sociais' },
      { value: 'preco', label: 'Preço / forma de pagamento' },
      { value: 'falta_alternativa', label: 'Não havia outra opção próxima' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'tempo_acompanhamento',
    type: 'single-choice',
    title: 'Há quanto tempo sua família é acompanhada pela Respira Kids?',
    options: [
      { value: 'primeira_consulta', label: 'Primeira consulta' },
      { value: 'menos_1_mes', label: 'Menos de 1 mês' },
      { value: '1_a_3_meses', label: '1 a 3 meses' },
      { value: '3_a_6_meses', label: '3 a 6 meses' },
      { value: 'mais_6_meses', label: 'Mais de 6 meses' },
      { value: 'mais_1_ano', label: 'Mais de 1 ano' },
    ],
  },
  {
    id: 'idade_filho',
    type: 'single-choice',
    title: 'Qual a idade do seu filho(a)?',
    options: [
      { value: '0_3_meses', label: '0 a 3 meses' },
      { value: '4_6_meses', label: '4 a 6 meses' },
      { value: '7_12_meses', label: '7 a 12 meses' },
      { value: '1_2_anos', label: '1 a 2 anos' },
      { value: '3_5_anos', label: '3 a 5 anos' },
      { value: 'acima_5_anos', label: 'Acima de 5 anos' },
    ],
  },
  {
    id: 'motivo_principal',
    type: 'single-choice',
    title: 'O que trouxe vocês até a Respira Kids?',
    subtitle: 'O motivo principal que fez você procurar a clínica.',
    options: [
      { value: 'respiratorio', label: 'Questão respiratória' },
      { value: 'assimetria_craniana', label: 'Assimetria craniana' },
      { value: 'torcicolo', label: 'Torcicolo' },
      { value: 'desenvolvimento_motor', label: 'Desenvolvimento motor' },
      { value: 'prematuridade', label: 'Prematuridade' },
      { value: 'atraso_motor', label: 'Atraso motor' },
      { value: 'introducao_alimentar', label: 'Introdução alimentar' },
      { value: 'outro', label: 'Outro' },
    ],
  },

  // ============================================================
  // DEMOGRAFIA: rápida e leve
  // ============================================================
  {
    id: 'quantidade_filhos',
    type: 'single-choice',
    title: 'Quantos filhos você tem?',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4_ou_mais', label: '4 ou mais' },
    ],
  },
  {
    id: 'faixa_etaria',
    type: 'single-choice',
    title: 'Qual sua faixa etária?',
    options: [
      { value: 'ate_25', label: 'Até 25 anos' },
      { value: '26_30', label: '26 a 30 anos' },
      { value: '31_35', label: '31 a 35 anos' },
      { value: '36_40', label: '36 a 40 anos' },
      { value: 'acima_40', label: 'Acima de 40 anos' },
    ],
  },
  {
    id: 'profissao',
    type: 'single-choice',
    title: 'Qual sua profissão?',
    options: [
      { value: 'empresaria', label: 'Empresária' },
      { value: 'servidora_publica', label: 'Servidora pública' },
      { value: 'profissional_saude', label: 'Profissional da saúde' },
      { value: 'advogada', label: 'Advogada' },
      { value: 'professora', label: 'Professora' },
      { value: 'engenheira', label: 'Engenheira' },
      { value: 'arquiteta', label: 'Arquiteta' },
      { value: 'administradora', label: 'Administradora' },
      { value: 'contadora', label: 'Contadora' },
      { value: 'designer', label: 'Designer / criativa' },
      { value: 'jornalista', label: 'Jornalista / comunicação' },
      { value: 'psicologa', label: 'Psicóloga / terapeuta' },
      { value: 'autonoma', label: 'Autônoma' },
      { value: 'estudante', label: 'Estudante' },
      { value: 'do_lar', label: 'Do lar' },
      { value: 'outro', label: 'Outro' },
    ],
  },

  // ============================================================
  // NOTAS (confiança + NPS) — antes de qualquer pergunta avaliativa,
  // para que a nota não seja contaminada pelo bloco de percepção de marca.
  // ============================================================
  {
    id: 'nota_confianca',
    type: 'scale-10',
    title: 'De 1 a 10, quanta confiança você sente na equipe da Respira Kids?',
    subtitle: '1 = nenhuma confiança · 10 = confiança total',
    ctaLabel: 'Continuar',
  },
  {
    id: 'nota_indicacao',
    type: 'scale-10',
    title:
      'De 1 a 10, qual a chance de você indicar a Respira Kids para outra família?',
    subtitle: '1 = não indicaria · 10 = indicaria com certeza',
    ctaLabel: 'Continuar',
  },

  // ============================================================
  // PERCEPÇÃO DE VALOR — escalas simétricas
  // ============================================================
  {
    id: 'entrega_atendimento',
    type: 'single-choice',
    title: 'Hoje você sente que o atendimento da Respira Kids entrega:',
    options: [
      { value: 'muito_mais', label: 'Muito mais do que eu esperava' },
      { value: 'mais', label: 'Mais do que eu esperava' },
      { value: 'exatamente', label: 'Exatamente o que eu esperava' },
      { value: 'menos', label: 'Menos do que eu esperava' },
      { value: 'muito_menos', label: 'Muito menos do que eu esperava' },
    ],
  },
  {
    id: 'comparacao_outras_experiencias',
    type: 'single-choice',
    title:
      'Comparando com outras experiências na área da saúde infantil, a Respira Kids parece:',
    options: [
      { value: 'muito_acima', label: 'Muito acima da média' },
      { value: 'acima', label: 'Acima da média' },
      { value: 'dentro_esperado', label: 'Dentro do esperado' },
      { value: 'abaixo_esperado', label: 'Abaixo da média' },
      { value: 'muito_abaixo', label: 'Muito abaixo da média' },
    ],
  },
  {
    id: 'traz_tranquilidade',
    type: 'single-choice',
    title:
      'Qual o efeito do acompanhamento da Respira Kids na tranquilidade da sua família?',
    options: [
      { value: 'muita_tranquilidade', label: 'Aumentou muito' },
      { value: 'sim', label: 'Aumentou' },
      { value: 'mais_ou_menos', label: 'Mudou pouco' },
      { value: 'nao_sinto', label: 'Não mudou nada' },
      { value: 'diminuiu', label: 'Diminuiu — ficamos mais preocupados' },
    ],
  },
  {
    id: 'custo_beneficio',
    type: 'single-choice',
    title:
      'De forma geral, como você percebe o custo-benefício da Respira Kids?',
    options: [
      { value: 'excelente', label: 'Excelente' },
      { value: 'muito_bom', label: 'Muito bom' },
      { value: 'bom', label: 'Bom' },
      { value: 'regular', label: 'Regular' },
      { value: 'ruim', label: 'Ruim' },
      { value: 'muito_ruim', label: 'Muito ruim' },
    ],
  },
  {
    id: 'o_que_vale_pena',
    type: 'multi-choice',
    title: 'O que mais importa para você no atendimento da Respira Kids?',
    subtitle: 'Pode escolher até 2.',
    maxSelections: 2,
    options: [
      { value: 'seguranca_confianca', label: 'Segurança e confiança' },
      { value: 'especializacao_infantil', label: 'Especialização infantil' },
      { value: 'atendimento_humanizado', label: 'Atendimento humanizado' },
      { value: 'resultados_percebidos', label: 'Resultados percebidos' },
      { value: 'explicacoes_orientacoes', label: 'Explicações e orientações' },
      { value: 'ambiente_clinica', label: 'Ambiente da clínica' },
      { value: 'disponibilidade_equipe', label: 'Disponibilidade da equipe' },
      {
        value: 'desenvolvimento_filho',
        label: 'Desenvolvimento do meu filho',
      },
      { value: 'preco', label: 'Preço' },
    ],
  },

  // ============================================================
  // PERCEPÇÃO DE MARCA — listas com alternativas dos dois lados
  // ============================================================
  {
    id: 'motivos_confianca',
    type: 'multi-choice',
    title: 'O que mais pesou na sua confiança na Respira Kids?',
    subtitle: 'Pode escolher até 2.',
    maxSelections: 2,
    options: [
      { value: 'atendimento_humanizado', label: 'Atendimento humanizado' },
      { value: 'explicacoes_claras', label: 'Explicações claras' },
      { value: 'especializacao_infantil', label: 'Especialização infantil' },
      { value: 'resultados', label: 'Resultados' },
      { value: 'conteudo_redes', label: 'Conteúdo das redes sociais' },
      { value: 'estrutura', label: 'Estrutura da clínica' },
      { value: 'indicacao_medica', label: 'Indicação médica' },
      { value: 'indicacao_outras_maes', label: 'Indicação de outras mães' },
      { value: 'nada_em_especial', label: 'Nada em especial' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'como_se_sente',
    type: 'multi-choice',
    title: 'Como a Respira Kids faz você se sentir?',
    subtitle: 'Marque o que se aplica — pode ser positivo ou negativo.',
    options: [
      { value: 'acolhida', label: 'Acolhida' },
      { value: 'insegura', label: 'Insegura' },
      { value: 'segura', label: 'Segura' },
      { value: 'ansiosa', label: 'Ansiosa' },
      { value: 'tranquila', label: 'Tranquila' },
      { value: 'pouco_ouvida', label: 'Pouco ouvida' },
      { value: 'bem_orientada', label: 'Bem orientada' },
      { value: 'confusa', label: 'Confusa com as orientações' },
      { value: 'confiante', label: 'Confiante' },
      { value: 'indiferente', label: 'Indiferente' },
      { value: 'ouvida', label: 'Ouvida' },
      { value: 'cuidada_de_verdade', label: 'Cuidada de verdade' },
    ],
  },
  {
    id: 'ambiente_transmite',
    type: 'multi-choice',
    title: 'O ambiente da clínica transmite:',
    subtitle: 'Marque o que se aplica — pode ser positivo ou negativo.',
    options: [
      { value: 'seguranca', label: 'Segurança' },
      { value: 'agitacao', label: 'Agitação' },
      { value: 'aconchego', label: 'Aconchego' },
      { value: 'impessoalidade', label: 'Impessoalidade' },
      { value: 'profissionalismo', label: 'Profissionalismo' },
      { value: 'desorganizacao', label: 'Desorganização' },
      { value: 'leveza', label: 'Leveza' },
      { value: 'organizacao', label: 'Organização' },
      { value: 'modernidade', label: 'Modernidade' },
    ],
  },
  {
    id: 'como_definiria',
    type: 'multi-choice',
    title: 'Como você definiria a Respira Kids?',
    subtitle: 'Pode marcar até 3 — positivas ou negativas.',
    maxSelections: 3,
    options: [
      { value: 'humana', label: 'Humana' },
      { value: 'comum', label: 'Comum, como outras' },
      { value: 'especializada', label: 'Especializada' },
      { value: 'cara', label: 'Cara para o que oferece' },
      { value: 'acolhedora', label: 'Acolhedora' },
      { value: 'impessoal', label: 'Impessoal' },
      { value: 'moderna', label: 'Moderna' },
      { value: 'confiavel', label: 'Confiável' },
      { value: 'diferenciada', label: 'Diferenciada' },
      { value: 'carinhosa', label: 'Carinhosa' },
      { value: 'tecnica', label: 'Técnica' },
      { value: 'referencia_infantil', label: 'Referência infantil' },
    ],
  },
  {
    id: 'surpresa_positiva',
    type: 'multi-choice',
    title: 'O que mais chamou sua atenção na Respira Kids?',
    subtitle: 'Pode marcar mais de uma — para o bem ou para o mal.',
    options: [
      { value: 'equipe', label: 'A equipe' },
      { value: 'ambiente', label: 'O ambiente' },
      { value: 'comunicacao', label: 'A comunicação' },
      { value: 'resultados', label: 'Os resultados' },
      { value: 'agilidade', label: 'Agilidade no atendimento' },
      { value: 'conteudo', label: 'Conteúdo nas redes' },
      { value: 'acolhimento', label: 'O acolhimento' },
      { value: 'organizacao', label: 'Organização e processos' },
      { value: 'preco', label: 'O preço' },
      { value: 'nada_em_especial', label: 'Nada em especial' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'conteudo_redes',
    type: 'single-choice',
    title: 'O quanto o conteúdo das nossas redes sociais é útil para você?',
    options: [
      { value: 'muito', label: 'Muito' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'pouco', label: 'Pouco' },
      { value: 'nada', label: 'Nada' },
      { value: 'nao_acompanho', label: 'Não acompanho' },
    ],
  },
  {
    id: 'hoje_ve_como',
    type: 'single-choice',
    title: 'Hoje, você vê a Respira Kids como…',
    options: [
      { value: 'clinica_infantil', label: 'Uma clínica infantil' },
      { value: 'clinica_diferenciada', label: 'Uma clínica diferenciada' },
      {
        value: 'referencia_fisio',
        label: 'Uma referência em fisioterapia infantil',
      },
      {
        value: 'lugar_especial',
        label: 'Um lugar realmente especial para famílias',
      },
      {
        value: 'abaixo_esperava',
        label: 'Uma clínica abaixo do que eu esperava',
      },
      {
        value: 'sem_opiniao',
        label: 'Ainda não tenho uma opinião formada',
      },
    ],
  },

  // ============================================================
  // FINAL: abertos, sem enunciado que já entrega a resposta
  // ============================================================
  {
    id: 'o_que_mais_ama',
    type: 'short-text',
    title: 'O que funcionou bem na sua experiência com a Respira Kids?',
    subtitle:
      'Pode escrever com suas palavras. Se não houver nada, é só seguir.',
    optional: true,
    ctaLabel: 'Continuar',
  },
  {
    id: 'o_que_melhorar',
    type: 'short-text',
    title: 'O que não funcionou bem ou poderia melhorar?',
    subtitle:
      'Pode escrever com suas palavras. Se não houver nada, é só seguir.',
    optional: true,
    ctaLabel: 'Finalizar pesquisa',
  },
];

/** Valor sentinela usado pelo PesquisaPediatraSearch quando a usuária escolhe "Outro". */
export { PEDIATRA_OUTRO_VALUE };

/**
 * Retorna as perguntas visíveis com base no estado atual de respostas.
 */
export function getVisibleQuestions(
  resposta: import('@/types/pesquisa-experiencia').PesquisaExperienciaResposta
): SurveyQuestion[] {
  return SURVEY_QUESTIONS.filter((q) => {
    if (!q.visibleWhen) return true;
    return q.visibleWhen(resposta);
  });
}
