// Medidas programadas dentro da evolução motora:
// - MedicaoSessaoBloco: situação de UMA medida nesta sessão (prevista,
//   último registro) e o que a fisio fez com ela: Medi hoje / Adiar /
//   Dispensada nesta ocasião / Não se aplica. Sem escolha = "sem registro
//   nesta evolução", que NÃO afirma que a medida deixou de ser feita.
// - ReavaliacoesConduta: medidas previstas que não têm seção própria aberta
//   e "Programar próxima reavaliação".
// Os dados vêm de MedidasEvolucaoContext (carregados pelo agendamento).

import React from 'react';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/lib/utils';
import { useMedidasEvolucao } from './medidas-evolucao-context';
import {
  NOME_MEDIDA_MOTORA,
  type MedicaoSessao,
  type ProximaReavaliacao,
  type SituacaoMedicao,
  type TipoMedidaMotora,
} from '@/types/evolucao-clinica';
import {
  dataBR,
  descreverEstado,
  medidaPendente,
  somarDias,
} from '@/lib/motora-medidas';

const FONTE: Record<string, string> = {
  evolucao: 'evolução',
  avaliacao: 'avaliação',
  marcada: 'marcada como feita',
};

const COR_ESTADO: Record<string, string> = {
  prevista: 'bg-amber-100 text-amber-900 border-amber-300',
  atrasada: 'bg-red-100 text-red-900 border-red-300',
  em_dia: 'bg-emerald-50 text-emerald-900 border-emerald-200',
};

const MOTIVOS_RAPIDOS = [
  'Criança irritada',
  'Criança dormindo',
  'Faltou tempo',
];

const OPCOES: { valor: SituacaoMedicao; com: string; sem: string }[] = [
  { valor: 'medido', com: 'Medi hoje', sem: 'Feita hoje' },
  { valor: 'adiado', com: 'Adiar medição', sem: 'Adiar' },
  {
    valor: 'dispensado',
    com: 'Dispensada nesta ocasião',
    sem: 'Dispensada nesta ocasião',
  },
  { valor: 'nao_aplicavel', com: 'Não se aplica', sem: 'Não se aplica' },
];

export interface MedicaoSessaoBlocoProps {
  tipo: TipoMedidaMotora;
  valor: MedicaoSessao | undefined;
  onChange: (m: MedicaoSessao | undefined) => void;
  /** a seção já tem valores digitados para esta medida */
  temValores?: boolean;
  /** apaga os valores digitados (ao escolher adiar/dispensar/não se aplica) */
  onDescartarValores?: () => void;
  disabled?: boolean;
  /** campos da medida (só aparecem em "Medi hoje" ou se já tem valores) */
  children?: React.ReactNode;
}

export const MedicaoSessaoBloco: React.FC<MedicaoSessaoBlocoProps> = ({
  tipo,
  valor,
  onChange,
  temValores = false,
  onDescartarValores,
  disabled,
  children,
}) => {
  const { medidas, dataSessao } = useMedidasEvolucao();
  const medida = medidas?.find((m) => m.tipo === tipo);
  const temCampos = !!children;
  const situacao = valor?.situacao ?? (temValores ? 'medido' : undefined);
  const mostraCampos = temCampos && situacao === 'medido';

  const escolher = (s: SituacaoMedicao) => {
    if (disabled) return;
    if (situacao === s) {
      // tocar de novo desfaz (com valores preenchidos, "medido" continua)
      onChange(undefined);
      return;
    }
    if (s !== 'medido' && temValores) onDescartarValores?.();
    onChange({ situacao: s });
  };

  const atualizar = (parcial: Partial<MedicaoSessao>) =>
    valor && onChange({ ...valor, ...parcial });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{NOME_MEDIDA_MOTORA[tipo]}</span>
          {medida && medida.estado !== 'sem_programacao' && (
            <span
              className={cn(
                'text-xs rounded-full border px-2 py-0.5',
                COR_ESTADO[medida.estado] ??
                  'bg-muted text-muted-foreground border-border'
              )}
            >
              {descreverEstado(medida)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {medida?.ultima_data
            ? `Último registro: ${dataBR(medida.ultima_data)} (${FONTE[medida.ultima_fonte ?? ''] ?? 'registro'})`
            : medidas
              ? 'Nenhum registro anterior desta medida.'
              : ''}
          {!situacao && ' · Sem registro nesta evolução.'}
        </p>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          role="radiogroup"
          aria-label={`O que foi feito com ${NOME_MEDIDA_MOTORA[tipo]} nesta sessão`}
        >
          {OPCOES.map((op) => {
            const sel = situacao === op.valor;
            return (
              <button
                key={op.valor}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={disabled}
                onClick={() => escolher(op.valor)}
                className={cn(
                  'min-h-10 rounded-lg border-2 px-2 py-1.5 text-[13px] sm:text-sm font-medium transition-colors',
                  sel
                    ? op.valor === 'medido'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-slate-500 border-slate-500 text-white'
                    : 'bg-background border-border text-muted-foreground hover:bg-muted',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {temCampos ? op.com : op.sem}
              </button>
            );
          })}
        </div>

        {valor &&
          (valor.situacao === 'adiado' || valor.situacao === 'dispensado') && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {valor.situacao === 'adiado'
                    ? 'Nova data prevista'
                    : 'Reprogramar para (opcional)'}
                </Label>
                <Input
                  type="date"
                  value={valor.nova_data ?? ''}
                  min={dataSessao ? somarDias(dataSessao, 1) : undefined}
                  onChange={(e) =>
                    atualizar({ nova_data: e.target.value || undefined })
                  }
                  disabled={disabled}
                />
                {valor.situacao === 'adiado' && !valor.nova_data && (
                  <p className="text-xs text-amber-700">
                    Informe quando medir, para o lembrete voltar na data certa.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Motivo (opcional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_RAPIDOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        atualizar({
                          motivo: valor.motivo === m ? undefined : m,
                        })
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        valor.motivo === m
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Input
                  value={
                    valor.motivo && !MOTIVOS_RAPIDOS.includes(valor.motivo)
                      ? valor.motivo
                      : ''
                  }
                  onChange={(e) =>
                    atualizar({ motivo: e.target.value || undefined })
                  }
                  placeholder="Outro motivo"
                  disabled={disabled}
                />
              </div>
            </div>
          )}

        {valor?.situacao === 'nao_aplicavel' && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Esta medida deixa de ser lembrada para esta criança. Dá para
              voltar a programar depois, na conduta.
            </p>
            <Input
              value={valor.motivo ?? ''}
              onChange={(e) =>
                atualizar({ motivo: e.target.value || undefined })
              }
              placeholder="Por que não se aplica (opcional)"
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {mostraCampos && children}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SEMANAS = [2, 4, 6, 8];

export interface ReavaliacoesCondutaProps {
  medicoes: Partial<Record<TipoMedidaMotora, MedicaoSessao>>;
  proximas: Partial<Record<TipoMedidaMotora, ProximaReavaliacao>>;
  onMedicaoChange: (
    tipo: TipoMedidaMotora,
    m: MedicaoSessao | undefined
  ) => void;
  onProximaChange: (
    tipo: TipoMedidaMotora,
    p: ProximaReavaliacao | undefined
  ) => void;
  /** medidas que já têm seção aberta nesta evolução (o bloco fica lá) */
  tiposComSecao: TipoMedidaMotora[];
  disabled?: boolean;
}

const TIPOS_PROGRAMAVEIS: TipoMedidaMotora[] = [
  'craniometria',
  'goniometria',
  'mfs',
  'desenvolvimento_motor',
  'perimetro_cefalico',
  'outra',
];

export const ReavaliacoesConduta: React.FC<ReavaliacoesCondutaProps> = ({
  medicoes,
  proximas,
  onMedicaoChange,
  onProximaChange,
  tiposComSecao,
  disabled,
}) => {
  const { medidas, dataSessao } = useMedidasEvolucao();
  const pendentesSemSecao = (medidas ?? []).filter(
    (m) => medidaPendente(m.estado) && !tiposComSecao.includes(m.tipo)
  );

  return (
    <div className="space-y-6">
      {pendentesSemSecao.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Medidas previstas para esta sessão</h4>
          {pendentesSemSecao.map((m) => (
            <MedicaoSessaoBloco
              key={m.tipo}
              tipo={m.tipo}
              valor={medicoes[m.tipo]}
              onChange={(v) => onMedicaoChange(m.tipo, v)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <h4 className="font-medium">Programar próxima reavaliação</h4>
          <p className="text-sm text-muted-foreground">
            Escolha a medida e a data. Ela vai aparecer na agenda antes da
            sessão daquela semana.
          </p>
        </div>
        {TIPOS_PROGRAMAVEIS.map((tipo) => {
          const medida = medidas?.find((m) => m.tipo === tipo);
          const prox = proximas[tipo];
          const ativo = !!prox;
          return (
            <div key={tipo} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {NOME_MEDIDA_MOTORA[tipo]}
                  </p>
                  {medida && (
                    <p className="text-xs text-muted-foreground">
                      {descreverEstado(medida)}
                      {medida.ultima_data
                        ? ` · último registro ${dataBR(medida.ultima_data)}`
                        : ''}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-pressed={ativo}
                  disabled={disabled}
                  onClick={() =>
                    onProximaChange(
                      tipo,
                      ativo
                        ? undefined
                        : { data: dataSessao ? somarDias(dataSessao, 28) : '' }
                    )
                  }
                  className={cn(
                    'rounded-full border-2 px-3 py-1 text-sm font-medium',
                    ativo
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {ativo ? 'Programada' : 'Programar'}
                </button>
              </div>
              {prox && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {SEMANAS.map((s) => {
                      const d = dataSessao ? somarDias(dataSessao, s * 7) : '';
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={disabled || !dataSessao}
                          onClick={() =>
                            onProximaChange(tipo, { ...prox, data: d })
                          }
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs',
                            prox.data === d
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground'
                          )}
                        >
                          Em {s} semanas
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="date"
                      aria-label={`Data da próxima ${NOME_MEDIDA_MOTORA[tipo]}`}
                      value={prox.data}
                      min={dataSessao ? somarDias(dataSessao, 1) : undefined}
                      onChange={(e) =>
                        onProximaChange(tipo, { ...prox, data: e.target.value })
                      }
                      disabled={disabled}
                    />
                    {tipo === 'outra' && (
                      <Input
                        value={prox.descricao ?? ''}
                        onChange={(e) =>
                          onProximaChange(tipo, {
                            ...prox,
                            descricao: e.target.value || undefined,
                          })
                        }
                        placeholder="Qual reavaliação"
                        disabled={disabled}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Comparação com a última medida registrada (mesmo protocolo de cálculo).
// Diferença pequena pode estar dentro da variação da própria medida: a tela
// mostra o número, não afirma melhora.

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const fmt = (n: number, casas = 1) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
const delta = (agora?: number, antes?: number, casas = 1, sufixo = '') => {
  if (agora === undefined || antes === undefined) return null;
  const d = agora - antes;
  const sinal = d > 0 ? '+' : d < 0 ? '−' : '±';
  return `${sinal}${fmt(Math.abs(d), casas)}${sufixo}`;
};

const AVISO_VARIACAO =
  'Diferenças pequenas podem estar dentro da variação da própria medida (técnica, cooperação da criança). Compare sempre com o mesmo método.';

export const ComparacaoCraniometria: React.FC<{
  atual: { cva_mm?: number; cvai_percentual?: number; ci_percentual?: number };
}> = ({ atual }) => {
  const { medidas } = useMedidasEvolucao();
  const ant = medidas?.find((m) => m.tipo === 'craniometria');
  const v = ant?.ultima_valores;
  if (!ant?.ultima_data || !v) return null;
  const linhas: [string, string | null, string | null][] = [
    [
      'CVA',
      num(v.cva_mm) !== undefined ? `${fmt(num(v.cva_mm)!)} mm` : null,
      delta(atual.cva_mm, num(v.cva_mm), 1, ' mm'),
    ],
    [
      'CVAI',
      num(v.cvai_percentual) !== undefined
        ? `${fmt(num(v.cvai_percentual)!)}%`
        : null,
      delta(atual.cvai_percentual, num(v.cvai_percentual), 1, ' p.p.'),
    ],
    [
      'CI',
      num(v.ci_percentual) !== undefined
        ? `${fmt(num(v.ci_percentual)!)}%`
        : null,
      delta(atual.ci_percentual, num(v.ci_percentual), 1, ' p.p.'),
    ],
  ];
  const visiveis = linhas.filter(([, antes]) => antes);
  if (visiveis.length === 0) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <p className="font-medium">Comparação com {dataBR(ant.ultima_data)}</p>
      <div className="grid grid-cols-3 gap-2">
        {visiveis.map(([rotulo, antes, dif]) => (
          <div key={rotulo}>
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p>
              {antes}
              {dif && <span className="ml-1 font-medium">({dif})</span>}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{AVISO_VARIACAO}</p>
    </div>
  );
};

export const ComparacaoGoniometria: React.FC<{
  atual: Record<string, unknown>;
}> = ({ atual }) => {
  const { medidas } = useMedidasEvolucao();
  const ant = medidas?.find((m) => m.tipo === 'goniometria');
  const v = ant?.ultima_valores;
  if (!ant?.ultima_data || !v) return null;
  const itens = [
    ['rotacao_passiva', 'Rotação passiva'],
    ['rotacao_ativa', 'Rotação ativa'],
    ['inclinacao_passiva', 'Inclinação passiva'],
    ['inclinacao_ativa', 'Inclinação ativa'],
  ] as const;
  const linhas = itens
    .map(([k, rotulo]) => {
      const d0 = num(v[`${k}_direita`]);
      const e0 = num(v[`${k}_esquerda`]);
      if (d0 === undefined && e0 === undefined) return null;
      const d1 = num(atual[`${k}_direita`]);
      const e1 = num(atual[`${k}_esquerda`]);
      const dif0 =
        d0 !== undefined && e0 !== undefined ? Math.abs(d0 - e0) : undefined;
      const dif1 =
        d1 !== undefined && e1 !== undefined ? Math.abs(d1 - e1) : undefined;
      return { rotulo, d0, e0, dif0, dif1, dDif: delta(dif1, dif0, 0, '°') };
    })
    .filter(Boolean) as {
    rotulo: string;
    d0?: number;
    e0?: number;
    dif0?: number;
    dif1?: number;
    dDif: string | null;
  }[];
  if (linhas.length === 0) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <p className="font-medium">Comparação com {dataBR(ant.ultima_data)}</p>
      <ul className="space-y-1">
        {linhas.map((l) => (
          <li key={l.rotulo}>
            <span className="text-muted-foreground">{l.rotulo}: </span>D{' '}
            {l.d0 ?? '—'}° / E {l.e0 ?? '—'}°
            {l.dif0 !== undefined && <> · diferença {l.dif0}°</>}
            {l.dDif && (
              <span className="ml-1 font-medium">
                (hoje {l.dDif} na diferença)
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{AVISO_VARIACAO}</p>
    </div>
  );
};
