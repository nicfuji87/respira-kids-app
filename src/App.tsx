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
    <div className="min-h-screen bg-background text-foreground theme-transition">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center space-y-8 max-w-5xl mx-auto">
          {/* Logo com animação */}
          <div className="mb-10">
            <img
              src="/images/logos/nome-logo-respira-kids.png"
              alt="Respira Kids"
              className="mx-auto max-w-sm w-full h-auto animate-respira-pulse"
            />
          </div>

          {/* Título Principal com gradiente */}
          <div className="space-y-4">
            <h1 className="text-5xl font-bold respira-text-gradient">
              Bem-vindos ao Respira Kids
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Sistema de Prontuário Eletrônico Inteligente para Fisioterapia
              Respiratória Pediátrica
            </p>
          </div>

          {/* Cards de Funcionalidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
            <Card className="bg-card text-card-foreground border-border theme-transition hover:shadow-lg hover:scale-[1.02] respira-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl text-primary flex items-center gap-3">
                  <span className="text-3xl">👥</span>
                  Gestão de Pacientes
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Sistema completo para gerenciar informações dos pacientes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Cadastro detalhado, histórico médico completo e acompanhamento
                  contínuo da evolução
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card text-card-foreground border-border theme-transition hover:shadow-lg hover:scale-[1.02] respira-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl text-accent flex items-center gap-3">
                  <span className="text-3xl">📅</span>
                  Agendamentos
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Controle inteligente de consultas e sessões
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Calendário integrado com notificações automáticas e gestão de
                  disponibilidade
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card text-card-foreground border-border theme-transition hover:shadow-lg hover:scale-[1.02] respira-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl text-foreground flex items-center gap-3">
                  <span className="text-3xl">📊</span>
                  Prontuários
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Prontuários eletrônicos detalhados e seguros
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Registro completo de tratamentos, evolução e documentação
                  médica
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Seção de Recursos */}
          <div className="mt-16 p-8 bg-muted rounded-2xl">
            <h2 className="text-3xl font-bold text-primary mb-6">
              Recursos Principais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Segurança Total
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Dados protegidos com criptografia avançada
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-accent rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Interface Intuitiva
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Design pensado para facilitar o uso diário
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Relatórios Detalhados
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Análises completas para tomada de decisões
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-accent rounded-full mt-2"></div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Suporte Especializado
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Equipe técnica dedicada ao seu sucesso
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-12">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-4 text-lg theme-transition font-semibold"
            >
              🚀 Acessar Sistema
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground px-10 py-4 text-lg theme-transition font-semibold"
            >
              📖 Ver Demonstração
            </Button>
          </div>

          {/* Barra decorativa com gradiente */}
          <div className="mt-16 h-3 rounded-full respira-gradient mx-auto max-w-lg animate-respira-pulse"></div>
        </div>
      </div>
    </div>
  );
}

export default App;
