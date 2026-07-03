import * as React from 'react';

// AI dev note: useComposableField torna inputs de texto seguros para composição
// IME (acentos e texto preditivo em teclados Android/Samsung, inclusive com
// teclado físico + dead keys tipo ~ -> ã).
//
// Problema: num <input>/<textarea> CONTROLADO (value={state}), o React reconcilia
// node.value a cada render. Durante uma composição IME, se houver qualquer atraso
// entre o keystroke e o re-render (tablet lento, componente pai grande), o IME já
// avançou o node.value e o React o reescreve com um valor defasado -> a região de
// composição colapsa e o acento "apaga" a letra anterior (ex.: "não" vira "ão").
//
// Solução: manter o input NÃO-CONTROLADO (o DOM é dono do value durante a
// digitação, então o React nunca reescreve node.value enquanto se digita/compõe).
// O valor externo (`value`) é sincronizado imperativamente para o DOM apenas
// quando muda de fora (ex.: "reaproveitar evolução", chips, troca de seção) e
// nunca no meio de uma composição. O onChange continua subindo p/ o pai a cada
// tecla (fora de composição) e o valor final é commitado no compositionend.

type FieldValue = string | number | readonly string[] | undefined;

type ComposableElement = HTMLInputElement | HTMLTextAreaElement;

interface UseComposableFieldParams<T extends ComposableElement> {
  value: FieldValue;
  onChange?: React.ChangeEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
}

interface ComposableFieldBindings<T extends ComposableElement> {
  ref: React.RefCallback<T>;
  defaultValue: FieldValue;
  onChange: React.ChangeEventHandler<T>;
  onCompositionStart: React.CompositionEventHandler<T>;
  onCompositionEnd: React.CompositionEventHandler<T>;
}

function toDomValue(value: FieldValue): string {
  if (value == null) return '';
  return Array.isArray(value) ? value.join(',') : String(value);
}

export function useComposableField<T extends ComposableElement>(
  {
    value,
    onChange,
    onCompositionStart,
    onCompositionEnd,
  }: UseComposableFieldParams<T>,
  forwardedRef: React.Ref<T>
): ComposableFieldBindings<T> {
  const elRef = React.useRef<T | null>(null);
  const isComposingRef = React.useRef(false);

  // Merge do ref interno com o ref repassado pelo consumidor
  const setRef = React.useCallback<React.RefCallback<T>>(
    (node) => {
      elRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<T | null>).current = node;
    },
    [forwardedRef]
  );

  // Sincroniza valor externo -> DOM. Não roda durante composição (não pode
  // reescrever node.value no meio do acento). Só escreve quando de fato difere,
  // para não mexer no cursor durante a digitação normal.
  React.useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || value === undefined || isComposingRef.current) return;
    const next = toDomValue(value);
    if (el.value !== next) el.value = next;
  }, [value]);

  const handleChange = React.useCallback<React.ChangeEventHandler<T>>(
    (e) => {
      // Durante composição, o pai não é atualizado; o commit vem no compositionend
      if (!isComposingRef.current) onChange?.(e);
    },
    [onChange]
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
      // Commit do texto final (o pai lê e.target.value do elemento)
      onChange?.(e as unknown as React.ChangeEvent<T>);
    },
    [onChange, onCompositionEnd]
  );

  return {
    ref: setRef,
    // defaultValue = valor inicial; atualizações externas vão pelo layout effect
    defaultValue: value,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
