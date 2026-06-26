// AI dev note: Painel de detalhe de uma candidatura (modal).
// Mostra dados, correção do situacional (✓/✗/⚠️), textos escritos, estilo de
// trabalho e o formulário de avaliação humana (status / nota / observações).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  AlertTriangle,
  Mail,
  Phone,
  GraduationCap,
  MapPin,
  CalendarClock,
  Link2,
  Sparkles,
} from 'lucide-react';
import {
  SITUACIONAL_QUESTIONS,
  ESTILO_LABELS,
  ESTILO_DESCRICAO,
  STATUS_LABELS,
  DADOS_OPTION_LABELS,
} from '@/lib/processo-seletivo-questions';
import {
  getRecomendacao,
  updateCandidaturaAvaliacao,
} from '@/lib/processo-seletivo-api';
import { StatusBadge, RecomendacaoBadge } from './EstagioBadges';
import type {
  CandidaturaEstagioRow,
  EstiloPerfil,
  StatusCandidatura,
} from '@/types/processo-seletivo';

interface EstagioCandidatoDetailProps {
  row: CandidaturaEstagioRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliadorId: string | null;
  onSaved: (updated: CandidaturaEstagioRow) => void;
}

const STATUS_OPTIONS: StatusCandidatura[] = [
  'a_avaliar',
  'entrevista',
  'aprovado',
  'descartado',
];

// Lookup: id da pergunta -> { competencia, enunciado, labels por value }
const SIT_LOOKUP = new Map(
  SITUACIONAL_QUESTIONS.map((q) => [
    q.id,
    {
      competencia: q.competencia,
      enunciado: q.enunciado,
      labels: new Map(q.options.map((o) => [o.value, o.label])),
    },
  ])
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const EstagioCandidatoDetail: React.FC<EstagioCandidatoDetailProps> = ({
  row,
  open,
  onOpenChange,
  avaliadorId,
  onSaved,
}) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusCandidatura>('a_avaliar');
  const [nota, setNota] = useState<number | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setStatus(row.status);
      setNota(row.avaliacao_nota);
      setObservacoes(row.avaliacao_observacoes || '');
    }
  }, [row]);

  // Contagem do estilo de trabalho (não pontua)
  const estiloContagem = useMemo(() => {
    if (!row) return [] as Array<{ perfil: EstiloPerfil; count: number }>;
    const counts = new Map<string, number>();
    for (const v of Object.values(row.estilo_respostas || {})) {
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return (Object.keys(ESTILO_LABELS) as EstiloPerfil[])
      .map((perfil) => ({ perfil, count: counts.get(perfil) || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [row]);

  const handleSave = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    try {
      const updated = await updateCandidaturaAvaliacao(row.id, {
        status,
        avaliacao_nota: nota,
        avaliacao_observacoes: observacoes.trim() || null,
        avaliadoPor: avaliadorId,
      });
      toast({
        title: 'Avaliação salva',
        description: `${row.nome} agora está como "${STATUS_LABELS[status]}".`,
      });
      onSaved(updated);
      onOpenChange(false);
    } catch {
      toast({
        title: 'Não foi possível salvar',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [
    row,
    status,
    nota,
    observacoes,
    avaliadorId,
    onSaved,
    onOpenChange,
    toast,
  ]);

  if (!row) return null;

  const recomendacao = getRecomendacao(row);

  const dataItems = [
    { icon: Mail, label: row.email },
    { icon: Phone, label: row.telefone },
    {
      icon: GraduationCap,
      label: [row.curso, row.instituicao, row.periodo]
        .filter(Boolean)
        .join(' · '),
    },
    { icon: MapPin, label: row.cidade },
    {
      icon: CalendarClock,
      label: row.previsao_formatura
        ? `Formatura: ${row.previsao_formatura}`
        : null,
    },
  ].filter((d) => d.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl pr-6">{row.nome}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge status={row.status} />
            <RecomendacaoBadge recomendacao={recomendacao} />
            <span className="text-sm font-semibold text-foreground">
              Situacional: {row.pontuacao_situacional}/{row.pontuacao_maxima}
            </span>
            <span className="text-xs text-muted-foreground">
              · enviado em {formatDate(row.created_at)}
            </span>
          </div>
        </DialogHeader>

        {/* Dados do candidato */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dataItems.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm text-foreground min-w-0"
            >
              <d.icon className="w-4 h-4 text-azul-respira shrink-0" />
              <span className="truncate">{d.label}</span>
            </div>
          ))}
          {row.linkedin_url && (
            <a
              href={row.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-azul-respira hover:underline min-w-0"
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{row.linkedin_url}</span>
            </a>
          )}
        </div>

        {(row.disponibilidade?.length > 0 || row.como_soube) && (
          <div className="flex flex-wrap gap-1.5">
            {row.disponibilidade?.map((d) => (
              <span
                key={d}
                className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
              >
                {DADOS_OPTION_LABELS[d] || d}
              </span>
            ))}
            {row.como_soube && (
              <span className="px-2 py-0.5 rounded-full bg-azul-respira/10 text-xs text-azul-respira">
                Soube via:{' '}
                {DADOS_OPTION_LABELS[row.como_soube] || row.como_soube}
              </span>
            )}
          </div>
        )}

        {/* Correção situacional */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Teste situacional
          </h3>
          <div className="space-y-2">
            {row.situacional_correcao.map((item) => {
              const meta = SIT_LOOKUP.get(item.id);
              const escolhaLabel = item.escolha
                ? meta?.labels.get(item.escolha)
                : null;
              const corretaLabel = meta?.labels.get(item.correta);
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3',
                    item.perigosa
                      ? 'border-vermelho-kids/40 bg-vermelho-kids/5'
                      : item.acertou
                        ? 'border-verde-pipa/40 bg-verde-pipa/5'
                        : 'border-border/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {meta?.competencia}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.perigosa ? (
                        <AlertTriangle className="w-4 h-4 text-vermelho-kids" />
                      ) : item.acertou ? (
                        <Check className="w-4 h-4 text-verde-pipa" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-xs font-bold text-foreground">
                        {item.pontos}/2
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground mt-1">
                    <span className="text-muted-foreground">Escolheu: </span>
                    {escolhaLabel || (
                      <span className="italic text-muted-foreground">
                        não respondeu
                      </span>
                    )}
                  </p>
                  {!item.acertou && corretaLabel && (
                    <p className="text-xs text-verde-pipa mt-1">
                      Melhor resposta: {corretaLabel}
                    </p>
                  )}
                  {meta?.enunciado && (
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground/70 cursor-pointer hover:text-foreground">
                        ver enunciado
                      </summary>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {meta.enunciado}
                      </p>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Textos escritos */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Respostas escritas
          </h3>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Por que escolheu a fisioterapia?
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {row.texto_motivacao || (
                <span className="italic text-muted-foreground">
                  não respondeu
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Como explicaria a demora do tratamento para uma mãe ansiosa?
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {row.texto_mae_ansiosa || (
                <span className="italic text-muted-foreground">
                  não respondeu
                </span>
              )}
            </p>
          </div>
        </section>

        {/* Estilo de trabalho */}
        {estiloContagem.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amarelo-pipa" />
              Estilo de trabalho
              <span className="font-normal normal-case text-xs text-muted-foreground">
                (não pontua — orienta a entrevista)
              </span>
            </h3>
            {row.estilo_perfil && (
              <p className="text-sm text-foreground">
                Tendência:{' '}
                <span className="font-semibold text-roxo-titulo">
                  {ESTILO_LABELS[row.estilo_perfil]}
                </span>{' '}
                <span className="text-muted-foreground">
                  — {ESTILO_DESCRICAO[row.estilo_perfil]}
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {estiloContagem.map(({ perfil, count }) => (
                <span
                  key={perfil}
                  className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                >
                  {ESTILO_LABELS[perfil]}: {count}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Avaliação humana */}
        <section className="space-y-3 border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Sua avaliação
          </h3>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Decisão</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border-2 text-sm font-medium transition-all',
                    status === s
                      ? 'border-azul-respira bg-azul-respira/10 text-roxo-titulo'
                      : 'border-border/60 text-foreground hover:border-azul-respira/50'
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Nota interna (1 a 5)
            </span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(n)}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 text-sm font-bold transition-all',
                    nota === n
                      ? 'border-azul-respira bg-azul-respira text-white'
                      : 'border-border/60 text-foreground hover:border-azul-respira/50'
                  )}
                >
                  {n}
                </button>
              ))}
              {nota !== null && (
                <button
                  type="button"
                  onClick={() => setNota(null)}
                  className="text-xs text-muted-foreground hover:text-foreground ml-1"
                >
                  limpar
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Observações</span>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Anotações sobre o candidato, pontos a explorar na entrevista..."
              rows={3}
              className="rounded-xl border-2 border-border/60 resize-none focus-visible:border-azul-respira focus-visible:ring-2 focus-visible:ring-azul-respira/30"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar avaliação'}
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
};
