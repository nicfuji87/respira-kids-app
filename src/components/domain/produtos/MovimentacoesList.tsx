// AI dev note: Histórico de movimentações de estoque (compartilhável). Quantidade é
// delta com sinal: verde quando entra, vermelho quando sai.

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { PackageOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIPO_MOVIMENTO_LABELS, type EstoqueMovimento } from '@/types/produtos';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const MovimentacoesList: React.FC<{
  movimentos: EstoqueMovimento[];
}> = ({ movimentos }) => {
  if (movimentos.length === 0) {
    return (
      <Card className="bg-bege-fundo/30 border-azul-respira/20">
        <CardContent className="p-8 text-center space-y-2">
          <PackageOpen className="w-10 h-10 text-azul-respira mx-auto" />
          <p className="text-sm text-muted-foreground">
            Nenhuma movimentação de estoque ainda.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {movimentos.map((m) => {
        const positivo = m.quantidade > 0;
        return (
          <div
            key={m.id}
            className="rounded-lg border border-border/60 bg-card p-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {m.produto?.nome ?? 'Produto'}
              </p>
              <p className="text-xs text-muted-foreground">
                {TIPO_MOVIMENTO_LABELS[m.tipo]}
                {m.motivo ? ` · ${m.motivo}` : ''} ·{' '}
                {formatDateTime(m.created_at)}
              </p>
            </div>
            <span
              className={cn(
                'text-sm font-bold shrink-0',
                positivo ? 'text-verde-pipa' : 'text-vermelho-kids'
              )}
            >
              {positivo ? '+' : ''}
              {m.quantidade}
            </span>
          </div>
        );
      })}
    </div>
  );
};
