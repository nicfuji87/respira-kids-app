// AI dev note: aba Retorno por canal (admin), evolução do "Retorno dos anúncios".
// Geral = comparação de canais; Detalhamento = pacientes filtráveis por canal,
// serviço e profissional; Atribuição = conversas sem origem e vínculos manuais;
// Google Ads = o painel detalhado de antes (RetornoTab), sem mudança.
// Regras em src/lib/marketing-canais.ts e na migration atribuicao_v2_retorno_canais.sql.

import React, { useEffect, useMemo, useState } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Skeleton } from '@/components/primitives/skeleton';
import { Badge } from '@/components/primitives/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  brl,
  dataHora,
  num,
  pct,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { periodoDosMeses } from '@/lib/marketing-otimizacao';
import { dataParede } from '@/lib/marketing-retorno';
import {
  carregarCanais,
  indicadores,
  nomeCanal,
  nomeOrigemDeclarada,
  RESULTADO_CONVERSA,
  somarCanais,
  VINCULO,
  type BaseRetorno,
  type CanalRetorno,
  type DadosCanais,
  type PacienteCanal,
} from '@/lib/marketing-canais';
import {
  Aviso,
  BarrasHorizontais,
  CartaoIndicador,
  CelulaIndicador,
} from './marketing-ui';
import { RetornoTab } from './RetornoTab';

const TODOS = '__todos';

export const RetornoCanaisTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const [base, setBase] = useState<BaseRetorno>('aquisicao');
  const [d, setD] = useState<DadosCanais | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sub, setSub] = useState('geral');
  const [fCanal, setFCanal] = useState(TODOS);
  const [fServico, setFServico] = useState(TODOS);
  const [fProf, setFProf] = useState(TODOS);
  const { desde, ate } = periodoDosMeses(r.filtros.mesInicio, r.filtros.mesFim);

  useEffect(() => {
    let vivo = true;
    setD(null);
    setErro(null);
    carregarCanais(desde, ate, base)
      .then((x) => vivo && setD(x))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [desde, ate, base]);

  const v = useMemo(() => {
    if (!d) return null;
    const total = somarCanais(d.canais);
    const servicos = [
      ...new Set(d.pacientes.map((p) => p.servico).filter(Boolean)),
    ] as string[];
    const profs = [
      ...new Set(d.pacientes.map((p) => p.profissional).filter(Boolean)),
    ] as string[];
    const pacientes = d.pacientes.filter(
      (p) =>
        (fCanal === TODOS || p.canal === fCanal) &&
        (fServico === TODOS || p.servico === fServico) &&
        (fProf === TODOS || p.profissional === fProf)
    );
    const semOrigem = d.conversas.filter((c) => c.canal === 'desconhecido');
    const multicanal = d.canais.reduce((a, c) => a + c.multicanal, 0);
    return {
      total,
      servicos: servicos.sort(),
      profs: profs.sort(),
      pacientes,
      semOrigem,
      multicanal,
    };
  }, [d, fCanal, fServico, fProf]);

  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o retorno por canal: {erro}
      </p>
    );
  if (!d || !v) return <Skeleton className="h-64 w-full" />;

  const { total } = v;
  const tTotal = indicadores(total);
  const periodo = `${dataParede(`${desde}T00:00`).slice(0, 5)} a ${dataParede(`${ate}T00:00`).slice(0, 5)}`;
  const linhasCanais = d.canais.map((c) => ({ ...c, ...indicadores(c) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {periodo}. Sessões e conversas até agora ({dataHora(d.gerado_em)});
          custo do Google Ads importado até{' '}
          {d.custo_ultimo_dia
            ? dataParede(`${d.custo_ultimo_dia}T00:00`).slice(0, 5)
            : '—'}
          .
        </p>
        <Select value={base} onValueChange={(x) => setBase(x as BaseRetorno)}>
          <SelectTrigger className="w-64" aria-label="Base do cálculo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aquisicao">
              Por chegada (conversas do período)
            </SelectItem>
            <SelectItem value="atendimento">
              Por atendimento (sessões do período)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={sub} onValueChange={setSub}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="detalhe">Detalhamento</TabsTrigger>
          <TabsTrigger value="atribuicao">Atribuição</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
        </TabsList>

        {/* ── Geral ─────────────────────────────────────────────── */}
        <TabsContent value="geral" className="mt-4 space-y-4">
          <Aviso>
            <strong className="text-foreground">Como ler: </strong>
            {base === 'aquisicao'
              ? 'conversas de contato novo que começaram no período e tudo o que renderam até hoje (uma conversa de novembro pode virar sessão em dezembro). '
              : 'sessões que aconteceram no período, de pacientes que chegaram até o fim dele (receita do mês). '}
            Canal = primeira origem conhecida (código RK do site). Quem chamou
            direto no WhatsApp, sem passar pelo site, fica em{' '}
            <strong>Sem origem identificada</strong> e não é empurrado para
            nenhum canal. Agendou, atendida e pagante são contadas à parte.
            Valores brutos. Só o Google Ads tem custo importado: nos outros
            canais o custo é "não informado", não zero. Ligações feitas direto
            pelo anúncio ainda não entram.
          </Aviso>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoIndicador
              rotulo="Conversas de contato novo"
              valor={num(total.conversas)}
              detalhe={`${num(total.pediram_horario)} pediram horário e ainda não marcaram`}
            />
            <CartaoIndicador
              rotulo="Agendaram"
              valor={num(total.agendaram)}
              detalhe={
                <>
                  <CelulaIndicador
                    ind={tTotal.taxa_agendamento}
                    formato={pct}
                  />{' '}
                  das conversas
                </>
              }
            />
            <CartaoIndicador
              rotulo="Atendidas"
              valor={num(total.atendidas)}
              detalhe={`${num(total.novas_atendidas)} nova(s) · ${num(total.pagantes)} já pagaram`}
            />
            <CartaoIndicador
              rotulo="Receita realizada"
              valor={brl(total.receita_realizada)}
              detalhe={`Recebida ${brl(total.receita_recebida)} · agendada ${brl(total.receita_agendada)}`}
            />
          </div>

          <SecaoRelatorio
            titulo="Pacientes atendidas por canal"
            descricao="Pacientes com ao menos uma sessão realizada, pelo canal da primeira origem conhecida."
          >
            <BarrasHorizontais
              titulo="Pacientes atendidas por canal"
              dados={d.canais
                .filter((c) => c.conversas > 0)
                .sort((a, b) => b.atendidas - a.atendidas)
                .map((c) => ({
                  rotulo: nomeCanal(c.canal),
                  valor: c.atendidas,
                  detalhe: `${num(c.conversas)} conversas · ${num(c.agendaram)} agendaram`,
                }))}
            />
          </SecaoRelatorio>

          <SecaoRelatorio
            titulo="Comparação de canais"
            descricao={`Conversas → agendaram → atendidas → pagantes, com receita. ${num(total.descartadas)} conversa(s) não comerciais ou de quem já era paciente ficaram fora.`}
            csv={{
              nome: `retorno-canais_${base}_${desde}_${ate}`,
              linhas: d.canais.map((c) => ({
                ...c,
                canal: nomeCanal(c.canal),
              })),
              colunas: [
                { chave: 'canal', titulo: 'Canal' },
                { chave: 'conversas', titulo: 'Conversas' },
                { chave: 'agendaram', titulo: 'Agendaram' },
                { chave: 'atendidas', titulo: 'Atendidas' },
                { chave: 'novas_atendidas', titulo: 'Novas atendidas' },
                { chave: 'pagantes', titulo: 'Pagantes' },
                { chave: 'receita_realizada', titulo: 'Receita realizada' },
                { chave: 'receita_recebida', titulo: 'Receita recebida' },
                { chave: 'receita_agendada', titulo: 'Receita agendada' },
                { chave: 'investimento', titulo: 'Investimento' },
              ],
            }}
          >
            <TabelaRelatorio<(typeof linhasCanais)[number]>
              linhas={linhasCanais}
              colunas={[
                {
                  chave: 'canal',
                  titulo: 'Canal',
                  formato: (x) => nomeCanal(x as string),
                },
                { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita' },
                {
                  chave: 'agendaram',
                  titulo: 'Agendaram',
                  alinhar: 'direita',
                  formato: (x, l) => (
                    <span>
                      {num(Number(x))}{' '}
                      <span className="text-muted-foreground">
                        (
                        <CelulaIndicador
                          ind={l.taxa_agendamento}
                          formato={pct}
                        />
                        )
                      </span>
                    </span>
                  ),
                },
                { chave: 'atendidas', titulo: 'Atendidas', alinhar: 'direita' },
                { chave: 'pagantes', titulo: 'Pagantes', alinhar: 'direita' },
                {
                  chave: 'receita_realizada',
                  titulo: 'Realizada',
                  alinhar: 'direita',
                  formato: (x) => brl(Number(x)),
                },
                {
                  chave: 'receita_recebida',
                  titulo: 'Recebida',
                  alinhar: 'direita',
                  formato: (x) => brl(Number(x)),
                },
                {
                  chave: 'investimento',
                  titulo: 'Investimento',
                  alinhar: 'direita',
                  formato: (x) =>
                    x == null ? (
                      <span
                        className="text-muted-foreground"
                        title="Sem custo de mídia informado"
                      >
                        não informado
                      </span>
                    ) : (
                      brl(Number(x))
                    ),
                },
                {
                  chave: 'cac',
                  titulo: 'Custo por paciente nova',
                  alinhar: 'direita',
                  formato: (_, l) => (
                    <CelulaIndicador ind={l.cac} formato={brl} />
                  ),
                },
              ]}
              rodape={{
                canal: 'Total',
                conversas: num(total.conversas),
                agendaram: num(total.agendaram),
                atendidas: num(total.atendidas),
                pagantes: num(total.pagantes),
                receita_realizada: brl(total.receita_realizada),
                receita_recebida: brl(total.receita_recebida),
                investimento:
                  total.investimento == null ? '—' : brl(total.investimento),
              }}
            />
          </SecaoRelatorio>
        </TabsContent>

        {/* ── Detalhamento ──────────────────────────────────────── */}
        <TabsContent value="detalhe" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Filtro
              rotulo="Canal"
              valor={fCanal}
              setValor={setFCanal}
              opcoes={d.canais.map((c) => [c.canal, nomeCanal(c.canal)])}
            />
            <Filtro
              rotulo="Serviço"
              valor={fServico}
              setValor={setFServico}
              opcoes={v.servicos.map((s) => [s, s])}
            />
            <Filtro
              rotulo="Profissional"
              valor={fProf}
              setValor={setFProf}
              opcoes={v.profs.map((s) => [s, s])}
            />
          </div>
          <SecaoRelatorio
            titulo={`Pacientes (${num(v.pacientes.length)})`}
            descricao="Cada paciente uma vez, na conversa mais antiga que levou a ela. Serviço e profissional da primeira sessão. Sessões que já passaram contam como realizadas mesmo sem baixa; faltas entram na receita (cobradas integral)."
            csv={{
              nome: `retorno-canais-pacientes_${base}_${desde}_${ate}`,
              linhas: v.pacientes.map((p) => ({
                ...p,
                canal: nomeCanal(p.canal),
                vinculo: VINCULO[p.vinculo ?? ''] ?? p.vinculo,
              })),
              colunas: [
                { chave: 'nome', titulo: 'Paciente' },
                { chave: 'canal', titulo: 'Canal' },
                { chave: 'servico', titulo: 'Serviço' },
                { chave: 'profissional', titulo: 'Profissional' },
                { chave: 'primeiro_contato', titulo: '1º contato' },
                { chave: 'primeira_sessao', titulo: '1ª sessão' },
                { chave: 'sessoes_realizadas', titulo: 'Sessões realizadas' },
                { chave: 'receita_realizada', titulo: 'Receita realizada' },
                { chave: 'receita_recebida', titulo: 'Receita recebida' },
                { chave: 'vinculo', titulo: 'Vínculo' },
              ],
            }}
          >
            {v.pacientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma paciente com esse filtro.
              </p>
            ) : (
              <TabelaRelatorio<PacienteCanal>
                linhas={v.pacientes}
                colunas={[
                  {
                    chave: 'nome',
                    titulo: 'Paciente',
                    formato: (x, l) => (
                      <span className="flex items-center gap-2">
                        {String(x ?? '—')}
                        {l.ja_era_paciente && (
                          <Badge variant="muted">já era paciente</Badge>
                        )}
                      </span>
                    ),
                  },
                  {
                    chave: 'canal',
                    titulo: 'Canal',
                    formato: (x, l) =>
                      `${nomeCanal(x as string)}${l.canal_ultima !== l.canal ? ` → ${nomeCanal(l.canal_ultima)}` : ''}`,
                  },
                  {
                    chave: 'servico',
                    titulo: 'Serviço',
                    formato: (x) => String(x ?? '—'),
                  },
                  {
                    chave: 'profissional',
                    titulo: 'Profissional',
                    formato: (x) => String(x ?? '—'),
                  },
                  {
                    chave: 'origem_declarada',
                    titulo: 'Disse que conheceu por',
                    formato: (x) => (
                      <span
                        className="text-muted-foreground"
                        title="Relato da família, não rastreio"
                      >
                        {nomeOrigemDeclarada(x as string | null)}
                      </span>
                    ),
                  },
                  {
                    chave: 'primeiro_contato',
                    titulo: '1º contato',
                    formato: (x) => dataParede(x as string | null),
                  },
                  {
                    chave: 'sessoes_realizadas',
                    titulo: 'Sessões',
                    alinhar: 'direita',
                    formato: (x, l) =>
                      `${num(Number(x))}${l.sessoes_agendadas ? ` (+${l.sessoes_agendadas} marcada)` : ''}`,
                  },
                  {
                    chave: 'receita_realizada',
                    titulo: 'Realizada',
                    alinhar: 'direita',
                    formato: (x) => brl(Number(x)),
                  },
                  {
                    chave: 'receita_recebida',
                    titulo: 'Recebida',
                    alinhar: 'direita',
                    formato: (x) => brl(Number(x)),
                  },
                ]}
              />
            )}
          </SecaoRelatorio>
        </TabsContent>

        {/* ── Atribuição ────────────────────────────────────────── */}
        <TabsContent value="atribuicao" className="mt-4 space-y-4">
          <Aviso
            tom={v.semOrigem.length > total.conversas / 2 ? 'atencao' : 'info'}
          >
            <strong className="text-foreground">
              {num(v.semOrigem.length)} de {num(total.conversas)} conversas sem
              origem identificada.{' '}
            </strong>
            São famílias que chamaram direto no WhatsApp, sem o código do site
            (indicação, perfil do Google, contato salvo, Instagram sem o botão).
            Ficam visíveis aqui em vez de entrarem em algum canal.{' '}
            {v.multicanal === 0
              ? 'Nenhuma conversa passou por dois canais no período, então primeira e última origem coincidem.'
              : `${num(v.multicanal)} conversa(s) passaram por mais de um canal: a tabela de pacientes mostra "primeira → última".`}
          </Aviso>

          <SecaoRelatorio
            titulo="O que as famílias sem rastreio disseram"
            descricao="Resposta à pergunta da Ju (ou da equipe) sobre como conheceram a clínica. É relato, não rastreio: não entra nos canais acima e não deve, sozinho, mudar verba de anúncio."
          >
            {d.origens_declaradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta ainda no período. A Ju passou a perguntar em
                25/11/2026, uma vez por conversa, só para contato novo sem
                origem identificada.
              </p>
            ) : (
              <TabelaRelatorio<(typeof d.origens_declaradas)[number]>
                linhas={d.origens_declaradas}
                colunas={[
                  {
                    chave: 'categoria',
                    titulo: 'Disse que conheceu por',
                    formato: (x) => nomeOrigemDeclarada(x as string),
                  },
                  {
                    chave: 'conversas',
                    titulo: 'Conversas',
                    alinhar: 'direita',
                  },
                  {
                    chave: 'agendaram',
                    titulo: 'Agendaram',
                    alinhar: 'direita',
                  },
                  {
                    chave: 'atendidas',
                    titulo: 'Atendidas',
                    alinhar: 'direita',
                  },
                  {
                    chave: 'receita_realizada',
                    titulo: 'Realizada',
                    alinhar: 'direita',
                    formato: (x) => brl(Number(x)),
                  },
                ]}
              />
            )}
          </SecaoRelatorio>

          <SecaoRelatorio
            titulo="Vínculos manuais"
            descricao="Agendamentos ligados à mão a uma conversa (por exemplo, cadastro feito com o telefone de outro responsável): quem, quando e por quê."
          >
            {d.vinculos_manuais.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum vínculo manual no período.
              </p>
            ) : (
              <TabelaRelatorio<(typeof d.vinculos_manuais)[number]>
                linhas={d.vinculos_manuais}
                colunas={[
                  {
                    chave: 'paciente',
                    titulo: 'Paciente',
                    formato: (x) => String(x ?? '—'),
                  },
                  {
                    chave: 'canal',
                    titulo: 'Canal',
                    formato: (x) => nomeCanal(x as string),
                  },
                  {
                    chave: 'vinculado_em',
                    titulo: 'Quando',
                    formato: (x) => dataParede(x as string | null),
                  },
                  {
                    chave: 'vinculado_por',
                    titulo: 'Quem',
                    formato: (x) => String(x ?? 'sistema / desenvolvimento'),
                  },
                  {
                    chave: 'motivo',
                    titulo: 'Por quê',
                    formato: (x) => (
                      <span className="whitespace-normal">
                        {String(x ?? '—')}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </SecaoRelatorio>

          <SecaoRelatorio
            titulo="Conversas por resultado e canal"
            descricao="Onde as conversas param: só conversa, pediu horário (sem sessão marcada), agendada ou virou paciente."
          >
            <TabelaRelatorio<
              CanalRetorno & { resultados: Record<string, number> }
            >
              linhas={d.canais.map((c) => ({
                ...c,
                resultados: d.conversas
                  .filter((x) => x.canal === c.canal)
                  .reduce<Record<string, number>>((a, x) => {
                    a[x.resultado] = (a[x.resultado] ?? 0) + 1;
                    return a;
                  }, {}),
              }))}
              colunas={[
                {
                  chave: 'canal',
                  titulo: 'Canal',
                  formato: (x) => nomeCanal(x as string),
                },
                ...(
                  Object.keys(
                    RESULTADO_CONVERSA
                  ) as (keyof typeof RESULTADO_CONVERSA)[]
                ).map((k) => ({
                  chave: k as never,
                  titulo: RESULTADO_CONVERSA[k].rotulo,
                  alinhar: 'direita' as const,
                  formato: (
                    _: unknown,
                    l: CanalRetorno & { resultados: Record<string, number> }
                  ) => num(l.resultados[k] ?? 0),
                })),
              ]}
            />
          </SecaoRelatorio>
        </TabsContent>

        {/* ── Google Ads (painel detalhado de antes) ────────────── */}
        <TabsContent value="google" className="mt-4">
          {sub === 'google' && <RetornoTab r={r} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Filtro: React.FC<{
  rotulo: string;
  valor: string;
  setValor: (v: string) => void;
  opcoes: [string, string][];
}> = ({ rotulo, valor, setValor, opcoes }) => (
  <Select value={valor} onValueChange={setValor}>
    <SelectTrigger className="w-56" aria-label={rotulo}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={TODOS}>{rotulo}: todos</SelectItem>
      {opcoes.map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {l}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
