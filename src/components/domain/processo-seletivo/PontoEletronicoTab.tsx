// AI dev note: Aba "Ponto eletrônico" (padrão da seção Estagiários). Mostra o
// fluxo de bater ponto direto (acesso rápido) e um botão "Tela cheia" que abre o
// mesmo fluxo cobrindo a sidebar (modo quiosque no tablet) + Fullscreen API do
// navegador (esconde a barra de URL). Configs (geofence + PIN do quiosque) só
// aparecem para admin. Sair da tela cheia pode exigir o PIN do quiosque (lockdown).

import React, { useCallback, useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { useAuth } from '@/hooks/useAuth';
import { kioskHasPin } from '@/lib/estagio-pontos-api';
import { PontoRegistro } from './PontoRegistro';
import { GeofenceConfig } from './GeofenceConfig';
import { KioskPinConfig } from './KioskPinConfig';
import { KioskExitDialog } from './KioskExitDialog';

async function enterBrowserFullscreen() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen do navegador é best-effort (overlay CSS já cobre a sidebar).
  }
}

async function exitBrowserFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch {
    // ignore
  }
}

export const PontoEletronicoTab: React.FC = () => {
  const { user } = useAuth();
  const registradoPor = user?.pessoa?.id ?? null;
  const isAdmin = user?.pessoa?.role === 'admin';

  const [fullscreen, setFullscreen] = useState(false);
  const [kioskLocked, setKioskLocked] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const refreshLock = useCallback(() => {
    void kioskHasPin().then(setKioskLocked);
  }, []);

  useEffect(() => {
    refreshLock();
  }, [refreshLock]);

  const entrar = useCallback(async () => {
    setFullscreen(true);
    await enterBrowserFullscreen();
  }, []);

  const sairDeFato = useCallback(async () => {
    setExitOpen(false);
    setFullscreen(false);
    await exitBrowserFullscreen();
  }, []);

  const pedirSaida = useCallback(() => {
    if (kioskLocked) setExitOpen(true);
    else void sairDeFato();
  }, [kioskLocked, sairDeFato]);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-bege-fundo to-background overflow-auto p-5">
        <PontoRegistro registradoPor={registradoPor} onClose={pedirSaida} />
        <KioskExitDialog
          open={exitOpen}
          onOpenChange={setExitOpen}
          onSuccess={() => void sairDeFato()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isAdmin && <GeofenceConfig />}
      {isAdmin && <KioskPinConfig onChange={refreshLock} />}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void entrar()}
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
