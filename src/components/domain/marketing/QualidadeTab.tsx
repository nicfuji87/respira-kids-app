// AI dev note: Marketing → Qualidade (admin, P2 de 25/11/2026). Em cima, só o estado
// operacional da medição (6 linhas): custos importados, gastos conciliados, sessões
// sem baixa (com atalho para a lista), origem identificada, vínculos de baixa
// confiança e origem declarada pela Ju. O diagnóstico técnico (faturas, coortes,
// pendências, jobs, vínculo de pacientes) fica recolhido em "Diagnóstico completo".
// Dados de fn_atrib_painel_qualidade.
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/primitives/button';
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
import type { AbaMarketing, FocoMarketing } from '@/lib/marketing-insights';
import { SeloSituacao, type Situacao } from './marketing-ui';

const Linha: React.FC<{
  rotulo: string;
  situacao: Situacao;
  selo: string;
  detalhe: React.ReactNode;
  acao?: React.ReactNode;
}> = ({ rotulo, situacao, selo, detalhe, acao }) => (
  <div className="flex flex-col gap-1 border-t py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="text-sm font-medium">{rotulo}</div>
      <div className="text-xs text-muted-foreground">{detalhe}</div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
    <SeloSituacao situacao={situacao}>{selo}</SeloSituacao>
  </div>
);

export const QualidadeTab: React.FC<{
  q: Qualidade | null;
  erro: string | null;
  irPara?: (aba: AbaMarketing, foco?: FocoMarketing) => void;
}> = ({ q, erro, irPara }) => {
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
  const baixa = q.aguardando_baixa ?? { pacientes: 0, ligados_a_conversa: 0 };
  const faturas = q.faturas ?? [];
  const difTotal = faturas.reduce(
    (s, f) => s + Math.abs(Number(f.diferenca)),
    0
  );
  const jobsComFalha = (q.jobs ?? []).filter(
    (j) => j.status && j.status !== 'succeeded'
  );
  const od = q.origem_declarada;
  const pDecl = od?.sem_origem ? od.com_declaracao / od.sem_origem : null;
  const vincProvavel = a.vinculo_provavel ?? 0;

  return (
    <div className="space-y-4">
      <SecaoRelatorio
        titulo="A medição está em dia?"
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
            rotulo="Consultas sem baixa na agenda"
            situacao={baixa.pacientes > 0 ? 'atencao' : 'ok'}
            selo={
              baixa.pacientes > 0
                ? `${num(baixa.pacientes)} aguardando`
                : 'Nada pendente'
            }
            detalhe={`${num(baixa.pacientes)} paciente(s) novo(s) com consulta que já passou e segue "agendada" ou "confirmada" (${num(baixa.ligados_a_conversa)} ligado(s) a uma conversa). Só contam como atendidos depois que a recepção marcar "finalizado".`}
            acao={
              irPara && baixa.pacientes > 0 ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => irPara('canais', 'a_conferir')}
                >
                  Ver as pacientes a conferir
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Button>
              ) : undefined
            }
          />
          <Linha
            rotulo="Cobertura de origem (90 dias)"
            situacao={
              pOrigem == null ? 'neutro' : pOrigem >= 0.5 ? 'ok' : 'atencao'
            }
            selo={pct(pOrigem)}
            detalhe={`${num(comOrigem)} de ${num(o.oportunidades)} conversas com origem completa · ${num(o.site_recuperada)} com código sem clique · ${num(o.pendente)} buscando · ${num(o.nao_atribuida)} sem origem (todas as conversas, inclusive de pacientes em atendimento)`}
          />
          <Linha
            rotulo="Vínculos com baixa confiança (90 dias)"
            situacao={vincProvavel > 0 ? 'atencao' : 'ok'}
            selo={
              vincProvavel > 0 ? `${num(vincProvavel)} para revisar` : 'Nenhum'
            }
            detalhe={`${num(vincProvavel)} paciente(s) nova(s) ligada(s) a uma conversa só pelo mesmo telefone e horário, sem a equipe ou a Ju confirmar. A presença pode estar confirmada e a origem ser só provável. Revise em Canais (coluna Vínculo do CSV).`}
          />
          <Linha
            rotulo="Origem declarada pela Ju"
            situacao={
              !od || od.sem_origem === 0
                ? 'neutro'
                : pDecl != null && pDecl >= 0.5
                  ? 'ok'
                  : 'atencao'
            }
            selo={
              !od || od.sem_origem === 0 ? 'Sem conversas ainda' : pct(pDecl)
            }
            detalhe={
              od
                ? `${num(od.com_declaracao)} de ${num(od.sem_origem)} conversa(s) de contato novo sem código do site responderam como conheceram a clínica, desde ${data(od.desde + 'T12:00:00Z')}. É relato, separado do rastreio.`
                : 'Ainda sem dado.'
            }
          />
        </div>
      </SecaoRelatorio>

      <details className="rounded-md border bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Diagnóstico completo: vínculo de pacientes, faturas, coortes,
          pendências e atualização
        </summary>
        <div className="space-y-4 border-t p-3">
          <div className="rounded-md border bg-card px-4">
            <Linha
              rotulo="Pacientes novos ligados a uma conversa (90 dias)"
              situacao={pAg == null ? 'neutro' : pAg >= 0.5 ? 'ok' : 'atencao'}
              selo={pct(pAg)}
              detalhe={`De ${num(a.novos_pacientes)} paciente(s) novo(s) atendido(s): ${num(a.vinculo_alto)} com vínculo confirmado (equipe ou pedido da Ju) · ${num(a.vinculo_provavel ?? 0)} provável (mesmo telefone, até 60 dias) · ${num(a.sem_vinculo ?? a.novos_pacientes - a.com_oportunidade)} sem conversa ligada. Paciente novo = 1ª sessão finalizada na agenda.`}
            />
            <Linha
              rotulo="Faturas conciliadas com a receita"
              situacao={difTotal === 0 ? 'ok' : 'problema'}
              selo={
                difTotal === 0
                  ? 'Fecha no centavo'
                  : `Diferença ${brl(difTotal)}`
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
      </details>
    </div>
  );
};
