// AI dev note: Aba "Vale-transporte" do painel de Estagiários. Fechamento mensal:
// por estagiário, dias de presença e horas (agregados das batidas de ponto) ×
// valor/dia do contrato = VT a pagar. Expandindo a linha, mostra a auditoria de
// cada batida (qual acesso registrou, localização e — na saída — o checklist do
// turno). Botão "Gerar" imprime o relatório de estágio para a instituição.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CalendarClock,
  Printer,
  MapPin,
  MapPinOff,
  ListChecks,
  ClipboardEdit,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { Input } from '@/components/primitives/input';
import { useToast } from '@/components/primitives/use-toast';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/primitives/alert-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchEstagiariosAtivos,
  fetchPontosMes,
  fetchTermosContrato,
  fetchContratoVars,
  fetchStaffNomes,
  desativarPonto,
  agruparDias,
  type FechamentoLinha,
  type PontoRow,
} from '@/lib/estagio-pontos-api';
import { checklistResumo } from '@/lib/estagio-ponto-checklist';
import { AjustePontoDialog } from './AjustePontoDialog';
import {
  buildRelatorioEstagioHTML,
  abrirRelatorioParaImpressao,
} from '@/lib/estagio-relatorio';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(
    d.getMonth() + 1
  ).padStart(2, '0')} ${fmtHora(iso)}`;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function mesRefLabel(mesValue: string): string {
  const [y, m] = mesValue.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} de ${y}`;
}

export const ValeTransportePainel: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const registradoPor = user?.pessoa?.id ?? null;

  const [mesValue, setMesValue] = useState<string>(currentMonthValue());
  const [linhas, setLinhas] = useState<FechamentoLinha[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [staffNomes, setStaffNomes] = useState<Record<string, string>>({});
  const [ajusteFor, setAjusteFor] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [removendo, setRemovendo] = useState<PontoRow | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  const carregar = useCallback(async () => {
    const [anoStr, mesStr] = mesValue.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    if (!ano || !mes) return;
    setLoading(true);
    setErro(null);
    try {
      const [estagiarios, pontos, nomes] = await Promise.all([
        fetchEstagiariosAtivos(),
        fetchPontosMes(ano, mes),
        fetchStaffNomes(),
      ]);
      setStaffNomes(nomes);
      const result: FechamentoLinha[] = await Promise.all(
        estagiarios.map(async (e) => {
          const pts = pontos.filter((p) => p.candidatura_id === e.id);
          const dias = agruparDias(pts);
          const termos = await fetchTermosContrato(e.id);
          const vtDia = termos?.vtDia ?? 0;
          const diasPresenca = dias.length;
          const totalHoras = dias.reduce((s, d) => s + d.horas, 0);
          return {
            candidaturaId: e.id,
            nome: e.nome,
            diasPresenca,
            totalHoras: Math.round(totalHoras * 100) / 100,
            vtDia,
            vtTotal: diasPresenca * vtDia,
            dias,
            pontos: pts,
          };
        })
      );
      setLinhas(result);
    } catch (err) {
      console.error('[ValeTransportePainel] erro ao carregar fechamento:', err);
      setErro('Não consegui carregar o fechamento do mês.');
    } finally {
      setLoading(false);
    }
  }, [mesValue]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totalVT = useMemo(
    () => linhas.reduce((s, l) => s + l.vtTotal, 0),
    [linhas]
  );

  const toggle = useCallback((id: string) => {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const gerarRelatorio = useCallback(
    async (l: FechamentoLinha) => {
      setGerandoId(l.candidaturaId);
      try {
        const vars = await fetchContratoVars(l.candidaturaId);
        if (!vars) {
          toast({
            title: 'Gere o contrato primeiro',
            description:
              'Os dados de clínica, instituição e supervisor vêm do contrato do estagiário.',
            variant: 'destructive',
          });
          return;
        }
        const html = buildRelatorioEstagioHTML({
          estagiarioNome: l.nome,
          mesRef: mesRefLabel(mesValue),
          vars,
          dias: l.dias,
          totalHoras: l.totalHoras,
        });
        if (!abrirRelatorioParaImpressao(html)) {
          toast({
            title: 'Pop-up bloqueado',
            description: 'Permita pop-ups para abrir o relatório em nova aba.',
            variant: 'destructive',
          });
        }
      } catch (err) {
        console.error('[ValeTransportePainel] erro ao gerar relatório:', err);
        toast({ title: 'Falha ao gerar o relatório', variant: 'destructive' });
      } finally {
        setGerandoId(null);
      }
    },
    [mesValue, toast]
  );

  const confirmarRemocao = useCallback(async () => {
    if (!removendo) return;
    setRemoveSaving(true);
    try {
      await desativarPonto(
        removendo.id,
        'Removido manualmente (ajuste de ponto).'
      );
      setRemovendo(null);
      await carregar();
      toast({ title: 'Batida removida' });
    } catch {
      toast({ title: 'Falha ao remover', variant: 'destructive' });
    } finally {
      setRemoveSaving(false);
    }
  }, [removendo, carregar, toast]);

  return (
    <div className="space-y-5">
      {/* Fechamento mensal */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-azul-respira" />
            Fechamento do mês
          </h3>
          <p className="text-sm text-muted-foreground">
            Dias de presença × valor/dia do contrato = vale-transporte a pagar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={mesValue}
            onChange={(e) => setMesValue(e.target.value)}
            className="h-9 w-auto text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {erro && <p className="text-sm text-vermelho-kids">{erro}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum estagiário ativo neste período.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-bege-fundo/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 w-8" />
                <th className="text-left font-medium px-4 py-2.5">
                  Estagiário
                </th>
                <th className="text-right font-medium px-4 py-2.5">Dias</th>
                <th className="text-right font-medium px-4 py-2.5">Horas</th>
                <th className="text-right font-medium px-4 py-2.5">VT/dia</th>
                <th className="text-right font-medium px-4 py-2.5">VT total</th>
                <th className="text-right font-medium px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const aberto = expandido.has(l.candidaturaId);
                return (
                  <React.Fragment key={l.candidaturaId}>
                    <tr
                      className="border-t border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => toggle(l.candidaturaId)}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {l.dias.length > 0 &&
                          (aberto ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          ))}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {l.nome}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {l.diasPresenca}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {l.totalHoras.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                        h
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {l.vtDia > 0 ? brl(l.vtDia) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                        {brl(l.vtTotal)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setAjusteFor({
                                id: l.candidaturaId,
                                nome: l.nome,
                              });
                            }}
                          >
                            <ClipboardEdit className="w-3.5 h-3.5" />
                            Ajustar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={gerandoId === l.candidaturaId}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void gerarRelatorio(l);
                            }}
                          >
                            {gerandoId === l.candidaturaId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Printer className="w-3.5 h-3.5" />
                            )}
                            Gerar
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {aberto && l.pontos.length > 0 && (
                      <tr className="bg-muted/20 border-t border-border/40">
                        <td />
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1.5">
                            Auditoria das batidas · quem registrou, onde e o
                            checklist da saída
                          </p>
                          <div className="space-y-1.5">
                            {l.pontos.map((p) => {
                              const resumo =
                                p.tipo === 'saida'
                                  ? checklistResumo(p.checklist)
                                  : null;
                              return (
                                <div
                                  key={p.id}
                                  className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                                >
                                  <span className="font-medium text-foreground w-24">
                                    {fmtDataHora(p.registrado_em)}
                                  </span>
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 rounded font-medium',
                                      p.tipo === 'entrada'
                                        ? 'bg-verde-pipa/25 text-roxo-titulo'
                                        : 'bg-amarelo-pipa/25 text-roxo-titulo'
                                    )}
                                  >
                                    {p.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                                  </span>
                                  {p.origem === 'manual' && (
                                    <span className="px-1.5 py-0.5 rounded bg-azul-respira/15 text-azul-respira font-medium">
                                      manual
                                    </span>
                                  )}
                                  <span>
                                    acesso:{' '}
                                    <span className="text-foreground">
                                      {p.registrado_por
                                        ? (staffNomes[p.registrado_por] ??
                                          'acesso removido')
                                        : '—'}
                                    </span>
                                  </span>
                                  {p.lat != null && p.lng != null ? (
                                    <a
                                      href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-azul-respira underline"
                                    >
                                      <MapPin className="w-3 h-3" />
                                      ver no mapa
                                      {p.precisao_m
                                        ? ` (±${Math.round(p.precisao_m)}m)`
                                        : ''}
                                    </a>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amarelo-pipa">
                                      <MapPinOff className="w-3 h-3" />
                                      sem localização
                                    </span>
                                  )}
                                  {resumo && (
                                    <span
                                      title={
                                        resumo.pendentes.length
                                          ? `Pendentes: ${resumo.pendentes
                                              .map((x) => x.label)
                                              .join('; ')}`
                                          : 'Tudo confirmado'
                                      }
                                      className={cn(
                                        'inline-flex items-center gap-1',
                                        resumo.pendentes.length
                                          ? 'text-amarelo-pipa'
                                          : 'text-verde-pipa'
                                      )}
                                    >
                                      <ListChecks className="w-3 h-3" />
                                      checklist {resumo.feitos}/{resumo.total}
                                    </span>
                                  )}
                                  {p.origem === 'manual' && p.observacao && (
                                    <span className="italic">
                                      — {p.observacao}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setRemovendo(p)}
                                    className="ml-auto inline-flex items-center gap-1 text-vermelho-kids hover:underline"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    remover
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/60 bg-bege-fundo/30">
                <td />
                <td className="px-4 py-2.5 font-semibold text-foreground">
                  Total
                </td>
                <td colSpan={3} />
                <td className="px-4 py-2.5 text-right font-bold text-foreground">
                  {brl(totalVT)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <AjustePontoDialog
        estagiario={ajusteFor}
        registradoPor={registradoPor}
        onSaved={() => void carregar()}
        onOpenChange={(o) => {
          if (!o) setAjusteFor(null);
        }}
      />

      <AlertDialog
        open={!!removendo}
        onOpenChange={(o) => {
          if (!o) setRemovendo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta batida?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `${removendo.tipo === 'entrada' ? 'Entrada' : 'Saída'} de ${fmtDataHora(
                    removendo.registrado_em
                  )}. A batida deixa de contar no fechamento e no relatório. Ação reversível apenas no banco.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSaving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarRemocao();
              }}
              disabled={removeSaving}
            >
              {removeSaving && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

ValeTransportePainel.displayName = 'ValeTransportePainel';
