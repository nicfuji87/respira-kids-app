// AI dev note: Geração client-side do PDF do "Relatório de Notas Fiscais".
// Usado pela aba Financeiro > Faturas (FinancialFaturasList) para exportar, em 1
// clique, a lista de faturas do período/filtros ativos com o status de NFe de cada
// uma (emitida / com erro / não emitida). Usa jsPDF + jspdf-autotable (API
// funcional autoTable(doc, ...), não o plugin no protótipo). Landscape p/ caber os
// nomes longos de responsável/paciente sem truncar demais.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type NfeStatus = 'emitida' | 'erro' | 'nao_emitida' | 'sincronizando';

// AI dev note: fonte única da derivação do status de NFe a partir de link_nfe.
// '' / null => não emitida · 'erro' · 'sincronizando' · qualquer URL => emitida.
// Reusada pelo filtro da lista para não duplicar a regra.
export function statusNfe(linkNfe?: string | null): NfeStatus {
  const v = (linkNfe || '').trim();
  if (v === 'erro') return 'erro';
  if (v === 'sincronizando') return 'sincronizando';
  if (v !== '') return 'emitida';
  return 'nao_emitida';
}

export function nfeStatusLabel(status: NfeStatus): string {
  switch (status) {
    case 'emitida':
      return 'Emitida';
    case 'erro':
      return 'Com erro';
    case 'sincronizando':
      return 'Sincronizando';
    case 'nao_emitida':
      return 'Não emitida';
  }
}

// Linha mínima que o relatório precisa de cada fatura (subconjunto da view).
export interface FaturaNfeRow {
  created_at: string;
  responsavel_nome?: string | null;
  pacientes_atendidos?: string[] | null;
  empresa_razao_social?: string | null;
  empresa_nome_fantasia?: string | null;
  valor_total: number;
  status: string;
  link_nfe?: string | null;
}

export interface RelatorioNfeMeta {
  periodoLabel: string; // ex.: "Mês atual" ou "01/06/2026 a 30/06/2026"
  filtrosLabel?: string; // ex.: "Status: pago · NFe: não emitida · Empresa: BC"
  geradoEm: Date;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v || 0
  );

// created_at vem em ISO (UTC). Mostramos só a data, em horário de Brasília.
const dataBR = (iso: string) => {
  if (!iso) return '--/--/----';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return iso.split('T')[0];
  }
};

const fatStatusLabel = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';

export function gerarRelatorioNfePdf(
  faturas: FaturaNfeRow[],
  meta: RelatorioNfeMeta
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Resumo por status de NFe
  const resumo = { emitida: 0, erro: 0, nao_emitida: 0, sincronizando: 0 };
  let valorTotal = 0;
  for (const f of faturas) {
    resumo[statusNfe(f.link_nfe)]++;
    valorTotal += f.valor_total || 0;
  }

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('Relatório de Notas Fiscais — Respira Kids', marginX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Período: ${meta.periodoLabel}`, marginX, 23);
  if (meta.filtrosLabel) {
    doc.text(`Filtros: ${meta.filtrosLabel}`, marginX, 28);
  }
  doc.text(
    `Gerado em ${meta.geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    pageWidth - marginX,
    16,
    { align: 'right' }
  );

  // Linha de resumo
  const resumoY = meta.filtrosLabel ? 34 : 30;
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `${faturas.length} fatura(s) · ${brl(valorTotal)}  |  ` +
      `Emitidas: ${resumo.emitida}   Com erro: ${resumo.erro}   ` +
      `Não emitidas: ${resumo.nao_emitida}` +
      (resumo.sincronizando ? `   Sincronizando: ${resumo.sincronizando}` : ''),
    marginX,
    resumoY
  );

  // Tabela
  const cores: Record<NfeStatus, [number, number, number]> = {
    emitida: [16, 122, 87],
    erro: [200, 45, 45],
    nao_emitida: [120, 120, 120],
    sincronizando: [180, 130, 20],
  };

  autoTable(doc, {
    startY: resumoY + 4,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'Data',
        'Responsável',
        'Paciente(s)',
        'Empresa',
        'Valor',
        'Status',
        'NFe',
      ],
    ],
    body: faturas.map((f) => {
      const ns = statusNfe(f.link_nfe);
      return [
        dataBR(f.created_at),
        f.responsavel_nome || '—',
        (f.pacientes_atendidos || []).join(', ') || '—',
        f.empresa_razao_social || f.empresa_nome_fantasia || '—',
        brl(f.valor_total),
        fatStatusLabel(f.status),
        nfeStatusLabel(ns),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [64, 106, 128], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 55 },
      2: { cellWidth: 62 },
      3: { cellWidth: 45 },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 22 },
      6: { cellWidth: 25 },
    },
    // Colore a célula da coluna NFe conforme o status
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const ns = statusNfe(faturas[data.row.index]?.link_nfe);
        data.cell.styles.textColor = cores[ns];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    // Rodapé com numeração
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Respira Kids · página ${data.pageNumber} de ${page}`,
        pageWidth - marginX,
        doc.internal.pageSize.getHeight() - 6,
        { align: 'right' }
      );
    },
  });

  const stamp = meta.geradoEm.toISOString().split('T')[0];
  doc.save(`relatorio-nfe-${stamp}.pdf`);
}
