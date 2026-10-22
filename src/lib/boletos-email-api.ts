// AI dev note: Boletos que chegam por e-mail (edge email-boletos) e o pedido de
// pagamento que eles abrem (boleto_solicitacoes, link /#/boleto/:id no grupo de notas).
//
// O pagamento segue a mesma ordem do Pix (ver pix-solicitacao-api.ts):
//   1. iniciar  → trava o pedido em "pagando" e fixa a data (vencimento, ou hoje se já venceu)
//   2. inter-pagar → o Inter agenda o boleto para essa data
//   3. concluir → confere na auditoria e marca "agendado"
// Quem confirma que o dinheiro saiu é a edge email-boletos, no dia do pagamento.

import { supabase } from './supabase';
import { enviarPagamentoInter } from './inter-conta-api';

// ---------------------------------------------------------------------------
// Caixas de e-mail (Gmail)
// ---------------------------------------------------------------------------

export interface EmailCaixa {
  id: string;
  email: string;
  ativo: boolean;
  conectada: boolean;
  conectado_em: string | null;
  conectado_por: string | null;
  ultima_leitura_em: string | null;
  ultimo_erro: string | null;
}

export async function listarCaixas(): Promise<EmailCaixa[]> {
  const { data, error } = await supabase.rpc('fn_email_caixas_listar');
  if (error) throw new Error(error.message);
  return (data as EmailCaixa[]) ?? [];
}

export async function definirCaixaAtiva(id: string, ativo: boolean) {
  const { error } = await supabase.rpc('fn_email_caixa_definir_ativa', {
    p_id: id,
    p_ativo: ativo,
  });
  if (error) throw new Error(error.message);
}

// Mesmo client OAuth do Google Calendar; o state diz ao callback que é uma caixa de boletos.
export function urlConectarGmail(emailSugerido?: string): string {
  let clientId: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  // mesmo remendo do GoogleCalendarSettings: o build já truncou o primeiro dígito
  if (clientId && !clientId.startsWith('7')) clientId = '7' + clientId;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${import.meta.env.VITE_APP_URL}/api/oauth-callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: JSON.stringify({ tipo: 'gmail_boletos' }),
  });
  if (emailSugerido) params.set('login_hint', emailSugerido);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function concluirConexaoGmail(code: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gmail-conectar', {
    body: { code },
  });
  const r = data as { ok?: boolean; email?: string; error?: string } | null;
  if (error || !r?.ok) {
    let msg = r?.error;
    if (!msg && error && 'context' in error) {
      try {
        msg = ((await (error.context as Response).json()) as { error?: string })
          .error;
      } catch {
        // corpo não era JSON
      }
    }
    throw new Error(msg || error?.message || 'Não foi possível conectar');
  }
  return r.email ?? '';
}

export async function lerEmailsAgora(): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('email-boletos', {
    body: {},
  });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Remetentes cadastrados
// ---------------------------------------------------------------------------

// inter: o admin agenda no Inter pela página; outra_conta: alguém paga e marca como pago;
// asaas: o sistema agenda no Asaas (conta com chave de API) e a Bruna libera no app dela.
export type PagarPor = 'inter' | 'outra_conta' | 'asaas';

export interface RemetenteBoleto {
  id: string;
  email: string;
  fornecedor_id: string;
  lancamento_recorrente_id: string | null;
  identificador: string | null;
  categoria_contabil_id: string | null;
  observacao: string | null;
  ativo: boolean;
  debito_automatico: boolean;
  conta_bancaria_id: string | null;
  senha_pdf: string | null;
  pagar_por: PagarPor;
  links_permitidos: string | null;
  fornecedor?: {
    nome_fantasia: string | null;
    nome_razao_social: string | null;
  };
  recorrente?: { descricao: string | null } | null;
}

export async function listarRemetentes(): Promise<RemetenteBoleto[]> {
  const { data, error } = await supabase
    .from('email_boleto_remetentes')
    .select(
      'id, email, fornecedor_id, lancamento_recorrente_id, identificador, categoria_contabil_id, observacao, ativo, debito_automatico, conta_bancaria_id, senha_pdf, pagar_por, links_permitidos, fornecedor:fornecedores(nome_fantasia, nome_razao_social), recorrente:lancamentos_recorrentes(descricao)'
    )
    .order('email');
  if (error) throw new Error(error.message);
  return (data as unknown as RemetenteBoleto[]) ?? [];
}

export interface RemetenteInput {
  email: string;
  fornecedor_id: string;
  lancamento_recorrente_id: string | null;
  identificador: string | null;
  observacao: string | null;
  ativo: boolean;
  debito_automatico: boolean;
  conta_bancaria_id: string | null;
  senha_pdf: string | null;
  pagar_por: PagarPor;
  links_permitidos: string | null;
}

export async function salvarRemetente(input: RemetenteInput, id?: string) {
  const linha = {
    ...input,
    email: input.email.trim().toLowerCase(),
    identificador: input.identificador?.trim() || null,
    observacao: input.observacao?.trim() || null,
    senha_pdf: input.senha_pdf?.trim() || null,
    links_permitidos: input.links_permitidos?.trim().toLowerCase() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from('email_boleto_remetentes').update(linha).eq('id', id)
    : await supabase.from('email_boleto_remetentes').insert(linha);
  if (error) throw new Error(error.message);
}

export async function excluirRemetente(id: string) {
  const { error } = await supabase
    .from('email_boleto_remetentes')
    .delete()
    .eq('id', id);
  if (error) {
    // já tem boleto ligado a ele: desativa em vez de apagar o histórico
    const { error: e2 } = await supabase
      .from('email_boleto_remetentes')
      .update({ ativo: false })
      .eq('id', id);
    if (e2) throw new Error(e2.message);
  }
}

export interface OpcaoSimples {
  id: string;
  nome: string;
  // conta bancária no Asaas com chave de API (dá para agendar pagamento por ela)
  asaas?: boolean;
}

export async function listarFornecedoresAtivos(): Promise<OpcaoSimples[]> {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome_fantasia, nome_razao_social')
    .eq('ativo', true)
    .order('nome_fantasia');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((f) => ({
      id: f.id as string,
      nome: (f.nome_fantasia || f.nome_razao_social || '—') as string,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function listarContasBancarias(): Promise<OpcaoSimples[]> {
  const { data, error } = await supabase
    .from('contas_bancarias')
    .select('id, banco_nome, agencia, conta, digito, asaas_empresa_id')
    .eq('ativo', true)
    .order('banco_nome');
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    asaas: !!c.asaas_empresa_id,
    nome: [
      c.banco_nome,
      c.conta ? `conta ${c.conta}${c.digito ? '-' + c.digito : ''}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

export async function listarContasFixas(
  fornecedorId: string
): Promise<OpcaoSimples[]> {
  const { data, error } = await supabase
    .from('lancamentos_recorrentes')
    .select('id, descricao')
    .eq('fornecedor_id', fornecedorId)
    .eq('ativo', true)
    .order('descricao');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    nome: (r.descricao || 'Conta fixa') as string,
  }));
}

// ---------------------------------------------------------------------------
// E-mails lidos (registro)
// ---------------------------------------------------------------------------

export interface EmailLido {
  id: string;
  remetente: string | null;
  assunto: string | null;
  recebido_em: string | null;
  status: 'boleto' | 'sem_boleto' | 'duplicado' | 'ignorado' | 'erro';
  detalhe: string | null;
  solicitacao_id: string | null;
  created_at: string;
}

export async function listarEmailsLidos(limite = 30): Promise<EmailLido[]> {
  const { data, error } = await supabase
    .from('email_mensagens')
    .select(
      'id, remetente, assunto, recebido_em, status, detalhe, solicitacao_id, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data as EmailLido[]) ?? [];
}

// ---------------------------------------------------------------------------
// Pedido de pagamento do boleto (/boleto/:id)
// ---------------------------------------------------------------------------

export type BoletoStatus =
  | 'aguardando'
  | 'pagando'
  // conta do Asaas: o sistema está criando o pagamento lá
  | 'agendando'
  | 'agendado'
  | 'pago'
  | 'erro'
  | 'cancelado'
  // débito automático: só registrado, baixa no vencimento
  | 'debito'
  // pago por outra conta (ex.: Asaas da BC): alguém marca como pago no app
  | 'externo';

export interface AlertaBoleto {
  nivel: 'info' | 'atencao' | 'grave';
  texto: string;
}

export interface BoletoSolicitacao {
  id: string;
  status: BoletoStatus;
  valor: number;
  // valor efetivamente mandado ao Inter (com multa e juros quando vencido)
  valor_pagar: number | null;
  vencimento: string;
  linha_digitavel: string;
  banco_codigo: string | null;
  beneficiario_nome: string | null;
  beneficiario_doc: string | null;
  descricao: string | null;
  alertas: AlertaBoleto[];
  anexo_path: string | null;
  remetente_email: string | null;
  created_at: string;
  data_pagamento: string | null;
  concluido_em: string | null;
  erro: string | null;
  lancamento_id: string;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  assunto: string | null;
  caixa: string | null;
  aprovado_por: string | null;
  debito_automatico: boolean;
  conta_debito: string | null;
  // senha do PDF (ex.: Claro = 5 primeiros dígitos do CNPJ)
  senha_pdf: string | null;
  pagar_por: PagarPor;
  // por qual conta pagar e de quem é o custo (lançamento individual)
  conta_pagamento: string | null;
  custo_de: string | null;
  // titular da conta (ex.: BC FISIO KIDS) e id do pagamento criado no Asaas
  conta_titular: string | null;
  asaas_bill_id: string | null;
}

export async function fetchBoletoSolicitacao(
  id: string
): Promise<BoletoSolicitacao | null> {
  const { data, error } = await supabase.rpc('fn_boleto_solicitacao_obter', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as BoletoSolicitacao | null) ?? null;
}

// "Inter POST /banking/v2/pagamento (400): {"title":"...","detail":"..."}" → texto legível
function mensagemInter(msg: string): string {
  const m = msg.match(/Inter [A-Z]+ \S+ \((\d+)\): (\{.*\})/s);
  if (!m) return msg;
  try {
    const corpo = JSON.parse(m[2]) as { title?: string; detail?: string };
    const partes = [corpo.title, corpo.detail].filter(Boolean).join('. ');
    return partes ? `O Inter recusou: ${partes}` : msg;
  } catch {
    return msg;
  }
}

// Boleto vencido: o Inter recusa o valor original e informa o mínimo com encargos
// ("Pagamento mínimo aceito: R$ 1552.49"). Devolve esse valor para a página oferecer.
export function minimoExigidoPeloInter(erro: string | null): number | null {
  const m = erro?.match(/m[ií]nimo aceito:\s*R\$\s*([\d.,]+)/i);
  if (!m) return null;
  // o Inter manda com ponto decimal ("1552.49"); aceita também "1.552,49"
  const bruto = m[1].replace(/[.,]$/, '');
  const n = /,\d{2}$/.test(bruto)
    ? Number(bruto.replace(/\./g, '').replace(',', '.'))
    : Number(bruto.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ATENÇÃO: agenda a saída de dinheiro da conta do Inter. `valorPagar` só para
// boleto vencido (o servidor aceita até 10% acima do valor do boleto).
export async function agendarBoleto(
  id: string,
  valorPagar?: number,
  // conta de arrecadação (48 dígitos) não traz o vencimento no código
  vencimento?: string
): Promise<{ data_pagamento: string | null }> {
  const { data: inicio, error: iniErr } = await supabase.rpc(
    'fn_boleto_solicitacao_iniciar',
    { p_id: id, p_valor_pagar: valorPagar ?? null }
  );
  if (iniErr) throw new Error(iniErr.message);
  const ini = inicio as {
    ok: boolean;
    erro?: string;
    valor?: number;
    linha_digitavel?: string;
    data_pagamento?: string;
    favorecido?: string;
    descricao?: string;
  };
  if (!ini?.ok) throw new Error(ini?.erro || 'Pedido indisponível');

  let auditoriaId = '';
  try {
    const r = await enviarPagamentoInter({
      tipo: 'boleto',
      valor: Number(ini.valor),
      codigoBarras: ini.linha_digitavel,
      dataVencimento: vencimento,
      dataPagamento: ini.data_pagamento,
      favorecido: ini.favorecido ?? undefined,
      descricao: ini.descricao ?? undefined,
    });
    auditoriaId = r.auditoria_id;
  } catch (e) {
    const msg = mensagemInter(
      e instanceof Error ? e.message : 'Falha ao agendar o boleto'
    );
    await supabase.rpc('fn_boleto_solicitacao_concluir', {
      p_id: id,
      p_inter_pagamento_id: null,
      p_erro: msg,
    });
    throw new Error(msg);
  }

  const { error: fimErr } = await supabase.rpc(
    'fn_boleto_solicitacao_concluir',
    { p_id: id, p_inter_pagamento_id: auditoriaId, p_erro: null }
  );
  // o Inter já aceitou: falha aqui só atrasa o registro (o fluxo de avisos reconcilia)
  if (fimErr) console.error('[boleto-solicitacao] concluir:', fimErr.message);
  return { data_pagamento: ini.data_pagamento ?? null };
}

// Boleto pago fora do sistema (outra conta): registra o pagamento e dá baixa.
export async function marcarBoletoPago(
  id: string,
  data: string
): Promise<void> {
  const { data: r, error } = await supabase.rpc('fn_boleto_marcar_pago', {
    p_id: id,
    p_data: data,
  });
  if (error) throw new Error(error.message);
  const res = r as { ok?: boolean; erro?: string } | null;
  if (!res?.ok)
    throw new Error(res?.erro || 'Não foi possível marcar como pago');
}

// Conta do Asaas que não foi agendada sozinha (erro, alerta grave): pede de novo e a edge
// cria o pagamento lá na hora. Quem libera o dinheiro é a Bruna, no app do Asaas.
export async function agendarBoletoNoAsaas(
  id: string,
  confirmado: boolean
): Promise<{ agendado: boolean; detalhe: string | null }> {
  const { data: r, error } = await supabase.rpc('fn_boleto_asaas_pedir', {
    p_id: id,
    p_confirmado: confirmado,
  });
  if (error) throw new Error(error.message);
  const res = r as { ok?: boolean; erro?: string } | null;
  if (!res?.ok)
    throw new Error(res?.erro || 'Não foi possível pedir o agendamento');

  const { data, error: fnErr } = await supabase.functions.invoke(
    'email-boletos',
    { body: { so_asaas: true } }
  );
  if (fnErr) throw new Error(fnErr.message);
  const detalhe =
    (data as { asaas?: Record<string, string> } | null)?.asaas?.[id] ?? null;
  return { agendado: !!detalhe?.startsWith('agendado'), detalhe };
}

export async function cancelarBoletoSolicitacao(id: string): Promise<void> {
  const { error } = await supabase.rpc('fn_boleto_solicitacao_cancelar', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
}
