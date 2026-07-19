import * as React from 'react';

import { cn } from '@/lib/utils';
import { useComposableField } from '@/hooks/useComposableField';

// AI dev note: Input usa useComposableField p/ suportar composição IME
// (acentos/preditivo em tablets Android/Samsung, inclusive teclado físico + dead
// keys) sem perder o caractere anterior. O hook deixa o input não-controlado
// durante a digitação e sincroniza o `value` externo imperativamente.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  (
    {
      className,
      type,
      value,
      onChange,
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref
  ) => {
    const composable = useComposableField<HTMLInputElement>(
      { value, onChange, onCompositionStart, onCompositionEnd },
      ref
    );
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...composable}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
