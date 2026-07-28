import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  useComposableField,
  useStableFunctionProps,
  shallowEqualProps,
} from '@/hooks/useComposableField';

// AI dev note: o nó real fica isolado num React.memo com comparador shallow.
// Combinado com os handlers estáveis do useComposableField, o React deixa de
// commitar atualizações no <textarea> a cada tecla — e é justamente esse commit
// que reescrevia `defaultValue` (= textContent do textarea, ou seja, mutação do
// DOM dentro do campo focado) e desalinhava o IME do teclado Samsung, fazendo o
// acento apagar a palavra inteira. Só re-renderiza se className/disabled/etc
// mudarem de fato.
type TextareaNodeProps = React.ComponentProps<'textarea'> & {
  nodeRef: React.RefCallback<HTMLTextAreaElement>;
};

const TextareaNode = React.memo(function TextareaNode({
  nodeRef,
  ...props
}: TextareaNodeProps) {
  return <textarea ref={nodeRef} {...props} />;
}, shallowEqualProps);

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
    const { ref: nodeRef, ...composable } =
      useComposableField<HTMLTextAreaElement>(
        { value, onChange, onCompositionStart, onCompositionEnd },
        ref
      );
    const stableProps = useStableFunctionProps(props);

    return (
      <TextareaNode
        nodeRef={nodeRef}
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...composable}
        {...stableProps}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
