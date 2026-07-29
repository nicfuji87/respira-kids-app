import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.6';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.11.0';

// AI dev note: Extração de documento fiscal para pré-lançamento financeiro.
//
// Princípio: a IA extrai, o SISTEMA decide. Esta função devolve APENAS os dados que
// estão no papel (emitente, número, datas, valores, itens). Fornecedor, categoria e
// centro de custo são resolvidos depois, por regra determinística
// (fn_financeiro_sugerir_fornecedor / fn_financeiro_categoria_sugerida).
//
// XML de NF-e/NFS-e NÃO passa por IA: o layout é fixo, então o parser é determinístico,
// tem confiança 1.0 e custo zero. IA só entra em PDF e imagem.
//
// Limitação conhecida: PDF escaneado (sem camada de texto) não é lido — a função
// devolve erro pedindo o XML ou uma foto. Rasterizar PDF no edge runtime não é viável.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMPT_PADRAO = `Você extrai dados de documentos fiscais brasileiros (nota fiscal, cupom, boleto, recibo).

Devolva SOMENTE o que está escrito no documento. Nunca invente, nunca complete o que não está legível.
Se um campo não aparecer no documento, use null — não chute.

Regras:
- Valores: número, sem símbolo de moeda, ponto como separador decimal (1234.56)
- Datas: AAAA-MM-DD
- CNPJ/CPF: apenas dígitos
- emitente = quem EMITIU a nota (o fornecedor), nunca o destinatário/tomador
- competencia_sugerida = primeiro dia do mês da data de emissão
- Em cupom fiscal sem itens discriminados, devolva itens como lista vazia`;

const JSON_SCHEMA = {
  name: 'documento_fiscal',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'emitente',
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

/** Nós de XML são estruturas livres; estes acessores evitam `any` espalhado. */
type NoXml = Record<string, unknown>;

const obj = (v: unknown): NoXml =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as NoXml) : {};

const txt = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

const lista = (v: unknown): NoXml[] =>
  v === null || v === undefined
    ? []
    : (Array.isArray(v) ? v : [v]).map((x) => obj(x));

/** Parser determinístico de NF-e 4.00 e NFS-e (padrão ABRASF). Sem IA. */
function parseXml(texto: string): { tipo: string; dados: Extracao } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
  });
  const doc = obj(parser.parse(texto));

  // --- NF-e / NFC-e -------------------------------------------------------
  const nfeProc = obj(doc.nfeProc ?? doc);
  const infNFe = lista(obj(nfeProc.NFe).infNFe ?? nfeProc.infNFe)[0] ?? null;

  if (infNFe && Object.keys(infNFe).length > 0) {
    const ide = obj(infNFe.ide);
    const emit = obj(infNFe.emit);
    const total = obj(obj(infNFe.total).ICMSTot);
    const dets = lista(infNFe.det);
    const dup = lista(obj(infNFe.cobr).dup);
    const emissao = String(ide.dhEmi ?? ide.dEmi ?? '').slice(0, 10) || null;

    return {
      tipo: 'nfe_xml',
      dados: {
        emitente: {
          cnpj: txt(emit.CNPJ ?? emit.CPF),
          razao_social: txt(emit.xNome),
        },
        documento: {
          tipo: 'nfe',
          numero: txt(ide.nNF),
          serie: txt(ide.serie),
          chave_acesso:
            String(infNFe['@_Id'] ?? '').replace(/^NFe/, '') || null,
          data_emissao: emissao,
        },
        valores: {
          total: num(total.vNF),
          descontos: num(total.vDesc),
          impostos: num(total.vTotTrib),
        },
        vencimentos: dup.map((d) => ({
          data: txt(d.dVenc),
          valor: num(d.vDup),
        })),
        itens: dets.map((d) => {
          const prod = obj(d.prod);
          return {
            descricao: txt(prod.xProd),
            quantidade: num(prod.qCom),
            valor_unitario: num(prod.vUnCom),
            valor_total: num(prod.vProd),
          };
        }),
        competencia_sugerida: emissao ? emissao.slice(0, 7) + '-01' : null,
        observacoes: txt(obj(infNFe.infAdic).infCpl),
      },
    };
  }

  // --- NFS-e (ABRASF) -----------------------------------------------------
  const inf =
    lista(
      obj(obj(doc.CompNfse).Nfse).InfNfse ??
        obj(obj(obj(obj(doc.ConsultarNfseResposta).ListaNfse).CompNfse).Nfse)
          .InfNfse ??
        doc.InfNfse ??
        obj(doc.Nfse).InfNfse
    )[0] ?? null;

  if (inf && Object.keys(inf).length > 0) {
    const prest = obj(inf.PrestadorServico ?? inf.IdentificacaoPrestador);
    const ident = obj(prest.IdentificacaoPrestador);
    const servico = obj(inf.Servico);
    const valores = obj(servico.Valores);
    const emissao = String(inf.DataEmissao ?? '').slice(0, 10) || null;

    return {
      tipo: 'nfse_xml',
      dados: {
        emitente: {
          cnpj: txt(ident.Cnpj ?? obj(ident.CpfCnpj).Cnpj ?? prest.Cnpj),
          razao_social: txt(prest.RazaoSocial ?? prest.NomeFantasia),
        },
        documento: {
          tipo: 'nfse',
          numero: txt(inf.Numero),
          serie: null,
          chave_acesso: txt(inf.CodigoVerificacao),
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
            descricao: txt(servico.Discriminacao),
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

  throw new Error('XML não reconhecido como NF-e nem NFS-e');
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
    | { tipo: 'imagem'; dataUri: string };
}): Promise<{ dados: Extracao; tokensIn: number; tokensOut: number }> {
  const userContent =
    params.conteudo.tipo === 'texto'
      ? [{ type: 'text', text: params.conteudo.valor.slice(0, 60000) }]
      : [
          { type: 'text', text: 'Extraia os dados deste documento fiscal.' },
          { type: 'image_url', image_url: { url: params.conteudo.dataUri } },
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

  if (!resp.ok) {
    throw new Error(
      `OpenAI ${resp.status}: ${(await resp.text()).slice(0, 400)}`
    );
  }

  const json = await resp.json();
  const texto = json?.choices?.[0]?.message?.content;
  if (!texto) throw new Error('OpenAI não devolveu conteúdo');

  return {
    dados: JSON.parse(texto),
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let documentoId: string | null = null;

  try {
    const body = await req.json();
    documentoId = body?.documento_id ?? null;
    if (!documentoId) throw new Error('documento_id é obrigatório');

    const { data: doc, error: docErr } = await supabase
      .from('documentos_fiscais')
      .select('*')
      .eq('id', documentoId)
      .single();

    if (docErr || !doc) throw new Error('Documento não encontrado');

    await supabase
      .from('documentos_fiscais')
      .update({ status: 'processando', tentativas: (doc.tentativas ?? 0) + 1 })
      .eq('id', documentoId);

    const { data: arquivo, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.caminho);

    if (dlErr || !arquivo) throw new Error('Não foi possível baixar o arquivo');

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const formato = detectarTipo(doc.nome_original, doc.mime_type);

    let tipoDetectado = 'desconhecido';
    let dados: Extracao;
    let confianca = 1;
    let modelo: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;

    if (formato === 'xml') {
      // Determinístico: sem IA, sem custo, sem alucinação
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
        throw new Error('Chave OpenAI não configurada');

      const { data: promptRow } = await supabase
        .from('ai_prompts')
        .select('prompt_content, openai_model')
        .eq('prompt_name', 'extrair_documento_fiscal')
        .eq('is_active', true)
        .maybeSingle();

      modelo = promptRow?.openai_model || 'gpt-4o';
      const prompt = promptRow?.prompt_content || PROMPT_PADRAO;

      if (formato === 'pdf') {
        const texto = await textoDoPdf(bytes);
        if (texto.length < 40) {
          throw new Error(
            'PDF sem camada de texto (provavelmente escaneado). Envie o XML da nota ou uma foto do documento.'
          );
        }
        tipoDetectado = /nfs-?e|servi[çc]o/i.test(texto)
          ? 'nfse_pdf'
          : 'danfe_pdf';
        const r = await extrairComIa({
          apiKey: chave.encrypted_key,
          modelo,
          prompt,
          conteudo: { tipo: 'texto', valor: texto },
        });
        dados = r.dados;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
        confianca = 0.85;
      } else if (formato === 'imagem') {
        tipoDetectado = 'cupom';
        const b64 = btoa(String.fromCharCode(...bytes));
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
        throw new Error(`Formato não suportado: ${doc.nome_original}`);
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
