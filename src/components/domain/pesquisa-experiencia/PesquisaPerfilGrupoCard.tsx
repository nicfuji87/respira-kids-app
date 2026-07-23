// AI dev note: Card de perfil de um grupo (Promotores, Neutros ou Detratores).
// Mostra as principais respostas que caracterizam o grupo + comentários abertos.

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import type {
  DistribuicaoItem,
  PerfilGrupo,
} from '@/types/pesquisa-experiencia';

interface PesquisaPerfilGrupoCardProps {
  title: string;
  subtitle?: string;
  perfil: PerfilGrupo;
  tone: 'verde' | 'amarelo' | 'vermelho';
  className?: string;
}

const TONE_CLASSES = {
  verde: {
    border: 'border-verde-pipa/40',
    bg: 'bg-verde-pipa/5',
    accent: 'bg-verde-pipa',
    text: 'text-roxo-titulo',
    badge: 'bg-verde-pipa/20 text-roxo-titulo',
  },
  amarelo: {
    border: 'border-amarelo-pipa/40',
    bg: 'bg-amarelo-pipa/5',
    accent: 'bg-amarelo-pipa',
    text: 'text-roxo-titulo',
    badge: 'bg-amarelo-pipa/25 text-roxo-titulo',
  },
  vermelho: {
    border: 'border-vermelho-kids/40',
    bg: 'bg-vermelho-kids/5',
    accent: 'bg-vermelho-kids',
    text: 'text-vermelho-kids',
    badge: 'bg-vermelho-kids/15 text-vermelho-kids',
  },
};

interface TopListProps {
  label: string;
  items: DistribuicaoItem[];
  accentClass: string;
  emptyLabel?: string;
}

const TopList = React.memo<TopListProps>(
  ({ label, items, accentClass, emptyLabel = 'Sem dados' }) => {
    if (items.length === 0) {
      return (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-1.5">
            {label}
          </p>
          <p className="text-xs text-muted-foreground/70">{emptyLabel}</p>
        </div>
      );
    }
    const max = items[0]?.count || 1;
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-1.5">
          {label}
        </p>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.value}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate flex-1 pr-2">
                  {it.label}
                </span>
                <span className="text-muted-foreground font-medium tabular-nums">
                  {it.count} ({it.percent}%)
                </span>
              </div>
              <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden mt-0.5">
                <div
                  className={cn('h-full rounded-full', accentClass)}
                  style={{ width: `${Math.max(4, (it.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
);
TopList.displayName = 'TopList';

export const PesquisaPerfilGrupoCard = React.memo<PesquisaPerfilGrupoCardProps>(
  ({ title, subtitle, perfil, tone, className }) => {
    const t = TONE_CLASSES[tone];

    return (
      <Card className={cn('overflow-hidden', t.border, className)}>
        <CardHeader className={cn('pb-3', t.bg)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle
                className={cn('text-base md:text-lg font-semibold', t.text)}
              >
                {title}
              </CardTitle>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            <div
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-center',
                t.badge
              )}
            >
              <p className="text-2xl font-bold leading-none">
                {perfil.totalRespondentes}
              </p>
              <p className="text-[11px] uppercase tracking-wide mt-0.5">
                respostas
              </p>
            </div>
          </div>

          {/* Notas médias */}
          <div className="flex gap-4 mt-3 text-xs">
            <span className="text-muted-foreground">
              Confiança:{' '}
              <span className="font-bold text-foreground">
                {perfil.mediaNotaConfianca !== null
                  ? perfil.mediaNotaConfianca.toFixed(1)
                  : '—'}
                /10
              </span>
            </span>
            <span className="text-muted-foreground">
              Indicação:{' '}
              <span className="font-bold text-foreground">
                {perfil.mediaNotaIndicacao !== null
                  ? perfil.mediaNotaIndicacao.toFixed(1)
                  : '—'}
                /10
              </span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Características */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TopList
              label="O que valoriza"
              items={perfil.topOQueValePena.slice(0, 4)}
              accentClass={t.accent}
            />
            <TopList
              label="Como se sente"
              items={perfil.topComoSeSente.slice(0, 4)}
              accentClass={t.accent}
            />
            <TopList
              label="Custo-benefício"
              items={perfil.topCustoBeneficio.slice(0, 4)}
              accentClass={t.accent}
            />
            <TopList
              label="Como conheceu"
              items={perfil.topComoConheceu.slice(0, 4)}
              accentClass={t.accent}
            />
            <TopList
              label="Tempo na clínica"
              items={perfil.topTempoAcompanhamento.slice(0, 4)}
              accentClass={t.accent}
            />
            <TopList
              label="Idade do filho"
              items={perfil.topIdadeFilho.slice(0, 4)}
              accentClass={t.accent}
            />
          </div>

          {/* Comentários */}
          {(perfil.comentariosAma.length > 0 ||
            perfil.comentariosMelhorar.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              {perfil.comentariosAma.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-2">
                    O que funcionou bem
                  </p>
                  <ul className="space-y-1.5">
                    {perfil.comentariosAma.slice(0, 3).map((c, i) => (
                      <li
                        key={i}
                        className="text-xs text-foreground italic bg-muted/30 rounded-md px-2.5 py-1.5 leading-relaxed"
                      >
                        “{c}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {perfil.comentariosMelhorar.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold mb-2">
                    Sugestões de melhoria
                  </p>
                  <ul className="space-y-1.5">
                    {perfil.comentariosMelhorar.slice(0, 3).map((c, i) => (
                      <li
                        key={i}
                        className="text-xs text-foreground italic bg-muted/30 rounded-md px-2.5 py-1.5 leading-relaxed"
                      >
                        “{c}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PesquisaPerfilGrupoCard.displayName = 'PesquisaPerfilGrupoCard';
