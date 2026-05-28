// AI dev note: Campo de texto curto (opcional na maioria dos casos).
// Mostra textarea grande com placeholder amigável + CTA "Continuar"/"Pular".

import React, { useCallback } from 'react';
import { Textarea } from '@/components/primitives/textarea';
import { Button } from '@/components/primitives/button';

interface PesquisaShortTextProps {
  value?: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  /** Se true, mostra também o botão "Pular". */
  optional?: boolean;
  ctaLabel?: string;
  placeholder?: string;
  /** Limite suave de caracteres exibido no rodapé. */
  maxLength?: number;
}

export const PesquisaShortText = React.memo<PesquisaShortTextProps>(
  ({
    value,
    onChange,
    onContinue,
    optional = false,
    ctaLabel = 'Continuar',
    placeholder = 'Sua resposta...',
    maxLength = 500,
  }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        if (v.length <= maxLength) onChange(v);
      },
      [onChange, maxLength]
    );

    const trimmed = (value || '').trim();
    const canContinue = optional || trimmed.length > 0;

    return (
      <div className="w-full flex flex-col gap-4">
        <Textarea
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          rows={4}
          className="text-base md:text-lg rounded-2xl border-2 border-border/60 bg-card p-4 min-h-[140px] focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/40 resize-none"
          autoFocus
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{optional ? 'Resposta opcional 💙' : ' '}</span>
          <span>
            {(value || '').length}/{maxLength}
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
          {optional && (
            <Button
              size="lg"
              variant="ghost"
              onClick={onContinue}
              className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
            >
              Pular esta pergunta
            </Button>
          )}
          <Button
            size="lg"
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full sm:w-auto min-w-[180px] h-12 rounded-full"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    );
  }
);

PesquisaShortText.displayName = 'PesquisaShortText';
