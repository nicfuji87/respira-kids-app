import { format } from 'date-fns';

// AI dev note: Texto do LEMBRETE DE CONSULTA enviado MANUALMENTE pela secretária
// no WhatsApp (botão na visão Agenda). Fica tudo aqui, num arquivo só, para
// mudar o tom sem caçar string pelo código — mesma decisão de
// `cobranca-mensagens.ts`.
//
// Base: a mensagem que o n8n dispara hoje automaticamente. Duas diferenças:
// - SEM os botões "Confirmar"/"Cancelar" (aqui é só lembrar, não confirmar);
// - cabeçalho vira "Lembrete de Consulta" em vez de "Nova Consulta" — o
//   agendamento não é novo, o cliente já sabe que existe.
//
// As instruções e a cláusula de cancelamento são texto CONTRATUAL: copiados na
// íntegra do fluxo atual. Não reescrever sem o dono pedir.

export interface DadosLembreteConsulta {
  dataHora: Date;
  pacienteNome: string | null;
  profissionalNome: string | null;
  servico: string | null;
  tipoLocal: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
}

// AI dev note: `locais_atendimento` das salas da clínica está cadastrado sem
// numero_endereco/complemento_endereco, então o complemento da clínica é
// constante aqui — é o mesmo que o n8n manda hoje. Preenchendo esses campos no
// cadastro do local, dá para apagar esta constante e usar só o banco.
const COMPLEMENTO_CLINICA = 'Bloco A - Sala 311';

const INSTRUCOES = [
  '🔹Traga as medicações em uso;',
  '🔹Em caso de febre, administrar a medicação orientada pelo médico 1 hora antes da consulta;',
  '🔹Evite o desperdício e traga sua seringa fornecida no primeiro atendimento;',
  '🔹Chegue no horário agendado para evitar encontros no consultório;',
  '🔹Amamentar/alimentar o bebê/criança 30 minutos antes da consulta.',
].join('\n');

const CLAUSULA_CANCELAMENTO =
  '❌ _Como previsto em nosso contrato na Cláusula 4a.. Cancelamentos com menos de 6 horas de antecedência estarão sujeitos a cobrança de 50% do valor da consulta. Em caso de não comparecimento sem qualquer comunicação prévia (*no-show*), será devido o pagamento integral do valor da sessão agendada, em razão da reserva exclusiva do horário e da impossibilidade de utilização da agenda para outro paciente. Isso nos garante a qualidade do serviço e a disponibilidade da agenda para outros pacientes._';

const primeiroNome = (nome: string | null): string => {
  const limpo = (nome || '').trim();
  if (!limpo) return 'tudo bem';
  return limpo.split(/\s+/)[0];
};

// Descrição do serviço vem com quebras de linha em alguns cadastros.
const umaLinha = (texto: string | null): string =>
  (texto || '').replace(/\s*\n\s*/g, ' ').trim();

const montarEndereco = (dados: DadosLembreteConsulta): string => {
  const partes: string[] = [];
  const logradouro = umaLinha(dados.enderecoLogradouro);
  const bairro = umaLinha(dados.enderecoBairro);
  const cidade = umaLinha(dados.enderecoCidade);

  if (logradouro) partes.push(logradouro);
  if (bairro) partes.push(bairro);

  let linha = partes.join(', ');
  if (cidade) linha = linha ? `${linha} - ${cidade}` : cidade;

  const complemento =
    dados.tipoLocal === 'clinica'
      ? COMPLEMENTO_CLINICA
      : [umaLinha(dados.enderecoNumero), umaLinha(dados.enderecoComplemento)]
          .filter(Boolean)
          .join(' - ');

  if (!linha) return complemento ? `*${complemento}*` : '';
  return complemento ? `*${linha}* , *${complemento}*` : `*${linha}*`;
};

export const buildMensagemLembrete = (
  destinatarioNome: string | null,
  dados: DadosLembreteConsulta
): string => {
  const endereco = montarEndereco(dados);
  const servico = umaLinha(dados.servico);

  const linhas = [
    '🔸 *Lembrete de Consulta* 🔸',
    '',
    `Olá, ${primeiroNome(destinatarioNome)}! Passando para lembrar da consulta:`,
    '',
    `Data: *${format(dados.dataHora, 'dd/MM/yyyy')}*`,
    `Hora: *${format(dados.dataHora, 'HH:mm')}*`,
    `Paciente: *${umaLinha(dados.pacienteNome) || '—'}*`,
    `Profissional: *${umaLinha(dados.profissionalNome) || '—'}*`,
  ];

  if (endereco) {
    linhas.push(`Endereço da Consulta: ${endereco}`);
  }

  if (servico) {
    linhas.push('', `*${servico}*`);
  }

  linhas.push(
    '',
    '⚠️ Seguem algumas instruções para a consulta:',
    '',
    INSTRUCOES,
    '',
    CLAUSULA_CANCELAMENTO
  );

  return linhas.join('\n');
};
