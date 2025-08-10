// AI dev note: Tipos para sistema de integrações - chaves de API e prompts de IA
// Seguindo padrões de segurança para não expor chaves no frontend

export interface ApiKey {
  id: string;
  service_name: 'openai' | 'asaas' | 'evolution';
  encrypted_key: string; // Nunca será exposta diretamente no frontend
  service_url?: string; // Para Evolution API
  instance_name?: string; // Para Evolution API
  label: string; // Label obrigatório para identificação
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface ApiKeyCreate {
  service_name: 'openai' | 'asaas' | 'evolution';
  encrypted_key: string;
  service_url?: string;
  instance_name?: string;
  label: string; // Label obrigatório
  is_active?: boolean;
}

export interface ApiKeyUpdate {
  encrypted_key?: string;
  service_url?: string;
  instance_name?: string;
  label?: string;
  is_active?: boolean;
}

// AI dev note: Configuração de serviços suportados
export interface ServiceConfig {
  name: string;
  label: string;
  description: string;
  fields: ServiceField[];
  icon?: string;
}

export interface ServiceField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  description?: string;
}

export interface AiPrompt {
  id: string;
  prompt_name: string;
  prompt_title: string;
  prompt_description?: string;
  prompt_content: string;
  openai_model: string; // Modelo OpenAI a ser usado (ex: gpt-3.5-turbo, gpt-4)
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface AiPromptCreate {
  prompt_name: string;
  prompt_title: string;
  prompt_description?: string;
  prompt_content: string;
  openai_model?: string; // Default será gpt-3.5-turbo
  is_active?: boolean;
}

export interface AiPromptUpdate {
  prompt_title?: string;
  prompt_description?: string;
  prompt_content?: string;
  openai_model?: string;
  is_active?: boolean;
}

// API Response types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedApiKeys {
  data: ApiKey[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedAiPrompts {
  data: AiPrompt[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// AI dev note: Configurações dos serviços suportados
export const SUPPORTED_SERVICES: Record<string, ServiceConfig> = {
  openai: {
    name: 'openai',
    label: 'OpenAI',
    description: 'Integração com API da OpenAI para processamento de IA',
    fields: [
      {
        name: 'api_key',
        label: 'Chave API',
        type: 'password',
        required: true,
        placeholder: 'sk-...',
        description: 'Chave de API da OpenAI',
      },
    ],
  },
  asaas: {
    name: 'asaas',
    label: 'Asaas',
    description: 'Integração com API do Asaas para pagamentos',
    fields: [
      {
        name: 'api_key',
        label: 'Chave API',
        type: 'password',
        required: true,
        placeholder: '$aact_...',
        description: 'Chave de API do Asaas',
      },
    ],
  },
  evolution: {
    name: 'evolution',
    label: 'Evolution API',
    description: 'Integração com Evolution API para WhatsApp',
    fields: [
      {
        name: 'service_url',
        label: 'URL do Serviço',
        type: 'url',
        required: true,
        placeholder: 'https://api.evolution.com',
        description: 'URL base da Evolution API',
      },
      {
        name: 'instance_name',
        label: 'Nome da Instância',
        type: 'text',
        required: true,
        placeholder: 'respira-kids',
        description: 'Nome da instância no Evolution',
      },
      {
        name: 'api_key',
        label: 'Chave API',
        type: 'password',
        required: true,
        placeholder: 'apikey_...',
        description: 'Chave de API do Evolution',
      },
    ],
  },
};
