// AI dev note: Geração do PDF de um POP / documento do Manual de Boas Práticas.
// Segue o padrão dos outros geradores em src/lib/pdf (jsPDF client-side).
//
// O que a vigilância procura primeiro NÃO é a estética: é o cabeçalho de controle
// de documento (código, versão, vigência, RT aprovador, próxima revisão) e o rodapé
// de identificação em TODAS as páginas. Se uma folha se soltar do fichário, ela
// ainda precisa se identificar sozinha. A identidade visual vem depois disso —
// ela sinaliza que é documento oficial da clínica, não baixado da internet.

import { jsPDF } from 'jspdf';
import type { DocumentoRow } from '@/types/qualidade';

// Paleta da marca (DESIGN.md)
const ROXO_TITULO: [number, number, number] = [71, 24, 78];
const AZUL_RESPIRA: [number, number, number] = [125, 207, 199];
const CINZA_TEXTO: [number, number, number] = [64, 64, 64];
const CINZA_CLARO: [number, number, number] = [130, 130, 130];

const MARGEM = 18;
const LARGURA_PAGINA = 210; // A4 retrato
const ALTURA_PAGINA = 297;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

export interface PopPdfEmpresa {
  razaoSocial: string;
  cnpj: string;
  endereco?: string;
}

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
  } catch {
    return '—';
  }
}

/**
 * Cabeçalho de controle: é a parte que dá validade ao documento.
 * Repetido só na 1ª página; as demais levam o cabeçalho compacto.
 */
function desenharCabecalhoPrincipal(
  doc: jsPDF,
  documento: DocumentoRow,
  empresa: PopPdfEmpresa
): number {
  // Faixa superior da marca
  doc.setFillColor(...AZUL_RESPIRA);
  doc.rect(0, 0, LARGURA_PAGINA, 4, 'F');

  let y = 16;

  // Identificação da clínica
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...ROXO_TITULO);
  doc.text('Respira Kids', MARGEM, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_CLARO);
  y += 5;
  doc.text(`${empresa.razaoSocial} · CNPJ ${empresa.cnpj}`, MARGEM, y);
  if (empresa.endereco) {
    y += 4;
    doc.text(empresa.endereco, MARGEM, y);
  }

  // Título do documento
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...ROXO_TITULO);
  const tituloLinhas = doc.splitTextToSize(
    `${documento.codigo} — ${documento.titulo}`,
    LARGURA_UTIL
  );
  doc.text(tituloLinhas, MARGEM, y);
  y += tituloLinhas.length * 6 + 3;

  // ---- Quadro de controle do documento ----
  const alturaQuadro = 22;
  doc.setDrawColor(...AZUL_RESPIRA);
  doc.setLineWidth(0.4);
  doc.rect(MARGEM, y, LARGURA_UTIL, alturaQuadro);

  const colX = [MARGEM + 3, MARGEM + 50, MARGEM + 97, MARGEM + 140];
  const linha1 = y + 7;
  const linha2 = y + 16;

  const campo = (x: number, yy: number, rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...CINZA_CLARO);
    doc.text(rotulo.toUpperCase(), x, yy - 3.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(valor, x, yy);
  };

  const statusLabel =
    documento.status === 'vigente'
      ? 'VIGENTE'
      : documento.status === 'rascunho'
        ? 'MINUTA — não aprovado'
        : 'SUBSTITUÍDO';

  campo(colX[0], linha1, 'Código', documento.codigo);
  campo(colX[1], linha1, 'Versão', String(documento.versao));
  campo(
    colX[2],
    linha1,
    'Vigente desde',
    formatarData(documento.vigente_desde)
  );
  campo(
    colX[3],
    linha1,
    'Próxima revisão',
    formatarData(documento.proxima_revisao)
  );

  campo(colX[0], linha2, 'Status', statusLabel);
  campo(
    colX[1],
    linha2,
    'Aprovado por',
    documento.aprovado_por_nome || '— aguardando —'
  );
  campo(colX[3], linha2, 'Registro', documento.aprovado_por_registro || '—');

  y += alturaQuadro + 8;

  // Aviso quando ainda é minuta — evita que rascunho circule como documento válido
  if (documento.status !== 'vigente') {
    doc.setFillColor(253, 235, 235);
    doc.rect(MARGEM, y - 4, LARGURA_UTIL, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(190, 60, 60);
    doc.text(
      'MINUTA — este documento ainda não foi aprovado pela Responsável Técnica.',
      MARGEM + 3,
      y + 2
    );
    y += 12;
  }

  return y;
}

function desenharRodape(
  doc: jsPDF,
  documento: DocumentoRow,
  pagina: number,
  totalPaginas: number
) {
  const y = ALTURA_PAGINA - 12;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y - 4, LARGURA_PAGINA - MARGEM, y - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...CINZA_CLARO);

  // Identificação em TODA página: se a folha se soltar, ainda se identifica
  doc.text(
    `${documento.codigo} v${documento.versao} · ${documento.titulo}`,
    MARGEM,
    y
  );
  doc.text(`Página ${pagina} de ${totalPaginas}`, LARGURA_PAGINA - MARGEM, y, {
    align: 'right',
  });
  doc.text('Respira Kids · documento controlado', MARGEM, y + 3.5);
}

/**
 * Renderiza o corpo em Markdown de forma simplificada.
 * Suporta: #/##/### títulos, listas com - e *, numeradas, **negrito** inline,
 * blockquote (>), separador (---) e tabelas em pipe (renderizadas como texto).
 * Não é um parser completo — é o subconjunto que os POPs usam.
 */
function desenharCorpo(
  doc: jsPDF,
  markdown: string,
  yInicial: number,
  onNovaPagina: () => number
): void {
  let y = yInicial;

  const quebrarSeNecessario = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > ALTURA_PAGINA - 22) {
      y = onNovaPagina();
    }
  };

  const linhas = markdown.split('\n');

  for (const bruta of linhas) {
    const linha = bruta.trimEnd();

    // Pula o cabeçalho de metadados (já está no quadro de controle) e separadores
    if (linha.trim() === '---' || linha.trim() === '') {
      y += 2.5;
      continue;
    }
    // Tabela de metadados do topo do markdown — o PDF já tem o quadro próprio
    if (
      /^\|\s*\*\*(Código|Versão|Status|Elaborado|Responsável|Estabelecimento|Próxima)/i.test(
        linha
      )
    ) {
      continue;
    }
    if (/^\|\s*\|?\s*-+\s*\|/.test(linha) || /^\|\s*\|\s*$/.test(linha)) {
      continue;
    }

    // Título nível 1 — já usado no cabeçalho, ignora repetição
    if (linha.startsWith('# ')) continue;

    if (linha.startsWith('## ')) {
      quebrarSeNecessario(14);
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(...ROXO_TITULO);
      const t = doc.splitTextToSize(limparInline(linha.slice(3)), LARGURA_UTIL);
      doc.text(t, MARGEM, y);
      y += t.length * 5.5 + 2;
      continue;
    }

    if (linha.startsWith('### ')) {
      quebrarSeNecessario(11);
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...CINZA_TEXTO);
      const t = doc.splitTextToSize(limparInline(linha.slice(4)), LARGURA_UTIL);
      doc.text(t, MARGEM, y);
      y += t.length * 5 + 1.5;
      continue;
    }

    // Blockquote — destaque com barra lateral
    if (linha.startsWith('> ')) {
      const texto = limparInline(linha.slice(2));
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.8);
      doc.setTextColor(...CINZA_TEXTO);
      const t = doc.splitTextToSize(texto, LARGURA_UTIL - 6);
      quebrarSeNecessario(t.length * 4.6 + 4);
      doc.setDrawColor(...AZUL_RESPIRA);
      doc.setLineWidth(1.2);
      doc.line(MARGEM + 1, y - 3.2, MARGEM + 1, y + t.length * 4.6 - 3);
      doc.text(t, MARGEM + 5, y);
      y += t.length * 4.6 + 3;
      continue;
    }

    // Linha de tabela em pipe — renderiza como "coluna: valor"
    if (linha.startsWith('|')) {
      const celulas = linha
        .split('|')
        .map((c) => limparInline(c.trim()))
        .filter((c) => c !== '');
      if (celulas.length === 0) continue;
      const texto = celulas.join('  ·  ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(...CINZA_TEXTO);
      const t = doc.splitTextToSize(texto, LARGURA_UTIL - 4);
      quebrarSeNecessario(t.length * 4.6);
      doc.text(t, MARGEM + 2, y);
      y += t.length * 4.6 + 0.8;
      continue;
    }

    // Item de lista (com marcador ou numerada)
    const itemLista = linha.match(/^\s*[-*]\s+(.*)$/);
    const itemNumerado = linha.match(/^\s*(\d+)\.\s+(.*)$/);

    if (itemLista || itemNumerado) {
      const marcador = itemNumerado ? `${itemNumerado[1]}.` : '•';
      const conteudo = limparInline(
        itemNumerado ? itemNumerado[2] : itemLista![1]
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.3);
      doc.setTextColor(...CINZA_TEXTO);
      const t = doc.splitTextToSize(conteudo, LARGURA_UTIL - 8);
      quebrarSeNecessario(t.length * 4.8 + 1);
      doc.text(marcador, MARGEM + 1.5, y);
      doc.text(t, MARGEM + 7, y);
      y += t.length * 4.8 + 1.2;
      continue;
    }

    // Parágrafo comum
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.3);
    doc.setTextColor(...CINZA_TEXTO);
    const t = doc.splitTextToSize(limparInline(linha), LARGURA_UTIL);
    quebrarSeNecessario(t.length * 4.8 + 1);
    doc.text(t, MARGEM, y);
    y += t.length * 4.8 + 2;
  }
}

/** Remove marcação inline que o jsPDF não renderiza (negrito, código, emoji de alerta). */
function limparInline(texto: string): string {
  return (
    texto
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // AI dev note: alternação, não character class — emoji com surrogate pair /
      // variation selector dentro de [] não casa corretamente.
      .replace(/🔴|⚠️|✅/g, '')
      .trim()
  );
}

export function gerarPopPdf(
  documento: DocumentoRow,
  empresa: PopPdfEmpresa
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const yInicial = desenharCabecalhoPrincipal(doc, documento, empresa);

  const novaPagina = (): number => {
    doc.addPage();
    // Faixa fina da marca no topo das páginas seguintes
    doc.setFillColor(...AZUL_RESPIRA);
    doc.rect(0, 0, LARGURA_PAGINA, 2.5, 'F');
    return 20;
  };

  desenharCorpo(doc, documento.conteudo_md, yInicial, novaPagina);

  // Rodapé em todas as páginas, com total correto
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    desenharRodape(doc, documento, i, total);
  }

  return doc;
}

export function baixarPopPdf(
  documento: DocumentoRow,
  empresa: PopPdfEmpresa
): void {
  const doc = gerarPopPdf(documento, empresa);
  const sufixo = documento.status === 'vigente' ? '' : '-MINUTA';
  doc.save(`${documento.codigo}-v${documento.versao}${sufixo}.pdf`);
}

/** Abre o PDF em nova aba, já no diálogo de impressão. */
export function imprimirPopPdf(
  documento: DocumentoRow,
  empresa: PopPdfEmpresa
): void {
  const doc = gerarPopPdf(documento, empresa);
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(url, '_blank', 'noopener,noreferrer');
}
