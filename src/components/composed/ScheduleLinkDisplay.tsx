import React, { useState } from 'react';
import { Link2, Copy, Check } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';

// AI dev note: ScheduleLinkDisplay - Composed
// Combina Card + Input + Button para exibir e copiar link compartilhado
// Feedback visual de cópia (ícone check temporário)

export interface ScheduleLinkDisplayProps {
  link: string;
  slotsDisponiveis?: number;
  slotsTotal?: number;
  className?: string;
}

export const ScheduleLinkDisplay = React.memo<ScheduleLinkDisplayProps>(
  ({ link, slotsDisponiveis, slotsTotal, className }) => {
    const [copied, setCopied] = useState(false);

    const handleCopyLink = async () => {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Erro ao copiar link:', error);
      }
    };

    return (
      <Card className={cn('bg-primary/5 border-primary/20', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Link da Agenda Compartilhada
          </CardTitle>
          {slotsDisponiveis !== undefined && slotsTotal !== undefined && (
            <CardDescription>
              {slotsDisponiveis} de {slotsTotal} horários disponíveis
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="agenda-link" className="sr-only">
              Link da agenda
            </Label>
            <div className="flex gap-2">
              <Input
                id="agenda-link"
                type="text"
                value={link}
                readOnly
                className="font-mono text-sm"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="default"
                size="icon"
                onClick={handleCopyLink}
                className={cn(
                  'shrink-0 transition-colors',
                  copied && 'bg-green-600 hover:bg-green-700'
                )}
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {copied && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              ✓ Link copiado para a área de transferência!
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Compartilhe este link com os responsáveis para que escolham os
            horários disponíveis.
          </p>
        </CardContent>
      </Card>
    );
  }
);

ScheduleLinkDisplay.displayName = 'ScheduleLinkDisplay';


