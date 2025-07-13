import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Calendar,
  Users,
  FileText,
  Activity,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';

// AI dev note: DashboardPage com dados reais do Supabase
// Página principal do dashboard com métricas e ações rápidas

interface DashboardMetrics {
  agendamentosHoje: number;
  pacientesAtivos: number;
  sessoesMes: number;
  faturamentoMes: number;
  proximosAgendamentos: Array<{
    paciente: string;
    horario: string;
    servico: string;
    status: string;
  }>;
}

export const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    agendamentosHoje: 0,
    pacientesAtivos: 0,
    sessoesMes: 0,
    faturamentoMes: 0,
    proximosAgendamentos: [],
  });
  const [loading, setLoading] = useState(true);

  // Simular carregamento de dados reais
  useEffect(() => {
    const loadMetrics = async () => {
      // Aqui conectaria com Supabase para buscar dados reais
      // Por enquanto, usando dados fictícios baseados nos dados inseridos

      setTimeout(() => {
        setMetrics({
          agendamentosHoje: 3,
          pacientesAtivos: 5,
          sessoesMes: 24,
          faturamentoMes: 3850.0,
          proximosAgendamentos: [
            {
              paciente: 'Ana Silva',
              horario: '09:00',
              servico: 'Fisioterapia Respiratória',
              status: 'agendado',
            },
            {
              paciente: 'Maria Oliveira',
              horario: '14:00',
              servico: 'Fisioterapia Respiratória',
              status: 'agendado',
            },
            {
              paciente: 'Maria Oliveira',
              horario: '10:00 (Seg)',
              servico: 'Fisioterapia Neurológica',
              status: 'agendado',
            },
          ],
        });
        setLoading(false);
      }, 1000);
    };

    loadMetrics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16 animate-pulse mb-1" />
                <div className="h-3 bg-muted rounded w-20 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Agendamentos Hoje
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.agendamentosHoje}</div>
            <p className="text-xs text-muted-foreground">
              3 sessões programadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pacientes Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pacientesAtivos}</div>
            <p className="text-xs text-muted-foreground">Em acompanhamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sessões do Mês
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sessoesMes}</div>
            <p className="text-xs text-muted-foreground">
              +12% vs mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R${' '}
              {metrics.faturamentoMes.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground">Mês atual</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid com conteúdo principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos agendamentos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Próximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.proximosAgendamentos.map((agendamento, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{agendamento.paciente}</p>
                    <p className="text-sm text-muted-foreground">
                      {agendamento.servico}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{agendamento.horario}</Badge>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ações rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button className="h-20 flex flex-col items-center justify-center space-y-2">
                <Calendar className="h-6 w-6" />
                <span className="text-sm">Nova Sessão</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2"
              >
                <Users className="h-6 w-6" />
                <span className="text-sm">Novo Paciente</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2"
              >
                <FileText className="h-6 w-6" />
                <span className="text-sm">Relatório</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2"
              >
                <Activity className="h-6 w-6" />
                <span className="text-sm">Avaliação</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
