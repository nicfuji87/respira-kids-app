// Reavaliação: tabela "avaliação anterior × agora", parâmetro a parâmetro.

import React from 'react';
import { cn } from '@/lib/utils';
import { comparacaoAvaliacoes } from '@/lib/avaliacao-motora';
import { dataCurta } from '@/lib/motora-plano';
import type { AvaliacaoClinica } from '@/types/avaliacoes-clinicas';

export const ComparacaoAvaliacoes: React.FC<{
  anterior: AvaliacaoClinica | null | undefined;
  atual: AvaliacaoClinica;
}> = ({ anterior, atual }) => {
  if (!anterior)
    return (
      <p className="text-sm text-muted-foreground">
        Não há avaliação anterior ligada a esta reavaliação.
      </p>
    );
  const linhas = comparacaoAvaliacoes(anterior, atual);
  if (linhas.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há parâmetros registrados para comparar.
      </p>
    );
  const grupos = [...new Set(linhas.map((l) => l.grupo))];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Avaliação de {dataCurta(anterior.data_avaliacao)} × esta (
        {dataCurta(atual.data_avaliacao)}). Só aparecem os parâmetros
        registrados em pelo menos uma das duas. Diferenças pequenas podem estar
        dentro da variação da própria medida.
      </p>
      {grupos.map((g) => (
        <div key={g} className="rounded-lg border overflow-x-auto">
          <p className="px-3 py-2 text-sm font-semibold bg-muted/40">{g}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-normal px-3 py-1.5">Parâmetro</th>
                <th className="text-left font-normal px-3 py-1.5">Antes</th>
                <th className="text-left font-normal px-3 py-1.5">Agora</th>
                <th className="text-left font-normal px-3 py-1.5">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhas
                .filter((l) => l.grupo === g)
                .map((l) => (
                  <tr key={l.parametro} className="border-t align-top">
                    <td className="px-3 py-1.5">{l.parametro}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {l.antes}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5',
                        l.antes !== l.agora && 'font-medium'
                      )}
                    >
                      {l.agora}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {l.diferenca ?? ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};
