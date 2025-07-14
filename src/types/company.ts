// AI dev note: Tipos para gerenciamento de dados da empresa
// Seguindo padrão estabelecido em profile-api.ts

export interface CompanyData {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  inscricao_estadual: string | null;
  regime_tributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  api_token_externo: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCompanyData {
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj: string;
  inscricao_estadual?: string | null;
  regime_tributario?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  api_token_externo?: string | null;
}

export interface UpdateCompanyData {
  razao_social?: string;
  nome_fantasia?: string | null;
  cnpj?: string;
  inscricao_estadual?: string | null;
  regime_tributario?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  api_token_externo?: string | null;
  ativo?: boolean;
}

export interface CompanyFormData {
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  inscricao_estadual?: string;
  regime_tributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  api_token_externo?: string;
}

export type RegimeTributario =
  | 'simples_nacional'
  | 'lucro_presumido'
  | 'lucro_real';

export const REGIMES_TRIBUTARIOS: { value: RegimeTributario; label: string }[] =
  [
    { value: 'simples_nacional', label: 'Simples Nacional' },
    { value: 'lucro_presumido', label: 'Lucro Presumido' },
    { value: 'lucro_real', label: 'Lucro Real' },
  ];
