// AI dev note: API do contrato de estágio (Termo de Compromisso).
// Espelha o fluxo do contrato de paciente: front monta conteudo_final a partir do
// template, cria a linha em estagio_contratos e dispara send-estagio-contract-webhook
// (gera PDF + enfileira 'contrato_estagio_gerado' para o n8n → Assinafy).

import { supabase } from './supabase';
import {
  fillEstagioTemplate,
  type EstagioContratoVars,
} from './estagio-contrato-template';
import type { CandidaturaEstagioRow } from '@/types/processo-seletivo';

export interface EstagioContratoRow {
  id: string;
  candidatura_id: string;
  nome_contrato: string | null;
  status_contrato: 'rascunho' | 'gerado' | 'assinado';
  conteudo_final: string | null;
  variaveis_utilizadas: Record<string, unknown>;
  arquivo_url: string | null;
  link_contrato: string | null;
  data_geracao: string | null;
  data_assinatura: string | null;
  ativo: boolean;
  created_at: string;
}

const TABLE = 'estagio_contratos';

/** Monta o endereço completo do estagiário a partir da candidatura. */
export function buildEstagiarioEndereco(row: CandidaturaEstagioRow): string {
  const linha1 = [row.logradouro, row.numero].filter(Boolean).join(', ');
  const partes = [
    linha1,
    row.complemento,
    row.bairro,
    [row.cidade, row.uf].filter(Boolean).join('/'),
    row.cep ? `CEP ${row.cep}` : '',
  ].filter((p) => p && p.trim().length > 0);
  return partes.join(' - ');
}

/** Busca o contrato de estágio ativo mais recente de uma candidatura. */
export async function fetchEstagioContrato(
  candidaturaId: string
): Promise<EstagioContratoRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('candidatura_id', candidaturaId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[estagio-contratos] erro ao buscar:', error);
    throw error;
  }
  return (data as EstagioContratoRow | null) ?? null;
}

/**
 * Gera (ou regenera) o contrato de estágio e envia para assinatura.
 * 1) preenche o template -> conteudo_final
 * 2) cria a linha em estagio_contratos (status 'rascunho')
 * 3) dispara send-estagio-contract-webhook (gera PDF + enfileira webhook)
 */
export async function gerarEnviarEstagioContrato(params: {
  candidaturaId: string;
  vars: EstagioContratoVars;
  criadoPor?: string | null;
}): Promise<{ contratoId: string }> {
  const { candidaturaId, vars, criadoPor } = params;

  const conteudoFinal = fillEstagioTemplate(vars);
  const nomeContrato = `Termo de Estágio - ${vars.estagiarioNome}`;

  const { data: inserted, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      candidatura_id: candidaturaId,
      nome_contrato: nomeContrato,
      status_contrato: 'rascunho',
      conteudo_final: conteudoFinal,
      variaveis_utilizadas: vars,
      criado_por: criadoPor ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[estagio-contratos] erro ao criar:', insertError);
    throw insertError ?? new Error('Falha ao criar contrato de estágio');
  }

  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'send-estagio-contract-webhook',
    { body: { contractId: inserted.id } }
  );

  if (fnError) {
    console.error('[estagio-contratos] erro no envio:', fnError);
    throw fnError;
  }
  if (fnData && fnData.success === false) {
    throw new Error(fnData.error || 'Falha ao enviar contrato para assinatura');
  }

  return { contratoId: inserted.id };
}

/** Reenvia um contrato já existente (não assinado) para assinatura. */
export async function reenviarEstagioContrato(
  contratoId: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    'send-estagio-contract-webhook',
    { body: { contractId: contratoId, reenvio: true } }
  );
  if (error) throw error;
  if (data && data.success === false) {
    throw new Error(data.error || 'Falha ao reenviar contrato');
  }
}
