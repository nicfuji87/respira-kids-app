import React from 'react';
import { ConfigurationTabs } from '@/components/composed/ConfigurationTabs';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/lib/navigation';

// AI dev note: ConfiguracoesPage com tabs baseadas em role
// Integra ConfigurationTabs com controle de acesso

export const ConfiguracoesPage: React.FC = () => {
  const { user } = useAuth();

  // AI dev note: Garantir que role é válido ou usar fallback
  const userRole = (user?.pessoa?.role as UserRole) || 'profissional';

  return (
    <div className="space-y-6">
      <ConfigurationTabs userRole={userRole} />
    </div>
  );
};
