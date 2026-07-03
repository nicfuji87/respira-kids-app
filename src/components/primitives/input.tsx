import * as React from 'react';

import { cn } from '@/lib/utils';
import { useComposableField } from '@/hooks/useComposableField';

// AI dev note: Input usa useComposableField p/ suportar composição IME
// (acentos/preditivo em tablets Android/Samsung) sem perder caractere anterior.
// Só bufferiza quando controlado (value !== undefined); file/checkbox/uncontrolled
// passam direto.
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
    const composable = useComposableField<HTMLInputElement>({
      value,
      onChange,
      onCompositionStart,
      onCompositionEnd,
    });
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...composable}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
