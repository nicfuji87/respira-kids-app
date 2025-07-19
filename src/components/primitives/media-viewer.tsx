import React, { useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileVideo,
  Headphones,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import type { MediaViewerProps } from '@/types/session-media';

// AI dev note: MediaViewer - Primitive para exibir mídia em modal
// Suporta foto/vídeo/áudio/documento com navegação prev/next e fallbacks

const MediaViewer = React.memo<MediaViewerProps>(
  ({
    media,
    isOpen,
    onClose,
    onNext,
    onPrevious,
    canDownload = false,
    className,
  }) => {
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);

    const handleImageError = useCallback(() => {
      setImageError(true);
    }, []);

    const handleVideoError = useCallback(() => {
      setVideoError(true);
    }, []);

    const handleDownload = useCallback(async () => {
      if (!canDownload || !media.document.url_publica) return;

      try {
        const link = document.createElement('a');
        link.href = media.document.url_publica;
        link.download = media.document.nome_original;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Erro ao baixar mídia:', err);
      }
    }, [canDownload, media.document]);

    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string): string => {
      return new Date(dateString).toLocaleString('pt-BR');
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
          return 'Durante sessão';
        case 'pos_sessao':
          return 'Pós-sessão';
        default:
          return 'Não informado';
      }
    };

    const renderMediaContent = () => {
      const { tipo_midia, document: doc } = media;

      if (!doc.url_publica) {
        return (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-2" />
            <p>Mídia não disponível</p>
          </div>
        );
      }

      switch (tipo_midia) {
        case 'foto':
          if (imageError) {
            return (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileImage className="h-12 w-12 mb-2" />
                <p>Erro ao carregar imagem</p>
              </div>
            );
          }
          return (
            <img
              src={doc.url_publica}
              alt={media.descricao || 'Imagem da sessão'}
              className="max-w-full max-h-[70vh] object-contain mx-auto"
              onError={handleImageError}
            />
          );

        case 'video':
          if (videoError) {
            return (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileVideo className="h-12 w-12 mb-2" />
                <p>Erro ao carregar vídeo</p>
              </div>
            );
          }
          return (
            <video
              src={doc.url_publica}
              controls
              className="max-w-full max-h-[70vh] mx-auto"
              onError={handleVideoError}
            >
              Seu navegador não suporta reprodução de vídeo.
            </video>
          );

        case 'audio':
          return (
            <div className="flex flex-col items-center justify-center p-8">
              <Headphones className="h-16 w-16 mb-4 text-muted-foreground" />
              <audio src={doc.url_publica} controls className="w-full max-w-md">
                Seu navegador não suporta reprodução de áudio.
              </audio>
            </div>
          );

        case 'documento':
          return (
            <div className="flex flex-col items-center justify-center p-8">
              <FileText className="h-16 w-16 mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">{doc.nome_original}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {formatFileSize(doc.tamanho_bytes)}
              </p>
              {canDownload && (
                <Button onClick={handleDownload} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Documento
                </Button>
              )}
            </div>
          );

        default:
          return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-2" />
              <p>Tipo de mídia não suportado</p>
            </div>
          );
      }
    };

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn(
            'max-w-4xl w-[95vw] max-h-[95vh] overflow-hidden',
            className
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>
                  {media.descricao || `${media.tipo_midia} da sessão`}
                </span>
                <Badge
                  className={cn(
                    'text-white',
                    getMomentoBadgeColor(media.momento_sessao)
                  )}
                >
                  {getMomentoLabel(media.momento_sessao)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {/* Navegação */}
                {(onPrevious || onNext) && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onPrevious}
                      disabled={!onPrevious}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onNext}
                      disabled={!onNext}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Download */}
                {canDownload && media.document.url_publica && (
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Conteúdo da mídia */}
          <div className="flex-1 overflow-auto">{renderMediaContent()}</div>

          {/* Metadados */}
          <div className="border-t pt-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Arquivo:</span>{' '}
                {media.document.nome_original}
              </div>
              <div>
                <span className="font-medium">Tamanho:</span>{' '}
                {formatFileSize(media.document.tamanho_bytes)}
              </div>
              <div>
                <span className="font-medium">Criado em:</span>{' '}
                {formatDate(media.created_at)}
              </div>
              {media.duracao_segundos && (
                <div>
                  <span className="font-medium">Duração:</span>{' '}
                  {media.duracao_segundos}s
                </div>
              )}
              {media.resolucao && (
                <div>
                  <span className="font-medium">Resolução:</span>{' '}
                  {media.resolucao}
                </div>
              )}
              {media.qualidade && (
                <div>
                  <span className="font-medium">Qualidade:</span>{' '}
                  {media.qualidade}
                </div>
              )}
            </div>

            {media.observacoes_tecnicas && (
              <div className="pt-2 border-t">
                <p className="text-sm">
                  <span className="font-medium">Observações:</span>{' '}
                  {media.observacoes_tecnicas}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

MediaViewer.displayName = 'MediaViewer';

export { MediaViewer };
export type { MediaViewerProps };
