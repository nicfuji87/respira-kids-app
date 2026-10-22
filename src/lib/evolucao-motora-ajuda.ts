// Explicações curtas dos parâmetros da evolução motora, abertas pelo "?" ao
// lado de cada campo. A técnica segue a da avaliação motora
// (EvaluationSectionContent), para as duas telas ensinarem a mesma coisa.
// Texto clínico: revisar com a equipe antes de mudar. Para editar uma
// explicação, basta alterar o texto aqui; a tela não precisa mudar.

export interface AjudaParametro {
  titulo: string;
  oQueE: string;
  comoMedir?: string;
  // Significado de cada opção, quando o campo é de escolha
  opcoes?: [string, string][];
}

const MESMO_METODO =
  'Meça sempre do mesmo jeito e nos mesmos pontos, para poder comparar com as sessões anteriores.';

export const AJUDA_MOTORA: Record<string, AjudaParametro> = {
  // ---------------------------------------------------------------- Crânio
  diagonal_a: {
    titulo: 'Diagonal A',
    oQueE:
      'Uma das duas diagonais cruzadas do crânio. A diferença entre as duas diagonais mostra o quanto a cabeça está assimétrica (plagiocefalia).',
    comoMedir: `Com o craniômetro, da testa do lado esquerdo até a nuca do lado direito. Marcar os pontos com fita dermatográfica aumenta a precisão. ${MESMO_METODO}`,
  },
  diagonal_b: {
    titulo: 'Diagonal B',
    oQueE:
      'A outra diagonal cruzada do crânio, que é comparada com a diagonal A.',
    comoMedir: `Com o craniômetro, da testa do lado direito até a nuca do lado esquerdo, na mesma altura usada na diagonal A. ${MESMO_METODO}`,
  },
  comprimento_ap: {
    titulo: 'Comprimento AP',
    oQueE:
      'Comprimento da cabeça de frente para trás. Junto com a largura, forma o índice cefálico (CI).',
    comoMedir:
      'Com o craniômetro, da glabela (entre as sobrancelhas) até o opistocrânio (ponto mais posterior da cabeça).',
  },
  largura_ml: {
    titulo: 'Largura ML',
    oQueE:
      'Largura da cabeça de um lado ao outro. Junto com o comprimento, forma o índice cefálico (CI).',
    comoMedir:
      'Com o craniômetro, de eurion a eurion: a parte mais larga da cabeça, acima das orelhas.',
  },
  perimetro_cefalico: {
    titulo: 'Perímetro cefálico',
    oQueE:
      'A volta da cabeça. Acompanha o crescimento do crânio; não entra no cálculo do CVAI nem do CI.',
    comoMedir:
      'Fita métrica que não estica, passando logo acima das sobrancelhas e pela parte mais saliente da nuca (o maior contorno da cabeça). Anote em centímetros.',
  },
  metricas_cranio: {
    titulo: 'CVA, CVAI e CI',
    oQueE:
      'São calculados pelo sistema a partir das medidas acima; não precisa calcular nada.',
    opcoes: [
      ['CVA', 'Diferença entre as duas diagonais, em milímetros.'],
      [
        'CVAI',
        'A mesma diferença em relação ao tamanho da cabeça (CVA ÷ maior diagonal × 100). É o número usado para classificar a plagiocefalia.',
      ],
      [
        'CI',
        'Largura ÷ comprimento × 100. Alto quando a cabeça é achatada atrás (braquicefalia), baixo quando é alongada (escafocefalia).',
      ],
    ],
  },

  // ----------------------------------------------------------- Goniometria
  rotacao: {
    titulo: 'Rotação cervical',
    oQueE:
      'Quanto a cabeça gira para cada lado, em graus. D = virando para a direita (bochecha em direção ao ombro direito); E = para a esquerda. O lado com o número menor é o lado mais limitado.',
    comoMedir: `Criança em supino, ombros estabilizados, cabeça apoiada no occipital. Ativa: atraia o olhar com um brinquedo ou som e meça até onde ela vira sozinha. Passiva: você conduz o movimento até o fim da amplitude, sem forçar; é a medida mais importante no torcicolo. Referência média por idade: cerca de 105° a 112° (Klackenberg, 2005). ${MESMO_METODO}`,
  },
  inclinacao: {
    titulo: 'Inclinação lateral',
    oQueE:
      'Quanto a cabeça inclina para cada lado, em graus. D = orelha em direção ao ombro direito; E = ao ombro esquerdo.',
    comoMedir: `Criança em supino, ombros estabilizados, cabeça apoiada no occipital. Ativa: a criança faz sozinha. Passiva: você conduz até o fim da amplitude, sem forçar. Referência média por idade: cerca de 68° a 70° (Klackenberg, 2005). ${MESMO_METODO}`,
  },

  // --------------------------------------------------------------- Palpação
  ecom_tonus: {
    titulo: 'Tônus do ECOM',
    oQueE:
      'Como o músculo esternocleidomastoideo está ao toque, comparando os dois lados.',
    comoMedir:
      'Palpe o ECOM de cada lado, da região atrás da orelha até a clavícula, com a cabeça na linha média.',
    opcoes: [
      ['Normal', 'Macio e com a mesma consistência do outro lado.'],
      ['Tenso', 'Mais firme que o outro lado.'],
      ['Em corda', 'Cordão rígido e saliente ao toque.'],
    ],
  },
  nodulo: {
    titulo: 'Nódulo no ECOM',
    oQueE:
      'Massa firme palpável dentro do músculo, típica do torcicolo muscular congênito com nódulo.',
    comoMedir:
      'Percorra o músculo inteiro. Anote o tamanho aproximado e em que terço está: superior (perto da orelha), médio ou inferior (perto da clavícula).',
  },

  // ---------------------------------------------------------- Controle motor
  supino_linha_media: {
    titulo: 'Manutenção na linha média',
    oQueE:
      'Se a criança, deitada de barriga para cima, mantém a cabeça no centro.',
    opcoes: [
      ['Mantém firme', 'Cabeça estável no centro.'],
      ['Cai para preferência', 'Tende a virar para um lado.'],
      ['Instável', 'Não consegue manter no meio.'],
    ],
  },
  supino_alcance: {
    titulo: 'Alcance de linha média',
    oQueE:
      'Até onde a criança leva as mãos juntas no meio do corpo, deitada de barriga para cima. Da opção mais avançada para a menos avançada:',
    opcoes: [
      ['Mãos nos joelhos', 'Alcança os membros inferiores.'],
      ['Mãos na boca', 'Leva as mãos à boca.'],
      ['Mãos no ar', 'Movimenta as mãos sem chegar à linha média.'],
      ['Ausente', 'Não alcança a linha média.'],
    ],
  },
  prono_tolerancia: {
    titulo: 'Tolerância ao prono',
    oQueE: 'Como a criança aceita ficar de barriga para baixo, acordada.',
    opcoes: [
      ['Boa', 'Tolera bem e explora.'],
      ['Cansa rápido', 'Tolera poucos minutos.'],
      ['Chora imediato', 'Rejeita a posição.'],
    ],
  },
  prono_carga_peso: {
    titulo: 'Carga de peso no prono',
    oQueE: 'Onde a criança apoia o peso para levantar o tronco.',
    opcoes: [
      ['Cotovelos', 'Apoio nos antebraços.'],
      ['Mãos estendidas', 'Braços estendidos (mais avançado).'],
      ['Não levanta', 'Rosto fica no apoio.'],
    ],
  },
  prono_controle_cabeca: {
    titulo: 'Controle de cabeça no prono',
    oQueE:
      'Até onde a criança eleva e sustenta a cabeça de barriga para baixo.',
    opcoes: [
      ['45°', 'Elevação parcial.'],
      ['90°', 'Elevação completa.'],
      ['Oscila', 'Instável, não sustenta.'],
    ],
  },

  // ---------------------------------------------------------------- Resposta
  melhora_adm: {
    titulo: 'Melhora da ADM',
    oQueE:
      'Se a amplitude de movimento (principalmente da cervical) está maior do que na sessão anterior. Se você mediu a goniometria hoje, compare com a última medida.',
  },
  reducao_preferencia_postural: {
    titulo: 'Redução da preferência postural',
    oQueE:
      'Se a criança está virando ou inclinando menos a cabeça para o lado preferido do que na sessão anterior.',
  },
  melhora_controle_cervical: {
    titulo: 'Melhora do controle cervical',
    oQueE:
      'Se a criança sustenta e controla melhor a cabeça (no prono, no colo, nas trocas de posição) do que na sessão anterior.',
  },
  tolerancia_prono_melhorou: {
    titulo: 'Tolerância ao prono',
    oQueE:
      'Se a criança está aceitando ficar mais tempo de barriga para baixo do que na sessão anterior.',
  },
  adesao_domiciliar: {
    titulo: 'Orientações domiciliares',
    oQueE:
      'É o que o responsável conta, não o que você observou. Pergunte se fizeram em casa o que foi orientado desde a última sessão.',
    opcoes: [
      ['Parcialmente', 'Fizeram parte, ou só em alguns dias.'],
      [
        'Não informado',
        'Não foi possível perguntar ou o responsável não soube dizer.',
      ],
    ],
  },

  // ---------------------------------------------------------------- Conduta
  reavaliacao_dias: {
    titulo: 'Reavaliação',
    oQueE:
      'Daqui a quantos dias a criança deve passar por nova medição ou reavaliação formal.',
  },
};
