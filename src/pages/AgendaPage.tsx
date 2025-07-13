import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Calendar, Clock, User, MapPin, FileText } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';

// AI dev note: AgendaPage - Página de agendamentos com dados fictícios
// Mostra agenda diária e semanal com ações rápidas

export const AgendaPage: React.FC = () => {
  const agendamentosHoje = [
    {
      id: 1,
      horario: '09:00',
      paciente: 'Ana Silva',
      servico: 'Fisioterapia Respiratória',
      local: 'Sala 1',
      status: 'agendado',
      duracao: '60 min',
    },
    {
      id: 2,
      horario: '10:00',
      paciente: 'Pedro Santos',
      servico: 'Avaliação Fisioterapêutica',
      local: 'Sala 1',
      status: 'finalizado',
      duracao: '90 min',
    },
    {
      id: 3,
      horario: '14:00',
      paciente: 'Maria Oliveira',
      servico: 'Fisioterapia Respiratória',
      local: 'Sala 1',
      status: 'agendado',
      duracao: '60 min',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'agendado':
        return 'default';
      case 'finalizado':
        return 'secondary';
      case 'cancelado':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'agendado':
        return 'Agendado';
      case 'finalizado':
        return 'Finalizado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com data e ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString('pt-BR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button>
            <Calendar className="h-4 w-4 mr-2" />
            Novo Agendamento
          </Button>
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Relatório
          </Button>
        </div>
      </div>

      {/* Resumo do dia */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">agendamentos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1</div>
            <p className="text-xs text-muted-foreground">de 3 sessões</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14:00</div>
            <p className="text-xs text-muted-foreground">Maria Oliveira</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de agendamentos */}
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos de Hoje</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agendamentosHoje.map((agendamento) => (
              <div
                key={agendamento.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="text-center">
                    <div className="text-lg font-bold">
                      {agendamento.horario}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {agendamento.duracao}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="font-medium">{agendamento.paciente}</div>
                    <div className="text-sm text-muted-foreground">
                      {agendamento.servico}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3 mr-1" />
                      {agendamento.local}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Badge variant={getStatusColor(agendamento.status)}>
                    {getStatusLabel(agendamento.status)}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    Ver Detalhes
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Visão semanal simplificada */}
      <Card>
        <CardHeader>
          <CardTitle>Visão da Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-4 text-center">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(
              (dia, index) => (
                <div key={dia} className="space-y-2">
                  <div className="font-medium text-sm">{dia}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(
                      Date.now() + (index - 3) * 24 * 60 * 60 * 1000
                    ).getDate()}
                  </div>
                  <div className="text-xs">
                    {index === 3
                      ? '3 sessões'
                      : index === 4
                        ? '2 sessões'
                        : '1 sessão'}
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
