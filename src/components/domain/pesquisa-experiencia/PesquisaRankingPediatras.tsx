// AI dev note: Ranking de pediatras indicadores com NPS médio das mães indicadas.
// Útil para identificar quem indica e gera famílias satisfeitas (estratégico
// para parcerias) e quem indica mas gera detratores (sinal de descompasso).

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { cn } from '@/lib/utils';
import { Award, TrendingDown, TrendingUp } from 'lucide-react';
import type { RankingPediatra } from '@/types/pesquisa-experiencia';

interface PesquisaRankingPediatrasProps {
  ranking: RankingPediatra[];
  className?: string;
  /** Amostra mínima para considerar o NPS estatisticamente relevante. */
  minRespostas?: number;
}

function npsToneClass(nps: number, total: number, minRespostas: number) {
  if (total < minRespostas) return 'text-muted-foreground';
  if (nps >= 75) return 'text-verde-pipa';
  if (nps >= 50) return 'text-roxo-titulo';
  if (nps >= 0) return 'text-amarelo-pipa';
  return 'text-vermelho-kids';
}

export const PesquisaRankingPediatras =
  React.memo<PesquisaRankingPediatrasProps>(
    ({ ranking, className, minRespostas = 2 }) => {
      if (ranking.length === 0) {
        return (
          <Card className={className}>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
                <Award className="w-5 h-5 text-amarelo-pipa" />
                Ranking de pediatras indicadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground/80 py-4 text-center">
                Nenhum pediatra foi indicado nas respostas ainda.
              </p>
            </CardContent>
          </Card>
        );
      }

      // Top 5 com NPS mais alto (acima do limite mínimo)
      const relevantes = ranking.filter(
        (r) => r.total_indicacoes >= minRespostas
      );
      const melhores = [...relevantes]
        .sort((a, b) => b.nps.nps - a.nps.nps)
        .slice(0, 3);
      const piores = [...relevantes]
        .sort((a, b) => a.nps.nps - b.nps.nps)
        .filter((p) => p.nps.nps < 50)
        .slice(0, 3);

      return (
        <Card className={cn('overflow-hidden', className)}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Award className="w-5 h-5 text-amarelo-pipa" />
              Ranking de pediatras indicadores
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pediatras que indicaram mães que responderam à pesquisa. NPS médio
              das mães indicadas por cada profissional.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Destaques: melhores + piores */}
            {(melhores.length > 0 || piores.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {melhores.length > 0 && (
                  <div className="p-3 rounded-xl bg-verde-pipa/10 border border-verde-pipa/30">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-verde-pipa" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-roxo-titulo">
                        Top promotores
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {melhores.map((p) => (
                        <li
                          key={p.pediatra_id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-foreground truncate">
                            {p.nome}
                          </span>
                          <span className="font-bold text-verde-pipa shrink-0">
                            NPS {p.nps.nps}
                            <span className="text-muted-foreground font-normal text-xs ml-1">
                              ({p.total_indicacoes})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {piores.length > 0 && (
                  <div className="p-3 rounded-xl bg-vermelho-kids/10 border border-vermelho-kids/30">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-vermelho-kids" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-roxo-titulo">
                        Atenção
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {piores.map((p) => (
                        <li
                          key={p.pediatra_id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-foreground truncate">
                            {p.nome}
                          </span>
                          <span className="font-bold text-vermelho-kids shrink-0">
                            NPS {p.nps.nps}
                            <span className="text-muted-foreground font-normal text-xs ml-1">
                              ({p.total_indicacoes})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tabela completa */}
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground/70 border-b border-border/40">
                    <th className="text-left font-medium px-6 py-2">
                      Pediatra
                    </th>
                    <th className="text-center font-medium px-2 py-2">
                      Indicações
                    </th>
                    <th className="text-center font-medium px-2 py-2 hidden sm:table-cell">
                      Confiança média
                    </th>
                    <th className="text-right font-medium px-6 py-2">NPS</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((p, idx) => (
                    <tr
                      key={p.pediatra_id}
                      className={cn(
                        'border-t border-border/30',
                        idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'
                      )}
                    >
                      <td className="px-6 py-2.5 font-medium text-foreground truncate max-w-[280px]">
                        {p.nome}
                      </td>
                      <td className="text-center px-2 py-2.5 text-muted-foreground">
                        {p.total_indicacoes}
                      </td>
                      <td className="text-center px-2 py-2.5 hidden sm:table-cell text-muted-foreground">
                        {p.mediaNotaConfianca !== null
                          ? `${p.mediaNotaConfianca.toFixed(1)}/10`
                          : '—'}
                      </td>
                      <td
                        className={cn(
                          'text-right px-6 py-2.5 font-bold',
                          npsToneClass(
                            p.nps.nps,
                            p.total_indicacoes,
                            minRespostas
                          )
                        )}
                      >
                        {p.total_indicacoes > 0 ? p.nps.nps : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      );
    }
  );

PesquisaRankingPediatras.displayName = 'PesquisaRankingPediatras';
