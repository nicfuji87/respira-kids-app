/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI dev note: Arquivo de definição de tipos para resolver incompatibilidades
 * entre react-hook-form e @hookform/resolvers/zod
 *
 * O problema ocorre porque o zodResolver retorna um tipo genérico que causa
 * conflito com a inferência de tipos do useForm
 */

import type { Resolver, FieldValues } from 'react-hook-form';
import type { ZodType } from 'zod';

declare module '@hookform/resolvers/zod' {
  export function zodResolver<T extends FieldValues>(
    schema: ZodType<T>,
    schemaOptions?: any,
    resolverOptions?: any
  ): Resolver<T>;
}
