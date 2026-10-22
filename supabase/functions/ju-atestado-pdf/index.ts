// AI dev note: Atestado de comparecimento em PDF para a Ju (n8n).
// Só aceita a service_role. Não recebe os dados prontos: recebe conversa,
// versão, agendamento e responsável e chama fn_ju_atestado_dados, que confere
// escopo do telefone, sessão realizada, responsável cadastrado e assinatura.
// Assim o n8n não consegue colocar no atestado nada que o banco não validou.
//
// Layout copiado do AttendanceStatementGenerator (A4 paisagem, fundo
// atestado.png, texto e assinatura). É PDF e não HTML porque o Storage serve
// .html como text/plain: o link do HTML abre o código, não o atestado.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { jsPDF } from 'npm:jspdf@2.5.2';

const BUCKET = 'respira-documents';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function imagem(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return `data:image/png;base64,${encodeBase64(new Uint8Array(await res.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

type Trecho = { texto: string; negrito?: boolean };

// Parágrafo com trechos em negrito, quebrado por palavra; recuo na 1ª linha.
function paragrafo(
  doc: jsPDF,
  trechos: Trecho[],
  x: number,
  y: number,
  largura: number,
  entrelinha: number,
  recuo: number
): number {
  const palavras: Trecho[] = [];
  for (const t of trechos) {
    for (const p of t.texto.split(/\s+/).filter(Boolean))
      palavras.push({ texto: p, negrito: t.negrito });
  }
  const medir = (p: Trecho) => {
    doc.setFont('helvetica', p.negrito ? 'bold' : 'normal');
    return doc.getTextWidth(p.texto);
  };
  doc.setFont('helvetica', 'normal');
  const espaco = doc.getTextWidth(' ');
  let linha: Trecho[] = [];
  let usado = recuo;
  let primeira = true;
  const desenhar = () => {
    let cx = x + (primeira ? recuo : 0);
    for (const [i, p] of linha.entries()) {
      if (i > 0 && /^[,.;:]/.test(p.texto)) cx -= espaco; // pontuação cola na palavra anterior
      doc.setFont('helvetica', p.negrito ? 'bold' : 'normal');
      doc.text(p.texto, cx, y);
      cx += doc.getTextWidth(p.texto) + espaco;
    }
    y += entrelinha;
    primeira = false;
  };
  for (const p of palavras) {
    const w = medir(p);
    if (linha.length && usado + w > largura) {
      desenhar();
      linha = [];
      usado = 0;
    }
    linha.push(p);
    usado += w + espaco;
  }
  if (linha.length) desenhar();
  return y;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST')
    return json({ ok: false, motivo: 'USE_POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (
    !serviceKey ||
    req.headers.get('Authorization') !== `Bearer ${serviceKey}`
  ) {
    return json({ ok: false, motivo: 'NAO_AUTORIZADO' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const supabase = createClient(url, serviceKey);

  const { data: dados, error } = await supabase.rpc('fn_ju_atestado_dados', {
    p_conversa_id: body.conversa_id,
    p_versao: body.versao,
    p_agendamento_id: body.agendamento_id,
    p_responsavel_id: body.responsavel_id,
  });
  if (error)
    return json({ ok: false, motivo: 'ERRO_RPC', erro: error.message });
  if (!dados?.ok) return json(dados ?? { ok: false, motivo: 'SEM_DADOS' });

  try {
    const publico = `${url}/storage/v1/object/public/${BUCKET}`;
    const [fundo, assinatura] = await Promise.all([
      imagem(`${publico}/atestado.png`),
      imagem(`${publico}/${encodeURIComponent(dados.assinatura.arquivo)}`),
    ]);
    if (!assinatura)
      return json({ ok: false, motivo: 'ASSINATURA_INDISPONIVEL' });

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const W = 297;
    const H = 210;
    if (fundo) doc.addImage(fundo, 'PNG', 0, 0, W, H, 'fundo', 'FAST');

    // Caixa de conteúdo: 12% do topo, 9% das laterais, 7% da base (igual ao HTML).
    const left = W * 0.09;
    const largura = W * 0.82;
    const base = H * 0.93;

    doc.setTextColor(26, 54, 93);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.text('Atestado de Comparecimento', W / 2, H * 0.12 + 8, {
      align: 'center',
    });

    doc.setTextColor(51, 51, 51);
    doc.setFontSize(12);
    let y = H * 0.12 + 30;
    y = paragrafo(
      doc,
      [
        { texto: 'Confirmo que,' },
        { texto: dados.responsavel_nome, negrito: true },
        { texto: 'esteve presente na consulta fisioterapêutica do(a) menor' },
        { texto: dados.paciente_nome, negrito: true },
        { texto: 'que ocorreu na data' },
        { texto: dados.data_consulta, negrito: true },
        { texto: ', no período' },
        { texto: `${dados.periodo}.`, negrito: true },
      ],
      left,
      y,
      largura,
      8.5,
      10.5
    );
    y += 4;
    paragrafo(
      doc,
      [
        {
          texto:
            'Sem mais para o momento, firmo a presente declaração para que produza seus efeitos legais.',
        },
      ],
      left,
      y,
      largura,
      8.5,
      10.5
    );

    // Assinatura colada no rodapé, centralizada, com local e data embaixo.
    const sigW = 58;
    const sigH = 29;
    doc.addImage(
      assinatura,
      'PNG',
      (W - sigW) / 2,
      base - 10 - sigH,
      sigW,
      sigH,
      'assinatura',
      'FAST'
    );
    doc.setFont('helvetica', 'normal');
    doc.text(`Brasília, ${dados.data_emissao}`, W / 2, base - 4, {
      align: 'center',
    });

    const caminho = `atestados/${dados.paciente_id}/ju_${dados.agendamento_id}_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, new Uint8Array(doc.output('arraybuffer')), {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (upErr)
      return json({ ok: false, motivo: 'ERRO_UPLOAD', erro: upErr.message });

    // O n8n envia o PDF como arquivo no WhatsApp (a família não recebe link).
    // URL assinada de 15 min: só para a uazapi baixar o arquivo na hora do envio.
    const { data: assinada } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(caminho, 900);
    const primeiroNome =
      String(dados.paciente_nome ?? '')
        .trim()
        .split(/\s+/)[0] || 'paciente';
    const docNome = `Atestado_RK_${primeiroNome}_${String(dados.data_consulta).replace(/\//g, '-')}.pdf`;

    return json({
      ok: true,
      link: `${publico}/${caminho}`,
      arquivo_url: assinada?.signedUrl ?? `${publico}/${caminho}`,
      doc_nome: docNome,
      paciente_nome: dados.paciente_nome,
      responsavel_nome: dados.responsavel_nome,
      data_consulta: dados.data_consulta,
    });
  } catch (e) {
    return json({
      ok: false,
      motivo: 'ERRO_PDF',
      erro: e instanceof Error ? e.message : String(e),
    });
  }
});
