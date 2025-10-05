// AI dev note: Componente para visualização e aceite de contrato
// Exibe contrato com scroll, checkbox de aceite e botões de ação

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { Checkbox } from '@/components/primitives/checkbox';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { AlertCircle, FileDown, CheckCircle } from 'lucide-react';

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
    <div className="w-full max-w-3xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          📄 Contrato de Prestação de Serviços
        </h2>
      </div>

      {/* Alerta de Atenção */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>⚠️ Importante:</strong> Leia todo o contrato com atenção. O
          aceite deste contrato é obrigatório para a realização das consultas.
        </AlertDescription>
      </Alert>

      {/* Card com Conteúdo do Contrato */}
      <Card className="p-6 space-y-4">
        <div className="space-y-4">
          {onExportPDF && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onExportPDF}
                disabled={isLoading}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          )}

          {/* Área de Scroll com Conteúdo */}
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            <div className="text-sm leading-relaxed text-foreground">
              <ReactMarkdown
                components={{
                  // Customizar estilos dos elementos
                  p: ({ children }) => (
                    <p className="mb-4 text-justify text-foreground">
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-bold text-foreground">
                      {children}
                    </strong>
                  ),
                  h1: ({ children }) => (
                    <h1 className="text-center font-bold text-lg mb-4 text-foreground">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="font-bold text-base mb-3 mt-6 text-foreground">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="font-bold text-sm mb-2 mt-4 text-foreground">
                      {children}
                    </h3>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal ml-6 mb-4">{children}</ol>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc ml-6 mb-4">{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li className="mb-2 text-foreground">{children}</li>
                  ),
                }}
              >
                {contractContent}
              </ReactMarkdown>
            </div>
          </ScrollArea>
        </div>
      </Card>

      {/* Checkbox de Aceite */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="accept-contract"
            checked={accepted}
            onCheckedChange={handleAcceptChange}
            disabled={isLoading}
            className="mt-1"
          />
          <label
            htmlFor="accept-contract"
            className="text-sm font-medium leading-relaxed cursor-pointer flex-1"
          >
            Li e compreendi todos os termos e condições do contrato acima.
            Declaro estar ciente de que o aceite deste contrato é obrigatório
            para a realização dos atendimentos de fisioterapia.
          </label>
        </div>
      </Card>

      {/* Botões de Ação */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          variant="outline"
          onClick={onReject}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          ❌ Rejeitar
        </Button>
        <Button
          onClick={handleAccept}
          disabled={!accepted || isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Processando...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Aceitar e Assinar Contrato
            </>
          )}
        </Button>
      </div>

      {/* Mensagem de Ajuda */}
      <p className="text-xs text-center text-muted-foreground">
        Ao aceitar, você concorda com todos os termos estabelecidos no contrato.
        Uma cópia será enviada para seu WhatsApp e Email cadastrado.
      </p>
    </div>
  );
}
