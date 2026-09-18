// AI dev note: Relatórios (admin). Duas abas sobre a mesma base
// (RPC fn_relatorios_base, 1 chamada, sem nome de paciente):
// - Relatórios: o que aconteceu no período (tabelas + CSV);
// - Insights estratégicos: leituras que orientam decisão (as que embasaram as
//   metas de set/2026). Cálculos em src/lib/relatorios-analise.ts.

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
import { AlertTriangle, BarChart3, Lightbulb, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { prepararDataset, type RelatoriosBase } from '@/lib/relatorios-analise';
import {
  InsightsEstrategicos,
  RelatoriosTradicionais,
} from '@/components/domain/relatorios';

export const RelatoriosPage: React.FC = () => {
  const [base, setBase] = useState<RelatoriosBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'relatorios' | 'insights'>('relatorios');

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('fn_relatorios_base');
      if (e) throw new Error(e.message);
      setBase(data as RelatoriosBase);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ds = useMemo(() => (base ? prepararDataset(base) : null), [base]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            O que aconteceu na clínica e o que os números sugerem fazer
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => void carregar()}
          disabled={loading}
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="flex-1 text-sm">Não foi possível carregar: {error}</p>
            <Button variant="ghost" size="sm" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <Lightbulb className="h-4 w-4" />
            Insights estratégicos
          </TabsTrigger>
        </TabsList>

        {loading && !ds ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : ds ? (
          <>
            <TabsContent value="relatorios" className="mt-4">
              <RelatoriosTradicionais ds={ds} />
            </TabsContent>
            <TabsContent value="insights" className="mt-4">
              <InsightsEstrategicos ds={ds} />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
};
