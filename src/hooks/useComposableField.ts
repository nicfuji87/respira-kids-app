import * as React from 'react';

// AI dev note: useComposableField torna inputs controlados seguros para
// composição IME (acentos e texto preditivo em teclados Android/Samsung).
//
// Problema: em um <input>/<textarea> controlado, cada tecla dispara onChange ->
// o pai faz setState -> re-render -> o React reescreve node.value no DOM. Se
// isso acontece no meio de uma composição IME (ex.: digitar o acento de "á"),
// a região de composição é colapsada e o acento "apaga" a letra anterior.
//
// Solução: manter um buffer interno (innerValue) que espelha o DOM. Durante a
// composição, o onChange NÃO é propagado ao pai (evitando o re-render que
// reescreve o value); o valor final é enviado ao pai no compositionend. Como o
// value renderizado sempre bate com node.value, o React nunca interfere na
// composição. Fora de composição, o comportamento é idêntico ao de um input
// controlado comum.

type FieldValue = string | number | readonly string[] | undefined;

type ComposableElement = HTMLInputElement | HTMLTextAreaElement;

interface UseComposableFieldParams<T extends ComposableElement> {
  value: FieldValue;
  onChange?: React.ChangeEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
}

interface ComposableFieldBindings<T extends ComposableElement> {
  value: FieldValue;
  onChange: React.ChangeEventHandler<T>;
  onCompositionStart: React.CompositionEventHandler<T>;
  onCompositionEnd: React.CompositionEventHandler<T>;
}

export function useComposableField<T extends ComposableElement>({
  value,
  onChange,
  onCompositionStart,
  onCompositionEnd,
}: UseComposableFieldParams<T>): ComposableFieldBindings<T> {
  // value === undefined => input não-controlado; nesse caso a composição já
  // funciona nativamente (o React nunca reescreve node.value), então apenas
  // repassamos os handlers sem bufferizar.
  const isControlled = value !== undefined;
  const isComposingRef = React.useRef(false);
  const [innerValue, setInnerValue] = React.useState<FieldValue>(value ?? '');

  // Sincroniza valor externo -> buffer interno, exceto durante composição IME
  React.useEffect(() => {
    if (isControlled && !isComposingRef.current) {
      setInnerValue(value ?? '');
    }
  }, [value, isControlled]);

  const handleChange = React.useCallback<React.ChangeEventHandler<T>>(
    (e) => {
      if (isControlled) setInnerValue(e.target.value);
      // Segura a propagação apenas enquanto compõe em input controlado
      if (!isComposingRef.current || !isControlled) {
        onChange?.(e);
      }
    },
    [isControlled, onChange]
  );

  const handleCompositionStart = React.useCallback<
    React.CompositionEventHandler<T>
  >(
    (e) => {
      isComposingRef.current = true;
      onCompositionStart?.(e);
    },
    [onCompositionStart]
  );

  const handleCompositionEnd = React.useCallback<
    React.CompositionEventHandler<T>
  >(
    (e) => {
      isComposingRef.current = false;
      onCompositionEnd?.(e);
      // Commit do texto composto: espelha e propaga o valor final ao pai
      if (isControlled) {
        setInnerValue(e.currentTarget.value);
        onChange?.(e as unknown as React.ChangeEvent<T>);
      }
    },
    [isControlled, onChange, onCompositionEnd]
  );

  return {
    value: isControlled ? innerValue : value,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
