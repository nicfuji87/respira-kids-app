// AI dev note: Recados entre turnos que as estagiárias deixaram na saída (celular
// ou quiosque), dos últimos 7 dias, com quem já leu. Só leitura — a equipe
// acompanha o que está sendo passado de um turno para o outro.

import React, { useEffect, useState } from 'react';
import { MessageSquareText, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import {
  fetchRecadosRecentes,
  type RecadoRecente,
} from '@/lib/estagio-celular-api';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const RecadosTurnoCard: React.FC = () => {
  const [recados, setRecados] = useState<RecadoRecente[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetchRecadosRecentes(7)
      .then(setRecados)
      .catch(() => setRecados([]));
  }, []);

  if (recados.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquareText className="w-4 h-4 text-azul-respira shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Recados entre turnos (7 dias)
          </span>
          <Badge variant="secondary">{recados.length}</Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/60 divide-y divide-border/60">
          {recados.map((r) => (
            <div key={r.id} className="p-3 space-y-1">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {r.texto}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.autor.split(' ')[0]}, {dataHora(r.created_at)}
                {' · '}
                {r.lido_por.length
                  ? `lido por ${r.lido_por.map((l) => l.nome).join(', ')}`
                  : 'ainda não lido'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

RecadosTurnoCard.displayName = 'RecadosTurnoCard';
