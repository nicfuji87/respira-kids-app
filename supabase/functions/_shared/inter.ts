// AI dev note: Cliente compartilhado da API do Banco Inter (Pix Cobrança).
// A API exige mTLS: o certificado vai na conexão TLS via Deno.createHttpClient,
// não em header. Confirmado que o edge runtime do Supabase suporta isso.
//
// O token dura 1h; guardamos em memória do isolate para não pedir um a cada
// chamada. É cache best-effort — se o isolate reciclar, pede outro, sem problema.

const HOST = 'https://cdpj.partners.bancointer.com.br';

export const ESCOPOS_PIX =
  'cob.write cob.read webhook.write webhook.read pix.write pix.read';

interface TokenCache {
  token: string;
  expiraEm: number;
}
let cache: TokenCache | null = null;

export function lerCredenciais() {
  const faltando = [
    'INTER_CLIENT_ID',
    'INTER_CLIENT_SECRET',
    'INTER_CERT',
    'INTER_KEY',
  ].filter((n) => !Deno.env.get(n));

  if (faltando.length > 0) {
    throw new Error(`Secrets do Inter ausentes: ${faltando.join(', ')}`);
  }

  return {
    clientId: Deno.env.get('INTER_CLIENT_ID')!,
    clientSecret: Deno.env.get('INTER_CLIENT_SECRET')!,
    cert: Deno.env.get('INTER_CERT')!,
    key: Deno.env.get('INTER_KEY')!,
  };
}

function criarHttpClient(cert: string, key: string) {
  return (
    Deno as unknown as {
      createHttpClient: (o: unknown) => { close(): void };
    }
  ).createHttpClient({ cert, key });
}

async function obterToken(
  clientId: string,
  clientSecret: string,
  client: unknown
): Promise<string> {
  if (cache && cache.expiraEm > Date.now() + 60_000) {
    return cache.token;
  }

  const resp = await fetch(`${HOST}/oauth/v2/token`, {
    method: 'POST',
    client,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: ESCOPOS_PIX,
    }).toString(),
  } as RequestInit);

  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(`Falha ao autenticar no Inter (${resp.status}): ${texto}`);
  }

  const json = JSON.parse(texto) as {
    access_token: string;
    expires_in: number;
  };
  cache = {
    token: json.access_token,
    expiraEm: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

// Executa uma chamada autenticada na API do Inter. Abre e fecha o http client
// (com o certificado) por chamada — o custo é baixo perto da latência de rede.
export async function chamarInter<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown
): Promise<T> {
  const { clientId, clientSecret, cert, key } = lerCredenciais();
  const client = criarHttpClient(cert, key);

  try {
    const token = await obterToken(clientId, clientSecret, client);

    const resp = await fetch(`${HOST}${caminho}`, {
      method: metodo,
      client,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    } as RequestInit);

    const texto = await resp.text();
    if (!resp.ok) {
      throw new Error(`Inter ${metodo} ${caminho} (${resp.status}): ${texto}`);
    }
    return (texto ? JSON.parse(texto) : null) as T;
  } finally {
    client.close();
  }
}

export interface CobrancaPixResposta {
  txid: string;
  status: string;
  pixCopiaECola?: string;
  calendario?: { criacao?: string; expiracao?: number };
  loc?: { id: number; location: string };
}

// Cria cobrança Pix imediata. `valor` em reais; a API espera string "123.45".
// `expiracaoSegundos` conta a partir da criação.
export async function criarCobrancaPix(input: {
  chave: string;
  valor: number;
  expiracaoSegundos: number;
  solicitacaoPagador?: string;
  devedor?: { nome: string; cpf?: string; cnpj?: string };
}): Promise<CobrancaPixResposta> {
  const corpo: Record<string, unknown> = {
    calendario: { expiracao: input.expiracaoSegundos },
    valor: { original: input.valor.toFixed(2) },
    chave: input.chave,
  };

  if (input.solicitacaoPagador) {
    // a API limita esse campo; cortar evita 400 por descrição longa
    corpo.solicitacaoPagador = input.solicitacaoPagador.slice(0, 140);
  }
  if (input.devedor?.nome && (input.devedor.cpf || input.devedor.cnpj)) {
    corpo.devedor = input.devedor.cpf
      ? { nome: input.devedor.nome, cpf: input.devedor.cpf }
      : { nome: input.devedor.nome, cnpj: input.devedor.cnpj };
  }

  return await chamarInter<CobrancaPixResposta>('POST', '/pix/v2/cob', corpo);
}

// Cancela cobrança imediata ainda não paga. No padrão Pix não existe DELETE:
// cancelar é mudar o status para REMOVIDA_PELO_USUARIO_RECEBEDOR.
export async function cancelarCobrancaPix(
  txid: string
): Promise<CobrancaPixResposta> {
  return await chamarInter<CobrancaPixResposta>(
    'PATCH',
    `/pix/v2/cob/${txid}`,
    {
      status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR',
    }
  );
}

export interface DevolucaoResposta {
  id: string;
  rtrId?: string;
  valor?: string;
  status?: string;
}

// Devolução (estorno) de um Pix recebido. `idDevolucao` é escolhido por nós e
// funciona como chave de idempotência: repetir com o mesmo id não devolve duas vezes.
// ATENÇÃO: move dinheiro para fora da conta. Só chamar com intenção explícita.
export async function devolverPix(
  e2eid: string,
  idDevolucao: string,
  valor: number
): Promise<DevolucaoResposta> {
  return await chamarInter<DevolucaoResposta>(
    'PUT',
    `/pix/v2/pix/${e2eid}/devolucao/${idDevolucao}`,
    { valor: valor.toFixed(2) }
  );
}
