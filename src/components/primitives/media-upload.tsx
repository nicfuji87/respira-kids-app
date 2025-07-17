import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, Play, Image as ImageIcon, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// AI dev note: MediaUpload primitive para upload múltiplo de mídias (fotos/vídeos)
// Componente base reutilizável com drag&drop, previews e validação

export interface MediaUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  maxSize?: number; // em bytes
  disabled?: boolean;
  className?: string;
  error?: string;
  showPreviews?: boolean;
  placeholder?: string;
}

interface MediaPreview {
  file: File;
  url: string;
  type: 'image' | 'video';
}

export const MediaUpload = React.memo<MediaUploadProps>(
  ({
    files,
    onFilesChange,
    accept = 'image/*,video/*',
    maxFiles = 10,
    maxSize = 50 * 1024 * 1024, // 50MB default
    disabled = false,
    className,
    error,
    showPreviews = true,
    placeholder = 'Clique para selecionar ou arraste arquivos aqui',
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [previews, setPreviews] = useState<MediaPreview[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Gerar previews quando files mudam
    React.useEffect(() => {
      // Cleanup previous previews
      setPreviews((prev) => {
        prev.forEach((preview) => URL.revokeObjectURL(preview.url));

        const newPreviews: MediaPreview[] = files.map((file) => {
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('image/') ? 'image' : 'video';
          return { file, url, type };
        });

        return newPreviews;
      });

      // Cleanup on unmount
      return () => {
        setPreviews((prev) => {
          prev.forEach((preview) => URL.revokeObjectURL(preview.url));
          return [];
        });
      };
    }, [files]);

    const validateFile = useCallback(
      (file: File): string | null => {
        if (maxSize && file.size > maxSize) {
          return `Arquivo muito grande. Máximo ${(maxSize / 1024 / 1024).toFixed(1)}MB`;
        }

        if (
          accept &&
          !accept.split(',').some((type) => {
            const cleanType = type.trim();
            if (cleanType.endsWith('/*')) {
              return file.type.startsWith(cleanType.slice(0, -1));
            }
            return file.type === cleanType;
          })
        ) {
          return 'Tipo de arquivo não permitido';
        }

        return null;
      },
      [maxSize, accept]
    );

    const handleFilesAdd = useCallback(
      (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles);
        const validFiles: File[] = [];
        let firstError = '';

        for (const file of fileArray) {
          const validationError = validateFile(file);
          if (validationError && !firstError) {
            firstError = validationError;
            break;
          }
          if (!validationError) {
            validFiles.push(file);
          }
        }

        if (firstError) {
          return; // Error será mostrado via prop error
        }

        const totalFiles = files.length + validFiles.length;
        if (totalFiles > maxFiles) {
          return; // Error será mostrado via prop error
        }

        const updatedFiles = [...files, ...validFiles];
        onFilesChange(updatedFiles);
      },
      [files, onFilesChange, validateFile, maxFiles]
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFiles = e.target.files;
      if (newFiles && newFiles.length > 0) {
        handleFilesAdd(newFiles);
      }
    };

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (disabled) return;

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
          handleFilesAdd(droppedFiles);
        }
      },
      [disabled, handleFilesAdd]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) {
          setIsDragging(true);
        }
      },
      [disabled]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    }, []);

    const handleClick = () => {
      if (!disabled) {
        fileInputRef.current?.click();
      }
    };

    const handleRemoveFile = (indexToRemove: number) => {
      const updatedFiles = files.filter((_, index) => index !== indexToRemove);
      onFilesChange(updatedFiles);
    };

    const hasFiles = files.length > 0;

    return (
      <div className={cn('space-y-4', className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
          aria-label="Selecionar arquivos de mídia"
        />

        {/* Área de Upload */}
        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative border-2 border-dashed rounded-lg transition-colors cursor-pointer min-h-[120px]',
            'hover:border-primary/50 focus-within:border-primary',
            'flex flex-col items-center justify-center p-6 text-center',
            isDragging && 'border-primary bg-primary/5',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-destructive',
            hasFiles
              ? 'border-muted-foreground/50'
              : 'border-muted-foreground/25'
          )}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-1">{placeholder}</p>
          <p className="text-xs text-muted-foreground">
            Fotos e vídeos até {(maxSize / 1024 / 1024).toFixed(1)}MB cada
          </p>
          <p className="text-xs text-muted-foreground">
            Máximo {maxFiles} arquivos ({files.length}/{maxFiles} selecionados)
          </p>
        </div>

        {/* Previews dos arquivos */}
        {showPreviews && hasFiles && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted border">
                  {preview.type === 'image' ? (
                    <img
                      src={preview.url}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full relative">
                      <video
                        src={preview.url}
                        className="w-full h-full object-cover"
                        muted
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="h-8 w-8 text-white" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Overlay com informações */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-between p-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1">
                      {preview.type === 'image' ? (
                        <ImageIcon className="h-3 w-3 text-white" />
                      ) : (
                        <Video className="h-3 w-3 text-white" />
                      )}
                    </div>
                    {!disabled && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-6 w-6 p-0 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        aria-label="Remover arquivo"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="text-xs text-white">
                    <p className="truncate" title={preview.file.name}>
                      {preview.file.name}
                    </p>
                    <p>{(preview.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mensagem de erro */}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

MediaUpload.displayName = 'MediaUpload';
