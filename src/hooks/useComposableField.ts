import * as React from 'react';

// AI dev note: useComposableField torna inputs de texto seguros para composição
// IME (acentos e texto preditivo em teclados Android/Samsung, inclusive com
// teclado físico + dead keys tipo ´ -> á).
//
// Problema: num <input>/<textarea> CONTROLADO (value={state}), o React reconcilia
// node.value a cada render. Durante uma composição IME, se houver qualquer atraso
// entre o keystroke e o re-render (tablet lento, componente pai grande), o IME já
// avançou o node.value e o React o reescreve com um valor defasado -> a região de
// composição colapsa e o acento "apaga" a letra anterior (ex.: "não" vira "ão").
//
// Solução em 3 camadas — todas necessárias:
//  1) input NÃO-CONTROLADO durante a digitação (o DOM é dono do value, então o
//     React nunca reescreve node.value ao digitar/compor). O valor externo é
//     sincronizado imperativamente e nunca no meio de uma composição.
//  2) `defaultValue` CONGELADO no valor de montagem. O React reescreve o
//     defaultValue do nó a cada commit; em <textarea> isso equivale a trocar o
//     nó de texto filho (defaultValue === textContent), ou seja, mutação de DOM
//     dentro do campo focado a cada tecla — é isso que desalinha o buffer do
//     teclado Android e faz o acento comer a palavra inteira ("ollllllá" -> "á").
//  3) handlers com identidade ESTÁVEL (ver useStableFunctionProps +
//     shallowEqualProps nos primitivos), para o React.memo do nó do DOM dar
//     bailout e o React não commitar NENHUMA atualização no elemento enquanto se
//     digita. Sem isso, (2) não basta: o React recommita o nó a cada render do
//     pai porque o objeto de props muda de identidade.

type FieldValue = string | number | readonly string[] | undefined;

type ComposableElement = HTMLInputElement | HTMLTextAreaElement;

// Teto de emissões ainda não reconhecidas pelo pai que guardamos para detectar
// o "eco" defasado (ver useLayoutEffect abaixo). Só cresce enquanto o render do
// pai está atrás do DOM.
const PENDING_EMITS_LIMIT = 64;

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
  const pendingEmitsRef = React.useRef<string[]>([]);

  // Props "vivas" em refs: tudo que é entregue ao nó do DOM precisa ter
  // identidade estável entre renders, senão o React.memo do nó não dá bailout.
  const forwardedRefProp = React.useRef(forwardedRef);
  forwardedRefProp.current = forwardedRef;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const onCompositionStartRef = React.useRef(onCompositionStart);
  onCompositionStartRef.current = onCompositionStart;
  const onCompositionEndRef = React.useRef(onCompositionEnd);
  onCompositionEndRef.current = onCompositionEnd;

  // Valor de montagem: é o único `defaultValue` que o nó vai ver na vida dele.
  // Mudanças externas entram pelo useLayoutEffect abaixo (imperativas).
  const initialValueRef = React.useRef<FieldValue>(value);

  const setRef = React.useCallback<React.RefCallback<T>>((node) => {
    elRef.current = node;
    const fw = forwardedRefProp.current;
    if (typeof fw === 'function') fw(node);
    else if (fw) (fw as React.MutableRefObject<T | null>).current = node;
  }, []);

  // Sincroniza valor externo -> DOM. Não roda durante composição (não pode
  // reescrever node.value no meio do acento) nem quando o valor recebido é
  // apenas o eco do que nós mesmos emitimos.
  React.useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || value === undefined || isComposingRef.current) return;
    const next = toDomValue(value);

    // Eco: o pai está renderizando uma emissão nossa — possivelmente defasada,
    // porque num tablet lento com formulário grande o usuário digita mais rápido
    // do que o React re-renderiza. Reescrever aqui rebobinaria o texto e
    // desalinharia o buffer do IME. Consumimos a emissão reconhecida (e as
    // anteriores) e não tocamos no DOM.
    const pending = pendingEmitsRef.current;
    const acked = pending.indexOf(next);
    if (acked !== -1) {
      pending.splice(0, acked + 1);
      return;
    }

    if (el.value === next) return;
    // Mudança genuinamente externa (reaproveitar evolução, reset de formulário,
    // carregar registro): aplica e descarta emissões pendentes.
    el.value = next;
    pending.length = 0;
  }, [value]);

  const emit = React.useCallback((e: React.SyntheticEvent<T>) => {
    const el = elRef.current;
    if (el) {
      const pending = pendingEmitsRef.current;
      pending.push(el.value);
      if (pending.length > PENDING_EMITS_LIMIT) pending.shift();
    }
    onChangeRef.current?.(e as React.ChangeEvent<T>);
  }, []);

  const handleChange = React.useCallback<React.ChangeEventHandler<T>>(
    (e) => {
      // Durante composição, o pai não é atualizado; o commit vem no compositionend
      if (isComposingRef.current) return;
      emit(e);
    },
    [emit]
  );

  const handleCompositionStart = React.useCallback<
    React.CompositionEventHandler<T>
  >((e) => {
    isComposingRef.current = true;
    onCompositionStartRef.current?.(e);
  }, []);

  const handleCompositionEnd = React.useCallback<
    React.CompositionEventHandler<T>
  >(
    (e) => {
      isComposingRef.current = false;
      onCompositionEndRef.current?.(e);
      // Commit do texto final (o pai lê e.target.value do elemento)
      emit(e);
    },
    [emit]
  );

  return {
    ref: setRef,
    // defaultValue = valor de montagem; atualizações externas vão pelo layout effect
    defaultValue: initialValueRef.current,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}

// AI dev note: substitui toda prop função por um proxy de identidade estável que
// sempre chama a versão mais recente. Assim handlers inline do consumidor
// (onKeyDown, onBlur, onFocus...) não quebram o bailout do React.memo do nó nem
// congelam closures antigas.
export function useStableFunctionProps<P extends object>(props: P): P {
  const latestRef = React.useRef(props as Record<string, unknown>);
  latestRef.current = props as Record<string, unknown>;
  const proxiesRef = React.useRef(
    new Map<string, (...a: unknown[]) => unknown>()
  );

  const source = props as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const propValue = source[key];
    if (typeof propValue !== 'function') {
      result[key] = propValue;
      continue;
    }
    let proxy = proxiesRef.current.get(key);
    if (!proxy) {
      proxy = (...args: unknown[]) => {
        const latest = latestRef.current[key];
        return typeof latest === 'function'
          ? (latest as (...a: unknown[]) => unknown)(...args)
          : undefined;
      };
      proxiesRef.current.set(key, proxy);
    }
    result[key] = proxy;
  }
  return result as P;
}

// Comparador do React.memo do nó do DOM. Com useStableFunctionProps, o caso
// normal (só handlers mudando de identidade) vira bailout total: o React não
// toca no <input>/<textarea> enquanto o usuário digita.
export function shallowEqualProps<P extends object>(prev: P, next: P): boolean {
  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const prevKeys = Object.keys(a);
  const nextKeys = Object.keys(b);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
