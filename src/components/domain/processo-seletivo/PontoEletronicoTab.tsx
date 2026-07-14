// AI dev note: Aba "Ponto eletrônico" (padrão da seção Estagiários). Mostra o
// fluxo de bater ponto direto (acesso rápido para admin/secretaria, várias vezes
// ao dia) e um botão "Tela cheia" que abre o mesmo fluxo cobrindo a sidebar —
// modo quiosque para o tablet. Só um dos dois é montado por vez (evita duas
// instâncias da câmera).

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { useAuth } from '@/hooks/useAuth';
import { PontoRegistro } from './PontoRegistro';

export const PontoEletronicoTab: React.FC = () => {
  const { user } = useAuth();
  const registradoPor = user?.pessoa?.id ?? null;
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-bege-fundo to-background overflow-auto p-5">
        <PontoRegistro
          registradoPor={registradoPor}
          onClose={() => setFullscreen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 className="w-4 h-4" />
          Tela cheia (tablet)
        </Button>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <PontoRegistro registradoPor={registradoPor} />
        </CardContent>
      </Card>
    </div>
  );
};

PontoEletronicoTab.displayName = 'PontoEletronicoTab';
