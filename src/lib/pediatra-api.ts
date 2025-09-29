// AI dev note: API para gerenciamento de pediatras - FASE 3.1 do plano aprovado
import { supabase } from './supabase';

export interface Pediatra {
  id: string;
  pessoa_id: string;
  nome: string; // da tabela pessoas
  crm?: string;
  especialidade: string;
  observacoes?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Dados da pessoa
  email?: string;
  telefone?: number;
  cpf_cnpj?: string;
}

export interface CreatePediatraInput {
  pessoa_id: string;
  crm?: string;
  especialidade?: string;
  observacoes?: string;
}

export interface UpdatePediatraInput {
  id: string;
  crm?: string;
  especialidade?: string;
  observacoes?: string;
  ativo?: boolean;
}

export interface PacientePediatra {
  id: string;
  paciente_id: string;
  pediatra_id: string;
  data_inicio: string;
  data_fim?: string;
  observacoes?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Dados do pediatra
  pediatra: {
    id: string;
    nome: string;
    crm?: string;
    especialidade: string;
  };
}

export interface CreatePacientePediatraInput {
  paciente_id: string;
  pediatra_id: string;
  observacoes?: string;
}

// AI dev note: Buscar todos os pediatras ativos
export const fetchPediatras = async (): Promise<Pediatra[]> => {
  const { data, error } = await supabase
    .from('pessoa_pediatra')
    .select(
      `
      *,
      pessoa:pessoas(nome, email, telefone, cpf_cnpj)
    `
    )
    .eq('ativo', true)
    .order('pessoa.nome');

  if (error) {
    console.error('Erro ao buscar pediatras:', error);
    throw error;
  }

  return (
    data?.map((item) => ({
      id: item.id,
      pessoa_id: item.pessoa_id,
      nome: item.pessoa?.nome || '',
      crm: item.crm,
      especialidade: item.especialidade,
      observacoes: item.observacoes,
      ativo: item.ativo,
      created_at: item.created_at,
      updated_at: item.updated_at,
      email: item.pessoa?.email,
      telefone: item.pessoa?.telefone,
      cpf_cnpj: item.pessoa?.cpf_cnpj,
    })) || []
  );
};

// AI dev note: Criar novo pediatra
export const createPediatra = async (
  input: CreatePediatraInput
): Promise<Pediatra> => {
  const { data, error } = await supabase
    .from('pessoa_pediatra')
    .insert({
      pessoa_id: input.pessoa_id,
      crm: input.crm,
      especialidade: input.especialidade || 'Pediatria',
      observacoes: input.observacoes,
    })
    .select(
      `
      *,
      pessoa:pessoas(nome, email, telefone, cpf_cnpj)
    `
    )
    .single();

  if (error) {
    console.error('Erro ao criar pediatra:', error);
    throw error;
  }

  return {
    id: data.id,
    pessoa_id: data.pessoa_id,
    nome: data.pessoa?.nome || '',
    crm: data.crm,
    especialidade: data.especialidade,
    observacoes: data.observacoes,
    ativo: data.ativo,
    created_at: data.created_at,
    updated_at: data.updated_at,
    email: data.pessoa?.email,
    telefone: data.pessoa?.telefone,
    cpf_cnpj: data.pessoa?.cpf_cnpj,
  };
};

// AI dev note: Atualizar pediatra existente
export const updatePediatra = async (
  input: UpdatePediatraInput
): Promise<Pediatra> => {
  const { data, error } = await supabase
    .from('pessoa_pediatra')
    .update({
      crm: input.crm,
      especialidade: input.especialidade,
      observacoes: input.observacoes,
      ativo: input.ativo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .select(
      `
      *,
      pessoa:pessoas(nome, email, telefone, cpf_cnpj)
    `
    )
    .single();

  if (error) {
    console.error('Erro ao atualizar pediatra:', error);
    throw error;
  }

  return {
    id: data.id,
    pessoa_id: data.pessoa_id,
    nome: data.pessoa?.nome || '',
    crm: data.crm,
    especialidade: data.especialidade,
    observacoes: data.observacoes,
    ativo: data.ativo,
    created_at: data.created_at,
    updated_at: data.updated_at,
    email: data.pessoa?.email,
    telefone: data.pessoa?.telefone,
    cpf_cnpj: data.pessoa?.cpf_cnpj,
  };
};

// AI dev note: Buscar pediatras de um paciente específico
export const fetchPacientePediatras = async (
  pacienteId: string
): Promise<PacientePediatra[]> => {
  const { data, error } = await supabase
    .from('paciente_pediatra')
    .select(
      `
      *,
      pediatra:pessoa_pediatra(
        *,
        pessoa:pessoas(nome)
      )
    `
    )
    .eq('paciente_id', pacienteId)
    .eq('ativo', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar pediatras do paciente:', error);
    throw error;
  }

  return (
    data?.map((item) => ({
      id: item.id,
      paciente_id: item.paciente_id,
      pediatra_id: item.pediatra_id,
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
      observacoes: item.observacoes,
      ativo: item.ativo,
      created_at: item.created_at,
      updated_at: item.updated_at,
      pediatra: {
        id: item.pediatra?.id || '',
        nome: item.pediatra?.pessoa?.nome || '',
        crm: item.pediatra?.crm,
        especialidade: item.pediatra?.especialidade || '',
      },
    })) || []
  );
};

// AI dev note: Associar paciente a pediatra
export const createPacientePediatra = async (
  input: CreatePacientePediatraInput
): Promise<PacientePediatra> => {
  const { data, error } = await supabase
    .from('paciente_pediatra')
    .insert({
      paciente_id: input.paciente_id,
      pediatra_id: input.pediatra_id,
      observacoes: input.observacoes,
    })
    .select(
      `
      *,
      pediatra:pessoa_pediatra(
        *,
        pessoa:pessoas(nome)
      )
    `
    )
    .single();

  if (error) {
    console.error('Erro ao associar paciente ao pediatra:', error);
    throw error;
  }

  return {
    id: data.id,
    paciente_id: data.paciente_id,
    pediatra_id: data.pediatra_id,
    data_inicio: data.data_inicio,
    data_fim: data.data_fim,
    observacoes: data.observacoes,
    ativo: data.ativo,
    created_at: data.created_at,
    updated_at: data.updated_at,
    pediatra: {
      id: data.pediatra?.id || '',
      nome: data.pediatra?.pessoa?.nome || '',
      crm: data.pediatra?.crm,
      especialidade: data.pediatra?.especialidade || '',
    },
  };
};

// AI dev note: Remover associação paciente-pediatra (soft delete)
export const removePacientePediatra = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('paciente_pediatra')
    .update({
      ativo: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Erro ao remover associação paciente-pediatra:', error);
    throw error;
  }
};
