// AI dev note: Marketing → Canais (admin). Uma tabela só (sem sub-abas, sem gráfico
// repetido): clicar num canal mostra o desempenho dele por serviço e as pacientes.
// Canal, campanha e serviço vêm do filtro GLOBAL e o banco aplica nos totais
// (fn_atrib_retorno_canais, base única do P0); aqui só há filtros locais de
// profissional e de presença. "Atendida" = presença confirmada (Finalizado); sessão
// passada sem baixa fica "a conferir". No fim, o que fica sem origem: relato da
// família (pergunta da Ju), vínculos manuais e onde as conversas param.
// Regras em src/lib/marketing-canais.ts.

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Skeleton } from '@/components/primitives/skeleton';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
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
  TRAFEGOS,
  trafegoDe,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { periodoDosMeses } from '@/lib/marketing-otimizacao';
import { dataParede } from '@/lib/marketing-retorno';
import {
  carregarCanais,
  indicadores,
  nomeCanal,
  nomeOrigemDeclarada,
  PRESENCA,
  RESULTADO_CONVERSA,
  SEM_DIVISAO_SERVICO,
  somarCanais,
  VINCULO,
  type BaseRetorno,
  type CanalRetorno,
  type DadosCanais,
  type PacienteCanal,
} from '@/lib/marketing-canais';
import type { FocoMarketing } from '@/lib/marketing-insights';
import { Aviso, CelulaIndicador } from './marketing-ui';

const TODOS = '__todos';
type FiltroPresenca = 'todas' | 'a_conferir';

export const CanaisTab: React.FC<{ r: Recorte; foco?: FocoMarketing }> = ({
  r,
  foco,
}) => {
  const [base, setBase] = useState<BaseRetorno>('aquisicao');
  const [d, setD] = useState<DadosCanais | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [canalSel, setCanalSel] = useState<string | null>(null);
  const [fProf, setFProf] = useState(TODOS);
  const [fPresenca, setFPresenca] = useState<FiltroPresenca>(
    foco === 'a_conferir' ? 'a_conferir' : 'todas'
  );
  const { desde, ate } = periodoDosMeses(r.filtros.mesInicio, r.filtros.mesFim);
  const { canal, campanha, servico } = r.filtros;

  useEffect(() => {
    if (foco === 'a_conferir') setFPresenca('a_conferir');
    if (foco === 'sem_origem')
      document
        .getElementById('canais-sem-origem')
        ?.scrollIntoView({ behavior: 'smooth' });
  }, [foco, d]);

  useEffect(() => {
    let vivo = true;
    setD(null);
    setErro(null);
    setCanalSel(null);
    carregarCanais(desde, ate, base, { canal, campanha, servico })
      .then((x) => vivo && setD(x))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [desde, ate, base, canal, campanha, servico]);

  const v = useMemo(() => {
    if (!d) return null;
    const total = somarCanais(d.canais);
    const doCanal = d.pacientes.filter(
      (p) => canalSel == null || p.canal === canalSel
    );
    const profs = [
      ...new Set(doCanal.map((p) => p.profissional).filter(Boolean)),
    ].sort() as string[];
    const pacientes = doCanal.filter(
      (p) =>
        (fProf === TODOS || p.profissional === fProf) &&
        (fPresenca === 'todas' ||
          p.presenca === 'provavel' ||
          p.presenca === 'pendente')
    );
    // Desempenho por serviço do canal escolhido (ou de todos).
    const mapa = new Map<
      string,
      {
        servico: string;
        pacientes: number;
        atendidas: number;
        a_conferir: number;
        receita_realizada: number;
        receita_a_conferir: number;
      }
    >();
    doCanal.forEach((p) => {
      const k = p.servico ?? 'Sem sessão ainda';
      const x = mapa.get(k) ?? {
        servico: k,
        pacientes: 0,
        atendidas: 0,
        a_conferir: 0,
        receita_realizada: 0,
        receita_a_conferir: 0,
      };
      x.pacientes += 1;
      if (p.presenca === 'confirmada') x.atendidas += 1;
      if (p.presenca === 'provavel' || p.presenca === 'pendente')
        x.a_conferir += 1;
      x.receita_realizada += p.receita_realizada;
      x.receita_a_conferir += p.receita_a_conferir;
      mapa.set(k, x);
    });
    const servicos = [...mapa.values()].sort(
      (a, b) => b.atendidas - a.atendidas || b.pacientes - a.pacientes
    );
    const semOrigem = d.conversas.filter((c) => c.canal === 'nao_atribuido');
    const multicanal = d.canais.reduce((a, c) => a + c.multicanal, 0);
    return { total, profs, pacientes, servicos, semOrigem, multicanal };
  }, [d, canalSel, fProf, fPresenca]);

  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar os canais: {erro}
      </p>
    );
  if (!d || !v) return <Skeleton className="h-64 w-full" />;

  const { total } = v;
  const porServico = d.recorte.servico != null;
  const periodo = `${dataParede(`${desde}T00:00`).slice(0, 5)} a ${dataParede(`${ate}T00:00`).slice(0, 5)}`;
  const linhasCanais = d.canais.map((c) => ({
    ...c,
    ...indicadores(c, porServico),
    grupo:
      trafegoDe(c.canal) === 'sem_origem' ? '' : TRAFEGOS[trafegoDe(c.canal)],
    a_conferir: c.atendidas_provaveis + c.presenca_pendente,
  }));
  const aConferir = total.atendidas_provaveis + total.presenca_pendente;
  const qtd = (x: number | null) => (x == null ? '—' : num(x));
  const recorteAtivo = [
    canal !== 'todos' && 'canal',
    campanha !== 'todas' && 'campanha',
    servico !== 'todos' && 'serviço',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {periodo}. Sessões e conversas até agora ({dataHora(d.gerado_em)}).
          Canal = primeira origem conhecida da conversa. Atendida = sessão
          finalizada; sessão passada sem baixa fica a conferir.
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

      {recorteAtivo.length > 0 && (
        <Aviso>
          <strong className="text-foreground">
            Filtro de {recorteAtivo.join(', ')} aplicado aos totais.{' '}
          </strong>
          {porServico &&
            'Com serviço, conversas e investimento ficam indisponíveis: a conversa e o anúncio não se dividem por serviço.'}
        </Aviso>
      )}

      <SecaoRelatorio
        titulo="Comparação de canais"
        descricao={`Clique num canal para ver o desempenho dele por serviço e as pacientes. ${num(total.descartadas)} conversa(s) não comerciais ficaram fora. Só o Google Ads tem custo importado: nos outros canais o custo é "não informado", não zero.`}
        csv={{
          nome: `canais_${base}_${desde}_${ate}`,
          linhas: d.canais.map((c) => ({ ...c, canal: nomeCanal(c.canal) })),
          colunas: [
            { chave: 'canal', titulo: 'Canal' },
            { chave: 'conversas', titulo: 'Conversas' },
            { chave: 'agendaram', titulo: 'Agendaram' },
            { chave: 'atendidas', titulo: 'Atendidas (confirmadas)' },
            { chave: 'novas_atendidas', titulo: 'Novas atendidas' },
            { chave: 'atendidas_provaveis', titulo: 'Presença provável' },
            { chave: 'presenca_pendente', titulo: 'Presença pendente' },
            { chave: 'pagantes', titulo: 'Pagantes' },
            { chave: 'receita_realizada', titulo: 'Receita realizada' },
            { chave: 'receita_a_conferir', titulo: 'Receita a conferir' },
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
              formato: (x, l) => {
                const ativo = canalSel === x;
                return (
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    aria-pressed={ativo}
                    onClick={() => setCanalSel(ativo ? null : (x as string))}
                  >
                    <span className={ativo ? 'font-semibold' : undefined}>
                      {nomeCanal(x as string)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {l.grupo}
                    </span>
                  </button>
                );
              },
            },
            {
              chave: 'conversas',
              titulo: 'Conversas',
              alinhar: 'direita',
              formato: (x) =>
                x == null ? (
                  <span
                    className="text-muted-foreground"
                    title={SEM_DIVISAO_SERVICO}
                  >
                    —
                  </span>
                ) : (
                  num(Number(x))
                ),
            },
            {
              chave: 'agendaram',
              titulo: 'Agendaram',
              alinhar: 'direita',
              formato: (x, l) => (
                <span>
                  {num(Number(x))}{' '}
                  <span className="text-muted-foreground">
                    (
                    <CelulaIndicador ind={l.taxa_agendamento} formato={pct} />)
                  </span>
                </span>
              ),
            },
            { chave: 'atendidas', titulo: 'Atendidas', alinhar: 'direita' },
            {
              chave: 'a_conferir',
              titulo: 'A conferir',
              alinhar: 'direita',
              formato: (x, l) => (
                <span
                  title={`${l.atendidas_provaveis} com sessão paga sem baixa · ${l.presenca_pendente} sem baixa e sem pagamento`}
                >
                  {num(Number(x))}
                </span>
              ),
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
            {
              chave: 'investimento',
              titulo: 'Investimento',
              alinhar: 'direita',
              formato: (x) =>
                x == null ? (
                  <span
                    className="text-muted-foreground"
                    title={
                      porServico
                        ? SEM_DIVISAO_SERVICO
                        : 'Sem custo de mídia informado'
                    }
                  >
                    {porServico ? 'indisponível' : 'não informado'}
                  </span>
                ) : (
                  brl(Number(x))
                ),
            },
            {
              chave: 'cac',
              titulo: 'Custo por paciente nova',
              alinhar: 'direita',
              formato: (_, l) => <CelulaIndicador ind={l.cac} formato={brl} />,
            },
          ]}
          rodape={{
            canal: 'Total',
            conversas: qtd(total.conversas),
            agendaram: num(total.agendaram),
            atendidas: num(total.atendidas),
            a_conferir: num(aConferir),
            receita_realizada: brl(total.receita_realizada),
            receita_recebida: brl(total.receita_recebida),
            investimento:
              total.investimento == null ? '—' : brl(total.investimento),
          }}
        />
      </SecaoRelatorio>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {canalSel ? nomeCanal(canalSel) : 'Todos os canais'}
        </span>
        {canalSel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCanalSel(null)}
            aria-label="Voltar para todos os canais"
          >
            <X className="h-4 w-4" aria-hidden />
            todos
          </Button>
        )}
      </div>

      <SecaoRelatorio
        titulo="Por serviço"
        descricao="Serviço da primeira sessão de cada paciente. Receita realizada conta sessões finalizadas e faltas; a conferir, as que passaram sem baixa."
      >
        {v.servicos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma paciente neste recorte.
          </p>
        ) : (
          <TabelaRelatorio<(typeof v.servicos)[number]>
            linhas={v.servicos}
            colunas={[
              { chave: 'servico', titulo: 'Serviço' },
              { chave: 'pacientes', titulo: 'Pacientes', alinhar: 'direita' },
              { chave: 'atendidas', titulo: 'Atendidas', alinhar: 'direita' },
              {
                chave: 'a_conferir',
                titulo: 'A conferir',
                alinhar: 'direita',
              },
              {
                chave: 'receita_realizada',
                titulo: 'Realizada',
                alinhar: 'direita',
                formato: (x) => brl(Number(x)),
              },
              {
                chave: 'receita_a_conferir',
                titulo: 'A conferir (R$)',
                alinhar: 'direita',
                formato: (x) => brl(Number(x)),
              },
            ]}
          />
        )}
      </SecaoRelatorio>

      <div className="flex flex-wrap items-center gap-2">
        <Filtro
          rotulo="Profissional"
          valor={fProf}
          setValor={setFProf}
          opcoes={v.profs.map((s) => [s, s])}
        />
        <Select
          value={fPresenca}
          onValueChange={(x) => setFPresenca(x as FiltroPresenca)}
        >
          <SelectTrigger className="w-56" aria-label="Presença">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Presença: todas</SelectItem>
            <SelectItem value="a_conferir">Presença: só a conferir</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SecaoRelatorio
        titulo={`Pacientes (${num(v.pacientes.length)})`}
        descricao="Cada paciente uma vez, na conversa mais antiga que levou a ela. Sessões = finalizadas; as que passaram sem baixa aparecem como a conferir. Faltas entram na receita (cobradas integral), mas não contam atendimento."
        csv={{
          nome: `canais-pacientes_${base}_${desde}_${ate}`,
          linhas: v.pacientes.map((p) => ({
            ...p,
            canal: nomeCanal(p.canal),
            presenca: PRESENCA[p.presenca].rotulo,
            vinculo: VINCULO[p.vinculo ?? ''] ?? p.vinculo,
          })),
          colunas: [
            { chave: 'nome', titulo: 'Paciente' },
            { chave: 'canal', titulo: 'Canal' },
            { chave: 'presenca', titulo: 'Presença' },
            { chave: 'servico', titulo: 'Serviço' },
            { chave: 'profissional', titulo: 'Profissional' },
            { chave: 'primeiro_contato', titulo: '1º contato' },
            { chave: 'primeira_sessao', titulo: '1ª sessão' },
            { chave: 'sessoes_realizadas', titulo: 'Sessões finalizadas' },
            { chave: 'sessoes_provaveis', titulo: 'Sem baixa, pagas' },
            {
              chave: 'sessoes_pendentes',
              titulo: 'Sem baixa, sem pagamento',
            },
            { chave: 'faltas', titulo: 'Faltas' },
            { chave: 'receita_realizada', titulo: 'Receita realizada' },
            { chave: 'receita_a_conferir', titulo: 'Receita a conferir' },
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
                chave: 'presenca',
                titulo: 'Presença',
                formato: (x) => {
                  const p = PRESENCA[x as keyof typeof PRESENCA];
                  return (
                    <Badge variant={p.variante} title={p.dica}>
                      {p.rotulo}
                    </Badge>
                  );
                },
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
                formato: (x, l) => {
                  const sem = l.sessoes_provaveis + l.sessoes_pendentes;
                  return `${num(Number(x))}${sem ? ` (+${sem} a conferir)` : ''}${l.sessoes_agendadas ? ` (+${l.sessoes_agendadas} marcada)` : ''}`;
                },
              },
              {
                chave: 'receita_realizada',
                titulo: 'Realizada',
                alinhar: 'direita',
                formato: (x, l) => (
                  <span
                    title={
                      l.receita_a_conferir
                        ? `+ ${brl(l.receita_a_conferir)} a conferir (sessões sem baixa)`
                        : undefined
                    }
                  >
                    {brl(Number(x))}
                  </span>
                ),
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

      <div id="canais-sem-origem" className="scroll-mt-4 space-y-4">
        <Aviso
          tom={v.semOrigem.length > d.conversas.length / 2 ? 'atencao' : 'info'}
        >
          <strong className="text-foreground">
            {num(v.semOrigem.length)} de {num(d.conversas.length)} conversas sem
            origem identificada.{' '}
          </strong>
          São famílias que chamaram direto no WhatsApp, sem o código do site
          (indicação, perfil do Google, contato salvo, Instagram sem o botão).
          Ficam visíveis aqui em vez de entrarem em algum canal.{' '}
          {v.multicanal === 0
            ? 'Nenhuma conversa passou por dois canais no período.'
            : `${num(v.multicanal)} conversa(s) passaram por mais de um canal: a tabela de pacientes mostra "primeira → última".`}
        </Aviso>

        <SecaoRelatorio
          titulo="O que as famílias sem rastreio disseram"
          descricao="Resposta à pergunta da Ju (ou da equipe) sobre como conheceram a clínica. É relato, não rastreio: não entra nos canais acima e não deve, sozinho, mudar verba de anúncio."
        >
          {d.origens_declaradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma resposta ainda no período. A Ju passou a perguntar em
              25/11/2026, uma vez por conversa, só para contato novo sem origem
              identificada.
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
          descricao="Onde as conversas param: só conversa, pediu horário (sem sessão marcada), agendada, presença a conferir ou virou paciente."
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
      </div>
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
