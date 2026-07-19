// AI dev note: Página pública do Processo Seletivo de Estagiários.
// Rota: #/vaga-estagio (sem autenticação).
// Fluxo: welcome -> dados -> [situacional (6) -> estilo (5) -> escrita (2)] -> fim.
// A correção do situacional é feita no servidor (o gabarito não vai pro cliente).
// Progresso persistido em sessionStorage (rk-vaga-estagio-draft): refresh/aba
// descartada não perde as 13 telas. Limpo após envio com sucesso.

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
  QuestionOption,
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

// =====================================================
// Persistência do rascunho (proteção contra perda de trabalho)
// =====================================================
// AI dev note: sessionStorage (NUNCA localStorage — o rascunho tem PII:
// CPF/endereço, deve morrer com a aba). A ordem embaralhada das alternativas
// do situacional também é persistida: sem isso, a restauração re-embaralhava
// (key + shuffle por montagem) e trocava as posições das respostas já dadas.
const DRAFT_STORAGE_KEY = 'rk-vaga-estagio-draft';

type DraftStage = Extract<Stage, 'welcome' | 'dados' | 'perguntas'>;

interface EstagioDraft {
  stage: DraftStage;
  stepIndex: number;
  candidato: CandidatoDados;
  situacional: SituacionalRespostas;
  estilo: EstiloRespostas;
  escrita: EscritaRespostas;
  /** Ordem de exibição das alternativas por pergunta situacional (values). */
  situacionalOrder: Record<string, string[]>;
  savedAt: string;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Gera a ordem embaralhada por pergunta situacional, reaproveitando a ordem
 * salva quando ela for uma permutação válida das alternativas atuais.
 */
function buildSituacionalOrder(existing?: unknown): Record<string, string[]> {
  const saved =
    existing && typeof existing === 'object'
      ? (existing as Record<string, unknown>)
      : {};
  const order: Record<string, string[]> = {};
  for (const q of SITUACIONAL_QUESTIONS) {
    const values = q.options.map((o) => o.value);
    const savedOrder = saved[q.id];
    const isValidPermutation =
      Array.isArray(savedOrder) &&
      savedOrder.length === values.length &&
      values.every((v) => savedOrder.includes(v));
    order[q.id] = isValidPermutation
      ? (savedOrder as string[])
      : shuffleArray(values);
  }
  return order;
}

function loadEstagioDraft(): EstagioDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<EstagioDraft> | null;
    // Validação mínima de shape antes de reidratar
    if (!p || typeof p !== 'object') return null;
    if (p.stage !== 'welcome' && p.stage !== 'dados' && p.stage !== 'perguntas')
      return null;
    if (
      typeof p.stepIndex !== 'number' ||
      p.stepIndex < 0 ||
      p.stepIndex >= STEPS.length
    )
      return null;
    if (!p.candidato || typeof p.candidato !== 'object') return null;
    return {
      stage: p.stage,
      stepIndex: p.stepIndex,
      candidato: p.candidato as CandidatoDados,
      situacional: (p.situacional && typeof p.situacional === 'object'
        ? p.situacional
        : {}) as SituacionalRespostas,
      estilo: (p.estilo && typeof p.estilo === 'object'
        ? p.estilo
        : {}) as EstiloRespostas,
      escrita: (p.escrita && typeof p.escrita === 'object'
        ? p.escrita
        : {}) as EscritaRespostas,
      situacionalOrder: buildSituacionalOrder(p.situacionalOrder),
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    // Rascunho corrompido/indisponível: começa do zero (sem logar conteúdo)
    return null;
  }
}

function clearEstagioDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // sessionStorage indisponível: nada a limpar
  }
}

export const ProcessoSeletivoPage: React.FC = () => {
  const { toast } = useToast();
  // Reidrata rascunho salvo (se houver) — inicializador lazy roda 1x no mount
  const [draft] = useState<EstagioDraft | null>(loadEstagioDraft);
  const [stage, setStage] = useState<Stage>(draft?.stage ?? 'welcome');
  const [stepIndex, setStepIndex] = useState(draft?.stepIndex ?? 0);

  const [candidato, setCandidato] = useState<CandidatoDados>(
    draft?.candidato ?? {
      nome: '',
      email: '',
    }
  );
  const [situacional, setSituacional] = useState<SituacionalRespostas>(
    draft?.situacional ?? {}
  );
  const [estilo, setEstilo] = useState<EstiloRespostas>(draft?.estilo ?? {});
  const [escrita, setEscrita] = useState<EscritaRespostas>(
    draft?.escrita ?? {}
  );
  // Ordem embaralhada das alternativas do situacional — gerada 1x e persistida,
  // para a restauração não trocar as posições (a página passa as options já
  // ordenadas ao EstagioChoiceQuestion, sem o prop shuffle).
  const [situacionalOrder] = useState<Record<string, string[]>>(
    () => draft?.situacionalOrder ?? buildSituacionalOrder()
  );

  // Ref espelha o estado mais recente (evita closure obsoleta no auto-avanço).
  const respostasRef = useRef({ candidato, situacional, estilo, escrita });
  useEffect(() => {
    respostasRef.current = { candidato, situacional, estilo, escrita };
  }, [candidato, situacional, estilo, escrita]);

  // AI dev note: Autosave com debounce (padrão EvolutionFormModal). Não salva
  // em 'welcome' (nada a perder) nem em 'submitting'/'done' — durante o envio o
  // último rascunho fica preservado; se falhar e a página recarregar, o
  // candidato volta para a última pergunta.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (stage !== 'dados' && stage !== 'perguntas') return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        const data: EstagioDraft = {
          stage,
          stepIndex,
          candidato,
          situacional,
          estilo,
          escrita,
          situacionalOrder,
          savedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Quota/indisponibilidade: segue sem persistir (nunca logar os dados)
      }
    }, 800);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [
    stage,
    stepIndex,
    candidato,
    situacional,
    estilo,
    escrita,
    situacionalOrder,
  ]);

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
      // Envio confirmado: limpar o rascunho salvo
      clearEstagioDraft();
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

  // Alternativas do situacional na ordem embaralhada persistida (estável
  // entre remontagens e após restauração do rascunho).
  const orderedSituacionalOptions = useCallback(
    (q: SituacionalQuestion): QuestionOption[] => {
      const order = situacionalOrder[q.id];
      if (!order) return q.options;
      const byValue = new Map(q.options.map((o) => [o.value, o]));
      const ordered = order
        .map((v) => byValue.get(v))
        .filter((o): o is QuestionOption => !!o);
      return ordered.length === q.options.length ? ordered : q.options;
    },
    [situacionalOrder]
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

          {/* AI dev note: options já vêm embaralhadas pela página (ordem
              persistida no rascunho) — por isso NÃO usa o prop shuffle, que
              re-embaralharia a cada montagem e trocaria as posições. */}
          {stage === 'perguntas' && currentStep?.kind === 'situacional' && (
            <EstagioChoiceQuestion
              key={currentStep.q.id}
              kicker="Como você agiria?"
              enunciado={currentStep.q.enunciado}
              options={orderedSituacionalOptions(currentStep.q)}
              value={situacional[currentStep.q.id]}
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
