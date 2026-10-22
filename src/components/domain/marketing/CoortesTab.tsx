import React, { useMemo } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import {
  brl,
  calcularMidia,
  contarPor,
  linhasCoorte,
  num,
  pct,
  rotuloMes,
  vezes,
  type Indicador,
  type LinhaCoorte,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { Aviso, CartaoIndicador, CelulaIndicador } from './marketing-ui';

export const CoortesTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const coortes = useMemo(() => linhasCoorte(r), [r]);
  const midia = useMemo(() => calcularMidia(r), [r]);
  const aqs = r.aquisicoes;
  const total = aqs.reduce((s, a) => s + a.ltv_realizado, 0);
  const fam = aqs.filter(
    (a) => a.familia_nova && a.ltv_familia_realizado != null
  );
  const ltvFamilia: Indicador = fam.length
    ? {
        valor:
          fam.reduce((s, a) => s + (a.ltv_familia_realizado ?? 0), 0) /
          fam.length,
      }
    : { valor: null, motivo: 'Nenhuma família nova no recorte.' };
  const maduros90 = aqs.filter((a) => a.dias_desde_aquisicao >= 90);
  const retorno90: Indicador = maduros90.length
    ? {
        valor:
          maduros90.filter((a) => a.sessoes_90d > 1).length / maduros90.length,
      }
    : { valor: null, motivo: 'Nenhum paciente novo completou 90 dias ainda.' };
  const porServico = contarPor(aqs, (a) => a.servico).map(([servico, q]) => {
    const g = aqs.filter((a) => (a.servico ?? '—') === servico);
    return {
      servico,
      q,
      ltv: g.reduce((s, a) => s + a.ltv_realizado, 0) / q,
      sessoes: g.reduce((s, a) => s + a.sessoes_total, 0) / q,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <CartaoIndicador
          rotulo="Receita dos pacientes novos"
          valor={brl(total)}
          detalhe="recebida até hoje"
        />
        <CartaoIndicador
          rotulo="LTV realizado por paciente"
          ind={
            aqs.length
              ? { valor: total / aqs.length }
              : { valor: null, motivo: 'Sem pacientes novos no recorte.' }
          }
          formato={brl}
        />
        <CartaoIndicador
          rotulo="LTV realizado por família nova"
          ind={ltvFamilia}
          formato={brl}
        />
        <CartaoIndicador
          rotulo="Sessões finalizadas por paciente"
          detalhe="só sessões com baixa na agenda (finalizado)"
          ind={
            aqs.length
              ? {
                  valor:
                    aqs.reduce((s, a) => s + a.sessoes_total, 0) / aqs.length,
                }
              : { valor: null, motivo: 'Sem pacientes novos.' }
          }
          formato={(v) =>
            v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
          }
        />
        <CartaoIndicador
          rotulo="Retorno em 90 dias"
          ind={retorno90}
          formato={(v) => pct(v)}
        />
        <CartaoIndicador rotulo="CAC de mídia" ind={midia.cac} formato={brl} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CartaoIndicador
          rotulo="CAC completo"
          ind={{
            valor: null,
            motivo: 'Custos comerciais além da mídia ainda não registrados.',
          }}
          formato={brl}
        />
        <CartaoIndicador
          rotulo="Payback"
          ind={{
            valor: null,
            motivo: 'Precisa da margem de contribuição, ainda não calculada.',
          }}
          formato={(v) => `${v} meses`}
        />
        <CartaoIndicador
          rotulo="Margem de contribuição"
          ind={{
            valor: null,
            motivo:
              'Próxima fase: comissão, imposto, taxa de cartão e materiais.',
          }}
          formato={brl}
        />
      </div>

      <Aviso>
        Cada linha é uma <strong>coorte</strong>: pacientes cujo clique (origem)
        foi naquele mês. A receita de 30/90/180 dias conta as sessões desde o 1º
        atendimento, uma vez só, mesmo que paguem nos meses seguintes. * =
        parcial: ainda há pacientes que não completaram o prazo. LTV da família
        soma irmãos atendidos depois. Sessões e retorno contam só sessões
        finalizadas na agenda; a receita conta tudo o que foi pago.
      </Aviso>

      <SecaoRelatorio
        titulo="Coortes por mês de origem"
        csv={{
          nome: 'coortes',
          linhas: coortes.map((c) => ({
            mes: c.mes,
            novos: c.novos,
            receita_1a: c.receita1,
            receita_30: c.r30.valor ?? '',
            receita_90: c.r90.valor ?? '',
            receita_180: c.r180.valor ?? '',
            ltv_medio: c.ltvMedio ?? '',
            ltv_familia_medio: c.ltvFamiliaMedio ?? '',
            sessoes_medias: c.sessoesMedias ?? '',
            retorno_30: c.retorno30.valor ?? '',
            retorno_90: c.retorno90.valor ?? '',
          })),
          colunas: [
            'mes',
            'novos',
            'receita_1a',
            'receita_30',
            'receita_90',
            'receita_180',
            'ltv_medio',
            'ltv_familia_medio',
            'sessoes_medias',
            'retorno_30',
            'retorno_90',
          ].map((c) => ({ chave: c, titulo: c })),
        }}
      >
        <TabelaRelatorio<LinhaCoorte>
          linhas={coortes}
          colunas={[
            {
              chave: 'mes',
              titulo: 'Mês',
              formato: (v) => rotuloMes(v as string),
            },
            { chave: 'novos', titulo: 'Pacientes novos', alinhar: 'direita' },
            {
              chave: 'receita1',
              titulo: '1ª sessão',
              alinhar: 'direita',
              formato: (v) => brl(v as number),
            },
            {
              chave: 'r30',
              titulo: '30 dias',
              alinhar: 'direita',
              formato: (v) => (
                <CelulaIndicador ind={v as Indicador} formato={brl} />
              ),
            },
            {
              chave: 'r90',
              titulo: '90 dias',
              alinhar: 'direita',
              formato: (v) => (
                <CelulaIndicador ind={v as Indicador} formato={brl} />
              ),
            },
            {
              chave: 'r180',
              titulo: '180 dias',
              alinhar: 'direita',
              formato: (v) => (
                <CelulaIndicador ind={v as Indicador} formato={brl} />
              ),
            },
            {
              chave: 'ltvMedio',
              titulo: 'LTV médio',
              alinhar: 'direita',
              formato: (v) => brl(v as number | null),
            },
            {
              chave: 'ltvFamiliaMedio',
              titulo: 'LTV família',
              alinhar: 'direita',
              formato: (v) => brl(v as number | null),
            },
            {
              chave: 'sessoesMedias',
              titulo: 'Sessões finalizadas/paciente',
              alinhar: 'direita',
              formato: (v) =>
                v == null
                  ? '—'
                  : (v as number).toLocaleString('pt-BR', {
                      maximumFractionDigits: 1,
                    }),
            },
            {
              chave: 'retorno30',
              titulo: 'Retorno 30d',
              alinhar: 'direita',
              formato: (v) => (
                <CelulaIndicador ind={v as Indicador} formato={(x) => pct(x)} />
              ),
            },
            {
              chave: 'retorno90',
              titulo: 'Retorno 90d',
              alinhar: 'direita',
              formato: (v) => (
                <CelulaIndicador ind={v as Indicador} formato={(x) => pct(x)} />
              ),
            },
          ]}
        />
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Por serviço do 1º atendimento">
        {porServico.length ? (
          <TabelaRelatorio
            linhas={porServico}
            colunas={[
              { chave: 'servico', titulo: 'Serviço' },
              {
                chave: 'q',
                titulo: 'Pacientes novos',
                alinhar: 'direita',
                formato: (v) => num(v as number),
              },
              {
                chave: 'ltv',
                titulo: 'LTV médio',
                alinhar: 'direita',
                formato: (v) => brl(v as number),
              },
              {
                chave: 'sessoes',
                titulo: 'Sessões finalizadas/paciente',
                alinhar: 'direita',
                formato: (v) =>
                  (v as number).toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  }),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem pacientes novos no recorte.
          </p>
        )}
      </SecaoRelatorio>
      <p className="text-xs text-muted-foreground">
        ROAS por horizonte: veja a aba Campanhas ({vezes(midia.roas.r90.valor)}{' '}
        em 90 dias no recorte, quando disponível).
      </p>
    </div>
  );
};
