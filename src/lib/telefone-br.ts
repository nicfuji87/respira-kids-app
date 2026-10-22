// AI dev note: formatação única de telefone brasileiro para documentos (contrato).
// O telefone chega em vários formatos: JID do WhatsApp com DDI ("559881241370",
// às vezes sem o 9 do celular), dígitos locais ("61986631761"), local sem o 9
// ("6186631761") ou já com máscara ("(61) 98663-1761"). Cortar em posições fixas
// gerava "(55) 98812-41370" (o DDI virava DDD) em quase todos os contratos.
// pessoas.telefone continua sendo o JID e não deve ser alterado — isto é só exibição.

export interface TelefoneBR {
  ddd: string;
  /** 8 dígitos (fixo) ou 9 dígitos (celular, sempre com o 9 na frente). */
  numero: string;
}

/**
 * Separa DDD e número de qualquer formato. Devolve null quando não dá para
 * reconhecer um telefone brasileiro (melhor deixar em branco do que errado).
 */
export function normalizarTelefoneBR(
  valor: string | number | bigint | null | undefined
): TelefoneBR | null {
  if (valor === null || valor === undefined) return null;
  let digitos = valor.toString().replace(/\D/g, '');
  if (!digitos) return null;

  // Com DDI: 12 (sem o 9) ou 13 dígitos começando com 55.
  if (
    (digitos.length === 12 || digitos.length === 13) &&
    digitos.startsWith('55')
  ) {
    digitos = digitos.slice(2);
  }
  // Prefixo de operadora/zero à esquerda ("061...").
  if (digitos.length === 11 && digitos.startsWith('0')) {
    digitos = digitos.slice(1);
  }

  if (digitos.length !== 10 && digitos.length !== 11) return null;

  const ddd = digitos.slice(0, 2);
  let numero = digitos.slice(2);
  if (ddd.startsWith('0')) return null;

  // Celular gravado sem o 9 (comum no JID): 8 dígitos começando com 6-9.
  if (numero.length === 8 && /^[6-9]/.test(numero)) {
    numero = `9${numero}`;
  }
  if (numero.length === 9 && !numero.startsWith('9')) return null;

  return { ddd, numero };
}

/**
 * "(98) 98124-1370" / "(61) 3333-4444". Quando não reconhece (ex.: número
 * estrangeiro), devolve o valor como veio, para não sumir do documento.
 */
export function formatarTelefoneBR(
  valor: string | number | bigint | null | undefined
): string {
  const tel = normalizarTelefoneBR(valor);
  if (!tel)
    return valor === null || valor === undefined ? '' : valor.toString().trim();
  const corte = tel.numero.length - 4;
  return `(${tel.ddd}) ${tel.numero.slice(0, corte)}-${tel.numero.slice(corte)}`;
}
