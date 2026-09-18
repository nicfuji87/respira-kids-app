// AI dev note: Texto do CONTATO DE REATIVAÇÃO (secretária → família de paciente
// parado há 60+ dias). Fica tudo aqui para mudar o tom sem caçar string.
//
// Regras combinadas com a gestão (set/2026):
// - É contato de cuidado, não de venda: pergunta como a criança está e deixa a
//   porta aberta. Nunca "está há X dias sem atendimento, vamos agendar?".
// - Paciente que só fez MOTORA recebeu alta: não empurrar motora de novo.
//   Pergunta do desenvolvimento + lembra que a clínica também atende
//   respiratória (metade dos bebês da motora faz respiratória depois).
// - Sem diminutivo e sem tiques de texto gerado (ver memória ju-estilo).
// - 356 pacientes não têm sexo no cadastro: frases sem "o/a" e sem "ele/ela".

import type { PerfilReativacao } from '@/types/inatividade';

export interface DadosMensagemReativacao {
  perfil: PerfilReativacao;
  pacienteNome: string;
  responsavelNome: string | null;
  secretariaNome: string | null;
  idadeMeses: number | null;
  hoje?: Date;
}

const primeiroNome = (nome: string | null | undefined): string | null => {
  const limpo = (nome || '').trim();
  return limpo ? limpo.split(/\s+/)[0] : null;
};

// Brasília: seca de junho a setembro, chuva de outubro a abril.
const fraseEstacao = (mes: number): string => {
  if (mes >= 6 && mes <= 9) return 'Como tem passado nesse tempo seco?';
  if (mes >= 10 || mes <= 1)
    return 'Com as chuvas voltando, como anda a respiração?';
  return 'Como tem passado nessa mudança de tempo?';
};

const marcoDesenvolvimento = (idadeMeses: number | null): string => {
  if (idadeMeses == null) return 'Como está o desenvolvimento?';
  if (idadeMeses < 8) return 'Já está firmando bem o pescoço e rolando?';
  if (idadeMeses < 11)
    return 'Já está sentando sem apoio e arriscando engatinhar?';
  if (idadeMeses < 16) return 'Já está dando os primeiros passos?';
  return 'Imagino que já esteja andando pela casa toda!';
};

export function montarMensagemReativacao(d: DadosMensagemReativacao): string {
  const resp = primeiroNome(d.responsavelNome);
  const paciente = primeiroNome(d.pacienteNome) || d.pacienteNome;
  const eu = primeiroNome(d.secretariaNome);
  const mes = (d.hoje ?? new Date()).getMonth() + 1;

  const saudacao = resp ? `Oi, ${resp}! Tudo bem?` : 'Oi! Tudo bem?';
  const apresentacao = eu
    ? `Aqui é a ${eu}, da Respira Kids.`
    : 'Aqui é da Respira Kids.';

  switch (d.perfil) {
    case 'motora_alta':
      return [
        `${saudacao} ${apresentacao}`,
        `Lembrei de ${paciente} e quis saber das novidades. ${marcoDesenvolvimento(d.idadeMeses)}`,
        'E se precisarem de nós para a parte respiratória, numa gripe ou quando o nariz entupir, a gente também atende. É só chamar por aqui.',
      ].join('\n\n');

    case 'motora_e_respiratoria':
      return [
        `${saudacao} ${apresentacao}`,
        `Lembrei de ${paciente} e quis saber como estão as coisas, tanto do desenvolvimento quanto da respiração. ${fraseEstacao(mes)}`,
        'Qualquer coisa que precisarem, é só chamar por aqui.',
      ].join('\n\n');

    case 'respiratorio':
    default:
      return [
        `${saudacao} ${apresentacao}`,
        `Lembrei de ${paciente} e quis saber como está. ${fraseEstacao(mes)}`,
        'Se precisarem de alguma coisa, é só chamar por aqui.',
      ].join('\n\n');
  }
}
