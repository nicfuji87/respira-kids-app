import React, { useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo,
  Redo,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Separator } from './separator';

// AI dev note: RichTextEditor primitive usando contentEditable nativo
// Editor simples com formatação básica, compatível com React 19

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  error?: string;
  editorBackgroundColor?: string;
}

export const RichTextEditor = React.memo<RichTextEditorProps>(
  ({
    value,
    onChange,
    placeholder = 'Digite seu texto...',
    disabled = false,
    className,
    minHeight = 120,
    maxHeight = 400,
    error,
    editorBackgroundColor,
  }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    // AI dev note: lastValueRef armazena o último valor que veio de dentro do componente
    // Isso evita re-escrever o innerHTML quando o valor veio de uma digitação do usuário
    const lastInternalValueRef = useRef<string>(value);
    // AI dev note: Flag para rastrear composição IME (acentos em Android/Samsung)
    // Não processar onInput enquanto composição estiver ativa para evitar apagar palavras
    const isComposingRef = useRef(false);

    // AI dev note: Sincronizar valor externo com editor APENAS quando o valor veio de fora
    // Isso evita perda de foco causada por re-escrita do innerHTML após digitação do usuário
    // CORREÇÃO: Também sincronizar quando innerHTML está vazio mas value não (caso de montagem/remontagem)
    useEffect(() => {
      if (editorRef.current) {
        const currentInnerHTML = editorRef.current.innerHTML;

        // AI dev note: Duas condições para atualizar o innerHTML:
        // 1. Sincronização inicial/remontagem: innerHTML vazio mas value tem conteúdo
        // 2. Valor mudou de fora: value diferente do último valor interno E innerHTML diferente do value
        const isInitialSync = !currentInnerHTML && value;
        const isExternalChange =
          value !== lastInternalValueRef.current && currentInnerHTML !== value;

        if (isInitialSync || isExternalChange) {
          editorRef.current.innerHTML = value || '';
        }
        // Atualiza a referência para o valor atual
        lastInternalValueRef.current = value;
      }
    }, [value]);

    // Handle mudanças no conteúdo
    // AI dev note: Ignorar onInput durante composição IME para evitar bug em tablets Samsung
    const handleInput = useCallback(() => {
      if (editorRef.current && !disabled && !isComposingRef.current) {
        const html = editorRef.current.innerHTML;
        // Atualiza a referência ANTES de chamar onChange
        // Assim, quando o useEffect rodar, ele saberá que o valor veio de dentro
        lastInternalValueRef.current = html;
        onChange(html);
      }
    }, [onChange, disabled]);

    // AI dev note: Handlers de composição IME para suporte a acentos em Android/Samsung
    // Composição: quando usuário digita acento, o teclado cria caractere temporário
    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(() => {
      isComposingRef.current = false;
      // Processar mudança após composição terminar
      if (editorRef.current && !disabled) {
        const html = editorRef.current.innerHTML;
        // Atualiza a referência ANTES de chamar onChange
        lastInternalValueRef.current = html;
        onChange(html);
      }
    }, [onChange, disabled]);

    // Comandos de formatação
    const execCommand = useCallback(
      (command: string, value?: string) => {
        if (disabled) return;

        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleInput();
      },
      [disabled, handleInput]
    );

    // Verificar se comando está ativo
    const isCommandActive = useCallback((command: string): boolean => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    }, []);

    // Comandos específicos
    const toggleBold = useCallback(() => execCommand('bold'), [execCommand]);
    const toggleItalic = useCallback(
      () => execCommand('italic'),
      [execCommand]
    );
    const toggleUnderline = useCallback(
      () => execCommand('underline'),
      [execCommand]
    );
    const toggleBulletList = useCallback(
      () => execCommand('insertUnorderedList'),
      [execCommand]
    );
    const toggleNumberedList = useCallback(
      () => execCommand('insertOrderedList'),
      [execCommand]
    );
    const undo = useCallback(() => execCommand('undo'), [execCommand]);
    const redo = useCallback(() => execCommand('redo'), [execCommand]);
    const clearFormat = useCallback(
      () => execCommand('removeFormat'),
      [execCommand]
    );

    // Handle paste - limpar formatação externa
    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        execCommand('insertText', text);
      },
      [execCommand]
    );

    // Handle key events
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;

        // Atalhos de teclado
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'b':
              e.preventDefault();
              toggleBold();
              break;
            case 'i':
              e.preventDefault();
              toggleItalic();
              break;
            case 'u':
              e.preventDefault();
              toggleUnderline();
              break;
            case 'z':
              if (e.shiftKey) {
                e.preventDefault();
                redo();
              } else {
                e.preventDefault();
                undo();
              }
              break;
          }
        }
      },
      [disabled, toggleBold, toggleItalic, toggleUnderline, undo, redo]
    );

    return (
      <div
        className={cn(
          'rich-text-editor border rounded-lg overflow-hidden',
          error && 'border-destructive',
          className
        )}
      >
        {/* Toolbar */}
        {!disabled && (
          <div className="border-b bg-muted/30 p-2">
            <div className="flex items-center gap-1 flex-wrap">
              {/* Formatação de texto */}
              <Button
                type="button"
                variant={isCommandActive('bold') ? 'default' : 'ghost'}
                size="sm"
                onClick={toggleBold}
                className="h-8 w-8 p-0"
                title="Negrito (Ctrl+B)"
              >
                <Bold className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant={isCommandActive('italic') ? 'default' : 'ghost'}
                size="sm"
                onClick={toggleItalic}
                className="h-8 w-8 p-0"
                title="Itálico (Ctrl+I)"
              >
                <Italic className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant={isCommandActive('underline') ? 'default' : 'ghost'}
                size="sm"
                onClick={toggleUnderline}
                className="h-8 w-8 p-0"
                title="Sublinhado (Ctrl+U)"
              >
                <Underline className="h-4 w-4" />
              </Button>

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Listas */}
              <Button
                type="button"
                variant={
                  isCommandActive('insertUnorderedList') ? 'default' : 'ghost'
                }
                size="sm"
                onClick={toggleBulletList}
                className="h-8 w-8 p-0"
                title="Lista com marcadores"
              >
                <List className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant={
                  isCommandActive('insertOrderedList') ? 'default' : 'ghost'
                }
                size="sm"
                onClick={toggleNumberedList}
                className="h-8 w-8 p-0"
                title="Lista numerada"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>

              <Separator orientation="vertical" className="h-6 mx-1" />

              {/* Ações */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={undo}
                className="h-8 w-8 p-0"
                title="Desfazer (Ctrl+Z)"
              >
                <Undo className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={redo}
                className="h-8 w-8 p-0"
                title="Refazer (Ctrl+Shift+Z)"
              >
                <Redo className="h-4 w-4" />
              </Button>

              <Separator orientation="vertical" className="h-6 mx-1" />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFormat}
                className="h-8 w-8 p-0"
                title="Limpar formatação"
              >
                <Type className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className={cn(
            'p-3 outline-none overflow-y-auto resize-none',
            'prose prose-sm max-w-none',
            'focus:ring-1 focus:ring-ring',
            disabled && 'opacity-60 cursor-not-allowed bg-muted/50',
            'text-sm text-foreground'
          )}
          style={{
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
            ...(editorBackgroundColor && {
              backgroundColor: editorBackgroundColor,
            }),
          }}
          data-placeholder={placeholder}
          suppressContentEditableWarning={true}
          role="textbox"
          aria-label="Editor de texto rico"
          aria-multiline="true"
          aria-disabled={disabled}
        />

        {/* Placeholder quando vazio - CSS inline */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .rich-text-editor [contenteditable][data-placeholder]:empty::before {
              content: attr(data-placeholder);
              color: hsl(var(--muted-foreground));
              pointer-events: none;
              position: absolute;
            }
          `,
          }}
        />

        {/* Mensagem de erro */}
        {error && (
          <p
            className="text-sm text-destructive p-2 bg-destructive/10 border-t"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
