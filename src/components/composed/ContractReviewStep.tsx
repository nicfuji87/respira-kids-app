// AI dev note: Componente para visualização do contrato (apenas leitura)
// Após a etapa de revisão, o usuário visualiza o contrato gerado e finaliza o cadastro.
// A assinatura digital acontece depois, via n8n + Assinafy, por email.
// Por isso, NÃO há mais checkbox de aceite: o botão apenas finaliza o cadastro.

import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { AlertCircle, FileDown, CheckCircle } from 'lucide-react';

export interface ContractReviewStepProps {
  contractContent: string; // Conteúdo do contrato (texto formatado)
  onAccept: () => void; // Handler para "Finalizar Cadastro"
  onReject: () => void; // Handler para voltar à etapa anterior
  onExportPDF?: () => void;
  isLoading?: boolean;
}

export function ContractReviewStep({
  contractContent,
  onAccept,
  onReject,
  onExportPDF,
  isLoading = false,
}: ContractReviewStepProps) {
  return (
    <div className="w-full px-4 space-y-6 pb-8">
      {/* Título sem container */}
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          📄 Visualizar Contrato
        </h2>
        <p className="text-xs text-muted-foreground">
          Revise o contrato antes de finalizar o cadastro
        </p>
      </div>

      {/* Alerta informativo sobre assinatura digital */}
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <AlertCircle className="h-5 w-5 text-amber-600" />
        <AlertDescription className="text-sm">
          <strong>Importante:</strong> Ao finalizar o cadastro, o contrato será
          enviado automaticamente para o seu e-mail para assinatura digital. Os
          atendimentos só poderão ser realizados após a assinatura.
        </AlertDescription>
      </Alert>

      {/* Botão exportar (se disponível) */}
      {onExportPDF && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPDF}
            disabled={isLoading}
            className="h-9"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      )}

      {/* Conteúdo do Contrato - SEM ScrollArea fixa, usuário rola a página */}
      <div className="space-y-6">
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="mb-6 text-[15px] leading-[1.8] text-justify text-foreground/90">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            ),
            h1: ({ children }) => (
              <h1 className="text-center font-bold text-xl md:text-2xl mb-6 mt-8 text-foreground">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-bold text-base md:text-lg mb-4 mt-8 text-foreground">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-semibold text-[15px] mb-3 mt-6 text-foreground">
                {children}
              </h3>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal ml-8 mb-6 space-y-2">{children}</ol>
            ),
            ul: ({ children }) => (
              <ul className="list-disc ml-8 mb-6 space-y-2">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="text-[15px] leading-[1.8] text-foreground/90">
                {children}
              </li>
            ),
          }}
        >
          {contractContent}
        </ReactMarkdown>
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onReject}
          disabled={isLoading}
          className="flex-1 h-12"
        >
          Voltar
        </Button>
        <Button
          onClick={onAccept}
          disabled={isLoading}
          className="flex-1 h-12 font-medium"
        >
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Finalizando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Finalizar Cadastro
            </>
          )}
        </Button>
      </div>

      {/* Mensagem de Ajuda */}
      <p className="text-xs text-center text-muted-foreground/70 italic">
        Você receberá o contrato por e-mail para assinar em instantes.
      </p>
    </div>
  );
}
