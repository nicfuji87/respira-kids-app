import React from 'react';
import { UserManagement } from '@/components/domain/users';

// AI dev note: UsuariosPage - página principal para gestão de usuários
// Restrita ao role 'admin', integra UserManagement domain component

export const UsuariosPage = React.memo(() => {
  return (
    // AI dev note: largura total (antes `container mx-auto`, que estreitava o conteúdo
    // e deixava muito espaço vazio nas laterais em telas largas).
    <div className="w-full max-w-none">
      <UserManagement />
    </div>
  );
});

UsuariosPage.displayName = 'UsuariosPage';
