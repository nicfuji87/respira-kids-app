// AI dev note: Card de uma pergunta do levantamento.
// Autosave com debounce de 800ms — não existe botão "salvar", porque o
// preenchimento acontece andando pela clínica e perder resposta é inaceitável.
// O Textarea é o primitivo (IME-safe) — obrigatório, o preenchimento é no
// tablet Samsung, onde textarea cru come acento.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Textarea } from '@/components/primitives/textarea';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Camera,
  Check,
  HelpCircle,
  Loader2,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import type { LevantamentoPergunta } from '@/lib/qualidade-levantamento-questions';
import type {
  LevantamentoAnexo,
  LevantamentoRespostaRow,
} from '@/types/qualidade';

const DEBOUNCE_MS = 800;

export interface LevantamentoPerguntaCardProps {
  pergunta: LevantamentoPergunta;
  bloco: string;
  resposta?: LevantamentoRespostaRow;
  onSalvar: (input: {
    perguntaId: string;
    bloco: string;
    resposta?: string | null;
    naoSei?: boolean;
    naoAplica?: boolean;
    anexos?: LevantamentoAnexo[];
  }) => Promise<void>;
  onUpload: (perguntaId: string, file: File) => Promise<LevantamentoAnexo>;
  onRemoverAnexo: (
    perguntaId: string,
    anexo: LevantamentoAnexo
  ) => Promise<void>;
}

export const LevantamentoPerguntaCard: React.FC<
  LevantamentoPerguntaCardProps
> = ({ pergunta, bloco, resposta, onSalvar, onUpload, onRemoverAnexo }) => {
  const [texto, setTexto] = useState(resposta?.resposta ?? '');
  const [naoSei, setNaoSei] = useState(resposta?.nao_sei ?? false);
  const [naoAplica, setNaoAplica] = useState(resposta?.nao_aplica ?? false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const anexos = useMemo(() => resposta?.anexos ?? [], [resposta?.anexos]);

  // Sincroniza quando a carga inicial chega depois da montagem
  useEffect(() => {
    if (resposta) {
      setTexto(resposta.resposta ?? '');
      setNaoSei(resposta.nao_sei);
      setNaoAplica(resposta.nao_aplica);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resposta?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const persistir = useCallback(
    async (patch: {
      resposta?: string | null;
      naoSei?: boolean;
      naoAplica?: boolean;
    }) => {
      setSalvando(true);
      setSalvo(false);
      try {
        await onSalvar({
          perguntaId: pergunta.id,
          bloco,
          resposta: patch.resposta ?? texto,
          naoSei: patch.naoSei ?? naoSei,
          naoAplica: patch.naoAplica ?? naoAplica,
          anexos,
        });
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      } finally {
        setSalvando(false);
      }
    },
    [onSalvar, pergunta.id, bloco, texto, naoSei, naoAplica, anexos]
  );

  const handleTexto = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setTexto(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void persistir({ resposta: v });
      }, DEBOUNCE_MS);
    },
    [persistir]
  );

  const toggleNaoSei = useCallback(() => {
    const next = !naoSei;
    setNaoSei(next);
    if (next) setNaoAplica(false);
    void persistir({ naoSei: next, naoAplica: next ? false : naoAplica });
  }, [naoSei, naoAplica, persistir]);

  const toggleNaoAplica = useCallback(() => {
    const next = !naoAplica;
    setNaoAplica(next);
    if (next) setNaoSei(false);
    void persistir({ naoAplica: next, naoSei: next ? false : naoSei });
  }, [naoAplica, naoSei, persistir]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      setEnviandoFoto(true);
      try {
        for (const f of files) {
          await onUpload(pergunta.id, f);
        }
      } finally {
        setEnviandoFoto(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [onUpload, pergunta.id]
  );

  const respondida =
    naoAplica || naoSei || texto.trim().length > 0 || anexos.length > 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3 transition-colors',
        respondida
          ? 'border-verde-pipa/50 bg-verde-pipa/5'
          : pergunta.critica
            ? 'border-vermelho-kids/30 bg-vermelho-kids/5'
            : 'border-border/60 bg-card'
      )}
    >
      {/* Enunciado */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'shrink-0 text-xs font-bold px-2 py-1 rounded-md',
            respondida
              ? 'bg-verde-pipa/40 text-roxo-titulo'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {pergunta.id}
        </span>

        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground leading-snug">
            {pergunta.texto}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {pergunta.critica && (
              <Badge
                variant="outline"
                className="border-vermelho-kids/40 text-vermelho-kids gap-1 text-xs"
              >
                <AlertTriangle className="w-3 h-3" />
                Trava o POP
              </Badge>
            )}
            {pergunta.rt && (
              <Badge
                variant="outline"
                className="border-roxo-titulo/40 text-roxo-titulo gap-1 text-xs"
              >
                <Stethoscope className="w-3 h-3" />
                Decisão da RT
              </Badge>
            )}
            {pergunta.aceitaFoto && (
              <Badge
                variant="outline"
                className="border-azul-respira/40 text-azul-respira gap-1 text-xs"
              >
                <Camera className="w-3 h-3" />
                Foto ajuda
              </Badge>
            )}
          </div>

          {pergunta.ajuda && (
            <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-0.5">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{pergunta.ajuda}</span>
            </p>
          )}

          {pergunta.jaRespondida && (
            <p className="text-xs text-roxo-titulo bg-roxo-titulo/5 border border-roxo-titulo/20 rounded-md px-2 py-1.5 leading-relaxed">
              <span className="font-semibold">Você já disse: </span>
              {pergunta.jaRespondida}
            </p>
          )}
        </div>

        {/* Indicador de salvamento */}
        <div className="shrink-0 w-5 pt-1">
          {salvando && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {!salvando && salvo && <Check className="w-4 h-4 text-verde-pipa" />}
        </div>
      </div>

      {/* Resposta */}
      {!naoAplica && !naoSei && (
        <Textarea
          value={texto}
          onChange={handleTexto}
          placeholder="Responda aqui…"
          className={cn(
            'resize-y',
            pergunta.longo ? 'min-h-[120px]' : 'min-h-[70px]'
          )}
        />
      )}

      {/* Anexos */}
      {anexos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {anexos.map((a) => (
            <div
              key={a.path}
              className="relative group rounded-lg overflow-hidden border border-border/60 w-24 h-24"
            >
              <img
                src={a.url}
                alt={a.nome}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => void onRemoverAnexo(pergunta.id, a)}
                className="absolute top-1 right-1 bg-background/90 rounded-md p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Remover ${a.nome}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={enviandoFoto}
          className="gap-1.5 text-xs h-8"
        >
          {enviandoFoto ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
          Foto
        </Button>

        <Button
          type="button"
          variant={naoSei ? 'default' : 'outline'}
          size="sm"
          onClick={toggleNaoSei}
          className="gap-1.5 text-xs h-8"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Não sei
        </Button>

        <Button
          type="button"
          variant={naoAplica ? 'default' : 'outline'}
          size="sm"
          onClick={toggleNaoAplica}
          className="gap-1.5 text-xs h-8"
        >
          <X className="w-3.5 h-3.5" />
          Não se aplica
        </Button>
      </div>

      {naoSei && (
        <p className="text-xs text-muted-foreground italic">
          Vai entrar como pendência explícita no documento — melhor que
          preencher por suposição.
        </p>
      )}
    </div>
  );
};

export default LevantamentoPerguntaCard;
