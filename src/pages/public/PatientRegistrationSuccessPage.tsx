// AI dev note: Página de sucesso após cadastro público de paciente
// Exibe mensagem de confirmação e próximos passos

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import {
  CheckCircle,
  Mail,
  MessageCircle,
  UserPlus,
  Instagram,
} from 'lucide-react';
import { PublicPageLayout } from '@/components/templates/PublicPageLayout';

export function PatientRegistrationSuccessPage() {
  const [searchParams] = useSearchParams();

  const patientName = searchParams.get('patient_name') || 'Paciente';
  const contractId = searchParams.get('contract_id');
  const patientId = searchParams.get('patient_id');

  // AI dev note: Verificar se chegaram parâmetros válidos
  const hasValidData = patientName !== 'Paciente' || contractId || patientId;

  useEffect(() => {
    // Analytics
    console.log('✅ [PatientRegistrationSuccess] Página de sucesso exibida', {
      patientName,
      contractId,
      patientId,
    });
  }, [patientName, contractId, patientId]);

  const handleNewPatient = () => {
    // Redirecionar para o início do cadastro
    window.location.href = '/#/cadastro-paciente';
  };

  const handleInstagramClick = () => {
    window.open(
      'https://www.instagram.com/respira.kids/',
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <PublicPageLayout>
      <div className="w-full max-w-2xl mx-auto space-y-6 p-4 py-12">
        {/* Ícone de Sucesso */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="relative bg-green-500 rounded-full p-6">
              <CheckCircle className="w-16 h-16 text-white" />
            </div>
          </div>
        </div>

        {/* Mensagem de Sucesso */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            🎉 Cadastro Concluído!
          </h1>
          <p className="text-xl text-muted-foreground">
            {hasValidData ? (
              <>
                Bem-vindo(a),{' '}
                <span className="font-semibold text-foreground">
                  {patientName}
                </span>
                !
              </>
            ) : (
              'Cadastro realizado com sucesso!'
            )}
          </p>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Cadastro realizado com sucesso. Você receberá o contrato por e-mail
            para assinar em instantes.
          </p>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 max-w-xl mx-auto">
            Lembrando que os atendimentos só poderão ser realizados quando o
            contrato estiver assinado.
          </p>
        </div>

        {/* Card com Próximos Passos */}
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            📋 Próximos Passos
          </h2>

          <div className="space-y-4">
            {/* Email - Assinatura Digital */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  Assinatura do Contrato por E-mail
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Em instantes, você receberá um e-mail com o contrato para
                  assinatura digital. É necessário assiná-lo para que os
                  atendimentos sejam agendados.
                </p>
              </div>
            </div>

            {/* WhatsApp */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  Confirmação via WhatsApp
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Você receberá uma mensagem de confirmação com uma cópia do
                  contrato no WhatsApp cadastrado.
                </p>
              </div>
            </div>

            {/* Agendamento */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
              <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  Aguarde o Contato
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Após a assinatura do contrato, nossa equipe entrará em contato
                  para realizar o agendamento da primeira sessão de
                  fisioterapia.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {/* Cadastrar Novo Paciente */}
          <Button
            size="lg"
            onClick={handleNewPatient}
            className="w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Cadastrar Novo Paciente
          </Button>

          {/* Seguir no Instagram */}
          <Button
            variant="outline"
            size="lg"
            onClick={handleInstagramClick}
            className="w-full sm:w-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0"
          >
            <Instagram className="w-4 h-4 mr-2" />
            Seguir @respira.kids
          </Button>
        </div>

        {/* Informação Adicional */}
        <Card className="p-4 bg-muted/50">
          <p className="text-sm text-center text-muted-foreground">
            💡 <strong>Dúvidas?</strong> Entre em contato conosco pelo WhatsApp.
          </p>
        </Card>
      </div>
    </PublicPageLayout>
  );
}
