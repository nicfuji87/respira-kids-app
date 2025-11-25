import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { MediaUpload } from '@/components/primitives/media-upload';
import { MediaViewer } from '@/components/primitives/media-viewer';
import {
  Upload,
  Loader2,
  Trash2,
  ImageIcon,
  Film,
  FileText,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  uploadSessionMedia,
  deleteSessionMedia,
  canDownloadMedia,
} from '@/lib/session-media-api';
import { useSessionMediaBySession } from '@/hooks/useSessionMedia';
import { cn } from '@/lib/utils';
import type { SessionMediaWithDocument } from '@/types/session-media';

// AI dev note: SessionMediaManager - Gerenciador de mídias de sessão
// Upload de fotos/vídeos para agendamentos com registro em session_media + document_storage

export interface SessionMediaManagerProps {
  agendamentoId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  criadoPor?: string;
  disabled?: boolean;
  onMediaChange?: () => void;
  className?: string;
}

type MomentoSessao = 'pre_sessao' | 'durante_sessao' | 'pos_sessao';
type TipoMidia = 'foto' | 'video' | 'audio' | 'documento';

export const SessionMediaManager: React.FC<SessionMediaManagerProps> = ({
  agendamentoId,
  userRole,
  criadoPor,
  disabled = false,
  onMediaChange,
  className,
}) => {
  const { medias, isLoading, error, refetch } =
    useSessionMediaBySession(agendamentoId);

  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [momentoSessao, setMomentoSessao] =
    useState<MomentoSessao>('durante_sessao');
  const [descricao, setDescricao] = useState('');
  const [selectedMedia, setSelectedMedia] =
    useState<SessionMediaWithDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManageMedia =
    userRole === 'admin' ||
    userRole === 'profissional' ||
    userRole === 'secretaria';

  const handleFilesChange = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setUploadError(null);
    setUploadSuccess(false);
  }, []);

  const getTipoMidia = (file: File): TipoMidia => {
    if (file.type.startsWith('image/')) return 'foto';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'documento';
  };

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    let successCount = 0;
    let errorCount = 0;
    let lastError = '';

    for (const file of files) {
      const result = await uploadSessionMedia({
        file,
        agendamentoId,
        tipoMidia: getTipoMidia(file),
        momentoSessao,
        descricao: descricao || undefined,
        criadoPor,
      });

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        lastError = result.error || 'Erro desconhecido';
      }
    }

    setIsUploading(false);

    if (errorCount > 0) {
      setUploadError(`${errorCount} arquivo(s) com erro. ${lastError}`);
    }

    if (successCount > 0) {
      setUploadSuccess(true);
      setFiles([]);
      setDescricao('');
      refetch();
      onMediaChange?.();
    }
  }, [
    files,
    agendamentoId,
    momentoSessao,
    descricao,
    criadoPor,
    refetch,
    onMediaChange,
  ]);

  const handleDelete = useCallback(
    async (mediaId: string) => {
      if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;

      setDeletingId(mediaId);
      const result = await deleteSessionMedia(mediaId);

      if (result.success) {
        refetch();
        onMediaChange?.();
      } else {
        alert(result.error || 'Erro ao excluir mídia');
      }

      setDeletingId(null);
    },
    [refetch, onMediaChange]
  );

  const getMediaIcon = (tipo: string) => {
    switch (tipo) {
      case 'foto':
        return ImageIcon;
      case 'video':
        return Film;
      default:
        return FileText;
    }
  };

  const getMomentoBadgeColor = (momento?: string | null) => {
    switch (momento) {
      case 'pre_sessao':
        return 'bg-blue-500';
      case 'durante_sessao':
        return 'bg-green-500';
      case 'pos_sessao':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getMomentoLabel = (momento?: string | null) => {
    switch (momento) {
      case 'pre_sessao':
        return 'Pré-sessão';
      case 'durante_sessao':
        return 'Durante';
      case 'pos_sessao':
        return 'Pós-sessão';
      default:
        return 'N/A';
    }
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Mídias da Sessão
          {medias.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {medias.length} mídia{medias.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI dev note: Área de upload - apenas para quem pode gerenciar */}
        {canManageMedia && !disabled && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <h4 className="font-medium text-sm">Adicionar Mídias</h4>

            <MediaUpload
              files={files}
              onFilesChange={handleFilesChange}
              accept="image/*,video/*"
              maxFiles={10}
              maxSize={50 * 1024 * 1024}
              disabled={isUploading}
              placeholder="Arraste fotos ou vídeos aqui"
            />

            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Momento da Sessão
                    </label>
                    <Select
                      value={momentoSessao}
                      onValueChange={(v) =>
                        setMomentoSessao(v as MomentoSessao)
                      }
                      disabled={isUploading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre_sessao">Pré-sessão</SelectItem>
                        <SelectItem value="durante_sessao">
                          Durante a sessão
                        </SelectItem>
                        <SelectItem value="pos_sessao">Pós-sessão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Descrição (opcional)
                    </label>
                    <input
                      type="text"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex: Evolução do tratamento"
                      disabled={isUploading}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={isUploading || files.length === 0}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Enviar {files.length} arquivo
                      {files.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Mídias enviadas com sucesso!
              </div>
            )}
          </div>
        )}

        {/* AI dev note: Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* AI dev note: Error state */}
        {error && (
          <div className="flex items-center justify-center py-8 text-destructive">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        {/* AI dev note: Grid de mídias existentes */}
        {!isLoading && !error && medias.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {medias.map((media) => {
              const IconComponent = getMediaIcon(media.tipo_midia);
              const isImage = media.tipo_midia === 'foto';
              const isDeleting = deletingId === media.id;

              return (
                <div
                  key={media.id}
                  className="relative group rounded-lg overflow-hidden border bg-muted"
                >
                  {/* Thumbnail ou ícone */}
                  <div
                    className="aspect-square cursor-pointer"
                    onClick={() => setSelectedMedia(media)}
                  >
                    {isImage && media.document?.url_publica ? (
                      <img
                        src={media.document.url_publica}
                        alt={media.descricao || 'Mídia'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <IconComponent className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Badge de momento */}
                  <div className="absolute top-2 left-2">
                    <Badge
                      className={cn(
                        'text-white text-xs',
                        getMomentoBadgeColor(media.momento_sessao)
                      )}
                    >
                      {getMomentoLabel(media.momento_sessao)}
                    </Badge>
                  </div>

                  {/* Botão de delete */}
                  {canManageMedia && !disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(media.id);
                      }}
                      disabled={isDeleting}
                      className={cn(
                        'absolute top-2 right-2 p-1.5 rounded-full',
                        'bg-black/60 text-white opacity-0 group-hover:opacity-100',
                        'transition-opacity hover:bg-red-600',
                        isDeleting && 'opacity-100'
                      )}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}

                  {/* Descrição */}
                  {media.descricao && (
                    <div className="p-2 text-xs text-muted-foreground truncate">
                      {media.descricao}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AI dev note: Empty state */}
        {!isLoading && !error && medias.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-3" />
            <p className="text-sm">Nenhuma mídia adicionada</p>
            {canManageMedia && !disabled && (
              <p className="text-xs mt-1">
                Use o formulário acima para adicionar fotos ou vídeos
              </p>
            )}
          </div>
        )}

        {/* AI dev note: Media Viewer Modal */}
        {selectedMedia && (
          <MediaViewer
            media={selectedMedia}
            isOpen={!!selectedMedia}
            onClose={() => setSelectedMedia(null)}
            canDownload={canDownloadMedia(userRole || undefined)}
          />
        )}
      </CardContent>
    </Card>
  );
};

SessionMediaManager.displayName = 'SessionMediaManager';
