import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  useComposableField,
  useStableFunctionProps,
  shallowEqualProps,
} from '@/hooks/useComposableField';

// AI dev note: mesmo isolamento do Textarea — o nó real fica num React.memo para
// o React não commitar atualizações no <input> a cada tecla (o commit reescreve
// value/defaultValue e o atributo name do nó focado, o que desalinha o IME em
// tablets Android).
type InputNodeProps = React.ComponentProps<'input'> & {
  nodeRef: React.RefCallback<HTMLInputElement>;
};

const InputNode = React.memo(function InputNode({
  nodeRef,
  ...props
}: InputNodeProps) {
  return <input ref={nodeRef} {...props} />;
}, shallowEqualProps);

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
    const { ref: nodeRef, ...composable } =
      useComposableField<HTMLInputElement>(
        { value, onChange, onCompositionStart, onCompositionEnd },
        ref
      );
    const stableProps = useStableFunctionProps(props);

    return (
      <InputNode
        nodeRef={nodeRef}
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...composable}
        {...stableProps}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
