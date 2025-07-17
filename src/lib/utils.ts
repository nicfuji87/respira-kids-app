import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// AI dev note: Função para normalizar texto removendo acentos e caracteres especiais
// Útil para busca que ignore acentuação (José → jose)

/**
 * Remove acentos e normaliza texto para busca
 * Exemplo: "José María" → "jose maria"
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  return text
    .normalize('NFD') // Decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remover diacríticos (acentos)
    .toLowerCase()
    .trim();
}

// AI dev note: Funções utilitárias para formatação de documentos
// Seguindo padrão brasileiro de CNPJ e Inscrição Estadual

/**
 * Remove formatação de CNPJ (pontos, barras, hífen)
 */
export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/[^\d]/g, '');
}

/**
 * Formata CNPJ no padrão XX.XXX.XXX/XXXX-XX
 */
export function formatCnpj(cnpj: string): string {
  const numbers = normalizeCnpj(cnpj);
  if (numbers.length !== 14) return cnpj;

  return numbers.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

/**
 * Formata Inscrição Estadual no padrão XXX.XXX.XXX.XXX
 */
export function formatInscricaoEstadual(ie: string): string {
  const numbers = ie.replace(/[^\d]/g, '');
  if (numbers.length < 8) return ie;

  // Formato genérico para a maioria dos estados (pode ser ajustado por estado específico se necessário)
  return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, '$1.$2.$3.$4');
}
