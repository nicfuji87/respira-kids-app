import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';

// AI dev note: AuthCard é o container base para todos os formulários de autenticação
// Deve ser responsivo (mobile-first) e consistente com o tema Respira Kids

interface AuthCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showLogo?: boolean;
}

export const AuthCard = React.memo<AuthCardProps>(
  ({ title, description, children, className, showLogo = true }) => {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-bege-fundo to-background">
        <Card
          className={cn(
            'w-full max-w-md mx-auto theme-transition respira-shadow',
            'border-border/20 bg-card/95 backdrop-blur-sm',
            className
          )}
          role="main"
          aria-labelledby="auth-title"
        >
          <CardHeader className="space-y-4 text-center">
            {showLogo && (
              <div className="mx-auto w-16 h-16 flex items-center justify-center">
                <img
                  src="/images/logos/logo-respira-kids.png"
                  alt="Logo Respira Kids"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback para o círculo original em caso de erro
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) {
                      fallback.style.display = 'flex';
                    }
                  }}
                />
                <div
                  className="w-16 h-16 rounded-full respira-gradient flex items-center justify-center animate-respira-pulse"
                  style={{ display: 'none' }}
                  aria-hidden="true"
                >
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">R</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <CardTitle
                id="auth-title"
                className="text-2xl font-bold text-roxo-titulo respira-text-gradient"
              >
                {title}
              </CardTitle>

              {description && (
                <CardDescription
                  className="text-muted-foreground text-center px-2"
                  aria-describedby="auth-description"
                >
                  {description}
                </CardDescription>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6 p-6 pt-0">{children}</CardContent>
        </Card>
      </div>
    );
  }
);

AuthCard.displayName = 'AuthCard';
