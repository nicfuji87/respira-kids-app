import React, { useMemo } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import {
  brl,
  calcularMidia,
  lerAmostra,
  linhasCampanha,
  linhasCanal,
  linhasTrafego,
  num,
  pct,
  temMidiaPaga,
  topoDoSite,
  vezes,
  type Indicador,
  type LinhaCampanha,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import {
  Aviso,
  AvisoAmostra,
  AvisoSemMidia,
  CelulaIndicador,
  SeloCusto,
  TabelaOrigens,
} from './marketing-ui';

type LinhaTabela = LinhaCampanha & {
  roas1: Indicador;
  roas90: Indicador;
  roas180: Indicador;
};

const valor = (i: Indicador) => (i.valor == null ? '' : i.valor);

export const CampanhasTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const linhas = useMemo(() => linhasCampanha(r), [r]);
  const canais = useMemo(() => linhasCanal(r), [r]);
  const midia = useMemo(() => calcularMidia(r), [r]);
  const site = topoDoSite(r);
  const amostra = useMemo(() => lerAmostra(r), [r]);
  const semMidia = useMemo(() => !temMidiaPaga(r), [r]);
  const grupos = useMemo(() => linhasTrafego(r), [r]);
  const naoAtribuidos = r.aquisicoes.filter(
    (a) => a.tipo_origem === 'sem_vinculo' || a.tipo_origem === 'nao_atribuida'
  ).length;

  const origens = (
    <SecaoRelatorio
      titulo="Todas as origens"
      descricao={
        semMidia
          ? 'Sem campanha no ar, tudo é orgânico: esta é a linha de base para comparar quando a mídia paga começar.'
          : 'Mídia paga ao lado do orgânico. "Sem origem identificada" fica à parte: pode incluir clique pago que perdeu o código.'
      }
    >
      <TabelaOrigens
        grupos={grupos}
        canais={canais}
        ocultarPagoVazio={semMidia}
      />
    </SecaoRelatorio>
  );

  if (semMidia)
    return (
      <div className="space-y-4">
        <AvisoSemMidia />
        <AvisoAmostra a={amostra} semMidia />
        {origens}
        <SecaoRelatorio
          titulo="Campanhas pagas"
          descricao="Aparecem aqui quando o Google Ads (ou o Meta) começar a enviar custos."
        >
          <p className="text-sm text-muted-foreground">
            Nenhuma campanha paga ainda. Cada campanha com gasto vai aparecer
            com investimento, conversas, pacientes novos, CAC e ROAS — inclusive
            as que não gerarem paciente.
          </p>
        </SecaoRelatorio>
      </div>
    );

  return (
    <div className="space-y-4">
      <AvisoAmostra a={amostra} />
      {!midia.completo && (
        <Aviso tom="atencao">
          {midia.investimento.motivo ?? midia.investimento.aviso} CAC e ROAS
          ficam indisponíveis até o custo estar completo.
        </Aviso>
      )}
      <Aviso>
        Cobertura do recorte: {num(r.aquisicoes.length - naoAtribuidos)} de{' '}
        {num(r.aquisicoes.length)} pacientes novos com origem vinculada (
        {pct(
          r.aquisicoes.length
            ? (r.aquisicoes.length - naoAtribuidos) / r.aquisicoes.length
            : null
        )}
        ); taxa de vinculação RK observada {pct(site.taxaVinculacao)}. Com
        poucos vínculos, o resultado de uma campanha não é conclusivo. * =
        coorte em maturação (parcial).
      </Aviso>

      <SecaoRelatorio
        titulo="Campanhas pagas"
        descricao="Gasto inteiro da campanha no denominador, inclusive quando não gerou paciente. Campanhas sem resultado aparecem."
        csv={{
          nome: 'campanhas',
          linhas: linhas.map((l) => ({
            campanha: l.nome,
            id: l.campanha_id,
            plataforma: l.plataforma,
            custo: l.custoStatus,
            investimento: l.investimento,
            conversas: l.conversas,
            agendaram: l.agendaram,
            novos: l.novos,
            cac: valor(l.cac),
            roas_1a: valor(l.roas.r1),
            roas_30: valor(l.roas.r30),
            roas_90: valor(l.roas.r90),
            roas_180: valor(l.roas.r180),
          })),
          colunas: [
            'campanha',
            'id',
            'plataforma',
            'custo',
            'investimento',
            'conversas',
            'agendaram',
            'novos',
            'cac',
            'roas_1a',
            'roas_30',
            'roas_90',
            'roas_180',
          ].map((c) => ({ chave: c, titulo: c })),
        }}
      >
        {linhas.length ? (
          <TabelaRelatorio<LinhaTabela>
            linhas={linhas.map((l) => ({
              ...l,
              roas1: l.roas.r1,
              roas90: l.roas.r90,
              roas180: l.roas.r180,
            }))}
            colunas={[
              {
                chave: 'nome',
                titulo: 'Campanha',
                formato: (v, l) => (
                  <span title={`ID ${l.campanha_id}`}>{String(v)}</span>
                ),
              },
              {
                chave: 'custoStatus',
                titulo: 'Custo',
                formato: (v) => (
                  <SeloCusto status={v as LinhaCampanha['custoStatus']} />
                ),
              },
              {
                chave: 'investimento',
                titulo: 'Investimento',
                alinhar: 'direita',
                formato: (v) =>
                  v == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    brl(v as number)
                  ),
              },
              {
                chave: 'cliquesAnuncio',
                titulo: 'Cliques no anúncio',
                alinhar: 'direita',
                formato: (v) => num(v as number | null),
              },
              { chave: 'conversas', titulo: 'Conversas', alinhar: 'direita' },
              { chave: 'agendaram', titulo: 'Agendaram', alinhar: 'direita' },
              { chave: 'novos', titulo: 'Pacientes novos', alinhar: 'direita' },
              {
                chave: 'cac',
                titulo: 'CAC',
                alinhar: 'direita',
                formato: (v) => (
                  <CelulaIndicador ind={v as Indicador} formato={brl} />
                ),
              },
              {
                chave: 'roas1',
                titulo: 'ROAS 1ª sessão',
                alinhar: 'direita',
                formato: (v) => (
                  <CelulaIndicador ind={v as Indicador} formato={vezes} />
                ),
              },
              {
                chave: 'roas90',
                titulo: 'ROAS 90d',
                alinhar: 'direita',
                formato: (v) => (
                  <CelulaIndicador ind={v as Indicador} formato={vezes} />
                ),
              },
              {
                chave: 'roas180',
                titulo: 'ROAS 180d',
                alinhar: 'direita',
                formato: (v) => (
                  <CelulaIndicador ind={v as Indicador} formato={vezes} />
                ),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma campanha paga no período. Quando o Google Ads começar a
            enviar custos, todas as campanhas com gasto aparecem aqui, mesmo sem
            conversa nem paciente.
          </p>
        )}
      </SecaoRelatorio>

      {origens}
    </div>
  );
};
