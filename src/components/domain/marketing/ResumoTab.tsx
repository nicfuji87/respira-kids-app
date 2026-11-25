// AI dev note: Marketing → Resumo (admin), a primeira tela. Responde: quantos
// pacientes novos e quanto geraram, de onde vêm, onde perdemos famílias e o que fazer.
// Quatro indicadores, até 3 pontos de atenção (regras em src/lib/marketing-insights.ts)
// e a comparação compacta de canais. Tudo da base única do P0: fn_atrib_retorno_canais
// e fn_atrib_retorno_anuncios (mesmos filtros globais) + Otimização para o convênio.
// "Pacientes novos" = conversas novas com presença CONFIRMADA; o total da clínica
// (com ou sem conversa) aparece como texto secundário, nunca somado.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  brl,
  lerAmostra,
  num,
  pct,
  TRAFEGOS,
  trafegoDe,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import {
  carregarCanais,
  indicadores,
  nomeCanal,
  somarCanais,
  type DadosCanais,
} from '@/lib/marketing-canais';
import {
  carregarRetorno,
  ehMarca,
  somar,
  type DadosRetorno,
} from '@/lib/marketing-retorno';
import {
  carregarOtimizacao,
  periodoDosMeses,
  resumoConvenio,
  type DadosOtimizacao,
} from '@/lib/marketing-otimizacao';
import {
  gerarInsights,
  MAX_INSIGHTS_RESUMO,
  type AbaMarketing,
  type FocoMarketing,
  type Insight,
} from '@/lib/marketing-insights';
import { CartaoIndicador, CelulaIndicador } from './marketing-ui';

const incluiGoogleAds = (canal: string) =>
  canal === 'todos' || canal === 'google_ads' || canal === 'tipo:pago';

export const ResumoTab: React.FC<{
  r: Recorte;
  irPara: (aba: AbaMarketing, foco?: FocoMarketing) => void;
}> = ({ r, irPara }) => {
  const { desde, ate } = periodoDosMeses(r.filtros.mesInicio, r.filtros.mesFim);
  const { canal, campanha, servico } = r.filtros;
  const comAds = incluiGoogleAds(canal);
  const [canais, setCanais] = useState<DadosCanais | null>(null);
  const [ads, setAds] = useState<DadosRetorno | null>(null);
  const [otim, setOtim] = useState<DadosOtimizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCanais(null);
    setAds(null);
    setErro(null);
    carregarCanais(desde, ate, 'aquisicao', { canal, campanha, servico })
      .then((x) => vivo && setCanais(x))
      .catch((e: Error) => vivo && setErro(e.message));
    if (comAds)
      carregarRetorno(desde, ate, { campanha, servico })
        .then((x) => vivo && setAds(x))
        .catch(() => vivo && setAds(null));
    return () => {
      vivo = false;
    };
  }, [desde, ate, canal, campanha, servico, comAds]);

  useEffect(() => {
    let vivo = true;
    setOtim(null);
    // Convênio é da conta toda (anúncio): não depende de canal, campanha ou serviço.
    carregarOtimizacao(desde, ate)
      .then((x) => vivo && setOtim(x))
      .catch(() => vivo && setOtim(null));
    return () => {
      vivo = false;
    };
  }, [desde, ate]);

  const amostraClinica = useMemo(() => lerAmostra(r), [r]);
  const insights = useMemo<Insight[]>(
    () =>
      gerarInsights({
        canais,
        convenio: otim && comAds ? resumoConvenio(otim) : null,
      }),
    [canais, otim, comAds]
  );

  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o resumo: {erro}
      </p>
    );
  if (!canais) return <Skeleton className="h-64 w-full" />;

  const t = somarCanais(canais.canais);
  const porServico = canais.recorte.servico != null;
  const semOrigem = canais.conversas.filter(
    (c) => c.canal === 'nao_atribuido'
  ).length;
  const cobertura = canais.conversas.length
    ? 1 - semOrigem / canais.conversas.length
    : null;
  const suficiente =
    t.novas_atendidas >= 30 && cobertura != null && cobertura >= 0.7;

  // Google Ads sem a busca pela marca é a referência de aquisição.
  const camp = ads?.campanhas ?? [];
  const tSemMarca = somar(
    camp.filter((c) => !ehMarca(c.nome)),
    porServico
  );
  const tComMarca = somar(camp, porServico);

  const linhas = canais.canais
    .map((c) => ({
      ...c,
      grupo:
        trafegoDe(c.canal) === 'sem_origem' ? '' : TRAFEGOS[trafegoDe(c.canal)],
      taxa: indicadores(c, porServico).taxa_agendamento,
    }))
    .sort((a, b) => b.agendaram - a.agendaram);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoIndicador
          rotulo="Pacientes novos"
          valor={num(t.novas_atendidas)}
          detalhe={`Com atendimento confirmado, vindos de conversas novas. Mais ${num(t.atendidas_provaveis + t.presenca_pendente)} com presença a conferir · ${num(amostraClinica.novos)} novos na clínica toda (com ou sem conversa).`}
        />
        <CartaoIndicador
          rotulo="Agendamentos"
          valor={num(t.agendaram)}
          detalhe={
            t.conversas == null
              ? 'Conversas que viraram agendamento (inclui futuros).'
              : `${pct(t.conversas ? t.agendaram / t.conversas : null)} das ${num(t.conversas)} conversas de contato novo, contando as futuras, sem repetir paciente.`
          }
        />
        <CartaoIndicador
          rotulo="Receita realizada"
          valor={brl(t.receita_realizada)}
          detalhe={`Sessões finalizadas e faltas. Recebido ${brl(t.receita_recebida)} · a conferir ${brl(t.receita_a_conferir)}.`}
        />
        {comAds ? (
          <CartaoIndicador
            rotulo="CAC Google Ads, sem Marca"
            ind={tSemMarca.cac}
            formato={brl}
            detalhe={
              ads
                ? `${num(tSemMarca.pacientes_novas)} paciente(s) nova(s) confirmada(s)${tSemMarca.investimento == null ? '' : ` por ${brl(tSemMarca.investimento)}`}. Com Marca: ${tComMarca.cac.valor == null ? '—' : brl(tComMarca.cac.valor)}. Origem identificada em ${pct(cobertura)} das conversas.`
                : 'Carregando o Google Ads…'
            }
          />
        ) : (
          <CartaoIndicador
            rotulo="CAC Google Ads"
            valor="—"
            detalhe="O filtro de canal não inclui o Google Ads."
          />
        )}
      </div>

      {!suficiente && (
        <p className="text-xs text-muted-foreground">
          Amostra pequena: {num(t.novas_atendidas)} paciente(s) nova(s)
          confirmada(s) e origem identificada em {pct(cobertura)} das conversas.
          Compare canais e campanhas com cuidado (o painel considera conclusivo
          a partir de 30 pacientes novos e 70% de origem).
        </p>
      )}

      <section aria-labelledby="atencao-titulo" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="atencao-titulo" className="text-base font-semibold">
            O que merece atenção
          </h2>
          {insights.length > MAX_INSIGHTS_RESUMO && (
            <span className="text-xs text-muted-foreground">
              +{insights.length - MAX_INSIGHTS_RESUMO} outro(s) ponto(s) nas
              abas
            </span>
          )}
        </div>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum ponto fora do normal pelas regras atuais neste recorte.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {insights.slice(0, MAX_INSIGHTS_RESUMO).map((i) => (
              <article
                key={i.id}
                className="flex flex-col gap-2 rounded-md border bg-card p-4"
              >
                <h3 className="text-sm font-semibold leading-snug">
                  {i.titulo}
                </h3>
                <p className="text-sm text-muted-foreground">{i.evidencia}</p>
                <p className="text-sm">
                  <span className="font-medium">O que fazer: </span>
                  {i.acao}
                </p>
                <div className="mt-auto pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => irPara(i.onde.aba, i.onde.foco)}
                  >
                    {i.onde.rotulo}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <SecaoRelatorio
        titulo="Canais"
        descricao="Pela primeira origem conhecida da conversa. Pacientes novos e receita contam só presença confirmada. Detalhe por serviço e por paciente na aba Canais."
      >
        <TabelaRelatorio<(typeof linhas)[number]>
          linhas={linhas}
          colunas={[
            {
              chave: 'canal',
              titulo: 'Canal',
              formato: (x, l) => (
                <span>
                  {nomeCanal(x as string)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {l.grupo}
                  </span>
                </span>
              ),
            },
            {
              chave: 'conversas',
              titulo: 'Conversas',
              alinhar: 'direita',
              formato: (x) => (x == null ? '—' : num(Number(x))),
            },
            {
              chave: 'agendaram',
              titulo: 'Agendaram',
              alinhar: 'direita',
              formato: (x, l) => (
                <span>
                  {num(Number(x))}{' '}
                  <span className="text-muted-foreground">
                    (<CelulaIndicador ind={l.taxa} formato={pct} />)
                  </span>
                </span>
              ),
            },
            {
              chave: 'novas_atendidas',
              titulo: 'Pacientes novos',
              alinhar: 'direita',
            },
            {
              chave: 'receita_realizada',
              titulo: 'Receita realizada',
              alinhar: 'direita',
              formato: (x) => brl(Number(x)),
            },
          ]}
          rodape={{
            canal: 'Total',
            conversas: t.conversas == null ? '—' : num(t.conversas),
            agendaram: num(t.agendaram),
            novas_atendidas: num(t.novas_atendidas),
            receita_realizada: brl(t.receita_realizada),
          }}
        />
      </SecaoRelatorio>
    </div>
  );
};
