// AI dev note: Tipos para sistema de mídias de sessão (fotos/vídeos) nos agendamentos
// Baseado na tabela midias_sessao do Supabase

export interface SessionMedia {
  id: string;
  id_agendamento: string;
  url_arquivo: string;
  tipo_midia: 'foto' | 'video' | 'audio';
  descricao?: string | null;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionMedia {
  id_agendamento: string;
  url_arquivo: string;
  tipo_midia: 'foto' | 'video' | 'audio';
  descricao?: string | null;
  criado_por?: string | null;
}

export interface UpdateSessionMedia {
  id: string;
  descricao?: string | null;
  atualizado_por?: string | null;
}

export interface MediaUploadResult {
  success: boolean;
  url?: string;
  error?: string;
  file?: File;
}

export interface MediaUploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
}

export interface SessionMediaWithPreview extends SessionMedia {
  previewUrl?: string;
  isLoading?: boolean;
}
