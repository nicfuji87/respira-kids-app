// AI dev note: Componente para visualização e aceite de contrato
// Exibe contrato com scroll, checkbox de aceite e botões de ação

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { AlertCircle, FileDown, CheckCircle } from 'lucide-react';
import { ProgressIndicator } from '@/components/composed/ProgressIndicator';

export interface ContractReviewStepProps {
  contractContent: string; // Conteúdo do contrato (texto formatado)
  onAccept: () => void;
  onReject: () => void;
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
  const [accepted, setAccepted] = useState(false);

  const handleAcceptChange = (checked: boolean) => {
    setAccepted(checked);
  };

  const handleAccept = () => {
    if (!accepted) return;
    onAccept();
  };

  return (
    <div className="w-full px-4 space-y-6 pb-8">
      {/* Progress bar slim no topo */}
      <ProgressIndicator currentStep={9} totalSteps={10} />

      {/* Título sem container */}
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          📄 Contrato de Prestação de Serviços
        </h2>
        <p className="text-xs text-muted-foreground">
          Revise e aceite o contrato para finalizar o cadastro
        </p>
      </div>

      {/* Alerta de Atenção */}
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <AlertCircle className="h-5 w-5 text-amber-600" />
        <AlertDescription className="text-sm">
          <strong>Importante:</strong> Leia todo o contrato com atenção. O
          aceite deste contrato é obrigatório para a realização das consultas.
        </AlertDescription>
      </Alert>

      {/* Card com Conteúdo do Contrato - MUITO MAIS ESPAÇOSO */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        {/* Header do Card com botão de exportar */}
        {onExportPDF && (
          <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
            <h3 className="text-sm font-medium text-foreground/80 uppercase tracking-wide">
              Contrato Completo
            </h3>
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

        {/* Área de Scroll com Conteúdo - ALTURA MAIOR */}
        <ScrollArea className="h-[60vh] md:h-[65vh] w-full">
          <div className="p-6 md:p-8">
            <ReactMarkdown
              components={{
                // Customizar estilos dos elementos - TIPOGRAFIA MELHORADA
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
                  <ol className="list-decimal ml-8 mb-6 space-y-2">
                    {children}
                  </ol>
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
        </ScrollArea>
      </div>

      {/* Card de Aceite - MAIS ESPAÇOSO */}
      <div className="bg-muted/50 rounded-lg border border-border p-5">
        <div className="flex items-start space-x-4">
          <Checkbox
            id="accept-contract"
            checked={accepted}
            onCheckedChange={handleAcceptChange}
            disabled={isLoading}
            className="mt-1 h-5 w-5"
          />
          <label
            htmlFor="accept-contract"
            className="text-sm leading-relaxed cursor-pointer flex-1"
          >
            <span className="font-medium text-foreground">
              Li e compreendi todos os termos e condições do contrato acima.
            </span>
            <br />
            <span className="text-muted-foreground">
              Declaro estar ciente de que o aceite deste contrato é obrigatório
              para a realização dos atendimentos de fisioterapia.
            </span>
          </label>
        </div>
      </div>

      {/* Botões de Ação - MAIS ESPAÇOSOS */}
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
          onClick={handleAccept}
          disabled={!accepted || isLoading}
          className="flex-1 h-12 font-medium"
        >
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Processando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Aceitar e Assinar
            </>
          )}
        </Button>
      </div>

      {/* Mensagem de Ajuda */}
      <p className="text-xs text-center text-muted-foreground/70 italic">
        Uma cópia será enviada para seu WhatsApp e Email cadastrado após a
        confirmação.
      </p>
    </div>
  );
}
