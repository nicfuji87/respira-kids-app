import React from 'react';
import { cn } from '@/lib/utils';

// AI dev note: PublicPageLayout - Template para páginas públicas (sem autenticação)
// Layout consistente com logo, gradiente e responsividade mobile-first

export interface PublicPageLayoutProps {
  children: React.ReactNode;
  title?: string;
  showLogo?: boolean;
  className?: string;
}

export const PublicPageLayout = React.memo<PublicPageLayoutProps>(
  ({ children, title = 'Respira Kids', showLogo = true, className }) => {
    return (
      <div
        className={cn(
          'min-h-screen w-full',
          'bg-gradient-to-br from-bege-fundo via-background to-bege-fundo/50',
          'flex flex-col',
          className
        )}
      >
        {/* Header com logo */}
        {showLogo && (
          <header className="w-full py-6 px-4 flex justify-center">
            <div className="flex items-center space-x-3">
              <img
                src="/images/logos/icone-respira-kids.png"
                alt="Respira Kids"
                className="h-12 w-12 md:h-14 md:w-14"
                onError={(e) => {
                  // Fallback se imagem não carregar
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="flex flex-col">
                <h1 className="text-xl md:text-2xl font-bold text-primary">
                  {title}
                </h1>
                <p className="text-xs text-muted-foreground hidden md:block">
                  Fisioterapia Respiratória Pediátrica
                </p>
              </div>
            </div>
          </header>
        )}

        {/* Conteúdo principal */}
        <main className="flex-1 w-full flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl">
            {/* Card com conteúdo */}
            <div
              className={cn(
                'bg-card/95 backdrop-blur-sm',
                'rounded-2xl shadow-xl',
                'border border-border/50',
                'p-6 md:p-8 lg:p-10'
              )}
            >
              {children}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full py-4 px-4 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Respira Kids. Todos os direitos
            reservados.
          </p>
        </footer>
      </div>
    );
  }
);

PublicPageLayout.displayName = 'PublicPageLayout';
