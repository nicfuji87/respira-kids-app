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

    const routeMap: Record<string, string> = {
      dashboard: 'Dashboard',
      agenda: 'Agenda',
      pacientes: 'Pacientes',
      estoque: 'Estoque',
      financeiro: 'Financeiro',
      configuracoes: 'Configurações',
      usuarios: 'Usuários',
      relatorios: 'Relatórios',
      webhooks: 'Webhooks',
    };

    // Se não há segmentos ou está na raiz, mostrar Dashboard
    if (pathSegments.length === 0 || currentPath === '/') {
      return [
        {
          label: 'Dashboard',
          href: '/dashboard',
        },
      ];
    }

    // Para outras rotas, mostrar apenas o nome da página atual
    const currentSegment = pathSegments[0]; // primeiro segmento após '/'
    const currentLabel = routeMap[currentSegment] || currentSegment;

    return [
      {
        label: currentLabel,
        href: currentPath,
      },
    ];
  }, [currentPath]);

  return {
    currentPath,
    navigateTo,
    breadcrumbItems,
  };
}
