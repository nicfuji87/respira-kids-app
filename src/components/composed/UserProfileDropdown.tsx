import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/primitives/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/primitives/dropdown-menu';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { LogOut, Settings, User } from 'lucide-react';

// AI dev note: UserProfileDropdown combina Avatar e DropdownMenu primitives
// Usado no header tanto mobile quanto desktop

export interface UserProfileProps {
  name: string;
  email: string;
  role: 'admin' | 'profissional' | 'secretaria';
  avatar?: string;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogout?: () => void;
}

const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'Administrador';
    case 'profissional':
      return 'Profissional';
    case 'secretaria':
      return 'Secretária';
    default:
      return 'Usuário';
  }
};

const getRoleColor = (
  role: string
): 'default' | 'secondary' | 'destructive' => {
  switch (role) {
    case 'admin':
      return 'destructive';
    case 'profissional':
      return 'default';
    case 'secretaria':
      return 'secondary';
    default:
      return 'secondary';
  }
};

export const UserProfileDropdown = React.memo<UserProfileProps>(
  ({
    name,
    email,
    role,
    avatar,
    onProfileClick,
    onSettingsClick,
    onLogout,
  }) => {
    const initials = name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatar} alt={name} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {email}
              </p>
              <Badge
                variant={getRoleColor(role)}
                className="w-fit text-xs mt-1"
              >
                {getRoleLabel(role)}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onProfileClick}>
            <User className="mr-2 h-4 w-4" />
            <span>Perfil</span>
          </DropdownMenuItem>

          {(role === 'admin' || onSettingsClick) && (
            <DropdownMenuItem onClick={onSettingsClick}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Configurações</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

UserProfileDropdown.displayName = 'UserProfileDropdown';
