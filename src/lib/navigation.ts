import {
  LayoutDashboard,
  Calendar,
  Users,
  Package,
  DollarSign,
  Settings,
  FileText,
  MoreHorizontal,
  Webhook,
} from 'lucide-react';

// AI dev note: Configuração de navegação baseada em roles
// Define quais módulos cada role pode acessar

export interface NavigationConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  roles: UserRole[];
  badge?: string | number; // Opcional para exibir badges
}

export type UserRole = 'admin' | 'profissional' | 'secretaria';

// Configuração base de navegação
export const navigationConfig: NavigationConfig[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    href: '/dashboard',
    roles: ['admin', 'profissional', 'secretaria'],
  },
  {
    icon: Calendar,
    label: 'Agenda',
    href: '/agenda',
    roles: ['admin', 'profissional', 'secretaria'],
  },
  {
    icon: Users,
    label: 'Pacientes',
    href: '/pacientes',
    roles: ['admin', 'secretaria'],
  },
  {
    icon: Package,
    label: 'Estoque',
    href: '/estoque',
    roles: ['admin', 'secretaria'],
  },
  {
    icon: DollarSign,
    label: 'Financeiro',
    href: '/financeiro',
    roles: ['admin', 'profissional', 'secretaria'],
  },
  {
    icon: Settings,
    label: 'Configurações',
    href: '/configuracoes',
    roles: ['admin', 'profissional', 'secretaria'],
  },
  // Admin only
  {
    icon: FileText,
    label: 'Relatórios',
    href: '/relatorios',
    roles: ['admin'],
  },
  {
    icon: Webhook,
    label: 'Webhooks',
    href: '/webhooks',
    roles: ['admin'],
  },
];

// Navegação mobile específica por role
export const mobileNavigationConfig: Record<UserRole, NavigationConfig[]> = {
  admin: [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      href: '/dashboard',
      roles: ['admin'],
    },
    {
      icon: FileText,
      label: 'Relatórios',
      href: '/relatorios',
      roles: ['admin'],
    },
    {
      icon: Settings,
      label: 'Config',
      href: '/configuracoes',
      roles: ['admin'],
    },
    {
      icon: MoreHorizontal,
      label: 'Mais',
      href: '/mais',
      roles: ['admin'],
    },
  ],
  profissional: [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      href: '/dashboard',
      roles: ['profissional'],
    },
    {
      icon: Calendar,
      label: 'Agenda',
      href: '/agenda',
      roles: ['profissional'],
    },
    {
      icon: Settings,
      label: 'Config',
      href: '/configuracoes',
      roles: ['profissional'],
    },
  ],
  secretaria: [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      href: '/dashboard',
      roles: ['secretaria'],
    },
    {
      icon: Calendar,
      label: 'Agenda',
      href: '/agenda',
      roles: ['secretaria'],
    },
    {
      icon: Users,
      label: 'Pacientes',
      href: '/pacientes',
      roles: ['secretaria'],
    },
    {
      icon: Package,
      label: 'Estoque',
      href: '/estoque',
      roles: ['secretaria'],
    },
    {
      icon: Settings,
      label: 'Config',
      href: '/configuracoes',
      roles: ['secretaria'],
    },
  ],
};

// Função para filtrar navegação por role
export const getNavigationForRole = (role: UserRole): NavigationConfig[] => {
  return navigationConfig.filter((item) => item.roles.includes(role));
};

// Função para obter navegação mobile por role
export const getMobileNavigationForRole = (
  role: UserRole
): NavigationConfig[] => {
  return mobileNavigationConfig[role] || [];
};

// Função para verificar se usuário tem acesso a uma rota
// AI dev note: Suporte a rotas dinâmicas - se tem acesso a /pacientes, tem acesso a /pacientes/:id
export const hasAccessToRoute = (route: string, role: UserRole): boolean => {
  // Verificação direta para rota exata
  const exactMatch = navigationConfig.find((item) => item.href === route);
  if (exactMatch) {
    return exactMatch.roles.includes(role);
  }

  // Verificação para rotas dinâmicas - prefix matching
  // Ex: /pacientes/:id → verifica acesso a /pacientes
  const pathSegments = route.split('/').filter(Boolean);
  if (pathSegments.length > 1) {
    const basePath = `/${pathSegments[0]}`;
    const baseMatch = navigationConfig.find((item) => item.href === basePath);
    if (baseMatch) {
      return baseMatch.roles.includes(role);
    }
  }

  return false;
};
