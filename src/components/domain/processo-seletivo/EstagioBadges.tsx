// AI dev note: Badges compartilhados do painel de processo seletivo.
// StatusBadge (estado da avaliação humana) + RecomendacaoBadge (sugestão automática).

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/processo-seletivo-questions';
import type {
  Recomendacao,
  StatusCandidatura,
} from '@/types/processo-seletivo';

const STATUS_CLASSES: Record<StatusCandidatura, string> = {
  a_avaliar: 'bg-muted text-muted-foreground',
  entrevista: 'bg-azul-respira/15 text-azul-respira',
  aprovado: 'bg-verde-pipa/30 text-roxo-titulo',
  descartado: 'bg-vermelho-kids/15 text-vermelho-kids',
};

export const StatusBadge = React.memo<{ status: StatusCandidatura }>(
  ({ status }) => (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap',
        STATUS_CLASSES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
);
StatusBadge.displayName = 'StatusBadge';

const RECOMENDACAO_CLASSES: Record<Recomendacao['tone'], string> = {
  forte: 'bg-verde-pipa/30 text-roxo-titulo',
  mediano: 'bg-amarelo-pipa/25 text-roxo-titulo',
  fraco: 'bg-muted text-muted-foreground',
  alerta: 'bg-vermelho-kids/20 text-vermelho-kids',
};

export const RecomendacaoBadge = React.memo<{ recomendacao: Recomendacao }>(
  ({ recomendacao }) => (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap',
        RECOMENDACAO_CLASSES[recomendacao.tone]
      )}
    >
      {recomendacao.tone === 'alerta' && (
        <AlertTriangle className="w-3.5 h-3.5" />
      )}
      {recomendacao.label}
    </span>
  )
);
RecomendacaoBadge.displayName = 'RecomendacaoBadge';
