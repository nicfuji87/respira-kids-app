import React, { useMemo } from 'react';
import {
  SecaoRelatorio,
  TabelaRelatorio,
} from '@/components/domain/relatorios/relatorios-ui';
import {
  ESTADOS,
  ETAPAS,
  MOTIVOS_PERDA,
  calcularFunil,
  contarPor,
  data,
  num,
  pct,
  rotuloCanal,
  topoDoSite,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { Aviso, BarrasHorizontais } from './marketing-ui';

export const FunilTab: React.FC<{
  r: Recorte;
  abrirJornada: (id: number) => void;
}> = ({ r, abrirJornada }) => {
  const funil = useMemo(() => calcularFunil(r), [r]);
  const site = useMemo(() => topoDoSite(r), [r]);
  const ops = r.oportunidades;
  const paradas = contarPor(
    ops.filter((o) => o.estado === 'aberta' || o.estado === 'agendada'),
    (o) => ETAPAS.find((e) => e.chave === o.etapa_atual)?.rotulo
  );
  const perdas = contarPor(
    ops.filter((o) => o.estado === 'perdida' || o.estado === 'descartada'),
    (o) =>
      o.motivo_perda
        ? (MOTIVOS_PERDA[o.motivo_perda] ?? o.motivo_perda)
        : 'Sem motivo'
  );
  const comEvidencia = ops.filter((o) => o.motivo_evidencia);
  const qualificadasPelaIa = ops.some((o) => o.etapa_maxima === 'qualificado');

  const linhasEtapa = funil.map((e) => ({
    etapa: e.rotulo,
    quantidade: e.quantidade,
    taxa: e.taxa,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SecaoRelatorio
          titulo="Do clique ao pagamento"
          descricao="Cada oportunidade conta na etapa mais avançada que já alcançou."
          csv={{
            nome: 'funil',
            linhas: linhasEtapa,
            colunas: [
              { chave: 'etapa', titulo: 'Etapa' },
              { chave: 'quantidade', titulo: 'Quantidade' },
              { chave: 'taxa', titulo: 'Taxa' },
            ],
          }}
        >
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">
                Cliques no WhatsApp (site)
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {num(site.cliques)}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">
                Conversas com código
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {num(site.comCodigo)}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">
                Taxa de vinculação observada
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {pct(site.taxaVinculacao)}
              </div>
            </div>
          </div>
          {ops.length ? (
            <BarrasHorizontais
              titulo="Funil por etapa"
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
              Nenhuma conversa no período.
            </p>
          )}
          <TabelaRelatorio
            linhas={linhasEtapa}
            colunas={[
              { chave: 'etapa', titulo: 'Etapa' },
              {
                chave: 'quantidade',
                titulo: 'Quantidade',
                alinhar: 'direita',
                formato: (v) => num(v as number),
              },
              {
                chave: 'taxa',
                titulo: 'Da etapa anterior',
                alinhar: 'direita',
                formato: (v) => pct(v as number | null),
              },
            ]}
          />
          {!qualificadasPelaIa && (
            <Aviso>
              "Lead qualificado" ainda não é classificado sozinho (fase futura):
              hoje a etapa só conta quem já avançou além dela. A taxa de
              conversa → qualificado não deve ser lida como qualidade de lead.
            </Aviso>
          )}
        </SecaoRelatorio>

        <div className="space-y-4">
          <SecaoRelatorio
            titulo="Onde estão as oportunidades em andamento"
            descricao="Etapa atual das que estão abertas ou agendadas."
          >
            <TabelaRelatorio
              linhas={paradas.map(([etapa, q]) => ({ etapa, q }))}
              colunas={[
                { chave: 'etapa', titulo: 'Etapa atual' },
                { chave: 'q', titulo: 'Oportunidades', alinhar: 'direita' },
              ]}
            />
          </SecaoRelatorio>
          <SecaoRelatorio
            titulo="Por que se perderam"
            descricao="Motivo registrado pelo sistema, pela regra de tempo ou pela equipe."
          >
            {perdas.length ? (
              <TabelaRelatorio
                linhas={perdas.map(([motivo, q]) => ({
                  motivo,
                  q,
                  p: q / Math.max(1, ops.length),
                }))}
                colunas={[
                  { chave: 'motivo', titulo: 'Motivo' },
                  { chave: 'q', titulo: 'Oportunidades', alinhar: 'direita' },
                  {
                    chave: 'p',
                    titulo: 'Do total',
                    alinhar: 'direita',
                    formato: (v) => pct(v as number),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma perda no período.
              </p>
            )}
          </SecaoRelatorio>
        </div>
      </div>

      <SecaoRelatorio
        titulo="Perdas com evidência"
        descricao="Frase da conversa que justifica o motivo (quando a IA ou a equipe registraram). Toque na linha para ver a jornada."
      >
        {comEvidencia.length ? (
          <div className="divide-y rounded-md border">
            {comEvidencia.map((o) => (
              <button
                key={o.id}
                className="w-full p-3 text-left text-sm hover:bg-muted/40"
                onClick={() => abrirJornada(o.id)}
              >
                <div className="font-medium">
                  {MOTIVOS_PERDA[o.motivo_perda ?? ''] ?? o.motivo_perda} ·{' '}
                  {rotuloCanal(o.canal)} · {data(o.aberta_em)} ·{' '}
                  {ESTADOS[o.estado] ?? o.estado}
                </div>
                <div className="text-muted-foreground">
                  “{o.motivo_evidencia}”
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma perda com evidência registrada ainda. Os motivos acima vêm
            do sistema (cancelou, faltou) ou da regra de 30 dias sem avanço.
          </p>
        )}
      </SecaoRelatorio>
    </div>
  );
};
