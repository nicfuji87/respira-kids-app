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
  responsavelFinanceiro?: {
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    whatsappJid: string;
    endereco?: {
      cep: string;
      logradouro: string;
      bairro: string;
      cidade: string;
      estado: string;
      numero: string;
      complemento?: string;
    };
  };

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
  try {
    const { data: result, error } = await supabase.functions.invoke(
      'public-patient-registration',
      {
        body: {
          action: 'finalize_registration',
          data,
        },
      }
    );

    if (error) {
      console.error('❌ Erro ao finalizar cadastro:', error);
      return {
        success: false,
        error: error.message || 'Erro ao finalizar cadastro',
      };
    }

    return result as FinalizationResult;
  } catch (error) {
    console.error('❌ Erro na chamada da Edge Function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
