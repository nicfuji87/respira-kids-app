// AI dev note: API para finalizar cadastro público de paciente
// Chama a Edge Function que cria todas as entidades no banco de dados

import { supabase } from './supabase';
import { type ExistingUserFullData } from '@/components/domain/patient/PatientRegistrationSteps';

export interface FinalizationData {
  whatsappJid?: string;
  phoneNumber?: string;
  existingPersonId?: string;
  existingUserData?: ExistingUserFullData;

  responsavelLegal?: {
    nome: string;
    cpf: string;
    email: string;
  };

  endereco: {
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    estado: string;
    numero: string;
    complemento?: string;
  };

  responsavelFinanceiroMesmoQueLegal: boolean;
  responsavelFinanceiroExistingId?: string; // ID de pessoa existente buscada por CPF

  paciente: {
    nome: string;
    dataNascimento: string;
    sexo: 'M' | 'F';
    cpf?: string;
  };

  pediatra: {
    id?: string;
    nome: string;
    crm?: string;
  };

  autorizacoes: {
    usoCientifico: boolean;
    usoRedesSociais: boolean;
    usoNome: boolean;
  };

  contratoId: string;
}

export interface FinalizationResult {
  success: boolean;
  pacienteId?: string;
  responsavelLegalId?: string;
  responsavelFinanceiroId?: string;
  contratoId?: string;
  message?: string;
  error?: string;
}

/**
 * Finaliza o cadastro público do paciente
 * Chama a Edge Function que cria todas as entidades no banco
 */
export async function finalizePatientRegistration(
  data: FinalizationData
): Promise<FinalizationResult> {
  console.log('🚀 [FRONTEND] Iniciando finalização de cadastro...');
  console.log('📋 [FRONTEND] Resumo dos dados:', {
    hasExistingUser: !!data.existingPersonId,
    phoneNumber: data.phoneNumber,
    responsavelLegalNome: data.responsavelLegal?.nome || 'Usuário existente',
    responsavelFinanceiroMesmoQueLegal: data.responsavelFinanceiroMesmoQueLegal,
    responsavelFinanceiroExistingId:
      data.responsavelFinanceiroExistingId || 'Mesmo que legal',
    pacienteNome: data.paciente.nome,
    pacienteSexo: data.paciente.sexo,
    pacienteCpf: data.paciente.cpf || 'Não fornecido',
    pediatraId: data.pediatra.id || 'Novo pediatra',
    pediatraNome: data.pediatra.nome,
    pediatraCrm: data.pediatra.crm || 'Não fornecido',
    contratoId: data.contratoId,
    enderecoCep: data.endereco.cep,
    autorizacoes: data.autorizacoes,
  });

  try {
    console.log('📤 [FRONTEND] Enviando dados para Edge Function...');
    const startTime = Date.now();

    const { data: result, error } = await supabase.functions.invoke(
      'public-patient-registration',
      {
        body: {
          action: 'finalize_registration',
          data,
        },
      }
    );

    const duration = Date.now() - startTime;
    console.log(`⏱️ [FRONTEND] Edge Function respondeu em ${duration}ms`);

    if (error) {
      console.error('❌ [FRONTEND] Erro retornado pela Edge Function:', error);
      console.error('❌ [FRONTEND] Detalhes do erro:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return {
        success: false,
        error: error.message || 'Erro ao finalizar cadastro',
      };
    }

    if (!result) {
      console.error('❌ [FRONTEND] Edge Function não retornou dados');
      return {
        success: false,
        error: 'Resposta vazia da Edge Function',
      };
    }

    console.log('✅ [FRONTEND] Cadastro finalizado com sucesso!');
    console.log('📋 [FRONTEND] IDs retornados:', {
      pacienteId: result.pacienteId,
      responsavelLegalId: result.responsavelLegalId,
      responsavelFinanceiroId: result.responsavelFinanceiroId,
      contratoId: result.contratoId,
    });

    return result as FinalizationResult;
  } catch (error) {
    console.error('❌ [FRONTEND] Erro na chamada da Edge Function:', error);
    console.error(
      '❌ [FRONTEND] Stack trace:',
      error instanceof Error ? error.stack : 'N/A'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
