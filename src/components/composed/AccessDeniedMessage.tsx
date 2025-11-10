import React from 'react';
import { AlertTriangle, Phone, Mail, Globe } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { cn } from '@/lib/utils';

// AI dev note: AccessDeniedMessage - Composed
// Combina Card + Alert para exibir mensagem de acesso negado
// Usado quando responsável NÃO está cadastrado

export interface AccessDeniedMessageProps {
  onBack?: () => void;
  contactPhone?: string;
  contactEmail?: string;
  contactWebsite?: string;
  className?: string;
}

export const AccessDeniedMessage = React.memo<AccessDeniedMessageProps>(
  ({
    onBack,
    contactPhone = '(61) 98144-6666',
    contactEmail = 'contato@respirakids.com.br',
    contactWebsite = 'www.respirakids.com.br',
    className,
  }) => {
    return (
      <div className={cn('w-full max-w-md mx-auto', className)}>
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-xl">Acesso Restrito</CardTitle>
            <CardDescription>
              Este link é exclusivo para responsáveis cadastrados
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Alert variant="default" className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
              <AlertDescription className="text-sm text-foreground">
                Não identificamos seu cadastro em nosso sistema. Para agendar
                horários, é necessário estar cadastrado previamente.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <p className="text-sm font-medium">Entre em contato conosco:</p>

              <div className="space-y-2">
                {/* WhatsApp */}
                <a
                  href={`https://wa.me/${contactPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <Phone className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      {contactPhone}
                    </p>
                  </div>
                </a>

                {/* Email */}
                <a
                  href={`mailto:${contactEmail}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <Mail className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium">E-mail</p>
                    <p className="text-xs text-muted-foreground">
                      {contactEmail}
                    </p>
                  </div>
                </a>

                {/* Website */}
                <a
                  href={`https://${contactWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <Globe className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium">Site</p>
                    <p className="text-xs text-muted-foreground">
                      {contactWebsite}
                    </p>
                  </div>
                </a>
              </div>
            </div>

            {onBack && (
              <Button
                variant="outline"
                onClick={onBack}
                className="w-full mt-4"
              >
                Voltar
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
);

AccessDeniedMessage.displayName = 'AccessDeniedMessage';


