// AI dev note: Lista de comentários abertos (campos texto) com paginação simples.

import React, { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PesquisaExperienciaRow } from '@/types/pesquisa-experiencia';
import { formatDateTimeBR } from '@/lib/utils';

interface PesquisaComentariosListProps {
  rows: PesquisaExperienciaRow[];
  field: 'o_que_mais_ama' | 'o_que_melhorar';
  title: string;
  emptyLabel?: string;
  className?: string;
  /** Cor do destaque lateral. */
  accent?: 'verde' | 'amarelo';
}

const ACCENT_MAP = {
  verde: 'border-l-verde-pipa',
  amarelo: 'border-l-amarelo-pipa',
};

const INITIAL_LIMIT = 5;

export const PesquisaComentariosList = React.memo<PesquisaComentariosListProps>(
  ({
    rows,
    field,
    title,
    emptyLabel = 'Ainda sem comentários',
    className,
    accent = 'verde',
  }) => {
    const [expanded, setExpanded] = useState(false);

    const comentarios = useMemo(() => {
      return rows
        .map((r) => ({
          id: r.id,
          texto: (r[field] || '').trim(),
          created_at: r.created_at,
        }))
        .filter((c) => c.texto.length > 0);
    }, [rows, field]);

    const visible = expanded
      ? comentarios
      : comentarios.slice(0, INITIAL_LIMIT);
    const hasMore = comentarios.length > INITIAL_LIMIT;

    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
            {title}
            <span className="text-sm font-normal text-muted-foreground">
              ({comentarios.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {comentarios.length === 0 ? (
            <p className="text-sm text-muted-foreground/80 py-4 text-center">
              {emptyLabel}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {visible.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      'rounded-lg bg-muted/40 px-4 py-3 border-l-4',
                      ACCENT_MAP[accent]
                    )}
                  >
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      “{c.texto}”
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                      {formatDateTimeBR(c.created_at)}
                    </p>
                  </li>
                ))}
              </ul>

              {hasMore && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-muted-foreground"
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-1" />
                        Mostrar menos
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-1" />
                        Ver todos ({comentarios.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }
);

PesquisaComentariosList.displayName = 'PesquisaComentariosList';
