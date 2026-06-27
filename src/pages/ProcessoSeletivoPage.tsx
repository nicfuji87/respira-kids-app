// AI dev note: Página pública do Processo Seletivo de Estagiários.
// Rota: #/vaga-estagio (sem autenticação).
// Fluxo: welcome -> dados -> [situacional (6) -> estilo (5) -> escrita (2)] -> fim.
// A correção do situacional é feita no servidor (o gabarito não vai pro cliente).

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useToast } from '@/components/primitives/use-toast';
import {
  EstagioWelcomeScreen,
  EstagioProgress,
  EstagioDadosForm,
  EstagioChoiceQuestion,
  EstagioTextQuestion,
  EstagioSuccessScreen,
} from '@/components/domain/processo-seletivo';
import {
  SITUACIONAL_QUESTIONS,
  ESTILO_QUESTIONS,
  ESCRITA_QUESTIONS,
} from '@/lib/processo-seletivo-questions';
import { submitCandidaturaEstagio } from '@/lib/processo-seletivo-api';
import type {
  CandidatoDados,
  EscritaQuestion,
  EscritaRespostas,
  EstiloQuestion,
  EstiloRespostas,
  SituacionalQuestion,
  SituacionalRespostas,
} from '@/types/processo-seletivo';

type Stage = 'welcome' | 'dados' | 'perguntas' | 'submitting' | 'done';

type Step =
  | { kind: 'situacional'; q: SituacionalQuestion; idx: number; total: number }
  | { kind: 'estilo'; q: EstiloQuestion }
  | { kind: 'escrita'; q: EscritaQuestion };

// Ordem do teste: cenários -> estilo (rápido) -> escrita (reflexivo, fecha o teste)
const STEPS: Step[] = [
  ...SITUACIONAL_QUESTIONS.map((q, i) => ({
    kind: 'situacional' as const,
    q,
    idx: i + 1,
    total: SITUACIONAL_QUESTIONS.length,
  })),
  ...ESTILO_QUESTIONS.map((q) => ({ kind: 'estilo' as const, q })),
  ...ESCRITA_QUESTIONS.map((q) => ({ kind: 'escrita' as const, q })),
];

export const ProcessoSeletivoPage: React.FC = () => {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('welcome');
  const [stepIndex, setStepIndex] = useState(0);

  const [candidato, setCandidato] = useState<CandidatoDados>({
    nome: '',
    email: '',
  });
  const [situacional, setSituacional] = useState<SituacionalRespostas>({});
  const [estilo, setEstilo] = useState<EstiloRespostas>({});
  const [escrita, setEscrita] = useState<EscritaRespostas>({});

  // Ref espelha o estado mais recente (evita closure obsoleta no auto-avanço).
  const respostasRef = useRef({ candidato, situacional, estilo, escrita });
  useEffect(() => {
    respostasRef.current = { candidato, situacional, estilo, escrita };
  }, [candidato, situacional, estilo, escrita]);

  const currentStep = STEPS[stepIndex];

  const submitFinal = useCallback(async () => {
    setStage('submitting');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const { candidato, situacional, estilo, escrita } = respostasRef.current;
      await submitCandidaturaEstagio({
        candidato,
        situacional,
        escrita,
        estilo,
      });
      setStage('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('[ProcessoSeletivo] erro ao enviar:', error);
      toast({
        title: 'Não conseguimos enviar sua candidatura',
        description: 'Verifique sua conexão e tente novamente em instantes.',
        variant: 'destructive',
      });
      setStage('perguntas');
    }
  }, [toast]);

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= STEPS.length) {
        void submitFinal();
        return prev;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return next;
    });
  }, [submitFinal]);

  const goBack = useCallback(() => {
    setStepIndex((prev) => {
      if (prev === 0) {
        setStage('dados');
        return 0;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return prev - 1;
    });
  }, []);

  const handleDadosChange = useCallback((patch: Partial<CandidatoDados>) => {
    setCandidato((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSituacionalSelect = useCallback((id: string, value: string) => {
    setSituacional((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleEstiloSelect = useCallback((id: string, value: string) => {
    setEstilo((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleEscritaChange = useCallback(
    (id: keyof EscritaRespostas, value: string) => {
      setEscrita((prev) => ({ ...prev, [id]: value }));
    },
    []
  );

  const progressLabel = useMemo(() => {
    if (!currentStep) return '';
    if (currentStep.kind === 'situacional') {
      return `Situação ${currentStep.idx} de ${currentStep.total}`;
    }
    if (currentStep.kind === 'estilo') return 'Sobre você';
    return 'Para finalizar';
  }, [currentStep]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-bege-fundo via-background to-bege-fundo/40 flex flex-col">
      <header className="w-full px-4 md:px-8 pt-6">
        <div className="max-w-2xl mx-auto">
          {stage === 'perguntas' && currentStep && (
            <EstagioProgress
              current={stepIndex + 1}
              total={STEPS.length}
              label={progressLabel}
            />
          )}
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col px-4 md:px-8 py-6 md:py-12">
        <div className="w-full max-w-2xl mx-auto my-auto">
          {stage === 'welcome' && (
            <EstagioWelcomeScreen onStart={() => setStage('dados')} />
          )}

          {stage === 'dados' && (
            <EstagioDadosForm
              value={candidato}
              onChange={handleDadosChange}
              onContinue={() => {
                setStepIndex(0);
                setStage('perguntas');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {stage === 'perguntas' && currentStep?.kind === 'situacional' && (
            <EstagioChoiceQuestion
              key={currentStep.q.id}
              kicker="Como você agiria?"
              enunciado={currentStep.q.enunciado}
              options={currentStep.q.options}
              value={situacional[currentStep.q.id]}
              shuffle
              onSelect={(v) => handleSituacionalSelect(currentStep.q.id, v)}
              onComplete={goNext}
              onBack={goBack}
              canGoBack
            />
          )}

          {stage === 'perguntas' && currentStep?.kind === 'estilo' && (
            <EstagioChoiceQuestion
              key={currentStep.q.id}
              enunciado={currentStep.q.pergunta}
              options={currentStep.q.options}
              value={estilo[currentStep.q.id]}
              onSelect={(v) => handleEstiloSelect(currentStep.q.id, v)}
              onComplete={goNext}
              onBack={goBack}
              canGoBack
            />
          )}

          {stage === 'perguntas' && currentStep?.kind === 'escrita' && (
            <EstagioTextQuestion
              key={currentStep.q.id}
              kicker="Conte com suas palavras"
              titulo={currentStep.q.titulo}
              subtitulo={currentStep.q.subtitulo}
              placeholder={currentStep.q.placeholder}
              minChars={currentStep.q.minChars}
              maxChars={currentStep.q.maxChars}
              value={escrita[currentStep.q.id]}
              isLast={stepIndex === STEPS.length - 1}
              onChange={(v) => handleEscritaChange(currentStep.q.id, v)}
              onContinue={goNext}
              onBack={goBack}
              canGoBack
            />
          )}

          {stage === 'submitting' && (
            <div className="w-full flex flex-col items-center text-center gap-5 py-20">
              <div className="w-12 h-12 rounded-full border-4 border-azul-respira border-t-transparent animate-spin" />
              <p className="text-lg text-muted-foreground">
                Enviando sua candidatura...
              </p>
            </div>
          )}

          {stage === 'done' && <EstagioSuccessScreen />}
        </div>
      </main>

      <footer className="w-full py-4 px-4 text-center">
        <p className="text-xs text-muted-foreground/70">
          Respira Kids · Processo seletivo
        </p>
      </footer>
    </div>
  );
};

export default ProcessoSeletivoPage;
