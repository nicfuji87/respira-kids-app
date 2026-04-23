import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
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
// - Bloco final fixo com 3 assinaturas (Responsável Legal + BC FISIO + FS PACHECO)
//
// IMPORTANTE: manter `verify_jwt: true` (o front chama com o anon key no Authorization).
//
// AI dev note (memória):
// - As imagens são cacheadas em escopo de módulo para sobreviver entre invocações
//   no mesmo worker (warm starts), evitando re-download e re-encode em cada requisição.
// - A conversão para base64 usa `encodeBase64` do `@std/encoding`, que é nativo e
//   muito mais eficiente do que loops manuais com String.fromCharCode + Array.from
//   (esses padrões geravam pico de memória e disparavam WORKER_LIMIT / status 546).
// - Proporção do logo do cabeçalho: asset real é 500x324 (ratio ~1.545). Usamos
//   34x22mm para preservar a proporção (evita "achatar" o logo).
// - Assinaturas da BC FISIO e FS PACHECO são sempre estampadas no PDF (conforme
//   combinado com a clínica); a assinatura digital do responsável legal é feita
//   fora do PDF (plataforma Assinafy), por isso aqui exibimos apenas a linha
//   horizontal e o rótulo.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Segment = { text: string; bold: boolean };
type LoadedImage = { base64: string; width: number; height: number };

// AI dev note: Cache em escopo de módulo (sobrevive entre invocações no mesmo worker).
// O Supabase Edge Functions reutiliza o mesmo isolate por alguns segundos/minutos em
// cargas com vários pedidos seguidos; cachear as imagens evita refazer o trabalho
// pesado de download + base64 a cada requisição.
const imageCache = new Map<string, LoadedImage>();

// Lê width/height de um PNG (bytes 16..23 do IHDR chunk). Retorna null se não for
// PNG válido; nesse caso o chamador usa dimensões default (proporção 1:1).
function readPngSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
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
    // encodeBase64 lida com Uint8Array internamente sem cópias intermediárias
    // de strings gigantes (que era o gargalo da implementação anterior).
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
    // AI dev note: assinaturas das contratadas ficam no bucket público `respira-documents`.
    // Nomes com espaço precisam de URL-encode no path.
    const signatureBrunaUrl = `${supabaseUrl}/storage/v1/object/public/respira-documents/${encodeURIComponent('Bruna Cury.png')}`;
    const signatureFlaviaUrl = `${supabaseUrl}/storage/v1/object/public/respira-documents/${encodeURIComponent('Flavia Pacheco.png')}`;

    const [
      logoHeaderData,
      logoWatermarkData,
      signatureBrunaData,
      signatureFlaviaData,
    ] = await Promise.all([
      loadImageAsBase64(logoHeaderUrl),
      loadImageAsBase64(logoWatermarkUrl),
      loadImageAsBase64(signatureBrunaUrl),
      loadImageAsBase64(signatureFlaviaUrl),
    ]);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 20;
    const headerHeight = 32; // área reservada para o logo do cabeçalho
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
        // Preserva a proporção real do asset (ratio width/height) para evitar
        // o logo "achatado" que aparecia antes quando usávamos dimensões fixas.
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
    // AI dev note: contratos gerados antes da introdução do bloco de assinaturas
    // guardaram no `conteudo_final` o trailing `Brasília, <data>\n\n**<nome>**`.
    // Removemos esse trailing para evitar duplicação com o bloco fixo abaixo.
    let rawContent = (contract.conteudo_final || '').replace(/\r\n/g, '\n');
    rawContent = rawContent
      .replace(/\s*Bras[ií]lia,[^\n]*\n+\*\*[^*\n]+\*\*\s*$/m, '')
      .trimEnd();
    const content = rawContent;
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

    // ======== Bloco fixo de assinaturas ========
    // AI dev note: Três assinaturas empilhadas (Responsável Legal + CONTRATADAS).
    // As assinaturas das contratadas (Bruna/BC FISIO e Flávia/FS PACHECO) são
    // sempre estampadas como imagem. O responsável legal assina digitalmente
    // (fora do PDF), aqui mostramos apenas a linha horizontal como placeholder.
    const renderSignatureBlock = (
      label: string,
      nome: string,
      roleLine: string,
      image: LoadedImage | null,
      alias: string
    ) => {
      const blockHeight = 30; // linha + nome + rótulo (imagem sobrepõe a linha)
      ensureSpace(blockHeight + 6);

      const lineY = currentY + 14;
      const lineX1 = marginX + 20;
      const lineX2 = pageWidth - marginX - 20;
      const centerX = (lineX1 + lineX2) / 2;

      // Imagem da assinatura centralizada sobre a linha, preservando a
      // proporção real do PNG (caso contrário a assinatura fica achatada).
      if (image && image.base64) {
        try {
          const ratio =
            image.width && image.height ? image.width / image.height : 2;
          // Caixa máxima para a assinatura: 50mm de largura x 16mm de altura.
          // Calculamos a dimensão cabível preservando proporção (fit: contain).
          const maxW = 50;
          const maxH = 16;
          let imgW = maxW;
          let imgH = imgW / ratio;
          if (imgH > maxH) {
            imgH = maxH;
            imgW = imgH * ratio;
          }
          const imgX = centerX - imgW / 2;
          // Base da imagem encosta um pouco acima da linha (margem de 1mm)
          const imgY = lineY - imgH - 1;
          doc.addImage(
            `data:image/png;base64,${image.base64}`,
            'PNG',
            imgX,
            imgY,
            imgW,
            imgH,
            alias,
            'FAST'
          );
        } catch (e) {
          console.warn('⚠️ Erro ao adicionar imagem de assinatura:', e);
        }
      }

      // Linha da assinatura
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.3);
      doc.line(lineX1, lineY, lineX2, lineY);

      // Nome em negrito
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(nome, centerX, lineY + 5, { align: 'center' });

      // Rótulo da parte (ex.: "Responsável Legal do Paciente")
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(label, centerX, lineY + 10, { align: 'center' });

      // Linha extra opcional abaixo do rótulo (ex.: "CONTRATADA 1")
      if (roleLine) {
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 120);
        doc.text(roleLine, centerX, lineY + 14, { align: 'center' });
      }

      doc.setTextColor(0, 0, 0);
      currentY += blockHeight + 4;
    };

    // "Brasília, <data>" alinhado à esquerda
    ensureSpace(20);
    currentY += 6;
    renderParagraph(`Brasília, ${hoje}`, {
      align: 'left',
      fontSize: 10.5,
      spacingAfter: 10,
    });

    renderSignatureBlock(
      'Responsável Legal do Paciente',
      contratante || 'Responsável Legal',
      '',
      null,
      'sig-responsavel'
    );

    renderSignatureBlock(
      'BC FISIO KIDS LTDA (CONTRATADA 1)',
      'BRUNA CURY LOURENÇO PERES',
      'CPF 011.335.011-25',
      signatureBrunaData,
      'sig-bruna'
    );

    renderSignatureBlock(
      'F.S PACHECO FISIOTERAPIA LTDA (CONTRATADA 2)',
      'FLÁVIA DA SILVA PACHECO',
      'CPF 585.226.701-53',
      signatureFlaviaData,
      'sig-flavia'
    );

    // Rodapé da última página
    addFooter(pageNum);

    const pdfBuffer = doc.output('arraybuffer');

    console.log('✅ PDF gerado com sucesso (', pageNum, 'páginas )');

    // AI dev note: nome do arquivo alinhado ao nome_contrato exibido no sistema
    // ("Contrato Respira Kids - Nome do Paciente.pdf"). Remove apenas caracteres
    // inválidos em nomes de arquivo no Windows.
    const displayName = patientName || 'Paciente';
    const safeFileName = `Contrato Respira Kids - ${displayName}`.replace(
      /[<>:"/\\|?*]+/g,
      '_'
    );

    return new Response(pdfBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFileName}.pdf"`,
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
