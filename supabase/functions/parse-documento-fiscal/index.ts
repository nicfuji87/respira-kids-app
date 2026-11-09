import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.6';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0';

// AI dev note: Extracao de documento fiscal para pre-lancamento financeiro.
// Principio: a IA extrai, o SISTEMA decide. XML de NF-e/NFS-e NAO passa por IA.
// PDF escaneado (sem camada de texto, ex.: "Digitalizar" do WhatsApp) vai inteiro para a
// OpenAI como arquivo: o modelo le as paginas como imagem.
// 09/11/2026 (v4): comprovante de Pix/TED vinha com a clinica (pagadora) como emitente e sem quem
// recebeu (caso Uber R$ 7,32). Agora a extracao traz recebedor e pagador, e a regra do comprovante
// (emitente = recebedor) vai junto de qualquer prompt, inclusive o salvo em ai_prompts.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMPT_PADRAO = `Voce extrai dados de documentos fiscais brasileiros.
Devolva SOMENTE o que esta escrito. Se um campo nao aparecer, use null.
Valores com ponto decimal. Datas AAAA-MM-DD. CNPJ apenas digitos.
emitente = quem EMITIU a nota (o fornecedor), nunca o destinatario.`;

const REGRA_COMPROVANTE = `

Comprovante de pagamento (Pix, TED, transferencia, boleto pago): documento.tipo = "comprovante_pix" (ou "comprovante_ted", "comprovante_boleto").
Nesse caso preencha recebedor (quem RECEBEU o dinheiro: nome e CNPJ/CPF, so digitos) e pagador (quem pagou).
No comprovante, emitente = o RECEBEDOR (quem recebeu), nunca quem pagou.
Em nota fiscal comum: recebedor = o emitente e pagador = o destinatario, se aparecerem; senao null.`;

const PESSOA = {
  type: 'object',
  additionalProperties: false,
  required: ['cnpj', 'nome'],
  properties: {
    cnpj: { type: ['string', 'null'] },
    nome: { type: ['string', 'null'] },
  },
};

const JSON_SCHEMA = {
  name: 'documento_fiscal',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'emitente',
      'recebedor',
      'pagador',
      'documento',
      'valores',
      'vencimentos',
      'itens',
      'competencia_sugerida',
      'observacoes',
    ],
    properties: {
      emitente: {
        type: 'object',
        additionalProperties: false,
        required: ['cnpj', 'razao_social'],
        properties: {
          cnpj: { type: ['string', 'null'] },
          razao_social: { type: ['string', 'null'] },
        },
      },
      recebedor: PESSOA,
      pagador: PESSOA,
      documento: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'numero', 'serie', 'chave_acesso', 'data_emissao'],
        properties: {
          tipo: { type: ['string', 'null'] },
          numero: { type: ['string', 'null'] },
          serie: { type: ['string', 'null'] },
          chave_acesso: { type: ['string', 'null'] },
          data_emissao: { type: ['string', 'null'] },
        },
      },
      valores: {
        type: 'object',
        additionalProperties: false,
        required: ['total', 'descontos', 'impostos'],
        properties: {
          total: { type: ['number', 'null'] },
          descontos: { type: ['number', 'null'] },
          impostos: { type: ['number', 'null'] },
        },
      },
      vencimentos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'valor'],
          properties: {
            data: { type: ['string', 'null'] },
            valor: { type: ['number', 'null'] },
          },
        },
      },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'descricao',
            'quantidade',
            'valor_unitario',
            'valor_total',
          ],
          properties: {
            descricao: { type: ['string', 'null'] },
            quantidade: { type: ['number', 'null'] },
            valor_unitario: { type: ['number', 'null'] },
            valor_total: { type: ['number', 'null'] },
          },
        },
      },
      competencia_sugerida: { type: ['string', 'null'] },
      observacoes: { type: ['string', 'null'] },
    },
  },
};

type Extracao = Record<string, unknown>;

function detectarTipo(nome: string, mime: string | null): string {
  const ext = nome.split('.').pop()?.toLowerCase() || '';
  if (ext === 'xml' || (mime || '').includes('xml')) return 'xml';
  if (ext === 'pdf' || (mime || '').includes('pdf')) return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagem';
  if ((mime || '').startsWith('image/')) return 'imagem';
  return 'desconhecido';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function primeiro<T>(v: T | T[] | undefined): T | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

// Nó de um XML fiscal de origem variada (NF-e, NFS-e de vários municípios):
// a estrutura só é conhecida em tempo de execução.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoXml = any;

function parseXml(texto: string): { tipo: string; dados: Extracao } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(texto) as Record<string, NoXml>;

  const nfeProc = doc?.nfeProc ?? doc;
  const infNFe = primeiro<NoXml>(nfeProc?.NFe?.infNFe ?? nfeProc?.infNFe);

  if (infNFe) {
    const ide = infNFe.ide ?? {};
    const emit = infNFe.emit ?? {};
    const total = infNFe.total?.ICMSTot ?? {};
    const dets = infNFe.det
      ? Array.isArray(infNFe.det)
        ? infNFe.det
        : [infNFe.det]
      : [];
    const dup = infNFe.cobr?.dup
      ? Array.isArray(infNFe.cobr.dup)
        ? infNFe.cobr.dup
        : [infNFe.cobr.dup]
      : [];
    const emissao = String(ide.dhEmi ?? ide.dEmi ?? '').slice(0, 10) || null;

    return {
      tipo: 'nfe_xml',
      dados: {
        emitente: {
          cnpj: emit.CNPJ ?? emit.CPF ?? null,
          razao_social: emit.xNome ?? null,
        },
        documento: {
          tipo: 'nfe',
          numero: ide.nNF ?? null,
          serie: ide.serie ?? null,
          chave_acesso:
            String(infNFe['@_Id'] ?? '').replace(/^NFe/, '') || null,
          data_emissao: emissao,
        },
        valores: {
          total: num(total.vNF),
          descontos: num(total.vDesc),
          impostos: num(total.vTotTrib),
        },
        vencimentos: dup.map((d: NoXml) => ({
          data: d.dVenc ?? null,
          valor: num(d.vDup),
        })),
        itens: dets.map((d: NoXml) => ({
          descricao: d.prod?.xProd ?? null,
          quantidade: num(d.prod?.qCom),
          valor_unitario: num(d.prod?.vUnCom),
          valor_total: num(d.prod?.vProd),
        })),
        competencia_sugerida: emissao ? emissao.slice(0, 7) + '-01' : null,
        observacoes: infNFe.infAdic?.infCpl ?? null,
      },
    };
  }

  const inf =
    primeiro<NoXml>(
      doc?.CompNfse?.Nfse?.InfNfse ??
        doc?.ConsultarNfseResposta?.ListaNfse?.CompNfse?.Nfse?.InfNfse ??
        doc?.InfNfse ??
        doc?.Nfse?.InfNfse
    ) ?? null;

  if (inf) {
    const prest = inf.PrestadorServico ?? inf.IdentificacaoPrestador ?? {};
    const servico = inf.Servico ?? {};
    const valores = servico.Valores ?? {};
    const emissao = String(inf.DataEmissao ?? '').slice(0, 10) || null;
    const cnpj =
      prest?.IdentificacaoPrestador?.Cnpj ??
      prest?.IdentificacaoPrestador?.CpfCnpj?.Cnpj ??
      prest?.Cnpj ??
      null;

    return {
      tipo: 'nfse_xml',
      dados: {
        emitente: {
          cnpj,
          razao_social: prest?.RazaoSocial ?? prest?.NomeFantasia ?? null,
        },
        documento: {
          tipo: 'nfse',
          numero: inf.Numero ?? null,
          serie: null,
          chave_acesso: inf.CodigoVerificacao ?? null,
          data_emissao: emissao,
        },
        valores: {
          total: num(valores.ValorLiquidoNfse ?? valores.ValorServicos),
          descontos: num(valores.DescontoIncondicionado),
          impostos: num(valores.ValorIss),
        },
        vencimentos: [],
        itens: [
          {
            descricao: servico.Discriminacao ?? null,
            quantidade: 1,
            valor_unitario: num(valores.ValorServicos),
            valor_total: num(valores.ValorServicos),
          },
        ],
        competencia_sugerida: emissao ? emissao.slice(0, 7) + '-01' : null,
        observacoes: null,
      },
    };
  }

  throw new Error('XML nao reconhecido como NF-e nem NFS-e');
}

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (text || '').trim();
}

async function extrairComIa(params: {
  apiKey: string;
  modelo: string;
  prompt: string;
  conteudo:
    | { tipo: 'texto'; valor: string }
    | { tipo: 'imagem'; dataUri: string }
    | { tipo: 'pdf'; dataUri: string; nome: string };
}): Promise<{ dados: Extracao; tokensIn: number; tokensOut: number }> {
  const c = params.conteudo;
  const userContent =
    c.tipo === 'texto'
      ? [{ type: 'text', text: c.valor.slice(0, 60000) }]
      : c.tipo === 'imagem'
        ? [
            { type: 'text', text: 'Extraia os dados deste documento fiscal.' },
            { type: 'image_url', image_url: { url: c.dataUri } },
          ]
        : [
            {
              type: 'text',
              text: 'Extraia os dados deste documento fiscal (PDF escaneado).',
            },
            { type: 'file', file: { filename: c.nome, file_data: c.dataUri } },
          ];

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.modelo,
      temperature: 0,
      messages: [
        { role: 'system', content: params.prompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
    }),
  });

  if (!resp.ok)
    throw new Error(
      `OpenAI ${resp.status}: ${(await resp.text()).slice(0, 400)}`
    );

  const json = await resp.json();
  const texto = json?.choices?.[0]?.message?.content;
  if (!texto) throw new Error('OpenAI nao devolveu conteudo');

  return {
    dados: JSON.parse(texto),
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let documentoId: string | null = null;

  try {
    const body = await req.json();
    documentoId = body?.documento_id ?? null;
    if (!documentoId) throw new Error('documento_id e obrigatorio');

    const { data: doc, error: docErr } = await supabase
      .from('documentos_fiscais')
      .select('*')
      .eq('id', documentoId)
      .single();
    if (docErr || !doc) throw new Error('Documento nao encontrado');

    await supabase
      .from('documentos_fiscais')
      .update({ status: 'processando', tentativas: (doc.tentativas ?? 0) + 1 })
      .eq('id', documentoId);

    const { data: arquivo, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.caminho);
    if (dlErr || !arquivo) throw new Error('Nao foi possivel baixar o arquivo');

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const formato = detectarTipo(doc.nome_original, doc.mime_type);

    let tipoDetectado = 'desconhecido';
    let dados: Extracao;
    let confianca = 1;
    let modelo: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;

    if (formato === 'xml') {
      const r = parseXml(new TextDecoder().decode(bytes));
      tipoDetectado = r.tipo;
      dados = r.dados;
    } else {
      const { data: chave } = await supabase
        .from('api_keys')
        .select('encrypted_key')
        .eq('service_name', 'openai')
        .eq('is_active', true)
        .single();
      if (!chave?.encrypted_key)
        throw new Error('Chave OpenAI nao configurada');

      const { data: promptRow } = await supabase
        .from('ai_prompts')
        .select('prompt_content, openai_model')
        .eq('prompt_name', 'extrair_documento_fiscal')
        .eq('is_active', true)
        .maybeSingle();

      modelo = promptRow?.openai_model || 'gpt-4o';
      const prompt =
        (promptRow?.prompt_content || PROMPT_PADRAO) + REGRA_COMPROVANTE;

      if (formato === 'pdf') {
        const texto = await textoDoPdf(bytes);
        const escaneado = texto.length < 40;
        tipoDetectado = escaneado
          ? 'pdf_escaneado'
          : /nfs-?e|servi[cç]o/i.test(texto)
            ? 'nfse_pdf'
            : 'danfe_pdf';
        const r = await extrairComIa({
          apiKey: chave.encrypted_key,
          modelo,
          prompt,
          conteudo: escaneado
            ? {
                tipo: 'pdf',
                nome: doc.nome_original || 'documento.pdf',
                dataUri: `data:application/pdf;base64,${paraBase64(bytes)}`,
              }
            : { tipo: 'texto', valor: texto },
        });
        dados = r.dados;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
        confianca = escaneado ? 0.7 : 0.85;
      } else if (formato === 'imagem') {
        tipoDetectado = 'cupom';
        const b64 = paraBase64(bytes);
        const r = await extrairComIa({
          apiKey: chave.encrypted_key,
          modelo,
          prompt,
          conteudo: {
            tipo: 'imagem',
            dataUri: `data:${doc.mime_type || 'image/jpeg'};base64,${b64}`,
          },
        });
        dados = r.dados;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
        confianca = 0.7;
      } else {
        throw new Error(`Formato nao suportado: ${doc.nome_original}`);
      }
    }

    await supabase
      .from('documentos_fiscais')
      .update({
        status: 'extraido',
        tipo_detectado: tipoDetectado,
        dados_extraidos: dados,
        confianca,
        modelo,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        erro_msg: null,
      })
      .eq('id', documentoId);

    return new Response(
      JSON.stringify({ success: true, tipo: tipoDetectado, confianca, dados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[parse-documento-fiscal]', msg);

    if (documentoId) {
      await supabase
        .from('documentos_fiscais')
        .update({ status: 'erro', erro_msg: msg })
        .eq('id', documentoId);
    }

    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
