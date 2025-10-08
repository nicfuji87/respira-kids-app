// AI dev note: Página de sucesso após cadastro público de paciente
// Exibe mensagem de confirmação e próximos passos

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { CheckCircle, Download, Home, Mail, MessageCircle } from 'lucide-react';
import { PublicPageLayout } from '@/components/templates/PublicPageLayout';

export function PatientRegistrationSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

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

  const handleDownloadPDF = async () => {
    if (!contractId) {
      alert('Erro: ID do contrato não encontrado.');
      return;
    }

    setIsDownloadingPDF(true);
    try {
      // Chamar Edge Function para gerar PDF
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-contract-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            contractId,
            patientName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao gerar PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contrato_${patientName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ [PatientRegistrationSuccess] PDF baixado com sucesso');
    } catch (error) {
      console.error(
        '❌ [PatientRegistrationSuccess] Erro ao baixar PDF:',
        error
      );
      alert(
        'Não foi possível baixar o PDF do contrato. Por favor, entre em contato conosco.'
      );
    } finally {
      setIsDownloadingPDF(false);
    }
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
          <p className="text-base text-muted-foreground max-w-md mx-auto">
            {hasValidData
              ? 'Seu cadastro foi realizado com sucesso e o contrato foi assinado digitalmente.'
              : 'O cadastro do paciente foi concluído e o contrato foi assinado digitalmente.'}
          </p>
        </div>

        {/* Card com Próximos Passos */}
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            📋 Próximos Passos
          </h2>

          <div className="space-y-4">
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

            {/* Email */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  Email com Detalhes
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Um email será enviado com todos os detalhes do cadastro e
                  instruções para agendar a primeira consulta.
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
                  Nossa equipe entrará em contato em breve para realizar o
                  agendamento da primeira sessão de fisioterapia.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {contractId && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="w-full sm:w-auto"
            >
              {isDownloadingPDF ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Contrato (PDF)
                </>
              )}
            </Button>
          )}

          <Button
            size="lg"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto"
          >
            <Home className="w-4 h-4 mr-2" />
            Ir para Página Inicial
          </Button>
        </div>

        {/* Informação Adicional */}
        <Card className="p-4 bg-muted/50">
          <p className="text-sm text-center text-muted-foreground">
            💡 <strong>Dúvidas?</strong> Entre em contato conosco pelo WhatsApp
            ou email que estão no contrato.
          </p>
        </Card>
      </div>
    </PublicPageLayout>
  );
}
