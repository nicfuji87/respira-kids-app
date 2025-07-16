import React from 'react';
import { User } from 'lucide-react';
import { Button } from '@/components/primitives/button';

// AI dev note: ContactLink é um COMPOSED que combina Button (variant="link") + ícone
// para nomes clicáveis que abrirão detalhes de contatos no futuro

export interface ContactLinkProps {
  nome: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'bold';
}

export const ContactLink = React.memo<ContactLinkProps>(
  ({ nome, onClick, disabled = false, className, variant = 'default' }) => {
    return (
      <Button
        variant="link"
        size="sm"
        onClick={onClick}
        disabled={disabled || !onClick}
        className={`h-auto p-0 text-left justify-start ${
          variant === 'bold' ? 'font-bold' : 'font-normal'
        } ${disabled || !onClick ? 'cursor-default' : 'cursor-pointer'} ${
          className || ''
        }`}
      >
        <User className="h-3 w-3 mr-1" />
        {nome}
      </Button>
    );
  }
);

ContactLink.displayName = 'ContactLink';
