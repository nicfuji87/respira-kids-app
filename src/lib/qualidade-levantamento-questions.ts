// AI dev note: Questionário do levantamento para o Manual de Boas Práticas e POPs.
// Fonte da verdade das PERGUNTAS (as respostas ficam em qualidade_levantamento_respostas).
// Espelha docs/LEVANTAMENTO_POPS.md — se editar um, edite o outro.
//
// Convenções:
//   critica: true      -> 🔴 trava a escrita do POP; aparece no filtro "só as críticas"
//   jaRespondida       -> o dono já respondeu no chat; mostramos como contexto para
//                         ele só complementar, em vez de redigitar
//   aceitaFoto: true   -> foto responde melhor que texto (rótulo, layout, material)
//   rt: true           -> decisão do responsável técnico (Bruna), não do admin

export type BlocoId =
  | 'FOTOS'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q';

export interface LevantamentoPergunta {
  id: string;
  texto: string;
  ajuda?: string;
  critica?: boolean;
  jaRespondida?: string;
  aceitaFoto?: boolean;
  longo?: boolean;
  rt?: boolean;
}

export interface LevantamentoBloco {
  id: BlocoId;
  titulo: string;
  descricao?: string;
  perguntas: LevantamentoPergunta[];
}

export const LEVANTAMENTO_BLOCOS: LevantamentoBloco[] = [
  // ============================================================
  {
    id: 'FOTOS',
    titulo: 'Fotos',
    descricao:
      'Foto responde melhor que texto aqui. Pode ser torta, pode ser do celular — o que importa é dar pra ler e ver o material.',
    perguntas: [
      {
        id: 'FOTO-1',
        texto: 'Rótulo de TODOS os produtos de limpeza e desinfecção',
        ajuda:
          'Frente e verso, de perto, dando pra ler o registro ANVISA e a instrução de diluição. Inclui sabonete e álcool gel. É o item que mais destrava POP — sozinho responde o bloco F quase inteiro.',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'FOTO-2',
        texto: 'Depósito / área de descontaminação',
        ajuda: 'Visão geral do espaço e um close da bancada.',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'FOTO-3',
        texto: 'Armário onde os produtos de limpeza ficam guardados',
        aceitaFoto: true,
      },
      {
        id: 'FOTO-4',
        texto: 'Tapete de atendimento e trocador',
        ajuda: 'De perto, dando pra identificar o material.',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'FOTO-5',
        texto: 'Materiais reutilizáveis juntos',
        ajuda: 'Proetz, máscaras de inalação, acapella, shaker, ambu etc.',
        aceitaFoto: true,
      },
      {
        id: 'FOTO-6',
        texto: 'Brinquedos — os da sala e os da recepção',
        aceitaFoto: true,
      },
      {
        id: 'FOTO-7',
        texto: 'Pia da sala de atendimento',
        ajuda: 'Pra ver torneira, dispensers e lixeira.',
        aceitaFoto: true,
      },
      {
        id: 'FOTO-8',
        texto: 'O micro-ondas usado no Proetz e onde ele fica',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'FOTO-9',
        texto: 'Lixeiras (sala, recepção, depósito)',
        ajuda: 'Pra ver se têm tampa/pedal e a cor do saco.',
        aceitaFoto: true,
      },
      {
        id: 'FOTO-10',
        texto: 'Alvará sanitário e qualquer POP ou manual que já exista',
        aceitaFoto: true,
      },
      { id: 'FOTO-11', texto: 'Planta baixa, se tiver', aceitaFoto: true },
    ],
  },

  // ============================================================
  {
    id: 'A',
    titulo: 'Identificação e responsabilidade',
    perguntas: [
      { id: 'A1', texto: 'Razão social completa e CNPJ' },
      {
        id: 'A2',
        texto: 'Endereço completo da clínica (com sala/andar) e nome do prédio',
      },
      {
        id: 'A3',
        texto: 'Tem alvará sanitário vigente? Número e validade',
        ajuda: 'Se não tem, está em processo?',
      },
      { id: 'A4', texto: 'Tem CNES? Número' },
      {
        id: 'A5',
        texto: 'Nome completo e CREFITO da responsável técnica',
        ajuda: 'Com a região, ex.: CREFITO-3/xxxxx-F. Desde quando é RT?',
        critica: true,
        jaRespondida:
          'Bruna Cury — falta o nome completo e o número do CREFITO.',
      },
      {
        id: 'A6',
        texto: 'Tem RT substituto formalizado (para férias/ausência)? Quem?',
      },
      {
        id: 'A7',
        texto: 'Quantas pessoas na equipe hoje, por função?',
        ajuda: 'Fisioterapeutas, estagiárias, secretárias, limpeza.',
      },
      { id: 'A8', texto: 'Horário de funcionamento por dia da semana' },
      {
        id: 'A9',
        texto:
          'Quais instituições de ensino mandam estagiárias? Tem convênio assinado?',
      },
      {
        id: 'A10',
        texto:
          'A clínica tem CNPJ próprio ou os profissionais atendem como PJ individual dentro do espaço?',
        ajuda: 'Muda quem responde pelo alvará.',
      },
    ],
  },

  // ============================================================
  {
    id: 'B',
    titulo: 'Estrutura física',
    perguntas: [
      {
        id: 'B1',
        texto: 'Metragem aproximada de cada sala e de cada recepção',
        jaRespondida:
          '3 salas de atendimento iguais e 2 recepções separadas. Falta a metragem.',
      },
      {
        id: 'B2',
        texto: 'O que exatamente tem em cada sala?',
        ajuda:
          'Trocador, tapete, pia, bancada, armário, poltrona, mesa, nicho de brinquedo, lixeira, ar-condicionado…',
        longo: true,
      },
      {
        id: 'B3',
        texto: 'Piso: qual o material?',
        ajuda:
          'O padrão espinha de peixe das fotos é vinílico, laminado ou madeira de verdade? Tem rejunte/fresta entre as réguas? É o mesmo em toda a clínica?',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'B4',
        texto:
          'Parede: pintura acrílica lavável, epóxi, papel de parede, marcenaria?',
        ajuda:
          'As fotos mostram painel de madeira — é laqueado/selado ou madeira crua?',
      },
      {
        id: 'B5',
        texto:
          'Teto: o forro perfurado das fotos é de qual material? É lavável?',
        ajuda: 'Gesso, PVC, lã mineral, placa acústica.',
      },
      {
        id: 'B6',
        texto:
          'Janelas abrem para ventilação natural? Persiana/cortina de qual material?',
        ajuda: 'Quem limpa e com que frequência?',
      },
      {
        id: 'B7',
        texto: 'Tem pia com água corrente nas 3 salas ou só em algumas?',
        ajuda:
          'A torneira é de acionamento manual, por sensor, ou de cotovelo/pedal?',
        critica: true,
      },
      {
        id: 'B8',
        texto: 'Em cada pia tem sabonete líquido, papel toalha e álcool gel?',
        ajuda: 'Os dispensers são de refil fechado ou de frasco reabastecido?',
      },
      {
        id: 'B9',
        texto: 'Lixeiras: quantas por sala, têm tampa e pedal?',
        ajuda:
          'Usam saco branco leitoso para resíduo infectante? Onde fica a de resíduo comum?',
      },
      {
        id: 'B10',
        texto:
          'Quantos banheiros? São separados equipe × paciente? Tem trocador?',
      },
      {
        id: 'B11',
        texto:
          'Tem copa/cozinha? Tem vestiário ou armário para pertences da equipe?',
      },
      {
        id: 'B12',
        texto:
          'Tem DML (depósito de material de limpeza) separado, com tanque?',
        ajuda: 'Ou os produtos ficam junto com outra coisa?',
        critica: true,
      },
      {
        id: 'B13',
        texto: 'O depósito que também serve de descontaminação: como é?',
        ajuda:
          'Tamanho, tem pia ou tanque dentro, tem bancada? Existe alguma divisão entre "onde chega sujo" e "onde guarda limpo", nem que seja informal?',
        critica: true,
        longo: true,
        aceitaFoto: true,
      },
      {
        id: 'B14',
        texto: 'Ar-condicionado: quantos, de que tipo, em quais ambientes?',
        ajuda:
          'Quem faz a manutenção e com que frequência? Existe PMOC escrito? (a vigilância pede)',
        critica: true,
      },
      { id: 'B15', texto: 'Tem exaustor ou renovação de ar nas salas?' },
      {
        id: 'B16',
        texto:
          'As portas das salas são de madeira, vidro, ou de correr? Têm visor?',
      },
      {
        id: 'B17',
        texto: 'Tem bebedouro ou máquina de café de uso dos pacientes?',
        ajuda:
          'Vi uma máquina na recepção. Quem higieniza e com que frequência?',
      },
    ],
  },

  // ============================================================
  {
    id: 'C',
    titulo: 'Fluxo do paciente',
    descricao:
      'Esse bloco vira o POP que mais diferencia vocês — as duas recepções e o espaçamento de agenda são controle de infecção de verdade. Quanto mais detalhe, melhor.',
    perguntas: [
      {
        id: 'C1',
        texto:
          'Descreva o caminho completo, passo a passo: paciente chega no prédio → … → vai embora',
        ajuda: 'Inclua quem faz o quê em cada etapa.',
        critica: true,
        longo: true,
      },
      {
        id: 'C2',
        texto: 'Como se decide qual paciente vai para qual recepção?',
        ajuda:
          'É por sala, por horário, por tipo de quadro, ou por quem chega primeiro?',
        jaRespondida:
          'Duas recepções justamente para pacientes respiratórios não se cruzarem.',
      },
      {
        id: 'C3',
        texto: 'Tem porta de entrada e saída separadas, ou é a mesma?',
      },
      {
        id: 'C4',
        texto:
          'Qual o intervalo real entre pacientes na mesma sala? E entre salas?',
        jaRespondida:
          'Vocês espaçam a agenda para não haver encontro na recepção.',
      },
      {
        id: 'C5',
        texto: 'Quantos acompanhantes por criança? Irmão pode entrar?',
      },
      {
        id: 'C6',
        texto: 'Exigem máscara de quem, e em que situação?',
        ajuda: 'Acompanhante, profissional, criança acima de certa idade.',
      },
      {
        id: 'C7',
        texto:
          'Criança chega com febre ou sintoma agudo — o que vocês fazem hoje, na prática?',
        ajuda: 'Atendem, remarcam, atendem no fim do dia?',
        critica: true,
      },
      {
        id: 'C8',
        texto:
          'Como vocês ficam sabendo, antes da sessão, que a criança tem quadro transmissível ativo?',
        ajuda:
          'VSR, bronquiolite, covid, coqueluche, gripe. Existe pergunta no agendamento ou triagem por WhatsApp?',
        critica: true,
      },
      {
        id: 'C9',
        texto:
          'Existe sala preferencial ou horário reservado para esses casos?',
      },
      {
        id: 'C10',
        texto: 'Depois de atender um caso desses, a limpeza é diferente? Como?',
        critica: true,
      },
      {
        id: 'C11',
        texto:
          'Atendem paciente traqueostomizado, com oxigenoterapia, ou imunossuprimido? Com que frequência?',
      },
      {
        id: 'C12',
        texto:
          'A criança fica no colo, no tapete ou no trocador durante a sessão?',
        ajuda: 'Varia com a idade?',
      },
    ],
  },

  // ============================================================
  {
    id: 'D',
    titulo: 'Higiene das mãos',
    perguntas: [
      {
        id: 'D1',
        texto:
          'Em quais pontos existe pia com sabonete? E álcool gel, em qual ponto exato?',
      },
      {
        id: 'D2',
        texto:
          'O sabonete é comum ou antisséptico (clorexidina, PVPI)? Qual marca?',
        aceitaFoto: true,
      },
      { id: 'D3', texto: 'O papel toalha é branco não reciclado? Marca?' },
      {
        id: 'D4',
        texto: 'Em que momentos a equipe higieniza as mãos hoje?',
        ajuda:
          'Antes de tocar o paciente, depois, entre pacientes, ao entrar na sala…',
        longo: true,
      },
      {
        id: 'D5',
        texto:
          'Existe regra sobre unha, esmalte, anel, pulseira, relógio, cabelo preso? É verbal ou escrita?',
      },
      {
        id: 'D6',
        texto: 'Tem cartaz de técnica de higienização das mãos afixado?',
      },
    ],
  },

  // ============================================================
  {
    id: 'E',
    titulo: 'EPI',
    perguntas: [
      {
        id: 'E1',
        texto: 'Quais EPIs a equipe usa hoje, e em qual situação cada um?',
        ajuda:
          'Luva de procedimento, máscara cirúrgica, PFF2/N95, avental, óculos, face shield, touca.',
        critica: true,
        longo: true,
      },
      {
        id: 'E2',
        texto: 'Vocês geram aerossol? Usam PFF2/N95 nesses procedimentos?',
        ajuda: 'Inalação, aspiração nasal, tosse provocada, Proetz.',
        critica: true,
      },
      {
        id: 'E3',
        texto: 'O avental é descartável ou de tecido?',
        ajuda: 'Se de tecido: quem lava, onde, com que frequência?',
      },
      {
        id: 'E4',
        texto:
          'O jaleco vai para casa? Existe regra? Tem lugar para trocar na clínica?',
      },
      { id: 'E5', texto: 'Existe regra de calçado (fechado, impermeável)?' },
      { id: 'E6', texto: 'Onde o EPI usado é descartado? Em qual lixeira?' },
      {
        id: 'E7',
        texto: 'Quem compra e controla o estoque de EPI? Já faltou?',
      },
    ],
  },

  // ============================================================
  {
    id: 'F',
    titulo: 'Produtos de limpeza e desinfecção',
    descricao:
      'Bloco mais crítico do levantamento. Se você mandar as fotos dos rótulos (FOTO-1), dá pra pular quase tudo aqui.',
    perguntas: [
      {
        id: 'F1',
        texto: 'Liste todos os produtos que existem hoje na clínica',
        ajuda:
          'Incluindo os que a equipe de limpeza traz. Para cada um: nome comercial, fabricante, e o que limpa.',
        critica: true,
        longo: true,
        aceitaFoto: true,
      },
      {
        id: 'F2',
        texto:
          'Cada produto tem registro ou notificação ANVISA no rótulo? (número)',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'F3',
        texto:
          'Algum produto precisa de diluição? Qual proporção? Quem prepara?',
        critica: true,
      },
      {
        id: 'F4',
        texto:
          'Onde a diluição é preparada? Usa medidor/dosador ou é "no olho"?',
      },
      {
        id: 'F5',
        texto:
          'Usam borrifador? O frasco é reaproveitado de outro produto? Está rotulado?',
        ajuda: 'Com nome, diluição e data.',
        aceitaFoto: true,
      },
      {
        id: 'F6',
        texto:
          'Por quanto tempo a solução diluída é usada antes de ser trocada?',
      },
      {
        id: 'F7',
        texto: 'Tem FISPQ (ficha de segurança) dos produtos? Onde fica?',
      },
      {
        id: 'F8',
        texto: 'Onde os produtos são armazenados?',
        ajuda: 'Armário fechado, longe de material de paciente e de alimento?',
      },
      {
        id: 'F9',
        texto: 'O álcool 70% é líquido, gel ou spray? Qual marca?',
        jaRespondida: 'Álcool 70% é o produto principal, usado em quase tudo.',
      },
      {
        id: 'F10',
        texto:
          'Usam detergente ou sabão ANTES do álcool, ou o álcool é aplicado direto na superfície?',
        ajuda:
          'Importante: álcool não remove matéria orgânica — em superfície com secreção ele fixa em vez de limpar.',
        critica: true,
      },
      { id: 'F11', texto: 'Tem detergente enzimático? Usam para quê?' },
      {
        id: 'F12',
        texto: 'Tem hipoclorito de sódio? Em qual concentração e para quê?',
      },
    ],
  },

  // ============================================================
  {
    id: 'G',
    titulo: 'Materiais e equipamentos reutilizáveis',
    perguntas: [
      {
        id: 'G1',
        texto: 'Liste tudo que é reutilizado entre pacientes',
        ajuda:
          'Confira: Proetz (olivas, sondas, seringa), máscara de inalação, ambu, acapella, shaker, espaçador, aspirador nasal, sonda de aspiração, estetoscópio, oxímetro, termômetro, bolas, rolos, faixas, halteres, colete.',
        critica: true,
        longo: true,
        aceitaFoto: true,
      },
      {
        id: 'G2',
        texto:
          'Para cada item: é individual do paciente (guardado com nome) ou compartilhado?',
        critica: true,
        longo: true,
      },
      {
        id: 'G3',
        texto:
          'Para cada item: como é higienizado hoje, com o quê, e por quem?',
        critica: true,
        longo: true,
      },
      {
        id: 'G4',
        texto: 'Detalhar o processamento atual do Proetz',
        ajuda:
          'Qual solução, qual diluição, quanto tempo de molho? Quanto tempo no micro-ondas, em que potência? Fica dentro de algum recipiente ou saco?',
        critica: true,
        longo: true,
        jaRespondida:
          'Higienizado em solução no depósito e "esterilizado" no micro-ondas.',
      },
      {
        id: 'G5',
        texto:
          'Qual caminho vocês querem seguir para o processamento do Proetz?',
        ajuda:
          'O Proetz toca mucosa nasal, o que o classifica como material semicrítico e exige método validado. Micro-ondas não tem controle de tempo/temperatura nem indicador, então não sustenta POP. Opções: (a) autoclave de bancada, (b) desinfetante de alto nível com controle documentado, (c) migrar para material de uso único.',
        critica: true,
        rt: true,
        longo: true,
      },
      {
        id: 'G6',
        texto:
          'Se for autoclave: tem espaço e ponto elétrico no depósito? Tem orçamento?',
      },
      {
        id: 'G7',
        texto: 'Tem estufa?',
        ajuda: 'Se tiver, importante saber — estufa tem restrição de uso.',
      },
      {
        id: 'G8',
        texto: 'Qual material a família compra e leva para casa?',
        ajuda: 'Espaçador, máscara, aspirador.',
      },
      {
        id: 'G9',
        texto:
          'O inalador/nebulizador é da clínica? O copinho e a máscara são individuais?',
        critica: true,
      },
      {
        id: 'G10',
        texto:
          'Tem aspirador elétrico? O frasco coletor é higienizado como e quando?',
      },
      {
        id: 'G11',
        texto:
          'Estetoscópio e oxímetro são higienizados entre pacientes? Com o quê?',
      },
      {
        id: 'G12',
        texto:
          'Tem equipamento com manutenção/calibração periódica? Existe registro?',
        ajuda: 'Balança, oxímetro.',
      },
      {
        id: 'G13',
        texto:
          'Onde os materiais limpos são guardados? Armário fechado? Ficam embalados?',
        critica: true,
        aceitaFoto: true,
      },
    ],
  },

  // ============================================================
  {
    id: 'H',
    titulo: 'Brinquedos',
    perguntas: [
      {
        id: 'H1',
        texto: 'Liste os brinquedos por material',
        ajuda:
          'Plástico rígido, mordedor (borracha? silicone?), tecido, pelúcia, madeira, EVA, livro de pano ou papel.',
        jaRespondida: 'Plástico rígido + mordedores (material a confirmar).',
        aceitaFoto: true,
      },
      {
        id: 'H2',
        texto: 'Os brinquedos da recepção também são higienizados a cada uso?',
        ajuda: 'Como se controla qual foi tocado?',
        critica: true,
      },
      {
        id: 'H3',
        texto: 'Quais brinquedos vão à boca da criança?',
        critica: true,
      },
      {
        id: 'H4',
        texto: 'Com qual produto exatamente os brinquedos são higienizados?',
        ajuda:
          'E os que vão à boca — são lavados com água e enxaguados, ou só passam álcool? (álcool deixa resíduo em mordedor)',
        critica: true,
        jaRespondida: 'Higienizados após a sessão.',
      },
      {
        id: 'H5',
        texto:
          'Existe rodízio? Brinquedo tocado sai de circulação ou é higienizado na hora?',
      },
      {
        id: 'H6',
        texto: 'Tem brinquedo de pelúcia ou tecido em uso? Como é lavado?',
      },
      { id: 'H7', texto: 'Tem livro de papel ou revista na recepção?' },
      { id: 'H8', texto: 'Quem decide descartar um brinquedo? Tem critério?' },
    ],
  },

  // ============================================================
  {
    id: 'I',
    titulo: 'Rouparia, tecidos e superfícies',
    perguntas: [
      {
        id: 'I1',
        texto:
          'O lençol do trocador é papel descartável, tecido, ou só a capa impermeável?',
      },
      {
        id: 'I2',
        texto:
          'A capa impermeável é higienizada entre pacientes com o quê? É removível?',
        jaRespondida: 'A capa rosa aparece nas fotos que você mandou.',
      },
      {
        id: 'I3',
        texto: 'Tapete de atendimento: qual o material? É impermeável?',
        ajuda:
          'EVA, vinil, tecido, borracha? Como é higienizado e com que frequência? Já teve criança fazendo xixi ou vomitando nele?',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'I4',
        texto:
          'Usam fralda de pano, toalha ou lençol de tecido? Quem lava e onde?',
      },
      {
        id: 'I5',
        texto:
          'Tem almofada, rolo ou cunha de posicionamento? A capa é removível e lavável?',
      },
      {
        id: 'I6',
        texto:
          'Poltronas e banco de courino: higienizados com que frequência e com o quê?',
      },
      {
        id: 'I7',
        texto: 'Tem tapete de entrada ou capacho? De qual material?',
      },
      {
        id: 'I8',
        texto:
          'Quem rega as plantas naturais e com que frequência? A água fica no pratinho?',
        ajuda:
          'Aparecem plantas na sala e na recepção. Em serviço respiratório são reservatório de fungo e água parada.',
      },
    ],
  },

  // ============================================================
  {
    id: 'J',
    titulo: 'Limpeza — quem faz, quando, como',
    perguntas: [
      {
        id: 'J1',
        texto: 'Quais dias e em qual horário a equipe de limpeza vem?',
        ajuda: 'É antes de abrir, durante, ou depois de fechar?',
        jaRespondida:
          'Equipe de limpeza higieniza a clínica inteira 3× por semana.',
      },
      {
        id: 'J2',
        texto:
          'A empresa de limpeza é terceirizada? Nome, e existe contrato assinado?',
      },
      {
        id: 'J3',
        texto: 'O que exatamente a equipe de limpeza faz? Quanto tempo dura?',
        ajuda:
          'Piso, banheiro, vidro, mobiliário, lixeira, sala de atendimento?',
        longo: true,
      },
      {
        id: 'J4',
        texto:
          'Eles trazem os próprios produtos e panos, ou usam os da clínica?',
      },
      {
        id: 'J5',
        texto:
          'Eles recebem orientação escrita hoje? Alguém confere o que foi feito?',
      },
      {
        id: 'J6',
        texto:
          'Usam pano/mop separado por área (sala × banheiro × recepção)? Como diferenciam?',
        critica: true,
      },
      {
        id: 'J7',
        texto:
          'Os panos são reutilizados ou descartáveis? Se reutilizados, quem lava?',
      },
      {
        id: 'J8',
        texto: 'Qual o modelo do robô aspirador? Tem filtro HEPA?',
        ajuda:
          'Quem esvazia o reservatório, com que frequência, e onde? Sem HEPA o aspirador ressuspende partícula em vez de remover.',
        jaRespondida: 'Robô aspirador passa na clínica toda a cada 3 horas.',
      },
      {
        id: 'J9',
        texto:
          'Descreva a sequência exata da biossegurança pós-sessão, na ordem que é feita hoje',
        ajuda:
          'O que higienizam primeiro, com qual produto, com qual pano, quanto tempo leva no total? Dica: peça pra estagiária narrar enquanto executa, ou grave um vídeo — responde melhor que texto.',
        critica: true,
        longo: true,
        jaRespondida:
          'A cada sessão as estagiárias higienizam tapete, trocador, materiais e brinquedos.',
      },
      {
        id: 'J10',
        texto:
          'Existe limpeza no fim do expediente (terminal)? Quem faz e o que inclui?',
        critica: true,
      },
      {
        id: 'J11',
        texto:
          'Frequência de limpeza de: janela, persiana, luminária, filtro do ar-condicionado, atrás/embaixo de móveis, armários por dentro',
        longo: true,
      },
      {
        id: 'J12',
        texto:
          "O prédio faz limpeza de caixa d'água? Periodicidade? Tem laudo?",
      },
      {
        id: 'J13',
        texto: 'O prédio faz controle de pragas? Periodicidade e certificado?',
      },
      {
        id: 'J14',
        texto:
          'Já houve sujidade grave (vômito, sangue, fezes) durante o atendimento? Como foi resolvido?',
      },
    ],
  },

  // ============================================================
  {
    id: 'K',
    titulo: 'Resíduos',
    perguntas: [
      {
        id: 'K1',
        texto: 'Vocês geram resíduo infectante?',
        ajuda: 'Papel com secreção, luva usada, sonda de aspiração, máscara.',
        critica: true,
        jaRespondida: 'Sem perfurocortante; o prédio faz a separação.',
      },
      {
        id: 'K2',
        texto: 'Como esse resíduo é descartado hoje? Vai para qual lixeira?',
        critica: true,
      },
      {
        id: 'K3',
        texto: 'Usam saco branco leitoso identificado? Onde compram?',
      },
      {
        id: 'K4',
        texto:
          'Onde fica o abrigo de resíduo do prédio? Quem leva e com que frequência?',
      },
      {
        id: 'K5',
        texto:
          'Consegue cópia do contrato da empresa coletora do prédio, ou declaração do condomínio?',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'K6',
        texto:
          'Existe MTR (Manifesto de Transporte de Resíduos) ou comprovante de destinação?',
      },
      {
        id: 'K7',
        texto: 'Como descartam produto de limpeza vencido ou frasco vazio?',
      },
      {
        id: 'K8',
        texto:
          'Alguém da equipe já recebeu treinamento sobre segregação de resíduo?',
      },
    ],
  },

  // ============================================================
  {
    id: 'L',
    titulo: 'Atendimento domiciliar',
    perguntas: [
      {
        id: 'L1',
        texto:
          'Quantos atendimentos domiciliares por semana, em média? Quem faz?',
        jaRespondida: 'Vocês atendem em casa (dados ainda não levantados).',
      },
      {
        id: 'L2',
        texto: 'O que vai na bolsa/maleta? Liste tudo.',
        longo: true,
      },
      {
        id: 'L3',
        texto:
          'A bolsa/maleta é de material impermeável e higienizável? Como é limpa?',
      },
      {
        id: 'L4',
        texto: 'Os materiais são higienizados antes de sair e ao voltar? Como?',
        critica: true,
      },
      {
        id: 'L5',
        texto:
          'Levam álcool gel, EPI, papel toalha? Como higienizam as mãos na casa?',
      },
      {
        id: 'L6',
        texto: 'Usam jaleco no domicílio? Trocam entre uma casa e outra?',
      },
      {
        id: 'L7',
        texto: 'O resíduo gerado na casa fica lá ou volta com o profissional?',
      },
      {
        id: 'L8',
        texto:
          'Levam material reutilizável (Proetz, ambu) para o domicílio? Como processam na volta?',
        critica: true,
      },
      {
        id: 'L9',
        texto: 'Como é o deslocamento? Os materiais viajam no porta-malas?',
      },
    ],
  },

  // ============================================================
  {
    id: 'M',
    titulo: 'Treinamento e saúde da equipe',
    perguntas: [
      {
        id: 'M1',
        texto: 'Como uma estagiária nova é treinada hoje?',
        ajuda: 'Quanto tempo dura, quem conduz, e o que é ensinado?',
        critica: true,
        longo: true,
      },
      {
        id: 'M2',
        texto:
          'Existe registro desse treinamento hoje? (assinatura, lista de presença)',
      },
      {
        id: 'M3',
        texto: 'Vocês exigem carteira de vacinação da equipe? Quais vacinas?',
        ajuda: 'Hepatite B, influenza, tríplice viral, dTpa.',
      },
      {
        id: 'M4',
        texto:
          'Existe PCMSO / PGR e ASO para a equipe CLT? E para as estagiárias?',
      },
      {
        id: 'M5',
        texto:
          'O que se faz hoje se alguém se expõe a secreção (respingo no olho)? Existe fluxo definido?',
        critica: true,
      },
      {
        id: 'M6',
        texto:
          'A equipe tem reunião periódica onde esses assuntos são tratados?',
      },
    ],
  },

  // ============================================================
  {
    id: 'N',
    titulo: 'Emergência e segurança',
    perguntas: [
      {
        id: 'N1',
        texto: 'Tem oxigênio disponível na clínica? Cilindro ou concentrador?',
        critica: true,
      },
      { id: 'N2', texto: 'Tem aspirador disponível para emergência?' },
      {
        id: 'N3',
        texto:
          'Tem maleta ou carrinho de emergência? O que tem dentro? Quem confere validade?',
        critica: true,
        aceitaFoto: true,
      },
      {
        id: 'N4',
        texto:
          'A equipe tem treinamento de suporte básico de vida / reanimação pediátrica?',
        ajuda: 'Está vigente?',
      },
      {
        id: 'N5',
        texto:
          'Existe conduta definida se uma criança dessatura, engasga ou tem parada durante a sessão?',
        ajuda: 'Está escrita?',
        critica: true,
      },
      {
        id: 'N6',
        texto:
          'Qual o hospital de referência mais próximo? Tempo de deslocamento?',
      },
      { id: 'N7', texto: 'O prédio tem desfibrilador (DEA)? Onde?' },
      {
        id: 'N8',
        texto:
          'Extintores, sinalização de saída e AVCB do prédio estão em dia?',
      },
      {
        id: 'N9',
        texto:
          'Tem criança em atendimento com condição que exija plano específico (epilepsia, alergia grave, traqueostomia)?',
      },
    ],
  },

  // ============================================================
  {
    id: 'O',
    titulo: 'Documentação existente e histórico',
    perguntas: [
      {
        id: 'O1',
        texto:
          'Já existe algum POP, manual, checklist ou instrução escrita hoje?',
        ajuda: 'Mesmo informal, mesmo num grupo de WhatsApp.',
        aceitaFoto: true,
      },
      {
        id: 'O2',
        texto:
          'Já tiveram inspeção da vigilância sanitária? Quando, e o que foi apontado?',
        critica: true,
      },
      {
        id: 'O3',
        texto: 'Tem planta baixa aprovada pela vigilância?',
        aceitaFoto: true,
      },
      {
        id: 'O4',
        texto:
          'Tem contrato com a empresa de limpeza? E com o condomínio, sobre resíduos?',
      },
      {
        id: 'O5',
        texto:
          'Alguma instituição de ensino já pediu documentação de biossegurança?',
      },
      {
        id: 'O6',
        texto: 'Existe prazo ou motivo específico para fazer isso agora?',
        ajuda: 'Renovação de alvará, convênio novo, fiscalização marcada.',
      },
    ],
  },

  // ============================================================
  {
    id: 'P',
    titulo: 'Preferências sobre o documento final',
    perguntas: [
      {
        id: 'P1',
        texto:
          'O manual será impresso e ficará físico na clínica, ou só digital no tablet?',
        ajuda: 'A vigilância costuma querer ver na hora.',
      },
      {
        id: 'P2',
        texto:
          'Quer que os POPs tenham logo e identidade visual da Respira Kids?',
      },
      {
        id: 'P3',
        texto:
          'Prefere POPs curtos de 1 página, ou detalhados com foto ilustrativa?',
      },
      {
        id: 'P4',
        texto: 'Quer versão simplificada em cartaz para afixar na parede?',
        ajuda: 'Ex.: sequência de limpeza da sala.',
      },
      {
        id: 'P5',
        texto:
          'As estagiárias vão preencher o checklist no tablet da clínica ou no celular?',
      },
    ],
  },

  // ============================================================
  {
    id: 'Q',
    titulo: 'Decisões da responsável técnica',
    descricao:
      'Bloco para a Bruna. Dá pra mandar só este link/aba pra ela sem que precise ler os outros.',
    perguntas: [
      {
        id: 'Q1',
        texto: 'Caminho do processamento do Proetz',
        ajuda:
          'Mesma decisão da G5 — autoclave, desinfecção de alto nível ou uso único.',
        critica: true,
        rt: true,
      },
      {
        id: 'Q2',
        texto: 'Como resolver a separação sujo/limpo no depósito?',
        ajuda: 'Demarcação de bancada, armário dedicado, ou mudança de layout?',
        critica: true,
        rt: true,
      },
      {
        id: 'Q3',
        texto: 'Manter as plantas naturais nas salas de atendimento?',
        ajuda:
          'São reservatório de fungo e água parada em serviço respiratório.',
        rt: true,
      },
      {
        id: 'Q4',
        texto:
          'Adotar limpeza com detergente ANTES do álcool nas superfícies com secreção?',
        ajuda:
          'Isso aumenta o tempo entre sessões. Quanto tempo vocês toleram?',
        critica: true,
        rt: true,
      },
      {
        id: 'Q5',
        texto:
          'Descrever a regra das duas recepções e do espaçamento de agenda como medida formal de controle de infecção?',
        ajuda:
          'Recomendo fortemente — é o ponto mais forte de vocês numa inspeção.',
        rt: true,
      },
      {
        id: 'Q6',
        texto: 'Frequência de revisão dos documentos: anual ou bienal?',
        rt: true,
      },
    ],
  },
];

// ============================================================
// Helpers
// ============================================================

export const TODAS_PERGUNTAS: LevantamentoPergunta[] =
  LEVANTAMENTO_BLOCOS.flatMap((b) => b.perguntas);

export const TOTAL_PERGUNTAS = TODAS_PERGUNTAS.length;

export const TOTAL_CRITICAS = TODAS_PERGUNTAS.filter((p) => p.critica).length;

export function getBloco(id: BlocoId): LevantamentoBloco | undefined {
  return LEVANTAMENTO_BLOCOS.find((b) => b.id === id);
}

/** Pendências estruturais já mapeadas — aparecem como aviso fixo na tela. */
export const PENDENCIAS_MAPEADAS: string[] = [
  'PGRSS — plano próprio da clínica, mesmo com coleta do prédio',
  'PMOC — plano de manutenção do ar-condicionado',
  'Definição do processamento do Proetz (hoje em micro-ondas)',
  'Separação de fluxo sujo/limpo no depósito',
  'CREFITO da responsável técnica',
  'Registro ANVISA e diluição dos saneantes',
];
