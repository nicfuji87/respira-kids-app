// AI dev note: Miniatura de produto reutilizável (lista, carrinho). Placeholder com
// ícone quando não há foto. loading="lazy" para não pesar listas grandes.

import React from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ProdutoThumb: React.FC<{
  url: string | null;
  alt?: string;
  className?: string;
}> = ({ url, alt, className }) => (
  <div
    className={cn(
      'shrink-0 overflow-hidden rounded-lg border bg-muted flex items-center justify-center',
      'h-12 w-12',
      className
    )}
  >
    {url ? (
      <img
        src={url}
        alt={alt ?? ''}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    ) : (
      <ImageIcon className="h-1/2 w-1/2 text-muted-foreground/40" />
    )}
  </div>
);
