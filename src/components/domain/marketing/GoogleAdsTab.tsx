// AI dev note: Marketing → Google Ads (admin). Decide onde mexer na mídia paga.
// Em cima: retorno por campanha (RetornoTab, base única do P0), com a busca pela
// Marca FORA do total por padrão (quem procura "Respira Kids" já conhecia a clínica).
// Clicar numa campanha abre o detalhe dela: funil do anúncio, grupos e palavras-chave
// e termos pesquisados (OtimizacaoTab por partes, recortada na campanha). No fim, o
// diagnóstico de convênio, que é da conta toda e segue a regra do alerta semanal.

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import type { Recorte } from '@/lib/marketing-atribuicao';
import { RetornoTab } from './RetornoTab';
import { OtimizacaoTab } from './OtimizacaoTab';

export const GoogleAdsTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const [campanhaSel, setCampanhaSel] = useState<string | null>(null);
  // O filtro global de campanha manda; o clique na tabela só abre o detalhe.
  const campanha =
    r.filtros.campanha !== 'todas' ? r.filtros.campanha : campanhaSel;
  const rCampanha = useMemo<Recorte | null>(
    () => (campanha ? { ...r, filtros: { ...r.filtros, campanha } } : null),
    [r, campanha]
  );
  const nome =
    r.campanhas.find((c) => c.campanha_id === campanha)?.campanha_nome ??
    campanha;

  return (
    <div className="space-y-6">
      <RetornoTab r={r} campanhaSel={campanha} onCampanha={setCampanhaSel} />

      {rCampanha && (
        <section
          aria-labelledby="ads-campanha-titulo"
          className="space-y-4 rounded-md border border-dashed p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ads-campanha-titulo" className="text-base font-semibold">
              Detalhe da campanha:{' '}
              {String(nome ?? '').replace('RK | Pesquisa | ', '')}
            </h2>
            {r.filtros.campanha === 'todas' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCampanhaSel(null)}
                aria-label="Fechar o detalhe da campanha"
              >
                <X className="h-4 w-4" aria-hidden />
                Fechar
              </Button>
            )}
          </div>
          <OtimizacaoTab
            r={rCampanha}
            secoes={['funil', 'palavras', 'termos']}
          />
        </section>
      )}

      {!rCampanha && (
        <p className="text-sm text-muted-foreground">
          Clique no nome de uma campanha para ver o funil, os grupos, as
          palavras-chave e os termos pesquisados dela.
        </p>
      )}

      <OtimizacaoTab r={r} secoes={['convenio']} />
    </div>
  );
};
