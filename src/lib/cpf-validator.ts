// AI dev note: Validador de CPF
// Valida CPF usando algoritmo matemático de dígitos verificadores
// Não consulta APIs externas, apenas valida a estrutura do CPF

/**
 * Remove caracteres não numéricos do CPF
 */
export function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Verifica se o CPF tem formato válido (11 dígitos após limpeza)
 */
export function isValidCPFFormat(cpf: string): boolean {
  const cleaned = cleanCPF(cpf);
  return cleaned.length === 11;
}

/**
 * Verifica se o CPF é um dos conhecidos como inválidos
 * (todos os dígitos iguais: 000.000.000-00, 111.111.111-11, etc.)
 */
export function isKnownInvalidCPF(cpf: string): boolean {
  const cleaned = cleanCPF(cpf);

  // Lista de CPFs inválidos conhecidos (todos dígitos iguais)
  const knownInvalid = [
    '00000000000',
    '11111111111',
    '22222222222',
    '33333333333',
    '44444444444',
    '55555555555',
    '66666666666',
    '77777777777',
    '88888888888',
    '99999999999',
  ];

  return knownInvalid.includes(cleaned);
}

/**
 * Calcula o dígito verificador do CPF
 */
function calculateDigit(cpf: string, factor: number): number {
  let total = 0;
  for (const digit of cpf) {
    if (factor > 1) {
      total += parseInt(digit) * factor--;
    }
  }
  const rest = total % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Valida CPF usando algoritmo de dígitos verificadores
 */
export function isValidCPF(cpf: string): boolean {
  const cleaned = cleanCPF(cpf);

  // Verificar formato
  if (!isValidCPFFormat(cleaned)) {
    return false;
  }

  // Verificar CPFs conhecidos como inválidos
  if (isKnownInvalidCPF(cleaned)) {
    return false;
  }

  // Validar primeiro dígito verificador
  const firstNineDigits = cleaned.substring(0, 9);
  const firstVerifierDigit = calculateDigit(firstNineDigits, 10);

  if (firstVerifierDigit !== parseInt(cleaned.charAt(9))) {
    return false;
  }

  // Validar segundo dígito verificador
  const firstTenDigits = cleaned.substring(0, 10);
  const secondVerifierDigit = calculateDigit(firstTenDigits, 11);

  if (secondVerifierDigit !== parseInt(cleaned.charAt(10))) {
    return false;
  }

  return true;
}

/**
 * Função principal de validação de CPF
 * Retorna objeto com status de validação e mensagem de erro se aplicável
 */
export function validateCPF(cpf: string): { valid: boolean; error?: string } {
  // Se CPF estiver vazio, retornar como inválido com mensagem apropriada
  if (!cpf || cpf.trim() === '') {
    return {
      valid: false,
      error: 'CPF é obrigatório',
    };
  }

  const cleaned = cleanCPF(cpf);

  // Verificar formato
  if (cleaned.length !== 11) {
    return {
      valid: false,
      error: 'CPF deve conter 11 dígitos',
    };
  }

  // Verificar CPFs conhecidos como inválidos
  if (isKnownInvalidCPF(cleaned)) {
    return {
      valid: false,
      error: 'Este CPF não pode ser utilizado',
    };
  }

  // Validar dígitos verificadores
  if (!isValidCPF(cleaned)) {
    return {
      valid: false,
      error: 'CPF inválido. Verifique os dígitos informados',
    };
  }

  return { valid: true };
}

/**
 * Valida CPF opcional (para campos não obrigatórios)
 * Se vazio, retorna válido. Se preenchido, valida.
 */
export function validateOptionalCPF(cpf: string): {
  valid: boolean;
  error?: string;
} {
  // Se vazio, é válido (campo opcional)
  if (!cpf || cpf.trim() === '') {
    return { valid: true };
  }

  // Se preenchido, validar
  return validateCPF(cpf);
}
