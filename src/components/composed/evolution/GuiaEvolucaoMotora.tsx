// "Como preencher" da evolução motora: passo a passo e o que cada opção quer
// dizer. Abre pelo botão no topo da evolução e sozinho na primeira evolução
// motora de cada aparelho. Texto em src/lib/evolucao-motora-guia.ts.

import React from 'react';
import { Lightbulb } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import {
  DICA_SECAO_MOTORA,
  GLOSSARIO_MOTORA,
  PASSOS_GUIA_MOTORA,
  marcarGuiaMotoraVisto,
} from '@/lib/evolucao-motora-guia';

export const GuiaEvolucaoMotora: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
}> = ({ open, onOpenChange }) => (
  <Dialog
    open={open}
    onOpenChange={(v) => {
      if (!v) marcarGuiaMotoraVisto();
      onOpenChange(v);
    }}
  >
    <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Como preencher a evolução motora</DialogTitle>
        <DialogDescription>
          Leva 2 a 3 minutos. Registre só o que aconteceu nesta sessão.
        </DialogDescription>
      </DialogHeader>

      <ol className="space-y-4">
        {PASSOS_GUIA_MOTORA.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {i + 1}
            </span>
            <div className="space-y-1">
              <p className="font-medium">{p.titulo}</p>
              <p className="text-sm text-muted-foreground">{p.texto}</p>
              {p.itens && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {p.itens.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold">O que cada opção quer dizer</h3>
        {GLOSSARIO_MOTORA.map((t) => (
          <div key={t.termo} className="space-y-1.5">
            <p className="text-sm font-medium">{t.termo}</p>
            <dl className="space-y-1 text-sm">
              {t.opcoes.map(([nome, desc]) => (
                <div key={nome}>
                  <dt className="inline font-medium">{nome}: </dt>
                  <dd className="inline text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
            {t.regra && (
              <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1">
                {t.regra}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            marcarGuiaMotoraVisto();
            onOpenChange(false);
          }}
        >
          Entendi
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

/** Dica curta no topo da seção (some se a seção não tiver dica) */
export const DicaSecaoMotora: React.FC<{ secaoId: string }> = ({ secaoId }) => {
  const dica = DICA_SECAO_MOTORA[secaoId];
  if (!dica) return null;
  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 flex gap-2 text-sm text-sky-900">
      <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <p>{dica}</p>
    </div>
  );
};
