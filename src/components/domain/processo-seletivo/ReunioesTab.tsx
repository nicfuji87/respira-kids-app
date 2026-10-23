// AI dev note: Aba "Reuniões" da seção Estagiários. Placar do bônus por
// evolução do mês (ao vivo) + lista de reuniões; "Apresentar" abre o player
// em tela cheia. Conteúdo das reuniões em src/lib/estagio-reunioes.ts.

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Presentation, RefreshCw } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { cn } from '@/lib/utils';
import { REUNIOES, type Reuniao } from '@/lib/estagio-reunioes';
import {
  brl,
  fetchBonusEvolucoes,
  nomeMes,
  type BonusEvolucoes,
} from '@/lib/estagio-reunioes-api';
import { ApresentacaoReuniao } from './ApresentacaoReuniao';

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export const ReunioesTab: React.FC = () => {
  const [aberta, setAberta] = useState<Reuniao | null>(null);
  const [dados, setDados] = useState<BonusEvolucoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await fetchBonusEvolucoes());
      setErro(false);
    } catch (err) {
      console.error('[ReunioesTab] erro ao carregar bônus:', err);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarrega o placar ao sair da apresentação.
  const fechar = useCallback(() => {
    setAberta(null);
    void carregar();
  }, [carregar]);

  if (aberta) return <ApresentacaoReuniao reuniao={aberta} onClose={fechar} />;

  const inicioBonus = REUNIOES[0]?.bonusInicio;
  const simulacao = dados && inicioBonus ? dados.mes < inicioBonus : false;
  const limite = dados
    ? Math.round(dados.bonus_base / dados.desconto_por_perdida)
    : 20;
  const pctBonus = dados ? (100 * dados.bonus) / dados.bonus_base : 0;
  const corBonus =
    !dados || dados.bonus >= 60
      ? 'bg-verde-pipa'
      : dados.bonus >= 25
        ? 'bg-amarelo-pipa'
        : 'bg-vermelho-kids';

  return (
    <div className="space-y-4">
      {/* Placar do bônus */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-medium">
                Bônus por evolução no prazo
                {dados ? ` · ${nomeMes(dados.mes)}` : ''}
              </p>
              {simulacao && inicioBonus && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Simulação: a regra vale a partir de 1º de{' '}
                  {nomeMes(inicioBonus)}.
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void carregar()}
              disabled={carregando}
              aria-label="Atualizar"
            >
              <RefreshCw
                className={cn('w-4 h-4', carregando && 'animate-spin')}
              />
            </Button>
          </div>

          {erro ? (
            <p className="text-sm text-destructive">
              Não consegui carregar o placar. Tente atualizar.
            </p>
          ) : !dados ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  {brl(dados.bonus)}
                </span>
                <span className="text-sm text-muted-foreground">
                  de {brl(dados.bonus_base)} para cada estagiária
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-roxo-titulo/10 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700',
                    corBonus
                  )}
                  style={{ width: `${pctBonus}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Numero
                  rotulo={`Perdidas (zera em ${limite})`}
                  valor={String(dados.perdidas)}
                />
                <Numero
                  rotulo="No prazo"
                  valor={`${dados.no_prazo} de ${dados.contadas}`}
                />
                <Numero
                  rotulo="Ainda no prazo, sem evolução"
                  valor={String(dados.em_risco)}
                />
                <Numero
                  rotulo="Domiciliares liberadas"
                  valor={String(dados.domiciliares_liberadas)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reuniões */}
      <div className="space-y-2">
        {REUNIOES.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {dataBR(r.data)} · {r.slides.length} slides
                </p>
                <p className="font-semibold text-foreground mt-0.5">
                  {r.titulo}
                </p>
                <p className="text-sm text-muted-foreground">{r.descricao}</p>
              </div>
              <Button onClick={() => setAberta(r)} className="gap-2 shrink-0">
                <Presentation className="w-4 h-4" />
                Apresentar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const Numero: React.FC<{ rotulo: string; valor: string }> = ({
  rotulo,
  valor,
}) => (
  <div>
    <p className="text-xs text-muted-foreground">{rotulo}</p>
    <p className="font-semibold text-foreground tabular-nums">{valor}</p>
  </div>
);

ReunioesTab.displayName = 'ReunioesTab';
