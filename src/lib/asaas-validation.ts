// AI dev note: Validação de dados obrigatórios para criação de cliente/cobrança no ASAAS
// Baseado na documentação oficial: https://docs.asaas.com/reference/criar-novo-cliente

/**
 * Resultado da validação de dados para ASAAS
 */
export interface AsaasValidationResult {
  /** Se todos os dados obrigatórios estão presentes e válidos */
  isValid: boolean;
  /** Lista de campos obrigatórios que estão faltando */
  missingFields: string[];
  /** Lista de avisos sobre dados com formato inválido */
  warnings: string[];
}

/**
 * Dados mínimos necessários para validação ASAAS
 */
export interface ResponsibleDataForAsaas {
  nome?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  telefone?: number | null;
  cep?: string | null;
  numero_endereco?: string | null;
}

/**
 * Valida se um responsável financeiro possui todos os dados necessários
 * para criar um cliente e gerar cobrança no ASAAS
 *
 * @param responsible - Dados do responsável financeiro
 * @returns Resultado da validação com lista de campos faltantes
 */
export function validateResponsibleForAsaas(
  responsible: ResponsibleDataForAsaas
): AsaasValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  // 1. Nome completo (obrigatório)
  if (!responsible.nome?.trim()) {
    missingFields.push('Nome completo');
  }

  // 2. CPF/CNPJ (obrigatório)
  if (!responsible.cpf_cnpj?.trim()) {
    missingFields.push('CPF/CNPJ');
  }

  // 3. Email (obrigatório e formato válido)
  if (!responsible.email?.trim()) {
    missingFields.push('Email');
  } else {
    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(responsible.email)) {
      warnings.push('Email com formato inválido');
    }
    // Verificar caracteres especiais problemáticos (ã, ç, etc)
    if (/[àáâãäåèéêëìíîïòóôõöùúûü]/i.test(responsible.email)) {
      warnings.push('Email contém caracteres especiais não permitidos');
    }
    // Validar domínio comum (detectar typos como .con, .comm, etc)
    const domainPart = responsible.email.split('@')[1];
    if (domainPart && /\.(con|comm|gmial|hotmial|yahooo)$/i.test(domainPart)) {
      warnings.push('Email com domínio suspeito - verifique se está correto');
    }
  }

  // 4. Telefone (obrigatório)
  if (!responsible.telefone) {
    missingFields.push('Telefone');
  }

  // 5. CEP (obrigatório)
  if (!responsible.cep?.trim()) {
    missingFields.push('CEP');
  }

  // 6. Número da residência (obrigatório)
  if (!responsible.numero_endereco?.trim()) {
    missingFields.push('Número da residência');
  }

  return {
    isValid: missingFields.length === 0 && warnings.length === 0,
    missingFields,
    warnings,
  };
}

/**
 * Retorna mensagem de erro formatada para exibir ao usuário
 *
 * @param validation - Resultado da validação
 * @param responsibleName - Nome do responsável (para mensagem personalizada)
 * @returns Mensagem de erro formatada
 */
export function getAsaasValidationErrorMessage(
  validation: AsaasValidationResult,
  responsibleName?: string
): string {
  if (validation.isValid) {
    return '';
  }

  const parts: string[] = [];

  parts.push(
    `Não é possível gerar cobrança${responsibleName ? ` para ${responsibleName}` : ''}.`
  );

  if (validation.missingFields.length > 0) {
    parts.push('\nCampos obrigatórios faltando:');
    validation.missingFields.forEach((field) => {
      parts.push(`• ${field}`);
    });
  }

  if (validation.warnings.length > 0) {
    parts.push('\nAvisos:');
    validation.warnings.forEach((warning) => {
      parts.push(`• ${warning}`);
    });
  }

  parts.push(
    '\nPor favor, complete os dados do responsável financeiro antes de gerar a cobrança.'
  );

  return parts.join('\n');
}
