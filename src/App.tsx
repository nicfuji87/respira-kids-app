import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center space-y-6 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/images/logos/nome-logo-respira-kids.png"
              alt="Respira Kids"
              className="mx-auto max-w-md w-full h-auto"
            />
          </div>

          {/* Título Principal */}
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-primary">
              Bem-vindos ao Respira Kids
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Sistema de Prontuário Eletrônico Inteligente para Fisioterapia
              Respiratória Pediátrica
            </p>
          </div>

          {/* Cards de Funcionalidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  👥 Gestão de Pacientes
                </CardTitle>
                <CardDescription>
                  Sistema completo para gerenciar informações dos pacientes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Cadastro, histórico médico e acompanhamento de evolução
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">📅 Agendamentos</CardTitle>
                <CardDescription>
                  Controle inteligente de consultas e sessões
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Calendário integrado com notificações automáticas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">📊 Prontuários</CardTitle>
                <CardDescription>
                  Prontuários eletrônicos detalhados e seguros
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Registro completo de tratamentos e evolução
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Botão de Acesso */}
          <div className="mt-8">
            <Button size="lg" className="px-8 py-3 text-lg">
              Acessar Sistema
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
