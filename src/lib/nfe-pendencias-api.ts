import { supabase } from './supabase';

// AI dev note: API do painel "Notas pendentes" (FinancialNfePendencias).
// A classificação do motivo mora na view vw_nfe_pendencias (security_invoker;
// RLS deixa admin/secretaria lerem faturas). Uma linha por fatura PAGA nos
// últimos 180 dias sem PDF de nota. O front só agrupa e mostra a dica; não
// reclassifica nada aqui, para o painel e o banco nunca divergirem.

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type MotivoNfePendencia =
  | 'sem_nota_decisao'
  | 'autorizada_sem_link'
  | 'rps'
  | 'ibs_cbs'
  | 'e0014_portal'
  | 'email'
  | 'endereco'
  | 'telefone'
  | 'documento'
  | 'cancelamento_anterior'
  | 'ja_agendada'
  | 'em_processamento'
  | 'nunca_pedida'
  | 'erro_sem_detalhe'
  | 'outro';

export interface NfePendencia {
  fatura_id: string;
  id_asaas: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  responsavel_cobranca_id: string | null;
  responsavel_nome: string | null;
  tomador_id: string | null;
  tomador_nome: string | null;
  valor_total: number | null;
  descricao: string | null;
  pago_em: string | null;
  dias_desde_pagamento: number | null;
  link_nfe: string | null;
  status_nfe: string | null;
  nfe_status_asaas: string | null;
  nfe_erro_asaas: string | null;
  nfe_verificado_em: string | null;
  nfe_dispensada: boolean | null;
  nfe_dispensada_motivo: string | null;
  // Vem como texto do banco; um motivo novo que o front ainda não conhece cai
  // no grupo "outro" (ver normalizarMotivo).
  motivo: string;
}

const CAMPOS_PENDENCIA =
  'fatura_id, id_asaas, empresa_id, empresa_nome, paciente_id, paciente_nome, ' +
  'responsavel_cobranca_id, responsavel_nome, tomador_id, tomador_nome, ' +
  'valor_total, descricao, pago_em, dias_desde_pagamento, link_nfe, status_nfe, ' +
  'nfe_status_asaas, nfe_erro_asaas, nfe_verificado_em, nfe_dispensada, ' +
  'nfe_dispensada_motivo, motivo';

const MOTIVOS_CONHECIDOS: ReadonlySet<string> = new Set<MotivoNfePendencia>([
  'sem_nota_decisao',
  'autorizada_sem_link',
  'rps',
  'ibs_cbs',
  'e0014_portal',
  'email',
  'endereco',
  'telefone',
  'documento',
  'cancelamento_anterior',
  'ja_agendada',
  'em_processamento',
  'nunca_pedida',
  'erro_sem_detalhe',
  'outro',
]);

export function normalizarMotivo(motivo: string | null): MotivoNfePendencia {
  return motivo && MOTIVOS_CONHECIDOS.has(motivo)
    ? (motivo as MotivoNfePendencia)
    : 'outro';
}

export async function fetchNfePendencias(): Promise<
  ApiResponse<NfePendencia[]>
> {
  try {
    const { data, error } = await supabase
      .from('vw_nfe_pendencias')
      .select(CAMPOS_PENDENCIA)
      .order('dias_desde_pagamento', { ascending: false });

    if (error) {
      console.error('Erro ao buscar notas pendentes:', error);
      return { success: false, error: error.message };
    }

    const rows = (data || []) as unknown as NfePendencia[];
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        valor_total: r.valor_total === null ? null : Number(r.valor_total),
      })),
    };
  } catch (err) {
    console.error('Erro ao buscar notas pendentes:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}

// Marca (dispensar=true) ou desfaz (false) "sem nota por decisão".
// O banco exige motivo ao marcar e só aceita admin/secretaria.
export async function dispensarNfeFatura(
  faturaId: string,
  dispensar: boolean,
  motivo: string | null
): Promise<ApiResponse<null>> {
  try {
    const { data, error } = await supabase.rpc('fn_fatura_nfe_dispensar', {
      p_fatura_id: faturaId,
      p_dispensar: dispensar,
      p_motivo: motivo,
    });

    if (error) {
      console.error('Erro ao atualizar sem nota por decisão:', error);
      return { success: false, error: error.message };
    }

    const resultado = data as { ok?: boolean; erro?: string } | null;
    if (resultado && resultado.ok === false) {
      return {
        success: false,
        error: resultado.erro || 'Não foi possível salvar',
      };
    }

    return { success: true, data: null };
  } catch (err) {
    console.error('Erro ao atualizar sem nota por decisão:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    };
  }
}
