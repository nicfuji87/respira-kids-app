import React, { useState } from 'react';
import { Camera, User, X } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/primitives/avatar';
import { FileUpload } from '@/components/primitives/file-upload';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';

// AI dev note: AvatarUpload combina Avatar + FileUpload para upload de foto de perfil
// Preview circular específico para avatars, reutilizável em diferentes contextos

export interface AvatarUploadProps {
  value?: File | string | null; // File object ou URL string
  onFileSelect: (file: File | null) => void;
  onRemove?: () => Promise<void>; // Callback para remoção do servidor
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string; // Texto para fallback (iniciais do nome)
  className?: string;
  error?: string;
  maxSize?: number;
}

const sizeConfig = {
  sm: {
    avatar: 'h-16 w-16',
    camera: 'h-4 w-4',
    button: 'h-5 w-5',
    text: 'text-xs',
  },
  md: {
    avatar: 'h-20 w-20',
    camera: 'h-5 w-5',
    button: 'h-6 w-6',
    text: 'text-sm',
  },
  lg: {
    avatar: 'h-24 w-24',
    camera: 'h-6 w-6',
    button: 'h-7 w-7',
    text: 'text-base',
  },
  xl: {
    avatar: 'h-32 w-32',
    camera: 'h-8 w-8',
    button: 'h-8 w-8',
    text: 'text-lg',
  },
};

export const AvatarUpload = React.memo<AvatarUploadProps>(
  ({
    value,
    onFileSelect,
    onRemove,
    disabled = false,
    size = 'lg',
    fallbackText,
    className,
    error,
    maxSize = 2 * 1024 * 1024, // 2MB
  }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    const config = sizeConfig[size];

    // Gerar preview quando value muda
    React.useEffect(() => {
      if (value instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(value);
      } else if (typeof value === 'string') {
        setPreview(value);
      } else {
        setPreview(null);
      }
    }, [value]);

    const handleFileSelect = (file: File | null) => {
      if (file) {
        setIsUploading(true);
        // Simular delay de upload para UX
        setTimeout(() => {
          setIsUploading(false);
          onFileSelect(file);
        }, 500);
      } else {
        onFileSelect(null);
      }
    };

    const handleRemove = async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Se há callback de remoção, usar ele (para remoção do servidor)
      if (onRemove) {
        try {
          await onRemove();
        } catch (error) {
          console.error('Erro ao remover avatar:', error);
          // Em caso de erro, não limpar o estado local
          return;
        }
      }

      // Limpar estado local
      onFileSelect(null);
    };

    // Extrair iniciais do fallbackText
    const getInitials = (text?: string): string => {
      if (!text) return '';
      return text
        .split(' ')
        .map((word) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    };

    const hasImage = preview || value;

    return (
      <div className={cn('flex flex-col items-center space-y-3', className)}>
        <div className="relative group">
          {/* Avatar com overlay de upload */}
          <div className="relative">
            <Avatar className={cn(config.avatar, 'ring-2 ring-border')}>
              {hasImage ? (
                <AvatarImage
                  src={
                    preview || (typeof value === 'string' ? value : undefined)
                  }
                  alt="Avatar"
                  className="object-cover"
                />
              ) : (
                <AvatarFallback className={cn('bg-muted', config.text)}>
                  {fallbackText ? (
                    getInitials(fallbackText)
                  ) : (
                    <User className={config.camera} />
                  )}
                </AvatarFallback>
              )}
            </Avatar>

            {/* Overlay de loading */}
            {isUploading && (
              <div
                className={cn(
                  'absolute inset-0 bg-black/50 rounded-full flex items-center justify-center',
                  config.avatar
                )}
              >
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Botão de câmera - sempre visível */}
            <div
              className={cn(
                'absolute bottom-0 right-0 rounded-full bg-primary text-primary-foreground shadow-lg',
                'flex items-center justify-center border-2 border-background',
                'transition-all duration-200',
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:scale-110 cursor-pointer',
                config.button
              )}
            >
              <Camera className={config.camera} />
            </div>

            {/* Botão de remover - só quando tem imagem */}
            {/* AI dev note: Botão sempre visível (z-20) quando há imagem, acima do FileUpload overlay (z-10) */}
            {hasImage && !disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={cn(
                  'absolute -top-1 -right-1 rounded-full p-0 z-20',
                  'opacity-100 transition-opacity hover:scale-110',
                  config.button
                )}
                onClick={handleRemove}
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* FileUpload invisível mas funcional */}
          <div className="absolute inset-0 z-10">
            <FileUpload
              onFileSelect={handleFileSelect}
              accept="image/*"
              maxSize={maxSize}
              disabled={disabled || isUploading}
              showPreview={false}
              value={value}
              className="w-full h-full opacity-0"
              placeholder=""
            />
          </div>
        </div>

        {/* Texto de instrução */}
        <div className="text-center space-y-1">
          <p className={cn('font-medium text-foreground', config.text)}>
            {hasImage ? 'Foto do perfil' : 'Adicionar foto'}
          </p>
          <p className="text-xs text-muted-foreground">
            {disabled ? 'Somente leitura' : 'Clique ou arraste uma imagem'}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG até {(maxSize / 1024 / 1024).toFixed(1)}MB
          </p>
        </div>

        {/* Mensagem de erro */}
        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

AvatarUpload.displayName = 'AvatarUpload';
