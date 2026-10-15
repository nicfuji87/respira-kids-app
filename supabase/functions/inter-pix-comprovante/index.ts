// AI dev note: Comprovante de um Pix enviado pelo Inter (SÓ LEITURA, não move dinheiro).
//
// Quem chama: o fluxo de avisos da @ju no n8n (service role) depois que o Pix pedido
// no grupo de notas é pago, ou um admin logado. Consulta o Pix pelo codigoSolicitacao
// guardado em inter_pagamentos.resposta, grava em inter_pagamentos.comprovante e devolve
// o essencial (recebedor, documento, E2E, data/hora) para a Ju postar no grupo.
//
// Também gera o PDF do comprovante (fornecedor costuma pedir). A API do Inter não
// entrega o comprovante do banco, então o PDF é EMITIDO PELA CLÍNICA com os dados
// reais da transação, sem a marca do Inter (não pode se passar por documento do banco).
// O que vale para conferência é o ID E2E, que o recebedor confere no próprio banco.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { consultarPixEnviado } from '../_shared/inter.ts';

const LOGO_URL =
  'https://app.respirakidsbrasilia.com.br/images/logos/icone-respira-kids.png';
const BUCKET = 'respira-financeiro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// O formato da resposta do Inter varia entre versões; procura o campo onde estiver.
function achar(obj: unknown, nomes: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (nomes.includes(k) && v !== null && v !== '' && typeof v !== 'object')
      return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const achado = achar(v, nomes);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

// Primeiro subobjeto com um destes nomes (o recebedor vem num bloco próprio; o
// pagador, noutro — buscar "nome" solto pegaria a clínica).
function bloco(obj: unknown, nomes: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (nomes.includes(k) && v && typeof v === 'object') return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const achado = bloco(v, nomes);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

function formatarDoc(d: unknown): string {
  const s = String(d ?? '').replace(/\D/g, '');
  if (s.length === 14)
    return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11)
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d ? String(d) : '-';
}

function formatarChave(c: unknown): string {
  const s = String(c ?? '');
  if (/^\d{11}$|^\d{14}$/.test(s)) return formatarDoc(s);
  if (/^\+55\d{10,11}$/.test(s)) {
    return s.replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3');
  }
  return s || '-';
}

function dataHoraBR(iso: unknown): string {
  const d = iso ? new Date(String(iso)) : new Date();
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} às ${g('hour')}:${g('minute')}`;
}

interface DadosPdf {
  valor: number;
  dataHora: string;
  recebedor: string;
  recebedorDoc: string;
  chave: string;
  pagador: string;
  pagadorDoc: string;
  instituicao: string;
  agenciaConta: string;
  e2e: string;
  codigo: string;
  situacao: string;
  referente: string | null;
  emitidoEm: string;
}

async function gerarPdf(d: DadosPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Comprovante de Pix');
  pdf.setAuthor('Respira Kids');
  pdf.setCreator('Respira Kids');

  const W = 420;
  const H = 660;
  const page = pdf.addPage([W, H]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const roxo = rgb(0.29, 0.16, 0.38);
  const cinza = rgb(0.45, 0.45, 0.5);
  const traco = rgb(0.88, 0.87, 0.9);
  const verde = rgb(0.08, 0.53, 0.32);
  const M = 32;
  let y = H - 40;

  try {
    const r = await fetch(LOGO_URL);
    if (r.ok) {
      const img = await pdf.embedPng(new Uint8Array(await r.arrayBuffer()));
      const h = 36;
      page.drawImage(img, {
        x: M,
        y: y - 28,
        width: (img.width * h) / img.height,
        height: h,
      });
    }
  } catch {
    // sem logo o comprovante continua válido
  }
  page.drawText('Respira Kids', {
    x: M + 46,
    y: y - 8,
    size: 14,
    font: fb,
    color: roxo,
  });
  page.drawText('Comprovante de transferência Pix', {
    x: M + 46,
    y: y - 24,
    size: 9.5,
    font: f,
    color: cinza,
  });

  y -= 70;
  page.drawText('Pix enviado', { x: M, y, size: 11, font: fb, color: verde });
  y -= 30;
  const valor = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(d.valor);
  page.drawText(valor, { x: M, y, size: 28, font: fb, color: roxo });
  y -= 18;
  page.drawText(d.dataHora, { x: M, y, size: 10, font: f, color: cinza });

  const quebrar = (
    texto: string,
    fonte: typeof f,
    tam: number,
    larg: number
  ): string[] => {
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of texto.split(/\s+/)) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(teste, tam) > larg && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = teste;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  };

  const secao = (titulo: string, linhas: Array<[string, string]>) => {
    y -= 22;
    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.8,
      color: traco,
    });
    y -= 20;
    page.drawText(titulo.toUpperCase(), {
      x: M,
      y,
      size: 8.5,
      font: fb,
      color: cinza,
    });
    for (const [rotulo, valorLinha] of linhas) {
      y -= 17;
      page.drawText(rotulo, { x: M, y, size: 9, font: f, color: cinza });
      const partes = quebrar(valorLinha, fb, 9.5, W - M - 150);
      partes.forEach((p, i) => {
        page.drawText(p, {
          x: 150,
          y: y - i * 12,
          size: 9.5,
          font: fb,
          color: roxo,
        });
      });
      y -= (partes.length - 1) * 12;
    }
  };

  secao('Quem recebeu', [
    ['Nome', d.recebedor],
    ['CPF/CNPJ', d.recebedorDoc],
    ['Chave Pix', d.chave],
  ]);
  secao('Quem pagou', [
    ['Nome', d.pagador],
    ['CNPJ', d.pagadorDoc],
    ['Instituição', d.instituicao],
    ['Agência e conta', d.agenciaConta],
  ]);
  const transacao: Array<[string, string]> = [
    ['ID da transação', d.e2e],
    ['Código no Inter', d.codigo],
    ['Situação', d.situacao],
  ];
  if (d.referente) transacao.push(['Referente a', d.referente]);
  secao('Transação', transacao);

  y -= 26;
  page.drawLine({
    start: { x: M, y },
    end: { x: W - M, y },
    thickness: 0.8,
    color: traco,
  });
  const rodape =
    `Comprovante emitido pela Respira Kids em ${d.emitidoEm} com os dados do registro da transação ` +
    'no Banco Inter. O ID da transação (E2E) identifica este Pix no Sistema de Pagamentos Instantâneos ' +
    'e pode ser conferido pelo recebedor no próprio banco.';
  y -= 14;
  for (const linha of quebrar(rodape, f, 7.5, W - 2 * M)) {
    page.drawText(linha, { x: M, y, size: 7.5, font: f, color: cinza });
    y -= 10;
  }

  return await pdf.save();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const jwt = (req.headers.get('Authorization') ?? '')
      .replace('Bearer ', '')
      .trim();
    if (!jwt) return json({ error: 'Não autenticado' }, 401);

    if (jwt !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u?.user) return json({ error: 'Sessão inválida' }, 401);
      const { data: p } = await admin
        .from('pessoas')
        .select('role, ativo')
        .eq('auth_user_id', u.user.id)
        .single();
      if (!p || p.role !== 'admin' || !p.ativo) {
        return json({ error: 'Apenas admin' }, 403);
      }
    }

    const { inter_pagamento_id } = (await req.json()) as {
      inter_pagamento_id?: string;
    };
    if (!inter_pagamento_id)
      return json({ error: 'inter_pagamento_id obrigatório' }, 400);

    const { data: pag } = await admin
      .from('inter_pagamentos')
      .select(
        'id, tipo, status, valor, chave_pix, resposta, comprovante, lancamento_id'
      )
      .eq('id', inter_pagamento_id)
      .single();
    if (!pag || pag.tipo !== 'pix' || pag.status !== 'sucesso') {
      return json({ error: 'Pix não encontrado ou não concluído' }, 404);
    }

    const codigo = (pag.resposta as Record<string, unknown> | null)
      ?.codigoSolicitacao as string | undefined;
    if (!codigo) return json({ error: 'Pix sem codigoSolicitacao' }, 422);

    const bruto = await consultarPixEnviado(codigo);
    const rec = bloco(bruto, ['recebedor', 'favorecido', 'destinatario']);

    const comprovante: Record<string, unknown> = {
      codigo_solicitacao: codigo,
      e2e: achar(bruto, ['endToEndId', 'endToEnd', 'e2eId', 'e2e']) ?? null,
      recebedor:
        (rec
          ? achar(rec, ['nome', 'nomeRecebedor', 'nomeFavorecido'])
          : achar(bruto, ['nomeRecebedor', 'nomeFavorecido'])) ?? null,
      documento:
        (rec
          ? achar(rec, ['cpfCnpj', 'documento'])
          : achar(bruto, ['cpfCnpjRecebedor'])) ?? null,
      banco:
        (rec
          ? achar(rec, ['nomeBanco', 'banco', 'instituicao', 'nomeInstituicao'])
          : null) ?? null,
      data_hora:
        achar(bruto, [
          'dataHoraMovimento',
          'dataHoraSolicitacao',
          'dataPagamento',
          'dataOperacao',
        ]) ?? null,
      situacao: achar(bruto, ['status', 'situacao', 'tipoRetorno']) ?? null,
      valor: pag.valor,
      chave: pag.chave_pix,
    };

    // ---- PDF: pagador = titular real da conta Inter da clínica ----
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    try {
      const [{ data: conta }, { data: empresa }, { data: lanc }] =
        await Promise.all([
          admin
            .from('contas_bancarias')
            .select('agencia, conta, digito, banco_codigo, banco_nome')
            .eq('banco_codigo', '077')
            .eq('ativo', true)
            .limit(1)
            .maybeSingle(),
          admin
            .from('pessoa_empresas')
            .select('razao_social, cnpj')
            .ilike('razao_social', 'BC FISIO KIDS%')
            .eq('ativo', true)
            .limit(1)
            .maybeSingle(),
          pag.lancamento_id
            ? admin
                .from('lancamentos_financeiros')
                .select('descricao')
                .eq('id', pag.lancamento_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

      const bytes = await gerarPdf({
        valor: Number(pag.valor),
        dataHora: dataHoraBR(comprovante.data_hora),
        recebedor: String(comprovante.recebedor ?? '-'),
        recebedorDoc: formatarDoc(comprovante.documento),
        chave: formatarChave(pag.chave_pix),
        pagador: empresa?.razao_social ?? 'BC FISIO KIDS LTDA',
        pagadorDoc: formatarDoc(empresa?.cnpj),
        instituicao: conta
          ? `${conta.banco_nome ?? 'BANCO INTER S.A.'} (${conta.banco_codigo})`
          : 'BANCO INTER S.A. (077)',
        agenciaConta: conta
          ? `${conta.agencia} · ${conta.conta}-${conta.digito}`
          : '-',
        e2e: String(comprovante.e2e ?? '-'),
        codigo,
        situacao:
          String(comprovante.situacao ?? '').toUpperCase() === 'PAGO'
            ? 'Pago'
            : String(comprovante.situacao ?? '-'),
        referente: (lanc as { descricao?: string } | null)?.descricao ?? null,
        emitidoEm: dataHoraBR(new Date().toISOString()),
      });

      const caminho = `comprovantes/pix/${pag.id}.pdf`;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(caminho, bytes, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: assinado } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(caminho, 3600);
      pdfUrl = assinado?.signedUrl ?? null;
      comprovante.pdf_path = `${BUCKET}/${caminho}`;
    } catch (e) {
      // sem PDF a Ju avisa com o texto; o comprovante em dados continua valendo
      pdfErro = e instanceof Error ? e.message : String(e);
      console.error('[inter-pix-comprovante] pdf:', pdfErro);
    }

    await admin
      .from('inter_pagamentos')
      .update({ comprovante: { ...comprovante, bruto } })
      .eq('id', pag.id);

    return json({ ok: true, comprovante, pdf_url: pdfUrl, pdf_erro: pdfErro });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[inter-pix-comprovante]', msg);
    return json({ error: msg }, 500);
  }
});
