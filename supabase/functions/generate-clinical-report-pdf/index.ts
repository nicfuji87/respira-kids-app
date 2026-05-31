// AI dev note: Edge Function que gera o PDF de um Relatório Clínico Manual.
// Reaproveita o estilo visual do `generate-contract-pdf`:
// - Cabeçalho (todas as páginas): `nome-logo-respira-kids.png` centralizado no topo
// - Fundo / marca d'água (todas as páginas): `respira-kids-mao.png` com transparência
// - Rodapé (todas as páginas): texto curto + número da página
// - Conteúdo: renderiza blocos pré-processados pelo front a partir do contentEditable
//   (parágrafos, títulos, listas, com formatação inline negrito/itálico/sublinhado)
// - Assinatura: carimbo do profissional logado (imagem PNG no bucket `respira-documents`)
//   OU linha textual com nome + registro_profissional (fallback quando não há imagem)
//
// Payload esperado (POST JSON):
// {
//   "patientName": string,
//   "patientInfo": { ... campos para o "bloco de identificação" no topo do relatório ... },
//   "reportDate": "YYYY-MM-DD",
//   "blocks": Block[],                  // conteúdo pré-processado do editor rich-text
//   "professional": {
//     "name": string,
//     "registro": string | null,
//     "signaturePath": string | null     // caminho dentro de respira-documents (ex.: "Bruna Cury.png")
//   }
// }
//
// Importante: a Edge Function recebe blocos já parseados pelo cliente para evitar
// um parser HTML pesado dentro do Deno. O cliente é o "source of truth" da
// formatação visual.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { jsPDF } from 'npm:jspdf@2.5.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESPIRA_KIDS_ADDRESS =
  'SEPS 709/909 Centro Medico Julio Adnet Bloco A Sala 311 - Asa Sul, Brasília - DF, 70390-095';

// AI dev note: Cache em escopo de módulo (sobrevive entre invocações no mesmo worker)
type LoadedImage = { base64: string; width: number; height: number };
const imageCache = new Map<string, LoadedImage>();

function readPngSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return { width, height };
}

async function loadImageAsBase64(url: string): Promise<LoadedImage | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const size = readPngSize(bytes);
    const base64 = encodeBase64(bytes);
    const loaded: LoadedImage = {
      base64,
      width: size?.width ?? 1,
      height: size?.height ?? 1,
    };
    imageCache.set(url, loaded);
    return loaded;
  } catch (e) {
    console.warn('⚠️ Erro ao carregar imagem:', url, e);
    return null;
  }
}

// AI dev note: Estruturas de dados que o cliente envia ao gerar o PDF.
type InlineSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type Block =
  | {
      type: 'paragraph';
      align?: 'left' | 'center' | 'right' | 'justify';
      segments: InlineSegment[];
    }
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      align?: 'left' | 'center' | 'right';
      segments: InlineSegment[];
    }
  | {
      type: 'list_item';
      ordered: boolean;
      indexInList: number; // 0-based dentro da lista
      segments: InlineSegment[];
    }
  | { type: 'spacer' };

type PatientInfo = {
  dataNascimento?: string | null;
  responsavelLegal?: string | null;
  responsavelFinanceiro?: string | null;
  pediatra?: string | null;
  pediatraCRM?: string | null;
  endereco?: string | null;
};

type ProfessionalInfo = {
  name: string;
  registro?: string | null;
  signaturePath?: string | null;
};

interface RequestBody {
  patientName: string;
  patientInfo?: PatientInfo;
  reportDate: string; // YYYY-MM-DD
  blocks: Block[];
  professional: ProfessionalInfo;
  generatedBy?: string | null;
}

function formatDateBRFromISO(iso: string): string {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateExtendedFromISO(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (!body?.patientName) throw new Error('patientName é obrigatório');
    if (!Array.isArray(body?.blocks))
      throw new Error('blocks (array) é obrigatório');
    if (!body?.reportDate) throw new Error('reportDate é obrigatório');
    if (!body?.professional?.name)
      throw new Error('professional.name é obrigatório');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const logoHeaderUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png`;
    const logoWatermarkUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/respira-kids-mao.png`;
    const signatureUrl = body.professional.signaturePath
      ? `${supabaseUrl}/storage/v1/object/public/respira-documents/${encodeURIComponent(body.professional.signaturePath)}`
      : null;

    const [logoHeaderData, logoWatermarkData, signatureData] =
      await Promise.all([
        loadImageAsBase64(logoHeaderUrl),
        loadImageAsBase64(logoWatermarkUrl),
        signatureUrl ? loadImageAsBase64(signatureUrl) : Promise.resolve(null),
      ]);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 20;
    const headerHeight = 32;
    const footerHeight = 30;
    const contentWidth = pageWidth - 2 * marginX;
    const contentTop = headerHeight + 4;
    const contentBottom = pageHeight - footerHeight;

    const HEADER_ALIAS = 'rk-header-logo';
    const WATERMARK_ALIAS = 'rk-watermark';
    const SIGNATURE_ALIAS = 'rk-signature';

    const addHeader = () => {
      if (!logoHeaderData) return;
      try {
        const ratio =
          logoHeaderData.width && logoHeaderData.height
            ? logoHeaderData.width / logoHeaderData.height
            : 1.543;
        const logoW = 34;
        const logoH = logoW / ratio;
        const logoX = (pageWidth - logoW) / 2;
        doc.addImage(
          `data:image/png;base64,${logoHeaderData.base64}`,
          'PNG',
          logoX,
          6,
          logoW,
          logoH,
          HEADER_ALIAS,
          'FAST'
        );
      } catch (e) {
        console.warn('⚠️ Erro ao adicionar logo do cabeçalho:', e);
      }
    };

    const addWatermark = () => {
      if (!logoWatermarkData) return;
      try {
        doc.saveGraphicsState();
        // @ts-expect-error - jsPDF GState (opacity) disponível em runtime
        doc.setGState(doc.GState({ opacity: 0.08 }));
        const wmW = 150;
        const wmH = 150;
        const wmX = (pageWidth - wmW) / 2;
        const wmY = (pageHeight - wmH) / 2;
        doc.addImage(
          `data:image/png;base64,${logoWatermarkData.base64}`,
          'PNG',
          wmX,
          wmY,
          wmW,
          wmH,
          WATERMARK_ALIAS,
          'FAST'
        );
        doc.restoreGraphicsState();
      } catch (e) {
        console.warn("⚠️ Erro ao adicionar marca d'água:", e);
      }
    };

    const addFooter = (pageNum: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);

      const pageNumberY = pageHeight - 8;
      const addressLines = doc.splitTextToSize(
        RESPIRA_KIDS_ADDRESS,
        contentWidth
      );
      const addressLineH = 3.2;
      let footerY = pageNumberY - 10;

      for (let i = addressLines.length - 1; i >= 0; i--) {
        doc.text(addressLines[i], pageWidth / 2, footerY, { align: 'center' });
        footerY -= addressLineH;
      }

      doc.setFontSize(8);
      const text = `Relatório Clínico - ${body.patientName} - ${formatDateBRFromISO(body.reportDate)}`;
      doc.text(text, pageWidth / 2, pageNumberY - 5, { align: 'center' });
      doc.text(`Página ${pageNum}`, pageWidth / 2, pageNumberY, {
        align: 'center',
      });
      doc.setTextColor(0, 0, 0);
    };

    const setStyle = (style: 'normal' | 'bold' | 'italic' | 'bolditalic') =>
      doc.setFont('helvetica', style);

    type Segment = {
      text: string;
      bold: boolean;
      italic: boolean;
      underline: boolean;
    };

    const normalizeSegments = (segs: InlineSegment[]): Segment[] =>
      segs.map((s) => ({
        text: (s.text ?? '')
          .replace(/\u00a0/g, ' ')
          .replace(/\t/g, ' ')
          .replace(/ {2,}/g, ' '),
        bold: !!s.bold,
        italic: !!s.italic,
        underline: !!s.underline,
      }));

    const applyFont = (s: Segment) => {
      if (s.bold && s.italic) setStyle('bolditalic');
      else if (s.bold) setStyle('bold');
      else if (s.italic) setStyle('italic');
      else setStyle('normal');
    };

    // Quebra de segmentos em linhas respeitando maxWidth
    const wrapSegments = (
      segments: Segment[],
      fontSize: number,
      maxWidth: number
    ): Segment[][] => {
      const lines: Segment[][] = [];
      let current: Segment[] = [];
      let currentWidth = 0;
      doc.setFontSize(fontSize);

      for (const seg of segments) {
        // Quebra explícita: \n dentro do texto cria uma linha nova
        const parts = seg.text.split('\n');
        for (let pi = 0; pi < parts.length; pi++) {
          const part = parts[pi];
          if (part.length === 0) {
            // Linha em branco entre quebras consecutivas
            if (pi < parts.length - 1) {
              while (
                current.length > 0 &&
                /^\s+$/.test(current[current.length - 1].text)
              ) {
                current.pop();
              }
              if (current.length > 0) lines.push(current);
              current = [];
              currentWidth = 0;
            }
            continue;
          }

          const tokens = part.split(/(\s+)/).filter((t) => t.length > 0);
          for (const token of tokens) {
            const isSpace = /^\s+$/.test(token);
            applyFont(seg);
            const tokenWidth = doc.getTextWidth(token);

            if (
              !isSpace &&
              currentWidth + tokenWidth > maxWidth &&
              current.length > 0
            ) {
              while (
                current.length > 0 &&
                /^\s+$/.test(current[current.length - 1].text)
              ) {
                const last = current.pop()!;
                applyFont(last);
                currentWidth -= doc.getTextWidth(last.text);
              }
              lines.push(current);
              current = [];
              currentWidth = 0;
              applyFont(seg);
            }

            if (isSpace && current.length === 0) continue;

            current.push({
              text: token,
              bold: seg.bold,
              italic: seg.italic,
              underline: seg.underline,
            });
            currentWidth += tokenWidth;
          }

          // Quebra entre partes do split('\n')
          if (pi < parts.length - 1) {
            while (
              current.length > 0 &&
              /^\s+$/.test(current[current.length - 1].text)
            ) {
              current.pop();
            }
            lines.push(current);
            current = [];
            currentWidth = 0;
          }
        }
      }
      if (current.length > 0) {
        while (
          current.length > 0 &&
          /^\s+$/.test(current[current.length - 1].text)
        ) {
          current.pop();
        }
        if (current.length > 0) lines.push(current);
      }
      return lines;
    };

    const renderLine = (
      line: Segment[],
      x: number,
      y: number,
      align: 'left' | 'center' | 'right' | 'justify',
      fontSize: number,
      maxWidth: number,
      isLastLine: boolean
    ) => {
      doc.setFontSize(fontSize);

      const measure = () => {
        let totalW = 0;
        for (const s of line) {
          applyFont(s);
          totalW += doc.getTextWidth(s.text);
        }
        return totalW;
      };

      const drawSegment = (s: Segment, cx: number) => {
        applyFont(s);
        doc.text(s.text, cx, y);
        const w = doc.getTextWidth(s.text);
        if (s.underline && !/^\s+$/.test(s.text)) {
          const underlineY = y + 0.6;
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
          doc.line(cx, underlineY, cx + w, underlineY);
        }
        return w;
      };

      if (align === 'center') {
        const totalW = measure();
        let cx = x + (maxWidth - totalW) / 2;
        for (const s of line) cx += drawSegment(s, cx);
        return;
      }

      if (align === 'right') {
        const totalW = measure();
        let cx = x + (maxWidth - totalW);
        for (const s of line) cx += drawSegment(s, cx);
        return;
      }

      if (align === 'justify' && !isLastLine) {
        let totalTextW = 0;
        let spaceCount = 0;
        for (const s of line) {
          applyFont(s);
          if (/^\s+$/.test(s.text)) spaceCount++;
          else totalTextW += doc.getTextWidth(s.text);
        }
        if (spaceCount > 0) {
          const extra = (maxWidth - totalTextW) / spaceCount;
          const maxExtra = 6;
          const useExtra = Math.min(Math.max(extra, 0), maxExtra);
          let cx = x;
          for (const s of line) {
            if (/^\s+$/.test(s.text)) {
              applyFont(s);
              cx += doc.getTextWidth(s.text) + useExtra;
            } else {
              cx += drawSegment(s, cx);
            }
          }
          return;
        }
      }

      let cx = x;
      for (const s of line) cx += drawSegment(s, cx);
    };

    // ======== Estado de paginação ========
    let pageNum = 1;
    addWatermark();
    addHeader();
    let currentY = contentTop;

    const ensureSpace = (needed: number) => {
      if (currentY + needed > contentBottom) {
        addFooter(pageNum);
        doc.addPage();
        pageNum++;
        addWatermark();
        addHeader();
        currentY = contentTop;
      }
    };

    // ======== Renderiza título e bloco de identificação ========
    // Título centralizado
    ensureSpace(14);
    setStyle('bold');
    doc.setFontSize(16);
    doc.setTextColor(26, 54, 93);
    doc.text('Relatório Clínico', pageWidth / 2, currentY + 6, {
      align: 'center',
    });
    currentY += 10;
    setStyle('normal');
    doc.setFontSize(10);
    doc.setTextColor(64, 196, 170);
    doc.text('Fisioterapia Pediátrica', pageWidth / 2, currentY + 4, {
      align: 'center',
    });
    currentY += 8;
    doc.setTextColor(0, 0, 0);

    // Bloco de identificação do paciente
    const infoLines: { label: string; value: string }[] = [];
    infoLines.push({ label: 'Paciente:', value: body.patientName });
    if (body.patientInfo?.dataNascimento) {
      infoLines.push({
        label: 'Data de Nascimento:',
        value: formatDateBRFromISO(body.patientInfo.dataNascimento),
      });
    }
    if (body.patientInfo?.responsavelLegal) {
      infoLines.push({
        label: 'Responsável Legal:',
        value: body.patientInfo.responsavelLegal,
      });
    }
    if (
      body.patientInfo?.responsavelFinanceiro &&
      body.patientInfo.responsavelFinanceiro !==
        body.patientInfo.responsavelLegal
    ) {
      infoLines.push({
        label: 'Responsável Financeiro:',
        value: body.patientInfo.responsavelFinanceiro,
      });
    }
    if (body.patientInfo?.pediatra) {
      const pediatra = body.patientInfo.pediatraCRM
        ? `${body.patientInfo.pediatra} (CRM: ${body.patientInfo.pediatraCRM})`
        : body.patientInfo.pediatra;
      infoLines.push({ label: 'Pediatra:', value: pediatra });
    }

    // Caixa do bloco
    const infoBoxPadding = 4;
    const infoLineH = 5;
    const infoBoxHeight = infoLines.length * infoLineH + infoBoxPadding * 2;
    ensureSpace(infoBoxHeight + 6);
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(64, 196, 170);
    doc.setLineWidth(0.4);
    doc.roundedRect(
      marginX,
      currentY,
      contentWidth,
      infoBoxHeight,
      1.5,
      1.5,
      'FD'
    );
    let infoY = currentY + infoBoxPadding + 4;
    for (const it of infoLines) {
      setStyle('bold');
      doc.setFontSize(9.5);
      doc.setTextColor(26, 54, 93);
      doc.text(it.label, marginX + infoBoxPadding, infoY);
      const labelW = doc.getTextWidth(it.label) + 2;
      setStyle('normal');
      doc.setTextColor(40, 40, 40);
      // Quebra o valor se for muito longo
      const valueMaxW = contentWidth - infoBoxPadding * 2 - labelW;
      const splitVal = doc.splitTextToSize(it.value, valueMaxW);
      doc.text(splitVal[0] ?? '', marginX + infoBoxPadding + labelW, infoY);
      // Se houver linhas adicionais, simplesmente ignora (caixa fixa) -
      // valores muito longos são raros e o conteúdo principal segue abaixo
      infoY += infoLineH;
    }
    currentY += infoBoxHeight + 6;
    doc.setTextColor(0, 0, 0);

    // ======== Renderiza blocos do conteúdo ========
    const fontSizeForBlock = (b: Block): number => {
      if (b.type === 'heading') {
        if (b.level === 1) return 14;
        if (b.level === 2) return 12.5;
        return 11.5;
      }
      return 10.5;
    };

    const lineHeightForFont = (fontSize: number): number =>
      fontSize * 0.352778 * 1.45;

    const renderBlock = (block: Block) => {
      if (block.type === 'spacer') {
        currentY += 3;
        return;
      }

      const fontSize = fontSizeForBlock(block);
      const lineH = lineHeightForFont(fontSize);

      if (block.type === 'list_item') {
        const indent = 6;
        const bullet = block.ordered ? `${block.indexInList + 1}.` : '•';
        const bulletSegment: Segment[] = [
          { text: `${bullet}  `, bold: false, italic: false, underline: false },
        ];
        const maxW = contentWidth - indent;
        const segs = normalizeSegments(block.segments);
        const lines = wrapSegments([...bulletSegment, ...segs], fontSize, maxW);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(lineH);
          renderLine(
            lines[i],
            marginX + indent,
            currentY + lineH * 0.75,
            'left',
            fontSize,
            maxW,
            i === lines.length - 1
          );
          currentY += lineH;
        }
        currentY += 1.5;
        return;
      }

      // paragraph + heading
      const segs = normalizeSegments(block.segments);
      // Forçar bold em headings
      if (block.type === 'heading') {
        for (const s of segs) s.bold = true;
      }

      const align = (block.align ?? 'justify') as
        | 'left'
        | 'center'
        | 'right'
        | 'justify';
      const lines = wrapSegments(segs, fontSize, contentWidth);

      // Headings ganham espaçamento antes e depois
      if (block.type === 'heading') {
        currentY += 3;
      }

      // Se bloco está completamente vazio, adiciona apenas um espaçamento curto
      if (lines.length === 0) {
        currentY += lineH * 0.7;
        return;
      }

      for (let i = 0; i < lines.length; i++) {
        ensureSpace(lineH);
        renderLine(
          lines[i],
          marginX,
          currentY + lineH * 0.75,
          align,
          fontSize,
          contentWidth,
          i === lines.length - 1
        );
        currentY += lineH;
      }

      if (block.type === 'heading') {
        currentY += 2;
        // Linha decorativa abaixo do heading nível 1
        if (block.level === 1) {
          doc.setDrawColor(64, 196, 170);
          doc.setLineWidth(0.4);
          doc.line(marginX, currentY, marginX + 40, currentY);
          currentY += 3;
        }
      } else {
        currentY += 2;
      }
    };

    for (const block of body.blocks) {
      renderBlock(block);
    }

    // ======== Assinatura ========
    const renderSignature = () => {
      const blockH = 32;
      ensureSpace(blockH + 12);
      currentY += 8;

      // "Brasília, <data extensa>"
      setStyle('normal');
      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 60);
      const localDate = `Brasília, ${formatDateExtendedFromISO(body.reportDate)}`;
      doc.text(localDate, marginX, currentY);
      currentY += 8;

      const centerX = pageWidth / 2;
      const lineX1 = marginX + 30;
      const lineX2 = pageWidth - marginX - 30;

      // Imagem da assinatura, se houver
      if (signatureData && signatureData.base64) {
        try {
          const ratio =
            signatureData.width && signatureData.height
              ? signatureData.width / signatureData.height
              : 2;
          const maxW = 55;
          const maxH = 18;
          let imgW = maxW;
          let imgH = imgW / ratio;
          if (imgH > maxH) {
            imgH = maxH;
            imgW = imgH * ratio;
          }
          const imgX = centerX - imgW / 2;
          const imgY = currentY;
          doc.addImage(
            `data:image/png;base64,${signatureData.base64}`,
            'PNG',
            imgX,
            imgY,
            imgW,
            imgH,
            SIGNATURE_ALIAS,
            'FAST'
          );
          currentY += imgH + 1;
        } catch (e) {
          console.warn('⚠️ Erro ao adicionar imagem de assinatura:', e);
          currentY += 14;
        }
      } else {
        // Fallback: espaço em branco antes da linha
        currentY += 14;
      }

      // Linha da assinatura
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(lineX1, currentY, lineX2, currentY);

      // Nome em negrito
      setStyle('bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(body.professional.name, centerX, currentY + 5, {
        align: 'center',
      });

      // Registro profissional (CREFITO etc.) ou rótulo
      if (body.professional.registro) {
        setStyle('normal');
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(body.professional.registro, centerX, currentY + 9.5, {
          align: 'center',
        });
      }
      doc.setTextColor(0, 0, 0);
    };

    renderSignature();

    // Rodapé final (auditoria) - pequeno, alinhado à direita
    if (body.generatedBy) {
      const now = new Date();
      const stamp = `Documento gerado por ${body.generatedBy} em ${now.toLocaleString('pt-BR')}`;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      const yAudit = Math.min(pageHeight - footerHeight - 6, currentY + 16);
      ensureSpace(4);
      doc.text(stamp, pageWidth - marginX, yAudit, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    addFooter(pageNum);

    const pdfBuffer = doc.output('arraybuffer');
    console.log('✅ PDF do relatório clínico gerado (', pageNum, 'páginas )');

    const safeName = `Relatorio Clinico - ${body.patientName}`.replace(
      /[<>:"/\\|?*]+/g,
      '_'
    );

    return new Response(pdfBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao gerar PDF do relatório clínico:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
