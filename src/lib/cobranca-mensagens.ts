// AI dev note: Textos das cobranças enviadas MANUALMENTE pela secretária no
// WhatsApp (tela /cobrancas). Ficam todos aqui de propósito: quando a Lolô pedir
// para mudar o tom, é um arquivo só para editar.
//
// Diferenças em relação ao texto que o n8n dispara automaticamente:
// - sem "Essa é uma mensagem automática": aqui quem manda é uma pessoa, e a
//   linha derruba a taxa de resposta;
// - o texto muda conforme a situação (a vencer / atrasada / muito atrasada);
// - na muito atrasada oferecemos uma saída (outra forma de pagamento) em vez de
//   só repetir a cobrança — converte melhor do que pressionar.
//
// O WhatsApp usa *asterisco* para negrito. As quebras de linha (\n) vão
// codificadas na URL e chegam preservadas na caixa de mensagem.

export type SituacaoCobranca = 'pendente' | 'atrasada' | 'muito_atrasada';

export interface DadosMensagemCobranca {
  responsavelNome: string | null;
  pacienteNome: string | null;
  descricao: string | null;
  valor: number | null;
  vencimento: string | null; // 'YYYY-MM-DD'
  diasAtraso: number | null;
  link: string | null;
}

const primeiroNome = (nome: string | null): string => {
  const limpo = (nome || '').trim();
  if (!limpo) return 'tudo bem';
  return limpo.split(/\s+/)[0];
};

const formatarValor = (valor: number | null): string => {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
};

// AI dev note: vencimento vem como date puro do Postgres. Fatiar a string evita
// o clássico "menos um dia" de new Date('2026-08-04') interpretado como UTC.
const formatarData = (data: string | null): string => {
  if (!data) return '—';
  const [datePart] = data.split('T');
  const [ano, mes, dia] = datePart.split('-');
  if (!ano || !mes || !dia) return data;
  return `${dia}/${mes}/${ano}`;
};

// Descrição pode ter quebras de linha (vem concatenada das consultas do período).
// Em uma linha só ela não quebra o layout da mensagem.
const limparDescricao = (descricao: string | null): string =>
  (descricao || 'Atendimento').replace(/\s*\n\s*/g, ' ').trim();

export const buildMensagemCobranca = (
  situacao: SituacaoCobranca,
  dados: DadosMensagemCobranca
): string => {
  const nome = primeiroNome(dados.responsavelNome);
  const paciente = (dados.pacienteNome || '').trim();
  const doPaciente = paciente ? ` de ${paciente}` : '';
  const descricao = limparDescricao(dados.descricao);
  const valor = formatarValor(dados.valor);
  const vencimento = formatarData(dados.vencimento);
  const link = dados.link || '';
  const dias = dados.diasAtraso ?? 0;

  if (situacao === 'pendente') {
    return [
      `Olá, ${nome}!`,
      '',
      `Tudo bem? Segue o link da fatura referente ao atendimento${doPaciente}.`,
      '',
      `*Descrição:* ${descricao}`,
      `*Valor:* R$ ${valor}`,
      `*Vencimento:* ${vencimento}`,
      '',
      `➡️ Pagamento pelo link: ${link}`,
      '',
      '⚠️ *Atenção:* faça o pagamento apenas pelo link acima.',
      '',
      'Qualquer dúvida, é só chamar por aqui.',
      '',
      'Equipe Respira Kids',
    ].join('\n');
  }

  if (situacao === 'atrasada') {
    return [
      `Olá, ${nome}!`,
      '',
      `Passando para lembrar da fatura do atendimento${doPaciente}, que venceu em ${vencimento}.`,
      '',
      `*Descrição:* ${descricao}`,
      `*Valor:* R$ ${valor}`,
      '',
      `➡️ O link continua válido: ${link}`,
      '',
      'Se já pagou, pode desconsiderar — e me avisa aqui para eu dar baixa.',
      '',
      'Equipe Respira Kids',
    ].join('\n');
  }

  return [
    `Olá, ${nome}!`,
    '',
    `A fatura do atendimento${doPaciente} está com ${dias} dias de atraso.`,
    '',
    `*Descrição:* ${descricao}`,
    `*Valor:* R$ ${valor}`,
    `*Venceu em:* ${vencimento}`,
    '',
    `➡️ Link para pagamento: ${link}`,
    '',
    'Se precisar de outra forma de pagamento ou quiser dividir, me avisa que a gente vê a melhor alternativa.',
    '',
    'Equipe Respira Kids',
  ].join('\n');
};

export const LABEL_SITUACAO: Record<SituacaoCobranca, string> = {
  pendente: 'A vencer',
  atrasada: 'Atrasada',
  muito_atrasada: 'Muito atrasada',
};
