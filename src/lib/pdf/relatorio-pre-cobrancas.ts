// AI dev note: PDF do "Funil de Pré-cobranças" (aba Financeiro > Faturas).
// Exporta, em 1 clique, as pré-cobranças de um período com o desfecho de cada
// uma (paga / aguardando pagamento / pendente / expirada / cancelada) e o nº de
// lembretes já enviados. jsPDF + jspdf-autotable (API funcional).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Desfecho =
  | 'paga'
  | 'aguardando_pagamento'
  | 'pendente'
  | 'expirada'
  | 'cancelada'
  | 'estornada';

export const DESFECHO_LABEL: Record<Desfecho, string> = {
  paga: 'Paga',
  aguardando_pagamento: 'Aguardando pagamento',
  pendente: 'Pendente',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  estornada: 'Estornada',
};

const DESFECHO_COR: Record<Desfecho, [number, number, number]> = {
  paga: [16, 122, 87],
  aguardando_pagamento: [180, 130, 20],
  pendente: [200, 120, 20],
  expirada: [200, 45, 45],
  cancelada: [120, 120, 120],
  estornada: [124, 58, 173],
};

export interface PreCobrancaReportRow {
  responsavel_nome?: string | null;
  paciente_nome?: string | null;
  empresa_nome?: string | null;
  valor_base: number;
  criado_em: string;
  vencimento?: string | null;
  desfecho: Desfecho;
  lembretes_enviados: number;
}

export interface PreCobrancaReportMeta {
  periodoLabel: string;
  filtrosLabel?: string;
  geradoEm: Date;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

const dataBR = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return String(iso).split('T')[0];
  }
};

export function gerarRelatorioPreCobrancasPdf(
  linhas: PreCobrancaReportRow[],
  meta: PreCobrancaReportMeta
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Resumo por desfecho
  const resumo: Record<Desfecho, number> = {
    paga: 0,
    aguardando_pagamento: 0,
    pendente: 0,
    expirada: 0,
    cancelada: 0,
    estornada: 0,
  };
  let valorPago = 0;
  let valorTotal = 0;
  for (const l of linhas) {
    resumo[l.desfecho]++;
    valorTotal += l.valor_base || 0;
    if (l.desfecho === 'paga') valorPago += l.valor_base || 0;
  }
  const consideradas = linhas.length - resumo.cancelada;
  const conversao =
    consideradas > 0 ? Math.round((resumo.paga / consideradas) * 100) : 0;

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('Funil de Pré-cobranças — Respira Kids', marginX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Período (criação): ${meta.periodoLabel}`, marginX, 23);
  if (meta.filtrosLabel) doc.text(`Filtros: ${meta.filtrosLabel}`, marginX, 28);
  doc.text(
    `Gerado em ${meta.geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    pageWidth - marginX,
    16,
    { align: 'right' }
  );

  const resumoY = meta.filtrosLabel ? 34 : 30;
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${linhas.length} pré-cobrança(s) · ${brl(valorTotal)}  |  ` +
      `Pagas: ${resumo.paga} (${conversao}% · ${brl(valorPago)})   ` +
      `Aguardando: ${resumo.aguardando_pagamento}   Pendentes: ${resumo.pendente}   ` +
      `Expiradas: ${resumo.expirada}   Canceladas: ${resumo.cancelada}`,
    marginX,
    resumoY
  );

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'Responsável',
        'Paciente',
        'Empresa',
        'Valor',
        'Criada em',
        'Vencimento',
        'Desfecho',
        'Lembretes',
      ],
    ],
    body: linhas.map((l) => [
      l.responsavel_nome || '—',
      l.paciente_nome || '—',
      l.empresa_nome || '—',
      brl(l.valor_base),
      dataBR(l.criado_em),
      dataBR(l.vencimento),
      DESFECHO_LABEL[l.desfecho],
      String(l.lembretes_enviados ?? 0),
    ]),
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [64, 106, 128], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 52 },
      2: { cellWidth: 38 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 24 },
      5: { cellWidth: 24 },
      6: { cellWidth: 34 },
      7: { cellWidth: 20, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const d = linhas[data.row.index]?.desfecho;
        if (d) {
          data.cell.styles.textColor = DESFECHO_COR[d];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Respira Kids · página ${data.pageNumber} de ${doc.getNumberOfPages()}`,
        pageWidth - marginX,
        doc.internal.pageSize.getHeight() - 6,
        { align: 'right' }
      );
    },
  });

  const stamp = meta.geradoEm.toISOString().split('T')[0];
  doc.save(`funil-pre-cobrancas-${stamp}.pdf`);
}
