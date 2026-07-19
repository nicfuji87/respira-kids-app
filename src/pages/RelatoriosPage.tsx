import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { DevelopmentPlaceholder } from '@/components/composed/DevelopmentPlaceholder';
import { FileText, TrendingUp, BarChart, PieChart } from 'lucide-react';

// AI dev note: RelatoriosPage ainda não tem relatórios funcionais.
// Mostra estado honesto "Em desenvolvimento" + preview do que está planejado.
// A lista abaixo é apenas visual (sem interação) até os relatórios existirem.

interface RelatorioPlanejado {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  itens: string[];
}

const relatoriosPlanejados: RelatorioPlanejado[] = [
  {
    icon: BarChart,
    titulo: 'Relatórios Financeiros',
    itens: ['Faturamento mensal', 'Inadimplência', 'Fluxo de caixa'],
  },
  {
    icon: PieChart,
    titulo: 'Relatórios Operacionais',
    itens: [
      'Produtividade por profissional',
      'Taxa de ocupação',
      'Tempo médio de sessão',
    ],
  },
  {
    icon: TrendingUp,
    titulo: 'Análises de Crescimento',
    itens: [
      'Evolução de pacientes',
      'Crescimento da receita',
      'Satisfação dos clientes',
    ],
  },
  {
    icon: FileText,
    titulo: 'Relatórios Customizados',
    itens: [
      'Construtor de relatórios',
      'Exportação em PDF/Excel',
      'Agendamento automático',
    ],
  },
];

export const RelatoriosPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">
          Análises e relatórios gerenciais (Admin)
        </p>
      </div>

      <DevelopmentPlaceholder
        title="Relatórios em desenvolvimento"
        description="Os relatórios gerenciais ainda não estão disponíveis. Enquanto isso, os números do dia a dia podem ser acompanhados nos módulos Financeiro e Agenda."
        icon={<BarChart className="h-12 w-12 text-primary/50" />}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">O que está planejado</h2>
          <Badge variant="secondary">Em breve</Badge>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60 select-none"
          aria-hidden="true"
        >
          {relatoriosPlanejados.map((grupo) => {
            const IconComponent = grupo.icon;
            return (
              <Card key={grupo.titulo} className="border-dashed">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <IconComponent className="h-5 w-5" />
                      {grupo.titulo}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      Em breve
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {grupo.itens.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
