import React, { useState, useCallback } from 'react';
import {
  Images,
  Filter,
  Calendar,
  Clock,
  FileImage,
  FileVideo,
  Headphones,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';

import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { MediaViewer } from '@/components/primitives/media-viewer';
import { useSessionMedia } from '@/hooks/useSessionMedia';
import { useAuth } from '@/hooks/useAuth';
import { canDownloadMedia } from '@/lib/session-media-api';
import { cn } from '@/lib/utils';
import type {
  MediaGalleryProps,
  SessionMediaWithDocument,
  MediaFilters,
} from '@/types/session-media';

// AI dev note: MediaGallery - Component Composed view-only para Fase 4
// Grid responsivo agrupado por sessão com filtros e modal preview
// Combina primitivos Card, Select, MediaViewer para galeria de mídias

export const MediaGallery = React.memo<MediaGalleryProps>(
  ({ patientId, className }) => {
    const { user } = useAuth();
    const {
      mediaGroups,
      totalCount,
      isLoading,
      error,
      applyFilters,
      currentFilters,
    } = useSessionMedia(patientId);

    const [selectedMedia, setSelectedMedia] =
      useState<SessionMediaWithDocument | null>(null);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [allMedias, setAllMedias] = useState<SessionMediaWithDocument[]>([]);

    // Flatten all medias for navigation
    React.useEffect(() => {
      const flattened = mediaGroups.flatMap((group) => group.medias);
      setAllMedias(flattened);
    }, [mediaGroups]);

    const getMediaIcon = (tipo: string) => {
      switch (tipo) {
        case 'foto':
          return FileImage;
        case 'video':
          return FileVideo;
        case 'audio':
          return Headphones;
        case 'documento':
          return FileText;
        default:
          return FileImage;
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
          return 'Pré';
        case 'durante_sessao':
          return 'Durante';
        case 'pos_sessao':
          return 'Pós';
        default:
          return 'N/A';
      }
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const handleMediaClick = useCallback(
      (media: SessionMediaWithDocument) => {
        const index = allMedias.findIndex((m) => m.id === media.id);
        setCurrentMediaIndex(index);
        setSelectedMedia(media);
      },
      [allMedias]
    );

    const handleNextMedia = useCallback(() => {
      const nextIndex = (currentMediaIndex + 1) % allMedias.length;
      setCurrentMediaIndex(nextIndex);
      setSelectedMedia(allMedias[nextIndex]);
    }, [currentMediaIndex, allMedias]);

    const handlePreviousMedia = useCallback(() => {
      const prevIndex =
        currentMediaIndex === 0 ? allMedias.length - 1 : currentMediaIndex - 1;
      setCurrentMediaIndex(prevIndex);
      setSelectedMedia(allMedias[prevIndex]);
    }, [currentMediaIndex, allMedias]);

    const handleCloseViewer = useCallback(() => {
      setSelectedMedia(null);
    }, []);

    const handleFilterChange = useCallback(
      (filters: Partial<MediaFilters>) => {
        applyFilters({ ...currentFilters, ...filters });
      },
      [currentFilters, applyFilters]
    );

    // Loading state
    if (isLoading) {
      return (
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <Card className={cn('w-full', className)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Images className="h-5 w-5" />
              Galeria de Mídias
              {totalCount > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {totalCount} mídia{totalCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={currentFilters.tipo_midia || 'all'}
                  onValueChange={(value) =>
                    handleFilterChange({
                      tipo_midia: value as MediaFilters['tipo_midia'],
                    })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="foto">Fotos</SelectItem>
                    <SelectItem value="video">Vídeos</SelectItem>
                    <SelectItem value="audio">Áudios</SelectItem>
                    <SelectItem value="documento">Documentos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={currentFilters.momento_sessao || 'all'}
                  onValueChange={(value) =>
                    handleFilterChange({
                      momento_sessao: value as MediaFilters['momento_sessao'],
                    })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Momento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pre_sessao">Pré-sessão</SelectItem>
                    <SelectItem value="durante_sessao">Durante</SelectItem>
                    <SelectItem value="pos_sessao">Pós-sessão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="flex items-center justify-center py-8 text-red-500">
                <AlertCircle className="h-6 w-6 mr-2" />
                <p>{error}</p>
              </div>
            )}

            {/* Empty State */}
            {!error && mediaGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Images className="h-12 w-12 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Nenhuma mídia encontrada
                </h3>
                <p className="text-sm">
                  {currentFilters.tipo_midia !== 'all' ||
                  currentFilters.momento_sessao !== 'all'
                    ? 'Tente ajustar os filtros para ver mais resultados.'
                    : 'Este paciente ainda não possui mídias de sessão.'}
                </p>
              </div>
            )}

            {/* Media Groups */}
            {mediaGroups.map((group) => (
              <div key={group.agendamento_id} className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {formatDate(group.data_sessao)}
                  </span>
                  <Badge variant="outline">{group.tipo_servico}</Badge>
                  <span className="text-sm text-muted-foreground">
                    com {group.profissional_nome}
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    {group.medias.length} mídia
                    {group.medias.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {group.medias.map((media) => {
                    const IconComponent = getMediaIcon(media.tipo_midia);
                    const isImage = media.tipo_midia === 'foto';

                    return (
                      <Card
                        key={media.id}
                        className="group cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                        onClick={() => handleMediaClick(media)}
                      >
                        <div className="aspect-square bg-muted relative">
                          {isImage && media.document.url_publica ? (
                            <img
                              src={media.document.url_publica}
                              alt={media.descricao || 'Mídia da sessão'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <IconComponent className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}

                          {/* Overlay com tipo */}
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
                        </div>

                        {media.descricao && (
                          <div className="p-2">
                            <p className="text-xs text-muted-foreground truncate">
                              {media.descricao}
                            </p>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Media Viewer Modal */}
        {selectedMedia && (
          <MediaViewer
            media={selectedMedia}
            isOpen={!!selectedMedia}
            onClose={handleCloseViewer}
            onNext={allMedias.length > 1 ? handleNextMedia : undefined}
            onPrevious={allMedias.length > 1 ? handlePreviousMedia : undefined}
            canDownload={canDownloadMedia(user?.role)}
          />
        )}
      </>
    );
  }
);

MediaGallery.displayName = 'MediaGallery';
