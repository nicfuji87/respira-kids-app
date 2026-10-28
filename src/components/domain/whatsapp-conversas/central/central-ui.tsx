// AI dev note: peças visuais da central de Conversas. Cores de série vêm de
// --serie-1..4 (index.css), validadas para daltonismo nos modos claro e escuro
// (dataviz validate_palette). Texto nunca usa a cor da série: a cor fica na
// marca (barra, ponto, quadrado) ao lado do texto.

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';

export const SERIE = {
  1: 'hsl(var(--serie-1))',
  2: 'hsl(var(--serie-2))',
  3: 'hsl(var(--serie-3))',
  4: 'hsl(var(--serie-4))',
} as const;

export interface Delta {
  atual: number | null | undefined;
  anterior: number | null | undefined;
  /** "menor" quando cair é bom (tempo de espera, reclamações). */
  melhor: 'maior' | 'menor';
  /** Formata o valor anterior no texto ("antes: 9 min"). */
  formatar?: (v: number) => string;
}

export function DeltaBadge({ delta }: { delta: Delta }) {
  const { atual, anterior, melhor, formatar } = delta;
  if (
    atual === null ||
    atual === undefined ||
    anterior === null ||
    anterior === undefined
  ) {
    return null;
  }
  const diff = atual - anterior;
  const igual =
    Math.abs(diff) < 1e-9 ||
    (anterior !== 0 && Math.abs(diff / anterior) < 0.03);
  const bom = igual ? null : melhor === 'maior' ? diff > 0 : diff < 0;
  const Icon = igual ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
  const fmt = formatar ?? ((v: number) => v.toLocaleString('pt-BR'));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        bom === null && 'bg-muted text-muted-foreground',
        bom === true && 'bg-verde-pipa/40 text-roxo-titulo',
        bom === false && 'bg-vermelho-kids/25 text-roxo-titulo'
      )}
      title={bom === null ? 'Estável' : bom ? 'Melhorou' : 'Piorou'}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>
        {igual ? 'estável' : bom ? 'melhorou' : 'piorou'} · antes{' '}
        {fmt(anterior)}
      </span>
    </span>
  );
}

export interface KpiProps {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: Delta;
  destaque?: 'atencao' | 'ok';
  onClick?: () => void;
  className?: string;
}

export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  destaque,
  onClick,
  className,
}: KpiProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden',
        destaque === 'atencao' && 'border-vermelho-kids/50',
        onClick && 'cursor-pointer transition-colors hover:bg-muted/40',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {Icon && (
            <Icon
              className={cn(
                'h-4 w-4',
                destaque === 'atencao'
                  ? 'text-vermelho-kids'
                  : 'text-azul-respira'
              )}
              aria-hidden
            />
          )}
          <span>{label}</span>
        </div>
        <p className="text-2xl font-bold leading-tight text-foreground tabular-nums">
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {delta && <DeltaBadge delta={delta} />}
      </CardContent>
    </Card>
  );
}

export function Secao({
  icon: Icon,
  titulo,
  subtitulo,
  acoes,
  children,
  className,
}: {
  icon?: LucideIcon;
  titulo: string;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {Icon && (
                <Icon className="h-4 w-4 text-azul-respira" aria-hidden />
              )}
              {titulo}
            </CardTitle>
            {subtitulo && (
              <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>
            )}
          </div>
          {acoes}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Legenda({
  itens,
}: {
  itens: Array<{ label: string; cor: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: i.cor }}
            aria-hidden
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Barra horizontal com rótulo à esquerda e valor na ponta. */
export function BarraLinha({
  label,
  valor,
  max,
  cor = SERIE[1],
  detalhe,
  titulo,
}: {
  label: string;
  valor: number;
  max: number;
  cor?: string;
  detalhe?: string;
  titulo?: string;
}) {
  const largura = max > 0 ? Math.max(2, (valor / max) * 100) : 0;
  return (
    <div
      className="grid grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[minmax(0,12rem)_1fr] items-center gap-3 text-sm"
      title={titulo}
    >
      <span className="truncate text-foreground/90">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-2.5 flex-1 rounded-r bg-transparent">
          <div
            className="h-2.5 rounded-r"
            style={{ width: `${largura}%`, background: cor }}
          />
        </div>
        <span className="w-14 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
          {valor.toLocaleString('pt-BR')}
          {detalhe ? ` ${detalhe}` : ''}
        </span>
      </div>
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{texto}</p>
  );
}
