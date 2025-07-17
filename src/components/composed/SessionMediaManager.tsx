import React, { useState } from 'react';
import {
  X,
  Play,
  Image as ImageIcon,
  Video,
  Edit3,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { MediaUpload } from '@/components/primitives/media-upload';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Progress } from '@/components/primitives/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { cn } from '@/lib/utils';
import { useSessionMedia } from '@/hooks/useSessionMedia';
import type { SessionMediaWithPreview } from '@/types/session-media';

// AI dev note: SessionMediaManager combina MediaUpload primitive com lógica Supabase
// Componente composed para gerenciar mídias de sessão com permissões e UI completa

export interface SessionMediaManagerProps {
  agendamentoId: string;
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  criadoPor?: string;
  disabled?: boolean;
  onMediaChange?: () => void;
  className?: string;
}

export const SessionMediaManager = React.memo<SessionMediaManagerProps>(
  ({
    agendamentoId,
    userRole,
    criadoPor,
    disabled = false,
    onMediaChange,
    className,
  }) => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [editingMedia, setEditingMedia] =
      useState<SessionMediaWithPreview | null>(null);
    const [editDescription, setEditDescription] = useState('');

    const {
      medias,
      isLoading,
      isUploading,
      uploadProgress,
      error,
      uploadFiles,
      deleteMedia,
      updateMediaDescription,
      clearError,
    } = useSessionMedia({
      agendamentoId,
      criadoPor,
      enabled: true,
    });

    // Permissões baseadas no role
    const canUpload =
      !disabled && (userRole === 'admin' || userRole === 'profissional');
    const canEdit =
      !disabled && (userRole === 'admin' || userRole === 'profissional');
    const canDelete =
      !disabled && (userRole === 'admin' || userRole === 'profissional');

    // Handle upload de arquivos
    const handleFilesChange = (files: File[]) => {
      setSelectedFiles(files);
    };

    const handleUpload = async () => {
      if (selectedFiles.length === 0 || !canUpload) return;

      try {
        await uploadFiles(selectedFiles);
        setSelectedFiles([]);
        onMediaChange?.();
      } catch (err) {
        console.error('Erro no upload:', err);
      }
    };

    // Handle edição de descrição
    const handleEditDescription = (media: SessionMediaWithPreview) => {
      setEditingMedia(media);
      setEditDescription(media.descricao || '');
    };

    const handleSaveDescription = async () => {
      if (!editingMedia) return;

      try {
        await updateMediaDescription(editingMedia.id, editDescription);
        setEditingMedia(null);
        setEditDescription('');
        onMediaChange?.();
      } catch (err) {
        console.error('Erro ao salvar descrição:', err);
      }
    };

    const handleCancelEdit = () => {
      setEditingMedia(null);
      setEditDescription('');
    };

    // Handle delete
    const handleDelete = async (mediaId: string) => {
      if (!canDelete) return;

      try {
        await deleteMedia(mediaId);
        onMediaChange?.();
      } catch (err) {
        console.error('Erro ao deletar:', err);
      }
    };

    return (
      <div className={cn('space-y-4', className)}>
        {/* Título da seção */}
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Fotos e Vídeos da Sessão
          </Label>
          {medias.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {medias.length} {medias.length === 1 ? 'arquivo' : 'arquivos'}
            </span>
          )}
        </div>

        {/* Área de Upload - apenas para admin/profissional */}
        {canUpload && (
          <div className="space-y-3">
            <MediaUpload
              files={selectedFiles}
              onFilesChange={handleFilesChange}
              accept="image/*,video/*"
              maxFiles={10}
              maxSize={50 * 1024 * 1024} // 50MB
              disabled={isUploading}
              error={error || undefined}
              placeholder="Adicione fotos e vídeos da sessão"
            />

            {selectedFiles.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={handleUpload} disabled={isUploading} size="sm">
                  {isUploading
                    ? 'Enviando...'
                    : `Enviar ${selectedFiles.length} arquivo(s)`}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Progress de Upload */}
        {uploadProgress.length > 0 && (
          <div className="space-y-2">
            {uploadProgress.map((progress, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="truncate">{progress.file.name}</span>
                  <span
                    className={cn(
                      progress.status === 'completed' && 'text-green-600',
                      progress.status === 'error' && 'text-red-600'
                    )}
                  >
                    {progress.status === 'completed'
                      ? 'Concluído'
                      : progress.status === 'error'
                        ? 'Erro'
                        : `${progress.progress}%`}
                  </span>
                </div>
                <Progress
                  value={
                    progress.status === 'completed' ? 100 : progress.progress
                  }
                  className="h-1"
                />
                {progress.error && (
                  <p className="text-xs text-destructive">{progress.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Mensagem de erro */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex justify-between items-center">
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearError}
                className="h-auto p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-sm text-muted-foreground text-center py-4">
            Carregando mídias...
          </div>
        )}

        {/* Lista de mídias existentes */}
        {!isLoading && medias.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {medias.map((media) => (
                <div key={media.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted border">
                    {media.tipo_midia === 'foto' ? (
                      <img
                        src={media.previewUrl}
                        alt={media.descricao || 'Mídia da sessão'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full relative">
                        <video
                          src={media.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    )}

                    {/* Loading overlay */}
                    {media.isLoading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Overlay com ações */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-between p-2">
                    {/* Tipo de mídia e ações */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1">
                        {media.tipo_midia === 'foto' ? (
                          <ImageIcon className="h-3 w-3 text-white" />
                        ) : (
                          <Video className="h-3 w-3 text-white" />
                        )}
                      </div>

                      {/* Botões de ação */}
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 rounded-full bg-black/50 hover:bg-black/70"
                            onClick={() => handleEditDescription(media)}
                            aria-label="Editar descrição"
                          >
                            <Edit3 className="h-3 w-3 text-white" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-6 w-6 p-0 rounded-full"
                            onClick={() => handleDelete(media.id)}
                            aria-label="Remover arquivo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Informações do arquivo */}
                    <div className="text-xs text-white space-y-1">
                      {media.descricao && (
                        <p className="font-medium">{media.descricao}</p>
                      )}
                      <p className="text-white/70">
                        {new Date(media.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estado vazio */}
        {!isLoading && medias.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {canUpload
                ? 'Nenhuma mídia adicionada ainda. Use a área acima para fazer upload.'
                : 'Nenhuma mídia foi adicionada para esta sessão.'}
            </p>
          </div>
        )}

        {/* Modal de edição de descrição */}
        <Dialog
          open={!!editingMedia}
          onOpenChange={(open) => !open && handleCancelEdit()}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Descrição</DialogTitle>
              <DialogDescription id="edit-description-dialog">
                Adicione ou edite a descrição desta mídia.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descreva o conteúdo da mídia..."
                  aria-describedby="edit-description-dialog"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancelar
              </Button>
              <Button onClick={handleSaveDescription}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

SessionMediaManager.displayName = 'SessionMediaManager';
