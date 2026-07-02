// AI dev note: Roteiro da entrevista presencial de estagiários Respira Kids.
// Conteúdo estático (não vai para o candidato). O avaliador percorre os blocos,
// marca cada ponto como coberto, dá uma impressão rápida (👍/😐/⚠️) e anota.
// As respostas ficam em candidaturas_estagio.entrevista (jsonb).
//
// As perguntas dialogam com o que já foi avaliado no teste online:
// - situacional s1..s6 (priorização, estresse, limite de atuação, comunicação,
//   maturidade, ética);
// - textos escritos (motivação + mãe ansiosa);
// - estilo de trabalho (perfil).
// A ideia é APROFUNDAR o que o teste só arranhou, e confirmar o prático.

import type { EntrevistaBloco } from '@/types/processo-seletivo';

export const ROTEIRO_ENTREVISTA: EntrevistaBloco[] = [
  {
    id: 'abertura',
    titulo: 'Abertura & rapport',
    descricao: 'Deixe o candidato à vontade. Observe clareza e naturalidade.',
    itens: [
      {
        id: 'ab1',
        pergunta: 'Me conta um pouco sobre você e o seu momento na faculdade.',
        dica: 'Deixar relaxar. Observar comunicação, organização da fala e autoconfiança.',
      },
      {
        id: 'ab2',
        pergunta:
          'O que você já sabe sobre a Respira Kids e sobre fisioterapia respiratória pediátrica?',
        dica: 'Pesquisou antes? Demonstra interesse genuíno ou é uma vaga "qualquer"?',
      },
    ],
  },
  {
    id: 'motivacao',
    titulo: 'Motivação & trajetória',
    descricao: 'Confirme se o texto do formulário se sustenta ao vivo.',
    itens: [
      {
        id: 'mo1',
        pergunta:
          'No formulário você escreveu sobre por que escolheu a fisioterapia. Pode me contar mais sobre isso?',
        dica: 'Comparar com o texto enviado. Consistência e verdade, não decorado.',
      },
      {
        id: 'mo2',
        pergunta:
          'Por que pediatria — e por que a área respiratória especificamente?',
        dica: 'Afinidade real x acaso. Já teve contato com crianças/bebês?',
      },
      {
        id: 'mo3',
        pergunta: 'O que você espera aprender e viver neste estágio?',
        dica: 'Expectativas realistas. Quer aprender ou só cumprir carga horária?',
      },
    ],
  },
  {
    id: 'logistica',
    titulo: 'Disponibilidade & logística',
    descricao: 'Parte prática — precisa fechar de verdade para funcionar.',
    itens: [
      {
        id: 'lo1',
        pergunta:
          'Qual é a sua disponibilidade real de dias e horários? Confere com o que marcou no formulário?',
        dica: 'Confirmar. Atenção a conflito com grade de aula / outro estágio.',
      },
      {
        id: 'lo2',
        pergunta: 'Como é o seu deslocamento até a clínica? Quanto tempo leva?',
        dica: 'Viabilidade e pontualidade no longo prazo.',
      },
      {
        id: 'lo3',
        pergunta:
          'A partir de quando você poderia começar e por quanto tempo pretende ficar?',
        dica: 'Permanência. Estágio curto demais não compensa o treinamento.',
      },
      {
        id: 'lo4',
        pergunta:
          'Você tem outros compromissos hoje (trabalho, outro estágio, TCC, monografia)?',
        dica: 'Risco de sobrecarga e faltas.',
      },
    ],
  },
  {
    id: 'pediatria',
    titulo: 'Crianças & famílias (fit pediátrico)',
    descricao: 'O dia a dia é choro, colo e pais preocupados. Testar isso.',
    itens: [
      {
        id: 'pe1',
        pergunta:
          'Você já teve contato com bebês ou crianças em atendimento? Como foi?',
        dica: 'Experiência prática x só teoria. Como reage ao choro na vida real.',
      },
      {
        id: 'pe2',
        pergunta:
          'Uma criança chora sem parar durante o atendimento. Na prática, o que você faz?',
        dica: 'Acolhe e transmite calma sem paralisar. (Liga com estilo e com s2.)',
      },
      {
        id: 'pe3',
        pergunta:
          'Uma mãe ansiosa cobra resultado rápido do tratamento. Como você conduz essa conversa?',
        dica: 'Comparar com o texto "mãe ansiosa". Empatia + honestidade + limite do seu papel.',
      },
    ],
  },
  {
    id: 'situacional',
    titulo: 'Aprofundando o teste',
    descricao:
      'Explore ao vivo o raciocínio por trás das respostas — especialmente onde errou.',
    itens: [
      {
        id: 'si1',
        pergunta:
          'No teste apareceu um bebê em prono demonstrando desconforto enquanto a fisio precisou sair. Como você pensaria nessa situação na prática?',
        dica: 'PONTO CRÍTICO: segurança do paciente sempre acima de "não posso mexer". Sabe pedir ajuda e interromper por segurança? (s3)',
      },
      {
        id: 'si2',
        pergunta:
          'Se você discordasse de uma conduta da sua supervisora, o que você faria?',
        dica: 'Respeita a hierarquia mas comunica com maturidade. Nem submisso, nem atropela.',
      },
      {
        id: 'si3',
        pergunta:
          'Me conta uma vez em que você errou em algo importante. Como você lidou?',
        dica: 'Honestidade e maturidade x terceirizar a culpa. (Liga com s5.)',
      },
    ],
  },
  {
    id: 'autoconhecimento',
    titulo: 'Autoconhecimento & convivência',
    descricao: 'Maturidade emocional e como é conviver com essa pessoa.',
    itens: [
      {
        id: 'au1',
        pergunta: 'Como você costuma reagir em dias difíceis, sob pressão?',
        dica: 'Autoconsciência real. Sabe pedir ajuda? (Liga com s2/s5.)',
      },
      {
        id: 'au2',
        pergunta: 'Um ponto seu que você sabe que precisa desenvolver?',
        dica: 'Humildade e autocrítica. Fuga total ("sou perfeccionista") é sinal.',
      },
      {
        id: 'au3',
        pergunta:
          'Como você é para trabalhar em equipe? Prefere seguir o processo certinho ou improvisar?',
        dica: 'Confirmar/contrastar com o perfil de estilo do teste.',
      },
    ],
  },
  {
    id: 'encerramento',
    titulo: 'Encerramento',
    descricao: 'Fechar bem e alinhar expectativas.',
    itens: [
      {
        id: 'en1',
        pergunta: 'Você tem alguma dúvida sobre a vaga, a rotina ou a clínica?',
        dica: 'Perguntas boas = engajamento. Sem nenhuma pergunta pode indicar desinteresse.',
      },
      {
        id: 'en2',
        pergunta: 'Explicar os próximos passos e combinar o prazo de retorno.',
        dica: 'Checklist: deixar claro quando e como você dará a resposta.',
      },
    ],
  },
];

/** Total de itens do roteiro (para barra de progresso). */
export const ROTEIRO_TOTAL_ITENS = ROTEIRO_ENTREVISTA.reduce(
  (acc, b) => acc + b.itens.length,
  0
);
