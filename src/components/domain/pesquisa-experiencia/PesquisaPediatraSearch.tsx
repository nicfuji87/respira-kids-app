// AI dev note: Busca de pediatra para a pesquisa.
// - Lista pediatras ativos (RLS já permite anon SELECT em pessoa_pediatra ativos).
// - Auto-completa por nome (normalizado, sem acentos).
// - Opção "Outro" para a respondente digitar nome livre.
// - Avanço automático ao clicar em um pediatra (single-choice behavior).

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, UserCircle2, X } from 'lucide-react';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import { cn, normalizeText } from '@/lib/utils';
import { fetchPediatras, type Pediatra } from '@/lib/pediatra-api';

interface PesquisaPediatraSearchProps {
  /** ID atual do pediatra selecionado (uuid). */
  pediatraId?: string;
  /** Nome livre quando "Outro". */
  pediatraNomeOutro?: string;
  /** Atualiza a resposta no estado pai. */
  onChange: (next: { pediatraId?: string; pediatraNomeOutro?: string }) => void;
  /** Avança para a próxima pergunta. */
  onContinue: () => void;
}

const SENTINEL_OUTRO = '__outro__';

export const PesquisaPediatraSearch = React.memo<PesquisaPediatraSearchProps>(
  ({ pediatraId, pediatraNomeOutro, onChange, onContinue }) => {
    const [search, setSearch] = useState('');
    const [pediatras, setPediatras] = useState<Pediatra[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Modo "Outro" — usuária está digitando nome livre
    const isOutroMode =
      pediatraId === SENTINEL_OUTRO || (!!pediatraNomeOutro && !pediatraId);

    useEffect(() => {
      let alive = true;
      setLoading(true);
      fetchPediatras()
        .then((list) => {
          if (!alive) return;
          setPediatras(list);
        })
        .catch((err) => {
          console.error('[PesquisaPediatraSearch] erro:', err);
          if (alive) setError('Não foi possível carregar a lista.');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });

      return () => {
        alive = false;
      };
    }, []);

    // Lista filtrada
    const filtered = useMemo(() => {
      if (!search.trim()) {
        return pediatras.slice(0, 30);
      }
      const cleaned = search.trim().replace(/^(dr\.?|dra\.?)\s*/i, '');
      const term = normalizeText(cleaned);
      return pediatras
        .filter((p) => normalizeText(p.nome).includes(term))
        .slice(0, 30);
    }, [pediatras, search]);

    const handleSelectPediatra = useCallback(
      (pediatra: Pediatra) => {
        if (pendingId) return;
        setPendingId(pediatra.id);
        onChange({ pediatraId: pediatra.id, pediatraNomeOutro: undefined });
        window.setTimeout(() => onContinue(), 380);
      },
      [pendingId, onChange, onContinue]
    );

    const handleEscolherOutro = useCallback(() => {
      onChange({
        pediatraId: SENTINEL_OUTRO,
        pediatraNomeOutro: pediatraNomeOutro ?? '',
      });
      // Foco no input após render
      setTimeout(() => inputRef.current?.focus(), 50);
    }, [onChange, pediatraNomeOutro]);

    const handleVoltar = useCallback(() => {
      onChange({ pediatraId: undefined, pediatraNomeOutro: undefined });
      setSearch('');
    }, [onChange]);

    const handleConfirmarOutro = useCallback(() => {
      const trimmed = (pediatraNomeOutro || '').trim();
      // Em modo outro: salvar nome livre (limpando pediatra_id sentinela) e avançar
      onChange({
        pediatraId: undefined,
        pediatraNomeOutro: trimmed.length > 0 ? trimmed : undefined,
      });
      onContinue();
    }, [pediatraNomeOutro, onChange, onContinue]);

    // ============================================================
    // Modo "Outro": input livre
    // ============================================================
    if (isOutroMode) {
      return (
        <div className="w-full flex flex-col gap-4">
          <button
            type="button"
            onClick={handleVoltar}
            className="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
            Escolher pediatra da lista
          </button>
          <Input
            ref={inputRef}
            value={pediatraNomeOutro || ''}
            onChange={(e) =>
              onChange({
                pediatraId: SENTINEL_OUTRO,
                pediatraNomeOutro: e.target.value.slice(0, 200),
              })
            }
            placeholder="Nome do(a) pediatra"
            className="h-14 text-base md:text-lg px-4 rounded-2xl border-2 border-border/60 focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/40"
            autoFocus
          />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                onChange({
                  pediatraId: undefined,
                  pediatraNomeOutro: undefined,
                });
                onContinue();
              }}
              className="w-full sm:w-auto text-muted-foreground"
            >
              Prefiro não dizer
            </Button>
            <Button
              size="lg"
              onClick={handleConfirmarOutro}
              className="w-full sm:w-auto min-w-[180px] h-12 rounded-full"
            >
              Continuar
            </Button>
          </div>
        </div>
      );
    }

    // ============================================================
    // Modo busca + lista
    // ============================================================
    return (
      <div className="w-full flex flex-col gap-4">
        {/* Campo de busca */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome do(a) pediatra..."
            className="h-14 pl-12 text-base md:text-lg rounded-2xl border-2 border-border/60 focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/40"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        {/* Lista de pediatras */}
        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Carregando lista...
            </p>
          )}

          {!loading && filtered.length === 0 && search.trim().length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum pediatra encontrado para "{search}".
            </p>
          )}

          {!loading &&
            filtered.map((p) => {
              const isSelected = (pendingId ?? pediatraId) === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPediatra(p)}
                  disabled={pendingId !== null && pendingId !== p.id}
                  className={cn(
                    'group w-full text-left',
                    'flex items-center gap-3 px-4 py-3',
                    'rounded-xl border-2 bg-card',
                    'transition-all duration-300 ease-out',
                    'hover:border-azul-respira/60 hover:shadow-sm',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-azul-respira/60',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isSelected
                      ? 'border-azul-respira bg-azul-respira/10'
                      : 'border-border/60'
                  )}
                >
                  <UserCircle2
                    className={cn(
                      'w-6 h-6 shrink-0',
                      isSelected ? 'text-azul-respira' : 'text-muted-foreground'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'font-medium text-base truncate',
                        isSelected ? 'text-roxo-titulo' : 'text-foreground'
                      )}
                    >
                      {p.nome}
                    </p>
                    {(p.crm || p.especialidade) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[p.crm, p.especialidade].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-300',
                      isSelected
                        ? 'border-azul-respira bg-azul-respira'
                        : 'border-muted-foreground/30 group-hover:border-azul-respira/50'
                    )}
                  >
                    {isSelected && (
                      <span className="block w-full h-full rounded-full bg-azul-respira animate-in zoom-in duration-200" />
                    )}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Botão "Outro / Não está na lista" */}
        <button
          type="button"
          onClick={handleEscolherOutro}
          className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-azul-respira/40 bg-azul-respira/5 hover:bg-azul-respira/10 transition-colors"
        >
          <div className="flex-1">
            <p className="font-medium text-foreground">Outro</p>
            <p className="text-xs text-muted-foreground">
              Não encontrei o pediatra na lista — quero digitar o nome
            </p>
          </div>
        </button>

        {/* Pular */}
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ pediatraId: undefined, pediatraNomeOutro: undefined });
              onContinue();
            }}
            className="text-muted-foreground"
          >
            Prefiro não dizer
          </Button>
        </div>
      </div>
    );
  }
);

PesquisaPediatraSearch.displayName = 'PesquisaPediatraSearch';
