// AI dev note: API para receber pagamento manual de faturas via ASAAS
import { supabase } from '@/lib/supabase';
import {
  receivePaymentInCash,
  determineApiKeyFromEmpresa,
} from '@/lib/asaas-api';

export interface ReceivePaymentManualParams {
  faturaId: string;
  paymentDate?: string; // Opcional, se não informado usa hoje
  userId: string; // ID do usuário que está confirmando o pagamento
}

export interface ReceivePaymentManualResult {
  success: boolean;
  error?: string;
  data?: {
    faturaId: string;
    asaasPaymentId: string;
    valor: number;
    paymentDate: string;
  };
}

/**
 * Confirma recebimento manual de pagamento de uma fatura no ASAAS
 *
 * Fluxo:
 * 1. Busca dados da fatura no Supabase
 * 2. Valida se fatura está pendente
 * 3. Obtém API key da empresa de faturamento
 * 4. Confirma recebimento no ASAAS
 * 5. Atualiza status da fatura no Supabase para "pago"
 * 6. Atualiza status de pagamento dos agendamentos vinculados
 */
export async function receivePaymentManual(
  params: ReceivePaymentManualParams
): Promise<ReceivePaymentManualResult> {
  const { faturaId, paymentDate, userId } = params;

  console.log('🔄 Iniciando recebimento manual de pagamento:', {
    faturaId,
    paymentDate,
    userId,
  });

  try {
    // 1. Validar permissão do usuário (apenas admin e secretaria)
    const { data: userData, error: userError } = await supabase
      .from('pessoas')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('❌ Erro ao buscar usuário:', userError);
      return {
        success: false,
        error: 'Usuário não encontrado',
      };
    }

    if (userData.role !== 'admin' && userData.role !== 'secretaria') {
      console.error('❌ Usuário sem permissão:', userData.role);
      return {
        success: false,
        error:
          'Apenas administradores e secretarias podem confirmar recebimentos',
      };
    }

    console.log('✅ Usuário autorizado:', userData.role);

    // 2. Buscar dados da fatura
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select(
        `
        id,
        id_asaas,
        valor_total,
        status,
        empresa_id,
        responsavel_cobranca_id
      `
      )
      .eq('id', faturaId)
      .single();

    if (faturaError || !fatura) {
      console.error('❌ Erro ao buscar fatura:', faturaError);
      return {
        success: false,
        error: 'Fatura não encontrada',
      };
    }

    console.log('📋 Fatura encontrada:', {
      id: fatura.id,
      id_asaas: fatura.id_asaas,
      status: fatura.status,
      valor: fatura.valor_total,
    });

    // 3. Validar se fatura está pendente
    if (fatura.status === 'pago') {
      console.warn('⚠️ Fatura já foi paga');
      return {
        success: false,
        error: 'Esta fatura já foi marcada como paga',
      };
    }

    if (fatura.status === 'cancelado') {
      console.warn('⚠️ Fatura está cancelada');
      return {
        success: false,
        error: 'Não é possível receber pagamento de fatura cancelada',
      };
    }

    // 4. Validar se tem id_asaas
    if (!fatura.id_asaas) {
      console.error('❌ Fatura sem id_asaas');
      return {
        success: false,
        error:
          'Fatura não possui ID do ASAAS. Não é possível confirmar recebimento.',
      };
    }

    // 5. Obter API key da empresa de faturamento
    const apiConfig = await determineApiKeyFromEmpresa(fatura.empresa_id);
    if (!apiConfig) {
      console.error('❌ Erro ao obter API key da empresa');
      return {
        success: false,
        error: 'Empresa de faturamento não possui configuração válida do ASAAS',
      };
    }

    console.log('✅ API key da empresa obtida');

    // 6. Confirmar recebimento no ASAAS
    // Nota: Não enviamos paymentDate - a Edge Function usará a data do servidor
    console.log('💰 Confirmando recebimento no ASAAS...');
    const asaasResult = await receivePaymentInCash(
      fatura.id_asaas,
      Number(fatura.valor_total),
      undefined, // Deixar a Edge Function determinar a data
      apiConfig,
      false // Não notificar cliente
    );

    if (!asaasResult.success) {
      console.error('❌ Erro ao confirmar no ASAAS:', asaasResult.error);
      return {
        success: false,
        error: asaasResult.error || 'Erro ao confirmar recebimento no ASAAS',
      };
    }

    console.log('✅ Recebimento confirmado no ASAAS');

    // 8. Atualizar status da fatura no Supabase
    const { error: updateFaturaError } = await supabase
      .from('faturas')
      .update({
        status: 'pago',
        pago_em: new Date().toISOString(),
        atualizado_por: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', faturaId);

    if (updateFaturaError) {
      console.error(
        '❌ Erro ao atualizar status da fatura:',
        updateFaturaError
      );
      return {
        success: false,
        error:
          'Pagamento confirmado no ASAAS mas erro ao atualizar fatura no sistema',
      };
    }

    console.log('✅ Status da fatura atualizado para "pago"');

    // 9. Atualizar status de pagamento dos agendamentos vinculados
    // Buscar ID do status "pago"
    const { data: statusPago, error: statusError } = await supabase
      .from('pagamento_status')
      .select('id')
      .eq('codigo', 'pago')
      .single();

    if (!statusError && statusPago) {
      const { error: updateAgendamentosError } = await supabase
        .from('agendamentos')
        .update({
          status_pagamento_id: statusPago.id,
          atualizado_por: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('fatura_id', faturaId);

      if (updateAgendamentosError) {
        console.warn(
          '⚠️ Erro ao atualizar status dos agendamentos:',
          updateAgendamentosError
        );
        // Não falha a operação, apenas registra o warning
      } else {
        console.log('✅ Status dos agendamentos atualizado para "pago"');
      }
    }

    // 10. Retornar sucesso
    const hoje = new Date();
    const dataAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    const result: ReceivePaymentManualResult = {
      success: true,
      data: {
        faturaId: fatura.id,
        asaasPaymentId: fatura.id_asaas,
        valor: Number(fatura.valor_total),
        paymentDate: dataAtual,
      },
    };

    console.log('🎉 Recebimento manual concluído com sucesso:', result);
    return result;
  } catch (error) {
    console.error('❌ Erro inesperado ao processar recebimento manual:', error);
    return {
      success: false,
      error: 'Erro inesperado ao processar recebimento manual',
    };
  }
}
