// AI dev note: Perguntas da Pesquisa de Experiência Respira Kids
// Ordem estratégica: começa fácil → emocional → reflexivo (NPS no fim)
// As perguntas em formato single-choice e multi-choice (com max atingido)
// avançam automaticamente. Scale-10 e short-text exigem botão "Continuar".

import type { SurveyQuestion } from '@/types/pesquisa-experiencia';

const indicacaoMedicaValues = new Set(['pediatra', 'hospital']);

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  // ============================================================
  // INÍCIO: perguntas leves para criar conforto
  // ============================================================
  {
    id: 'como_conheceu',
    type: 'single-choice',
    title: 'Como você conheceu a Respira Kids?',
    options: [
      { value: 'pediatra', label: 'Pediatra', emoji: '👩\u200d⚕️' },
      { value: 'instagram', label: 'Instagram', emoji: '📸' },
      { value: 'google', label: 'Google', emoji: '🔎' },
      { value: 'tiktok', label: 'TikTok', emoji: '🎵' },
      { value: 'outra_mae', label: 'Outra mãe ou família', emoji: '💞' },
      { value: 'hospital', label: 'Hospital', emoji: '🏥' },
      { value: 'outro', label: 'Outro', emoji: '✨' },
    ],
  },
  {
    id: 'profissional_indicou',
    type: 'short-text',
    title: 'Qual profissional indicou a Respira Kids?',
    subtitle: 'Pode ser o nome do(a) pediatra ou outro profissional. 💙',
    helper: 'Se preferir não responder, é só seguir.',
    optional: true,
    ctaLabel: 'Continuar',
    visibleWhen: (r) =>
      typeof r.como_conheceu === 'string' &&
      indicacaoMedicaValues.has(r.como_conheceu),
  },
  {
    id: 'tempo_acompanhamento',
    type: 'single-choice',
    title: 'Há quanto tempo sua família é acompanhada pela Respira Kids?',
    options: [
      { value: 'primeira_consulta', label: 'Primeira consulta', emoji: '🌱' },
      { value: 'menos_1_mes', label: 'Menos de 1 mês' },
      { value: '1_a_3_meses', label: '1 a 3 meses' },
      { value: '3_a_6_meses', label: '3 a 6 meses' },
      { value: 'mais_6_meses', label: 'Mais de 6 meses' },
      { value: 'mais_1_ano', label: 'Mais de 1 ano', emoji: '⭐' },
    ],
  },
  {
    id: 'idade_filho',
    type: 'single-choice',
    title: 'Qual a idade do seu filho(a)?',
    options: [
      { value: '0_3_meses', label: '0 a 3 meses', emoji: '👶' },
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
      { value: 'respiratorio', label: 'Questão respiratória', emoji: '🫁' },
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
      { value: 'autonoma', label: 'Autônoma' },
      { value: 'estudante', label: 'Estudante' },
      { value: 'do_lar', label: 'Do lar' },
      { value: 'outro', label: 'Outro' },
    ],
  },

  // ============================================================
  // MEIO: perguntas emocionais (vínculo já criado)
  // ============================================================
  {
    id: 'motivos_confianca',
    type: 'multi-choice',
    title: 'O que mais fez você confiar na Respira Kids?',
    subtitle: 'Pode escolher até 2.',
    maxSelections: 2,
    options: [
      {
        value: 'atendimento_humanizado',
        label: 'Atendimento humanizado',
        emoji: '💛',
      },
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
    subtitle: 'Pode marcar mais de uma. 💙',
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
    id: 'se_fosse_pessoa',
    type: 'multi-choice',
    title: 'Se a Respira Kids fosse uma pessoa, como ela seria?',
    subtitle: 'Pode escolher até 3.',
    maxSelections: 3,
    options: [
      { value: 'carinhosa', label: 'Carinhosa' },
      { value: 'inteligente', label: 'Inteligente' },
      { value: 'calma', label: 'Calma' },
      { value: 'moderna', label: 'Moderna' },
      { value: 'sofisticada', label: 'Sofisticada' },
      { value: 'proxima', label: 'Próxima' },
      { value: 'leve', label: 'Leve' },
      { value: 'confiante', label: 'Confiante' },
      { value: 'atenciosa', label: 'Atenciosa' },
    ],
  },
  {
    id: 'conteudo_redes',
    type: 'single-choice',
    title: 'O conteúdo das nossas redes sociais ajuda você?',
    options: [
      { value: 'muito', label: 'Muito', emoji: '💯' },
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
        emoji: '💙',
      },
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
    subtitle: 'Sua resposta nos ajuda a continuar fazendo o que importa. 💙',
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
