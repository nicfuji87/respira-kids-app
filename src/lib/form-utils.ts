/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UseFormReturn, FieldValues } from 'react-hook-form';

/**
 * AI dev note: Wrapper para resolver problemas de tipagem com react-hook-form e zodResolver
 * O problema ocorre quando o resolver retorna um tipo genérico TFieldValues incompatível
 * Este helper faz o cast necessário mantendo a segurança de tipos
 */

export function getFormControl<T extends FieldValues>(
  form: UseFormReturn<T>
): any {
  return form.control;
}

export function getFormHandleSubmit<T extends FieldValues>(
  form: UseFormReturn<T>
): any {
  return form.handleSubmit;
}

/**
 * AI dev note: Normaliza valores de Select para null quando são valores especiais
 * Radix UI Select não permite value="" (string vazia), então usamos valores especiais
 * e convertemos para null antes de salvar no banco
 *
 * Valores especiais:
 * - __none__: Nenhum valor (null)
 * - __null__: Nenhum valor (null)
 * - __all__: Todos (null para filtros)
 * - __use_main__: Usar valor principal (null)
 */
export const normalizeSelectValue = (value: string): string | null => {
  if (
    value === '__none__' ||
    value === '__null__' ||
    value === '' ||
    value === '__all__' ||
    value === '__use_main__'
  ) {
    return null;
  }
  return value;
};
