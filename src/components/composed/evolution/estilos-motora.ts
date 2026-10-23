// Classes compartilhadas pelos blocos da evolução motora 1.3.
import { cn } from '@/lib/utils';

export const chipClasse = (sel: boolean) =>
  cn(
    'rounded-full border px-3 py-1.5 text-xs sm:text-sm transition-colors',
    sel
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-background text-muted-foreground hover:bg-muted'
  );

export const selectClasse =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/**
 * Botão de escolha única grande (estado da habilidade, participação…).
 * Sem cor própria usa o primário com o texto do primário (o branco sobre o
 * verde-água claro fica com pouco contraste).
 */
export const opcaoClasse = (sel: boolean, cor?: string) =>
  cn(
    'min-h-10 rounded-lg border-2 px-2 py-1.5 text-[13px] sm:text-sm font-medium transition-colors',
    sel
      ? cor
        ? `${cor} text-white`
        : 'bg-primary border-primary text-primary-foreground'
      : 'bg-background border-border text-muted-foreground hover:bg-muted'
  );
