import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jsPDF } from 'npm:jspdf@2.5.2';

// AI dev note: Edge Function que gera o PDF do contrato do paciente.
// - Cabeçalho (todas as páginas): `nome-logo-respira-kids.png` centralizado no topo
// - Fundo / marca d'água (todas as páginas): `respira-kids-mao.png` com transparência
// - Rodapé (todas as páginas): "Página integrante do Contrato..." + número da página
// - Renderiza Markdown básico presente no template do contrato:
//     * `**texto**` inline -> negrito
//     * Linha inteira entre `**...**` -> título/seção (centralizado quando CAIXA ALTA)
//     * Separador `---` -> linha horizontal fina
//     * Bullets (•, -) e itens numerados preservam indentação
// - Texto do corpo é justificado (exceto última linha do parágrafo)
//
// IMPORTANTE: manter `verify_jwt: true` (o front chama com o anon key no Authorization).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Segment = { text: string; bold: boolean };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { contractId, patientName } = await req.json();
    if (!contractId) throw new Error('contractId é obrigatório');

    console.log('📄 Gerando PDF do contrato:', contractId);

    const { data: contract, error } = await supabaseClient
      .from('user_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      console.error('❌ Erro ao buscar contrato:', error);
      throw new Error('Contrato não encontrado');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const logoHeaderUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png`;
    const logoWatermarkUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/respira-kids-mao.png`;

    // AI dev note: converte imagem em base64 sem estourar a stack com arrays grandes
    const imageToBase64 = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(
            ...Array.from(bytes.subarray(i, i + chunkSize))
          );
        }
        return btoa(binary);
      } catch (e) {
        console.warn('⚠️ Erro ao carregar imagem:', url, e);
        return null;
      }
    };

    const [logoHeaderData, logoWatermarkData] = await Promise.all([
      imageToBase64(logoHeaderUrl),
      imageToBase64(logoWatermarkUrl),
    ]);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 20;
    const headerHeight = 28; // área reservada para o logo do cabeçalho
    const footerHeight = 22; // área reservada para o rodapé (texto + numeração)
    const contentWidth = pageWidth - 2 * marginX;
    const contentTop = headerHeight + 4;
    const contentBottom = pageHeight - footerHeight;

    const variaveis =
      (contract.variaveis_utilizadas as Record<string, string>) || {};
    const contratante =
      variaveis.responsavelLegalNome || variaveis.contratante || '';
    const hoje = variaveis.hoje || new Date().toLocaleDateString('pt-BR');

    // AI dev note: Usamos `alias` no addImage para que o jsPDF compartilhe a mesma
    // imagem entre todas as páginas (se omitido, o jsPDF duplica os bytes da imagem
    // em cada página e causa WORKER_LIMIT / status 546 em contratos longos).
    const HEADER_ALIAS = 'rk-header-logo';
    const WATERMARK_ALIAS = 'rk-watermark';

    const addHeader = () => {
      if (!logoHeaderData) return;
      try {
        const logoW = 42;
        const logoH = 18;
        const logoX = (pageWidth - logoW) / 2;
        doc.addImage(
          `data:image/png;base64,${logoHeaderData}`,
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
          `data:image/png;base64,${logoWatermarkData}`,
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
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);

      const text = `Página integrante do Contrato de Prestação de Serviços de Fisioterapia que entre si celebram ${contratante} e BC FISIO KIDS LTDA. ${hoje}`;
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

    // Converte texto com `**bold**` inline em segmentos alternando bold/normal
    const parseInline = (text: string): Segment[] => {
      if (!text) return [];
      const parts = text.split(/\*\*/g);
      return parts
        .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
        .filter((p) => p.text.length > 0);
    };

    // Quebra uma lista de segmentos em linhas respeitando `maxWidth`.
    // Mantém espaços como tokens separados para permitir justificação.
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

          // Se estourou o limite e já existe conteúdo na linha atual, quebra
          if (
            !isSpace &&
            currentWidth + tokenWidth > maxWidth &&
            current.length > 0
          ) {
            // Remove espaços finais antes de fechar a linha
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

          // Descarta espaço no início de uma nova linha
          if (isSpace && current.length === 0) continue;

          current.push({ text: token, bold: seg.bold });
          currentWidth += tokenWidth;
        }
      }
      if (current.length > 0) {
        // Remove espaços finais
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

    // Renderiza uma linha já quebrada em `segments` na posição (x, y).
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

      // Largura total do texto (usado em center e justify)
      const measure = () => {
        let totalW = 0;
        for (const s of line) {
          setStyle(s.bold ? 'bold' : 'normal');
          totalW += doc.getTextWidth(s.text);
        }
        return totalW;
      };

      if (align === 'center') {
        const totalW = measure();
        let cx = x + (maxWidth - totalW) / 2;
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
          // Limite para evitar espaçamento absurdo em linhas curtas
          const maxExtra = 6;
          const useExtra = Math.min(Math.max(extra, 0), maxExtra);
          let cx = x;
          for (const s of line) {
            setStyle(s.bold ? 'bold' : 'normal');
            if (/^\s+$/.test(s.text)) {
              cx += useExtra;
            } else {
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

    // ======== Renderização da primeira página ========
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
      if (opts.boldAll) {
        segments = segments.map((s) => ({ ...s, bold: true }));
      }

      const maxW = contentWidth - indent;
      const lines = wrapSegments(segments, fontSize, maxW);
      // Altura de linha: ~1.35 * fontSize em pt convertido para mm
      const lineH = fontSize * 0.352778 * 1.35;

      if (spacingBefore > 0) currentY += spacingBefore;

      for (let i = 0; i < lines.length; i++) {
        ensureSpace(lineH);
        renderLine(
          lines[i],
          marginX + indent,
          currentY + lineH * 0.75, // baseline
          align,
          fontSize,
          maxW,
          i === lines.length - 1
        );
        currentY += lineH;
      }
      currentY += spacingAfter;
    };

    // ======== Processa conteúdo do contrato ========
    const content = (contract.conteudo_final || '').replace(/\r\n/g, '\n');
    const rawLines = content.split('\n');

    let firstNonEmptySeen = false;

    for (let idx = 0; idx < rawLines.length; idx++) {
      const raw = rawLines[idx];
      const line = raw.trim();

      if (!line) {
        currentY += 2.5;
        continue;
      }

      // Separador horizontal
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

      // Linha inteira em negrito: **...**
      const wholeBoldMatch = /^\*\*(.+)\*\*$/.exec(line);
      if (wholeBoldMatch) {
        const inner = wholeBoldMatch[1].trim();
        const isTitle = !firstNonEmptySeen;
        firstNonEmptySeen = true;

        if (isTitle) {
          // Título principal do contrato
          renderParagraph(inner, {
            align: 'center',
            fontSize: 13,
            boldAll: true,
            spacingBefore: 2,
            spacingAfter: 6,
          });
          continue;
        }

        // Seção em CAIXA ALTA -> centralizado
        const isAllCaps =
          /^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ0-9\s,.\-:/()"']+$/.test(inner) &&
          inner.length < 90 &&
          /[A-Z]/.test(inner);

        if (isAllCaps) {
          renderParagraph(inner, {
            align: 'center',
            fontSize: 11,
            boldAll: true,
            spacingBefore: 4,
            spacingAfter: 3,
          });
          continue;
        }

        // Subtítulo / destaque em linha própria
        renderParagraph(inner, {
          align: 'left',
          fontSize: 10.5,
          boldAll: true,
          spacingBefore: 2,
          spacingAfter: 2,
        });
        continue;
      }

      firstNonEmptySeen = true;

      // Bullets (• ou -) com indentação
      const bulletMatch = /^([•·-])\s+(.*)$/.exec(line);
      if (bulletMatch) {
        const rest = bulletMatch[2];
        renderParagraph(`•  ${rest}`, {
          align: 'left',
          fontSize: 10.5,
          spacingAfter: 1.5,
          indent: 4,
        });
        continue;
      }

      // Item numerado (1., 2., 3.)
      if (/^\d+[.)]\s+/.test(line)) {
        renderParagraph(line, {
          align: 'justify',
          fontSize: 10.5,
          spacingAfter: 2.5,
        });
        continue;
      }

      // Parágrafo normal
      renderParagraph(line, {
        align: 'justify',
        fontSize: 10.5,
        spacingAfter: 3,
      });
    }

    // Rodapé da última página
    addFooter(pageNum);

    const pdfBuffer = doc.output('arraybuffer');

    console.log('✅ PDF gerado com sucesso (', pageNum, 'páginas )');

    const safeName = (patientName || 'Paciente').replace(/[^\w-]+/g, '_');
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

    return new Response(pdfBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Contrato_${safeName}_${dateStr}.pdf"`,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao gerar PDF:', error);
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
