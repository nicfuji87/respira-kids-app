import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { hasAccessToRoute, type UserRole } from '@/lib/navigation';
import type { BreadcrumbItem } from '@/components/composed/BreadcrumbNav';

// AI dev note: Hook para gerenciar navegação com React Router
// Integra com sistema de permissões baseado em roles

export function useNavigation(userRole?: UserRole) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname;

  // Função para navegar verificando permissões
  const navigateTo = (path: string) => {
    if (!userRole || hasAccessToRoute(path, userRole)) {
      navigate(path);
    } else {
      console.warn(`Usuário ${userRole} não tem acesso à rota ${path}`);
    }
  };

  // Gerar breadcrumb baseado na rota atual
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const pathSegments = currentPath.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' },
    ];

    if (pathSegments.length > 1) {
      const routeMap: Record<string, string> = {
        agenda: 'Agenda',
        pacientes: 'Pacientes',
        estoque: 'Estoque',
        financeiro: 'Financeiro',
        configuracoes: 'Configurações',
        usuarios: 'Usuários',
        relatorios: 'Relatórios',
        webhooks: 'Webhooks',
      };

      pathSegments.slice(1).forEach((segment, index) => {
        const label = routeMap[segment] || segment;
        const href = '/' + pathSegments.slice(0, index + 2).join('/');
        items.push({ label, href });
      });
    }

    return items;
  }, [currentPath]);

  return {
    currentPath,
    navigateTo,
    breadcrumbItems,
  };
}
