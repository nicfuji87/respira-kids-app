// AI dev note: Perguntas da Pesquisa de Experiência Respira Kids
// Ordem estratégica: começa fácil → emocional → percepção de valor → reflexivo (NPS no fim)
// Auto-avanço em single-choice e pediatra-search. Multi-choice, scale-10 e short-text
// exigem botão "Continuar".

import type { SurveyQuestion } from '@/types/pesquisa-experiencia';

const PEDIATRA_OUTRO_VALUE = '__outro__';

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  // ============================================================
  // INÍCIO: jornada de descoberta
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
  // MEIO: emocional / marca
  // ============================================================
  {
    id: 'motivos_confianca',
    type: 'multi-choice',
    title: 'O que mais fez você confiar na Respira Kids?',
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
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'como_se_sente',
    type: 'multi-choice',
    title: 'Como a Respira Kids faz você se sentir?',
    subtitle: 'Pode marcar mais de uma.',
    options: [
      { value: 'acolhida', label: 'Acolhida' },
      { value: 'segura', label: 'Segura' },
      { value: 'tranquila', label: 'Tranquila' },
      { value: 'bem_orientada', label: 'Bem orientada' },
      { value: 'confiante', label: 'Confiante' },
      { value: 'ouvida', label: 'Ouvida' },
      { value: 'cuidada_de_verdade', label: 'Cuidada de verdade' },
    ],
  },
  {
    id: 'ambiente_transmite',
    type: 'multi-choice',
    title: 'O ambiente da clínica transmite:',
    subtitle: 'Pode marcar mais de uma.',
    options: [
      { value: 'seguranca', label: 'Segurança' },
      { value: 'aconchego', label: 'Aconchego' },
      { value: 'profissionalismo', label: 'Profissionalismo' },
      { value: 'leveza', label: 'Leveza' },
      { value: 'organizacao', label: 'Organização' },
      { value: 'modernidade', label: 'Modernidade' },
    ],
  },
  {
    id: 'como_definiria',
    type: 'multi-choice',
    title: 'Como você definiria a Respira Kids?',
    subtitle: 'Pode marcar até 3.',
    maxSelections: 3,
    options: [
      { value: 'humana', label: 'Humana' },
      { value: 'especializada', label: 'Especializada' },
      { value: 'acolhedora', label: 'Acolhedora' },
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
    title: 'O que mais te surpreendeu positivamente na Respira Kids?',
    subtitle: 'Pode marcar mais de uma.',
    options: [
      { value: 'equipe', label: 'A equipe' },
      { value: 'ambiente', label: 'O ambiente' },
      { value: 'comunicacao', label: 'A comunicação' },
      { value: 'resultados', label: 'Os resultados' },
      { value: 'agilidade', label: 'Agilidade no atendimento' },
      { value: 'conteudo', label: 'Conteúdo nas redes' },
      { value: 'acolhimento', label: 'O acolhimento' },
      { value: 'organizacao', label: 'Organização e processos' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'conteudo_redes',
    type: 'single-choice',
    title: 'O conteúdo das nossas redes sociais ajuda você?',
    options: [
      { value: 'muito', label: 'Muito' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'pouco', label: 'Pouco' },
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
    ],
  },

  // ============================================================
  // PERCEPÇÃO DE VALOR
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
    ],
  },
  {
    id: 'o_que_vale_pena',
    type: 'multi-choice',
    title: 'O que mais faz valer a pena o atendimento na Respira Kids?',
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
      { value: 'abaixo_esperado', label: 'Abaixo do esperado' },
    ],
  },
  {
    id: 'traz_tranquilidade',
    type: 'single-choice',
    title:
      'Você sente que o acompanhamento da Respira Kids traz tranquilidade para sua família?',
    options: [
      { value: 'muita_tranquilidade', label: 'Sim, muita tranquilidade' },
      { value: 'sim', label: 'Sim' },
      { value: 'mais_ou_menos', label: 'Mais ou menos' },
      { value: 'nao_sinto', label: 'Não sinto diferença' },
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
    ],
  },

  // ============================================================
  // FINAL: reflexivo, NPS, abertos
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
  {
    id: 'o_que_mais_ama',
    type: 'short-text',
    title: 'O que você mais ama na Respira Kids?',
    subtitle: 'Sua resposta nos ajuda a continuar fazendo o que importa.',
    optional: true,
    ctaLabel: 'Continuar',
  },
  {
    id: 'o_que_melhorar',
    type: 'short-text',
    title: 'Tem algo que poderíamos melhorar?',
    subtitle: 'Pode falar com sinceridade — recebemos com carinho.',
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
