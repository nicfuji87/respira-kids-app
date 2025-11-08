// AI dev note: ContractViewModal - Modal Composed para visualização de contratos
// Exibe conteúdo do contrato e permite download de PDF

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { FileDown, X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/primitives/use-toast';

interface ContractViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  contractContent?: string;
  pdfUrl?: string;
  patientName: string;
}

export const ContractViewModal = React.memo<ContractViewModalProps>(
  ({ isOpen, onClose, contractId, contractContent, pdfUrl, patientName }) => {
    const [downloading, setDownloading] = useState(false);
    const { toast } = useToast();

    const handleDownloadPDF = async () => {
      try {
        setDownloading(true);

        if (pdfUrl && pdfUrl !== 'Aguardando') {
          // Se já tem URL do PDF, abrir em nova aba
          window.open(pdfUrl, '_blank');
        } else {
          // Gerar PDF via Edge Function
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const response = await fetch(
            `${supabaseUrl}/functions/v1/generate-contract-pdf`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
              body: JSON.stringify({
                contractId,
                patientName,
              }),
            }
          );

          if (!response.ok) {
            throw new Error('Erro ao gerar PDF');
          }

          // Criar blob e forçar download
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;

          // Nome do arquivo com data
          const today = new Date()
            .toLocaleDateString('pt-BR')
            .replace(/\//g, '-');
          a.download = `Contrato_${patientName.replace(/\s+/g, '_')}_${today}.pdf`;

          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          toast({
            title: 'PDF baixado com sucesso!',
            description: 'O contrato foi salvo em sua pasta de downloads.',
          });
        }
      } catch (err) {
        console.error('Erro ao baixar PDF:', err);
        toast({
          title: 'Erro ao baixar PDF',
          description: 'Não foi possível gerar o PDF. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setDownloading(false);
      }
    };

    if (!contractContent) {
      return null;
    }

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Contrato de Prestação de Serviços
            </DialogTitle>
          </DialogHeader>

          {/* Conteúdo do contrato com scroll */}
          <ScrollArea className="flex-1 px-6 py-4 max-h-[60vh]">
            <div className="space-y-6">
              <ReactMarkdown
                components={{
                  // Reutilizar estilos do ContractReviewStep
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
                    <ul className="list-disc ml-8 mb-6 space-y-2">
                      {children}
                    </ul>
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="w-full sm:w-auto"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Baixar PDF
                </>
              )}
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <X className="h-4 w-4 mr-2" />
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ContractViewModal.displayName = 'ContractViewModal';
