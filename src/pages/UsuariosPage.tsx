import React from 'react';
import { UserManagement } from '@/components/domain/users';

// AI dev note: UsuariosPage - página principal para gestão de usuários
// Restrita ao role 'admin', integra UserManagement domain component

export const UsuariosPage = React.memo(() => {
  return (
    <div className="container mx-auto p-6">
      <UserManagement />
    </div>
  );
});

UsuariosPage.displayName = 'UsuariosPage';
