import { createClient } from '@supabase/supabase-js';

// AI dev note: Cliente Supabase configurado para autenticação e acesso ao banco
// Usa variáveis de ambiente para configuração segura

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Cliente principal para uso na aplicação
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// Tipos para melhor tipagem
export type Database = {
  public: {
    Tables: {
      pessoas: {
        Row: {
          id: string;
          auth_user_id: string | null;
          nome: string;
          email: string | null;
          telefone: string | null;
          cpf_cnpj: string | null;
          numero_endereco: string | null;
          is_approved: boolean;
          profile_complete: boolean;
          role: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          nome: string;
          email?: string | null;
          telefone?: string | null;
          cpf_cnpj?: string | null;
          numero_endereco?: string | null;
          is_approved?: boolean;
          profile_complete?: boolean;
          role?: string | null;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          nome?: string;
          email?: string | null;
          telefone?: string | null;
          cpf_cnpj?: string | null;
          numero_endereco?: string | null;
          is_approved?: boolean;
          profile_complete?: boolean;
          role?: string | null;
        };
      };
      pessoa_tipos: {
        Row: {
          id: string;
          codigo: string;
          nome: string;
          ativo: boolean;
        };
      };
    };
  };
};
