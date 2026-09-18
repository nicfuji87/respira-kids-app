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
import { ConfirmActionDialog } from '@/components/composed/ConfirmActionDialog';
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
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [metaToDelete, setMetaToDelete] = useState<MetaDashboard | null>(null);
  const [tab, setTab] = useState<'minhas' | 'equipe' | 'clinica'>('minhas');

  const now = new Date();
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [ano, setAno] = useState<number>(now.getFullYear());

  const loadMetas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filtros: MetasFilters = { mes, ano };
      const data = await fetchMetasDashboard(filtros);
      setMetas(data);
    } catch (err) {
      console.error('Erro ao carregar metas:', err);
      setError(
        err instanceof Error
          ? `Erro ao carregar metas: ${err.message}`
          : 'Erro ao carregar metas. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    loadMetas();
  }, [loadMetas]);

  // AI dev note: se o mês atual não tem metas mas o próximo tem (ex.: piloto
  // que começa no mês seguinte), abre direto no próximo. Só na primeira carga.
  const [pulouMes, setPulouMes] = useState(false);
  useEffect(() => {
    if (loading || pulouMes || metas.length > 0) return;
    setPulouMes(true);
    const prox = new Date(ano, mes, 1);
    fetchMetasDashboard({ mes: prox.getMonth() + 1, ano: prox.getFullYear() })
      .then((m) => {
        if (m.length > 0) {
          setMes(prox.getMonth() + 1);
          setAno(prox.getFullYear());
        }
      })
      .catch(() => undefined);
  }, [loading, pulouMes, metas.length, mes, ano]);

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

  const handleDelete = (meta: MetaDashboard) => {
    setMetaToDelete(meta);
  };

  const confirmDeleteMeta = async () => {
    if (!metaToDelete) return;
    const meta = metaToDelete;
    setMetaToDelete(null);
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

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="flex-1 text-sm text-foreground">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => void loadMetas()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

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

      {!loading && !error && metas.length === 0 && (
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
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">
              Reativação (secretaria):
            </strong>{' '}
            conta a família de paciente parado há 60+ dias, sem nada agendado,
            uma vez a cada 90 dias. Vira reativação se o paciente fizer sessão
            (de qualquer serviço) em até 30 dias depois do contato. O bônus por
            nível só vale com a meta de contatos batida.
          </p>
          <p>
            <strong className="text-foreground">
              Pesquisa de experiência (secretaria):
            </strong>{' '}
            conta o convite para famílias com 3+ sessões nos últimos 60 dias,
            uma vez a cada 30 dias, e a quantidade de respostas do mês. A nota
            da pesquisa nunca entra na meta.
          </p>
          <p>
            <strong className="text-foreground">Evoluções (clínica):</strong>{' '}
            porcentagem das sessões realizadas com evolução, e das escritas em
            até 24h. Conta sessões de até ontem. Faltas marcadas não entram.
          </p>
          <p>
            Os valores são recalculados de hora em hora (8h às 20h). O botão{' '}
            <strong>Recalcular</strong> atualiza na hora.
          </p>
        </CardContent>
      </Card>

      <CreateMetaDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={loadMetas}
      />

      <ConfirmActionDialog
        open={!!metaToDelete}
        onOpenChange={(open) => {
          if (!open) setMetaToDelete(null);
        }}
        title={`Remover a meta "${metaToDelete?.titulo || ''}"?`}
        description="O progresso registrado para esta meta será perdido. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={confirmDeleteMeta}
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
