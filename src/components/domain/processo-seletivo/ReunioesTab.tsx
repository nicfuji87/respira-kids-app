// AI dev note: Aba "Reuniões" da seção Estagiários. Placar do bônus por
// evolução do mês (ao vivo) + lista de reuniões; "Apresentar" abre o player
// em tela cheia e "Ata" abre a ata (texto + encaminhamentos marcáveis).
// Slides em src/lib/estagio-reunioes.ts; atas no banco (estagio-atas-api.ts),
// ligadas pela reuniao_ref. Reunião só com ata (sem slides) também aparece.

import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  FileText,
  Plus,
  Presentation,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { REUNIOES, type Reuniao } from '@/lib/estagio-reunioes';
import {
  brl,
  fetchBonusEvolucoes,
  nomeMes,
  type BonusEvolucoes,
} from '@/lib/estagio-reunioes-api';
import { fetchAtas, type AtaReuniao } from '@/lib/estagio-atas-api';
import { ApresentacaoReuniao } from './ApresentacaoReuniao';
import { AtaReuniaoDialog, type NovaAtaBase } from './AtaReuniaoDialog';

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje no fuso do navegador, YYYY-MM-DD. */
function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

interface LinhaReuniao {
  chave: string;
  data: string;
  reuniao: Reuniao | null;
  ata: AtaReuniao | null;
}

interface AtaAberta {
  ata: AtaReuniao | null;
  nova?: NovaAtaBase;
}

export const ReunioesTab: React.FC = () => {
  const { user } = useAuth();
  const pessoaId = user?.pessoa?.id ?? null;
  const [aberta, setAberta] = useState<Reuniao | null>(null);
  const [dados, setDados] = useState<BonusEvolucoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [erroAtas, setErroAtas] = useState(false);
  const [ataAberta, setAtaAberta] = useState<AtaAberta | null>(null);

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

  const carregarAtas = useCallback(async () => {
    try {
      setAtas(await fetchAtas());
      setErroAtas(false);
    } catch (err) {
      console.error('[ReunioesTab] erro ao carregar atas:', err);
      setErroAtas(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarAtas();
  }, [carregar, carregarAtas]);

  // Mantém a ata aberta sincronizada com o que voltou do banco.
  useEffect(() => {
    setAtaAberta((atual) => {
      if (!atual?.ata) return atual;
      const atualizada = atas.find((a) => a.id === atual.ata?.id);
      return atualizada ? { ata: atualizada } : atual;
    });
  }, [atas]);

  // Recarrega o placar ao sair da apresentação.
  const fechar = useCallback(() => {
    setAberta(null);
    void carregar();
  }, [carregar]);

  if (aberta) return <ApresentacaoReuniao reuniao={aberta} onClose={fechar} />;

  const linhas: LinhaReuniao[] = [
    ...REUNIOES.map((r) => ({
      chave: r.id,
      data: r.data,
      reuniao: r,
      ata: atas.find((a) => a.reuniao_ref === r.id) ?? null,
    })),
    ...atas
      .filter((a) => !REUNIOES.some((r) => r.id === a.reuniao_ref))
      .map((a) => ({ chave: a.id, data: a.data, reuniao: null, ata: a })),
  ].sort((a, b) => b.data.localeCompare(a.data));

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
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Reuniões</h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setAtaAberta({
                ata: null,
                nova: {
                  reuniao_ref: null,
                  data: hojeISO(),
                  titulo: 'Reunião com as estagiárias',
                },
              })
            }
          >
            <Plus className="w-4 h-4" />
            Nova ata
          </Button>
        </div>
        {erroAtas && (
          <p className="text-sm text-destructive">
            Não consegui carregar as atas. Recarregue a página.
          </p>
        )}
        {linhas.map(({ chave, data, reuniao, ata }) => {
          const acoes = ata?.itens.filter((i) => i.tipo === 'acao') ?? [];
          const feitos = acoes.filter((i) => i.feito).length;
          const aConfirmar =
            ata?.itens.filter((i) => i.tipo === 'confirmar' && !i.feito)
              .length ?? 0;
          return (
            <Card key={chave}>
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {dataBR(data)}
                    {reuniao && <span>· {reuniao.slides.length} slides</span>}
                    {acoes.length > 0 && (
                      <span>
                        · {feitos} de {acoes.length} encaminhamentos feitos
                      </span>
                    )}
                    {aConfirmar > 0 && (
                      <span>
                        · {aConfirmar}{' '}
                        {aConfirmar === 1
                          ? 'ponto a confirmar'
                          : 'pontos a confirmar'}
                      </span>
                    )}
                  </p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {reuniao?.titulo ?? ata?.titulo}
                  </p>
                  {reuniao && (
                    <p className="text-sm text-muted-foreground">
                      {reuniao.descricao}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      setAtaAberta(
                        ata
                          ? { ata }
                          : {
                              ata: null,
                              nova: {
                                reuniao_ref: reuniao?.id ?? null,
                                data,
                                titulo: reuniao?.titulo ?? '',
                              },
                            }
                      )
                    }
                  >
                    <FileText className="w-4 h-4" />
                    {ata ? 'Ata' : 'Registrar ata'}
                  </Button>
                  {reuniao && (
                    <Button
                      onClick={() => setAberta(reuniao)}
                      className="gap-2"
                    >
                      <Presentation className="w-4 h-4" />
                      Apresentar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AtaReuniaoDialog
        open={ataAberta !== null}
        onOpenChange={(open) => {
          if (!open) setAtaAberta(null);
        }}
        ata={ataAberta?.ata ?? null}
        nova={ataAberta?.nova}
        pessoaId={pessoaId}
        onChanged={() => void carregarAtas()}
        onCreated={(criada) => setAtaAberta({ ata: criada })}
      />
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
