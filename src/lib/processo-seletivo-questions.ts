// AI dev note: Conteúdo do Processo Seletivo de Estagiários Respira Kids.
// IMPORTANTE: aqui NÃO existe gabarito. A correção (qual alternativa é a certa
// e quantos pontos vale) vive no servidor, na RPC submit_candidatura_estagio.
// Assim o candidato não consegue descobrir as respostas inspecionando a página.
//
// As alternativas situacionais têm `value` estável ('a'..'d'); a ordem de
// exibição é embaralhada por candidato (ver EstagioChoiceQuestion).

import type {
  DadosField,
  EscritaQuestion,
  EstiloPerfil,
  EstiloQuestion,
  SituacionalQuestion,
  StatusCandidatura,
} from '@/types/processo-seletivo';

// =====================================================
// Bloco 0 — Dados do candidato
// =====================================================
export const DADOS_FIELDS: DadosField[] = [
  {
    id: 'nome',
    label: 'Nome completo',
    type: 'text',
    required: true,
    placeholder: 'Seu nome completo',
    fullWidth: true,
  },
  {
    id: 'email',
    label: 'E-mail',
    type: 'email',
    required: true,
    placeholder: 'voce@email.com',
  },
  {
    id: 'telefone',
    label: 'WhatsApp',
    type: 'tel',
    required: true,
    placeholder: '(00) 00000-0000',
  },
  {
    id: 'curso',
    label: 'Curso',
    type: 'text',
    placeholder: 'Ex.: Fisioterapia',
  },
  {
    id: 'instituicao',
    label: 'Instituição de ensino',
    type: 'text',
    placeholder: 'Ex.: Universidade...',
  },
  {
    id: 'periodo',
    label: 'Período / semestre atual',
    type: 'text',
    placeholder: 'Ex.: 6º período',
  },
  {
    id: 'previsao_formatura',
    label: 'Previsão de formatura',
    type: 'text',
    placeholder: 'Ex.: 2026/2',
  },
  {
    id: 'cidade',
    label: 'Cidade',
    type: 'text',
    placeholder: 'Onde você mora',
  },
  {
    id: 'disponibilidade',
    label: 'Disponibilidade de horário',
    type: 'multi',
    fullWidth: true,
    options: [
      { value: 'manha', label: 'Manhã' },
      { value: 'tarde', label: 'Tarde' },
      { value: 'integral', label: 'Período integral' },
    ],
  },
  {
    id: 'como_soube',
    label: 'Como soube desta vaga?',
    type: 'select',
    fullWidth: true,
    options: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'indicacao', label: 'Indicação de alguém' },
      { value: 'faculdade', label: 'Faculdade / professor' },
      { value: 'site', label: 'Site / Google' },
      { value: 'outro', label: 'Outro' },
    ],
  },
  {
    id: 'linkedin_url',
    label: 'LinkedIn ou currículo (link) — opcional',
    type: 'text',
    fullWidth: true,
    placeholder: 'https://...',
  },
];

// =====================================================
// Bloco 1 — Situacional (escolha única, corrigido no servidor)
// =====================================================
export const SITUACIONAL_QUESTIONS: SituacionalQuestion[] = [
  {
    id: 's1',
    competencia: 'Priorização + raciocínio clínico',
    enunciado:
      'São 8h45. Em menos de 5 minutos você recebe três situações ao mesmo tempo: a sala de atendimento das 9h ainda não foi organizada; sua supervisora te passou uma lista de materiais para solicitar ao almoxarifado até o fim do dia; e uma mãe te aborda na recepção dizendo que o filho teve febre na noite anterior e quer saber se continua com o atendimento. O que você faz?',
    options: [
      {
        value: 'a',
        label:
          'Organiza a sala primeiro — o atendimento das 9h não pode ser comprometido',
      },
      {
        value: 'b',
        label: 'Responde à mãe que a decisão é dela e vai preparar a sala',
      },
      {
        value: 'c',
        label:
          'Informa a mãe que vai verificar com a fisioterapeuta antes de qualquer decisão, organiza a sala enquanto isso e anota o pedido do almoxarifado para não esquecer',
      },
      {
        value: 'd',
        label:
          'Resolve o pedido do almoxarifado primeiro, já que tem prazo até o fim do dia, e pede para a recepção lidar com a mãe',
      },
    ],
  },
  {
    id: 's2',
    competencia: 'Tolerância ao estresse + autoconsciência emocional',
    enunciado:
      'Após a primeira semana de estágio, você percebe que o choro constante das crianças durante os atendimentos está te deixando ansioso ao longo do dia. O que você faz?',
    options: [
      {
        value: 'a',
        label:
          'Não menciona para ninguém e espera que a adaptação venha com o tempo',
      },
      {
        value: 'b',
        label:
          'Procura sua supervisora, compartilha o que está sentindo e pede orientações ou estratégias',
      },
      {
        value: 'c',
        label:
          'Tenta criar uma distância emocional das crianças durante os atendimentos para se proteger',
      },
      {
        value: 'd',
        label:
          'Decide que talvez fisioterapia pediátrica não seja sua área e começa a considerar outras opções',
      },
    ],
  },
  {
    id: 's3',
    competencia: 'Conhecimento técnico + limite de atuação',
    enunciado:
      'A fisioterapeuta é chamada por uma emergência e pede que você fique com o paciente — um bebê de 8 meses — por cerca de 3 minutos. O bebê está em prono (barriga para baixo) sobre a maca e começa a demonstrar sinais de desconforto: choro, rubor no rosto e leve arqueamento. O que você faz?',
    options: [
      {
        value: 'a',
        label:
          'Aguarda a fisioterapeuta voltar, pois você não tem autorização para alterar o posicionamento',
      },
      {
        value: 'b',
        label:
          'Vira o bebê para supino imediatamente, pois é um posicionamento mais seguro',
      },
      {
        value: 'c',
        label:
          'Chama a fisioterapeuta imediatamente e, caso não haja resposta rápida, interrompe o posicionamento por segurança',
      },
      {
        value: 'd',
        label:
          'Coloca o bebê no colo para acalmá-lo, pois o contato humano sempre ajuda',
      },
    ],
  },
  {
    id: 's4',
    competencia: 'Comunicação profissional + consciência do papel',
    enunciado:
      'Ao final de uma sessão, o pai de uma paciente te chama de lado e pergunta: "Você acha que ela precisa mesmo continuar fazendo fisio? Ela já melhorou bastante." Você não tem acesso ao prontuário completo e a fisioterapeuta já foi para o próximo atendimento. O que você faz?',
    options: [
      {
        value: 'a',
        label:
          'Compartilha o que observou durante as sessões que acompanhou, com cuidado',
      },
      {
        value: 'b',
        label:
          'Concorda que a melhora é notável e sugere que o pai converse com a fisioterapeuta na próxima consulta',
      },
      {
        value: 'c',
        label:
          'Explica que não tem como responder a isso, mas garante que a fisioterapeuta vai saber dessa dúvida ainda hoje',
      },
      {
        value: 'd',
        label: 'Diz que a decisão é médica e redireciona o pai ao pediatra',
      },
    ],
  },
  {
    id: 's5',
    competencia: 'Maturidade emocional + postura profissional',
    enunciado:
      'Foi uma tarde pesada: três sessões difíceis, você cometeu um erro no prontuário que sua supervisora precisou corrigir, e uma mãe foi grossa com você na recepção. Ao sair, uma colega de equipe pergunta como você está. Como você responde?',
    options: [
      {
        value: 'a',
        label:
          'Diz que está bem — não quer parecer imaturo ou fraco diante dos colegas',
      },
      {
        value: 'b',
        label:
          'Desabafa longamente sobre o dia, o erro e como a mãe foi injusta',
      },
      {
        value: 'c',
        label:
          'Admite que foi um dia pesado, menciona o que foi difícil de forma objetiva e diz que vai processar em casa',
      },
      {
        value: 'd',
        label:
          'Muda de assunto e vai embora rápido para não precisar lidar com isso agora',
      },
    ],
  },
  {
    id: 's6',
    competencia: 'Postura ética + relação com colegas',
    enunciado:
      'No intervalo do almoço, você sai com um colega estagiário. Ele acende um cigarro logo na calçada em frente à entrada principal da clínica. Você sabe que a política da clínica é de ambiente livre de tabaco, inclusive nas imediações. O que você faz?',
    options: [
      {
        value: 'a',
        label:
          'Não faz nada — não é seu papel fiscalizar o comportamento dos colegas',
      },
      {
        value: 'b',
        label:
          'Comenta de forma tranquila que lembrou da política da clínica e sugere que ele fume mais longe',
      },
      {
        value: 'c',
        label: 'Assim que volta, reporta imediatamente à supervisora',
      },
      {
        value: 'd',
        label: 'Vai junto, afinal estão fora do horário de expediente',
      },
    ],
  },
];

// =====================================================
// Bloco 2 — Escrita (texto livre; leitura humana)
// =====================================================
export const ESCRITA_QUESTIONS: EscritaQuestion[] = [
  {
    id: 'motivacao',
    titulo: 'Por que você escolheu a fisioterapia?',
    subtitulo:
      'Conte um pouco sobre o que te motivou e o que te interessa nesta vaga.',
    placeholder: 'Escreva com suas palavras...',
    minChars: 150,
    maxChars: 1500,
  },
  {
    id: 'mae_ansiosa',
    titulo:
      'Uma mãe ansiosa pergunta por que o tratamento do filho está demorando para mostrar resultado. Como você explicaria para ela?',
    subtitulo: 'Escreva como se estivesse conversando com ela.',
    placeholder: 'Escreva com suas palavras...',
    minChars: 150,
    maxChars: 1500,
  },
];

// =====================================================
// Bloco 3 — Estilo de trabalho (NÃO pontua; orienta a entrevista)
// =====================================================
export const ESTILO_QUESTIONS: EstiloQuestion[] = [
  {
    id: 'e1',
    pergunta: 'No seu primeiro dia em um lugar novo, você costuma:',
    options: [
      { value: 'executor', label: 'Já querer colocar a mão na massa' },
      { value: 'comunicador', label: 'Puxar conversa e conhecer todo mundo' },
      {
        value: 'cuidadoso',
        label: 'Observar com calma e ajudar onde precisar',
      },
      {
        value: 'analitico',
        label: 'Entender as regras e os processos antes de agir',
      },
    ],
  },
  {
    id: 'e2',
    pergunta: 'Quando recebe uma tarefa que ainda não sabe fazer:',
    options: [
      { value: 'executor', label: 'Tento na prática e vou ajustando' },
      { value: 'comunicador', label: 'Pergunto para alguém que já fez' },
      {
        value: 'cuidadoso',
        label: 'Peço para acompanhar alguém fazendo primeiro',
      },
      { value: 'analitico', label: 'Pesquiso e estudo até entender direito' },
    ],
  },
  {
    id: 'e3',
    pergunta: 'O que mais te incomoda no trabalho:',
    options: [
      { value: 'executor', label: 'Lentidão para decidir as coisas' },
      { value: 'comunicador', label: 'Ficar sem interagir com ninguém' },
      { value: 'cuidadoso', label: 'Clima tenso entre as pessoas' },
      { value: 'analitico', label: 'Falta de organização' },
    ],
  },
  {
    id: 'e4',
    pergunta: 'Quando te dão um feedback sobre um erro:',
    options: [
      { value: 'executor', label: 'Já penso em como corrigir rápido' },
      {
        value: 'comunicador',
        label: 'Converso abertamente sobre o que aconteceu',
      },
      { value: 'cuidadoso', label: 'Agradeço e fico atento para não repetir' },
      { value: 'analitico', label: 'Quero entender exatamente o que errei' },
    ],
  },
  {
    id: 'e5',
    pergunta:
      'Diante de uma criança chorando muito no atendimento, seu instinto é:',
    options: [
      { value: 'executor', label: 'Resolver logo o que está incomodando ela' },
      { value: 'comunicador', label: 'Distrair e brincar para descontrair' },
      { value: 'cuidadoso', label: 'Acolher e transmitir calma' },
      {
        value: 'analitico',
        label: 'Observar o que pode estar causando o choro',
      },
    ],
  },
];

// =====================================================
// Rótulos auxiliares (painel)
// =====================================================
export const STATUS_LABELS: Record<StatusCandidatura, string> = {
  a_avaliar: 'A avaliar',
  entrevista: 'Entrevista',
  descartado: 'Descartado',
  aprovado: 'Aprovado',
};

export const ESTILO_LABELS: Record<EstiloPerfil, string> = {
  executor: 'Executor',
  comunicador: 'Comunicador',
  cuidadoso: 'Cuidadoso',
  analitico: 'Analítico',
};

export const ESTILO_DESCRICAO: Record<EstiloPerfil, string> = {
  executor: 'Direto, focado em resolver e fazer acontecer.',
  comunicador: 'Sociável, comunicativo, gosta de pessoas.',
  cuidadoso: 'Acolhedor, estável, atento ao bem-estar dos outros.',
  analitico: 'Organizado, detalhista, segue processos e estuda antes.',
};

/** Rótulos das opções de dados que viram valores (disponibilidade, como_soube). */
export const DADOS_OPTION_LABELS: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  integral: 'Período integral',
  instagram: 'Instagram',
  indicacao: 'Indicação',
  faculdade: 'Faculdade / professor',
  site: 'Site / Google',
  outro: 'Outro',
};
