// AI dev note: API do módulo Produtos — catálogo vendável + kits + razão de estoque.
// Catálogo reaproveita produtos_servicos (vendavel=true). estoque_atual é cache mantido
// por trigger a partir de estoque_movimentos (quantidade é delta COM sinal).
// Funções lançam Error em falha (páginas tratam com try/catch).

import { supabase } from './supabase';
import {
  determineApiKeyFromEmpresa,
  getOrCreateAsaasCustomer,
  disableNotifications,
  createPayment,
} from './asaas-api';
import { criarFatura } from './faturas-api';
import type {
  Produto,
  ProdutoInput,
  KitComponente,
  KitComponenteInput,
  EstoqueMovimento,
  TipoMovimento,
  VendaProdutoResumo,
  StatusVenda,
} from '@/types/produtos';

const PRODUTO_COLS =
  'id, codigo, nome, descricao, unidade_medida, vendavel, controla_estoque, eh_kit, categoria_venda, preco_venda, estoque_minimo, estoque_atual, foto_url, ativo, created_at, updated_at';

export function formatBRL(v: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v ?? 0);
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
  itens: { quantidade: number; produto: { nome: string } | null }[] | null;
}

// Histórico de vendas de produto de um paciente (mais recentes primeiro).
export async function fetchVendasPaciente(
  patientId: string
): Promise<VendaProdutoResumo[]> {
  const { data, error } = await supabase
    .from('produto_vendas')
    .select(
      'id, status, valor_total, created_at, pago_em, itens:produto_venda_itens (quantidade, produto:produto_id (nome))'
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
    itens: (v.itens ?? []).map((i) => ({
      nome: i.produto?.nome ?? 'Produto',
      quantidade: i.quantidade,
    })),
  }));
}

interface VendaReenvioRow {
  id: string;
  paciente_id: string | null;
  responsavel_cobranca_id: string;
  empresa_id: string | null;
  valor_total: number;
  observacoes: string | null;
  fatura_id: string | null;
  itens:
    | {
        quantidade: number;
        preco_unitario: number;
        produto: { id: string; nome: string } | null;
      }[]
    | null;
}

// Reenvia a cobrança da venda. Se ainda não há cobrança ASAAS (fatura), cria agora;
// se já existe, reaproveita o link da fatura. Em ambos os casos enfileira o webhook
// padrão com reenvio=true para o n8n reenviar ao cliente. Lança em falha.
export async function reenviarCobrancaVenda(
  vendaId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('produto_vendas')
    .select(
      'id, paciente_id, responsavel_cobranca_id, empresa_id, valor_total, observacoes, fatura_id, itens:produto_venda_itens (quantidade, preco_unitario, produto:produto_id (id, nome))'
    )
    .eq('id', vendaId)
    .single();
  if (error) throw new Error(error.message);

  const venda = data as unknown as VendaReenvioRow;
  const itens = (venda.itens ?? []).map((i) => ({
    produto_id: i.produto?.id ?? null,
    nome: i.produto?.nome ?? 'Produto',
    quantidade: i.quantidade,
    preco_unitario: Number(i.preco_unitario),
    subtotal: Number(i.preco_unitario) * i.quantidade,
  }));

  let cobranca: CobrancaAsaasResultado | null = null;
  if (venda.fatura_id) {
    // cobrança já existe: reaproveita o link da fatura
    const { data: fat } = await supabase
      .from('faturas')
      .select('id, id_asaas, dados_asaas')
      .eq('id', venda.fatura_id)
      .single();
    const dados = (fat?.dados_asaas ?? {}) as Record<string, unknown>;
    cobranca = {
      asaasPaymentId: (fat?.id_asaas as string) ?? '',
      invoiceUrl:
        typeof dados.invoiceUrl === 'string' ? dados.invoiceUrl : null,
      faturaId: (fat?.id as string) ?? null,
    };
  } else {
    // sem cobrança ainda: cria agora (direto)
    if (!venda.empresa_id) {
      throw new Error(
        'Venda sem empresa de faturamento. Refaça a venda pelo carrinho.'
      );
    }
    cobranca = await criarCobrancaAsaasProduto(
      {
        vendaId: venda.id,
        empresaId: venda.empresa_id,
        responsavelId: venda.responsavel_cobranca_id,
        pacienteId: venda.paciente_id ?? '',
        valorTotal: Number(venda.valor_total),
        descricao:
          `Produtos: ${itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ')}`.slice(
            0,
            480
          ),
      },
      userId
    );
  }

  const { error: whErr } = await supabase.from('webhook_queue').insert({
    evento: 'venda_produto_criada',
    payload: {
      tipo: 'venda_produto_criada',
      timestamp: new Date().toISOString(),
      webhook_id: crypto.randomUUID(),
      data: {
        venda_id: venda.id,
        paciente_id: venda.paciente_id,
        responsavel_cobranca_id: venda.responsavel_cobranca_id,
        valor_total: Number(venda.valor_total),
        observacoes: venda.observacoes,
        usuario_id: userId || null,
        reenvio: true,
        asaas_payment_id: cobranca?.asaasPaymentId ?? null,
        invoice_url: cobranca?.invoiceUrl ?? null,
        fatura_id: cobranca?.faturaId ?? null,
        itens,
      },
    },
    status: 'pendente',
    tentativas: 0,
    max_tentativas: 3,
  });
  if (whErr) throw new Error(whErr.message);
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

function montarDescricaoProdutos(
  itens: { produto: Produto; quantidade: number }[]
): string {
  const partes = itens.map((i) => `${i.quantidade}x ${i.produto.nome}`);
  return `Produtos: ${partes.join(', ')}`.slice(0, 480);
}

export interface CobrancaAsaasResultado {
  asaasPaymentId: string;
  invoiceUrl: string | null;
  faturaId: string | null;
}

// Cria a cobrança ASAAS (PIX) da venda DIRETO (sem fila), igual à cobrança de
// agendamento: getOrCreateAsaasCustomer + createPayment + criarFatura(origem='produto').
// Vincula a fatura + empresa à venda. Lança em falha.
export async function criarCobrancaAsaasProduto(
  input: {
    vendaId: string;
    empresaId: string;
    responsavelId: string;
    pacienteId: string;
    valorTotal: number;
    descricao: string;
  },
  userId: string
): Promise<CobrancaAsaasResultado> {
  const apiConfig = await determineApiKeyFromEmpresa(input.empresaId);
  if (!apiConfig) {
    throw new Error(
      'A empresa de faturamento não tem chave do Asaas configurada.'
    );
  }

  const customer = await getOrCreateAsaasCustomer(
    input.responsavelId,
    apiConfig
  );
  if (!customer.success || !customer.asaasCustomerId) {
    throw new Error(
      customer.error || 'Não foi possível preparar o cliente no Asaas.'
    );
  }

  // silencia notificações nativas do Asaas (best-effort, igual aos agendamentos)
  try {
    await disableNotifications(customer.asaasCustomerId, apiConfig);
  } catch {
    /* não bloqueia a cobrança */
  }

  const due = new Date();
  due.setDate(due.getDate() + 2);
  const dueDate = due.toISOString().split('T')[0];

  const pay = await createPayment(
    {
      customer: customer.asaasCustomerId,
      billingType: 'PIX',
      value: input.valorTotal,
      dueDate,
      description: input.descricao,
      externalReference: `produto-${input.vendaId}`,
    },
    apiConfig
  );
  if (!pay.success || !pay.asaasPaymentId) {
    throw new Error(pay.error || 'Falha ao criar a cobrança no Asaas.');
  }

  const dadosAsaas = (pay.data ?? {}) as Record<string, unknown>;
  const invoiceUrl =
    typeof dadosAsaas.invoiceUrl === 'string' ? dadosAsaas.invoiceUrl : null;

  const fatura = await criarFatura(
    {
      id_asaas: pay.asaasPaymentId,
      valor_total: input.valorTotal,
      descricao: input.descricao,
      empresa_id: input.empresaId,
      responsavel_cobranca_id: input.responsavelId,
      tomador_nfe_id: input.responsavelId,
      paciente_id: input.pacienteId,
      vencimento: dueDate,
      dados_asaas: dadosAsaas,
      agendamento_ids: [],
      origem: 'produto',
    },
    userId
  );
  const faturaId = fatura.success ? (fatura.data?.id ?? null) : null;

  const { error: upErr } = await supabase
    .from('produto_vendas')
    .update({
      fatura_id: faturaId,
      empresa_id: input.empresaId,
      status: 'aguardando_pagamento',
    })
    .eq('id', input.vendaId);
  if (upErr) console.warn('⚠️ Falha ao vincular fatura à venda:', upErr);

  return { asaasPaymentId: pay.asaasPaymentId, invoiceUrl, faturaId };
}

// Cria a venda (produto_vendas + itens), gera a cobrança ASAAS direto e enfileira o
// webhook padrão (com o link) p/ o n8n enviar ao cliente + tocar o fluxo Nubank.
// Quando a venda virar 'pago', o trigger baixa o estoque automaticamente.
export async function finalizarVendaProduto(
  input: {
    paciente_id: string;
    responsavel_cobranca_id: string;
    empresa_id: string;
    itens: CarrinhoItem[];
    observacoes?: string | null;
  },
  userId: string
): Promise<{ venda_id: string }> {
  if (input.itens.length === 0) {
    throw new Error('O carrinho está vazio.');
  }
  if (!input.empresa_id) {
    throw new Error('Selecione a empresa de faturamento.');
  }

  const valorTotal = input.itens.reduce(
    (acc, i) => acc + (i.produto.preco_venda ?? 0) * i.quantidade,
    0
  );

  const { data: venda, error: vErr } = await supabase
    .from('produto_vendas')
    .insert({
      paciente_id: input.paciente_id,
      responsavel_cobranca_id: input.responsavel_cobranca_id,
      empresa_id: input.empresa_id,
      valor_total: valorTotal,
      status: 'aguardando_pagamento',
      observacoes: input.observacoes ?? null,
      criado_por: userId || null,
    })
    .select('id')
    .single();
  if (vErr) throw new Error(vErr.message);

  const vendaId = venda.id as string;

  const { error: iErr } = await supabase.from('produto_venda_itens').insert(
    input.itens.map((i) => ({
      venda_id: vendaId,
      produto_id: i.produto.id,
      quantidade: i.quantidade,
      preco_unitario: i.produto.preco_venda ?? 0,
    }))
  );
  if (iErr) throw new Error(iErr.message);

  // cria a cobrança ASAAS de verdade (direto, sem fila) — igual aos agendamentos
  const cobranca = await criarCobrancaAsaasProduto(
    {
      vendaId,
      empresaId: input.empresa_id,
      responsavelId: input.responsavel_cobranca_id,
      pacienteId: input.paciente_id,
      valorTotal,
      descricao: montarDescricaoProdutos(input.itens),
    },
    userId
  );

  await enfileirarWebhookVendaProduto(
    vendaId,
    input,
    valorTotal,
    userId,
    cobranca
  );

  return { venda_id: vendaId };
}

// Enfileira o webhook da venda. NUNCA lança: a venda já foi gravada, uma falha ao
// enfileirar não pode quebrar a operação (pode ser reprocessada).
async function enfileirarWebhookVendaProduto(
  vendaId: string,
  input: {
    paciente_id: string;
    responsavel_cobranca_id: string;
    itens: CarrinhoItem[];
    observacoes?: string | null;
  },
  valorTotal: number,
  userId: string,
  cobranca?: CobrancaAsaasResultado | null
): Promise<void> {
  try {
    const { error } = await supabase.from('webhook_queue').insert({
      evento: 'venda_produto_criada',
      payload: {
        tipo: 'venda_produto_criada',
        timestamp: new Date().toISOString(),
        webhook_id: crypto.randomUUID(),
        data: {
          venda_id: vendaId,
          paciente_id: input.paciente_id,
          responsavel_cobranca_id: input.responsavel_cobranca_id,
          valor_total: valorTotal,
          observacoes: input.observacoes ?? null,
          usuario_id: userId || null,
          asaas_payment_id: cobranca?.asaasPaymentId ?? null,
          invoice_url: cobranca?.invoiceUrl ?? null,
          fatura_id: cobranca?.faturaId ?? null,
          itens: input.itens.map((i) => ({
            produto_id: i.produto.id,
            nome: i.produto.nome,
            quantidade: i.quantidade,
            preco_unitario: i.produto.preco_venda ?? 0,
            subtotal: (i.produto.preco_venda ?? 0) * i.quantidade,
          })),
        },
      },
      status: 'pendente',
      tentativas: 0,
      max_tentativas: 3,
    });
    if (error) {
      console.warn(
        '⚠️ Falha ao enfileirar webhook de venda de produto:',
        error
      );
    }
  } catch (e) {
    console.warn('⚠️ Erro inesperado ao enfileirar webhook de venda:', e);
  }
}
