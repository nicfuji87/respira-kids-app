import React, { useCallback } from 'react';
import { Plus, Variable } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/primitives/dropdown-menu';
import { cn } from '@/lib/utils';

// AI dev note: VariableInserter composed que combina Button e DropdownMenu primitives
// Permite inserir variáveis dinâmicas em editores de texto via execCommand

export interface VariableInserterProps {
  variables?: string[];
  onInsert?: (variable: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
}

export const VariableInserter = React.memo<VariableInserterProps>(
  ({
    variables = [],
    onInsert,
    disabled = false,
    className,
    size = 'sm',
    variant = 'outline',
  }) => {
    const handleInsertVariable = useCallback(
      (variable: string) => {
        // Formato de variável: {{variable_name}}
        const formattedVariable = `{{${variable}}}`;
        
        // Se há callback customizado, usar ele
        if (onInsert) {
          onInsert(formattedVariable);
          return;
        }

        // Caso contrário, inserir diretamente via execCommand
        try {
          document.execCommand('insertText', false, formattedVariable);
        } catch (error) {
          console.warn('⚠️ Erro ao inserir variável:', error);
        }
      },
      [onInsert]
    );

    // Se não há variáveis, não renderizar
    if (!variables || variables.length === 0) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2",
              className
            )}
            title="Inserir variável"
          >
            <Variable className="h-4 w-4" />
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">Variável</span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Inserir Variável
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {variables.map((variable) => (
            <DropdownMenuItem
              key={variable}
              onClick={() => handleInsertVariable(variable)}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Variable className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                {`{{${variable}}}`}
              </span>
              <span className="text-muted-foreground text-xs ml-auto">
                {variable.replace(/_/g, ' ').toLowerCase()}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

VariableInserter.displayName = 'VariableInserter'; 