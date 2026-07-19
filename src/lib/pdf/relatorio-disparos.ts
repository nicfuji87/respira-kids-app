// AI dev note: PDF do "Log de disparos" (aba Financeiro > Faturas). Exporta o
// status de disparo/envio de cada cobrança de um período/lote. jsPDF +
// jspdf-autotable (API funcional). DISPARO_LABEL/DisparoStatus são reusados pela
// tela (FinancialDisparosLog) para não duplicar rótulos.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type DisparoStatus =
  | 'enviado'
  | 'falhou'
  | 'entregue_n8n'
  | 'na_fila'
  | 'erro_entrega'
  | 'erro_geracao'
  | 'sem_disparo';

export const DISPARO_LABEL: Record<DisparoStatus, string> = {
  enviado: 'Enviado',
  falhou: 'Falhou',
  entregue_n8n: 'Entregue ao n8n',
  na_fila: 'Na fila',
  erro_entrega: 'Erro de entrega',
  erro_geracao: 'Erro na geração',
  sem_disparo: 'Sem disparo',
};

const DISPARO_COR: Record<DisparoStatus, [number, number, number]> = {
  enviado: [16, 122, 87],
  falhou: [200, 45, 45],
  entregue_n8n: [40, 90, 150],
  na_fila: [180, 130, 20],
  erro_entrega: [200, 45, 45],
  erro_geracao: [160, 40, 40],
  sem_disparo: [120, 120, 120],
};

export interface DisparoReportRow {
  responsavel_nome?: string | null;
  responsavel_telefone?: string | number | null;
  paciente_nome?: string | null;
  empresa_nome?: string | null;
  valor_base: number;
  criado_em: string;
  disparo_status: DisparoStatus;
  envio_detalhe?: string | null;
}

export interface DisparoReportMeta {
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

export function gerarRelatorioDisparosPdf(
  linhas: DisparoReportRow[],
  meta: DisparoReportMeta
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Resumo por status
  const resumo = {
    enviado: 0,
    falhou: 0,
    entregue_n8n: 0,
    na_fila: 0,
    erro_entrega: 0,
    erro_geracao: 0,
    sem_disparo: 0,
  };
  for (const l of linhas) resumo[l.disparo_status]++;
  const problemas =
    resumo.falhou + resumo.erro_entrega + resumo.erro_geracao + resumo.na_fila;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('Log de disparos — Respira Kids', marginX, 16);

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
    `${linhas.length} disparo(s)  |  Enviados: ${resumo.enviado}   Falhou: ${resumo.falhou}   ` +
      `Entregue ao n8n: ${resumo.entregue_n8n}   Na fila: ${resumo.na_fila}   ` +
      `Erros: ${resumo.erro_entrega + resumo.erro_geracao}   ` +
      `(A verificar: ${problemas})`,
    marginX,
    resumoY
  );

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'Responsável',
        'Telefone',
        'Paciente',
        'Empresa',
        'Valor',
        'Criado em',
        'Status',
        'Detalhe',
      ],
    ],
    body: linhas.map((l) => [
      l.responsavel_nome || '—',
      l.responsavel_telefone ? String(l.responsavel_telefone) : '—',
      l.paciente_nome || '—',
      l.empresa_nome || '—',
      brl(l.valor_base),
      dataBR(l.criado_em),
      DISPARO_LABEL[l.disparo_status],
      l.envio_detalhe || '',
    ]),
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [64, 106, 128], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 28 },
      2: { cellWidth: 44 },
      3: { cellWidth: 32 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22 },
      6: { cellWidth: 28 },
      7: { cellWidth: 33 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const s = linhas[data.row.index]?.disparo_status;
        if (s) {
          data.cell.styles.textColor = DISPARO_COR[s];
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
  doc.save(`log-disparos-${stamp}.pdf`);
}
