// AI dev note: Conteúdo das reuniões com as estagiárias (aba "Reuniões" da seção
// Estagiários). Cada reunião é uma lista de slides. Slides "ao vivo" (bonus,
// cobertura, em-risco) buscam os números em fn_estagio_bonus_evolucoes na hora
// da apresentação; os demais são texto fixo e fáceis de editar aqui.
//
// Esta apresentação é projetada PARA as estagiárias: nada de observação
// individual ou crítica nominal (isso é conversa a sós).

export interface ItemTexto {
  titulo: string;
  texto?: string;
}

export interface PontoSemanal {
  rotulo: string;
  pct: number;
}

export type Slide =
  | {
      tipo: 'capa';
      titulo: string;
      subtitulo?: string;
      itens: string[];
    }
  | {
      tipo: 'lista';
      kicker?: string;
      titulo: string;
      itens: ItemTexto[];
      nota?: string;
    }
  | {
      tipo: 'evolucao-semanal';
      kicker?: string;
      titulo: string;
      subtitulo: string;
      dados: PontoSemanal[];
      nota?: string;
    }
  | {
      tipo: 'cobertura-ao-vivo';
      kicker?: string;
      titulo: string;
      nota?: string;
    }
  | { tipo: 'bonus-regra'; kicker?: string; titulo: string }
  | { tipo: 'bonus-ao-vivo'; kicker?: string; titulo: string }
  | { tipo: 'em-risco'; kicker?: string; titulo: string }
  | {
      tipo: 'combinados';
      kicker?: string;
      titulo: string;
      itens: string[];
    };

export interface Reuniao {
  id: string;
  data: string; // YYYY-MM-DD
  titulo: string;
  descricao: string;
  /** Mês (YYYY-MM) em que o bônus por evolução passa a valer. Antes disso, os slides ao vivo mostram simulação. */
  bonusInicio: string;
  slides: Slide[];
}

export const REUNIOES: Reuniao[] = [
  {
    id: '2026-10-23',
    data: '2026-10-23',
    titulo: 'Metas de evolução e combinados',
    descricao:
      'Nova meta com bônus, organização entre os turnos, ponto, postura com as famílias e qualidade do registro.',
    bonusInicio: '2026-11',
    slides: [
      {
        tipo: 'capa',
        titulo: 'Reunião das estagiárias',
        subtitulo: '23 de outubro de 2026',
        itens: [
          'O que já melhorou',
          'A nova meta e o bônus',
          'Como bater a meta juntas',
          'Ponto',
          'Conversa com as famílias',
          'Qualidade do registro',
          'Combinados',
        ],
      },
      {
        tipo: 'evolucao-semanal',
        kicker: 'O que já melhorou',
        titulo: 'A evolução respiratória virou rotina',
        subtitulo: 'Sessões respiratórias com evolução, por semana',
        dados: [
          { rotulo: '29/06', pct: 22 },
          { rotulo: '06/07', pct: 13 },
          { rotulo: '13/07', pct: 35 },
          { rotulo: '20/07', pct: 67 },
          { rotulo: '27/07', pct: 83 },
          { rotulo: '03/08', pct: 82 },
          { rotulo: '10/08', pct: 87 },
          { rotulo: '17/08', pct: 80 },
          { rotulo: '24/08', pct: 89 },
          { rotulo: '31/08', pct: 92 },
          { rotulo: '07/09', pct: 78 },
          { rotulo: '14/09', pct: 84 },
          { rotulo: '21/09', pct: 85 },
          { rotulo: '28/09', pct: 83 },
          { rotulo: '05/10', pct: 93 },
          { rotulo: '12/10', pct: 87 },
        ],
        nota: 'No começo de julho eram 13%. Desde o fim de julho, mais de 80% quase toda semana.',
      },
      {
        tipo: 'cobertura-ao-vivo',
        kicker: 'Onde estamos',
        titulo: 'A respiratória vai bem. A motora ainda não começou.',
        nota: 'Uma em cada três sessões da clínica é motora. Sem ela, nem a respiratória perfeita leva a clínica a 100%.',
      },
      {
        tipo: 'bonus-regra',
        kicker: 'A nova meta',
        titulo: '100% das evoluções no prazo',
      },
      {
        tipo: 'bonus-ao-vivo',
        kicker: 'Placar do mês',
        titulo: 'Quanto do bônus está de pé',
      },
      {
        tipo: 'em-risco',
        kicker: 'Ainda dá tempo',
        titulo: 'Sessões ainda dentro do prazo',
      },
      {
        tipo: 'lista',
        kicker: 'Como bater a meta juntas',
        titulo: 'A meta é da dupla',
        itens: [
          {
            titulo: 'Evolução antes de ir embora',
            texto: 'Nenhuma sessão do seu turno fica para o dia seguinte.',
          },
          {
            titulo: 'Manhã cobre a tarde, tarde cobre a manhã',
            texto:
              'Vytoria deixou alguma de manhã? Avisa a Larissa, que faz à tarde. Larissa deixou? A Vytoria resolve na manhã seguinte, ainda dentro das 24h.',
          },
          {
            titulo: 'Segunda fecha o fim de semana',
            texto:
              'Sessões de sábado e domingo vencem no fim da segunda. De manhã, a Vytoria confere com as profissionais o que ficou sem evolução. À tarde, a Larissa fecha o que faltar.',
          },
          {
            titulo: 'Profissional que prefere evoluir sozinha',
            texto:
              'Lembrem, acompanhem até estar registrado ou ajudem a preencher durante a sessão. A evolução dela também conta para o bônus de vocês.',
          },
          {
            titulo: 'Finalizar a sessão no app',
            texto:
              'Sessão que fica como "agendada" depois do atendimento some da lista de pendências.',
          },
          {
            titulo: 'Checklist de saída de verdade',
            texto:
              '"Evoluções feitas" foi marcado em 117 de 119 saídas, mesmo com evolução faltando. Só marque o que foi feito.',
          },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Ponto',
        titulo: 'O horário começa quando você está pronta',
        itens: [
          {
            titulo: 'Bater o ponto pronta para trabalhar',
            texto:
              'Trocada e já alimentada. Troca de roupa e almoço ficam antes da entrada.',
          },
          {
            titulo: 'Tolerância é para o trânsito',
            texto:
              'Os 5 a 10 minutos servem para imprevistos, não para a rotina de todo dia.',
          },
          {
            titulo: 'O ponto vai para a faculdade',
            texto:
              'A jornada do estágio tem limite legal (6h por dia, 30h por semana) e o relatório de frequência sai daqui. Ele precisa mostrar o tempo real.',
          },
          {
            titulo: 'Horário não fecha? Fale com a gente',
            texto:
              'Dá para ajustar o horário no contrato e manter a mesma carga.',
          },
          {
            titulo: 'Bater a saída todo dia',
            texto: 'Cada uma tem uns 10 dias com entrada e sem saída.',
          },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Conversa com as famílias',
        titulo: 'A sessão é da família',
        itens: [
          {
            titulo: 'Quem conduz a conversa é o responsável',
            texto:
              'Se ele puxa assunto, ótimo. Resposta curta, olho no celular ou atenção na criança: hora de encerrar o papo.',
          },
          {
            titulo: 'A vida pessoal fica de fora',
            texto: 'Ser simpática, sim. Contar da própria vida, não.',
          },
          {
            titulo: 'Use o tempo para orientar',
            texto:
              'Lavagem nasal, posição para dormir, sinais de alerta para procurar o médico. É o que a família leva para casa.',
          },
          {
            titulo: 'Sigilo',
            texto:
              'Nada sobre outros pacientes nem sobre assuntos internos da clínica.',
          },
          {
            titulo: 'Postura conta na avaliação do estágio',
            texto: 'Junto com a pontualidade.',
          },
        ],
      },
      {
        tipo: 'lista',
        kicker: 'Qualidade do registro',
        titulo: 'Evolução boa é evolução completa',
        itens: [
          {
            titulo: 'Saturação abaixo de 94',
            texto:
              'De agosto a outubro foram 23 sessões. Em 19 a classificação ficou "normal" e 22 não tiveram encaminhamento. Saturação baixa pede atenção e registro.',
          },
          {
            titulo: 'Não mediu? Marque "não aferida"',
            texto:
              'Vale para temperatura e frequência cardíaca. Campo em branco não diz nada.',
          },
          {
            titulo: 'Roncos de transmissão não são roncos',
            texto:
              'Significam coisas opostas na evolução da criança. Marque com cuidado.',
          },
          {
            titulo: 'Aspiração profunda sangra mais',
            texto:
              '15% das vezes, contra 2% da não invasiva. Vale fluidificar antes.',
          },
        ],
      },
      {
        tipo: 'combinados',
        kicker: 'Combinados',
        titulo: 'O que sai desta reunião',
        itens: [
          'Nenhuma sessão do turno sai sem evolução',
          'Pendência de um turno é avisada para o outro',
          'Ponto batido pronta para trabalhar, e saída todo dia',
          'Conversa com a família guiada pelo responsável',
          'Checklist de saída só com o que foi feito',
          'Segunda-feira fecha as sessões do fim de semana',
          'Próxima conversa para ver os números',
        ],
      },
    ],
  },
];
