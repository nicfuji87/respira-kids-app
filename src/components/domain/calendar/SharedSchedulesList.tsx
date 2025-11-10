import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2 } from 'lucide-react';

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
import { ScheduleCard } from '@/components/composed/ScheduleCard';
import { SharedScheduleCreatorWizard } from './SharedScheduleCreatorWizard';
import { SharedScheduleEditorDialog } from './SharedScheduleEditorDialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/primitives/use-toast';
import {
  listSharedSchedulesByProfessional,
  deleteSharedSchedule,
  fetchSharedScheduleByToken,
} from '@/lib/shared-schedule-api';
import type {
  AgendaCompartilhadaStats,
  AgendaCompartilhadaCompleta,
  AgendaCompartilhadaFilters,
} from '@/types/shared-schedule';

// AI dev note: SharedSchedulesList - Domain
// Lista agendas compartilhadas com filtros, criação e edição
// Usa ScheduleCard (Composed) para exibir cada agenda

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

    // Filtros
    const [filters, setFilters] = useState<AgendaCompartilhadaFilters>({
      ativo: undefined,
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
          // Buscar agenda completa
          const agenda = agendas.find((a) => a.id === agendaId);
          if (!agenda) return;

          const result = await fetchSharedScheduleByToken(agenda.token);
          if (result.success && result.data) {
            setSelectedAgenda(result.data);
            setIsEditorOpen(true);
          }
        } catch (error) {
          console.error('Erro ao buscar agenda:', error);
          toast({
            title: 'Erro ao carregar agenda',
            variant: 'destructive',
          });
        }
      },
      [agendas, toast]
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

    // Filtrar agendas localmente por busca
    const filteredAgendas = agendas.filter((agenda) =>
      agenda.titulo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className={cn('space-y-6', className)}>
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

          <Button onClick={() => setIsCreatorOpen(true)} size="lg">
            <Plus className="w-4 h-4 mr-2" />
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
            {!searchTerm && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreatorOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Agenda
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgendas.map((agenda) => (
              <ScheduleCard
                key={agenda.id}
                agenda={agenda}
                onCopyLink={handleCopyLink}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
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
