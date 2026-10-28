import { supabase } from './supabase';
import type { SituacaoCobranca } from './cobranca-mensagens';

// AI dev note: API da tela /cobrancas — o canal MANUAL de cobrança pelo WhatsApp.
// Existe porque a API (não oficial) de WhatsApp usada pelo n8n cai, e com ela o
// disparo automático. Aqui a secretária faz o envio pelo WhatsApp Web dela.
//
// O envio em si NÃO passa por este código: montamos a URL, o browser abre a
// conversa com o texto pronto e ela aperta enter. O que registramos é o clique.

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CobrancaPendente {
  origem: 'pre_cobranca' | 'fatura';
  cobranca_id: string;
  pagamento_link_id: string | null;
  fatura_id: string | null;
  token: string | null;
  id_asaas: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  responsavel_cobranca_id: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: number | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  profissional_ids: string[];
  profissionais: string[];
  descricao: string | null;
  valor: number | null;
  vencimento: string | null;
  dias_atraso: number | null;
  situacao: SituacaoCobranca;
  link_pagamento: string | null;
  link_expirado: boolean;
  lembretes_enviados: number;
  ultimo_lembrete_em: string | null;
  criado_em: string | null;
  envios_manuais: number;
  ultimo_envio_manual_em: string | null;
  ultimo_envio_manual_por: string | null;
  // Só existem para alimentar a busca da tela (igual à de Pacientes: nome,
  // e-mail, telefone ou CPF). Não são exibidos no card.
  paciente_cpf: string | null;
  responsavel_cpf: string | null;
  responsavel_email: string | null;
  // Pausa para conferência (cobranca_suspensoes). Em conferência = não cobra.
  em_analise: boolean;
  suspensao_id: string | null;
  suspensao_status: 'ativa' | 'escalada' | null;
  suspensao_motivo: MotivoSuspensao | null;
  suspensao_origem: 'ju' | 'equipe' | 'sistema' | null;
  suspensao_prazo: string | null;
}

const CAMPOS_COBRANCA =
  'origem, cobranca_id, pagamento_link_id, fatura_id, token, id_asaas, ' +
  'paciente_id, paciente_nome, responsavel_cobranca_id, responsavel_nome, ' +
  'responsavel_telefone, empresa_id, empresa_nome, profissional_ids, profissionais, ' +
  'descricao, valor, vencimento, dias_atraso, situacao, ' +
  'link_pagamento, link_expirado, lembretes_enviados, ultimo_lembrete_em, ' +
  'criado_em, envios_manuais, ultimo_envio_manual_em, ultimo_envio_manual_por, ' +
  'paciente_cpf, responsavel_cpf, responsavel_email, ' +
  'em_analise, suspensao_id, suspensao_status, suspensao_motivo, suspensao_origem, suspensao_prazo';

// =====================================================================
// Pausa de cobrança (conferência pelo Financeiro)
// =====================================================================
// AI dev note: pausar só congela os lembretes automáticos; quem decide é o
// Financeiro. O banco (fn_cobranca_pode_lembrar) é o porteiro de toda régua:
// régua de pré-cobrança, n8n "Asaas Inadimplencia 3" e a Ju. Encerrar a pausa
// só um admin logado consegue (fn_cobranca_encerrar_suspensao recusa o resto).

export type MotivoSuspensao =
  | 'pagamento_informado'
  | 'pagamento_fora_asaas'
  | 'contestacao'
  | 'duplicidade'
  | 'teto_lembretes'
  | 'outro';

export type ResultadoSuspensao =
  | 'pagamento_confirmado'
  | 'divida_confirmada'
  | 'cobranca_cancelada';

export const MOTIVO_SUSPENSAO_LABEL: Record<MotivoSuspensao, string> = {
  pagamento_informado: 'Família diz que pagou',
  pagamento_fora_asaas: 'Pagou fora do link (Pix, dinheiro)',
  contestacao: 'Família contesta a cobrança',
  duplicidade: 'Cobrança em duplicidade',
  teto_lembretes: 'Limite de lembretes atingido',
  outro: 'Outro motivo',
};

export const RESULTADO_SUSPENSAO_LABEL: Record<ResultadoSuspensao, string> = {
  pagamento_confirmado: 'Pagamento confirmado',
  divida_confirmada: 'Dívida confirmada: retomar lembretes',
  cobranca_cancelada: 'Cobrança cancelada',
};

export interface SuspensaoCobranca {
  id: string;
  status: 'ativa' | 'escalada' | 'encerrada';
  motivo: MotivoSuspensao;
  detalhe: string | null;
  origem: 'ju' | 'equipe' | 'sistema';
  resultado: ResultadoSuspensao | null;
  criado_em: string;
  criado_por_nome: string | null;
  prazo_verificacao: string;
  prazo_vencido: boolean;
  encerrada_em: string | null;
  encerrada_por_nome: string | null;
  observacao_encerramento: string | null;
  fatura_id: string | null;
  pagamento_link_id: string | null;
  origem_cobranca: 'fatura' | 'pre_cobranca';
  valor: number | null;
  descricao: string | null;
  vencimento: string | null;
  status_cobranca: string | null;
  invoice_url: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: number | null;
  lembretes_bloqueados: number;
}

export async function fetchSuspensoesCobranca(): Promise<
  ApiResponse<SuspensaoCobranca[]>
> {
  const { data, error } = await supabase
    .from('vw_cobranca_suspensoes')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('❌ Erro ao carregar pausas de cobrança:', error);
    return { success: false, error: error.message };
  }
  return { success: true, data: (data || []) as SuspensaoCobranca[] };
}

export async function pausarCobranca(
  cobranca: Pick<CobrancaPendente, 'fatura_id' | 'pagamento_link_id'>,
  motivo: MotivoSuspensao,
  detalhe: string
): Promise<ApiResponse<{ suspensao_id: string; prazo: string }>> {
  const { data, error } = await supabase.rpc('fn_cobranca_suspender', {
    p_fatura_id: cobranca.fatura_id,
    p_pagamento_link_id: cobranca.fatura_id ? null : cobranca.pagamento_link_id,
    p_motivo: motivo,
    p_detalhe: detalhe.trim() || null,
    p_origem: 'equipe',
  });
  if (error) {
    console.error('❌ Erro ao pausar cobrança:', error);
    return { success: false, error: error.message };
  }
  if (!data?.ok) {
    return {
      success: false,
      error:
        data?.motivo === 'COBRANCA_NAO_ESTA_EM_ABERTO'
          ? 'Essa cobrança não está mais em aberto.'
          : `Não foi possível pausar (${data?.motivo ?? 'sem motivo'}).`,
    };
  }
  return { success: true, data };
}

export async function encerrarSuspensaoCobranca(
  suspensaoId: string,
  resultado: ResultadoSuspensao,
  observacao: string
): Promise<ApiResponse<true>> {
  const { data, error } = await supabase.rpc('fn_cobranca_encerrar_suspensao', {
    p_suspensao_id: suspensaoId,
    p_resultado: resultado,
    p_observacao: observacao.trim() || null,
  });
  if (error) {
    console.error('❌ Erro ao encerrar pausa:', error);
    return { success: false, error: error.message };
  }
  if (!data?.ok) {
    return { success: false, error: 'Essa pausa já foi encerrada.' };
  }
  return { success: true, data: true };
}

export async function fetchCobrancasPendentes(): Promise<
  ApiResponse<CobrancaPendente[]>
> {
  try {
    const { data, error } = await supabase
      .from('vw_cobrancas_pendentes')
      .select(CAMPOS_COBRANCA)
      .order('dias_atraso', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('❌ Erro ao carregar cobranças pendentes:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []) as unknown as CobrancaPendente[],
    };
  } catch (e) {
    console.error('❌ Erro inesperado ao carregar cobranças:', e);
    return { success: false, error: 'Erro inesperado ao carregar cobranças' };
  }
}

// AI dev note: Normaliza o telefone para o formato que o WhatsApp aceita na URL.
// `pessoas.telefone` é bigint já no padrão JID (dígitos com DDI 55, sem +, sem
// máscara), então na prática só falta virar string — o guard do 55 é defensivo
// para cadastros antigos.
const normalizarTelefone = (
  telefone: number | string | null
): string | null => {
  if (telefone === null || telefone === undefined) return null;
  const digitos = String(telefone).replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
};

const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
};

// AI dev note: No desktop usamos web.whatsapp.com/send em vez de wa.me. O wa.me
// passa por uma página intermediária ("Continue to Chat") e tenta abrir o app
// nativo — dois cliques a mais para a secretária. O /send cai direto na conversa
// com o texto na caixa. No tablet/celular o wa.me é o caminho certo.
export function buildWhatsAppUrl(
  telefone: number | string | null,
  mensagem: string
): string | null {
  const numero = normalizarTelefone(telefone);
  if (!numero) return null;

  const texto = encodeURIComponent(mensagem);
  return isMobileDevice()
    ? `https://wa.me/${numero}?text=${texto}`
    : `https://web.whatsapp.com/send?phone=${numero}&text=${texto}`;
}

// AI dev note: Grava o clique em cobranca_disparo_log via RPC (canal
// 'whatsapp_manual', status 'aberto'). A RPC é SECURITY DEFINER só para carimbar
// quem clicou; a permissão é checada lá dentro.
export async function registrarDisparoManual(
  cobranca: CobrancaPendente
): Promise<ApiResponse<string>> {
  try {
    const { data, error } = await supabase.rpc('fn_registrar_disparo_manual', {
      p_pagamento_link_id: cobranca.pagamento_link_id,
      p_fatura_id: cobranca.fatura_id,
      p_telefone: cobranca.responsavel_telefone
        ? String(cobranca.responsavel_telefone)
        : null,
      p_situacao: cobranca.situacao,
    });

    if (error) {
      console.error('❌ Erro ao registrar disparo manual:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as string };
  } catch (e) {
    console.error('❌ Erro inesperado ao registrar disparo:', e);
    return { success: false, error: 'Erro inesperado ao registrar o envio' };
  }
}

export interface StatusAsaasResult {
  statusAnterior: string;
  status: string;
  mudou: boolean;
  atualizado: boolean;
  requerAjusteManual: boolean;
  asaasStatus?: string | null;
}

// AI dev note: Confere no Asaas se a cobrança já foi paga ANTES de abrir o
// WhatsApp. É a proteção contra o pior erro desta tela — cobrar quem já pagou.
// O webhook de pagamento já falhou em silêncio antes (41 faturas pagas ficaram
// como pendentes), então não dá para confiar só no status local.
//
// A edge function resolve o token do Asaas no servidor: a secretária nunca
// carrega `pessoa_empresas.api_token_externo` no browser.
export async function conferirStatusAsaas(
  faturaId: string
): Promise<ApiResponse<StatusAsaasResult>> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'cobranca-status-check',
      { body: { faturaId } }
    );

    if (error) {
      console.error('❌ Erro ao chamar cobranca-status-check:', error);
      return { success: false, error: 'Não foi possível consultar o Asaas' };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Erro ao consultar a cobrança no Asaas',
      };
    }

    return { success: true, data: data as StatusAsaasResult };
  } catch (e) {
    console.error('❌ Erro inesperado ao conferir status no Asaas:', e);
    return { success: false, error: 'Erro inesperado ao consultar o Asaas' };
  }
}
