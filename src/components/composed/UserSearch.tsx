import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/primitives/input';
import { cn } from '@/lib/utils';

// AI dev note: UserSearch combina Input primitive com ícone de busca
// Reutilizável para buscar usuários por nome, email ou CPF

export interface UserSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const UserSearch = React.memo<UserSearchProps>(
  ({
    value,
    onChange,
    placeholder = 'Buscar por nome, email ou CPF...',
    disabled = false,
    className,
  }) => {
    return (
      <div className={cn('relative', className)}>
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-10 h-10"
        />
      </div>
    );
  }
);

UserSearch.displayName = 'UserSearch';
