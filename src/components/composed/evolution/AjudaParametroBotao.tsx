import React from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/primitives/popover';
import { AJUDA_MOTORA } from '@/lib/evolucao-motora-ajuda';

// "?" ao lado do nome do parâmetro. Abre com toque (o tablet não tem hover),
// e fecha tocando fora. O texto vem de AJUDA_MOTORA.
export const AjudaParametroBotao: React.FC<{ id: string }> = ({ id }) => {
  const ajuda = AJUDA_MOTORA[id];
  if (!ajuda) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`O que é e como medir: ${ajuda.titulo}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-32px)] max-h-[60vh] overflow-y-auto space-y-2 text-sm"
      >
        <p className="font-semibold">{ajuda.titulo}</p>
        <p className="text-muted-foreground">{ajuda.oQueE}</p>
        {ajuda.opcoes && (
          <dl className="space-y-1">
            {ajuda.opcoes.map(([nome, desc]) => (
              <div key={nome}>
                <dt className="inline font-medium">{nome}: </dt>
                <dd className="inline text-muted-foreground">{desc}</dd>
              </div>
            ))}
          </dl>
        )}
        {ajuda.comoMedir && (
          <div>
            <p className="font-medium">Como medir</p>
            <p className="text-muted-foreground">{ajuda.comoMedir}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

AjudaParametroBotao.displayName = 'AjudaParametroBotao';
