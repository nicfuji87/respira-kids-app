import { useNavigate, useLocation } from 'react-router-dom';
import { createElement, useMemo } from 'react';
import {
  hasAccessToRoute,
  navigationConfig,
  type UserRole,
} from '@/lib/navigation';
import type { BreadcrumbItem } from '@/components/composed/BreadcrumbNav';

// AI dev note: Hook para gerenciar navegação com React Router
// Integra com sistema de permissões baseado em roles

// AI dev note: Labels de rotas que existem mas não aparecem no navigationConfig
const extraRouteLabels: Record<string, string> = {
  usuarios: 'Usuários',
};

// Fallback humanizado para rotas fora da config: capitaliza e troca hífens por espaço
const humanizeSegment = (segment: string): string =>
  segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

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
  // AI dev note: Label e ícone derivados do navigationConfig (fonte única)
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const pathSegments = currentPath.split('/').filter(Boolean);

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
    const configItem = navigationConfig.find(
      (item) => item.href === `/${currentSegment}`
    );
    const currentLabel =
      configItem?.label ||
      extraRouteLabels[currentSegment] ||
      humanizeSegment(currentSegment);

    return [
      {
        label: currentLabel,
        href: currentPath,
        icon: configItem
          ? createElement(configItem.icon, { className: 'h-4 w-4' })
          : undefined,
      },
    ];
  }, [currentPath]);

  return {
    currentPath,
    navigateTo,
    breadcrumbItems,
  };
}
