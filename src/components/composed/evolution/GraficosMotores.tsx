// Gráficos longitudinais do plano motor. Um gráfico por indicador (nunca
// misturando torcicolo, crânio e desenvolvimento, nunca dois eixos). Cada
// ponto mostra a data e a origem (evolução ou avaliação). Só números
// registrados: o gráfico não inventa nem interpola valores.

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  HABILIDADE_POR_ID,
  ROTULO_ESTADO,
  UNIDADE_METRICA,
  type MetricaHabilidade,
} from '@/lib/motora-catalogo';
import {
  chaveRegistro,
  dataCurta,
  fmtValor,
  nomeRegistro,
  rotuloMetrica,
  situacaoObjetivo,
  type HistoricoMotor,
  type ObjetivoMotor,
} from '@/lib/motora-plano';
import { chipClasse } from './estilos-motora';

// Paleta categórica (ordem fixa): 1 azul, 2 laranja
const COR = ['#2a78d6', '#eb6834'];
const FONTE: Record<string, string> = {
  evolucao: 'evolução',
  avaliacao: 'avaliação',
};

export interface PontoGrafico {
  data: string;
  valor: number;
  fonte?: string;
  extra?: string;
}

interface Serie {
  nome: string;
  pontos: PontoGrafico[];
}

const ehNumero = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const GraficoLinha: React.FC<{
  titulo: string;
  unidade: string;
  series: Serie[];
  meta?: number | null;
  /** contagens e escores (MFS): eixo só com inteiros */
  inteiro?: boolean;
}> = ({ titulo, unidade, series, meta, inteiro = false }) => {
  const [tabela, setTabela] = useState(false);
  const linhas = useMemo(() => {
    const datas = [
      ...new Set(series.flatMap((s) => s.pontos.map((p) => p.data))),
    ].sort();
    return datas.map((d) => {
      const row: Record<string, string | number | undefined> = {
        data: d,
        rotulo: dataCurta(d).slice(0, 5) + '/' + d.slice(2, 4),
      };
      series.forEach((s, i) => {
        const p = s.pontos.find((x) => x.data === d);
        if (p) {
          row[`s${i}`] = p.valor;
          row[`f${i}`] = [p.fonte ? (FONTE[p.fonte] ?? p.fonte) : '', p.extra]
            .filter(Boolean)
            .join(' · ');
        }
      });
      return row;
    });
  }, [series]);
  if (linhas.length === 0) return null;
  const multi = series.length > 1;

  return (
    <figure className="rounded-lg border p-3 space-y-2 bg-background">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {titulo}
          {unidade ? ` (${unidade})` : ''}
        </span>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setTabela((t) => !t)}
        >
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </figcaption>
      {tabela ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal py-1 pr-2">Data</th>
                {series.map((s) => (
                  <th key={s.nome} className="text-right font-normal py-1 px-2">
                    {s.nome}
                  </th>
                ))}
                <th className="text-left font-normal py-1 pl-2">Origem</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={String(l.data)} className="border-t">
                  <td className="py-1 pr-2">{dataCurta(String(l.data))}</td>
                  {series.map((s, i) => (
                    <td
                      key={s.nome}
                      className="text-right py-1 px-2 tabular-nums"
                    >
                      {ehNumero(l[`s${i}`])
                        ? fmtValor(l[`s${i}`] as number, unidade)
                        : '—'}
                    </td>
                  ))}
                  <td className="py-1 pl-2 text-muted-foreground">
                    {series.map((_, i) => l[`f${i}`]).filter(Boolean)[0] ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={linhas}
              margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
            >
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="0"
                vertical={false}
              />
              <XAxis
                dataKey="rotulo"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={!inteiro}
              />
              <Tooltip
                cursor={{
                  stroke: 'hsl(var(--muted-foreground))',
                  strokeWidth: 1,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as Record<
                    string,
                    string | number
                  >;
                  return (
                    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm space-y-0.5">
                      <p className="font-medium">
                        {dataCurta(String(row.data))}
                      </p>
                      {series.map((s, i) =>
                        ehNumero(row[`s${i}`]) ? (
                          <p key={s.nome}>
                            {multi ? `${s.nome}: ` : ''}
                            <strong>
                              {fmtValor(row[`s${i}`] as number, unidade)}
                            </strong>
                            {row[`f${i}`] ? (
                              <span className="text-muted-foreground">
                                {' '}
                                · {row[`f${i}`]}
                              </span>
                            ) : null}
                          </p>
                        ) : null
                      )}
                    </div>
                  );
                }}
              />
              {multi && (
                <Legend
                  verticalAlign="top"
                  height={24}
                  iconType="plainline"
                  formatter={(v: string) => (
                    <span style={{ color: 'hsl(var(--foreground))' }}>{v}</span>
                  )}
                  wrapperStyle={{
                    fontSize: 12,
                    color: 'hsl(var(--foreground))',
                  }}
                />
              )}
              {ehNumero(meta) && (
                <ReferenceLine
                  y={meta}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{
                    value: `Meta ${fmtValor(meta, unidade)}`,
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'hsl(var(--muted-foreground))',
                  }}
                />
              )}
              {series.map((s, i) => (
                <Line
                  key={s.nome}
                  type="linear"
                  dataKey={`s${i}`}
                  name={s.nome}
                  stroke={COR[i % COR.length]}
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
};

// ------------------------------------------------------------------ grupos

type Grupo = 'objetivos' | 'torcicolo' | 'cranio' | 'desenvolvimento';

const num = (v: unknown) => (ehNumero(v) ? v : undefined);

function serieDeMedida(
  h: HistoricoMotor,
  tipo: string,
  valor: (v: Record<string, unknown>) => number | undefined,
  extra?: (v: Record<string, unknown>) => string | undefined
): PontoGrafico[] {
  return h.medidas
    .filter((m) => m.tipo === tipo && m.valores)
    .flatMap((m) => {
      const v = valor(m.valores!);
      return ehNumero(v)
        ? [
            {
              data: m.data,
              valor: v,
              fonte: m.fonte,
              extra: extra?.(m.valores!),
            },
          ]
        : [];
    });
}

// Protocolo de cálculo gravado na craniometria (o mesmo protocolo deve ser
// comparado entre si)
const PROTOCOLO: Record<string, string> = {
  'cvai-maior-diagonal-choa_ci-75-85-90-100_v1': 'protocolo CHOA v1',
};

export const GraficosMotores: React.FC<{
  historico: HistoricoMotor;
  objetivos: ObjetivoMotor[];
}> = ({ historico: h, objetivos }) => {
  const objsNumericos = objetivos
    .map((o) => ({ o, s: situacaoObjetivo(o, h) }))
    .filter((x) => x.s.info?.numerico && x.s.serie.length > 0);

  const gonio = (k: string) => (v: Record<string, unknown>) => num(v[k]);
  const rotPassD = serieDeMedida(
    h,
    'goniometria',
    gonio('rotacao_passiva_direita')
  );
  const rotPassE = serieDeMedida(
    h,
    'goniometria',
    gonio('rotacao_passiva_esquerda')
  );
  const rotAtD = serieDeMedida(
    h,
    'goniometria',
    gonio('rotacao_ativa_direita')
  );
  const rotAtE = serieDeMedida(
    h,
    'goniometria',
    gonio('rotacao_ativa_esquerda')
  );
  const difPass = serieDeMedida(h, 'goniometria', (v) =>
    ehNumero(v.rotacao_passiva_direita) && ehNumero(v.rotacao_passiva_esquerda)
      ? Math.abs(v.rotacao_passiva_direita - v.rotacao_passiva_esquerda)
      : undefined
  );
  const mfsD = serieDeMedida(h, 'mfs', gonio('mfs_direito'));
  const mfsE = serieDeMedida(h, 'mfs', gonio('mfs_esquerdo'));
  const prot = (v: Record<string, unknown>) =>
    typeof v.protocolo === 'string'
      ? (PROTOCOLO[v.protocolo] ?? v.protocolo)
      : undefined;
  const cva = serieDeMedida(h, 'craniometria', gonio('cva_mm'), prot);
  const cvai = serieDeMedida(h, 'craniometria', gonio('cvai_percentual'), prot);
  const ci = serieDeMedida(h, 'craniometria', gonio('ci_percentual'), prot);

  // Desenvolvimento: uma série por habilidade (e lado) e métrica registrada
  const seriesHab = useMemo(() => {
    const mapa = new Map<
      string,
      {
        titulo: string;
        unidade: string;
        inteiro: boolean;
        series: Map<string, PontoGrafico[]>;
      }
    >();
    for (const ev of [...h.evolucoes].sort((a, b) =>
      a.data.localeCompare(b.data)
    )) {
      for (const r of ev.habilidades || []) {
        for (const [m, v] of Object.entries(r.metricas || {}) as [
          MetricaHabilidade,
          number,
        ][]) {
          if (!ehNumero(v)) continue;
          const contagem = m === 'tentativas' || m === 'sucessos';
          const chave = `${chaveRegistro(r)}#${contagem ? 'contagem' : m}`;
          if (!mapa.has(chave))
            mapa.set(chave, {
              titulo: contagem
                ? `${nomeRegistro(r)}: tentativas e execuções`
                : `${nomeRegistro(r)}: ${rotuloMetrica(r.habilidade, m).toLowerCase()}`,
              unidade: UNIDADE_METRICA[m],
              inteiro: contagem || m === 'passos',
              series: new Map(),
            });
          const g = mapa.get(chave)!;
          const nome = contagem
            ? m === 'tentativas'
              ? 'Tentativas'
              : 'Bem-sucedidas'
            : rotuloMetrica(r.habilidade, m);
          if (!g.series.has(nome)) g.series.set(nome, []);
          g.series
            .get(nome)!
            .push({ data: ev.data, valor: v, fonte: 'evolucao' });
        }
      }
    }
    return [...mapa.values()].map((g) => ({
      ...g,
      // ordem fixa: tentativas antes das bem-sucedidas
      series: [...g.series.entries()]
        .sort(([a], [b]) =>
          a === 'Tentativas' ? -1 : b === 'Tentativas' ? 1 : 0
        )
        .map(([nome, pontos]) => ({ nome, pontos })),
    }));
  }, [h.evolucoes]);

  // Linha do tempo dos estados (últimas 6 sessões com registro)
  const linhaTempo = useMemo(() => {
    const evs = [...h.evolucoes]
      .filter((e) =>
        (e.habilidades || []).some((r) => r.estado !== 'nao_observado')
      )
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(-6);
    const chaves = new Map<string, string>();
    for (const e of evs)
      for (const r of e.habilidades || [])
        if (r.estado !== 'nao_observado' && HABILIDADE_POR_ID[r.habilidade])
          chaves.set(chaveRegistro(r), nomeRegistro(r));
    return { evs, chaves: [...chaves.entries()] };
  }, [h.evolucoes]);

  const disponiveis: { id: Grupo; nome: string; tem: boolean }[] = [
    { id: 'objetivos', nome: 'Objetivos', tem: objsNumericos.length > 0 },
    {
      id: 'torcicolo',
      nome: 'Torcicolo',
      tem:
        rotPassD.length +
          rotPassE.length +
          rotAtD.length +
          rotAtE.length +
          mfsD.length >
        0,
    },
    {
      id: 'cranio',
      nome: 'Assimetria craniana',
      tem: cva.length + cvai.length + ci.length > 0,
    },
    {
      id: 'desenvolvimento',
      nome: 'Desenvolvimento motor',
      tem: seriesHab.length > 0 || linhaTempo.chaves.length > 0,
    },
  ];
  const comDados = disponiveis.filter((g) => g.tem);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const atual =
    grupo && comDados.some((g) => g.id === grupo) ? grupo : comDados[0]?.id;

  if (comDados.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há medidas nem habilidades com números registrados para
        mostrar em gráfico.
      </p>
    );

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Grupo de indicadores"
      >
        {comDados.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={atual === g.id}
            onClick={() => setGrupo(g.id)}
            className={chipClasse(atual === g.id)}
          >
            {g.nome}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {atual === 'objetivos' &&
          objsNumericos.map(({ o, s }) => (
            <GraficoLinha
              key={o.id}
              titulo={o.descricao}
              unidade={s.info!.unidade}
              series={[{ nome: s.info!.rotulo, pontos: s.serie }]}
              meta={o.meta}
            />
          ))}

        {atual === 'torcicolo' && (
          <>
            <GraficoLinha
              titulo="Rotação cervical passiva"
              unidade="°"
              series={[
                { nome: 'Direita', pontos: rotPassD },
                { nome: 'Esquerda', pontos: rotPassE },
              ].filter((x) => x.pontos.length)}
            />
            <GraficoLinha
              titulo="Diferença de rotação passiva (D × E)"
              unidade="°"
              series={[{ nome: 'Diferença', pontos: difPass }]}
            />
            <GraficoLinha
              titulo="Rotação cervical ativa"
              unidade="°"
              series={[
                { nome: 'Direita', pontos: rotAtD },
                { nome: 'Esquerda', pontos: rotAtE },
              ].filter((x) => x.pontos.length)}
            />
            <GraficoLinha
              titulo="MFS"
              unidade=""
              series={[
                { nome: 'Direita', pontos: mfsD },
                { nome: 'Esquerda', pontos: mfsE },
              ].filter((x) => x.pontos.length)}
              inteiro
            />
          </>
        )}

        {atual === 'cranio' && (
          <>
            <GraficoLinha
              titulo="CVAI"
              unidade="%"
              series={[{ nome: 'CVAI', pontos: cvai }]}
            />
            <GraficoLinha
              titulo="CVA"
              unidade="mm"
              series={[{ nome: 'CVA', pontos: cva }]}
            />
            <GraficoLinha
              titulo="Índice cefálico (CI)"
              unidade="%"
              series={[{ nome: 'CI', pontos: ci }]}
            />
          </>
        )}

        {atual === 'desenvolvimento' &&
          seriesHab.map((s) => (
            <GraficoLinha
              key={s.titulo}
              titulo={s.titulo}
              unidade={s.unidade}
              series={s.series}
              inteiro={s.inteiro}
            />
          ))}
      </div>

      {atual === 'desenvolvimento' && linhaTempo.chaves.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2 overflow-x-auto">
          <p className="text-sm font-medium">
            Habilidades ao longo das sessões
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal py-1 pr-2">Habilidade</th>
                {linhaTempo.evs.map((e) => (
                  <th
                    key={e.agendamento_id}
                    className="text-left font-normal py-1 px-2 whitespace-nowrap"
                  >
                    {dataCurta(e.data).slice(0, 5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhaTempo.chaves.map(([chave, nome]) => (
                <tr key={chave} className="border-t align-top">
                  <td className="py-1 pr-2">{nome}</td>
                  {linhaTempo.evs.map((e) => {
                    const r = (e.habilidades || []).find(
                      (x) => chaveRegistro(x) === chave
                    );
                    return (
                      <td
                        key={e.agendamento_id}
                        className="py-1 px-2 whitespace-nowrap"
                      >
                        {r && r.estado !== 'nao_observado'
                          ? ROTULO_ESTADO[r.estado]
                          : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Estados descrevem o desempenho observado; não são pontuação de
            desenvolvimento.
          </p>
        </div>
      )}
    </div>
  );
};
