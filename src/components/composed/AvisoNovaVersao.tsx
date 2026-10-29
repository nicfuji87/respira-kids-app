// Aviso de versão nova do app. O app é uma página única: aberto no tablet
// desde antes de um deploy, continua rodando o código antigo até recarregar.
// A cada 5 minutos (e ao voltar para a aba) compara o arquivo principal que
// está rodando com o que o servidor entrega hoje. Não recarrega sozinho: a
// pessoa pode estar no meio de um registro.

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/primitives/button';

const PADRAO = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const INTERVALO_MS = 5 * 60 * 1000;

function scriptAtual(): string | null {
  const el = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/index-"]'
  );
  const m = el?.getAttribute('src')?.match(PADRAO);
  return m ? m[0] : null;
}

export const AvisoNovaVersao: React.FC = () => {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    const atual = scriptAtual();
    // Em desenvolvimento não há arquivo com hash: nada a comparar
    if (!atual) return;
    let parado = false;
    const verificar = async () => {
      if (parado || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const m = (await r.text()).match(PADRAO);
        if (m && m[0] !== atual) setNova(true);
      } catch {
        // sem internet: tenta de novo na próxima
      }
    };
    const id = window.setInterval(verificar, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void verificar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      parado = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  if (!nova) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[90] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl border bg-background p-3 shadow-lg flex items-center gap-3"
    >
      <p className="flex-1 text-sm">
        Há uma versão nova do app. Atualize quando terminar o que está fazendo.
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Atualizar
      </Button>
    </div>
  );
};
