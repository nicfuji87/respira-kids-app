// AI dev note: telefone com código do país (DDI). Convenção de armazenamento
// (pessoas.telefone, bigint): só dígitos, SEMPRE com o DDI.
//  - Brasil: 55 + DDD + número (12 ou 13 dígitos; linhas antigas podem estar sem
//    o 9 depois do DDD, e tudo bem).
//  - Exterior: E.164 completo sem o "+" (ex.: 972543316400), 8 a 15 dígitos.
// Regra: começa com 55 e tem 12–13 dígitos => Brasil; qualquer outra coisa com
// 8–15 dígitos => exterior, usado como veio. Nenhum outro DDI começa com 55.
//
// Valor do PhoneInput (string que circula nos formulários):
//  - Brasil: a máscara de sempre, "(61) 98144-6666" (sem DDI).
//  - Exterior: "+<DDI> <número>", ex.: "+972 543316400".
// O "+" no começo é o que diferencia os dois casos. Quem só faz
// `valor.replace(/\D/g, '')` recebe 11 dígitos locais no Brasil e o número
// completo com DDI no exterior. Para decidir, use lerTelefoneDigitado().

export interface PaisTelefone {
  id: string;
  nome: string;
  ddi: string;
  bandeira: string;
}

export const PAIS_BRASIL: PaisTelefone = {
  id: 'BR',
  nome: 'Brasil',
  ddi: '55',
  bandeira: '🇧🇷',
};

/** Países oferecidos no seletor (os mais comuns primeiro, depois "Outro"). */
export const PAISES_TELEFONE: PaisTelefone[] = [
  PAIS_BRASIL,
  { id: 'PT', nome: 'Portugal', ddi: '351', bandeira: '🇵🇹' },
  { id: 'US', nome: 'EUA/Canadá', ddi: '1', bandeira: '🇺🇸' },
  { id: 'IL', nome: 'Israel', ddi: '972', bandeira: '🇮🇱' },
  { id: 'AR', nome: 'Argentina', ddi: '54', bandeira: '🇦🇷' },
  { id: 'CL', nome: 'Chile', ddi: '56', bandeira: '🇨🇱' },
  { id: 'ES', nome: 'Espanha', ddi: '34', bandeira: '🇪🇸' },
  { id: 'FR', nome: 'França', ddi: '33', bandeira: '🇫🇷' },
  { id: 'GB', nome: 'Reino Unido', ddi: '44', bandeira: '🇬🇧' },
  { id: 'IT', nome: 'Itália', ddi: '39', bandeira: '🇮🇹' },
  { id: 'DE', nome: 'Alemanha', ddi: '49', bandeira: '🇩🇪' },
  { id: 'JP', nome: 'Japão', ddi: '81', bandeira: '🇯🇵' },
  { id: 'PY', nome: 'Paraguai', ddi: '595', bandeira: '🇵🇾' },
  { id: 'UY', nome: 'Uruguai', ddi: '598', bandeira: '🇺🇾' },
  { id: 'CO', nome: 'Colômbia', ddi: '57', bandeira: '🇨🇴' },
  { id: 'PE', nome: 'Peru', ddi: '51', bandeira: '🇵🇪' },
  { id: 'MX', nome: 'México', ddi: '52', bandeira: '🇲🇽' },
];

export const PAIS_OUTRO_ID = 'OUTRO';

/** Tamanho total aceito no padrão E.164 (DDI + número). */
export const TELEFONE_E164_MIN = 8;
export const TELEFONE_E164_MAX = 15;

// DDDs brasileiros existentes (Anatel).
const DDDS_BRASIL = new Set([
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '21',
  '22',
  '24',
  '27',
  '28',
  '31',
  '32',
  '33',
  '34',
  '35',
  '37',
  '38',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '53',
  '54',
  '55',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '71',
  '73',
  '74',
  '75',
  '77',
  '79',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '89',
  '91',
  '92',
  '93',
  '94',
  '95',
  '96',
  '97',
  '98',
  '99',
]);

// Estrutura de DDIs da UIT: 1 dígito (1 e 7), 2 dígitos (lista abaixo),
// o resto tem 3 dígitos.
const DDIS_DOIS_DIGITOS = new Set([
  '20',
  '27',
  '30',
  '31',
  '32',
  '33',
  '34',
  '36',
  '39',
  '40',
  '41',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '81',
  '82',
  '84',
  '86',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '98',
]);

export function apenasDigitos(
  valor: string | number | bigint | null | undefined
): string {
  if (valor === null || valor === undefined) return '';
  return valor.toString().replace(/\D/g, '');
}

/** 55 + DDD + número (12 ou 13 dígitos): telefone brasileiro já com DDI. */
export function ehTelefoneBrasileiroCompleto(digitos: string): boolean {
  return (
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')
  );
}

/**
 * DDD + número sem DDI: 10 dígitos com DDD válido, 11 dígitos com DDD válido e
 * 9 na frente do número (celular) ou 11 dígitos com zero de operadora ("061...").
 */
export function ehTelefoneBrasileiroLocal(digitos: string): boolean {
  if (digitos.length === 11 && digitos.startsWith('0')) return true;
  if (!DDDS_BRASIL.has(digitos.slice(0, 2))) return false;
  if (digitos.length === 10) return true;
  return digitos.length === 11 && digitos[2] === '9';
}

/** Quantos dígitos do início formam o DDI (1, 2 ou 3). */
export function tamanhoDDI(digitos: string): number {
  if (digitos.startsWith('1') || digitos.startsWith('7')) return 1;
  if (DDIS_DOIS_DIGITOS.has(digitos.slice(0, 2))) return 2;
  return 3;
}

/**
 * Indica se o telefone é estrangeiro. Aceita o valor do PhoneInput ("+972 ..."),
 * o JID/bigint gravado (972543316400) ou dígitos locais brasileiros.
 * Números brasileiros (com ou sem 55, com ou sem máscara) devolvem false.
 */
export function ehTelefoneEstrangeiro(
  valor: string | number | bigint | null | undefined
): boolean {
  if (valor === null || valor === undefined) return false;
  const texto = valor.toString().trim();
  const digitos = apenasDigitos(texto);
  if (digitos.length < TELEFONE_E164_MIN || digitos.length > TELEFONE_E164_MAX)
    return false;
  if (texto.startsWith('+')) return !digitos.startsWith('55');
  if (ehTelefoneBrasileiroCompleto(digitos)) return false;
  if (ehTelefoneBrasileiroLocal(digitos)) return false;
  return true;
}

/** Agrupa o número nacional de trás para frente: ... 3 3 4. */
function agruparNacional(nacional: string): string {
  if (nacional.length <= 4) return nacional;
  const grupos: string[] = [nacional.slice(-4)];
  let resto = nacional.slice(0, -4);
  while (resto.length > 3) {
    grupos.unshift(resto.slice(-3));
    resto = resto.slice(0, -3);
  }
  if (resto) grupos.unshift(resto);
  return grupos.join(' ');
}

/**
 * "+972 54 331 6400". Recebe dígitos com DDI (sem "+"). Agrupamento simples,
 * só para leitura.
 */
export function formatarTelefoneInternacional(
  valor: string | number | bigint | null | undefined
): string {
  const digitos = apenasDigitos(valor);
  if (!digitos) return '';
  const corte = tamanhoDDI(digitos);
  const ddi = digitos.slice(0, corte);
  const nacional = digitos.slice(corte);
  return nacional ? `+${ddi} ${agruparNacional(nacional)}` : `+${ddi}`;
}

export interface TelefoneDigitado {
  /** true quando o país escolhido não é o Brasil. */
  internacional: boolean;
  /** DDI só com dígitos ("55" no Brasil). */
  ddi: string;
  /** Número sem o DDI (no Brasil: DDD + número, só dígitos). */
  nacional: string;
  /** DDI + número, só dígitos — é o que vai para o banco. */
  completo: string;
  /** Brasil: 11 dígitos. Exterior: DDI + número entre 8 e 15 dígitos. */
  valido: boolean;
}

/** Monta o valor do PhoneInput para um número estrangeiro. */
export function montarValorInternacional(
  ddi: string,
  nacional: string
): string {
  return `+${apenasDigitos(ddi)} ${apenasDigitos(nacional)}`;
}

/** Interpreta o valor do PhoneInput (ver convenção no topo do arquivo). */
export function lerTelefoneDigitado(
  valor: string | null | undefined
): TelefoneDigitado {
  const texto = (valor ?? '').trim();

  if (texto.startsWith('+')) {
    const semMais = texto.slice(1).trim();
    const espaco = semMais.indexOf(' ');
    let ddi: string;
    let nacional: string;
    if (espaco >= 0) {
      ddi = apenasDigitos(semMais.slice(0, espaco));
      nacional = apenasDigitos(semMais.slice(espaco + 1));
    } else {
      const digitos = apenasDigitos(semMais);
      const corte = tamanhoDDI(digitos);
      ddi = digitos.slice(0, corte);
      nacional = digitos.slice(corte);
    }

    if (ddi !== PAIS_BRASIL.ddi) {
      const completo = `${ddi}${nacional}`;
      return {
        internacional: true,
        ddi,
        nacional,
        completo,
        valido:
          ddi.length > 0 &&
          nacional.length >= 6 &&
          completo.length >= TELEFONE_E164_MIN &&
          completo.length <= TELEFONE_E164_MAX,
      };
    }
    // "+55 ..." digitado em "Outro": trata como Brasil.
    return telefoneBrasileiro(nacional);
  }

  return telefoneBrasileiro(apenasDigitos(texto));
}

function telefoneBrasileiro(nacional: string): TelefoneDigitado {
  return {
    internacional: false,
    ddi: PAIS_BRASIL.ddi,
    nacional,
    completo: `${PAIS_BRASIL.ddi}${nacional}`,
    valido: nacional.length === 11,
  };
}

/** Mensagem de erro padrão quando o número digitado não é válido. */
export function mensagemTelefoneInvalido(telefone: TelefoneDigitado): string {
  if (!telefone.internacional)
    return 'Número deve ter 11 dígitos (DDD + número)';
  if (!telefone.ddi) return 'Informe o código do país';
  return 'Número estrangeiro deve ter de 8 a 15 dígitos, contando o código do país';
}

/**
 * Converte um telefone gravado (pessoas.telefone) para o valor do PhoneInput.
 * Só mexe em número estrangeiro ("972543316400" -> "+972 543316400"); número
 * brasileiro volta exatamente como veio, para não mudar o comportamento atual.
 */
export function telefoneArmazenadoParaInput(
  valor: string | number | bigint | null | undefined
): string {
  if (valor === null || valor === undefined) return '';
  const texto = valor.toString();
  if (texto.trim().startsWith('+') || !ehTelefoneEstrangeiro(texto))
    return texto;
  const digitos = apenasDigitos(texto);
  const corte = tamanhoDDI(digitos);
  return montarValorInternacional(
    digitos.slice(0, corte),
    digitos.slice(corte)
  );
}

/**
 * Para campos que as edge functions normalizam com "55 na frente se não tiver":
 * número estrangeiro vai com "+" para a função saber que já tem DDI.
 * Número brasileiro volta igual.
 */
export function telefoneParaEdge(
  valor: string | number | bigint | null | undefined
): string {
  if (valor === null || valor === undefined) return '';
  const texto = valor.toString();
  if (texto.trim().startsWith('+')) return `+${apenasDigitos(texto)}`;
  if (!ehTelefoneEstrangeiro(texto)) return texto;
  return `+${apenasDigitos(texto)}`;
}

/**
 * Dígitos para link wa.me / JID a partir do telefone gravado: Brasil sai com 55
 * (põe na frente se faltar, como sempre foi); estrangeiro sai como veio.
 */
export function digitosParaWhatsApp(
  valor: string | number | bigint | null | undefined
): string {
  const digitos = apenasDigitos(valor);
  // Menos de 10 dígitos segue a regra antiga (55 na frente).
  if (digitos.length >= 10 && ehTelefoneEstrangeiro(digitos)) return digitos;
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

// --- Webhook n8n verificaWhatsApp ---

export const VERIFICA_WHATSAPP_URL =
  'https://webhooks-i.infusecomunicacao.online/webhook/verificaWhatsApp';

/**
 * Corpo do POST para o webhook n8n verificaWhatsApp.
 *
 * Brasil (igual sempre foi): { whatsapp: "61981446666" } — 11 dígitos locais;
 * o n8n coloca o 55 na frente antes de consultar a uazapi.
 *
 * Exterior: { whatsapp: "972543316400", telefone_completo: "972543316400",
 * internacional: true }. O n8n precisa consultar telefone_completo como veio,
 * sem pôr 55. Enquanto o n8n não fizer isso, ele consulta "55972..." e o número
 * volta como inexistente (o cadastro com número estrangeiro fica bloqueado,
 * nunca grava errado).
 */
export function montarPayloadVerificaWhatsApp(
  telefone: TelefoneDigitado
): Record<string, string | boolean> {
  if (!telefone.internacional) return { whatsapp: telefone.nacional };
  return {
    whatsapp: telefone.completo,
    telefone_completo: telefone.completo,
    internacional: true,
  };
}

/**
 * Número estrangeiro: o JID devolvido não pode ter cara de número brasileiro
 * (sinal de que o n8n consultou "55" + número).
 */
export function jidConfereComTelefone(
  telefone: TelefoneDigitado,
  jidNumber: string
): boolean {
  if (!telefone.internacional) return true;
  const digitos = jidNumber.replace(/\D/g, '');
  return digitos.length > 0 && !ehTelefoneBrasileiroCompleto(digitos);
}
