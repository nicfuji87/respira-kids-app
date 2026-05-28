// AI dev note: Página pública da Pesquisa de Experiência Respira Kids.
// Rota: #/experiencia (anônima, sem autenticação).
// Fluxo: welcome -> N perguntas (uma por tela) -> tela final.
// Não persiste localStorage entre sessões (deve sentir sempre como conversa nova).

import React, { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/primitives/use-toast';
import {
  PesquisaProgress,
  PesquisaQuestionCard,
  PesquisaSuccessScreen,
  PesquisaWelcomeScreen,
} from '@/components/domain/pesquisa-experiencia';
import { getVisibleQuestions } from '@/lib/pesquisa-experiencia-questions';
import { submitPesquisaExperiencia } from '@/lib/pesquisa-experiencia-api';
import type {
  PesquisaExperienciaField,
  PesquisaExperienciaResposta,
  SurveyQuestion,
} from '@/types/pesquisa-experiencia';
import { cn } from '@/lib/utils';

type Stage = 'welcome' | 'question' | 'submitting' | 'done';

const HEADER_HEIGHT = 'pt-6';

export const PesquisaExperienciaPage: React.FC = () => {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('welcome');
  const [resposta, setResposta] = useState<PesquisaExperienciaResposta>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Lista de perguntas visíveis dado o estado atual de respostas
  const visibleQuestions = useMemo<SurveyQuestion[]>(
    () => getVisibleQuestions(resposta),
    [resposta]
  );

  const currentQuestion: SurveyQuestion | undefined =
    visibleQuestions[currentIndex];

  const handleStart = useCallback(() => {
    setStage('question');
  }, []);

  const handleUpdate = useCallback(
    (
      field: PesquisaExperienciaField,
      value: string | string[] | number | undefined
    ) => {
      setResposta((prev) => {
        const next = { ...prev };
        if (
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          delete next[field];
        } else {
          // Type-safe: cada campo aceita um tipo específico, mas como vem do componente
          // já sabemos que está alinhado.
          (next as Record<string, unknown>)[field] = value;
        }
        return next;
      });
    },
    []
  );

  const submitFinal = useCallback(
    async (finalResposta: PesquisaExperienciaResposta) => {
      setStage('submitting');
      try {
        await submitPesquisaExperiencia(finalResposta);
        setStage('done');
        // Rolar para o topo suavemente
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('[PesquisaExperiencia] erro ao enviar:', error);
        toast({
          title: 'Não conseguimos enviar suas respostas',
          description:
            'Verifique sua conexão e tente novamente em instantes. 💙',
          variant: 'destructive',
        });
        setStage('question');
      }
    },
    [toast]
  );

  const handleAdvance = useCallback(() => {
    // Recalcula a lista de perguntas visíveis com a resposta mais recente
    setResposta((prevResposta) => {
      const visible = getVisibleQuestions(prevResposta);
      const idxInVisible = currentQuestion
        ? visible.findIndex((q) => q.id === currentQuestion.id)
        : -1;
      const nextIdx = idxInVisible + 1;

      if (nextIdx >= visible.length) {
        // Última pergunta — submit
        void submitFinal(prevResposta);
      } else {
        setCurrentIndex(nextIdx);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      return prevResposta;
    });
  }, [currentQuestion, submitFinal]);

  const handleBack = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const totalPerguntas = visibleQuestions.length;
  const perguntaAtualNum = currentIndex + 1;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-bege-fundo via-background to-bege-fundo/40 flex flex-col">
      {/* Topo: barra de progresso (apenas durante perguntas) */}
      <header className={cn('w-full px-4 md:px-8', HEADER_HEIGHT)}>
        <div className="max-w-2xl mx-auto">
          {stage === 'question' && currentQuestion && (
            <PesquisaProgress
              current={perguntaAtualNum}
              total={totalPerguntas}
            />
          )}
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 w-full flex items-start justify-center px-4 md:px-8 py-8 md:py-12">
        <div className="w-full max-w-2xl">
          {stage === 'welcome' && (
            <PesquisaWelcomeScreen onStart={handleStart} />
          )}

          {stage === 'question' && currentQuestion && (
            <PesquisaQuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              resposta={resposta}
              onUpdate={handleUpdate}
              onAdvance={handleAdvance}
              onBack={handleBack}
              canGoBack={currentIndex > 0}
            />
          )}

          {stage === 'submitting' && (
            <div className="w-full flex flex-col items-center text-center gap-5 py-20">
              <div className="w-12 h-12 rounded-full border-4 border-azul-respira border-t-transparent animate-spin" />
              <p className="text-lg text-muted-foreground">
                Enviando suas respostas com carinho...
              </p>
            </div>
          )}

          {stage === 'done' && <PesquisaSuccessScreen />}
        </div>
      </main>

      {/* Rodapé minimal */}
      <footer className="w-full py-4 px-4 text-center">
        <p className="text-xs text-muted-foreground/70">
          Respira Kids · Pesquisa anônima
        </p>
      </footer>
    </div>
  );
};

export default PesquisaExperienciaPage;
