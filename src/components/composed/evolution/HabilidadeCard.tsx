// Registro de uma habilidade na sessão: estado (1 toque), consistência,
// assistência, números quando mensurados e, se quiser, qualidade do
// movimento. Campo vazio = não registrado (nunca zero).

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import {
  ASSISTENCIAS,
  CONSISTENCIAS,
  CONTROLES,
  ESTADOS_HABILIDADE,
  HABILIDADE_POR_ID,
  LADOS,
  PARTICIPACOES_HABILIDADE,
  ROTULO_ESTADO,
  SIMETRIAS,
  TRANSFERENCIAS,
  UNIDADE_METRICA,
  type EstadoHabilidade,
  type MetricaHabilidade,
} from '@/lib/motora-catalogo';
import {
  dataCurta,
  diferenca,
  fmtValor,
  nomeHabilidade,
  textoMetricasCurto,
} from '@/lib/motora-plano';
import type { RegistroHabilidade } from '@/types/evolucao-clinica';
import { chipClasse, opcaoClasse } from './estilos-motora';

const COR_ESTADO: Record<EstadoHabilidade, string> = {
  nao_observado: 'bg-slate-500 border-slate-500',
  nao_realiza: 'bg-rose-500 border-rose-500',
  com_assistencia: 'bg-amber-500 border-amber-500',
  independente: 'bg-emerald-500 border-emerald-500',
};

function Escolha<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
  disabled,
}: {
  rotulo: string;
  opcoes: { id: T; rotulo: string }[];
  valor: T | undefined;
  onChange: (v: T | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label={rotulo}
      >
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            disabled={disabled}
            onClick={() => onChange(valor === o.id ? undefined : o.id)}
            className={chipClasse(valor === o.id)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

const resumoComparacao = (c: NonNullable<RegistroHabilidade['anterior']>) =>
  `${ROTULO_ESTADO[c.estado].toLowerCase()}${
    c.assistencia
      ? ` (${ASSISTENCIAS.find((a) => a.id === c.assistencia)?.rotulo.toLowerCase()})`
      : ''
  }${textoMetricasCurto(c.metricas) ? ` · ${textoMetricasCurto(c.metricas)}` : ''} em ${dataCurta(c.data)}`;

export interface HabilidadeCardProps {
  registro: RegistroHabilidade;
  onChange: (r: RegistroHabilidade) => void;
  /** Sem ele, o cartão não mostra o X (habilidade presa a um objetivo) */
  onRemover?: () => void;
  disabled?: boolean;
}

export const HabilidadeCard: React.FC<HabilidadeCardProps> = ({
  registro: r,
  onChange,
  onRemover,
  disabled,
}) => {
  const hab = HABILIDADE_POR_ID[r.habilidade];
  const temQualidade = !!(
    r.simetria ||
    r.controle ||
    r.transferencia_peso ||
    r.participacao ||
    r.observacao
  );
  const [detalhes, setDetalhes] = useState(temQualidade);
  const set = (p: Partial<RegistroHabilidade>) => {
    const novo = { ...r, ...p };
    for (const k of Object.keys(p) as (keyof RegistroHabilidade)[])
      if (novo[k] === undefined) delete novo[k];
    onChange(novo);
  };
  const setMetrica = (m: MetricaHabilidade, texto: string) => {
    const metricas = { ...(r.metricas || {}) };
    const n = Number(texto.replace(',', '.'));
    if (texto.trim() === '' || !Number.isFinite(n)) delete metricas[m];
    else metricas[m] = n;
    set({ metricas: Object.keys(metricas).length ? metricas : undefined });
  };
  const observado = r.estado !== 'nao_observado';
  const ant = r.anterior;

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">
            {nomeHabilidade(r.habilidade)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ant
              ? `Último: ${resumoComparacao(ant)}`
              : 'Primeiro registro desta habilidade'}
          </p>
          {r.avaliacao && (
            <p className="text-xs text-muted-foreground">
              Na avaliação: {resumoComparacao(r.avaliacao)}
            </p>
          )}
        </div>
        {onRemover && (
          <button
            type="button"
            onClick={onRemover}
            disabled={disabled}
            aria-label={`Tirar ${nomeHabilidade(r.habilidade)} desta evolução`}
            className="p-1 rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {hab?.porLado && (
        <Escolha
          rotulo="Lado"
          opcoes={LADOS}
          valor={r.lado}
          onChange={(v) => set({ lado: v ?? 'ambos' })}
          disabled={disabled}
        />
      )}

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        role="radiogroup"
        aria-label={`Estado de ${nomeHabilidade(r.habilidade)}`}
      >
        {ESTADOS_HABILIDADE.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={r.estado === e.id}
            disabled={disabled}
            onClick={() =>
              set({
                estado: e.id,
                ...(e.id !== 'com_assistencia'
                  ? { assistencia: undefined }
                  : {}),
                ...(e.id === 'nao_observado' || e.id === 'nao_realiza'
                  ? { consistencia: undefined }
                  : {}),
              })
            }
            className={opcaoClasse(r.estado === e.id, COR_ESTADO[e.id])}
          >
            {e.rotulo}
          </button>
        ))}
      </div>

      {r.estado === 'com_assistencia' && (
        <Escolha
          rotulo="Assistência"
          opcoes={ASSISTENCIAS}
          valor={r.assistencia}
          onChange={(v) => set({ assistencia: v })}
          disabled={disabled}
        />
      )}
      {(r.estado === 'com_assistencia' || r.estado === 'independente') && (
        <Escolha
          rotulo="Consistência"
          opcoes={CONSISTENCIAS}
          valor={r.consistencia}
          onChange={(v) => set({ consistencia: v })}
          disabled={disabled}
        />
      )}

      {observado && hab && hab.metricas.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {hab.metricas.map((m) => {
            const un = UNIDADE_METRICA[m.id];
            const atual = r.metricas?.[m.id];
            const antes = ant?.metricas?.[m.id];
            const dif = diferenca(atual, antes, un);
            return (
              <label key={m.id} className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">
                  {m.rotulo}
                  {un ? ` (${un})` : ''} — se mensurado
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={atual ?? ''}
                  onChange={(e) => setMetrica(m.id, e.target.value)}
                  disabled={disabled}
                />
                {antes !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    Antes {fmtValor(antes, un)}
                    {dif ? ` · ${dif}` : ''}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {observado && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setDetalhes((d) => !d)}
            className="flex items-center gap-1 text-sm text-primary"
            aria-expanded={detalhes}
          >
            {detalhes ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Qualidade do movimento (opcional)
          </button>
          {detalhes && (
            <div className={cn('space-y-3 pl-1')}>
              <Escolha
                rotulo="Controle postural"
                opcoes={CONTROLES}
                valor={r.controle}
                onChange={(v) => set({ controle: v })}
                disabled={disabled}
              />
              <Escolha
                rotulo="Simetria"
                opcoes={SIMETRIAS}
                valor={r.simetria}
                onChange={(v) => set({ simetria: v })}
                disabled={disabled}
              />
              <Escolha
                rotulo="Transferência de peso"
                opcoes={TRANSFERENCIAS}
                valor={r.transferencia_peso}
                onChange={(v) => set({ transferencia_peso: v })}
                disabled={disabled}
              />
              <Escolha
                rotulo="Participação"
                opcoes={PARTICIPACOES_HABILIDADE}
                valor={r.participacao}
                onChange={(v) => set({ participacao: v })}
                disabled={disabled}
              />
              <Input
                value={r.observacao ?? ''}
                onChange={(e) =>
                  set({ observacao: e.target.value || undefined })
                }
                placeholder="Observação (ex.: inclinação persistente do tronco à direita)"
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
