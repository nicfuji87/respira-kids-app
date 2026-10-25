// AI dev note: aba Otimização (admin). Responde "onde mexer no Google Ads":
// convênio (citou × não citou, gasto em buscas com operadora e recomendação com a
// mesma regra do alerta semanal), grupos/palavras-chave cruzados com conversa,
// agenda, paciente e receita, e os termos de pesquisa reais. Dados carregados sob
// demanda (fn_atrib_otimizacao) pelo período do painel. Regras em
// src/lib/marketing-otimizacao.ts.

import React, { useEffect, useMemo, useState } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Skeleton } from '@/components/primitives/skeleton';
import { Badge } from '@/components/primitives/badge';
import {
  brl,
  dataHora,
  num,
  pct,
  vezes,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import {
  AMOSTRA_CONVENIO,
  carregarOtimizacao,
  linhasPalavra,
  periodoDosMeses,
  resumoConvenio,
  ROTULO_CORRESP,
  rotuloDetalhe,
  type DadosOtimizacao,
  type LinhaPalavra,
} from '@/lib/marketing-otimizacao';
import {
  Aviso,
  CartaoIndicador,
  CelulaIndicador,
  SeloSituacao,
  type Situacao,
} from './marketing-ui';

const RECOMENDACAO: Record<
  string,
  { situacao: Situacao; selo: string; texto: string }
> = {
  amostra_insuficiente: {
    situacao: 'neutro',
    selo: 'Amostra insuficiente',
    texto:
      'Ainda não há contatos de anúncio suficientes que citaram convênio para decidir. Mantenha as operadoras liberadas e acompanhe.',
  },
  negar: {
    situacao: 'problema',
    selo: 'Negar operadoras',
    texto:
      'Quem cita convênio agenda menos da metade de quem não cita. Troque NEGAR_OPERADORAS para true (ou adicione as operadoras à lista "RK NEG | Convênio e planos").',
  },
  manter: {
    situacao: 'ok',
    selo: 'Manter liberado',
    texto:
      'Quem cita convênio agenda em ritmo parecido com quem não cita: essas buscas estão trazendo pacientes. Mantenha as operadoras liberadas.',
  },
};

export const OtimizacaoTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const [d, setD] = useState<DadosOtimizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { desde, ate } = periodoDosMeses(r.filtros.mesInicio, r.filtros.mesFim);

  useEffect(() => {
    let vivo = true;
    setD(null);
    setErro(null);
    carregarOtimizacao(desde, ate)
      .then((x) => vivo && setD(x))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [desde, ate]);

  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    r.campanhas.forEach(
      (c) =>
        c.campanha_id && m.set(c.campanha_id, c.campanha_nome ?? c.campanha_id)
    );
    return m;
  }, [r.campanhas]);

  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar a otimização: {erro}
      </p>
    );
  if (!d) return <Skeleton className="h-64 w-full" />;

  const conv = resumoConvenio(d);
  const rec = RECOMENDACAO[conv.recomendacao];
  const palavras = linhasPalavra(d, nomes).filter(
    (p) =>
      r.filtros.campanha === 'todas' || p.campanha_id === r.filtros.campanha
  );
  const semDetalhe = !d.detalhe_ads_ultimo;

  return (
    <div className="space-y-4">
      {semDetalhe && (
        <Aviso tom="atencao">
          <strong className="text-foreground">
            O script de detalhe do Google Ads ainda não rodou.{' '}
          </strong>
          Sem ele não há custo por palavra-chave nem termos de pesquisa (a parte
          de convênio nas conversas já funciona). Script:
          scripts/google-ads/atrib-detalhe.js, diário.
        </Aviso>
      )}

      <SecaoRelatorio
        titulo="Convênio: negar ou não as operadoras?"
        descricao={`Contatos que citaram convênio, plano, operadora ou reembolso na conversa (detecção automática) × os que não citaram. Período ${desde} a ${ate}. Regra: com ${AMOSTRA_CONVENIO}+ contatos de anúncio que citaram, se agendarem menos da metade dos demais → negar. Alerta semanal no WhatsApp do dono.`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SeloSituacao situacao={rec.situacao}>{rec.selo}</SeloSituacao>
          <span className="text-sm text-muted-foreground">
            {rec.texto}
            {conv.recomendacao === 'amostra_insuficiente' &&
              ` Faltam ${conv.faltam} contato(s) de anúncio que citem convênio.`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoIndicador
            rotulo="Anúncio · citaram convênio"
            valor={num(conv.pago.citou.conversas)}
            detalhe={`${num(conv.pago.citou.agendaram)} agendaram (${pct(conv.pago.citou.taxa)})`}
          />
          <CartaoIndicador
            rotulo="Anúncio · não citaram"
            valor={num(conv.pago.nao.conversas)}
            detalhe={`${num(conv.pago.nao.agendaram)} agendaram (${pct(conv.pago.nao.taxa)})`}
          />
          <CartaoIndicador
            rotulo="Gasto em buscas com operadora"
            valor={semDetalhe ? '—' : brl(conv.termos.custo)}
            detalhe={
              semDetalhe
                ? 'Depende do script de detalhe.'
                : `${num(conv.termos.termos)} termo(s), ${num(conv.termos.cliques)} clique(s)`
            }
          />
          <CartaoIndicador
            rotulo="Linha de base · todos os contatos novos"
            valor={`${pct(conv.novos.citou.taxa)} × ${pct(conv.novos.nao.taxa)}`}
            detalhe={`Agendamento de quem citou (${num(conv.novos.citou.conversas)}) × não citou (${num(conv.novos.nao.conversas)}), qualquer origem.`}
          />
        </div>
        {d.convenio_detalhes.length > 0 && (
          <div className="mt-3">
            <TabelaRelatorio
              linhas={d.convenio_detalhes}
              colunas={[
                {
                  chave: 'detalhe',
                  titulo: 'O que citaram',
                  formato: (v) => rotuloDetalhe(String(v)),
                },
                { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita' },
                { chave: 'agendaram', titulo: 'Agendaram', alinhar: 'direita' },
                {
                  chave: 'pagas',
                  titulo: 'Vindas de anúncio',
                  alinhar: 'direita',
                },
              ]}
            />
          </div>
        )}
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Grupos e palavras-chave"
        descricao={`Custo e cliques do Google Ads × o que aconteceu depois no sistema (crédito: última palavra-chave antes da conversa). ${d.detalhe_ads_ultimo ? `Detalhe do Ads atualizado ${dataHora(d.detalhe_ads_ultimo)}.` : ''} Palavra com custo e nenhuma conversa é candidata a pausar ou a negativar termos.`}
        csv={{
          nome: `palavras-chave_${desde}_${ate}`,
          linhas: palavras.map((p) => ({
            ...p,
            ctr: p.ctr.valor,
            cac: p.cac.valor,
            roas30: p.roas30.valor,
          })),
          colunas: [
            { chave: 'campanha_nome', titulo: 'Campanha' },
            { chave: 'grupo_nome', titulo: 'Grupo' },
            { chave: 'palavra', titulo: 'Palavra-chave' },
            { chave: 'corresp', titulo: 'Correspondência' },
            { chave: 'impressoes', titulo: 'Impressões' },
            { chave: 'cliques', titulo: 'Cliques' },
            { chave: 'custo', titulo: 'Custo' },
            { chave: 'conversas', titulo: 'Conversas' },
            { chave: 'agendaram', titulo: 'Agendaram' },
            { chave: 'pacientes', titulo: 'Pacientes novos' },
            { chave: 'receita_30d', titulo: 'Receita 30 dias' },
            { chave: 'cac', titulo: 'CAC' },
            { chave: 'roas30', titulo: 'ROAS 30 dias' },
            { chave: 'citaram_convenio', titulo: 'Citaram convênio' },
          ],
        }}
      >
        {palavras.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma palavra-chave com custo ou conversa no período.
          </p>
        ) : (
          <TabelaRelatorio<LinhaPalavra>
            linhas={palavras}
            colunas={[
              { chave: 'campanha_nome', titulo: 'Campanha' },
              {
                chave: 'grupo_nome',
                titulo: 'Grupo',
                formato: (v, l) => String(v ?? l.grupo_id ?? '—'),
              },
              {
                chave: 'palavra',
                titulo: 'Palavra-chave',
                formato: (v, l) => (
                  <span>
                    {String(v ?? '—')}{' '}
                    {l.corresp && (
                      <span className="text-xs text-muted-foreground">
                        ({ROTULO_CORRESP[l.corresp]})
                      </span>
                    )}
                  </span>
                ),
              },
              {
                chave: 'impressoes',
                titulo: 'Impr.',
                alinhar: 'direita',
                formato: (v) => num(Number(v)),
              },
              {
                chave: 'cliques',
                titulo: 'Cliques',
                alinhar: 'direita',
                formato: (v) => num(Number(v)),
              },
              {
                chave: 'ctr',
                titulo: 'CTR',
                alinhar: 'direita',
                formato: (_, l) => (
                  <CelulaIndicador ind={l.ctr} formato={(x) => pct(x)} />
                ),
              },
              {
                chave: 'custo',
                titulo: 'Custo',
                alinhar: 'direita',
                formato: (v) => brl(Number(v)),
              },
              { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita' },
              {
                chave: 'custoPorConversa',
                titulo: 'Custo/conversa',
                alinhar: 'direita',
                formato: (_, l) => (
                  <CelulaIndicador ind={l.custoPorConversa} formato={brl} />
                ),
              },
              { chave: 'agendaram', titulo: 'Agendaram', alinhar: 'direita' },
              { chave: 'pacientes', titulo: 'Pacientes', alinhar: 'direita' },
              {
                chave: 'cac',
                titulo: 'CAC',
                alinhar: 'direita',
                formato: (_, l) => (
                  <CelulaIndicador ind={l.cac} formato={brl} />
                ),
              },
              {
                chave: 'roas30',
                titulo: 'ROAS 30d',
                alinhar: 'direita',
                formato: (_, l) => (
                  <CelulaIndicador ind={l.roas30} formato={vezes} />
                ),
              },
              {
                chave: 'citaram_convenio',
                titulo: 'Convênio',
                alinhar: 'direita',
              },
            ]}
          />
        )}
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Termos de pesquisa"
        descricao="O que as pessoas digitaram (o Google esconde termos de volume muito baixo). Termo com custo e sem relação com paciente → negativar na lista certa. Os 100 de maior custo."
        csv={{
          nome: `termos_${desde}_${ate}`,
          linhas: d.termos.map((t) => ({
            ...t,
            convenio: (t.convenio ?? []).join(' '),
          })),
          colunas: [
            { chave: 'termo', titulo: 'Termo' },
            { chave: 'palavra', titulo: 'Palavra-chave' },
            { chave: 'impressoes', titulo: 'Impressões' },
            { chave: 'cliques', titulo: 'Cliques' },
            { chave: 'custo', titulo: 'Custo' },
            { chave: 'conversoes_ads', titulo: 'Conversões (Ads)' },
            { chave: 'convenio', titulo: 'Convênio' },
          ],
        }}
      >
        {d.termos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum termo de pesquisa no período.
          </p>
        ) : (
          <TabelaRelatorio
            linhas={d.termos}
            colunas={[
              {
                chave: 'termo',
                titulo: 'Termo',
                formato: (v, l) => (
                  <span className="whitespace-normal">
                    {String(v)}{' '}
                    {(l.convenio ?? []).length > 0 && (
                      <Badge variant="warning" className="ml-1">
                        {(l.convenio ?? []).map(rotuloDetalhe).join(', ')}
                      </Badge>
                    )}
                  </span>
                ),
              },
              {
                chave: 'palavra',
                titulo: 'Palavra-chave',
                formato: (v) => String(v ?? '—'),
              },
              {
                chave: 'cliques',
                titulo: 'Cliques',
                alinhar: 'direita',
                formato: (v) => num(Number(v)),
              },
              {
                chave: 'custo',
                titulo: 'Custo',
                alinhar: 'direita',
                formato: (v) => brl(Number(v)),
              },
              {
                chave: 'conversoes_ads',
                titulo: 'Conv. (Ads)',
                alinhar: 'direita',
                formato: (v) => num(Number(v)),
              },
            ]}
          />
        )}
      </SecaoRelatorio>
    </div>
  );
};
