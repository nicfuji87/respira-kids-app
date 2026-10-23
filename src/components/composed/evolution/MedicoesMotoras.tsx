// Medidas dentro da evolução motora:
// - MedicaoSessaoBloco: situação de UMA medida nesta sessão (prevista,
//   último registro) e o que a fisio fez: Medi hoje / Não medi hoje / Não
//   precisa mais. Sem escolha = "sem registro nesta evolução", que NÃO
//   afirma que a medida deixou de ser feita.
// - ReavaliacoesConduta: medidas previstas que não têm seção própria aberta
//   e "Próxima medição" (em 2, 4, 6 ou 8 semanas).
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
  INSTRUMENTOS_DESENVOLVIMENTO,
  medidaPendente,
  resultadoCompleto,
  somarDias,
} from '@/lib/motora-medidas';
import { MOTIVOS_NAO_MEDIU } from '@/lib/motora-catalogo';

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

const MOTIVOS_RAPIDOS = MOTIVOS_NAO_MEDIU;

const OPCOES: { valor: SituacaoMedicao; label: string }[] = [
  { valor: 'medido', label: 'Medi hoje' },
  { valor: 'nao_medido', label: 'Não medi hoje' },
  { valor: 'nao_precisa', label: 'Não precisa mais' },
];

export interface MedicaoSessaoBlocoProps {
  tipo: TipoMedidaMotora;
  valor: MedicaoSessao | undefined;
  onChange: (m: MedicaoSessao | undefined) => void;
  /** a seção já tem valores digitados para esta medida */
  temValores?: boolean;
  /** apaga os valores digitados (ao escolher não medi / não precisa mais) */
  onDescartarValores?: () => void;
  disabled?: boolean;
  /** campos da medida (só aparecem em "Medi hoje" ou se já tem valores) */
  children?: React.ReactNode;
}

const chipClasse = (sel: boolean) =>
  cn(
    'rounded-full border px-2.5 py-1 text-xs',
    sel
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-background text-muted-foreground'
  );

const MotivoCampo: React.FC<{
  motivo: string | undefined;
  onChange: (m: string | undefined) => void;
  disabled?: boolean;
}> = ({ motivo, onChange, disabled }) => (
  <div className="space-y-1.5">
    <Label className="text-sm">Motivo (opcional)</Label>
    <div className="flex flex-wrap gap-1.5">
      {MOTIVOS_RAPIDOS.map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => onChange(motivo === m ? undefined : m)}
          className={chipClasse(motivo === m)}
        >
          {m}
        </button>
      ))}
    </div>
    <Input
      value={motivo && !MOTIVOS_RAPIDOS.includes(motivo) ? motivo : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder="Outro motivo"
      disabled={disabled}
    />
  </div>
);

/** Resultado das medidas sem seção própria (MFS, perímetro, desenvolvimento, outra) */
const CamposResultado: React.FC<{
  tipo: TipoMedidaMotora;
  valores: Record<string, string | number>;
  onChange: (v: Record<string, string | number>) => void;
  disabled?: boolean;
}> = ({ tipo, valores, onChange, disabled }) => {
  const set = (k: string, v: string | number | undefined) => {
    const novo = { ...valores };
    if (v === undefined || v === '') delete novo[k];
    else novo[k] = v;
    onChange(novo);
  };
  const completo = resultadoCompleto(tipo, valores);

  if (tipo === 'mfs') {
    return (
      <div className="space-y-2">
        {(
          [
            ['mfs_direito', 'Lado direito'],
            ['mfs_esquerdo', 'Lado esquerdo'],
          ] as const
        ).map(([k, rotulo]) => (
          <div key={k} className="space-y-1">
            <Label className="text-sm">{rotulo} (0 a 5)</Label>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label={`MFS ${rotulo}`}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={valores[k] === n}
                  disabled={disabled}
                  onClick={() => set(k, valores[k] === n ? undefined : n)}
                  className={cn(
                    'h-9 w-9 rounded-lg border-2 text-sm font-medium',
                    valores[k] === n
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-background border-border text-muted-foreground'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!completo && (
          <p className="text-xs text-amber-700">
            Marque os dois lados para registrar a MFS.
          </p>
        )}
      </div>
    );
  }

  if (tipo === 'perimetro_cefalico') {
    return (
      <div className="space-y-1 sm:max-w-xs">
        <Label className="text-sm">Perímetro cefálico (cm)</Label>
        <Input
          type="number"
          step={0.1}
          min={0}
          value={valores.perimetro_cefalico_cm ?? ''}
          onChange={(e) =>
            set(
              'perimetro_cefalico_cm',
              e.target.value ? Number(e.target.value) : undefined
            )
          }
          disabled={disabled}
        />
      </div>
    );
  }

  if (tipo === 'desenvolvimento_motor') {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm">Instrumento ou procedimento usado</Label>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENTOS_DESENVOLVIMENTO.map((i) => (
              <button
                key={i.valor}
                type="button"
                disabled={disabled}
                onClick={() =>
                  set(
                    'instrumento',
                    valores.instrumento === i.valor ? undefined : i.valor
                  )
                }
                className={chipClasse(valores.instrumento === i.valor)}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        {valores.instrumento === 'outro' && (
          <Input
            value={valores.instrumento_outro ?? ''}
            onChange={(e) => set('instrumento_outro', e.target.value)}
            placeholder="Qual instrumento"
            disabled={disabled}
          />
        )}
        {valores.instrumento === 'aims' && (
          <div className="space-y-1 sm:max-w-xs">
            <Label className="text-sm">Percentil da AIMS</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={valores.percentil ?? ''}
              onChange={(e) =>
                set(
                  'percentil',
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              disabled={disabled}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-sm">Resultado (opcional)</Label>
          <Input
            value={valores.resultado ?? ''}
            onChange={(e) => set('resultado', e.target.value)}
            placeholder="Ex.: senta sem apoio, inicia engatinhar"
            disabled={disabled}
          />
        </div>
        {!completo && (
          <p className="text-xs text-amber-700">
            {valores.instrumento === 'aims'
              ? 'Informe o percentil: a AIMS só conta como feita com o resultado.'
              : 'Escolha o instrumento usado para registrar a reavaliação.'}
          </p>
        )}
      </div>
    );
  }

  // outra
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input
        value={valores.descricao ?? ''}
        onChange={(e) => set('descricao', e.target.value)}
        placeholder="O que foi reavaliado"
        disabled={disabled}
      />
      <Input
        value={valores.resultado ?? ''}
        onChange={(e) => set('resultado', e.target.value)}
        placeholder="Resultado (opcional)"
        disabled={disabled}
      />
    </div>
  );
};

export const MedicaoSessaoBloco: React.FC<MedicaoSessaoBlocoProps> = ({
  tipo,
  valor,
  onChange,
  temValores = false,
  onDescartarValores,
  disabled,
  children,
}) => {
  const { medidas } = useMedidasEvolucao();
  // Sem permissão (secretaria) ou sem dados: a evolução fica como antes
  if (medidas === null) return <>{children ?? null}</>;

  const medida = medidas.find((m) => m.tipo === tipo);
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
            : 'Nenhum registro anterior desta medida.'}
          {!situacao && ' · Sem registro nesta evolução.'}
        </p>

        <div
          className="grid grid-cols-3 gap-2"
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
                {op.label}
              </button>
            );
          })}
        </div>

        {/* Medi hoje, medida sem seção: o resultado fica aqui mesmo */}
        {valor?.situacao === 'medido' && !temCampos && (
          <CamposResultado
            tipo={tipo}
            valores={valor.valores ?? {}}
            onChange={(v) => atualizar({ valores: v })}
            disabled={disabled}
          />
        )}

        {valor?.situacao === 'nao_medido' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O lembrete continua e aparece de novo na próxima sessão.
            </p>
            <MotivoCampo
              motivo={valor.motivo}
              onChange={(m) => atualizar({ motivo: m })}
              disabled={disabled}
            />
          </div>
        )}

        {valor?.situacao === 'nao_precisa' && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Deixa de ser lembrada para esta criança. Para voltar, escolha uma
              data em &quot;Próxima medição&quot;, na conduta.
            </p>
            <Input
              value={valor.motivo ?? ''}
              onChange={(e) =>
                atualizar({ motivo: e.target.value || undefined })
              }
              placeholder="Por quê (opcional)"
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
  if (medidas === null) return null;

  const pendentesSemSecao = medidas.filter(
    (m) => medidaPendente(m.estado) && !tiposComSecao.includes(m.tipo)
  );

  return (
    <div className="border-t pt-6 space-y-6">
      <h3 className="text-base font-semibold">Medidas</h3>
      {pendentesSemSecao.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Previstas para esta sessão</h4>
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
          <h4 className="font-medium">Próxima medição</h4>
          <p className="text-sm text-muted-foreground">
            Opcional. A medida aparece na agenda na sessão daquela semana.
          </p>
        </div>
        <div className="rounded-lg border divide-y">
          {TIPOS_PROGRAMAVEIS.map((tipo) => {
            const medida = medidas.find((m) => m.tipo === tipo);
            const prox = proximas[tipo];
            const inativa =
              medida?.status === 'nao_aplicavel' ||
              medida?.status === 'suspensa';
            return (
              <div key={tipo} className="p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {NOME_MEDIDA_MOTORA[tipo]}
                    </p>
                    {medida && medida.estado !== 'sem_programacao' && (
                      <p className="text-xs text-muted-foreground">
                        {descreverEstado(medida)}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="radiogroup"
                    aria-label={`Próxima ${NOME_MEDIDA_MOTORA[tipo]}`}
                  >
                    {SEMANAS.map((sem) => {
                      const d = dataSessao
                        ? somarDias(dataSessao, sem * 7)
                        : '';
                      const sel = !!prox && prox.data === d;
                      return (
                        <button
                          key={sem}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          disabled={disabled || !dataSessao}
                          onClick={() =>
                            onProximaChange(
                              tipo,
                              sel ? undefined : { ...prox, data: d }
                            )
                          }
                          className={chipClasse(sel)}
                        >
                          {sem} sem
                        </button>
                      );
                    })}
                  </div>
                </div>
                {prox && (
                  <p className="text-xs text-muted-foreground">
                    Em {dataBR(prox.data)}
                    {inativa && ' · volta a ser lembrada ao salvar'}
                  </p>
                )}
                {prox && tipo === 'outra' && (
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
            );
          })}
        </div>
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
