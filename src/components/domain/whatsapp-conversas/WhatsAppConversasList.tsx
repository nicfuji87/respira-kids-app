// AI dev note: Lista paginada de conversas (cards) com "carregar mais".
// Reutilizada na aba Conversas, fila de follow-up e lista de reclamações.

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Inbox } from 'lucide-react';
import { WhatsAppConversaCard } from './WhatsAppConversaCard';
import type { WhatsAppConversaRow } from '@/types/whatsapp-conversas';

interface WhatsAppConversasListProps {
  rows: WhatsAppConversaRow[];
  emptyMessage?: string;
  pageSize?: number;
  busyId?: string | null;
  onConcluir?: (row: WhatsAppConversaRow) => void;
  onIgnorar?: (row: WhatsAppConversaRow) => void;
  onReabrir?: (row: WhatsAppConversaRow) => void;
}

export const WhatsAppConversasList = React.memo<WhatsAppConversasListProps>(
  ({
    rows,
    emptyMessage = 'Nenhuma conversa encontrada.',
    pageSize = 12,
    busyId,
    onConcluir,
    onIgnorar,
    onReabrir,
  }) => {
    const [visible, setVisible] = useState(pageSize);

    // Reseta paginação quando a lista muda (ex.: ao aplicar filtros)
    useEffect(() => {
      setVisible(pageSize);
    }, [rows, pageSize]);

    if (rows.length === 0) {
      return (
        <Card className="bg-bege-fundo/30 border-azul-respira/20">
          <CardContent className="p-8 text-center space-y-2">
            <Inbox className="w-10 h-10 text-azul-respira mx-auto" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      );
    }

    const shown = rows.slice(0, visible);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {shown.map((row) => (
            <WhatsAppConversaCard
              key={row.id}
              row={row}
              busy={busyId === row.id}
              onConcluir={onConcluir}
              onIgnorar={onIgnorar}
              onReabrir={onReabrir}
            />
          ))}
        </div>

        {visible < rows.length && (
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisible((v) => v + pageSize)}
            >
              Carregar mais ({rows.length - visible} restantes)
            </Button>
          </div>
        )}
      </div>
    );
  }
);

WhatsAppConversasList.displayName = 'WhatsAppConversasList';
