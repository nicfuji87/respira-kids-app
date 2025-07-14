import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  getUserCompany,
  createCompany,
  updateCompany,
  removeCompanyAssociation,
  associateExistingCompany,
  validateAsaasToken,
  createCompanyInAsaas,
  listAllCompanies,
} from '@/lib/company-api';
import type {
  CompanyData,
  CreateCompanyData,
  UpdateCompanyData,
} from '@/types/company';

// AI dev note: Hook para gerenciamento de estado da empresa
// Seguindo padrão estabelecido no useAuth.ts

interface UseCompanyReturn {
  company: CompanyData | null;
  isLoading: boolean;
  error: string | null;
  loadCompany: () => Promise<void>;
  createNewCompany: (data: CreateCompanyData) => Promise<void>;
  updateExistingCompany: (data: UpdateCompanyData) => Promise<void>;
  removeAssociation: () => Promise<void>;
  associateCompany: (companyId: string) => Promise<void>;
  validateToken: (
    token: string
  ) => Promise<{ isValid: boolean; message?: string }>;
  createInAsaas: (
    token: string,
    data: CreateCompanyData
  ) => Promise<{ success: boolean; message: string; asaasId?: string }>;
  getAllCompanies: () => Promise<CompanyData[]>;
  clearError: () => void;
}

export const useCompany = (): UseCompanyReturn => {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadCompany = useCallback(async () => {
    if (!user) {
      setCompany(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const companyData = await getUserCompany(user);
      setCompany(companyData);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao carregar empresa';
      setError(message);
      console.error('Erro ao carregar empresa:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const createNewCompany = useCallback(
    async (data: CreateCompanyData) => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      try {
        setIsLoading(true);
        setError(null);
        const newCompany = await createCompany(user, data);
        setCompany(newCompany);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao criar empresa';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const updateExistingCompany = useCallback(
    async (data: UpdateCompanyData) => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      try {
        setIsLoading(true);
        setError(null);
        const updatedCompany = await updateCompany(user, data);
        setCompany(updatedCompany);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao atualizar empresa';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const removeAssociation = useCallback(async () => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setIsLoading(true);
      setError(null);
      await removeCompanyAssociation(user);
      setCompany(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao desassociar empresa';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const associateCompany = useCallback(
    async (companyId: string) => {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      try {
        setIsLoading(true);
        setError(null);
        await associateExistingCompany(user, companyId);
        // Recarregar dados da empresa após associação
        await loadCompany();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao associar empresa';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user, loadCompany]
  );

  const validateToken = useCallback(
    async (token: string): Promise<{ isValid: boolean; message?: string }> => {
      try {
        return await validateAsaasToken(token);
      } catch (err) {
        console.error('Erro ao validar token:', err);
        return { isValid: false, message: 'Erro inesperado na validação' };
      }
    },
    []
  );

  const createInAsaas = useCallback(
    async (
      token: string,
      data: CreateCompanyData
    ): Promise<{ success: boolean; message: string; asaasId?: string }> => {
      try {
        return await createCompanyInAsaas(token, data);
      } catch (err) {
        console.error('Erro ao criar empresa no Asaas:', err);
        return {
          success: false,
          message: 'Erro inesperado ao criar empresa no Asaas',
        };
      }
    },
    []
  );

  const getAllCompanies = useCallback(async (): Promise<CompanyData[]> => {
    try {
      setError(null);
      return await listAllCompanies();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao listar empresas';
      setError(message);
      throw err;
    }
  }, []);

  return {
    company,
    isLoading,
    error,
    loadCompany,
    createNewCompany,
    updateExistingCompany,
    removeAssociation,
    associateCompany,
    validateToken,
    createInAsaas,
    getAllCompanies,
    clearError,
  };
};
