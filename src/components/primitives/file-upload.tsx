import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// AI dev note: FileUpload primitive para upload de arquivos com drag&drop
// Componente base reutilizável para qualquer tipo de arquivo

export interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSize?: number; // em bytes
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  showPreview?: boolean;
  value?: File | string | null; // File object ou URL string
  placeholder?: string;
  error?: string;
}

export const FileUpload = React.memo<FileUploadProps>(
  ({
    onFileSelect,
    accept = 'image/*',
    maxSize = 2 * 1024 * 1024, // 2MB default
    disabled = false,
    className,
    children,
    showPreview = true,
    value,
    placeholder = 'Clique para selecionar ou arraste um arquivo aqui',
    error,
  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Gerar preview quando value muda
    React.useEffect(() => {
      if (value instanceof File) {
        if (value.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => setPreview(e.target?.result as string);
          reader.readAsDataURL(value);
        } else {
          setPreview(null);
        }
      } else if (typeof value === 'string') {
        setPreview(value);
      } else {
        setPreview(null);
      }
    }, [value]);

    const validateFile = (file: File): string | null => {
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
    };

    const handleFileChange = useCallback(
      (file: File | null) => {
        if (!file) {
          onFileSelect(null);
          return;
        }

        const validationError = validateFile(file);
        if (validationError) {
          // Erro será mostrado via prop error
          return;
        }

        onFileSelect(file);
      },
      [onFileSelect, maxSize, accept]
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      handleFileChange(file);
    };

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (disabled) return;

        const file = e.dataTransfer.files[0];
        if (file) {
          handleFileChange(file);
        }
      },
      [disabled, handleFileChange]
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

    const handleRemove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileSelect(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    const hasFile =
      value instanceof File || (typeof value === 'string' && value);

    return (
      <div className={cn('relative', className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
          aria-label="Selecionar arquivo"
        />

        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative border-2 border-dashed rounded-lg transition-colors cursor-pointer',
            'hover:border-primary/50 focus-within:border-primary',
            isDragging && 'border-primary bg-primary/5',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-destructive',
            hasFile && 'border-solid border-border',
            !hasFile && 'border-muted-foreground/25'
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
          {/* Preview ou placeholder */}
          {showPreview && preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="Preview"
                className="w-full h-32 object-cover rounded-lg"
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 rounded-full"
                  onClick={handleRemove}
                  aria-label="Remover arquivo"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : hasFile && value instanceof File ? (
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileIcon className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{value.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(value.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  aria-label="Remover arquivo"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              {children || (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">
                    {placeholder}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {accept === 'image/*' ? 'PNG, JPG até' : 'Arquivos até'}{' '}
                    {(maxSize / 1024 / 1024).toFixed(1)}MB
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mensagem de erro */}
        {error && (
          <p className="text-sm text-destructive mt-1" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

FileUpload.displayName = 'FileUpload';
