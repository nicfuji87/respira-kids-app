// AI dev note: Tipos para sistema de mídias de sessão (fotos/vídeos) nos agendamentos
// Baseado nas tabelas session_media + document_storage do Supabase

export interface SessionMedia {
  id: string;
  agendamento_id: string;
  document_storage_id: string;
  tipo_midia: 'foto' | 'video' | 'audio' | 'documento';
  momento_sessao?: 'pre_sessao' | 'durante_sessao' | 'pos_sessao' | null;
  descricao?: string | null;
  timestamp_captura?: string | null;
  duracao_segundos?: number | null;
  resolucao?: string | null;
  qualidade?: 'baixa' | 'media' | 'alta' | 'original' | null;
  visivel_paciente: boolean;
  usado_relatorio: boolean;
  observacoes_tecnicas?: string | null;
  ativo: boolean;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentStorage {
  id: string;
  nome_arquivo: string;
  nome_original: string;
  bucket_name: string;
  caminho_arquivo: string;
  url_publica?: string | null;
  tipo_documento: string;
  mime_type: string;
  tamanho_bytes: number;
  hash_arquivo?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionMediaWithDocument extends SessionMedia {
  document: DocumentStorage;
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

export interface SessionMediaWithPreview extends SessionMediaWithDocument {
  previewUrl?: string;
  isLoading?: boolean;
}

// Tipos para MediaGallery - Fase 4
export interface MediaGalleryProps {
  patientId: string;
  className?: string;
}

export interface SessionMediaGroup {
  agendamento_id: string;
  data_sessao: string;
  profissional_nome: string;
  tipo_servico: string;
  medias: SessionMediaWithDocument[];
}

export interface MediaViewerProps {
  media: SessionMediaWithDocument;
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  canDownload?: boolean;
  className?: string;
}

export interface MediaFilters {
  tipo_midia?: 'foto' | 'video' | 'audio' | 'documento' | 'all';
  momento_sessao?: 'pre_sessao' | 'durante_sessao' | 'pos_sessao' | 'all';
  data_inicio?: string;
  data_fim?: string;
}
