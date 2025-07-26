import React from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { Badge } from '@/components/primitives/badge';
import type { UsuarioFilters } from '@/types/usuarios';
import { cn } from '@/lib/utils';

// AI dev note: UserFilters combina múltiplos Select primitives em popover
// Filtros específicos para entidade usuários (tipo, role, status)

export interface UserFiltersProps {
  filters: UsuarioFilters;
  onChange: (filters: UsuarioFilters) => void;
  className?: string;
}

export const UserFilters = React.memo<UserFiltersProps>(
  ({ filters, onChange, className }) => {
    const activeFiltersCount = Object.entries(filters).filter(
      ([key, value]) => {
        // Não contar busca vazia
        if (key === 'busca' && (!value || value.trim() === '')) return false;
        // Não contar valores undefined ou null
        return value !== undefined && value !== null;
      }
    ).length;

    const clearFilters = () => {
      onChange({});
    };

    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="relative">
              <Filter className="mr-2 h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filtros</h4>
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs h-auto p-1"
                  >
                    Limpar
                  </Button>
                )}
              </div>

              {/* Tipo de Pessoa */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Tipo de Pessoa
                </label>
                <Select
                  value={filters.tipo_pessoa || 'all'}
                  onValueChange={(value) =>
                    onChange({
                      ...filters,
                      tipo_pessoa: value === 'all' ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="paciente">Pacientes</SelectItem>
                    <SelectItem value="medico">Médicos</SelectItem>
                    <SelectItem value="responsavel">Responsáveis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Função no Sistema
                </label>
                <Select
                  value={filters.role || 'all'}
                  onValueChange={(value) =>
                    onChange({
                      ...filters,
                      role: value === 'all' ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas as funções" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as funções</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="secretaria">Secretaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status de Aprovação */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Status de Aprovação
                </label>
                <Select
                  value={
                    filters.is_approved !== undefined
                      ? String(filters.is_approved)
                      : 'all'
                  }
                  onValueChange={(value) =>
                    onChange({
                      ...filters,
                      is_approved:
                        value === 'all' ? undefined : value === 'true',
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="true">Aprovados</SelectItem>
                    <SelectItem value="false">Pendentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Ativo */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Status do Usuário
                </label>
                <Select
                  value={
                    filters.ativo !== undefined ? String(filters.ativo) : 'all'
                  }
                  onValueChange={(value) =>
                    onChange({
                      ...filters,
                      ativo: value === 'all' ? undefined : value === 'true',
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os usuários" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os usuários</SelectItem>
                    <SelectItem value="true">Ativos</SelectItem>
                    <SelectItem value="false">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Bloqueado */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Bloqueio
                </label>
                <Select
                  value={
                    filters.bloqueado !== undefined
                      ? String(filters.bloqueado)
                      : 'all'
                  }
                  onValueChange={(value) =>
                    onChange({
                      ...filters,
                      bloqueado: value === 'all' ? undefined : value === 'true',
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="false">Desbloqueados</SelectItem>
                    <SelectItem value="true">Bloqueados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

UserFilters.displayName = 'UserFilters';
