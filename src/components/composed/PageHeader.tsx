import React from 'react';
import { cn } from '@/lib/utils';

// AI dev note: PageHeader — faixa de abertura padrão das páginas internas.
// O NOME da página já aparece no topo (DashboardTopBar no desktop, MobileHeader
// no celular), então aqui NÃO se repete o título: só uma linha opcional de
// contexto à esquerda e as ações da página à direita. Se a página precisa de um
// título diferente do menu (ex.: saudação do dashboard, nome do paciente), passe
// `title` — ele vira o h2 da página.
// Sem description, title e actions, não renderiza nada.

export interface PageHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className,
}) => {
  if (!title && !description && !actions) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      {(title || description) && (
        <div className="min-w-0 space-y-1">
          {title && (
            <h2 className="text-xl font-semibold tracking-tight text-roxo-titulo dark:text-foreground md:text-2xl">
              {title}
            </h2>
          )}
          {description && (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
};

PageHeader.displayName = 'PageHeader';
