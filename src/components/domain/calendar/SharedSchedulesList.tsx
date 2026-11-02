import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, Copy, Pencil, Sparkles } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { Badge } from '@/components/primitives/badge';
import { AgendasAutomaticasConfig } from './AgendasAutomaticasConfig';
import { SharedScheduleCreatorWizard } from './SharedScheduleCreatorWizard';
import { SharedScheduleEditorDialog } from './SharedScheduleEditorDialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  listSharedSchedulesByProfessional,
  deleteSharedSchedule,
  fetchSharedScheduleById,
} from '@/lib/shared-schedule-api';
import type {
  AgendaCompartilhadaStats,
  AgendaCompartilhadaCompleta,
  AgendaCompartilhadaFilters,
} from '@/types/shared-schedule';

// AI dev note: SharedSchedulesList - Domain
// Lista agendas compartilhadas com filtros, criação e edição.
// Lista compacta (uma linha por agenda) em vez de cartões: com as agendas
// automáticas são ~4 por profissional e os cartões poluíam a tela (dono,
// 02/11/2026). No topo, a configuração das agendas automáticas.

export interface SharedSchedulesListProps {
  profissionalId: string;
  userId: string;
  className?: string;
}

export const SharedSchedulesList = React.memo<SharedSchedulesListProps>(
  ({ profissionalId, userId, className }) => {
    const { toast } = useToast();
    const [agendas, setAgendas] = useState<AgendaCompartilhadaStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedAgenda, setSelectedAgenda] =
      useState<AgendaCompartilhadaCompleta | null>(null);
    const [agendaToDelete, setAgendaToDelete] = useState<string | null>(null);

    // Filtros - AI dev note: padrão é mostrar apenas ativas
    const [filters, setFilters] = useState<AgendaCompartilhadaFilters>({
      ativo: true,
    });
    const [searchTerm, setSearchTerm] = useState('');

    // Carregar agendas
    const loadAgendas = useCallback(async () => {
      try {
        setIsLoading(true);
        const result = await listSharedSchedulesByProfessional(
          profissionalId,
          filters
        );

        if (result.success && result.data) {
          setAgendas(result.data);
        }
      } catch (error) {
        console.error('Erro ao carregar agendas:', error);
        toast({
          title: 'Erro ao carregar agendas',
          description: 'Tente novamente mais tarde',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }, [profissionalId, filters, toast]);

    useEffect(() => {
      loadAgendas();
    }, [loadAgendas]);

    // Handlers
    const handleCopyLink = useCallback(
      async (token: string) => {
        try {
          const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
          const link = `${appUrl}/#/agenda-publica/${token}`;

          await navigator.clipboard.writeText(link);
          toast({
            title: 'Link copiado!',
            description: 'O link foi copiado para a área de transferência',
          });
        } catch (error) {
          console.error('Erro ao copiar link:', error);
          toast({
            title: 'Erro ao copiar link',
            variant: 'destructive',
          });
        }
      },
      [toast]
    );

    const handleEdit = useCallback(
      async (agendaId: string) => {
        try {
          // AI dev note: Buscar por ID permite editar agendas inativas também
          const result = await fetchSharedScheduleById(agendaId);
          if (result.success && result.data) {
            setSelectedAgenda(result.data);
            setIsEditorOpen(true);
          } else {
            throw new Error(result.error || 'Erro ao carregar agenda');
          }
        } catch (error) {
          console.error('Erro ao buscar agenda:', error);
          toast({
            title: 'Erro ao carregar agenda',
            description:
              error instanceof Error ? error.message : 'Erro desconhecido',
            variant: 'destructive',
          });
        }
      },
      [toast]
    );

    const handleDelete = useCallback((agendaId: string) => {
      setAgendaToDelete(agendaId);
    }, []);

    const confirmDelete = useCallback(async () => {
      if (!agendaToDelete) return;

      try {
        const result = await deleteSharedSchedule(agendaToDelete);

        if (!result.success) {
          throw new Error(result.error || 'Erro ao deletar agenda');
        }

        toast({
          title: 'Agenda deletada com sucesso!',
        });

        loadAgendas();
      } catch (error) {
        console.error('Erro ao deletar agenda:', error);
        toast({
          title: 'Erro ao deletar agenda',
          description:
            error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      } finally {
        setAgendaToDelete(null);
      }
    }, [agendaToDelete, toast, loadAgendas]);

    // Filtrar agendas localmente por busca; ativas na ordem das semanas,
    // as antigas da mais recente para a mais antiga
    const filteredAgendas = agendas
      .filter((agenda) =>
        agenda.titulo.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) =>
        a.ativo !== b.ativo
          ? a.ativo
            ? -1
            : 1
          : a.ativo
            ? a.data_inicio.localeCompare(b.data_inicio)
            : b.data_inicio.localeCompare(a.data_inicio)
      );

    const periodo = (de: string, ate: string) =>
      `${de.slice(8, 10)}/${de.slice(5, 7)} a ${ate.slice(8, 10)}/${ate.slice(5, 7)}`;

    return (
      <div className={cn('space-y-6', className)}>
        <AgendasAutomaticasConfig onChanged={loadAgendas} />

        {/* Header com filtros */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 space-y-4 sm:max-w-md">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar Agenda</Label>
              <Input
                id="search"
                type="text"
                placeholder="Digite o título da agenda..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select
                value={
                  filters.ativo === undefined
                    ? 'all'
                    : filters.ativo
                      ? 'active'
                      : 'inactive'
                }
                onValueChange={(value) => {
                  setFilters((prev) => ({
                    ...prev,
                    ativo: value === 'all' ? undefined : value === 'active',
                  }));
                }}
              >
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="inactive">Inativas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={() => setIsCreatorOpen(true)}>
            <Plus className="w-4 h-4" />
            Nova Agenda Compartilhada
          </Button>
        </div>

        {/* Lista de agendas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredAgendas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm
                ? 'Nenhuma agenda encontrada com este título'
                : 'Nenhuma agenda criada ainda'}
            </p>
            {/* "Nova Agenda Compartilhada" já está no topo da lista */}
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {filteredAgendas.map((agenda) => {
              const ocupados = Number(agenda.slots_ocupados) || 0;
              const total = Number(agenda.total_slots) || 0;
              const livres = Number(agenda.slots_disponiveis) || 0;
              return (
                <li
                  key={agenda.id}
                  className={cn(
                    'flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center',
                    !agenda.ativo && 'opacity-60'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(agenda.id)}
                        className="truncate text-left text-sm font-medium hover:underline"
                      >
                        {agenda.titulo}
                      </button>
                      {agenda.automatica && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[11px] font-normal"
                          title="Criada sozinha pelas agendas automáticas"
                        >
                          <Sparkles className="h-3 w-3" />
                          automática
                        </Badge>
                      )}
                      {!agenda.ativo && (
                        <Badge variant="secondary" className="text-[11px]">
                          inativa
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {periodo(agenda.data_inicio, agenda.data_fim)} ·{' '}
                      {ocupados} de {total} escolhidos · {livres} livre
                      {livres === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => handleCopyLink(agenda.token)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Link
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(agenda.id)}
                      aria-label={`Editar ${agenda.titulo}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(agenda.id)}
                      aria-label={`Excluir ${agenda.titulo}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Creator Wizard */}
        <SharedScheduleCreatorWizard
          isOpen={isCreatorOpen}
          onClose={() => setIsCreatorOpen(false)}
          profissionalId={profissionalId}
          userId={userId}
          onSuccess={() => {
            loadAgendas();
          }}
        />

        {/* Editor Dialog */}
        <SharedScheduleEditorDialog
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setSelectedAgenda(null);
          }}
          agenda={selectedAgenda}
          onSuccess={() => {
            loadAgendas();
          }}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={agendaToDelete !== null}
          onOpenChange={(open) => !open && setAgendaToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Agenda</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta agenda? Os agendamentos já
                realizados serão mantidos, mas o link não estará mais acessível.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
);

SharedSchedulesList.displayName = 'SharedSchedulesList';
