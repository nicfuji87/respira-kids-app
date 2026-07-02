// AI dev note: Ficha de entrevista presencial (aba "Ficha de entrevista" do modal
// do candidato). O avaliador percorre o roteiro, marca cada ponto como coberto,
// dá uma impressão rápida (👍/😐/⚠️) e anota. Estado controlado pelo pai
// (EstagioCandidatoDetail), salvo em candidaturas_estagio.entrevista.

import React, { useMemo } from 'react';
import { Textarea } from '@/components/primitives/textarea';
import { Progress } from '@/components/primitives/progress';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Circle,
  ThumbsUp,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import {
  ROTEIRO_ENTREVISTA,
  ROTEIRO_TOTAL_ITENS,
} from '@/lib/processo-seletivo-entrevista';
import {
  ESTILO_LABELS,
  DADOS_OPTION_LABELS,
  SITUACIONAL_QUESTIONS,
} from '@/lib/processo-seletivo-questions';

const COMPETENCIA_POR_ID = new Map(
  SITUACIONAL_QUESTIONS.map((q) => [q.id, q.competencia])
);
import type {
  CandidaturaEstagioRow,
  EntrevistaAvaliacao,
  EntrevistaFicha,
  EntrevistaRespostaItem,
} from '@/types/processo-seletivo';

interface EstagioEntrevistaFichaProps {
  row: CandidaturaEstagioRow;
  ficha: EntrevistaFicha;
  onChange: (ficha: EntrevistaFicha) => void;
}

const AVAL_OPTIONS: Array<{
  value: EntrevistaAvaliacao;
  icon: typeof ThumbsUp;
  label: string;
  activeClass: string;
}> = [
  {
    value: 'bom',
    icon: ThumbsUp,
    label: 'Boa resposta',
    activeClass: 'border-verde-pipa bg-verde-pipa/10 text-verde-pipa',
  },
  {
    value: 'neutro',
    icon: Minus,
    label: 'Neutro',
    activeClass: 'border-azul-respira bg-azul-respira/10 text-azul-respira',
  },
  {
    value: 'atencao',
    icon: AlertTriangle,
    label: 'Atenção',
    activeClass: 'border-vermelho-kids bg-vermelho-kids/10 text-vermelho-kids',
  },
];

export const EstagioEntrevistaFicha: React.FC<EstagioEntrevistaFichaProps> = ({
  row,
  ficha,
  onChange,
}) => {
  const itens = useMemo(() => ficha.itens || {}, [ficha.itens]);

  const patchItem = (id: string, patch: Partial<EntrevistaRespostaItem>) => {
    const current = itens[id] || {};
    onChange({
      ...ficha,
      itens: { ...itens, [id]: { ...current, ...patch } },
    });
  };

  const cobertos = useMemo(
    () => Object.values(itens).filter((i) => i?.ok).length,
    [itens]
  );
  const progresso = Math.round((cobertos / ROTEIRO_TOTAL_ITENS) * 100);

  // Pontos do situacional que o candidato ERROU (para explorar ao vivo).
  const pontosAExplorar = useMemo(
    () => (row.situacional_correcao || []).filter((c) => !c.acertou),
    [row.situacional_correcao]
  );

  return (
    <div className="space-y-4">
      {/* Contexto do candidato — o que já sabemos, para não perguntar de novo */}
      <section className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contexto para a entrevista
        </h3>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {row.disponibilidade?.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-background border border-border/60">
              Disponibilidade:{' '}
              {row.disponibilidade
                .map((d) => DADOS_OPTION_LABELS[d] || d)
                .join(', ')}
            </span>
          )}
          {row.estilo_perfil && (
            <span className="px-2 py-0.5 rounded-full bg-roxo-titulo/10 text-roxo-titulo">
              Perfil: {ESTILO_LABELS[row.estilo_perfil]}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-background border border-border/60">
            Situacional: {row.pontuacao_situacional}/{row.pontuacao_maxima}
          </span>
          {row.tem_resposta_perigosa && (
            <span className="px-2 py-0.5 rounded-full bg-vermelho-kids/10 text-vermelho-kids font-medium">
              ⚠️ Teve resposta de risco — investigar
            </span>
          )}
        </div>
        {pontosAExplorar.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Errou no teste (vale aprofundar):{' '}
            </span>
            {pontosAExplorar
              .map((c) => COMPETENCIA_POR_ID.get(c.id) || c.id.toUpperCase())
              .join(' · ')}
          </p>
        )}
      </section>

      {/* Progresso */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progresso do roteiro</span>
          <span className="font-semibold text-foreground">
            {cobertos}/{ROTEIRO_TOTAL_ITENS} pontos cobertos
          </span>
        </div>
        <Progress value={progresso} className="h-2" />
      </div>

      {/* Blocos do roteiro */}
      {ROTEIRO_ENTREVISTA.map((bloco) => (
        <section key={bloco.id} className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {bloco.titulo}
            </h3>
            {bloco.descricao && (
              <p className="text-xs text-muted-foreground">{bloco.descricao}</p>
            )}
          </div>

          <div className="space-y-2">
            {bloco.itens.map((item) => {
              const resp = itens[item.id] || {};
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    resp.ok
                      ? 'border-verde-pipa/40 bg-verde-pipa/5'
                      : 'border-border/60'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => patchItem(item.id, { ok: !resp.ok })}
                      className="mt-0.5 shrink-0"
                      aria-label={
                        resp.ok ? 'Desmarcar ponto' : 'Marcar como coberto'
                      }
                    >
                      {resp.ok ? (
                        <CheckCircle2 className="w-5 h-5 text-verde-pipa" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground/50" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-medium text-foreground">
                        {item.pergunta}
                      </p>
                      {item.dica && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          💡 {item.dica}
                        </p>
                      )}

                      {/* Impressão rápida */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {AVAL_OPTIONS.map((opt) => {
                          const active = resp.aval === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                patchItem(item.id, {
                                  aval: active ? null : opt.value,
                                })
                              }
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium transition-all',
                                active
                                  ? opt.activeClass
                                  : 'border-border/60 text-muted-foreground hover:border-azul-respira/50'
                              )}
                            >
                              <opt.icon className="w-3.5 h-3.5" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>

                      <Textarea
                        value={resp.nota || ''}
                        onChange={(e) =>
                          patchItem(item.id, { nota: e.target.value })
                        }
                        placeholder="Anotações..."
                        rows={2}
                        className="rounded-lg border border-border/60 resize-none text-sm focus-visible:border-azul-respira focus-visible:ring-1 focus-visible:ring-azul-respira/30"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Síntese final */}
      <section className="space-y-3 border-t border-border/60 pt-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Síntese da entrevista
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-xs text-verde-pipa font-medium">
              Pontos fortes
            </span>
            <Textarea
              value={ficha.pontos_fortes || ''}
              onChange={(e) =>
                onChange({ ...ficha, pontos_fortes: e.target.value })
              }
              placeholder="O que impressionou..."
              rows={3}
              className="rounded-lg border border-border/60 resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-vermelho-kids font-medium">
              Pontos de atenção
            </span>
            <Textarea
              value={ficha.pontos_atencao || ''}
              onChange={(e) =>
                onChange({ ...ficha, pontos_atencao: e.target.value })
              }
              placeholder="Dúvidas, ressalvas, red flags..."
              rows={3}
              className="rounded-lg border border-border/60 resize-none text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Impressão geral</span>
          <Textarea
            value={ficha.impressao_geral || ''}
            onChange={(e) =>
              onChange({ ...ficha, impressao_geral: e.target.value })
            }
            placeholder="Resumo livre da entrevista..."
            rows={3}
            className="rounded-lg border border-border/60 resize-none text-sm"
          />
        </div>
      </section>
    </div>
  );
};
