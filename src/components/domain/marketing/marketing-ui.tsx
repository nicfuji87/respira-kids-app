// AI dev note: peças do painel de marketing. Regra do painel: indicador sem
// dado suficiente mostra "Indisponível" + o motivo, nunca zero nem estimativa.
// Gráficos de uma série só, na cor --serie-1 (validada p/ daltonismo e
// contraste na página de Relatórios); identidade nunca só pela cor.

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import {
  AMOSTRA_MIN_COBERTURA,
  AMOSTRA_MIN_PACIENTES,
  TRAFEGOS,
  TRAFEGOS_DETALHE,
  brl,
  num,
  rotuloCanal,
  type CustoStatus,
  type Indicador,
  type lerAmostra,
  type linhasCanal,
  type linhasTrafego,
} from '@/lib/marketing-atribuicao';

type Amostra = ReturnType<typeof lerAmostra>;
type LinhaCanal = ReturnType<typeof linhasCanal>[number];
type LinhaTrafego = ReturnType<typeof linhasTrafego>[number];

/** Valor de um indicador ou "Indisponível" com o motivo visível. */
export const ValorIndicador: React.FC<{
  ind: Indicador;
  formato: (v: number) => string;
  compacto?: boolean;
}> = ({ ind, formato, compacto }) => {
  if (ind.valor == null) {
    return (
      <span className="text-muted-foreground" title={ind.motivo}>
        {compacto ? '—' : 'Indisponível'}
      </span>
    );
  }
  return (
    <span title={ind.aviso}>
      {formato(ind.valor)}
      {ind.aviso && (
        <Clock
          className="ml-1 inline h-3.5 w-3.5 text-amarelo-pipa-ink"
          aria-label="em maturação"
        />
      )}
    </span>
  );
};

/** Célula de tabela: valor, ou traço com o motivo no title (acessível por leitor). */
export const CelulaIndicador: React.FC<{
  ind: Indicador;
  formato: (v: number) => string;
}> = ({ ind, formato }) =>
  ind.valor == null ? (
    <span
      className="text-muted-foreground"
      title={ind.motivo}
      aria-label={`indisponível: ${ind.motivo ?? ''}`}
    >
      —
    </span>
  ) : (
    <span title={ind.aviso}>
      {formato(ind.valor)}
      {ind.aviso && (
        <span className="ml-0.5 text-amarelo-pipa-ink" aria-label="parcial">
          *
        </span>
      )}
    </span>
  );

export const CartaoIndicador: React.FC<{
  rotulo: string;
  ind?: Indicador;
  formato?: (v: number) => string;
  valor?: React.ReactNode;
  detalhe?: React.ReactNode;
}> = ({ rotulo, ind, formato, valor, detalhe }) => (
  <div className="rounded-md border bg-card p-3">
    <div className="text-xs text-muted-foreground">{rotulo}</div>
    <div className="mt-1 text-2xl font-bold tabular-nums">
      {ind && formato ? <ValorIndicador ind={ind} formato={formato} /> : valor}
    </div>
    {ind?.valor == null && ind?.motivo ? (
      <div className="mt-1 text-xs text-muted-foreground">{ind.motivo}</div>
    ) : ind?.aviso ? (
      <div className="mt-1 text-xs text-amarelo-pipa-ink">{ind.aviso}</div>
    ) : detalhe ? (
      <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>
    ) : null}
  </div>
);

const SELO: Record<
  CustoStatus,
  {
    rotulo: string;
    variante: 'success' | 'warning' | 'attention' | 'muted';
    Icone: React.ElementType;
  }
> = {
  completo: {
    rotulo: 'Custo completo',
    variante: 'success',
    Icone: CheckCircle2,
  },
  desatualizado: {
    rotulo: 'Custo desatualizado',
    variante: 'warning',
    Icone: Clock,
  },
  sem_dados: { rotulo: 'Sem custo', variante: 'attention', Icone: XCircle },
  nao_se_aplica: { rotulo: 'Sem mídia', variante: 'muted', Icone: HelpCircle },
};

export const SeloCusto: React.FC<{ status: CustoStatus }> = ({ status }) => {
  const s = SELO[status];
  return (
    <Badge variant={s.variante} className="gap-1 whitespace-nowrap">
      <s.Icone className="h-3 w-3" aria-hidden />
      {s.rotulo}
    </Badge>
  );
};

export type Situacao = 'ok' | 'atencao' | 'problema' | 'neutro';
export const SeloSituacao: React.FC<{
  situacao: Situacao;
  children: React.ReactNode;
}> = ({ situacao, children }) => {
  const mapa = {
    ok: { v: 'success' as const, I: CheckCircle2 },
    atencao: { v: 'warning' as const, I: AlertTriangle },
    problema: { v: 'attention' as const, I: XCircle },
    neutro: { v: 'muted' as const, I: HelpCircle },
  }[situacao];
  return (
    <Badge variant={mapa.v} className="gap-1 whitespace-nowrap">
      <mapa.I className="h-3 w-3" aria-hidden />
      {children}
    </Badge>
  );
};

export const Aviso: React.FC<{
  children: React.ReactNode;
  tom?: 'atencao' | 'info';
}> = ({ children, tom = 'info' }) => (
  <div
    className={cn(
      'flex items-start gap-2 rounded-md border p-3 text-sm',
      tom === 'atencao'
        ? 'border-amarelo-pipa/60 bg-amarelo-pipa/10'
        : 'bg-muted/40'
    )}
  >
    {tom === 'atencao' ? (
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amarelo-pipa-ink" />
    ) : (
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    )}
    <div className="text-muted-foreground">{children}</div>
  </div>
);

/**
 * Tamanho e cobertura da amostra. Fica SEMPRE visível (inclusive depois que
 * os custos chegarem): enquanto não houver pacientes e origem suficientes, a
 * comparação entre canais não é conclusiva.
 */
export const AvisoAmostra: React.FC<{ a: Amostra; semMidia?: boolean }> = ({
  a,
  semMidia,
}) => (
  <Aviso tom={a.suficiente ? 'info' : 'atencao'}>
    {!a.suficiente && (
      <strong className="text-foreground">
        {semMidia
          ? 'Amostra ainda pequena para comparar origens.'
          : 'Amostra ainda pequena para decidir investimento.'}{' '}
      </strong>
    )}
    {a.novos} paciente{a.novos === 1 ? '' : 's'} novo
    {a.novos === 1 ? '' : 's'} no período ({a.ligados} ligado
    {a.ligados === 1 ? '' : 's'} a uma conversa) e {a.comOrigem} de{' '}
    {a.comerciais} conversas com intenção de contratar com origem identificada (
    {pctAmostra(a.coberturaOrigem)}).{' '}
    {a.suficiente
      ? 'Amostra dentro do mínimo do painel.'
      : `A comparação entre canais${semMidia ? '' : ' e campanhas'} só passa a ser conclusiva a partir de ${AMOSTRA_MIN_PACIENTES} pacientes novos e ${Math.round(AMOSTRA_MIN_COBERTURA * 100)}% de origem identificada.`}
  </Aviso>
);

/** Enquanto não há campanha no ar: tudo é orgânico e vira linha de base. */
export const AvisoSemMidia: React.FC = () => (
  <Aviso>
    <strong className="text-foreground">
      Nenhuma campanha paga no período: todo o movimento é orgânico.{' '}
    </strong>
    Estes números são a linha de base. Quando o Google Ads começar, é com eles
    que se mede o que a campanha acrescentou (e não só o que ela recebeu de
    crédito). Investimento, CAC e ROAS aparecem quando houver mídia paga.
  </Aviso>
);

/**
 * Origens agrupadas por tipo de tráfego: uma linha-resumo por grupo (pago,
 * orgânico identificado, sem origem) e os canais dentro dele.
 */
export const TabelaOrigens: React.FC<{
  grupos: LinhaTrafego[];
  canais: LinhaCanal[];
  ocultarPagoVazio?: boolean;
}> = ({ grupos, canais, ocultarPagoVazio }) => {
  // Grupo vazio some; a mídia paga vazia fica (gasto sem resultado precisa
  // aparecer), a não ser que não haja mídia nenhuma no período.
  const visiveis = grupos.filter(
    (g) =>
      g.conversas + g.novos > 0 || (g.trafego === 'pago' && !ocultarPagoVazio)
  );
  const cel = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {[
              'Origem',
              'Conversas',
              'Com intenção',
              'Agendaram',
              'Pacientes novos',
              'Receita até hoje',
            ].map((h, i) => (
              <th
                key={h}
                className={cn(
                  'whitespace-nowrap px-3 py-2 font-medium',
                  i > 0 && 'text-right'
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((g) => (
            <React.Fragment key={g.trafego}>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2">
                  <div>{TRAFEGOS[g.trafego]}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {TRAFEGOS_DETALHE[g.trafego]}
                  </div>
                </td>
                <td className={cel}>{num(g.conversas)}</td>
                <td className={cel}>{num(g.comIntencao)}</td>
                <td className={cel}>{num(g.agendaram)}</td>
                <td className={cel}>{num(g.novos)}</td>
                <td className={cel}>{brl(g.receitaTotal)}</td>
              </tr>
              {canais
                .filter((c) => c.trafego === g.trafego)
                .filter(() => g.trafego !== 'sem_origem' || g.canais.length > 1)
                .map((c) => (
                  <tr key={c.canal} className="border-t">
                    <td className="py-2 pl-7 pr-3 text-muted-foreground">
                      {rotuloCanal(c.canal)}
                    </td>
                    <td className={cel}>{num(c.conversas)}</td>
                    <td className={cel}>{num(c.comIntencao)}</td>
                    <td className={cel}>{num(c.agendaram)}</td>
                    <td className={cel}>{num(c.novos)}</td>
                    <td className={cel}>{brl(c.receitaTotal)}</td>
                  </tr>
                ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const pctAmostra = (v: number | null) =>
  v == null ? '—' : `${Math.round(v * 100)}%`;

const COR = 'hsl(var(--serie-1))';

const DicaGrafico: React.FC<{
  active?: boolean;
  payload?: { payload: { rotulo: string; valor: number; detalhe?: string } }[];
}> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-foreground">{p.rotulo}</div>
      <div className="tabular-nums text-foreground">
        {p.valor.toLocaleString('pt-BR')}
      </div>
      {p.detalhe && <div className="text-muted-foreground">{p.detalhe}</div>}
    </div>
  );
};

/** Barras horizontais de uma série (funil). Valor escrito na ponta de cada barra. */
export const BarrasHorizontais: React.FC<{
  dados: { rotulo: string; valor: number; detalhe?: string }[];
  titulo: string;
}> = ({ dados, titulo }) => (
  <figure aria-label={titulo} className="w-full">
    <ResponsiveContainer width="100%" height={Math.max(160, dados.length * 44)}>
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
        barCategoryGap={6}
      >
        <CartesianGrid
          horizontal={false}
          strokeDasharray="2 4"
          stroke="hsl(var(--border))"
        />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={170}
          tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<DicaGrafico />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
        />
        <Bar dataKey="valor" fill={COR} radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList
            dataKey="valor"
            position="right"
            style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </figure>
);

/** Colunas por mês, uma série. */
export const ColunasMensais: React.FC<{
  dados: { rotulo: string; valor: number; detalhe?: string }[];
  titulo: string;
}> = ({ dados, titulo }) => (
  <figure aria-label={titulo} className="w-full">
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={dados}
        margin={{ left: 0, right: 8, top: 16, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="2 4"
          stroke="hsl(var(--border))"
        />
        <XAxis
          dataKey="rotulo"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          width={28}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<DicaGrafico />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
        />
        <Bar dataKey="valor" fill={COR} radius={[4, 4, 0, 0]} maxBarSize={36}>
          <LabelList
            dataKey="valor"
            position="top"
            style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </figure>
);
