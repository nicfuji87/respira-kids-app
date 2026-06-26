// AI dev note: Pergunta escrita (texto longo) do processo seletivo.
// Mostra contador + mínimo sugerido. Só libera "Continuar" ao atingir o mínimo.

import React, { useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Textarea } from '@/components/primitives/textarea';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

interface EstagioTextQuestionProps {
  kicker?: string;
  titulo: string;
  subtitulo?: string;
  placeholder?: string;
  minChars?: number;
  maxChars?: number;
  value?: string;
  isLast?: boolean;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  canGoBack: boolean;
}

export const EstagioTextQuestion = React.memo<EstagioTextQuestionProps>(
  ({
    kicker,
    titulo,
    subtitulo,
    placeholder = 'Escreva com suas palavras...',
    minChars = 0,
    maxChars = 1500,
    value,
    isLast = false,
    onChange,
    onContinue,
    onBack,
    canGoBack,
  }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        if (v.length <= maxChars) onChange(v);
      },
      [onChange, maxChars]
    );

    const len = (value || '').trim().length;
    const canContinue = len >= minChars;
    const faltam = Math.max(0, minChars - len);

    return (
      <div className="w-full flex flex-col gap-5 animate-in fade-in slide-in-from-right-2 duration-400">
        {canGoBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start inline-flex items-center gap-1 text-sm text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
        )}

        <div className="space-y-2">
          {kicker && (
            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-azul-respira">
              {kicker}
            </span>
          )}
          <h2 className="text-xl md:text-2xl font-bold text-foreground leading-snug">
            {titulo}
          </h2>
          {subtitulo && (
            <p className="text-base text-muted-foreground leading-relaxed">
              {subtitulo}
            </p>
          )}
        </div>

        <Textarea
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          rows={7}
          className="text-base md:text-lg rounded-2xl border-2 border-border/60 bg-card p-4 min-h-[200px] focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/40 resize-none"
          autoFocus
        />
        <div className="flex items-center justify-between text-xs px-1">
          <span
            className={cn(
              'transition-colors',
              canContinue ? 'text-verde-pipa' : 'text-muted-foreground'
            )}
          >
            {canContinue
              ? 'Ótimo, pode continuar 💙'
              : `Escreva pelo menos mais ${faltam} caractere${faltam === 1 ? '' : 's'}`}
          </span>
          <span className="text-muted-foreground">
            {(value || '').length}/{maxChars}
          </span>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full sm:w-auto min-w-[200px] h-12 rounded-full"
          >
            {isLast ? 'Enviar candidatura' : 'Continuar'}
          </Button>
        </div>
      </div>
    );
  }
);

EstagioTextQuestion.displayName = 'EstagioTextQuestion';
