import * as React from 'react';

import { cn } from '@/lib/utils';
import { useComposableField } from '@/hooks/useComposableField';

// AI dev note: Textarea usa useComposableField p/ suportar composição IME
// (acentos/preditivo em tablets Android/Samsung, inclusive teclado físico + dead
// keys) sem perder o caractere anterior. O hook deixa o textarea não-controlado
// durante a digitação e sincroniza o `value` externo imperativamente.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(
  (
    {
      className,
      value,
      onChange,
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref
  ) => {
    const composable = useComposableField<HTMLTextAreaElement>(
      { value, onChange, onCompositionStart, onCompositionEnd },
      ref
    );
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...composable}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
