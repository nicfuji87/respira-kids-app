// Laudo da avaliação gerado por regras. A fisio revisa e ajusta o texto
// antes de copiar ou baixar em PDF (o ajuste não altera a avaliação).

import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Copy, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';

// Fonte padrão do PDF não tem alguns símbolos
const paraPdf = (t: string) =>
  t.replace(/→/g, '->').replace(/−/g, '-').replace(/[“”]/g, '"');

export const LaudoAvaliacaoDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  texto: string;
  nomeArquivo: string;
}> = ({ open, onOpenChange, texto, nomeArquivo }) => {
  const [conteudo, setConteudo] = useState(texto);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (open) {
      setConteudo(texto);
      setCopiado(false);
    }
  }, [open, texto]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const baixarPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(paraPdf(conteudo), 180) as string[];
    let y = 18;
    for (const l of linhas) {
      if (y > 282) {
        doc.addPage();
        y = 18;
      }
      doc.text(l, 15, y);
      y += 5;
    }
    doc.save(`${nomeArquivo}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Laudo da avaliação</DialogTitle>
          <DialogDescription>
            Gerado a partir do que foi registrado. Revise e ajuste antes de
            enviar; o ajuste aqui não altera a avaliação.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          className="flex-1 min-h-[50vh] font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={copiar}>
            <Copy className="h-4 w-4 mr-1.5" />
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
          <Button onClick={baixarPdf}>
            <Download className="h-4 w-4 mr-1.5" />
            Baixar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
