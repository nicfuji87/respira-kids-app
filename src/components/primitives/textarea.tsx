import * as React from 'react';

import { cn } from '@/lib/utils';
import { useComposableField } from '@/hooks/useComposableField';

// AI dev note: Textarea usa useComposableField p/ suportar composição IME
// (acentos/preditivo em tablets Android/Samsung) sem perder caractere anterior.
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
    const composable = useComposableField<HTMLTextAreaElement>({
      value,
      onChange,
      onCompositionStart,
      onCompositionEnd,
    });
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...composable}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
