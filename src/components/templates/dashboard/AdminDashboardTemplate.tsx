import React, { useState } from 'react';
import {
  Menu,
  X,
  Bell,
  Settings,
  LogOut,
  User,
  ChevronRight,
  Home,
  Users,
  Calendar,
  FileText,
  Package,
  DollarSign,
  Webhook,
  Heart,
} from 'lucide-react';

import { AdminDashboard } from '@/components/domain';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
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
import { Toaster } from '@/components/primitives/toaster';
import { cn } from '@/lib/utils';

// AI dev note: AdminDashboardTemplate é o layout completo para toda área administrativa
// Inclui sidebar responsiva, header com notificações, breadcrumbs e navegação

export interface AdminUser {
  name: string;
  email: string;
  role: 'admin' | 'secretaria' | 'profissional';
  avatar?: string;
}

interface AdminDashboardTemplateProps {
  currentUser: AdminUser;
  currentModule?: string;
  onModuleChange?: (module: string) => void;
  onLogout?: () => void;
  className?: string;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/admin' },
  { id: 'patients', label: 'Pacientes', icon: Users, path: '/admin/patients' },
  { id: 'agenda', label: 'Agenda', icon: Calendar, path: '/admin/agenda' },
  {
    id: 'approvals',
    label: 'Aprovações',
    icon: FileText,
    path: '/admin/approvals',
    badge: 8,
  },
  {
    id: 'stock',
    label: 'Estoque',
    icon: Package,
    path: '/admin/stock',
    badge: 3,
    urgent: true,
  },
  {
    id: 'financial',
    label: 'Financeiro',
    icon: DollarSign,
    path: '/admin/financial',
  },
  {
    id: 'webhooks',
    label: 'Notificações',
    icon: Webhook,
    path: '/admin/webhooks',
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    path: '/admin/settings',
  },
];

export const AdminDashboardTemplate = React.memo<AdminDashboardTemplateProps>(
  ({
    currentUser,
    currentModule = 'dashboard',
    onModuleChange,
    onLogout,
    className,
  }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleModuleClick = (moduleId: string) => {
      if (onModuleChange) {
        onModuleChange(moduleId);
      }
      setSidebarOpen(false); // Fechar sidebar no mobile
    };

    const getCurrentModuleLabel = () => {
      const item = navigationItems.find((item) => item.id === currentModule);
      return item?.label || 'Dashboard';
    };

    const breadcrumbs = [
      { label: 'Administração', href: '/admin' },
      { label: getCurrentModuleLabel(), href: '#', current: true },
    ];

    return (
      <div className={cn('min-h-screen bg-background', className)}>
        {/* Sidebar Overlay (Mobile) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 h-full w-64 bg-card border-r border-border/20 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full respira-gradient flex items-center justify-center">
                <Heart className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-roxo-titulo">Respira Kids</h2>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === currentModule;

              return (
                <button
                  key={item.id}
                  onClick={() => handleModuleClick(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>

                  {item.badge && (
                    <Badge
                      variant={item.urgent ? 'destructive' : 'secondary'}
                      className="text-xs px-1.5 py-0.5"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-border/20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser.avatar} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {currentUser.role}
                    </p>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onLogout}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:ml-64">
          {/* Top Header */}
          <header className="sticky top-0 z-30 border-b border-border/20 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 h-16">
              {/* Mobile Menu & Breadcrumbs */}
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </Button>

                {/* Breadcrumbs */}
                <nav className="hidden sm:flex" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2">
                    {breadcrumbs.map((breadcrumb, index) => (
                      <li key={index} className="flex items-center">
                        {index > 0 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
                        )}
                        <span
                          className={cn(
                            'text-sm',
                            breadcrumb.current
                              ? 'font-medium text-foreground'
                              : 'text-muted-foreground hover:text-foreground cursor-pointer'
                          )}
                        >
                          {breadcrumb.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </nav>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-2">
                {/* Notifications */}
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-4 w-4" />
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 text-xs p-0 flex items-center justify-center"
                  >
                    11
                  </Badge>
                </Button>

                {/* Quick Actions */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleModuleClick('approvals')}
                  className="hidden sm:flex gap-2"
                >
                  <FileText className="h-4 w-4" />8 Aprovações
                </Button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1" role="main">
            {currentModule === 'dashboard' && (
              <AdminDashboard onNavigateToModule={handleModuleClick} />
            )}

            {currentModule !== 'dashboard' && (
              <div className="p-6">
                <div className="max-w-4xl mx-auto text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                    {(() => {
                      const item = navigationItems.find(
                        (item) => item.id === currentModule
                      );
                      const Icon = item?.icon || FileText;
                      return <Icon className="h-8 w-8 text-muted-foreground" />;
                    })()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-roxo-titulo">
                      {getCurrentModuleLabel()}
                    </h2>
                    <p className="text-muted-foreground mt-2">
                      Este módulo está em desenvolvimento. Em breve estará
                      disponível.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleModuleClick('dashboard')}
                    className="mt-4"
                  >
                    Voltar ao Dashboard
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Toast Notifications */}
        <Toaster />
      </div>
    );
  }
);

AdminDashboardTemplate.displayName = 'AdminDashboardTemplate';
