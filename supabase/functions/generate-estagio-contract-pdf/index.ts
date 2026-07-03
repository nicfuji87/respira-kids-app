import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { jsPDF } from 'npm:jspdf@2.5.2';

// AI dev note: PDF do Termo de Compromisso de Estágio. Espelha generate-contract-pdf
// (mesmo renderizador markdown: **negrito**, linha inteira **...** = seção,
// `---` = separador, `•` = bullet, corpo justificado), mas:
//  - lê o texto de estagio_contratos.conteudo_final (já preenchido pelo front);
//  - bloco de assinaturas do estágio (Parte Concedente / IES / Estagiário), sem
//    imagens estampadas — todos assinam digitalmente na Assinafy;
//  - rodapé neutro (Termo de Compromisso de Estágio).
// Mantém verify_jwt: true (front chama com anon key no Authorization).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Segment = { text: string; bold: boolean };
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
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function loadImageAsBase64(url: string): Promise<LoadedImage | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const size = readPngSize(bytes);
    const loaded: LoadedImage = {
      base64: encodeBase64(bytes),
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { contractId, estagiarioNome } = await req.json();
    if (!contractId) throw new Error('contractId é obrigatório');

    const { data: contract, error } = await supabaseClient
      .from('estagio_contratos')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract)
      throw new Error('Contrato de estágio não encontrado');

    const variaveis =
      (contract.variaveis_utilizadas as Record<string, string>) || {};
    const nomeEstagiario =
      estagiarioNome || variaveis.estagiarioNome || 'Estagiário(a)';

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const logoHeaderUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png`;
    const logoWatermarkUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/respira-kids-mao.png`;

    const [logoHeaderData, logoWatermarkData] = await Promise.all([
      loadImageAsBase64(logoHeaderUrl),
      loadImageAsBase64(logoWatermarkUrl),
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
    const footerHeight = 22;
    const contentWidth = pageWidth - 2 * marginX;
    const contentTop = headerHeight + 4;
    const contentBottom = pageHeight - footerHeight;

    const HEADER_ALIAS = 'rk-header-logo';
    const WATERMARK_ALIAS = 'rk-watermark';

    const addHeader = () => {
      if (!logoHeaderData) return;
      try {
        const ratio =
          logoHeaderData.width && logoHeaderData.height
            ? logoHeaderData.width / logoHeaderData.height
            : 1.543;
        const logoW = 34;
        const logoH = logoW / ratio;
        doc.addImage(
          `data:image/png;base64,${logoHeaderData.base64}`,
          'PNG',
          (pageWidth - logoW) / 2,
          6,
          logoW,
          logoH,
          HEADER_ALIAS,
          'FAST'
        );
      } catch (e) {
        console.warn('⚠️ header logo:', e);
      }
    };

    const addWatermark = () => {
      if (!logoWatermarkData) return;
      try {
        doc.saveGraphicsState();
        // @ts-expect-error - jsPDF GState (opacity) disponível em runtime
        doc.setGState(doc.GState({ opacity: 0.08 }));
        const wm = 150;
        doc.addImage(
          `data:image/png;base64,${logoWatermarkData.base64}`,
          'PNG',
          (pageWidth - wm) / 2,
          (pageHeight - wm) / 2,
          wm,
          wm,
          WATERMARK_ALIAS,
          'FAST'
        );
        doc.restoreGraphicsState();
      } catch (e) {
        console.warn('⚠️ watermark:', e);
      }
    };

    const addFooter = (pageNum: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      const text = `Página integrante do Termo de Compromisso de Estágio celebrado entre ${variaveis.concedenteRazaoSocial || 'a Concedente'} e ${nomeEstagiario}.`;
      const lines = doc.splitTextToSize(text, contentWidth);
      const lineHeight = 3.5;
      const pageNumberY = pageHeight - 8;
      let y = pageNumberY - 4 - lines.length * lineHeight;
      for (const line of lines) {
        doc.text(line, pageWidth / 2, y, { align: 'center' });
        y += lineHeight;
      }
      doc.text(`${pageNum}`, pageWidth / 2, pageNumberY, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    };

    const setStyle = (style: 'normal' | 'bold') =>
      doc.setFont('helvetica', style);

    const parseInline = (text: string): Segment[] => {
      if (!text) return [];
      return text
        .split(/\*\*/g)
        .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
        .filter((p) => p.text.length > 0);
    };

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
        setStyle(seg.bold ? 'bold' : 'normal');
        const tokens = seg.text.split(/(\s+)/).filter((t) => t.length > 0);
        for (const token of tokens) {
          const isSpace = /^\s+$/.test(token);
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
              setStyle(last.bold ? 'bold' : 'normal');
              currentWidth -= doc.getTextWidth(last.text);
            }
            lines.push(current);
            current = [];
            currentWidth = 0;
            setStyle(seg.bold ? 'bold' : 'normal');
          }
          if (isSpace && current.length === 0) continue;
          current.push({ text: token, bold: seg.bold });
          currentWidth += tokenWidth;
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
      align: 'left' | 'center' | 'justify',
      fontSize: number,
      maxWidth: number,
      isLastLine: boolean
    ) => {
      doc.setFontSize(fontSize);
      const measure = () => {
        let totalW = 0;
        for (const s of line) {
          setStyle(s.bold ? 'bold' : 'normal');
          totalW += doc.getTextWidth(s.text);
        }
        return totalW;
      };
      if (align === 'center') {
        let cx = x + (maxWidth - measure()) / 2;
        for (const s of line) {
          setStyle(s.bold ? 'bold' : 'normal');
          doc.text(s.text, cx, y);
          cx += doc.getTextWidth(s.text);
        }
        return;
      }
      if (align === 'justify' && !isLastLine) {
        let totalTextW = 0;
        let spaceCount = 0;
        for (const s of line) {
          setStyle(s.bold ? 'bold' : 'normal');
          if (/^\s+$/.test(s.text)) spaceCount++;
          else totalTextW += doc.getTextWidth(s.text);
        }
        if (spaceCount > 0) {
          const extra = (maxWidth - totalTextW) / spaceCount;
          const useExtra = Math.min(Math.max(extra, 0), 6);
          let cx = x;
          for (const s of line) {
            setStyle(s.bold ? 'bold' : 'normal');
            if (/^\s+$/.test(s.text)) cx += useExtra;
            else {
              doc.text(s.text, cx, y);
              cx += doc.getTextWidth(s.text);
            }
          }
          return;
        }
      }
      let cx = x;
      for (const s of line) {
        setStyle(s.bold ? 'bold' : 'normal');
        doc.text(s.text, cx, y);
        cx += doc.getTextWidth(s.text);
      }
    };

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

    type ParagraphOpts = {
      align?: 'left' | 'center' | 'justify';
      fontSize?: number;
      boldAll?: boolean;
      spacingAfter?: number;
      spacingBefore?: number;
      indent?: number;
    };

    const renderParagraph = (text: string, opts: ParagraphOpts = {}) => {
      const align = opts.align ?? 'justify';
      const fontSize = opts.fontSize ?? 10.5;
      const spacingAfter = opts.spacingAfter ?? 2.5;
      const spacingBefore = opts.spacingBefore ?? 0;
      const indent = opts.indent ?? 0;
      let segments = parseInline(text);
      if (opts.boldAll) segments = segments.map((s) => ({ ...s, bold: true }));
      const maxW = contentWidth - indent;
      const lines = wrapSegments(segments, fontSize, maxW);
      const lineH = fontSize * 0.352778 * 1.35;
      if (spacingBefore > 0) currentY += spacingBefore;
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(lineH);
        renderLine(
          lines[i],
          marginX + indent,
          currentY + lineH * 0.75,
          align,
          fontSize,
          maxW,
          i === lines.length - 1
        );
        currentY += lineH;
      }
      currentY += spacingAfter;
    };

    const content = (contract.conteudo_final || '').replace(/\r\n/g, '\n');
    const rawLines = content.split('\n');
    let firstNonEmptySeen = false;

    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) {
        currentY += 2.5;
        continue;
      }
      if (/^-{3,}$/.test(line)) {
        ensureSpace(6);
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.2);
        doc.line(
          marginX + 30,
          currentY + 2,
          pageWidth - marginX - 30,
          currentY + 2
        );
        currentY += 6;
        continue;
      }
      const wholeBoldMatch = /^\*\*(.+)\*\*$/.exec(line);
      if (wholeBoldMatch) {
        const inner = wholeBoldMatch[1].trim();
        const isTitle = !firstNonEmptySeen;
        firstNonEmptySeen = true;
        if (isTitle) {
          renderParagraph(inner, {
            align: 'center',
            fontSize: 13,
            boldAll: true,
            spacingBefore: 2,
            spacingAfter: 6,
          });
          continue;
        }
        const isAllCaps =
          /^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ0-9\s,.\-:/()"']+$/.test(inner) &&
          inner.length < 90 &&
          /[A-Z]/.test(inner);
        renderParagraph(inner, {
          align: isAllCaps ? 'center' : 'left',
          fontSize: isAllCaps ? 11 : 10.5,
          boldAll: true,
          spacingBefore: isAllCaps ? 4 : 2,
          spacingAfter: isAllCaps ? 3 : 2,
        });
        continue;
      }
      firstNonEmptySeen = true;
      const bulletMatch = /^([•·-])\s+(.*)$/.exec(line);
      if (bulletMatch) {
        renderParagraph(`•  ${bulletMatch[2]}`, {
          align: 'left',
          fontSize: 10.5,
          spacingAfter: 1.5,
          indent: 4,
        });
        continue;
      }
      renderParagraph(line, {
        align: 'justify',
        fontSize: 10.5,
        spacingAfter: 3,
      });
    }

    // Bloco de assinaturas do estágio (todas digitais na Assinafy — só as linhas).
    const renderSignatureBlock = (label: string, nome: string) => {
      const blockHeight = 26;
      ensureSpace(blockHeight + 6);
      const lineY = currentY + 12;
      const lineX1 = marginX + 20;
      const lineX2 = pageWidth - marginX - 20;
      const centerX = (lineX1 + lineX2) / 2;
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(lineX1, lineY, lineX2, lineY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(nome, centerX, lineY + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(label, centerX, lineY + 10, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      currentY += blockHeight + 4;
    };

    currentY += 8;
    renderSignatureBlock(
      'Parte Concedente (Clínica) — representante legal',
      variaveis.representanteLegal || variaveis.concedenteRazaoSocial || ''
    );
    renderSignatureBlock(
      'Instituição de Ensino — representante',
      variaveis.iesNome || ''
    );
    renderSignatureBlock('Estagiário(a)', nomeEstagiario);
    if (variaveis.responsavelLegal) {
      renderSignatureBlock(
        'Responsável legal (estagiário menor de 18 anos)',
        variaveis.responsavelLegal
      );
    }

    addFooter(pageNum);

    const pdfBuffer = doc.output('arraybuffer');
    const safeFileName = `Termo de Estagio - ${nomeEstagiario}`.replace(
      /[<>:"/\\|?*]+/g,
      '_'
    );
    const asciiFileName = `${safeFileName}.pdf`
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '_');
    const contentDisposition =
      `attachment; filename="${asciiFileName}"; ` +
      `filename*=UTF-8''${encodeURIComponent(`${safeFileName}.pdf`)}`;

    return new Response(pdfBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao gerar PDF do estágio:', error);
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
