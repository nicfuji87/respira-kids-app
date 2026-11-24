/**
 * Respira Kids — cria a estrutura de Pesquisa do Google Ads (tudo PAUSADO)
 *
 * Onde colar: Google Ads (874-439-1492) → Ferramentas → Ações em massa →
 * Scripts → "+" → colar tudo → Autorizar → VISUALIZAR (não cria nada, só
 * valida e mostra o plano no registro) → se estiver tudo certo, EXECUTAR uma vez.
 * Depois de executar, pode apagar o script (ele não precisa rodar de novo).
 *
 * O que cria (v2.1, 25/10/2026 — decisões em docs/GOOGLE-ADS-CAMPANHAS.md):
 *   - 3 campanhas de Pesquisa, PAUSADAS: Respiratória, Desenvolvimento, Marca;
 *   - grupos por tema, frase + exata; termos "nus" e muito informativos só na exata;
 *   - 9 listas compartilhadas de negativas (inclui convênios, atendimento em casa e,
 *     desde 28/10/2026, concorrentes);
 *   - SEM negativas cruzadas entre Respiratória e Desenvolvimento (buscas combinadas,
 *     ex. "torcicolo e bronquiolite", continuam elegíveis); só a marca é negada
 *     nas campanhas genéricas e o grupo genérico nega os temas específicos;
 *   - 1 anúncio responsivo por grupo (15 títulos, 4 descrições, caminho de URL),
 *     com o preço certo de cada serviço;
 *   - recursos da conta: sitelinks, frases de destaque e snippet de serviços.
 *
 * Tracking: NENHUM sufixo/modelo é definido aqui de propósito. O sufixo de URL
 * final da CONTA (utm_* + rk_* com ValueTrack) vale para todos os anúncios e
 * sitelinks; um sufixo de campanha o SUBSTITUIRIA e quebraria a atribuição.
 * Conversão: a meta padrão da conta (Contatos) — "Conversa iniciada (WhatsApp)"
 * é a principal; "Clique WhatsApp (site)" é secundária.
 *
 * Duas fases (v3): a 1ª cria campanhas/grupos/anúncios/listas/recursos de uma vez (ou
 * nada); a 2ª aplica local, idioma, listas e palavras-chave com falha parcial — o que o
 * Google recusar fica no registro ("RECUSADA") sem travar o resto. Rodar de novo com as
 * campanhas já criadas = MODO REPARO (só cria o que falta). No fim, linhas "VERIFICA".
 *
 * NÃO é rotina de sincronização: o modo reparo não pausa, não remove e não troca tipo de
 * correspondência, nem refaz anúncios "particular", orçamentos ou agenda. As mudanças
 * depois da criação estão nos scripts ajustes-AAAA-MM-DD.js e no diário
 * (docs/GOOGLE-ADS-CAMPANHAS.md). Para conferir a conta, use um relatório só leitura.
 */

var BASE = 'https://respirakids.com.br';
// 03/11/2026: padrão 3,5 → 5 (Respiratória/Desenvolvimento perdiam 50–90% por classificação)
var CPC_TETO = { padrao: 5, marca: 1.5 }; // R$ — teto do Maximizar cliques (fase 1)

// ───────────────────────────── Negativas compartilhadas (frase) ─────────────
var LISTAS_NEGATIVAS = {
  'RK NEG | Emprego e formação': [
    'vaga',
    'vagas',
    'emprego',
    'empregos',
    'salário',
    'salario',
    'concurso',
    'curso',
    'cursos',
    'faculdade',
    'graduação',
    'pós graduação',
    'pos graduacao',
    'especialização',
    'residência',
    'estágio',
    'estagio',
    'apostila',
    'tcc',
    'monografia',
    'artigo',
    'livro',
    'aula',
    'trabalhar',
    'contratação',
    'currículo',
    'como se tornar',
    'o que faz um',
    'quanto ganha',
  ],
  'RK NEG | Gratuito e público': [
    'sus',
    'gratuito',
    'gratuita',
    'grátis',
    'gratis',
    'de graça',
    'hospital regional',
    'hran',
    'hmib',
    'hospital público',
    'ubs',
    'posto de saúde',
    'secretaria de saúde',
    'rede pública',
  ],
  'RK NEG | Informativo e caseiro': [
    'pdf',
    'o que é',
    'oque é',
    'significado',
    'definição',
    'wikipedia',
    'cid',
    'cid 10',
    'youtube',
    'vídeo',
    'video',
    'imagens',
    'fotos',
    'remédio caseiro',
    'simpatia',
    'chá',
    'receita caseira',
    'scielo',
    'protocolo',
    'escala',
    'cif',
    // 27/10/2026: buscas de curiosidade que apareceram na Desenvolvimento
    // ("quando o bebe começa a sentar", "como acontece o desenvolvimento psicomotor")
    'quando o bebê',
    'quando o bebe',
    'com quantos meses',
    'quantos meses',
    'como acontece',
    'quando começa',
    'quando comeca',
    'começa a sentar',
    'começa a andar',
    'começa a engatinhar',
    'psicomotor',
    'marcos do desenvolvimento',
    'fases do desenvolvimento',
    // 28/10/2026: termos de "como fazer" vistos no grupo Fisioterapia pediátrica
    'tummy time',
    'jeito certo',
    // 29/10/2026: "como fazer" que a Desenvolvimento motor pagou (10 cliques, 0 conversa).
    // "em casa" sozinho fica de fora (ver "Atendimento em casa"); "como tratar" cobre.
    'como desenvolver',
    'como ensinar',
    'como tratar',
    'sinais que',
    'qual idade',
    'marcos motores',
    'coordenação motora fina',
    'educação infantil',
    'psicomotricidade',
    // 30/10/2026: mais "como fazer" da Desenvolvimento motor
    'como estimular',
    'como ajudar',
    'exercícios',
    'exercicios',
    'exercício',
    'exercicio',
    'estímulos para',
    'estimulos para',
    'idade para',
    'pode sentar',
    'pode ficar sentado',
    // 03/11/2026
    'atividades',
    'alto contraste',
    'como incentivar',
    'como deixar',
    'tipos de',
    'sensoriais',
    'sensorial',
    'hidroterapia',
  ],
  // 28/10/2026: nomes de outras clínicas que "fisioterapia asa sul" puxava (R$ 9,49 em
  // 2 cliques sem conversa). Só nas campanhas de serviço; a Marca não recebe.
  'RK NEG | Concorrentes': [
    'fisiotrauma',
    'qualifisio',
    'aquafisio',
    'videre',
    'fisioclinic',
    'fisioclinica',
    'fisioquer',
    'san corp',
    'clinica recuperar',
    // 03/11/2026
    'cardiopulmonary',
    'respicare',
    'fisioemov',
  ],
  'RK NEG | Adulto e outras áreas': [
    'adulto',
    'adultos',
    'idoso',
    'idosos',
    'pós covid',
    'covid',
    'dpoc',
    'enfisema',
    'uti',
    'hospitalar',
    'intubado',
    'traqueostomia',
    'avc',
    'joelho',
    'ombro',
    'coluna',
    'lombar',
    'hérnia',
    'pilates',
    'rpg',
    'quiropraxia',
    'acupuntura',
    'estética',
    'dermatofuncional',
    'pélvica',
    'uroginecológica',
    'esportiva',
    'ortopédica',
    'fonoaudiologia',
    'fonoaudiólogo',
    'fonoaudiologa',
    'psicólogo',
    'psicologa',
    'nutricionista',
    'terapia ocupacional',
    'osteopatia',
    'veterinária',
    'veterinario',
    'cachorro',
    'cão',
    'gato',
    'pet',
    'gestante',
    'gravidez',
    'pós parto',
  ],
  // Não atendemos convênio (nota fiscal para reembolso). Sempre negadas: buscas que
  // pedem clínica CREDENCIADA. Os nomes de operadoras e "convênio/plano de saúde" soltos
  // dependem de NEGAR_OPERADORAS (abaixo).
  'RK NEG | Convênio e planos': [
    'aceita convênio',
    'aceita convenio',
    'aceita plano',
    'atende convênio',
    'atende plano',
    'pelo plano',
    'pelo convênio',
    'credenciado',
    'credenciada',
    'credenciados',
    'rede credenciada',
    'cobertura do plano',
    'coberto pelo plano',
  ],
  // Decisão do dono (25/10): atendemos em casa, mas os anúncios focam na clínica.
  'RK NEG | Atendimento em casa': [
    // Sem "em casa" sozinho: "exercícios em casa" é família que quer orientação, não visita.
    'domiciliar',
    'domicílio',
    'domicilio',
    'em domicílio',
    'a domicílio',
    'atendimento em casa',
    'fisioterapia em casa',
    'fisioterapeuta em casa',
    'home care',
    'vai em casa',
    'atende em casa',
    'atendimento na residência',
  ],
  'RK NEG | Outras cidades': [
    'goiânia',
    'goiania',
    'são paulo',
    'sao paulo',
    'rio de janeiro',
    'belo horizonte',
    'curitiba',
    'porto alegre',
    'salvador',
    'recife',
    'fortaleza',
    'anápolis',
    'anapolis',
    'uberlândia',
    'campinas',
    'manaus',
    'belém',
    'florianópolis',
    'vitória',
    'cuiabá',
    'campo grande',
    'natal',
    'joão pessoa',
    'maceió',
    'teresina',
    'são luís',
    'palmas',
    'portugal',
  ],
  'RK NEG | Produtos e compras': [
    'comprar',
    'mercado livre',
    'shopee',
    'amazon',
    'aluguel',
    'alugar',
    'nebulizador',
    'inalador',
    'aspirador nasal',
    'aspirador',
    'nosefrida',
    'travesseiro',
    'almofada',
    'colchão',
    'preço do capacete',
    'capacete preço',
    'loja',
    // 30/10/2026: quem procura capacete/órtese quer o produto (a clínica não faz)
    'capacete',
    'órtese',
    'ortese',
  ],
};

// ───────────── Operadoras de convênio (decisão do dono) ─────────────
// true  = nega também "convênio/plano de saúde" soltos e os nomes das operadoras
//         (pedido do dono em 25/10: "fisioterapia cassi", "amil"...). Custo: bloqueia
//         também "fisioterapia cassi reembolso" — a negativa vale para a busca inteira.
// false = só as expressões de credenciamento acima; medir a qualidade desses contatos
//         antes de ampliar (recomendação da revisão de 25/10).
// 30/10/2026: virou true (dono: "convênio não é nosso público"; metade das conversas pagas
// perguntou de plano). Aplicado na conta por ajustes-2026-10-30.js.
var NEGAR_OPERADORAS = true;
var OPERADORAS = [
  'convênio',
  'convenio',
  'convênios',
  'convenios',
  'plano de saúde',
  'planos de saúde',
  'unimed',
  'central nacional unimed',
  'amil',
  'bradesco',
  'sulamérica',
  'sulamerica',
  'sul america',
  'porto seguro saúde',
  'porto saúde',
  'care plus',
  'omint',
  'allianz saúde',
  'golden cross',
  'mediservice',
  'hapvida',
  'notredame',
  'notre dame',
  'intermédica',
  'intermedica',
  'prevent senior',
  'cassi',
  'geap',
  'capesesp',
  'e-vida',
  'saúde caixa',
  'postal saúde',
  'inas',
  'gdf saúde',
  'fusex',
  'fusma',
  'funsa',
  'plan-assiste',
  'plan assiste',
  'pro-social',
  'stf-med',
  'tst saúde',
  'trt saúde',
  'serpro saúde',
  'pas serpro',
  'life empresarial',
  'qualicorp',
  'plano de saude',
  'planos de saude',
];
if (NEGAR_OPERADORAS)
  LISTAS_NEGATIVAS['RK NEG | Convênio e planos'] =
    LISTAS_NEGATIVAS['RK NEG | Convênio e planos'].concat(OPERADORAS);

var LISTAS_NAO_MARCA = Object.keys(LISTAS_NEGATIVAS);
var LISTAS_MARCA = ['RK NEG | Emprego e formação'];

// ───────────────────────────── Textos comuns ────────────────────────────────
var T = {
  agende: 'Agende pelo WhatsApp',
  nota: 'Nota 5,0 no Google',
  crefito: 'Equipe com CREFITO',
  asaSul: 'Clínica na Asa Sul, Brasília',
  sessao: 'Sessões de Cerca de 45 Minutos',
  marca: 'Respira Kids | Fisioterapia',
  // 30/10/2026: na conta, os grupos Respiratória infantil, Fisioterapia pediátrica,
  // Desenvolvimento motor e Assimetria ganharam anúncio novo (ajustes-2026-10-30.js) sem
  // este título e com "Atendimento Particular" fixado na posição 2 + descrição "sem
  // convênio" fixada na 1. Este arquivo só cria a estrutura inicial.
  nf: 'Nota Fiscal Para Reembolso',
  cuidado: 'Cuidado Especializado',
  acolhe: 'Acolhimento de Verdade',
  plano: 'Avaliação e Plano Individual',
  // Respiratória: sessão a partir de R$ 280 (confirmado pelo dono, vale após o reajuste de 1º/11).
  preco280:
    'Sessões a partir de R$ 280. Aceitamos PIX e cartão. Nota fiscal para reembolso.',
  // Motor/torcicolo/assimetria: sessão a partir de R$ 320 e avaliação motora de R$ 370 —
  // sem preço no anúncio para não criar expectativa errada na 1ª consulta (o site mostra).
  valores:
    'Valores e formas de pagamento no site. PIX e cartão, com nota fiscal para reembolso.',
};

// ───────────────────────────── Campanhas ────────────────────────────────────
var CAMPANHAS = [
  {
    nome: 'RK | Pesquisa | Respiratória | DF',
    // 28/10/2026: 30 → 20 (já aparecia em 73% das buscas; perdia só 4% por orçamento)
    orcamentoDia: 20,
    cpcTeto: CPC_TETO.padrao,
    listas: LISTAS_NAO_MARCA,
    negativas: ['respira kids', 'respirakids'],
    grupos: [
      {
        nome: 'Fisioterapia respiratória infantil',
        url: BASE + '/fisioterapia-respiratoria/',
        path: ['respiratoria', 'infantil'],
        frase: [
          'fisioterapia respiratória infantil',
          // PAUSADA na conta em 27/10/2026 (nota de qualidade 1; a versão com acento cobre)
          'fisioterapia respiratoria infantil',
          'fisioterapia respiratória pediátrica',
          'fisioterapia respiratória bebê',
          'fisioterapia respiratória para bebê',
          'fisioterapia respiratória criança',
          'fisioterapia respiratória para criança',
          // 03/11/2026: "pulmonar" chegava sem palavra própria
          'fisioterapia pulmonar infantil',
          'fisioterapia pulmonar bebê',
          'fisioterapeuta respiratório infantil',
          'fisioterapeuta respiratória infantil',
          'fisio respiratória infantil',
          'fisioterapia respiratória brasília',
          'fisioterapia respiratória asa sul',
          'clínica de fisioterapia respiratória',
          'fisioterapia respiratória perto de mim',
        ],
        // Os genéricos (podem ser de adulto) só na exata, com as negativas de adulto valendo.
        exata: [
          'fisioterapia respiratória infantil',
          'fisioterapia respiratória bebê',
          'fisioterapia respiratória brasília',
          'fisioterapia respiratória infantil brasília',
          'fisioterapeuta respiratório infantil',
          'fisioterapia respiratória',
          'fisioterapeuta respiratório',
        ],
        // Negativas de condição MANTIDAS: enquanto o grupo de bronquiolite/aspiração estiver
        // pausado (revisão clínica da OFERTA, não só do texto), essas buscas não recebem
        // anúncio nenhum. Ao aprovar, basta ativar o grupo específico.
        negativas: [
          'bronquiolite',
          'catarro',
          'chiado',
          'secreção',
          'aspiração',
          'asma',
          'pneumonia',
        ],
        titulos: [
          '{KeyWord:Fisio Respiratória Infantil}',
          'Fisioterapia Respiratória',
          'Para Bebês e Crianças',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          'Atendimento Desde o Nascimento',
          'Avaliação Respiratória',
          T.sessao,
          T.plano,
          T.marca,
          'Sessões a Partir de R$ 280',
          T.acolhe,
          T.nf,
        ],
        descricoes: [
          'Fisioterapia respiratória para bebês e crianças em Brasília. Agende pelo WhatsApp.',
          'Avaliação respiratória e plano individual, com equipe com CREFITO e nota 5,0 no Google.',
          'Fisioterapeutas dedicadas a bebês e crianças, com conduta definida após a avaliação.',
          T.preco280,
        ],
      },
      {
        // PAUSADO até a responsável técnica aprovar os textos (indicação clínica da
        // fisioterapia na bronquiolite e da aspiração). Ativar só depois da revisão.
        nome: 'Bronquiolite, catarro e aspiração (revisão clínica)',
        pausado: true,
        url: BASE + '/fisioterapia-respiratoria/',
        path: ['respiratoria', 'bebe'],
        // Fase 1: só buscas de quem procura o atendimento (fisioterapia/aspiração/tratamento
        // + condição). Sintoma puro ("bebê com catarro") fica de fora: é pergunta de saúde.
        frase: [
          'bronquiolite fisioterapia',
          'fisioterapia bronquiolite',
          'fisioterapia para bronquiolite',
          'fisioterapia respiratória bronquiolite',
          'fisioterapia para catarro',
          'fisioterapia para bebê com catarro',
          'fisioterapia para tirar catarro',
          'fisioterapia para chiado',
          'fisioterapia asma infantil',
          'asma infantil fisioterapia',
          'fisioterapia pneumonia infantil',
          'pneumonia infantil fisioterapia',
          // Aspiração só ligada a atendimento profissional ("aspiração nasal bebê" puro
          // traz quem quer aprender a usar aspirador em casa).
          'aspiração de secreções em bebê',
          'aspiração nasal em clínica',
          'fisioterapeuta aspiração bebê',
        ],
        exata: ['bronquiolite fisioterapia', 'fisioterapia para catarro bebê'],
        negativas: [
          'sintomas',
          'contagioso',
          'quanto tempo dura',
          'remédio',
          'antibiótico',
          'transmissão',
        ],
        titulos: [
          'Fisioterapia na Bronquiolite',
          'Fisioterapia Para Catarro',
          'Aspiração de Secreções',
          'Mais Conforto Para Respirar',
          'Equipe Especializada em Bebês',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          T.sessao,
          'Atendimento Desde o Nascimento',
          T.marca,
          'Sessões a Partir de R$ 280',
          T.acolhe,
          T.plano,
        ],
        descricoes: [
          'Catarro, chiado ou bronquiolite? A fisioterapia respiratória ajuda a remover secreções.',
          'Aspiração de secreções quando indicada, com cuidado e técnica para bebês e crianças.',
          'Atendimento na Asa Sul, Brasília, com equipe com CREFITO. Siga a orientação do pediatra.',
          T.preco280,
        ],
      },
    ],
  },
  {
    nome: 'RK | Pesquisa | Desenvolvimento | DF',
    // 28/10/2026: 20 → 30 (perdia 46% das impressões por orçamento; 3 das 4 conversas)
    orcamentoDia: 30,
    cpcTeto: CPC_TETO.padrao,
    listas: LISTAS_NAO_MARCA,
    negativas: ['respira kids', 'respirakids'],
    grupos: [
      {
        nome: 'Torcicolo congênito',
        url: BASE + '/torcicolo-em-bebes/',
        path: ['torcicolo', 'bebe'],
        frase: [
          'torcicolo congênito bebê',
          'torcicolo congênito fisioterapia',
          'torcicolo congênito tratamento',
          'torcicolo muscular congênito',
          'torcicolo em bebê',
          'torcicolo bebê',
          'bebê com torcicolo',
          'fisioterapia torcicolo',
          'fisioterapia para torcicolo',
          'torcicolo bebê tratamento',
          'tratamento torcicolo bebê',
          'bebê com cabeça torta',
          'bebê com pescoço torto',
          // "bebê só vira a cabeça para um lado" REMOVIDA em 27/10/2026: o Google lê
          // "VIRA A" como o remédio Vira-A e reprova o anúncio do grupo.
          'bebê só olha para um lado',
        ],
        exata: [
          'torcicolo congênito',
          'torcicolo congenito',
          'torcicolo em bebê',
          'fisioterapia torcicolo bebê',
        ],
        negativas: ['dormir de mau jeito', 'remédio', 'pomada'],
        titulos: [
          '{KeyWord:Torcicolo em Bebês}',
          'Fisioterapia Para Torcicolo',
          'Torcicolo Congênito em Bebês',
          'Bebê Só Olha Para Um Lado?',
          'Quanto Antes, Melhor',
          'Avaliação Desde o 1º Mês',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          'Exercícios Para Fazer em Casa',
          T.sessao,
          T.marca,
          'Plano Individual Para o Bebê',
          'Orientação de Posicionamento',
        ],
        descricoes: [
          'Torcicolo congênito em bebês: avaliação e fisioterapia na Asa Sul. Agende pelo WhatsApp.',
          'Quanto mais cedo o tratamento começa, mais simples tende a ser o caminho. Fale conosco.',
          'Ensinamos posicionamento e exercícios para os pais continuarem em casa entre as sessões.',
          T.valores,
        ],
      },
      {
        nome: 'Assimetria craniana',
        url: BASE + '/assimetria-craniana/',
        path: ['assimetria', 'craniana'],
        // "plagiocefalia"/"braquicefalia"/"assimetria craniana" sozinhos (12 mil buscas/mês no
        // Brasil, muito informativos) só na exata; na frase, só com bebê/tratamento/fisioterapia.
        frase: [
          'assimetria craniana bebê',
          'assimetria craniana tratamento',
          'tratamento assimetria craniana',
          'fisioterapia assimetria craniana',
          'plagiocefalia bebê',
          'plagiocefalia tratamento',
          'tratamento plagiocefalia',
          'plagiocefalia fisioterapia',
          'fisioterapia plagiocefalia',
          'plagiocefalia brasília',
          'braquicefalia bebê',
          'braquicefalia tratamento',
          'cabeça chata bebê',
          'cabeça achatada bebê',
          'bebê com cabeça achatada',
        ],
        exata: [
          'plagiocefalia',
          'assimetria craniana',
          'braquicefalia',
          'plagiocefalia posicional',
        ],
        negativas: [
          'adulto',
          'cirurgia',
          'craniossinostose',
          'sindrome',
          'síndrome',
        ],
        titulos: [
          '{KeyWord:Assimetria Craniana}',
          'Plagiocefalia em Bebês',
          'Assimetria Craniana em Bebês',
          'Cabeça Achatada no Bebê?',
          'A Janela de Tratamento é Curta',
          'Braquicefalia e Plagiocefalia',
          'Avaliação Com Fisioterapeuta',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          T.sessao,
          T.marca,
          'Orientação de Posicionamento',
          'Avaliação Desde o 1º Mês',
        ],
        descricoes: [
          'Plagiocefalia e braquicefalia: avaliação e fisioterapia para bebês na Asa Sul, Brasília.',
          'Nos primeiros meses o crânio é mais maleável. Quanto antes avaliar, melhor. Fale conosco.',
          'Orientamos posicionamento e estímulos para os pais, com equipe com CREFITO.',
          T.valores,
        ],
      },
      {
        nome: 'Desenvolvimento motor',
        url: BASE + '/desenvolvimento-motor/',
        path: ['desenvolvimento', 'motor'],
        frase: [
          'fisioterapia motora infantil',
          'fisioterapia motora bebê',
          'fisioterapia motora pediátrica',
          // 'desenvolvimento motor bebê' e 'desenvolvimento motor infantil' PAUSADAS em
          // 30/10/2026: R$ 16,55, 7 cliques, 0 conversa, quase só buscas de "como fazer".
          'atraso motor bebê',
          'atraso no desenvolvimento motor',
          'estimulação precoce bebê',
          'estimulação precoce brasília',
          'fisioterapia estimulação precoce',
          'bebê não engatinha',
          'bebê não senta',
          'bebê não anda',
          'fisioterapia para bebê prematuro',
          'fisioterapia prematuro',
        ],
        exata: [
          'fisioterapia motora infantil',
          'estimulação precoce',
          'atraso motor bebê',
          'fisioterapia motora',
        ],
        negativas: [
          'adulto',
          'escola',
          'creche',
          'brinquedos',
          'atividades para',
          'autismo',
          'tea',
        ],
        titulos: [
          '{KeyWord:Desenvolvimento Motor}',
          'Fisioterapia Motora Infantil',
          'Estimulação Precoce',
          'Bebê Não Senta ou Engatinha?',
          'Cada Conquista no Tempo Certo',
          'Atraso Motor em Bebês',
          'Do 1º Mês aos Primeiros Passos',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          T.sessao,
          T.marca,
          'Avaliação Motora Completa',
          'Atendimento de Prematuros',
        ],
        descricoes: [
          'Fisioterapia para o desenvolvimento motor de bebês e crianças na Asa Sul, Brasília.',
          'Começamos com uma avaliação motora completa e montamos um plano para cada criança.',
          'Estímulos para cada fase, do primeiro mês aos primeiros passos. Agende pelo WhatsApp.',
          T.valores,
        ],
      },
      {
        nome: 'Fisioterapia pediátrica',
        url: BASE + '/fisioterapia-pediatrica-brasilia/',
        path: ['fisioterapia', 'pediatrica'],
        frase: [
          'fisioterapia pediátrica',
          'fisioterapia pediatrica',
          'fisioterapeuta pediátrico',
          'fisioterapeuta pediátrica',
          'fisioterapia infantil',
          'fisioterapeuta infantil',
          'fisioterapia bebê',
          'fisioterapia para bebê',
          'fisioterapia para criança',
          'clínica de fisioterapia infantil',
          'clínica fisioterapia pediátrica',
          'fisioterapia infantil brasília',
          'fisioterapia pediátrica brasília',
          'fisioterapeuta infantil brasília',
          // 'fisioterapia asa sul' PAUSADA em 28/10/2026: 63 impressões, 4 cliques,
          // R$ 12,65 e nenhuma conversa — só buscas por outras clínicas (adulto).
        ],
        exata: [
          'fisioterapia pediátrica',
          'fisioterapia infantil',
          'fisioterapia infantil brasília',
          'fisioterapeuta pediátrico',
          // 03/11/2026: lead pediu "fisioterapia neonatal". Só exata: "neonatal" também é
          // UTI/hospital; as buscas "pediátrica e neonatal" já entram pela frase acima.
          'fisioterapia neonatal',
        ],
        // Só neste grupo (genérico): empurra os temas para o grupo/campanha específico,
        // sem tirar a busca de circulação (o grupo específico continua elegível).
        negativas: [
          'torcicolo',
          'plagiocefalia',
          'assimetria',
          'braquicefalia',
          'motora',
          'motor',
          'respiratória',
          'respiratoria',
          'bronquiolite',
        ],
        titulos: [
          '{KeyWord:Fisioterapia Pediátrica}',
          'Fisioterapeuta Pediátrico',
          'Fisioterapia Infantil Brasília',
          'Respiratória, Motora e Mais',
          '4 Especialidades Pediátricas',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          'Atendimento Desde o Nascimento',
          T.sessao,
          T.marca,
          T.cuidado,
          T.acolhe,
          T.nf,
        ],
        descricoes: [
          'Fisioterapia respiratória, motora, torcicolo e assimetria craniana para bebês e crianças.',
          'Clínica na Asa Sul, Brasília, com equipe com CREFITO e nota 5,0 no Google.',
          'Cuidado especializado, acolhimento de verdade e plano individual. Agende pelo WhatsApp.',
          'Valores conforme a especialidade, a partir de R$ 280. PIX, cartão e nota fiscal.',
        ],
      },
    ],
  },
  {
    nome: 'RK | Pesquisa | Marca',
    orcamentoDia: 5,
    cpcTeto: CPC_TETO.marca,
    listas: LISTAS_MARCA,
    negativas: [],
    grupos: [
      {
        nome: 'Marca e equipe',
        url: BASE + '/',
        path: ['respira-kids', 'brasilia'],
        frase: [
          'respira kids',
          'respirakids',
          'respira kids brasília',
          'respira kids fisioterapia',
          'clínica respira kids',
          'bruna cury fisioterapeuta',
          'bruna cury fisioterapia',
          'flávia pacheco fisioterapeuta',
          'jeniffer marjory fisioterapeuta',
        ],
        exata: ['respira kids', 'respirakids', 'respira kids brasília'],
        negativas: [],
        titulos: [
          'Respira Kids | Site Oficial',
          'Respira Kids Fisioterapia',
          'Fisioterapia Pediátrica',
          T.asaSul,
          T.agende,
          T.nota,
          T.crefito,
          'Para Bebês e Crianças',
          T.sessao,
          T.cuidado,
          T.acolhe,
          'Conheça Nossa Equipe',
          'Respiratória e Motora',
          'Torcicolo e Assimetria',
          T.nf,
        ],
        descricoes: [
          'Respira Kids: fisioterapia pediátrica na Asa Sul, Brasília. Agende pelo WhatsApp.',
          'Respiratória, motora, torcicolo e assimetria craniana para bebês e crianças.',
          'Equipe com CREFITO, nota 5,0 no Google, cuidado especializado e acolhimento.',
          'Valores conforme a especialidade, a partir de R$ 280. PIX, cartão e nota fiscal.',
        ],
      },
    ],
  },
];

// ───────────────────────────── Recursos da conta ────────────────────────────
var SITELINKS = [
  [
    'Fisioterapia Respiratória',
    'Para bebês e crianças',
    'Sessões a partir de R$ 280',
    '/fisioterapia-respiratoria/',
  ],
  [
    'Torcicolo em Bebês',
    'Avaliação desde o primeiro mês',
    'Orientação para os pais',
    '/torcicolo-em-bebes/',
  ],
  [
    'Assimetria Craniana',
    'Plagiocefalia e braquicefalia',
    'Quanto antes avaliar, melhor',
    '/assimetria-craniana/',
  ],
  [
    'Desenvolvimento Motor',
    'Do 1º mês aos primeiros passos',
    'Avaliação motora completa',
    '/desenvolvimento-motor/',
  ],
  [
    'Nossa Equipe',
    'Fisioterapeutas com CREFITO',
    'Conheça quem vai cuidar',
    '/nossa-equipe/',
  ],
  [
    'Perguntas Frequentes',
    'Valores, duração e pagamento',
    'Tire suas dúvidas antes',
    '/perguntas-frequentes/',
  ],
];
var FRASES_DESTAQUE = [
  'Nota 5,0 no Google',
  'Equipe com CREFITO',
  'Agende pelo WhatsApp',
  'Asa Sul, Brasília',
  'Desde recém-nascidos',
  'Nota fiscal p/ reembolso',
  'Sessões de 45 minutos',
  'Aceitamos PIX e cartão',
];
var SNIPPET = {
  cabecalho: 'Serviços',
  valores: [
    'Fisio respiratória',
    'Torcicolo congênito',
    'Assimetria craniana',
    'Desenvolvimento motor',
  ],
};

// ═════════════════════════════ Motor (v3, 2 fases) ══════════════════════════
// Fase 1 (atômica, ids temporários): listas de negativas, orçamentos, campanhas
//   PAUSADAS, grupos, anúncios e recursos da conta. Ou cria tudo, ou nada.
// Fase 2 (ids reais, falha parcial): local, idioma, negativas de campanha, vínculo
//   das listas, palavras-chave e negativas de grupo. O que o Google recusar (ex.:
//   política em palavra-chave) fica no registro sem travar o resto.
// Reparo: se as 3 campanhas já existem, pula a fase 1 e a fase 2 só cria o que
//   falta — rodar de novo é seguro. No fim, VERIFICA confere cada campanha.
// No Visualizar, a fase 2 não roda (precisa das campanhas criadas de verdade):
//   o registro mostra o plano dela.
var LIMITES = {
  titulo: 30,
  descricao: 90,
  path: 15,
  sitelink: 25,
  sitelinkDesc: 35,
  destaque: 25,
  snippet: 25,
};
var IDIOMA_PT = 'languageConstants/1014';

function main() {
  var cid = AdsApp.currentAccount().getCustomerId().replace(/-/g, '');
  var preview = AdsApp.getExecutionInfo().isPreview();
  var problemas = validar();
  if (problemas.length)
    throw new Error('Corrija antes de criar:\n' + problemas.join('\n'));
  var geo = acharGeo();
  var est = estadoAtual();
  var nomes = CAMPANHAS.map(function (c) {
    return c.nome;
  });
  var existentes = nomes.filter(function (n) {
    return est.campanhas[n];
  });

  if (existentes.length === 0) {
    var listasExistentes = Object.keys(LISTAS_NEGATIVAS).filter(function (n) {
      return est.listas[n];
    });
    if (listasExistentes.length)
      throw new Error(
        'Já existem listas de negativas com estes nomes (apague-as ou rode em modo reparo): ' +
          listasExistentes.join(', ')
      );
    fase1(cid, preview);
    if (preview) {
      Logger.log(
        'FASE 2 (só ao executar): local DF + português + listas + negativas + palavras-chave em cada campanha. Planejado: ' +
          contarFase2() +
          ' operações.'
      );
      conferencias();
      return;
    }
    est = estadoAtual(); // relê com os ids reais criados
  } else if (existentes.length < nomes.length) {
    throw new Error(
      'Só parte das campanhas existe (' +
        existentes.join(', ') +
        '). Remova-as ou crie as que faltam antes.'
    );
  } else {
    Logger.log(
      'MODO REPARO: as 3 campanhas já existem; a fase 1 é pulada e a fase 2 só cria o que falta.'
    );
    if (preview) {
      Logger.log(
        'VISUALIZAÇÃO em modo reparo: a fase 2 seria executada agora.'
      );
    }
  }
  fase2(est, geo, preview);
  if (!preview) verificar(geo);
  conferencias();
}

// ── Fase 1 ───────────────────────────────────────────────────────────────────
function fase1(cid, preview) {
  var ops = [];
  var tmp = -1;
  function novo(tipo) {
    return 'customers/' + cid + '/' + tipo + '/' + tmp--;
  }

  Object.keys(LISTAS_NEGATIVAS).forEach(function (nome) {
    var rn = novo('sharedSets');
    ops.push({
      sharedSetOperation: {
        create: { resourceName: rn, name: nome, type: 'NEGATIVE_KEYWORDS' },
      },
    });
    LISTAS_NEGATIVAS[nome].forEach(function (k) {
      ops.push({
        sharedCriterionOperation: { create: { sharedSet: rn, keyword: kw(k) } },
      });
    });
  });

  CAMPANHAS.forEach(function (c) {
    var orc = novo('campaignBudgets');
    ops.push({
      campaignBudgetOperation: {
        create: {
          resourceName: orc,
          name: c.nome + ' | orçamento',
          amountMicros: micros(c.orcamentoDia),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    });
    var camp = novo('campaigns');
    ops.push({
      campaignOperation: {
        create: {
          resourceName: camp,
          name: c.nome,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: orc,
          targetSpend: { cpcBidCeilingMicros: micros(c.cpcTeto) },
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          geoTargetTypeSetting: {
            positiveGeoTargetType: 'PRESENCE',
            negativeGeoTargetType: 'PRESENCE',
          },
          containsEuPoliticalAdvertising:
            'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    });
    c.grupos.forEach(function (g) {
      var ag = novo('adGroups');
      ops.push({
        adGroupOperation: {
          create: {
            resourceName: ag,
            name: g.nome,
            campaign: camp,
            type: 'SEARCH_STANDARD',
            status: g.pausado ? 'PAUSED' : 'ENABLED',
            cpcBidMicros: micros(c.cpcTeto),
          },
        },
      });
      ops.push({
        adGroupAdOperation: {
          create: {
            adGroup: ag,
            status: 'ENABLED',
            ad: {
              finalUrls: [g.url],
              responsiveSearchAd: {
                headlines: g.titulos.map(function (t) {
                  return { text: t };
                }),
                descriptions: g.descricoes.map(function (d) {
                  return { text: d };
                }),
                path1: g.path[0],
                path2: g.path[1],
              },
            },
          },
        },
      });
    });
  });

  SITELINKS.forEach(function (s) {
    var a = novo('assets');
    ops.push({
      assetOperation: {
        create: {
          resourceName: a,
          finalUrls: [BASE + s[3]],
          sitelinkAsset: {
            linkText: s[0],
            description1: s[1],
            description2: s[2],
          },
        },
      },
    });
    ops.push({
      customerAssetOperation: { create: { asset: a, fieldType: 'SITELINK' } },
    });
  });
  FRASES_DESTAQUE.forEach(function (f) {
    var a = novo('assets');
    ops.push({
      assetOperation: {
        create: { resourceName: a, calloutAsset: { calloutText: f } },
      },
    });
    ops.push({
      customerAssetOperation: { create: { asset: a, fieldType: 'CALLOUT' } },
    });
  });
  var sn = novo('assets');
  ops.push({
    assetOperation: {
      create: {
        resourceName: sn,
        structuredSnippetAsset: {
          header: SNIPPET.cabecalho,
          values: SNIPPET.valores,
        },
      },
    },
  });
  ops.push({
    customerAssetOperation: {
      create: { asset: sn, fieldType: 'STRUCTURED_SNIPPET' },
    },
  });

  Logger.log(
    'FASE 1: ' +
      ops.length +
      ' operações' +
      (preview ? ' (VISUALIZAÇÃO: nada é criado)' : '')
  );
  var res = AdsApp.mutateAll(ops, { partialFailure: false });
  var erros = [];
  res.forEach(function (r, i) {
    if (!r.isSuccessful())
      erros.push(
        '#' +
          i +
          ' ' +
          Object.keys(ops[i])[0] +
          ': ' +
          r.getErrorMessages().join(' | ')
      );
  });
  if (erros.length) {
    erros.slice(0, 40).forEach(function (e) {
      Logger.log('ERRO FASE 1 ' + e);
    });
    throw new Error(
      erros.length +
        ' operações da fase 1 falharam (nada foi criado: operação atômica).'
    );
  }
  Logger.log(
    'FASE 1 OK: ' +
      res.length +
      ' operações ' +
      (preview ? 'validadas.' : 'aplicadas (campanhas PAUSADAS).')
  );
}

// ── Fase 2 ───────────────────────────────────────────────────────────────────
function contarFase2() {
  var n = 0;
  CAMPANHAS.forEach(function (c) {
    n += 2 + c.negativas.length + c.listas.length;
    c.grupos.forEach(function (g) {
      n += g.frase.length + g.exata.length + g.negativas.length;
    });
  });
  return n;
}

function chave(texto, tipo) {
  return String(texto).toLowerCase().normalize('NFC') + '|' + tipo;
}

function fase2(est, geo, preview) {
  var ops = [];
  var rotulos = [];
  function add(op, rotulo) {
    ops.push(op);
    rotulos.push(rotulo);
  }

  CAMPANHAS.forEach(function (c) {
    var camp = est.campanhas[c.nome];
    var cc = est.critCampanha[c.nome] || { geo: {}, idioma: {}, neg: {} };
    if (!cc.geo[geo])
      add(
        {
          campaignCriterionOperation: {
            create: { campaign: camp, location: { geoTargetConstant: geo } },
          },
        },
        c.nome + ' › local DF'
      );
    if (!cc.idioma[IDIOMA_PT])
      add(
        {
          campaignCriterionOperation: {
            create: {
              campaign: camp,
              language: { languageConstant: IDIOMA_PT },
            },
          },
        },
        c.nome + ' › idioma português'
      );
    c.negativas.forEach(function (k) {
      if (!cc.neg[chave(k, 'PHRASE')])
        add(
          {
            campaignCriterionOperation: {
              create: { campaign: camp, negative: true, keyword: kw(k) },
            },
          },
          c.nome + ' › negativa "' + k + '"'
        );
    });
    var ligadas = est.listasDaCampanha[c.nome] || {};
    c.listas.forEach(function (nome) {
      if (!est.listas[nome]) {
        Logger.log(
          'ATENÇÃO: lista "' +
            nome +
            '" não existe; não dá para ligar em ' +
            c.nome
        );
        return;
      }
      if (!ligadas[nome])
        add(
          {
            campaignSharedSetOperation: {
              create: { campaign: camp, sharedSet: est.listas[nome] },
            },
          },
          c.nome + ' › lista "' + nome + '"'
        );
    });
    c.grupos.forEach(function (g) {
      var ag = est.grupos[c.nome + '|' + g.nome];
      if (!ag) {
        Logger.log(
          'ATENÇÃO: grupo "' + g.nome + '" não encontrado em ' + c.nome
        );
        return;
      }
      var ex = est.palavras[c.nome + '|' + g.nome] || {};
      g.frase.forEach(function (k) {
        if (!ex[chave(k, 'PHRASE')])
          add(
            {
              adGroupCriterionOperation: {
                create: {
                  adGroup: ag,
                  status: 'ENABLED',
                  keyword: { text: k, matchType: 'PHRASE' },
                },
              },
            },
            g.nome + ' › "' + k + '" (frase)'
          );
      });
      g.exata.forEach(function (k) {
        if (!ex[chave(k, 'EXACT')])
          add(
            {
              adGroupCriterionOperation: {
                create: {
                  adGroup: ag,
                  status: 'ENABLED',
                  keyword: { text: k, matchType: 'EXACT' },
                },
              },
            },
            g.nome + ' › [' + k + '] (exata)'
          );
      });
      g.negativas.forEach(function (k) {
        if (!ex['neg|' + chave(k, 'PHRASE')])
          add(
            {
              adGroupCriterionOperation: {
                create: { adGroup: ag, negative: true, keyword: kw(k) },
              },
            },
            g.nome + ' › negativa "' + k + '"'
          );
      });
    });
  });

  if (!ops.length) {
    Logger.log('FASE 2: nada a criar (tudo já existe).');
    return;
  }
  Logger.log(
    'FASE 2: ' + ops.length + ' operações' + (preview ? ' (VISUALIZAÇÃO)' : '')
  );
  var res = AdsApp.mutateAll(ops, { partialFailure: true });
  var ok = 0,
    recusadas = [];
  res.forEach(function (r, i) {
    if (r.isSuccessful()) ok++;
    else recusadas.push(rotulos[i] + ' — ' + r.getErrorMessages().join(' | '));
  });
  Logger.log('FASE 2: ' + ok + ' criadas, ' + recusadas.length + ' recusadas.');
  recusadas.forEach(function (x) {
    Logger.log('RECUSADA ' + x);
  });
}

// ── Leitura do que já existe ─────────────────────────────────────────────────
function lista(arr) {
  return arr
    .map(function (n) {
      return "'" + String(n).replace(/'/g, "\\'") + "'";
    })
    .join(',');
}

function estadoAtual() {
  var nomes = lista(
    CAMPANHAS.map(function (c) {
      return c.nome;
    })
  );
  var e = {
    campanhas: {},
    grupos: {},
    listas: {},
    listasDaCampanha: {},
    critCampanha: {},
    palavras: {},
  };
  var it = AdsApp.search(
    'SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.name IN (' +
      nomes +
      ") AND campaign.status != 'REMOVED'"
  );
  while (it.hasNext()) {
    var r = it.next();
    e.campanhas[r.campaign.name] = r.campaign.resourceName;
  }
  var it2 = AdsApp.search(
    'SELECT shared_set.resource_name, shared_set.name FROM shared_set WHERE shared_set.name IN (' +
      lista(Object.keys(LISTAS_NEGATIVAS)) +
      ") AND shared_set.status = 'ENABLED'"
  );
  while (it2.hasNext()) {
    var s = it2.next();
    e.listas[s.sharedSet.name] = s.sharedSet.resourceName;
  }
  if (!Object.keys(e.campanhas).length) return e;

  var it3 = AdsApp.search(
    'SELECT campaign.name, ad_group.resource_name, ad_group.name FROM ad_group WHERE campaign.name IN (' +
      nomes +
      ") AND ad_group.status != 'REMOVED'"
  );
  while (it3.hasNext()) {
    var g = it3.next();
    e.grupos[g.campaign.name + '|' + g.adGroup.name] = g.adGroup.resourceName;
  }
  var it4 = AdsApp.search(
    'SELECT campaign.name, shared_set.name FROM campaign_shared_set WHERE campaign.name IN (' +
      nomes +
      ") AND campaign_shared_set.status = 'ENABLED'"
  );
  while (it4.hasNext()) {
    var l = it4.next();
    (e.listasDaCampanha[l.campaign.name] =
      e.listasDaCampanha[l.campaign.name] || {})[l.sharedSet.name] = 1;
  }
  var it5 = AdsApp.search(
    'SELECT campaign.name, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, ' +
      'campaign_criterion.language.language_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type ' +
      'FROM campaign_criterion WHERE campaign.name IN (' +
      nomes +
      ')'
  );
  while (it5.hasNext()) {
    var cr = it5.next();
    var n = cr.campaign.name;
    var c = cr.campaignCriterion;
    var x = (e.critCampanha[n] = e.critCampanha[n] || {
      geo: {},
      idioma: {},
      neg: {},
    });
    if (c.location && c.location.geoTargetConstant)
      x.geo[c.location.geoTargetConstant] = 1;
    if (c.language && c.language.languageConstant)
      x.idioma[c.language.languageConstant] = 1;
    if (c.keyword && c.negative)
      x.neg[chave(c.keyword.text, c.keyword.matchType)] = 1;
  }
  var it6 = AdsApp.search(
    'SELECT campaign.name, ad_group.name, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type ' +
      'FROM ad_group_criterion WHERE campaign.name IN (' +
      nomes +
      ") AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'"
  );
  while (it6.hasNext()) {
    var k = it6.next();
    var key = k.campaign.name + '|' + k.adGroup.name;
    var ac = k.adGroupCriterion;
    (e.palavras[key] = e.palavras[key] || {})[
      (ac.negative ? 'neg|' : '') + chave(ac.keyword.text, ac.keyword.matchType)
    ] = 1;
  }
  return e;
}

// ── Verificação final (só ao executar) ───────────────────────────────────────
function verificar(geo) {
  var e = estadoAtual();
  var tudoOk = true;
  CAMPANHAS.forEach(function (c) {
    var cc = e.critCampanha[c.nome] || { geo: {}, idioma: {}, neg: {} };
    var ligadas = Object.keys(e.listasDaCampanha[c.nome] || {}).length;
    var palavras = 0,
      recusadas = 0;
    c.grupos.forEach(function (g) {
      var ex = e.palavras[c.nome + '|' + g.nome] || {};
      g.frase.forEach(function (k) {
        if (ex[chave(k, 'PHRASE')]) palavras++;
        else recusadas++;
      });
      g.exata.forEach(function (k) {
        if (ex[chave(k, 'EXACT')]) palavras++;
        else recusadas++;
      });
    });
    var ok =
      !!cc.geo[geo] && !!cc.idioma[IDIOMA_PT] && ligadas === c.listas.length;
    if (!ok) tudoOk = false;
    Logger.log(
      'VERIFICA "' +
        c.nome +
        '": local DF=' +
        (cc.geo[geo] ? 'ok' : 'FALTA') +
        ', português=' +
        (cc.idioma[IDIOMA_PT] ? 'ok' : 'FALTA') +
        ', listas=' +
        ligadas +
        '/' +
        c.listas.length +
        ', palavras-chave=' +
        palavras +
        ' (fora: ' +
        recusadas +
        ')' +
        (ok ? '' : ' ← NÃO ATIVAR, rode o script de novo')
    );
  });
  Logger.log(
    tudoOk
      ? 'VERIFICA: segmentação completa nas 3 campanhas (seguem PAUSADAS).'
      : 'VERIFICA: falta segmentação; rode o script de novo (modo reparo) antes de ativar.'
  );
}

// Linhas "CONFERE": o que a revisão pediu para confirmar.
function conferencias() {
  CAMPANHAS.forEach(function (c) {
    Logger.log(
      'CONFERE campanha "' +
        c.nome +
        '": criada PAUSADA, sem sufixo nem modelo de rastreamento próprios, só Pesquisa Google (sem parceiros/Display).'
    );
  });
  var suf = '';
  try {
    var it = AdsApp.search('SELECT customer.final_url_suffix FROM customer');
    if (it.hasNext()) suf = it.next().customer.finalUrlSuffix || '';
  } catch (e) {
    suf = '(não consegui ler: ' + e + ')';
  }
  var ok =
    /utm_source=google/.test(suf) && /rk_adgroup=\{adgroupid\}/.test(suf);
  Logger.log(
    'CONFERE sufixo da conta: ' +
      (ok
        ? 'OK (utm_* e rk_* presentes)'
        : 'ATENÇÃO, não encontrado ou incompleto: ' + suf)
  );
  Logger.log(
    'CONFERE NEGAR_OPERADORAS=' +
      NEGAR_OPERADORAS +
      ' → lista de convênio com ' +
      LISTAS_NEGATIVAS['RK NEG | Convênio e planos'].length +
      ' termos'
  );
  CAMPANHAS.forEach(function (c) {
    c.grupos.forEach(function (g) {
      if (g.pausado)
        Logger.log('CONFERE grupo PAUSADO "' + g.nome + '" (' + c.nome + ')');
      else if (g.negativas.length)
        Logger.log(
          'CONFERE negativas do grupo "' +
            g.nome +
            '": ' +
            g.negativas.join(', ')
        );
    });
  });
}

function kw(texto) {
  return { text: texto, matchType: 'PHRASE' };
}
function micros(reais) {
  return String(Math.round(reais * 1e6));
}

function acharGeo() {
  var nomes = ["'Federal District,Brazil'", "'Distrito Federal,Brazil'"];
  for (var i = 0; i < nomes.length; i++) {
    var it = AdsApp.search(
      'SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name, ' +
        'geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant ' +
        'WHERE geo_target_constant.canonical_name = ' +
        nomes[i]
    );
    var achados = [];
    while (it.hasNext()) achados.push(it.next().geoTargetConstant);
    achados = achados.filter(function (g) {
      return g.status === 'ENABLED';
    });
    if (achados.length === 1) {
      Logger.log(
        'Local encontrado: ' +
          achados[0].canonicalName +
          ' (' +
          achados[0].targetType +
          ') = ' +
          achados[0].resourceName
      );
      return achados[0].resourceName;
    }
  }
  throw new Error(
    'Não achei o Distrito Federal nas constantes de local do Google.'
  );
}

function visivel(t) {
  return t.replace(/\{KeyWord:([^}]*)\}/i, '$1');
}

function validar() {
  var p = [];
  function chk(t, max, onde) {
    if (visivel(t).length > max)
      p.push(onde + ' passa de ' + max + ' (' + visivel(t).length + '): ' + t);
  }
  CAMPANHAS.forEach(function (c) {
    c.grupos.forEach(function (g) {
      var onde = c.nome + ' › ' + g.nome;
      if (g.titulos.length < 3 || g.titulos.length > 15)
        p.push(onde + ': precisa de 3–15 títulos');
      if (g.descricoes.length < 2 || g.descricoes.length > 4)
        p.push(onde + ': precisa de 2–4 descrições');
      var vistos = {};
      g.titulos.forEach(function (t) {
        chk(t, LIMITES.titulo, onde + ' título');
        if (vistos[t.toLowerCase()]) p.push(onde + ' título repetido: ' + t);
        vistos[t.toLowerCase()] = 1;
      });
      g.descricoes.forEach(function (d) {
        chk(d, LIMITES.descricao, onde + ' descrição');
      });
      g.path.forEach(function (x) {
        chk(x, LIMITES.path, onde + ' caminho');
      });
      g.frase.concat(g.exata).forEach(function (k) {
        if (k.split(' ').length > 10 || k.length > 80)
          p.push(onde + ' palavra-chave longa: ' + k);
      });
    });
  });
  SITELINKS.forEach(function (s) {
    chk(s[0], LIMITES.sitelink, 'sitelink');
    chk(s[1], LIMITES.sitelinkDesc, 'sitelink desc');
    chk(s[2], LIMITES.sitelinkDesc, 'sitelink desc');
  });
  FRASES_DESTAQUE.forEach(function (f) {
    chk(f, LIMITES.destaque, 'frase de destaque');
  });
  SNIPPET.valores.forEach(function (v) {
    chk(v, LIMITES.snippet, 'snippet');
  });
  return p;
}

if (typeof module !== 'undefined')
  module.exports = {
    CAMPANHAS: CAMPANHAS,
    LISTAS_NEGATIVAS: LISTAS_NEGATIVAS,
    SITELINKS: SITELINKS,
    FRASES_DESTAQUE: FRASES_DESTAQUE,
    SNIPPET: SNIPPET,
    validar: validar,
  };
