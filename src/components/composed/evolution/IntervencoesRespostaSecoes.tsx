// Evolução motora 1.3: intervenções pela finalidade (com abordagem e
// região/função) e resposta da sessão (participação, ocorrências,
// intercorrências, relato da família separado da observação da fisio).

import React from 'react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { cn } from '@/lib/utils';
import {
  ABORDAGENS,
  FINALIDADES,
  OCORRENCIAS_SESSAO,
  PARTICIPACOES_SESSAO,
  RECURSOS,
  REGIOES,
  RESULTADOS_FUNCIONAIS,
} from '@/lib/motora-catalogo';
import type {
  AdesaoDomiciliar,
  EvolucaoMotoraAssimetria,
  IntervencaoFinalidade,
  RespostaSessaoMotora,
} from '@/types/evolucao-clinica';
import { chipClasse, opcaoClasse } from './estilos-motora';

const alternar = (lista: string[] | undefined, id: string) => {
  const l = lista ?? [];
  const nova = l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
  return nova.length ? nova : undefined;
};

const Chips: React.FC<{
  rotulo: string;
  opcoes: { id: string; nome: string }[];
  valor: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
  disabled?: boolean;
}> = ({ rotulo, opcoes, valor, onChange, disabled }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{rotulo}</Label>
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const sel = !!valor?.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={sel}
            disabled={disabled}
            onClick={() => onChange(alternar(valor, o.id))}
            className={chipClasse(sel)}
          >
            {o.nome}
          </button>
        );
      })}
    </div>
  </div>
);

// ------------------------------------------------------------ intervenções

export const IntervencoesSecao: React.FC<{
  evolucao: EvolucaoMotoraAssimetria;
  onChange: (u: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}> = ({ evolucao, onChange, disabled }) => {
  const lista = evolucao.intervencoes || [];
  const areas = evolucao.areas || [];
  const set = (nova: IntervencaoFinalidade[]) =>
    onChange({ intervencoes: nova });
  const doId = (id: string) => lista.find((i) => i.finalidade === id);
  const atualizar = (id: string, p: Partial<IntervencaoFinalidade>) =>
    set(
      lista.map((i) => {
        if (i.finalidade !== id) return i;
        const novo = { ...i, ...p };
        for (const k of Object.keys(p) as (keyof IntervencaoFinalidade)[])
          if (novo[k] === undefined) delete novo[k];
        return novo;
      })
    );

  // Finalidades das áreas da sessão primeiro
  const ordenadas = [...FINALIDADES].sort((a, b) => {
    const pa = !a.areas || a.areas.some((x) => areas.includes(x)) ? 0 : 1;
    const pb = !b.areas || b.areas.some((x) => areas.includes(x)) ? 0 : 1;
    return pa - pb;
  });
  const outra = doId('outra');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Marque o que foi trabalhado. Em cada finalidade, a abordagem e a região
        ou função são opcionais. A orientação à família fica em Orientações.
      </p>
      {ordenadas.map((f) => {
        const it = doId(f.id);
        return (
          <div
            key={f.id}
            className={cn(
              'rounded-lg border p-3 space-y-3',
              it ? 'bg-background border-primary/50' : 'bg-muted/20'
            )}
          >
            <button
              type="button"
              aria-pressed={!!it}
              disabled={disabled}
              onClick={() =>
                set(
                  it
                    ? lista.filter((i) => i.finalidade !== f.id)
                    : [...lista, { finalidade: f.id }]
                )
              }
              className="w-full text-left flex items-start gap-3"
            >
              <span
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center text-xs',
                  it
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40'
                )}
                aria-hidden
              >
                {it ? '✓' : ''}
              </span>
              <span>
                <span className="font-medium block">{f.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {f.exemplo}
                </span>
              </span>
            </button>
            {it && (
              <div className="space-y-3 pl-8">
                <Chips
                  rotulo="Abordagem"
                  opcoes={ABORDAGENS}
                  valor={it.abordagens}
                  onChange={(v) => atualizar(f.id, { abordagens: v })}
                  disabled={disabled}
                />
                <Input
                  value={it.abordagem_outra ?? ''}
                  onChange={(e) =>
                    atualizar(f.id, {
                      abordagem_outra: e.target.value || undefined,
                    })
                  }
                  placeholder="Outra abordagem (opcional)"
                  disabled={disabled}
                />
                <Chips
                  rotulo="Região ou função"
                  opcoes={REGIOES}
                  valor={it.regioes}
                  onChange={(v) => atualizar(f.id, { regioes: v })}
                  disabled={disabled}
                />
                <Chips
                  rotulo="Recursos"
                  opcoes={RECURSOS}
                  valor={it.recursos}
                  onChange={(v) => atualizar(f.id, { recursos: v })}
                  disabled={disabled}
                />
                <Input
                  value={it.detalhe ?? ''}
                  onChange={(e) =>
                    atualizar(f.id, { detalhe: e.target.value || undefined })
                  }
                  placeholder="O que foi feito, em poucas palavras (opcional)"
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        );
      })}
      <div
        className={cn(
          'rounded-lg border p-3 space-y-2',
          outra ? 'bg-background border-primary/50' : 'bg-muted/20'
        )}
      >
        <Label className="text-sm">Outra finalidade</Label>
        <Input
          value={outra?.finalidade_outra ?? ''}
          onChange={(e) => {
            const t = e.target.value;
            if (!t && outra) set(lista.filter((i) => i.finalidade !== 'outra'));
            else if (t && !outra)
              set([...lista, { finalidade: 'outra', finalidade_outra: t }]);
            else if (t) atualizar('outra', { finalidade_outra: t });
          }}
          placeholder="Descreva (opcional)"
          disabled={disabled}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- resposta

const OPCOES_ADESAO: { id: AdesaoDomiciliar; rotulo: string }[] = [
  { id: 'sim', rotulo: 'Sim' },
  { id: 'parcial', rotulo: 'Parcialmente' },
  { id: 'nao', rotulo: 'Não' },
  { id: 'nao_informado', rotulo: 'Não informado' },
];

export const RespostaSessaoSecao: React.FC<{
  evolucao: EvolucaoMotoraAssimetria;
  onChange: (u: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}> = ({ evolucao, onChange, disabled }) => {
  const r = evolucao.resposta_sessao || {};
  const set = (p: Partial<RespostaSessaoMotora>) => {
    const novo = { ...r, ...p };
    for (const k of Object.keys(p) as (keyof RespostaSessaoMotora)[])
      if (novo[k] === undefined) delete novo[k];
    onChange({ resposta_sessao: novo });
  };
  const comObjetivo = (evolucao.objetivos_sessao || []).length > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Participação e tolerância</Label>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Participação"
        >
          {PARTICIPACOES_SESSAO.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={r.participacao === p.id}
              disabled={disabled}
              onClick={() =>
                set({
                  participacao: r.participacao === p.id ? undefined : p.id,
                })
              }
              className={opcaoClasse(r.participacao === p.id)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {OCORRENCIAS_SESSAO.map((o) => {
            const sel = !!r.ocorrencias?.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={sel}
                disabled={disabled}
                onClick={() =>
                  set({ ocorrencias: alternar(r.ocorrencias, o.id) })
                }
                className={chipClasse(sel)}
              >
                {o.rotulo}
              </button>
            );
          })}
        </div>
        <Input
          value={r.ocorrencia_outra ?? ''}
          onChange={(e) =>
            set({ ocorrencia_outra: e.target.value || undefined })
          }
          placeholder="Outra observação de comportamento (opcional)"
          disabled={disabled}
        />
      </div>

      {!comObjetivo && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            Resultado funcional da sessão
          </Label>
          <p className="text-xs text-muted-foreground">
            Com objetivos trabalhados, o resultado é registrado em cada
            objetivo.
          </p>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            role="radiogroup"
            aria-label="Resultado funcional"
          >
            {RESULTADOS_FUNCIONAIS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={r.resultado_geral === o.id}
                disabled={disabled}
                onClick={() =>
                  set({
                    resultado_geral:
                      r.resultado_geral === o.id ? undefined : o.id,
                  })
                }
                className={opcaoClasse(r.resultado_geral === o.id)}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Intercorrências (opcional)
        </Label>
        <Textarea
          value={r.intercorrencias ?? ''}
          onChange={(e) =>
            set({ intercorrencias: e.target.value || undefined })
          }
          rows={2}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label className="text-sm font-medium">Relato da família</Label>
        <p className="text-xs text-muted-foreground">
          O que o responsável contou. Fica separado da observação da fisio.
        </p>
        <Textarea
          value={r.relato_familia ?? ''}
          onChange={(e) => set({ relato_familia: e.target.value || undefined })}
          rows={2}
          placeholder="Ex.: mãe relata que está rolando sozinha em casa"
          disabled={disabled}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Seguindo as orientações em casa?
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OPCOES_ADESAO.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={r.adesao_domiciliar === o.id}
                disabled={disabled}
                onClick={() =>
                  set({
                    adesao_domiciliar:
                      r.adesao_domiciliar === o.id ? undefined : o.id,
                  })
                }
                className={opcaoClasse(r.adesao_domiciliar === o.id)}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Observações da fisioterapeuta (opcional)
        </Label>
        <Textarea
          value={r.observacoes ?? ''}
          onChange={(e) => set({ observacoes: e.target.value || undefined })}
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
