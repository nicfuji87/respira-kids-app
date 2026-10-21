import React, { useMemo } from 'react';
import { SecaoRelatorio } from '@/components/domain/relatorios/relatorios-ui';
import {
  brl,
  calcularFunil,
  calcularMidia,
  lerAmostra,
  num,
  pct,
  rotuloMes,
  topoDoSite,
  vezes,
  mesCoorte,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import {
  Aviso,
  AvisoAmostra,
  BarrasHorizontais,
  CartaoIndicador,
  ColunasMensais,
} from './marketing-ui';

export const VisaoGeralTab: React.FC<{ r: Recorte }> = ({ r }) => {
  const midia = useMemo(() => calcularMidia(r), [r]);
  const funil = useMemo(() => calcularFunil(r), [r]);
  const site = useMemo(() => topoDoSite(r), [r]);
  const amostra = useMemo(() => lerAmostra(r), [r]);
  const receita = r.aquisicoes.reduce((s, a) => s + a.ltv_realizado, 0);
  const porMes = r.meses.map((m) => ({
    rotulo: rotuloMes(m),
    valor: r.aquisicoes.filter((a) => mesCoorte(a) === m).length,
  }));

  return (
    <div className="space-y-4">
      <AvisoAmostra a={amostra} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <CartaoIndicador
          rotulo="Investimento (mídia paga)"
          ind={midia.investimento}
          formato={brl}
        />
        <CartaoIndicador
          rotulo="Conversas com intenção de contratar"
          valor={num(amostra.comerciais)}
          detalhe={`de ${num(amostra.conversas)} conversas no período · ${num(amostra.comOrigem)} com origem identificada`}
        />
        <CartaoIndicador
          rotulo="Pacientes novos atendidos"
          valor={num(amostra.novos)}
          detalhe={`1ª sessão finalizada na agenda · ${num(amostra.ligados)} ligado(s) a uma conversa · ${num(midia.novosPagos)} à mídia paga`}
        />
        <CartaoIndicador rotulo="CAC de mídia" ind={midia.cac} formato={brl} />
        <CartaoIndicador
          rotulo="ROAS 90 dias (atribuído)"
          ind={midia.roas.r90}
          formato={vezes}
        />
        <CartaoIndicador
          rotulo="Receita dos pacientes novos"
          valor={brl(receita)}
          detalhe="recebida até hoje (sessões conciliadas)"
        />
      </div>

      <Aviso>
        ROAS e CAC são <strong>atribuídos observados</strong>: só contam
        pacientes cuja origem foi vinculada. Veja a cobertura na aba Qualidade
        dos dados antes de comparar campanhas. Margem e lucro ainda não são
        calculados.
      </Aviso>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SecaoRelatorio
          titulo="Funil de aquisição"
          descricao={`Site: ${num(site.cliques)} cliques no WhatsApp → ${num(site.comCodigo)} conversas com o código (taxa de vinculação observada ${pct(site.taxaVinculacao)}).`}
        >
          {r.oportunidades.length ? (
            <BarrasHorizontais
              titulo="Funil de aquisição"
              dados={funil.map((e) => ({
                rotulo: e.rotulo,
                valor: e.quantidade,
                detalhe:
                  e.taxa == null
                    ? undefined
                    : `${pct(e.taxa)} da etapa anterior`,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa no período e filtros escolhidos.
            </p>
          )}
        </SecaoRelatorio>
        <SecaoRelatorio
          titulo="Pacientes novos por mês"
          descricao="Mês da origem (clique); sem origem, mês do 1º atendimento."
        >
          {r.aquisicoes.length ? (
            <ColunasMensais titulo="Pacientes novos por mês" dados={porMes} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum paciente novo no período e filtros escolhidos.
            </p>
          )}
        </SecaoRelatorio>
      </div>
    </div>
  );
};
