import React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives';
import {
  LayoutGrid,
  DollarSign,
  Building2,
  Settings,
  BarChart3,
  Repeat,
  FolderTree,
  Landmark,
  CalendarDays,
  ClipboardCheck,
  History,
  FileText,
  Users,
  Package,
} from 'lucide-react';
import { DevelopmentPlaceholder } from '@/components/composed';
import { FornecedorList } from '@/components/domain/fornecedores';
import { CategoriaTree } from '@/components/domain/categorias';
import { ContaBancariaList } from '@/components/domain/contas-bancarias';
import {
  LancamentoList,
  ContasPagarList,
  PreLancamentoValidation,
  LancamentoRecorrenteList,
  FinancialDashboard,
  RelatorioMensal,
  RecorrenciaLogViewer,
  ConfiguracaoDivisaoSocios,
} from '@/components/domain/financial';
import { ProdutoList } from '@/components/domain/produtos';
import { useSearchParams } from 'react-router-dom';

// AI dev note: Template principal do módulo financeiro
// Organiza todas as funcionalidades em tabs com controle de acesso
// Integra componentes de despesas, receitas, cadastros e relatórios

interface FinancialTemplateProps {
  userRole: 'admin' | 'secretaria';
  className?: string;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
  roles: string[];
}

export const FinancialTemplate = React.memo<FinancialTemplateProps>(
  ({ userRole, className }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = React.useState<string>('');

    const tabsConfig = React.useMemo<TabConfig[]>(
      () => [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutGrid,
          roles: ['admin', 'secretaria'],
          content: <FinancialDashboard />,
        },
        {
          id: 'lancamentos',
          label: 'Lançamentos',
          icon: FileText,
          roles: ['admin', 'secretaria'],
          content: <LancamentoList tipo="todos" />,
        },
        {
          id: 'contas_pagar',
          label: 'Contas a Pagar',
          icon: CalendarDays,
          roles: ['admin', 'secretaria'],
          content: <ContasPagarList />,
        },
        {
          id: 'pre_lancamentos',
          label: 'Pré-Lançamentos',
          icon: ClipboardCheck,
          roles: ['admin', 'secretaria'],
          content: <PreLancamentoValidation />,
        },
        {
          id: 'recorrentes',
          label: 'Recorrentes',
          icon: Repeat,
          roles: ['admin', 'secretaria'],
          content: (
            <div className="space-y-6">
              <Tabs defaultValue="lancamentos" className="w-full">
                <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:grid-cols-2 md:overflow-visible no-scrollbar">
                  <TabsTrigger
                    value="lancamentos"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <Repeat className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Lançamentos
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <History className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Histórico de Processamento
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="lancamentos" className="mt-6">
                  <LancamentoRecorrenteList />
                </TabsContent>

                <TabsContent value="logs" className="mt-6">
                  <RecorrenciaLogViewer />
                </TabsContent>
              </Tabs>
            </div>
          ),
        },
        {
          id: 'cadastros',
          label: 'Cadastros',
          icon: Settings,
          roles: ['admin', 'secretaria'],
          content: (
            <div className="space-y-6">
              <Tabs defaultValue="fornecedores" className="w-full">
                <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:grid-cols-5 md:overflow-visible no-scrollbar">
                  <TabsTrigger
                    value="fornecedores"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <Building2 className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Fornecedores
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="produtos"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <Package className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Produtos
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="categorias"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <FolderTree className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Categorias
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="contas"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <Landmark className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Contas Bancárias
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="divisao"
                    className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 flex-1 md:flex-auto justify-center"
                  >
                    <Users className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap md:whitespace-normal">
                      Divisão de Sócios
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="fornecedores" className="mt-6">
                  <FornecedorList />
                </TabsContent>

                <TabsContent value="produtos" className="mt-6">
                  <ProdutoList />
                </TabsContent>

                <TabsContent value="categorias" className="mt-6">
                  <CategoriaTree />
                </TabsContent>

                <TabsContent value="contas" className="mt-6">
                  <ContaBancariaList />
                </TabsContent>

                <TabsContent value="divisao" className="mt-6">
                  <ConfiguracaoDivisaoSocios />
                </TabsContent>
              </Tabs>
            </div>
          ),
        },
        {
          id: 'relatorios',
          label: 'Relatórios',
          icon: BarChart3,
          roles: ['admin'],
          content: <RelatorioMensal />,
        },
      ],
      []
    );

    // Filtrar tabs baseadas no role
    const allowedTabs = React.useMemo(
      () => tabsConfig.filter((tab) => tab.roles.includes(userRole)),
      [userRole, tabsConfig]
    );

    // Tab padrão
    const defaultTab = allowedTabs.length > 0 ? allowedTabs[0].id : '';

    // Gerenciar tab ativa via URL
    React.useEffect(() => {
      const tabParam = searchParams.get('tab');
      if (tabParam && allowedTabs.some((tab) => tab.id === tabParam)) {
        if (activeTab !== tabParam) {
          setActiveTab(tabParam);
        }
      } else if (!activeTab) {
        setActiveTab(defaultTab);
      }
    }, [searchParams, allowedTabs, activeTab, defaultTab]);

    const handleTabChange = (value: string) => {
      setActiveTab(value);
      setSearchParams({ tab: value });
    };

    if (allowedTabs.length === 0) {
      return (
        <div className={className}>
          <DevelopmentPlaceholder
            title="Acesso Restrito"
            description="Você não tem permissão para acessar o módulo financeiro."
            icon={<DollarSign className="h-12 w-12 text-destructive/50" />}
          />
        </div>
      );
    }

    return (
      <div className={className}>
        <Tabs
          value={activeTab || defaultTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:overflow-visible no-scrollbar">
            {allowedTabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 h-10 text-xs md:text-sm px-3 min-w-fit md:min-w-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1 md:flex-auto justify-center"
                >
                  <IconComponent className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap md:whitespace-normal md:truncate max-w-none md:max-w-[120px] lg:max-w-full">
                    {tab.label}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {allowedTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }
);

FinancialTemplate.displayName = 'FinancialTemplate';
