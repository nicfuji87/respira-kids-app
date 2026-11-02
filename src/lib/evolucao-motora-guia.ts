// Instruções de preenchimento da evolução motora (1.4): guia "Como preencher",
// dica no topo de cada seção e significado das opções que mais confundem.
// Texto para a equipe: mudar aqui muda a tela, sem mexer em componente.

export interface PassoGuia {
  titulo: string;
  texto: string;
  itens?: string[];
}

export const PASSOS_GUIA_MOTORA: PassoGuia[] = [
  {
    titulo: 'Marque as áreas trabalhadas hoje',
    texto:
      'Torcicolo, assimetria craniana e/ou desenvolvimento motor. Assimetria craniana marca torcicolo junto. Só os objetivos e as seções dessas áreas aparecem.',
  },
  {
    titulo: 'Toque só nos objetivos que você trabalhou nesta sessão',
    texto:
      'Normalmente 2 a 4. A lista mostra todos os objetivos possíveis da área: não é para marcar todos. O que você não trabalhou hoje fica sem marcar e continua no plano da criança.',
  },
  {
    titulo: 'Em cada objetivo marcado, responda três coisas',
    texto: 'Elas aparecem dentro do próprio objetivo:',
    itens: [
      'Habilidade: como a criança fez hoje. Se mediu, anote o número (segundos, graus, tentativas). É esse número que mostra a evolução no gráfico.',
      'O que foi feito: os recursos que você usou para esse objetivo. Já vêm marcados como na última sessão; ajuste o que mudou.',
      'Resultado hoje: compare com a última sessão (melhorou, igual ou pior).',
    ],
  },
  {
    titulo: 'Medidas: só aparecem quando um objetivo pede',
    texto: 'Para cada medida, escolha uma opção:',
    itens: [
      'Medi hoje: preencha o resultado.',
      'Não medi hoje: não deu nesta sessão (choro, sono, tempo). Ela volta a aparecer na próxima.',
      'Não precisa mais: essa medida não faz mais sentido para esta criança. Para de aparecer.',
    ],
  },
  {
    titulo: 'Complete o resto',
    texto:
      'Palpação (no torcicolo), resposta e participação, orientações para casa e conduta. Se não orientou nada, marque "Nenhuma orientação nesta sessão".',
  },
  {
    titulo: 'Finalize ou salve o rascunho',
    texto:
      '"Finalizar evolução" só grava com tudo respondido e mostra o que falta. Sem tempo agora? "Salvar rascunho" e termine depois, em qualquer aparelho.',
  },
];

export interface TermoGuia {
  termo: string;
  opcoes: [string, string][];
  regra?: string;
}

export const GLOSSARIO_MOTORA: TermoGuia[] = [
  {
    termo: 'Como a criança fez a habilidade hoje',
    opcoes: [
      [
        'Não observado hoje',
        'Você não viu essa habilidade nesta sessão (não deu para tentar, criança dormindo ou chorando, outro foco).',
      ],
      ['Não realiza', 'Você tentou e a criança não faz.'],
      [
        'Com assistência',
        'Faz com a sua ajuda. Mínima: um toque ou apoio leve. Moderada: você sustenta parte do movimento. Máxima: você faz quase tudo.',
      ],
      ['Independente', 'Faz sozinha.'],
    ],
  },
  {
    termo: 'Consistência',
    opcoes: [
      ['Emergente', 'Começou a aparecer agora, poucas vezes.'],
      ['Inconsistente', 'Às vezes faz, às vezes não.'],
      ['Consistente', 'Faz sempre que é estimulada.'],
    ],
  },
  {
    termo: 'Resultado hoje (sempre em relação à última sessão)',
    opcoes: [
      ['Progresso observado', 'Fez melhor do que da última vez.'],
      ['Manteve o desempenho', 'Igual à última vez.'],
      ['Maior dificuldade', 'Pior do que da última vez.'],
      [
        'Não foi possível comparar',
        'Primeira vez que trabalha o objetivo, a criança não colaborou ou você não observou a habilidade.',
      ],
    ],
    regra:
      'Se a habilidade ficou "Não observado hoje", o resultado é "Não foi possível comparar".',
  },
  {
    termo: 'Números (tempo, graus, tentativas)',
    opcoes: [
      [
        'Só se mediu',
        'Campo vazio quer dizer "não medido" e nunca vira zero. Um número por sessão já basta para o gráfico.',
      ],
    ],
  },
];

/** Dica curta no topo de cada seção (id da seção) */
export const DICA_SECAO_MOTORA: Record<string, string> = {
  objetivos_habilidades:
    'Toque só nos objetivos trabalhados hoje (em geral 2 a 4). Em cada um: como a criança fez, o que você usou e o resultado comparado com a última sessão.',
  goniometria:
    'Aparece porque um objetivo de hoje pede. Mediu? "Medi hoje" e anote os graus de cada lado. Não deu? "Não medi hoje" com o motivo.',
  palpacao:
    'Palpe os dois lados e marque o que sentiu. O que estiver normal, marque "Normal". Bloqueio articular só se houver.',
  craniometria:
    'Aparece porque um objetivo de hoje pede. Mediu? "Medi hoje" e anote as diagonais A e B (o "?" mostra qual é qual). O sistema calcula CVA, CVAI e CI.',
  resposta_sessao:
    'Como a criança participou da sessão como um todo e o que a família contou. O resultado de cada objetivo já foi dado na primeira seção.',
  orientacoes:
    'O que você combinou com a família para fazer em casa. Se não orientou nada hoje, marque "Nenhuma orientação nesta sessão".',
  conduta:
    'Se mantém a fisioterapia e com que frequência. Encaminhamento ou capacete, só se houver indicação.',
};

/** Muitos objetivos marcados de uma vez costuma ser "marquei todos" */
export const LIMITE_OBJETIVOS_SESSAO = 6;

/** Motivo de "Não medi hoje" que na verdade é "Não precisa mais" */
export const MOTIVO_PARECE_NAO_PRECISA =
  /necessidade|n[aã]o precisa|n[aã]o se aplica|desnecess/i;

// ------------------------------------------- guia visto neste aparelho

const CHAVE_VISTO = 'rk_guia_evolucao_motora_v1';

/** Já viu o guia neste aparelho? (sem localStorage, conta como visto) */
export function guiaMotoraJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE_VISTO) === '1';
  } catch {
    return true;
  }
}

export function marcarGuiaMotoraVisto() {
  try {
    localStorage.setItem(CHAVE_VISTO, '1');
  } catch {
    // sem armazenamento: o guia segue no botão
  }
}
