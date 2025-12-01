import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';

// AI dev note: GoniometryInput - Input especializado para medidas de goniometria
// Campos para rotação e inclinação cervical (ativa/passiva, direita/esquerda)

interface GoniometryValues {
  ativa_direita?: number;
  passiva_direita?: number;
  ativa_esquerda?: number;
  passiva_esquerda?: number;
}

interface GoniometryInputProps {
  label: string;
  value: GoniometryValues | undefined;
  onChange: (value: GoniometryValues) => void;
  disabled?: boolean;
  className?: string;
}

export const GoniometryInput: React.FC<GoniometryInputProps> = ({
  label,
  value = {},
  onChange,
  disabled = false,
  className,
}) => {
  const handleChange = (field: keyof GoniometryValues, val: string) => {
    const numVal = val === '' ? undefined : parseInt(val, 10);
    onChange({
      ...value,
      [field]: isNaN(numVal as number) ? undefined : numVal,
    });
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Label className="text-sm font-semibold">{label}</Label>

      <div className="grid grid-cols-2 gap-4">
        {/* Coluna Direita */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide">
            Direita
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Ativa:</span>
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={value.ativa_direita ?? ''}
                  onChange={(e) => handleChange('ativa_direita', e.target.value)}
                  disabled={disabled}
                  className="pr-6 text-center h-9"
                  min={0}
                  max={180}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  °
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Passiva:</span>
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={value.passiva_direita ?? ''}
                  onChange={(e) => handleChange('passiva_direita', e.target.value)}
                  disabled={disabled}
                  className="pr-6 text-center h-9"
                  min={0}
                  max={180}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  °
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Esquerda */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide">
            Esquerda
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Ativa:</span>
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={value.ativa_esquerda ?? ''}
                  onChange={(e) => handleChange('ativa_esquerda', e.target.value)}
                  disabled={disabled}
                  className="pr-6 text-center h-9"
                  min={0}
                  max={180}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  °
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-12">Passiva:</span>
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={value.passiva_esquerda ?? ''}
                  onChange={(e) => handleChange('passiva_esquerda', e.target.value)}
                  disabled={disabled}
                  className="pr-6 text-center h-9"
                  min={0}
                  max={180}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  °
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

GoniometryInput.displayName = 'GoniometryInput';

