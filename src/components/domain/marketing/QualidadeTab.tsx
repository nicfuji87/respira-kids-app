import React from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  brl,
  data,
  dataHora,
  num,
  pct,
  rotuloMes,
  type Qualidade,
} from '@/lib/marketing-atribuicao';
import { SeloSituacao, type Situacao } from './marketing-ui';

const Linha: React.FC<{
  rotulo: string;
  situacao: Situacao;
  selo: string;
  detalhe: React.ReactNode;
}> = ({ rotulo, situacao, selo, detalhe }) => (
  <div className="flex flex-col gap-1 border-t py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="text-sm font-medium">{rotulo}</div>
      <div className="text-xs text-muted-foreground">{detalhe}</div>
    </div>
    <SeloSituacao situacao={situacao}>{selo}</SeloSituacao>
  </div>
);

export const QualidadeTab: React.FC<{
  q: Qualidade | null;
  erro: string | null;
}> = ({ q, erro }) => {
  if (erro)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar a qualidade dos dados: {erro}
      </p>
    );
  if (!q) return <Skeleton className="h-64 w-full" />;

  const c = q.custos;
  const custoSit: Situacao = !c?.ultima_importacao
    ? 'problema'
    : c.desatualizado
      ? 'atencao'
      : 'ok';
  const concilSit: Situacao = !c?.ultimo_status
    ? 'neutro'
    : c.ultimo_status === 'ok'
      ? 'ok'
      : 'atencao';
  const o = q.origem_90d;
  const comOrigem = (o.site_completa ?? 0) + (o.declarada ?? 0);
  const pOrigem = o.oportunidades ? comOrigem / o.oportunidades : null;
  const a = q.agendamentos_90d;
  const pAg = a.novos_pacientes ? a.com_oportunidade / a.novos_pacientes : null;
  const faturas = q.faturas ?? [];
  const difTotal = faturas.reduce(
    (s, f) => s + Math.abs(Number(f.diferenca)),
    0
  );
  const jobsComFalha = (q.jobs ?? []).filter(
    (j) => j.status && j.status !== 'succeeded'
  );

  return (
    <div className="space-y-4">
      <SecaoRelatorio
        titulo="Os números do painel são confiáveis?"
        descricao={`Verificado em ${dataHora(q.gerado_em)}. Rastreamento desde ${data(q.inicio_rastreamento + 'T12:00:00Z')}.`}
      >
        <div>
          <Linha
            rotulo="Última importação do Google Ads"
            situacao={custoSit}
            selo={
              !c?.ultima_importacao
                ? 'Nunca importado'
                : c.desatualizado
                  ? 'Desatualizado'
                  : 'Em dia'
            }
            detalhe={
              c?.ultima_importacao
                ? `${dataHora(c.ultima_importacao)} · cobre até ${data(c.cobertura_ate + 'T12:00:00Z')} · conta ${c.conta_id}`
                : 'O script ainda não rodou na conta do Google Ads. Sem custo, CAC e ROAS ficam indisponíveis.'
            }
          />
          <Linha
            rotulo="Custo conciliado com o total da conta"
            situacao={concilSit}
            selo={
              !c?.ultimo_status
                ? 'Sem importação'
                : c.ultimo_status === 'ok'
                  ? 'Igual'
                  : c.ultimo_status === 'divergente'
                    ? 'Divergente'
                    : 'Rejeitado'
            }
            detalhe={`${num(c?.divergencias_7d ?? 0)} divergência(s) e ${num(c?.rejeicoes_7d ?? 0)} rejeição(ões) em 7 dias${c?.ultimo_detalhe ? ` · ${c.ultimo_detalhe}` : ''}`}
          />
          <Linha
            rotulo="Cobertura de origem (90 dias)"
            situacao={
              pOrigem == null ? 'neutro' : pOrigem >= 0.5 ? 'ok' : 'atencao'
            }
            selo={pct(pOrigem)}
            detalhe={`${num(comOrigem)} de ${num(o.oportunidades)} conversas com origem completa · ${num(o.site_recuperada)} com código sem clique · ${num(o.pendente)} buscando · ${num(o.nao_atribuida)} sem origem`}
          />
          <Linha
            rotulo="Cobertura de agendamentos (90 dias)"
            situacao={pAg == null ? 'neutro' : pAg >= 0.5 ? 'ok' : 'atencao'}
            selo={pct(pAg)}
            detalhe={`${num(a.com_oportunidade)} de ${num(a.novos_pacientes)} pacientes novos ligados a uma conversa (${num(a.vinculo_alto)} com vínculo alto)`}
          />
          <Linha
            rotulo="Faturas conciliadas com a receita"
            situacao={difTotal === 0 ? 'ok' : 'problema'}
            selo={
              difTotal === 0 ? 'Fecha no centavo' : `Diferença ${brl(difTotal)}`
            }
            detalhe="Soma das sessões rateadas × valor das faturas pagas, por mês (tabela abaixo)."
          />
          <Linha
            rotulo="Coortes"
            situacao="neutro"
            selo={`${num(q.coortes.menos_30d + q.coortes.de_30_a_89d + q.coortes.de_90_a_179d)} em maturação`}
            detalhe={`${num(q.coortes.menos_30d)} com menos de 30 dias · ${num(q.coortes.de_30_a_89d)} de 30 a 89 · ${num(q.coortes.de_90_a_179d)} de 90 a 179 · ${num(q.coortes.mais_180d)} completas (180+)`}
          />
          <Linha
            rotulo="Pendências"
            situacao={
              q.pendencias.erros_7d > 0
                ? 'problema'
                : q.pendencias.toques_sem_clique +
                      q.pendencias.sessoes_a_conciliar_90d >
                    0
                  ? 'atencao'
                  : 'ok'
            }
            selo={
              q.pendencias.erros_7d > 0
                ? `${q.pendencias.erros_7d} erro(s)`
                : q.pendencias.toques_sem_clique +
                      q.pendencias.sessoes_a_conciliar_90d >
                    0
                  ? `${num(q.pendencias.toques_sem_clique + q.pendencias.sessoes_a_conciliar_90d)} a resolver`
                  : 'Nada pendente'
            }
            detalhe={`${num(q.pendencias.toques_sem_clique)} código(s) ainda buscando o clique · ${num(q.pendencias.sessoes_a_conciliar_90d)} sessão(ões) canceladas e pagas a conciliar (90 dias)`}
          />
          <Linha
            rotulo="Atualização dos dados"
            situacao={jobsComFalha.length ? 'problema' : 'ok'}
            selo={jobsComFalha.length ? 'Falha em job' : 'Jobs ok'}
            detalhe={`Receita recalculada ${dataHora(q.receita_atualizada_em)} (a cada 10 min) · oportunidades ${dataHora(q.oportunidades_processadas_em)} (a cada 5 min) · ${(q.jobs ?? []).map((j) => `${j.job}: ${j.status ?? 'nunca rodou'}`).join(' · ')}`}
          />
        </div>
      </SecaoRelatorio>

      <SecaoRelatorio
        titulo="Faturas pagas × receita rateada"
        descricao="Por mês de pagamento. Diferença diferente de zero indica sessão faltando ou rateio errado."
      >
        <TabelaRelatorio
          linhas={faturas}
          colunas={[
            {
              chave: 'mes',
              titulo: 'Mês',
              formato: (v) => rotuloMes(String(v).slice(0, 7)),
            },
            { chave: 'faturas', titulo: 'Faturas', alinhar: 'direita' },
            {
              chave: 'valor_faturas',
              titulo: 'Valor das faturas',
              alinhar: 'direita',
              formato: (v) => brl(Number(v)),
            },
            {
              chave: 'receita_rateada',
              titulo: 'Receita rateada',
              alinhar: 'direita',
              formato: (v) => brl(Number(v)),
            },
            {
              chave: 'diferenca',
              titulo: 'Diferença',
              alinhar: 'direita',
              formato: (v) => brl(Number(v)),
            },
          ]}
        />
      </SecaoRelatorio>
    </div>
  );
};
