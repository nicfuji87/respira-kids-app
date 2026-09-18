// AI dev note: aba "Insights estratégicos" — leituras que orientam decisão
// (as mesmas que embasaram as metas de set/2026). Cada card: número em
// destaque → o que quer dizer → o que fazer. Os textos usam os números do
// momento; as regras de negócio (60 dias, 30 dias, 90 dias) são as das metas.

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  addMeses,
  brl,
  campanhaVsNatural,
  evolucoesMensal,
  motoraParaRespiratoria,
  nomeMes,
  num,
  poolParadoAtual,
  qualidadeFaltas,
  relatorioPorProfissional,
  retencaoPrimeiraSessao,
  retornoMensal,
  retornoPorIdade,
  rotuloMes,
  sazonalidadeRetorno,
  valorDeUmRetorno,
  type Dataset,
} from '@/lib/relatorios-analise';
import { CardInsight, Indicador, TabelaRelatorio } from './relatorios-ui';

const serie1 = 'hsl(var(--serie-1))';
const serie2 = 'hsl(var(--serie-2))';

const listaMeses = (ms: number[]) => {
  const nomes = ms.map(nomeMes);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
};

export const InsightsEstrategicos: React.FC<{ ds: Dataset }> = ({ ds }) => {
  const ultimoFechado = addMeses(ds.mesAtual, -1);

  const pool = useMemo(() => poolParadoAtual(ds), [ds]);
  const poolSerie = useMemo(
    () => retornoMensal(ds, addMeses(ds.mesAtual, -17), ds.mesAtual),
    [ds]
  );
  const saz = useMemo(
    () =>
      sazonalidadeRetorno(
        retornoMensal(ds, addMeses(ultimoFechado, -35), ultimoFechado)
      ),
    [ds, ultimoFechado]
  );
  const valor = useMemo(() => valorDeUmRetorno(ds), [ds]);
  const motora = useMemo(() => motoraParaRespiratoria(ds), [ds]);
  const idade = useMemo(() => retornoPorIdade(ds), [ds]);
  const campanha = useMemo(() => campanhaVsNatural(ds, 6), [ds]);
  const retencao = useMemo(() => retencaoPrimeiraSessao(ds, 12), [ds]);
  const evol = useMemo(() => evolucoesMensal(ds, 6), [ds]);
  const evolProf = useMemo(
    () => relatorioPorProfissional(ds, addMeses(ds.mesAtual, -1), ds.mesAtual),
    [ds]
  );
  const faltas = useMemo(() => qualidadeFaltas(ds, 12), [ds]);

  const poolHaUmAno = poolSerie[Math.max(0, poolSerie.length - 13)]?.pool ?? 0;
  const retornoNaturalMes = (pool.total60a365 * saz.mediaGeral) / 100;
  const contatosMes = 150;
  const naturaisEm150 = (contatosMes * saz.mediaGeral) / 100;

  const bebe = idade.find((x) => x.faixa === 'Menos de 1 ano');
  const seisMais = idade.find((x) => x.faixa === '6 anos ou mais');
  const soMotora = motora.retornoPorPerfil.find(
    (x) => x.perfil === 'Só motora (alta)'
  );
  const soResp = motora.retornoPorPerfil.find(
    (x) => x.perfil === 'Só respiratória'
  );

  const ultimaEvol = evol[evol.length - 1];
  const retMedia =
    retencao.reduce((a, r) => a + r.taxa, 0) / Math.max(retencao.length, 1);
  const faltasTotal = faltas.reduce((a, f) => a + f.faltas, 0);
  const agendadasTotal = faltas.reduce((a, f) => a + f.agendadas, 0);
  const campanhaTemContato = campanha.some((c) => c.contatosValidos > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Leituras do histórico completo (desde{' '}
        {rotuloMes(ds.sessoes[0]?.mes ?? ds.mesAtual)}). "Parado" = sem sessão
        realizada há 60 dias ou mais. "Retorno" = voltou a fazer sessão depois
        de parado.
      </p>

      {/* 1. Pacientes parados */}
      <CardInsight
        titulo="Pacientes parados: a maior oportunidade da clínica"
        destaque={
          <>
            <strong className="text-2xl">{num(pool.total60a365)}</strong>{' '}
            pacientes estão entre 60 dias e 1 ano sem sessão e sem nada
            agendado. Há um ano eram {num(poolHaUmAno)}.
          </>
        }
        significa={
          <>
            O grupo cresce porque a clínica cresceu: quem começou no pico de
            atendimentos vai parando depois do tratamento. Sem nenhum contato,
            cerca de {num(saz.mediaGeral, 1)}% voltam por mês, o que dá uns{' '}
            {num(retornoNaturalMes)} pacientes. O resto vai esfriando e
            esquecendo da clínica.
          </>
        }
        fazer={
          <>
            Contato de cuidado da secretária, começando por quem parou há menos
            tempo (volta mais). A lista pronta, com a mensagem de cada perfil,
            fica no painel dela em "Reativação de pacientes".
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartContainer
            config={
              {
                pacientes: { label: 'Pacientes', color: serie1 },
              } satisfies ChartConfig
            }
            className="h-[220px] w-full aspect-auto"
          >
            <BarChart data={pool.faixas}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="faixa"
                tickLine={false}
                axisLine={false}
                interval={0}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="pacientes"
                fill="var(--color-pacientes)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
          <ChartContainer
            config={
              {
                pool: { label: 'Parados 60 dias a 1 ano', color: serie1 },
              } satisfies ChartConfig
            }
            className="h-[220px] w-full aspect-auto"
          >
            <LineChart
              data={poolSerie.map((l) => ({ ...l, rotulo: rotuloMes(l.mes) }))}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="pool"
                stroke="var(--color-pool)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardInsight>

      {/* 2. Sazonalidade */}
      <CardInsight
        titulo="Quando os pacientes voltam sozinhos"
        destaque={
          <>
            Retorno natural por mês do ano. Meses fortes:{' '}
            <strong>{listaMeses(saz.fortes) || '—'}</strong>. Mais fracos:{' '}
            <strong>{listaMeses(saz.fracos) || '—'}</strong>.
          </>
        }
        significa={
          <>
            A procura segue a estação respiratória. Uma meta com número fixo o
            ano inteiro fica fácil nos meses fortes e quase impossível nos
            fracos. Por isso a meta de reativação conta só quem foi contatado e
            fica acima do que voltaria sozinho.
          </>
        }
        fazer={
          <>
            Revisar os níveis da meta a cada trimestre usando este gráfico. Nas
            semanas antes dos meses fortes, puxar primeiro as famílias com alta
            da motora e os bebês que já fizeram respiratória.
          </>
        }
      >
        <ChartContainer
          config={
            {
              taxa: { label: 'Voltam no mês (%)', color: serie1 },
            } satisfies ChartConfig
          }
          className="h-[220px] w-full aspect-auto"
        >
          <BarChart
            data={saz.porMesDoAno.map((m) => ({
              rotulo: nomeMes(m.mes).slice(0, 3),
              taxa: Number(m.taxa.toFixed(1)),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} unit="%" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="taxa"
              fill="var(--color-taxa)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardInsight>

      {/* 3. Valor de um retorno */}
      <CardInsight
        titulo="Quanto vale trazer um paciente de volta"
        destaque={
          <>
            Nos 45 dias depois de voltar, o paciente faz em média{' '}
            <strong>{num(valor.sessoesMedia, 1)} sessões</strong> e gera{' '}
            <strong>{brl(valor.receitaMedia)}</strong>.
          </>
        }
        significa={
          <>
            A mediana é mais baixa ({num(valor.sessoesMediana)} sessões,{' '}
            {brl(valor.receitaMediana)}): a maioria volta para um episódio curto
            e alguns ficam em tratamento mais longo. Base: {num(valor.retornos)}{' '}
            retornos do histórico.
          </>
        }
        fazer={
          <>
            Usar este valor para calibrar o bônus. Na meta atual, o nível mais
            alto (25 reativações, R$ 500) traz uns{' '}
            {brl(Math.max(0, 25 - naturaisEm150) * valor.receitaMedia)} a mais
            do que voltaria sozinho; o bônus é{' '}
            {num(
              (100 * 500) /
                Math.max(
                  1,
                  Math.max(0, 25 - naturaisEm150) * valor.receitaMedia
                ),
              1
            )}
            % disso.
          </>
        }
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Sessões (média)"
            valor={num(valor.sessoesMedia, 1)}
          />
          <Indicador
            rotulo="Sessões (mediana)"
            valor={num(valor.sessoesMediana)}
          />
          <Indicador rotulo="Receita (média)" valor={brl(valor.receitaMedia)} />
          <Indicador
            rotulo="Receita (mediana)"
            valor={brl(valor.receitaMediana)}
          />
        </div>
      </CardInsight>

      {/* 4. Motora -> respiratória */}
      <CardInsight
        titulo="Da motora para a respiratória"
        destaque={
          <>
            <strong className="text-2xl">{num(motora.percentual)}%</strong> dos
            bebês que começaram na motora fizeram respiratória depois
            (normalmente {num(motora.medianaDias)} dias após a primeira sessão).
          </>
        }
        significa={
          <>
            A motora tem alta e não volta, mas o bebê continua ficando doente.
            Quem só fez motora volta menos ({num(soMotora?.taxaMensal ?? 0, 1)}%
            ao mês contra {num(soResp?.taxaMensal ?? 0, 1)}% de quem fez
            respiratória), e quando volta é quase sempre para a respiratória.
          </>
        }
        fazer={
          <>
            No contato com famílias que tiveram alta da motora, perguntar do
            desenvolvimento e lembrar que a clínica atende a parte respiratória.
            Nunca oferecer motora de novo sem indicação clínica.
          </>
        }
      >
        <TabelaRelatorio
          linhas={motora.retornoPorPerfil}
          colunas={[
            { chave: 'perfil', titulo: 'Histórico do paciente' },
            {
              chave: 'poolMes',
              titulo: 'Parados (média por mês)',
              alinhar: 'direita',
              formato: (v) => num(Number(v)),
            },
            {
              chave: 'taxaMensal',
              titulo: 'Voltam sozinhos por mês',
              alinhar: 'direita',
              formato: (v) => `${num(Number(v), 1)}%`,
            },
          ]}
        />
      </CardInsight>

      {/* 5. Idade */}
      <CardInsight
        titulo="A idade pesa mais que o serviço"
        destaque={
          <>
            Entre quem já fez respiratória, bebês com menos de 1 ano voltam{' '}
            <strong>{num(bebe?.taxaMensal ?? 0, 1)}%</strong> ao mês; crianças
            com 6 anos ou mais, só{' '}
            <strong>{num(seisMais?.taxaMensal ?? 0, 1)}%</strong>.
          </>
        }
        significa={
          <>
            Bebês têm mais episódios respiratórios e as famílias procuram mais.
            Criança maior raramente volta, então contato com ela rende pouco.
          </>
        }
        fazer={
          <>
            É a regra de prioridade da lista de reativação: bebês primeiro,
            crianças de 6 anos ou mais e quem está parado há mais de 1 ano por
            último.
          </>
        }
      >
        <ChartContainer
          config={
            {
              taxaMensal: { label: 'Voltam no mês (%)', color: serie1 },
            } satisfies ChartConfig
          }
          className="h-[200px] w-full aspect-auto"
        >
          <BarChart
            data={idade.map((x) => ({
              ...x,
              taxaMensal: Number(x.taxaMensal.toFixed(1)),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="faixa" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} unit="%" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="taxaMensal"
              fill="var(--color-taxaMensal)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardInsight>

      {/* 6. Campanha x natural */}
      <CardInsight
        titulo="A reativação está funcionando?"
        destaque={
          campanhaTemContato ? (
            <>
              Retornos de cada mês comparados com o que voltaria sozinho, e
              quantos vieram depois de um contato da secretária.
            </>
          ) : (
            <>
              Ainda não há contatos de reativação registrados. Este quadro passa
              a mostrar o efeito da campanha assim que os contatos começarem.
            </>
          )
        }
        significa={
          <>
            "Esperado" é o retorno natural para o tamanho do grupo parado
            naquele mês do ano (no mês atual, proporcional aos dias já
            passados). De cada {contatosMes} famílias contatadas, umas{' '}
            {num(naturaisEm150)} voltariam mesmo sem contato. Se os retornos
            atribuídos sobem mas o total não passa do esperado, a ligação só
            está levando o crédito de quem voltaria de qualquer jeito.
          </>
        }
        fazer={
          <>
            Acompanhar mês a mês. Se o total ficar consistentemente acima do
            esperado, a campanha está trazendo gente nova de volta e vale manter
            ou ampliar o bônus.
          </>
        }
      >
        <ChartContainer
          config={
            {
              retornos: { label: 'Retornos no mês', color: serie1 },
              esperados: { label: 'Esperado sem campanha', color: serie2 },
            } satisfies ChartConfig
          }
          className="h-[220px] w-full aspect-auto"
        >
          <BarChart
            data={campanha.map((c) => ({
              rotulo: rotuloMes(c.mes),
              retornos: c.retornos,
              esperados: Number(c.esperados.toFixed(1)),
            }))}
            barGap={2}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="retornos"
              fill="var(--color-retornos)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="esperados"
              fill="var(--color-esperados)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <TabelaRelatorio
          linhas={campanha}
          colunas={[
            {
              chave: 'mes',
              titulo: 'Mês',
              formato: (v) => rotuloMes(String(v)),
            },
            { chave: 'retornos', titulo: 'Retornos', alinhar: 'direita' },
            {
              chave: 'esperados',
              titulo: 'Esperado',
              alinhar: 'direita',
              formato: (v) => num(Number(v)),
            },
            {
              chave: 'contatosValidos',
              titulo: 'Contatos válidos',
              alinhar: 'direita',
            },
            {
              chave: 'atribuidos',
              titulo: 'Voltaram após contato',
              alinhar: 'direita',
            },
          ]}
        />
      </CardInsight>

      {/* 7. Evoluções */}
      <CardInsight
        titulo="Evoluções em dia"
        destaque={
          <>
            No mês atual, <strong>{num(ultimaEvol?.cobertura ?? 0)}%</strong>{' '}
            das sessões têm evolução e{' '}
            <strong>{num(ultimaEvol?.em24h ?? 0)}%</strong> foram escritas em
            até 24h.
          </>
        }
        significa={
          <>
            O registro de cada sessão é obrigação do prontuário e protege a
            clínica. Evolução escrita no mesmo dia é mais fiel ao que aconteceu.
            A diferença entre profissionais mostra que é hábito, não falta de
            tempo.
          </>
        }
        fazer={
          <>
            Meta da clínica (profissionais com ajuda das estagiárias): cobertura
            sobe até 95% e prazo de 24h até 90% em dezembro. Escrever a evolução
            logo após cada sessão, no tablet da profissional.
          </>
        }
      >
        <ChartContainer
          config={
            {
              cobertura: { label: 'Sessões com evolução (%)', color: serie1 },
              em24h: { label: 'Evolução em até 24h (%)', color: serie2 },
            } satisfies ChartConfig
          }
          className="h-[220px] w-full aspect-auto"
        >
          <LineChart
            data={evol.map((e) => ({
              rotulo: rotuloMes(e.mes),
              cobertura: Number(e.cobertura.toFixed(1)),
              em24h: Number(e.em24h.toFixed(1)),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              unit="%"
              domain={[0, 100]}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="cobertura"
              stroke="var(--color-cobertura)"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              dataKey="em24h"
              stroke="var(--color-em24h)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
        <TabelaRelatorio
          linhas={evolProf}
          colunas={[
            {
              chave: 'profissional',
              titulo: 'Profissional (mês passado e atual)',
            },
            { chave: 'realizadas', titulo: 'Sessões', alinhar: 'direita' },
            {
              chave: 'comEvolucao',
              titulo: 'Com evolução',
              alinhar: 'direita',
              formato: (v) => `${num(Number(v))}%`,
            },
            {
              chave: 'em24h',
              titulo: 'Em até 24h',
              alinhar: 'direita',
              formato: (v) => `${num(Number(v))}%`,
            },
          ]}
        />
      </CardInsight>

      {/* 8. Retenção */}
      <CardInsight
        titulo="Paciente novo volta para a segunda sessão?"
        destaque={
          <>
            Em média <strong>{num(retMedia)}%</strong> dos pacientes novos fazem
            a segunda sessão em até 60 dias.
          </>
        }
        significa={
          <>
            É um número alto e estável: o primeiro atendimento convence. Não
            vale virar meta agora; vale vigiar se cair.
          </>
        }
        fazer={
          <>Acompanhar. Se ficar abaixo de 70% por dois meses, investigar.</>
        }
      >
        <ChartContainer
          config={
            {
              taxa: { label: 'Voltaram (%)', color: serie1 },
            } satisfies ChartConfig
          }
          className="h-[200px] w-full aspect-auto"
        >
          <LineChart
            data={retencao.map((r) => ({
              rotulo: rotuloMes(r.mes),
              taxa: Number(r.taxa.toFixed(0)),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              unit="%"
              domain={[0, 100]}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="taxa"
              stroke="var(--color-taxa)"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardInsight>

      {/* 9. Qualidade do dado de faltas */}
      <CardInsight
        titulo="Faltas não estão sendo registradas"
        destaque={
          <>
            Nos últimos 12 meses foram marcadas só{' '}
            <strong>{num(faltasTotal)} faltas</strong> em {num(agendadasTotal)}{' '}
            consultas (
            {num(agendadasTotal ? (100 * faltasTotal) / agendadasTotal : 0, 1)}
            %).
          </>
        }
        significa={
          <>
            Em clínica pediátrica a falta costuma ser bem maior que isso. A
            consulta em que o paciente faltou deve estar ficando como agendada
            ou confirmada, o que também derruba a meta de evoluções (sessão sem
            evolução).
          </>
        }
        fazer={
          <>
            Marcar "Paciente faltou" na agenda sempre que acontecer. Com o dado
            confiável por 2 ou 3 meses, dá para criar uma meta de confirmação de
            consultas.
          </>
        }
      />
    </div>
  );
};
