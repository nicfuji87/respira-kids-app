// AI dev note: Componente que renderiza UMA pergunta da pesquisa.
// Despacha para o tipo correto (single, multi, scale, short-text).
// Recebe a pergunta + valor atual + callbacks para atualizar e avançar.

import React, { useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { PesquisaSingleChoice } from './PesquisaSingleChoice';
import { PesquisaMultiChoice } from './PesquisaMultiChoice';
import { PesquisaScale10 } from './PesquisaScale10';
import { PesquisaShortText } from './PesquisaShortText';
import { PesquisaPediatraSearch } from './PesquisaPediatraSearch';
import type {
  PesquisaExperienciaResposta,
  SurveyQuestion,
} from '@/types/pesquisa-experiencia';

interface PesquisaQuestionCardProps {
  question: SurveyQuestion;
  resposta: PesquisaExperienciaResposta;
  onUpdate: (
    field: SurveyQuestion['id'],
    value: string | string[] | number | undefined
  ) => void;
  /** Atualiza pediatra (pode escrever em pediatra_id e pediatra_nome_outro). */
  onUpdatePediatra?: (next: {
    pediatraId?: string;
    pediatraNomeOutro?: string;
  }) => void;
  onAdvance: () => void;
  onBack?: () => void;
  canGoBack: boolean;
}

export const PesquisaQuestionCard = React.memo<PesquisaQuestionCardProps>(
  ({
    question,
    resposta,
    onUpdate,
    onUpdatePediatra,
    onAdvance,
    onBack,
    canGoBack,
  }) => {
    const handleSingleSelect = useCallback(
      (value: string) => {
        onUpdate(question.id, value);
      },
      [onUpdate, question.id]
    );

    const handleSingleComplete = useCallback(() => {
      onAdvance();
    }, [onAdvance]);

    const handleMultiChange = useCallback(
      (next: string[]) => {
        onUpdate(question.id, next);
      },
      [onUpdate, question.id]
    );

    const handleScaleChange = useCallback(
      (n: number) => {
        onUpdate(question.id, n);
      },
      [onUpdate, question.id]
    );

    const handleTextChange = useCallback(
      (v: string) => {
        onUpdate(question.id, v);
      },
      [onUpdate, question.id]
    );

    return (
      <div className="w-full flex flex-col gap-6 md:gap-8 animate-in fade-in slide-in-from-right-2 duration-400">
        {/* Botão voltar discreto */}
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

        {/* Pergunta */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
            {question.title}
          </h2>
          {question.subtitle && (
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              {question.subtitle}
            </p>
          )}
          {question.helper && (
            <p className="text-sm text-muted-foreground/80 italic">
              {question.helper}
            </p>
          )}
        </div>

        {/* Componente correto */}
        {question.type === 'single-choice' && question.options && (
          <PesquisaSingleChoice
            options={question.options}
            value={resposta[question.id] as string | undefined}
            onSelect={handleSingleSelect}
            onComplete={handleSingleComplete}
          />
        )}

        {question.type === 'multi-choice' && question.options && (
          <PesquisaMultiChoice
            options={question.options}
            value={(resposta[question.id] as string[] | undefined) || []}
            maxSelections={question.maxSelections}
            onChange={handleMultiChange}
            onContinue={onAdvance}
          />
        )}

        {question.type === 'scale-10' && (
          <PesquisaScale10
            value={resposta[question.id] as number | undefined}
            onChange={handleScaleChange}
            onContinue={onAdvance}
            ctaLabel={question.ctaLabel}
          />
        )}

        {question.type === 'short-text' && (
          <PesquisaShortText
            value={resposta[question.id] as string | undefined}
            onChange={handleTextChange}
            onContinue={onAdvance}
            optional={question.optional}
            ctaLabel={question.ctaLabel}
          />
        )}

        {question.type === 'pediatra-search' && onUpdatePediatra && (
          <PesquisaPediatraSearch
            pediatraId={resposta.pediatra_id}
            pediatraNomeOutro={resposta.pediatra_nome_outro}
            onChange={onUpdatePediatra}
            onContinue={onAdvance}
          />
        )}

        {/* Botão "Pular" para perguntas opcionais single-choice / multi-choice / scale-10 */}
        {question.optional &&
          question.type !== 'short-text' &&
          question.type !== 'pediatra-search' && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={onAdvance}
                className="text-muted-foreground hover:text-foreground"
              >
                Prefiro não responder
              </Button>
            </div>
          )}
      </div>
    );
  }
);

PesquisaQuestionCard.displayName = 'PesquisaQuestionCard';
