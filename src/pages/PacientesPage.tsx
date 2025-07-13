import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Users, UserPlus, Search, Phone, Mail, Calendar } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';

// AI dev note: PacientesPage - Lista de pacientes com dados fictícios
// Interface para gerenciar pacientes

export const PacientesPage: React.FC = () => {
  const pacientes = [
    {
      id: 1,
      nome: 'Ana Silva',
      idade: 6,
      telefone: '(61) 98765-4321',
      email: 'ana.silva@email.com',
      ultimaConsulta: '2025-07-10',
      proximaConsulta: '2025-07-12',
      status: 'ativo',
    },
    {
      id: 2,
      nome: 'Pedro Santos',
      idade: 8,
      telefone: '(61) 98877-6655',
      email: 'pedro.santos@email.com',
      ultimaConsulta: '2025-07-11',
      proximaConsulta: '2025-07-18',
      status: 'ativo',
    },
    {
      id: 3,
      nome: 'Maria Oliveira',
      idade: 5,
      telefone: '(61) 99988-7766',
      email: 'maria.oliveira@email.com',
      ultimaConsulta: '2025-07-09',
      proximaConsulta: '2025-07-14',
      status: 'ativo',
    },
    {
      id: 4,
      nome: 'João Costa',
      idade: 7,
      telefone: '(61) 97766-5544',
      email: 'joao.costa@email.com',
      ultimaConsulta: '2025-06-28',
      proximaConsulta: null,
      status: 'inativo',
    },
    {
      id: 5,
      nome: 'Sophia Lima',
      idade: 4,
      telefone: '(61) 96655-4433',
      email: 'sophia.lima@email.com',
      ultimaConsulta: '2025-07-08',
      proximaConsulta: '2025-07-15',
      status: 'ativo',
    },
  ];

  const getStatusColor = (status: string) => {
    return status === 'ativo' ? 'default' : 'secondary';
  };

  const getStatusLabel = (status: string) => {
    return status === 'ativo' ? 'Ativo' : 'Inativo';
  };

  return (
    <div className="space-y-6">
      {/* Header com ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-muted-foreground">
            Gerencie seus pacientes e histórico de atendimentos
          </p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Paciente
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Pacientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pacientes.length}</div>
            <p className="text-xs text-muted-foreground">
              {pacientes.filter((p) => p.status === 'ativo').length} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Consultas Hoje
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">agendamentos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Idade Média</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6.0</div>
            <p className="text-xs text-muted-foreground">anos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e busca */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Pacientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar paciente..." className="pl-10" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Todos
              </Button>
              <Button variant="outline" size="sm">
                Ativos
              </Button>
              <Button variant="outline" size="sm">
                Inativos
              </Button>
            </div>
          </div>

          {/* Lista de pacientes */}
          <div className="space-y-4">
            {pacientes.map((paciente) => (
              <div
                key={paciente.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{paciente.nome}</div>
                      <Badge variant={getStatusColor(paciente.status)}>
                        {getStatusLabel(paciente.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {paciente.idade} anos
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <div className="flex items-center">
                        <Phone className="h-3 w-3 mr-1" />
                        {paciente.telefone}
                      </div>
                      <div className="flex items-center">
                        <Mail className="h-3 w-3 mr-1" />
                        {paciente.email}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Última: </span>
                    {new Date(paciente.ultimaConsulta).toLocaleDateString(
                      'pt-BR'
                    )}
                  </div>
                  {paciente.proximaConsulta && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Próxima: </span>
                      {new Date(paciente.proximaConsulta).toLocaleDateString(
                        'pt-BR'
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button variant="ghost" size="sm">
                      Ver Perfil
                    </Button>
                    <Button variant="ghost" size="sm">
                      Agendar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
