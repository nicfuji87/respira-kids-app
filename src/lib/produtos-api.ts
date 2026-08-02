// AI dev note: API do módulo Produtos — catálogo vendável + kits + razão de estoque.
// Catálogo reaproveita produtos_servicos (vendavel=true). estoque_atual é cache mantido
// por trigger a partir de estoque_movimentos (quantidade é delta COM sinal).
// Funções lançam Error em falha (páginas tratam com try/catch).

import { supabase } from './supabase';
import type {
  Produto,
  ProdutoVendavel,
  ProdutoInput,
  KitComponente,
  KitComponenteInput,
  EstoqueMovimento,
  TipoMovimento,
  VendaProdutoResumo,
  StatusVenda,
  CobrancaPixProduto,
  VendaProdutoPublica,
  CredencialAVencer,
  ProdutoCusto,
} from '@/types/produtos';

const PRODUTO_COLS =
  'id, codigo, nome, descricao, unidade_medida, vendavel, controla_estoque, eh_kit, categoria_venda, preco_venda, preco_referencia, estoque_minimo, estoque_atual, foto_url, ativo, created_at, updated_at';

export function formatBRL(v: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v ?? 0);
}

// Quanto ainda dá para adicionar ao carrinho. null = ilimitado.
export function restanteParaAdicionar(
  produto: { disponivel: number | null },
  noCarrinho: number
): number | null {
  if (produto.disponivel === null) return null;
  return Math.max(produto.disponivel - noCarrinho, 0);
}

// item controla estoque e está no mínimo ou abaixo
export function isEstoqueBaixo(p: {
  controla_estoque: boolean;
  eh_kit: boolean;
  estoque_atual: number;
  estoque_minimo: number;
}): boolean {
  return p.controla_estoque && !p.eh_kit && p.estoque_atual <= p.estoque_minimo;
}

// === CATÁLOGO ===

export async function fetchProdutos(opts?: {
  incluirInativos?: boolean;
}): Promise<Produto[]> {
  let query = supabase
    .from('produtos_servicos')
    .select(PRODUTO_COLS)
    .eq('vendavel', true)
    .order('nome', { ascending: true });

  if (!opts?.incluirInativos) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Produto[];
}

// Catálogo da venda: produtos ativos + saldo vendável já resolvido.
// Espelha fn_disponibilidade_produto (o servidor revalida em fn_criar_venda_produto);
// aqui é só para a tela saber o que oferecer sem uma chamada por produto.
export async function fetchProdutosParaVenda(): Promise<ProdutoVendavel[]> {
  const produtos = await fetchProdutos();
  const kits = produtos.filter((p) => p.eh_kit);

  // um kit não tem saldo próprio: quem limita é o componente mais escasso
  const dispPorKit = new Map<string, number>();
  if (kits.length > 0) {
    const { data, error } = await supabase
      .from('produto_kit_componentes')
      .select(
        'kit_produto_id, quantidade, componente:componente_produto_id (estoque_atual, controla_estoque)'
      )
      .in(
        'kit_produto_id',
        kits.map((k) => k.id)
      );
    if (error) throw new Error(error.message);

    type CompRow = {
      kit_produto_id: string;
      quantidade: number;
      componente: { estoque_atual: number; controla_estoque: boolean } | null;
    };
    for (const row of (data ?? []) as unknown as CompRow[]) {
      if (!row.componente?.controla_estoque || row.quantidade <= 0) continue;
      const possivel = Math.floor(
        row.componente.estoque_atual / row.quantidade
      );
      const atual = dispPorKit.get(row.kit_produto_id);
      dispPorKit.set(
        row.kit_produto_id,
        atual === undefined ? possivel : Math.min(atual, possivel)
      );
    }
  }

  return produtos.map((p) => ({
    ...p,
    // kit sem composição fica em 0 de propósito: força configurar antes de vender
    disponivel: p.eh_kit
      ? (dispPorKit.get(p.id) ?? 0)
      : p.controla_estoque
        ? Math.max(p.estoque_atual, 0)
        : null,
  }));
}

export async function criarProduto(
  input: ProdutoInput,
  userId: string
): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos_servicos')
    .insert({
      nome: input.nome,
      descricao: input.descricao ?? null,
      unidade_medida: input.unidade_medida || 'unidade',
      vendavel: true,
      // kit não controla estoque próprio — a baixa consome os componentes
      controla_estoque: input.eh_kit ? false : input.controla_estoque,
      eh_kit: input.eh_kit,
      categoria_venda: input.categoria_venda,
      preco_venda: input.preco_venda,
      preco_referencia: input.preco_referencia ?? 0,
      estoque_minimo: input.estoque_minimo ?? 0,
      foto_url: input.foto_url ?? null,
      ativo: input.ativo ?? true,
      criado_por: userId,
    })
    .select(PRODUTO_COLS)
    .single();

  if (error) throw new Error(error.message);
  return data as Produto;
}

export async function atualizarProduto(
  id: string,
  input: ProdutoInput,
  userId: string
): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos_servicos')
    .update({
      nome: input.nome,
      descricao: input.descricao ?? null,
      unidade_medida: input.unidade_medida || 'unidade',
      controla_estoque: input.eh_kit ? false : input.controla_estoque,
      eh_kit: input.eh_kit,
      categoria_venda: input.categoria_venda,
      preco_venda: input.preco_venda,
      preco_referencia: input.preco_referencia ?? 0,
      estoque_minimo: input.estoque_minimo ?? 0,
      foto_url: input.foto_url ?? null,
      ativo: input.ativo ?? true,
      atualizado_por: userId,
    })
    .eq('id', id)
    .select(PRODUTO_COLS)
    .single();

  if (error) throw new Error(error.message);
  return data as Produto;
}

export async function setProdutoAtivo(
  id: string,
  ativo: boolean,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('produtos_servicos')
    .update({ ativo, atualizado_por: userId })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// === KITS ===

export async function fetchKitComponentes(
  kitId: string
): Promise<KitComponente[]> {
  const { data, error } = await supabase
    .from('produto_kit_componentes')
    .select(
      'id, kit_produto_id, componente_produto_id, quantidade, componente:componente_produto_id (id, nome, estoque_atual, unidade_medida, controla_estoque)'
    )
    .eq('kit_produto_id', kitId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KitComponente[];
}

// Substitui integralmente a composição do kit (delete + insert).
export async function salvarKitComponentes(
  kitId: string,
  itens: KitComponenteInput[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from('produto_kit_componentes')
    .delete()
    .eq('kit_produto_id', kitId);
  if (delErr) throw new Error(delErr.message);

  if (itens.length === 0) return;

  const { error } = await supabase.from('produto_kit_componentes').insert(
    itens.map((i) => ({
      kit_produto_id: kitId,
      componente_produto_id: i.componente_produto_id,
      quantidade: i.quantidade,
    }))
  );
  if (error) throw new Error(error.message);
}

// === ESTOQUE ===

// quantidade já vem COM sinal (+entrada, -saída/perda, ± ajuste).
export async function registrarMovimento(
  input: {
    produto_id: string;
    tipo: TipoMovimento;
    quantidade: number;
    motivo?: string | null;
    custo_unitario?: number | null;
  },
  userId: string
): Promise<void> {
  if (!input.quantidade || input.quantidade === 0) {
    throw new Error('A quantidade do movimento não pode ser zero.');
  }
  const { error } = await supabase.from('estoque_movimentos').insert({
    produto_id: input.produto_id,
    tipo: input.tipo,
    quantidade: input.quantidade,
    motivo: input.motivo ?? null,
    custo_unitario: input.custo_unitario ?? null,
    criado_por: userId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchMovimentos(opts?: {
  produtoId?: string;
  limit?: number;
}): Promise<EstoqueMovimento[]> {
  let query = supabase
    .from('estoque_movimentos')
    .select(
      'id, produto_id, tipo, quantidade, custo_unitario, motivo, venda_id, criado_por, created_at, produto:produto_id (nome, unidade_medida)'
    )
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.produtoId) query = query.eq('produto_id', opts.produtoId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EstoqueMovimento[];
}

// === FOTO ===

const FOTO_BUCKET = 'respira-produtos';

// Faz upload da foto (já comprimida no cliente) e devolve a URL pública.
export async function uploadProdutoFoto(
  blob: Blob,
  ext: string
): Promise<string> {
  const path = `produtos/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(FOTO_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || undefined,
    });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(FOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// === VENDA (carrinho no detalhe do paciente) ===

export interface ResponsavelCobranca {
  id: string;
  nome: string;
}

// Responsável de cobrança configurado no paciente (pessoas.responsavel_cobranca_id).
export async function fetchResponsavelCobranca(
  patientId: string
): Promise<ResponsavelCobranca | null> {
  const { data: paciente, error } = await supabase
    .from('pessoas')
    .select('responsavel_cobranca_id')
    .eq('id', patientId)
    .single();
  if (error) throw new Error(error.message);

  const respId = (paciente?.responsavel_cobranca_id as string | null) ?? null;
  if (!respId) return null;

  const { data: resp } = await supabase
    .from('pessoas')
    .select('id, nome')
    .eq('id', respId)
    .single();
  return resp ? { id: resp.id as string, nome: resp.nome as string } : null;
}

export interface CarrinhoItem {
  produto: Produto;
  quantidade: number;
}

interface VendaRow {
  id: string;
  status: string;
  valor_total: number;
  created_at: string;
  pago_em: string | null;
  pix_copia_cola: string | null;
  cobranca_token: string | null;
  pix_expira_em: string | null;
  itens: { quantidade: number; produto: { nome: string } | null }[] | null;
}

// Histórico de vendas de produto de um paciente (mais recentes primeiro).
export async function fetchVendasPaciente(
  patientId: string
): Promise<VendaProdutoResumo[]> {
  const { data, error } = await supabase
    .from('produto_vendas')
    .select(
      'id, status, valor_total, created_at, pago_em, pix_copia_cola, cobranca_token, pix_expira_em, itens:produto_venda_itens (quantidade, produto:produto_id (nome))'
    )
    .eq('paciente_id', patientId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as VendaRow[];
  return rows.map((v) => ({
    id: v.id,
    status: v.status as StatusVenda,
    valor_total: Number(v.valor_total),
    created_at: v.created_at,
    pago_em: v.pago_em,
    pix_copia_cola: v.pix_copia_cola,
    cobranca_token: v.cobranca_token,
    pix_expira_em: v.pix_expira_em,
    itens: (v.itens ?? []).map((i) => ({
      nome: i.produto?.nome ?? 'Produto',
      quantidade: i.quantidade,
    })),
  }));
}

// === COBRANÇA PIX (BANCO INTER) ===

// Monta o link público da página de pagamento a partir do token da venda.
export function linkPagamentoProduto(token: string): string {
  return `${window.location.origin}/#/pagamento-produto/${token}`;
}

// Cria (ou reaproveita) a cobrança Pix da venda no Banco Inter.
// A edge function também enfileira o webhook que manda o link no WhatsApp.
export async function criarCobrancaPixProduto(
  vendaId: string
): Promise<CobrancaPixProduto> {
  const { data, error } = await supabase.functions.invoke(
    'inter-criar-cobranca-produto',
    { body: { venda_id: vendaId } }
  );
  if (error) {
    // a edge function devolve {error} no corpo; a mensagem dela é mais útil
    const detalhe = (data as { error?: string } | null)?.error;
    throw new Error(detalhe || error.message);
  }
  const resultado = data as CobrancaPixProduto & { error?: string };
  if (resultado?.error) throw new Error(resultado.error);
  return resultado;
}

// Cancela a venda. `devolverPix` é opt-in e só admin pode: sem ele, o estoque
// volta mas o dinheiro NÃO é estornado (evita transferência por engano).
export async function cancelarVendaProduto(
  vendaId: string,
  opts?: { motivo?: string; devolverPix?: boolean }
): Promise<{ era_paga?: boolean; avisos?: string[] }> {
  const { data, error } = await supabase.functions.invoke(
    'inter-cancelar-venda-produto',
    {
      body: {
        venda_id: vendaId,
        motivo: opts?.motivo ?? null,
        devolver_pix: opts?.devolverPix ?? false,
      },
    }
  );
  if (error) {
    const detalhe = (data as { error?: string } | null)?.error;
    throw new Error(detalhe || error.message);
  }
  const resultado = data as {
    error?: string;
    era_paga?: boolean;
    avisos?: string[];
  };
  if (resultado?.error) throw new Error(resultado.error);
  return resultado;
}

// Página pública: busca a venda só pelo token, sem login.
export async function fetchVendaProdutoPublica(
  token: string
): Promise<VendaProdutoPublica | null> {
  const { data, error } = await supabase.rpc(
    'fn_public_venda_produto_por_token',
    { p_token: token }
  );
  if (error) throw new Error(error.message);
  return (data as VendaProdutoPublica | null) ?? null;
}

// Custo unitário de cada produto vendável, para valorizar o estoque e calcular
// margem. Produto sem custo informado vem com custo_efetivo null de propósito.
export async function fetchProdutoCustos(): Promise<ProdutoCusto[]> {
  const { data, error } = await supabase.from('vw_produto_custo').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as ProdutoCusto[];
}

// Credenciais externas perto de vencer (hoje: certificado do Inter).
export async function fetchCredenciaisAVencer(): Promise<CredencialAVencer[]> {
  const { data, error } = await supabase
    .from('vw_credenciais_a_vencer')
    .select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as CredencialAVencer[];
}

// Reenvia a cobrança da venda. A edge function reaproveita a cobrança Pix que já
// existe (ou cria, se ainda não houver) e reenfileira o webhook que manda o link
// no WhatsApp. Lança em falha.
export async function reenviarCobrancaVenda(vendaId: string): Promise<void> {
  await criarCobrancaPixProduto(vendaId);
}

// === EMPRESAS DE FATURAMENTO (para a cobrança do produto) ===

export interface EmpresaCobranca {
  id: string;
  nome: string;
}

export async function fetchEmpresasCobranca(): Promise<EmpresaCobranca[]> {
  const { data, error } = await supabase
    .from('pessoa_empresas')
    .select('id, razao_social, nome_fantasia')
    .eq('ativo', true)
    .not('api_token_externo', 'is', null)
    .order('nome_fantasia', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    nome: (e.nome_fantasia as string) || (e.razao_social as string),
  }));
}

// Cria a venda (produto_vendas + itens numa transação, com validação de estoque) e
// em seguida a cobrança Pix no Banco Inter. A edge function grava o txid/copia-e-cola
// na venda e enfileira o webhook que manda o link no WhatsApp.
// Quando o Pix cair, o webhook do Inter marca a venda paga e o trigger baixa o estoque.
export async function finalizarVendaProduto(input: {
  paciente_id: string;
  responsavel_cobranca_id: string;
  empresa_id?: string | null;
  itens: CarrinhoItem[];
  observacoes?: string | null;
}): Promise<{ venda_id: string; cobranca: CobrancaPixProduto }> {
  if (input.itens.length === 0) {
    throw new Error('O carrinho está vazio.');
  }

  const { data: novaVendaId, error: vErr } = await supabase.rpc(
    'fn_criar_venda_produto',
    {
      p_paciente_id: input.paciente_id,
      p_responsavel_cobranca_id: input.responsavel_cobranca_id,
      p_itens: input.itens.map((i) => ({
        produto_id: i.produto.id,
        quantidade: i.quantidade,
      })),
      p_empresa_id: input.empresa_id ?? null,
      p_observacoes: input.observacoes ?? null,
    }
  );
  if (vErr) throw new Error(vErr.message);
  const vendaId = novaVendaId as string | null;
  if (!vendaId) throw new Error('Não foi possível registrar a venda.');

  // A venda nasce 'rascunho'. Se a cobrança falhar, ela fica assim e dá para
  // tentar de novo pelo histórico — melhor que uma venda 'aguardando pagamento'
  // que nunca teve cobrança.
  const cobranca = await criarCobrancaPixProduto(vendaId);

  return { venda_id: vendaId, cobranca };
}
