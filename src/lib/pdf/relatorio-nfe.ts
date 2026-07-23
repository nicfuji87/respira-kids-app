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
  // AI dev note: id_asaas + pago_em + período de atendimento existem para
  // IDENTIFICAR a cobrança. Sem eles, quem fatura por sessão (uma cobrança por
  // atendimento, criadas todas no mesmo lote) via linhas idênticas no PDF —
  // mesmo responsável, mesmo created_at, mesmo paciente, mesmo valor — e o
  // relatório parecia estar duplicando registros.
  id_asaas?: string | null;
  pago_em?: string | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  qtd_consultas?: number | null;
  responsavel_nome?: string | null;
  pacientes_atendidos?: string[] | null;
  paciente_nome?: string | null;
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

// AI dev note: lê a string SEM converter fuso. Usado onde o valor é hora de
// parede (data_hora dos agendamentos, gravada com offset +00 por acidente do
// tipo) ou data pura — converter nesses casos joga a sessão das 21h pro dia
// seguinte, e a data de pagamento pro dia anterior.
const parede = (v: string) => {
  const [datePart, timePart = ''] = String(v).split(/[T ]/);
  const [y, m, d] = datePart.split('-');
  const ok = Boolean(y && m && d);
  return {
    data: ok ? `${d}/${m}/${y}` : datePart,
    dataCurta: ok ? `${d}/${m}/${y.slice(2)}` : datePart,
    diaMes: ok ? `${d}/${m}` : datePart,
    hora: timePart.slice(0, 5),
  };
};

// created_at é instante real (default now() do banco). Mostramos só a data, em
// horário de Brasília. Se a string vier num formato que o Date não entende, cai
// no fatiamento — num relatório fiscal "Invalid Date" não pode vazar.
const dataBR = (iso: string) => {
  if (!iso) return '--/--/----';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return parede(iso).data;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

// AI dev note: pago_em é AMBÍGUO. Metade vem do webhook (instante real, com
// hora); a outra metade (~48% das faturas) vem do paymentDate do Asaas, que é
// uma DATA pura gravada como meia-noite UTC. Converter esse segundo caso para
// America/Sao_Paulo joga a data pro dia ANTERIOR (00:00Z = 21h em Brasília) e
// erra o dia do pagamento — inaceitável num relatório fiscal. Heurística:
// meia-noite UTC cravada => data pura, lê-se fatiando; qualquer outra hora =>
// instante real, converte o fuso.
const dataPagamentoBR = (iso?: string | null) => {
  if (!iso) return '—';
  const s = String(iso);
  return /T00:00:00(\.0+)?(Z|\+00:00)$/.test(s) ? parede(s).data : dataBR(s);
};

// "23/05/26 13:30" · "17/06 a 20/06/26 (2)" — o que separa uma cobrança da
// outra quando o faturamento é por sessão. No mesmo dia a HORA é o único
// discriminador humano (ex.: duas sessões em 17/05, 10h e 17h, cobradas
// separadamente), então ela aparece sempre que a fatura tem uma consulta só.
const atendimentoLabel = (f: FaturaNfeRow): string => {
  if (!f.periodo_inicio) return '—';
  const ini = parede(f.periodo_inicio);
  const fim = f.periodo_fim ? parede(f.periodo_fim) : ini;
  const qtd = f.qtd_consultas || 0;
  if (ini.dataCurta === fim.dataCurta) {
    return qtd > 1
      ? `${ini.dataCurta} (${qtd})`
      : `${ini.dataCurta} ${ini.hora}`.trim();
  }
  return `${ini.diaMes} a ${fim.dataCurta}${qtd > 1 ? ` (${qtd})` : ''}`;
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
        'Criada',
        'Pago em',
        'Atendimento',
        'Responsável',
        'Paciente(s)',
        'Empresa',
        'Valor',
        'Cobrança',
        'Status',
        'NFe',
      ],
    ],
    body: faturas.map((f) => {
      const ns = statusNfe(f.link_nfe);
      return [
        dataBR(f.created_at),
        dataPagamentoBR(f.pago_em),
        atendimentoLabel(f),
        f.responsavel_nome || '—',
        (f.pacientes_atendidos || []).join(', ') || f.paciente_nome || '—',
        f.empresa_razao_social || f.empresa_nome_fantasia || '—',
        brl(f.valor_total),
        f.id_asaas || '—',
        fatStatusLabel(f.status),
        nfeStatusLabel(ns),
      ];
    }),
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: [64, 106, 128], textColor: 255, fontSize: 7 },
    // AI dev note: a soma TEM que dar 273 = 297 (A4 paisagem) - 2x12 de margem.
    // Com largura fixa em todas as colunas o autoTable não tem o que redistribuir
    // e loga "N units width could not fit page" — que, apesar do nome, é o espaço
    // SOBRANDO (resizeWidth = disponível - soma). Mexeu numa, compense em outra.
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 16 },
      2: { cellWidth: 30 },
      3: { cellWidth: 42 },
      4: { cellWidth: 44 },
      // fonte 6 porque a razão social mais longa em uso ("F.S PACHECO
      // FISIOTERAPIA LTDA") precisa de 43mm a 7pt e só 37 a 6pt. Como a empresa
      // se repete em toda linha, deixá-la quebrar dobrava a altura do relatório
      // inteiro. Encurtar para nome_fantasia não serve: em nota fiscal quem
      // emite é a razão social.
      5: { cellWidth: 38, fontSize: 6 },
      6: { cellWidth: 21, halign: 'right' },
      // id_asaas é longo (pay_ + 16 chars); fonte menor evita quebrar em 2 linhas
      7: { cellWidth: 27, fontSize: 6 },
      8: { cellWidth: 18 },
      9: { cellWidth: 21 },
    },
    // Colore a célula da coluna NFe conforme o status
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
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
