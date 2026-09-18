// AI dev note: aba "Relatórios" (tradicionais) — o que aconteceu no período.
// Atendimentos por mês (respiratória x motora), por profissional (inclui
// evolução), por serviço e cancelamentos/faltas. Tudo exportável em CSV.

import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Label } from '@/components/primitives/label';
import {
  addMeses,
  brl,
  num,
  relatorioMensal,
  relatorioPorProfissional,
  relatorioPorServico,
  rotuloMes,
  type Dataset,
  type LinhaMensal,
  type LinhaProfissional,
  type LinhaServico,
} from '@/lib/relatorios-analise';
import {
  Indicador,
  SecaoRelatorio,
  TabelaRelatorio,
  type Coluna,
} from './relatorios-ui';

const configSessoes = {
  respiratoria: { label: 'Respiratória', color: 'hsl(var(--serie-1))' },
  motora: { label: 'Motora', color: 'hsl(var(--serie-2))' },
} satisfies ChartConfig;

type Periodo = '3m' | '6m' | '12m' | 'ano' | 'anoPassado';

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'ano', label: 'Este ano' },
  { key: 'anoPassado', label: 'Ano passado' },
];

const intervalo = (p: Periodo, mesAtual: string): [string, string] => {
  const ano = Number(mesAtual.slice(0, 4));
  switch (p) {
    case '3m':
      return [addMeses(mesAtual, -2), mesAtual];
    case '6m':
      return [addMeses(mesAtual, -5), mesAtual];
    case '12m':
      return [addMeses(mesAtual, -11), mesAtual];
    case 'ano':
      return [`${ano}-01`, mesAtual];
    case 'anoPassado':
      return [`${ano - 1}-01`, `${ano - 1}-12`];
  }
};

const pctFmt = (v: number) => `${num(v, 0)}%`;

export const RelatoriosTradicionais: React.FC<{ ds: Dataset }> = ({ ds }) => {
  const [periodo, setPeriodo] = useState<Periodo>('6m');
  const [de, ate] = intervalo(periodo, ds.mesAtual);

  const mensal = useMemo(() => relatorioMensal(ds, de, ate), [ds, de, ate]);
  const profissionais = useMemo(
    () => relatorioPorProfissional(ds, de, ate),
    [ds, de, ate]
  );
  const servicos = useMemo(
    () => relatorioPorServico(ds, de, ate),
    [ds, de, ate]
  );

  const tot = mensal.reduce(
    (a, l) => ({
      realizadas: a.realizadas + l.realizadas,
      receita: a.receita + l.receita,
      novos: a.novos + l.novos,
      retornos: a.retornos + l.retornos,
      faltas: a.faltas + l.faltas,
      cancelamentos: a.cancelamentos + l.cancelamentos,
    }),
    {
      realizadas: 0,
      receita: 0,
      novos: 0,
      retornos: 0,
      faltas: 0,
      cancelamentos: 0,
    }
  );
  const pacientesUnicos = useMemo(() => {
    const s = new Set<number>();
    for (const x of ds.sessoes)
      if (x.realizada && x.mes >= de && x.mes <= ate) s.add(x.paciente);
    return s.size;
  }, [ds, de, ate]);
  const mesParcial = ate === ds.mesAtual;

  const colMensal: Coluna<LinhaMensal>[] = [
    { chave: 'mes', titulo: 'Mês', formato: (v) => rotuloMes(String(v)) },
    { chave: 'realizadas', titulo: 'Sessões', alinhar: 'direita' },
    { chave: 'respiratoria', titulo: 'Respiratória', alinhar: 'direita' },
    { chave: 'motora', titulo: 'Motora', alinhar: 'direita' },
    { chave: 'pacientes', titulo: 'Pacientes', alinhar: 'direita' },
    { chave: 'novos', titulo: 'Novos', alinhar: 'direita' },
    { chave: 'retornos', titulo: 'Retornos (60+ dias)', alinhar: 'direita' },
    {
      chave: 'receita',
      titulo: 'Receita',
      alinhar: 'direita',
      formato: (v) => brl(Number(v)),
    },
    {
      chave: 'ticketMedio',
      titulo: 'Ticket médio',
      alinhar: 'direita',
      formato: (v) => brl(Number(v)),
    },
  ];

  const colProf: Coluna<LinhaProfissional>[] = [
    { chave: 'profissional', titulo: 'Profissional' },
    { chave: 'realizadas', titulo: 'Sessões', alinhar: 'direita' },
    { chave: 'pacientes', titulo: 'Pacientes', alinhar: 'direita' },
    {
      chave: 'receita',
      titulo: 'Receita',
      alinhar: 'direita',
      formato: (v) => brl(Number(v)),
    },
    {
      chave: 'comEvolucao',
      titulo: 'Com evolução',
      alinhar: 'direita',
      formato: (v) => pctFmt(Number(v)),
    },
    {
      chave: 'em24h',
      titulo: 'Evolução em 24h',
      alinhar: 'direita',
      formato: (v) => pctFmt(Number(v)),
    },
    {
      chave: 'medianaHorasEvolucao',
      titulo: 'Tempo típico até evoluir',
      alinhar: 'direita',
      formato: (v) =>
        v == null
          ? '—'
          : Number(v) < 24
            ? `${num(Number(v), 0)} h`
            : `${num(Number(v) / 24, 1)} dias`,
    },
  ];

  const colServ: Coluna<LinhaServico>[] = [
    { chave: 'servico', titulo: 'Serviço' },
    { chave: 'realizadas', titulo: 'Sessões', alinhar: 'direita' },
    {
      chave: 'participacao',
      titulo: '% das sessões',
      alinhar: 'direita',
      formato: (v) => pctFmt(Number(v)),
    },
    {
      chave: 'receita',
      titulo: 'Receita',
      alinhar: 'direita',
      formato: (v) => brl(Number(v)),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-xs">Período</Label>
          <Select
            value={periodo}
            onValueChange={(v) => setPeriodo(v as Periodo)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          {rotuloMes(de)} a {rotuloMes(ate)}
          {mesParcial && ' (mês atual ainda em andamento)'}. Sessão realizada =
          não cancelada, não reagendada e sem falta.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Indicador rotulo="Sessões realizadas" valor={num(tot.realizadas)} />
        <Indicador
          rotulo="Receita (valor das sessões)"
          valor={brl(tot.receita)}
        />
        <Indicador rotulo="Pacientes atendidos" valor={num(pacientesUnicos)} />
        <Indicador
          rotulo="Pacientes novos"
          valor={num(tot.novos)}
          detalhe={`${num(tot.retornos)} retornos de pacientes parados`}
        />
        <Indicador
          rotulo="Ticket médio"
          valor={brl(tot.realizadas ? tot.receita / tot.realizadas : 0)}
        />
      </div>

      <SecaoRelatorio
        titulo="Atendimentos por mês"
        descricao="Sessões realizadas, separadas entre respiratória e motora."
        csv={{
          nome: `atendimentos-${de}-a-${ate}`,
          linhas: mensal,
          colunas: colMensal,
        }}
      >
        <ChartContainer
          config={configSessoes}
          className="h-[260px] w-full aspect-auto"
        >
          <BarChart
            data={mensal.map((l) => ({ ...l, rotulo: rotuloMes(l.mes) }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="respiratoria"
              stackId="s"
              fill="var(--color-respiratoria)"
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
            <Bar
              dataKey="motora"
              stackId="s"
              fill="var(--color-motora)"
              radius={[4, 4, 0, 0]}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
          </BarChart>
        </ChartContainer>
        <TabelaRelatorio
          linhas={mensal}
          colunas={colMensal}
          rodape={{
            mes: 'Total',
            realizadas: num(tot.realizadas),
            novos: num(tot.novos),
            retornos: num(tot.retornos),
            receita: brl(tot.receita),
          }}
        />
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Por profissional"
        descricao="Evolução conta só sessões de até ontem (a de hoje ainda pode ser escrita)."
        csv={{
          nome: `profissionais-${de}-a-${ate}`,
          linhas: profissionais,
          colunas: colProf,
        }}
      >
        <TabelaRelatorio linhas={profissionais} colunas={colProf} />
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Por serviço"
        csv={{
          nome: `servicos-${de}-a-${ate}`,
          linhas: servicos,
          colunas: colServ,
        }}
      >
        <TabelaRelatorio linhas={servicos} colunas={colServ} />
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Cancelamentos e faltas"
        descricao="Falta quase nunca é marcada no sistema; o número abaixo provavelmente está menor que a realidade."
        csv={{
          nome: `cancelamentos-${de}-a-${ate}`,
          linhas: mensal,
          colunas: [
            { chave: 'mes', titulo: 'Mês' },
            { chave: 'cancelamentos', titulo: 'Cancelamentos' },
            { chave: 'faltas', titulo: 'Faltas' },
          ],
        }}
      >
        <TabelaRelatorio
          linhas={mensal}
          colunas={[
            {
              chave: 'mes',
              titulo: 'Mês',
              formato: (v) => rotuloMes(String(v)),
            },
            { chave: 'realizadas', titulo: 'Realizadas', alinhar: 'direita' },
            {
              chave: 'cancelamentos',
              titulo: 'Cancelamentos',
              alinhar: 'direita',
            },
            {
              chave: 'faltas',
              titulo: 'Faltas marcadas',
              alinhar: 'direita',
            },
          ]}
          rodape={{
            mes: 'Total',
            realizadas: num(tot.realizadas),
            cancelamentos: num(tot.cancelamentos),
            faltas: num(tot.faltas),
          }}
        />
      </SecaoRelatorio>
    </div>
  );
};
