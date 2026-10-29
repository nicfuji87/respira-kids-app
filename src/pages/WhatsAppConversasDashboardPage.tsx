// AI dev note: Central de Conversas (WhatsApp). Admin + secretaria.
// Reformulada em 28/10/2026: deixou de ser relatório da IA e virou central de
// ação e gestão, em quatro abas:
//   Hoje        o que precisa ser feito e por quem (HojeTab)
//   Desempenho  atendimento, demanda, funil e Ju (DesempenhoTab)
//   Qualidade   falhas da operação, atrito, automação, sentimento (QualidadeTab)
//   Conversas   busca, filtros e revisão (lista com as análises da IA)
// Hoje/Desempenho/Qualidade vêm agregados do banco (conversas_central.sql).
// A lista completa (get_whatsapp_conversas_enriquecidas, ~2 MB) só carrega
// quando a aba Conversas é aberta.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { Button } from '@/components/primitives/button';
import { Card, CardContent } from '@/components/primitives/card';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  WhatsAppDashboardFilters,
  WhatsAppConversasList,
} from '@/components/domain/whatsapp-conversas';
import { HojeTab } from '@/components/domain/whatsapp-conversas/central/HojeTab';
import { DesempenhoTab } from '@/components/domain/whatsapp-conversas/central/DesempenhoTab';
import { QualidadeTab } from '@/components/domain/whatsapp-conversas/central/QualidadeTab';
import {
  applyFilters,
  fetchWhatsAppConversas,
  updateFollowupStatus,
} from '@/lib/whatsapp-conversas-api';
import type {
  FollowupStatus,
  WhatsAppConversaRow,
  WhatsAppDashboardFilters as Filters,
} from '@/types/whatsapp-conversas';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  BarChart3,
  ListTodo,
  MessagesSquare,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/composed/PageHeader';

type Aba = 'hoje' | 'desempenho' | 'qualidade' | 'conversas';
type Segmento = 'todas' | 'revisao' | 'fila' | 'reclamacoes';

const SEGMENTOS: Array<{ valor: Segmento; label: string }> = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'revisao', label: 'Para revisar' },
  { valor: 'fila', label: 'Follow-up pendente' },
  { valor: 'reclamacoes', label: 'Reclamações' },
];

export const WhatsAppConversasDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [aba, setAba] = useState<Aba>('hoje');
  const [segmento, setSegmento] = useState<Segmento>('todas');

  // Aba Conversas (lista completa, carregada sob demanda)
  const [rows, setRows] = useState<WhatsAppConversaRow[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const carregarConversas = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setRows(await fetchWhatsAppConversas());
    } catch (err) {
      console.error('[Conversas] erro ao carregar:', err);
      setErro('Não conseguimos carregar as conversas. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (aba === 'conversas' && rows === null && !carregando) {
      void carregarConversas();
    }
  }, [aba, rows, carregando, carregarConversas]);

  const filtradas = useMemo(() => {
    const base = applyFilters(rows ?? [], filters);
    const porSegmento = base.filter((r) => {
      if (segmento === 'revisao') return r.followup_status === 'em_revisao';
      if (segmento === 'fila')
        return r.necessita_followup && r.followup_status === 'pendente';
      if (segmento === 'reclamacoes') return r.reclamacao_identificada;
      return true;
    });
    return [...porSegmento].sort(
      (a, b) =>
        new Date(b.ultima_mensagem_em ?? b.created_at).getTime() -
        new Date(a.ultima_mensagem_em ?? a.created_at).getTime()
    );
  }, [rows, filters, segmento]);

  const contagemSegmento = useMemo(() => {
    const base = applyFilters(rows ?? [], filters);
    return {
      todas: base.length,
      revisao: base.filter((r) => r.followup_status === 'em_revisao').length,
      fila: base.filter(
        (r) => r.necessita_followup && r.followup_status === 'pendente'
      ).length,
      reclamacoes: base.filter((r) => r.reclamacao_identificada).length,
    } as Record<Segmento, number>;
  }, [rows, filters]);

  const mudarFollowup = useCallback(
    async (row: WhatsAppConversaRow, status: FollowupStatus) => {
      setBusyId(row.id);
      try {
        await updateFollowupStatus(row.id, status, user?.pessoa?.id);
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  followup_status: status,
                  followup_concluido_em:
                    status === 'concluido' ? new Date().toISOString() : null,
                  followup_concluido_por:
                    status === 'concluido' ? user?.pessoa?.id || null : null,
                }
              : r
          )
        );
        toast({
          title:
            status === 'concluido'
              ? 'Marcada como concluída'
              : status === 'ignorado'
                ? 'Marcada como sem necessidade'
                : 'Reaberta',
        });
      } catch {
        toast({
          title: 'Não foi possível atualizar',
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [toast, user?.pessoa?.id]
  );

  return (
    <div className="space-y-5">
      <PageHeader description="O que precisa de atenção agora, como está o atendimento e onde estamos falhando com as famílias." />

      <Tabs
        value={aba}
        onValueChange={(v) => setAba(v as Aba)}
        className="space-y-4"
      >
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="hoje" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Hoje
          </TabsTrigger>
          <TabsTrigger value="desempenho" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Desempenho
          </TabsTrigger>
          <TabsTrigger value="qualidade" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Qualidade
          </TabsTrigger>
          <TabsTrigger value="conversas" className="gap-2">
            <MessagesSquare className="h-4 w-4" />
            Conversas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hoje">
          <HojeTab
            onVerRevisao={() => {
              setSegmento('revisao');
              setAba('conversas');
            }}
          />
        </TabsContent>

        <TabsContent value="desempenho">
          <DesempenhoTab />
        </TabsContent>

        <TabsContent value="qualidade">
          <QualidadeTab />
        </TabsContent>

        <TabsContent value="conversas" className="space-y-4">
          {erro && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm flex-1">{erro}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void carregarConversas()}
                >
                  Tentar de novo
                </Button>
              </CardContent>
            </Card>
          )}

          <WhatsAppDashboardFilters filters={filters} onChange={setFilters} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {SEGMENTOS.map((s) => (
                <Button
                  key={s.valor}
                  size="sm"
                  variant={segmento === s.valor ? 'default' : 'outline'}
                  onClick={() => setSegmento(s.valor)}
                  className="gap-1.5"
                >
                  {s.label}
                  {rows && (
                    <span className="text-xs opacity-80 tabular-nums">
                      {contagemSegmento[s.valor]}
                    </span>
                  )}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void carregarConversas()}
              disabled={carregando}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCw
                className={cn('h-4 w-4', carregando && 'animate-spin')}
              />
              Atualizar
            </Button>
          </div>

          {segmento === 'revisao' && (
            <p className="text-sm text-muted-foreground">
              Follow-ups antigos sem prova no sistema de que foram resolvidos.
              Para cada um:
              <strong> Concluir</strong> se já foi tratado,{' '}
              <strong>Ignorar</strong> se não precisa mais. Se a família
              escrever de novo pedindo algo, ele volta sozinho para a fila.
            </p>
          )}

          {rows === null ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <WhatsAppConversasList
              rows={filtradas}
              emptyMessage="Nenhuma conversa para esses filtros."
              busyId={busyId}
              onConcluir={(r) => void mudarFollowup(r, 'concluido')}
              onIgnorar={(r) => void mudarFollowup(r, 'ignorado')}
              onReabrir={(r) => void mudarFollowup(r, 'pendente')}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
