// AI dev note: MetasPage - Aba principal do programa de metas
// Mostra metas pessoais (todos) + metas da equipe (admin pode gerenciar)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { MetaCard } from '@/components/composed/MetaCard';
import { MetasOverview } from '@/components/composed/MetasOverview';
import { CreateMetaDialog } from '@/components/composed/CreateMetaDialog';
import { useToast } from '@/components/primitives/use-toast';
import {
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import {
  deleteMeta,
  fetchMetasDashboard,
  refreshTodasMetasAtivas,
} from '@/lib/metas-api';
import { useAuth } from '@/hooks/useAuth';
import type { MetaDashboard, MetasFilters } from '@/types/metas';

export const MetasPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const userRole = user?.pessoa?.role as
    | 'admin'
    | 'profissional'
    | 'secretaria'
    | undefined;
  const pessoaId = user?.pessoa?.id;
  const isAdmin = userRole === 'admin';

  const [metas, setMetas] = useState<MetaDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<'minhas' | 'equipe' | 'clinica'>('minhas');

  const now = new Date();
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [ano, setAno] = useState<number>(now.getFullYear());

  const loadMetas = useCallback(async () => {
    setLoading(true);
    try {
      const filtros: MetasFilters = { mes, ano };
      const data = await fetchMetasDashboard(filtros);
      setMetas(data);
    } catch (err) {
      console.error('Erro ao carregar metas:', err);
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    loadMetas();
  }, [loadMetas]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTodasMetasAtivas();
      await loadMetas();
      toast({
        title: 'Metas atualizadas',
        description: 'Valores recalculados com sucesso.',
      });
    } catch (err) {
      toast({
        title: 'Erro ao atualizar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (meta: MetaDashboard) => {
    if (!window.confirm(`Remover a meta "${meta.titulo}"?`)) return;
    try {
      await deleteMeta(meta.id);
      toast({ title: 'Meta removida' });
      await loadMetas();
    } catch (err) {
      toast({
        title: 'Erro ao remover',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const minhasMetas = useMemo(
    () => metas.filter((m) => m.pessoa_id === pessoaId),
    [metas, pessoaId]
  );

  const metasClinica = useMemo(
    () => metas.filter((m) => m.escopo === 'clinica'),
    [metas]
  );

  const metasEquipe = useMemo(
    () =>
      metas.filter(
        (m) => m.escopo === 'individual' && m.pessoa_id !== pessoaId
      ),
    [metas, pessoaId]
  );

  const visibleMetas =
    tab === 'minhas'
      ? minhasMetas
      : tab === 'clinica'
        ? metasClinica
        : metasEquipe;

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return [atual - 1, atual, atual + 1];
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-rosa-suave" />
            Metas
          </h1>
          <p className="text-muted-foreground">
            Acompanhe seu desempenho e as metas da clínica
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                'Janeiro',
                'Fevereiro',
                'Março',
                'Abril',
                'Maio',
                'Junho',
                'Julho',
                'Agosto',
                'Setembro',
                'Outubro',
                'Novembro',
                'Dezembro',
              ].map((nome, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1"
          >
            <RefreshCw
              className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            />
            Recalcular
          </Button>

          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Nova Meta
            </Button>
          )}
        </div>
      </div>

      <MetasOverview metas={visibleMetas} loading={loading} />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'minhas' | 'equipe' | 'clinica')}
      >
        <TabsList>
          <TabsTrigger value="minhas" className="gap-1">
            Minhas metas
            <Badge variant="secondary" className="ml-1">
              {minhasMetas.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="clinica" className="gap-1">
            Clínica
            <Badge variant="secondary" className="ml-1">
              {metasClinica.length}
            </Badge>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="equipe" className="gap-1">
              Equipe
              <Badge variant="secondary" className="ml-1">
                {metasEquipe.length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="minhas" className="mt-4">
          <MetasGrid
            metas={minhasMetas}
            loading={loading}
            emptyText="Você ainda não tem metas para esse mês."
            onDelete={isAdmin ? handleDelete : undefined}
          />
        </TabsContent>

        <TabsContent value="clinica" className="mt-4">
          <MetasGrid
            metas={metasClinica}
            loading={loading}
            emptyText="Nenhuma meta da clínica nesse mês."
            onDelete={isAdmin ? handleDelete : undefined}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="equipe" className="mt-4">
            <MetasGrid
              metas={metasEquipe}
              loading={loading}
              emptyText="Nenhuma meta de equipe nesse mês."
              onDelete={handleDelete}
              showOwner
            />
          </TabsContent>
        )}
      </Tabs>

      {!loading && metas.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Não há metas cadastradas para o período selecionado.
            {isAdmin && ' Clique em "Nova Meta" para começar.'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-azul-respira" />
            Sobre o programa de metas
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>
            Os valores das metas são recalculados automaticamente conforme as
            consultas, evoluções, confirmações e contatos são registrados no
            sistema.
          </p>
          <p>
            Você pode forçar uma atualização imediata usando o botão{' '}
            <strong>Recalcular</strong>.
          </p>
        </CardContent>
      </Card>

      <CreateMetaDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={loadMetas}
      />
    </div>
  );
};

interface MetasGridProps {
  metas: MetaDashboard[];
  loading: boolean;
  emptyText: string;
  onDelete?: (m: MetaDashboard) => void;
  showOwner?: boolean;
}

const MetasGrid: React.FC<MetasGridProps> = ({
  metas,
  loading,
  emptyText,
  onDelete,
  showOwner,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (metas.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        <Target className="h-10 w-10 mx-auto mb-2 opacity-40" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {metas.map((m) => (
        <MetaCard
          key={m.id}
          meta={m}
          onDelete={onDelete}
          showOwner={showOwner}
        />
      ))}
    </div>
  );
};

MetasPage.displayName = 'MetasPage';
