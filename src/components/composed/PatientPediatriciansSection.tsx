import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Stethoscope, Plus, Trash2, Loader2 } from 'lucide-react';
import { PediatricianStep, type PediatricianData } from './PediatricianStep';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: Gerenciamento completo de pediatras do paciente
// Permite adicionar, editar e excluir pediatras
// Suporta pediatras novos ou existentes no sistema

interface Pediatrician {
  id: string; // ID do paciente_pediatra
  pediatra_id: string; // ID do pessoa_pediatra
  pessoa_id: string; // ID da pessoas
  nome: string;
  crm?: string;
  especialidade?: string;
  data_inicio?: string;
  observacoes?: string;
}

interface PatientPediatriciansSectionProps {
  patientId: string;
  className?: string;
}

export const PatientPediatriciansSection: React.FC<
  PatientPediatriciansSectionProps
> = ({ patientId, className }) => {
  const [pediatricians, setPediatricians] = useState<Pediatrician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Carregar pediatras do paciente
  const loadPediatricians = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('paciente_pediatra')
        .select(
          `
          id,
          pediatra_id,
          data_inicio,
          observacoes,
          pessoa_pediatra:pediatra_id (
            id,
            pessoa_id,
            crm,
            especialidade,
            pessoas:pessoa_id (
              id,
              nome
            )
          )
        `
        )
        .eq('paciente_id', patientId)
        .eq('ativo', true);

      if (error) {
        console.error('❌ Erro ao buscar pediatras:', error);
        throw error;
      }

      // Transformar dados
      const pediatras: Pediatrician[] = (data || []).map((item) => {
        // AI dev note: pessoa_pediatra pode ser array ou objeto dependendo da query
        const pessoaPediatra = Array.isArray(item.pessoa_pediatra)
          ? item.pessoa_pediatra[0]
          : item.pessoa_pediatra;

        const pessoas = Array.isArray(pessoaPediatra?.pessoas)
          ? pessoaPediatra.pessoas[0]
          : pessoaPediatra?.pessoas;

        return {
          id: item.id,
          pediatra_id: item.pediatra_id,
          pessoa_id: pessoaPediatra?.pessoa_id || '',
          nome: pessoas?.nome || 'Nome não encontrado',
          crm: pessoaPediatra?.crm,
          especialidade: pessoaPediatra?.especialidade,
          data_inicio: item.data_inicio,
          observacoes: item.observacoes,
        };
      });

      setPediatricians(pediatras);
    } catch (err) {
      console.error('Erro ao carregar pediatras:', err);
      toast({
        title: 'Erro ao carregar pediatras',
        description: 'Não foi possível carregar a lista de pediatras',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadPediatricians();
  }, [loadPediatricians]);

  // Adicionar pediatra
  const handleAddPediatrician = async (data: PediatricianData) => {
    try {
      console.log('➕ [PatientPediatricians] Adicionando pediatra:', data);

      let pediatraId: string;

      // Se é novo, criar pediatra completo usando função RPC
      if (data.isNew && !data.noPediatrician) {
        console.log('🆕 [PatientPediatricians] Criando novo pediatra via RPC');

        // AI dev note: Usar função RPC que bypassa RLS de forma segura
        // Valida permissões (admin/secretaria) no backend
        const { data: result, error: rpcError } = await supabase.rpc(
          'create_and_link_pediatrician',
          {
            p_paciente_id: patientId,
            p_nome: data.nome,
            p_crm: data.crm || null,
          }
        );

        if (rpcError || !result || result.length === 0) {
          console.error('❌ Erro ao criar pediatra via RPC:', rpcError);
          throw new Error(
            result?.[0]?.message || 'Erro ao criar registro de pediatra'
          );
        }

        if (!result[0].success) {
          throw new Error(result[0].message || 'Erro ao criar pediatra');
        }

        console.log('✅ Novo pediatra criado via RPC:', result[0].pediatra_id);
        // Não precisa vincular - a função RPC já faz isso
      } else if (data.id) {
        // Usar pediatra existente - apenas vincular
        pediatraId = data.id;
        console.log('✅ Usando pediatra existente:', pediatraId);

        // Vincular ao paciente
        console.log('🔗 Vinculando pediatra ao paciente...');
        const { error: vinculoError } = await supabase
          .from('paciente_pediatra')
          .insert({
            paciente_id: patientId,
            pediatra_id: pediatraId,
            ativo: true,
          });

        if (vinculoError) {
          console.error('❌ Erro ao vincular pediatra:', vinculoError);
          throw new Error('Erro ao vincular pediatra ao paciente');
        }
      } else {
        throw new Error('Dados do pediatra inválidos');
      }

      toast({
        title: 'Pediatra adicionado!',
        description: 'Pediatra foi associado ao paciente com sucesso',
      });

      setIsDialogOpen(false);
      loadPediatricians();
    } catch (err) {
      console.error('Erro ao adicionar pediatra:', err);
      toast({
        title: 'Erro ao adicionar pediatra',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  // Remover pediatra (soft delete)
  const handleRemovePediatrician = async (pediatricianId: string) => {
    try {
      setIsDeleting(pediatricianId);

      console.log(
        '🗑️ [PatientPediatricians] Removendo pediatra:',
        pediatricianId
      );

      const { error } = await supabase
        .from('paciente_pediatra')
        .update({ ativo: false })
        .eq('id', pediatricianId);

      if (error) {
        console.error('❌ Erro ao remover pediatra:', error);
        throw error;
      }

      toast({
        title: 'Pediatra removido',
        description: 'Pediatra foi desvinculado do paciente',
      });

      loadPediatricians();
    } catch (err) {
      console.error('Erro ao remover pediatra:', err);
      toast({
        title: 'Erro ao remover pediatra',
        description: 'Não foi possível remover o pediatra',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Stethoscope className="h-4 w-4" />
          Médicos Pediatras
        </h4>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pediatras...
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Médicos Pediatras
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="h-8 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {pediatricians.length > 0
              ? 'Adicionar Outro'
              : 'Adicionar Pediatra'}
          </Button>
        </div>

        <div className="space-y-3">
          {pediatricians.length > 0 ? (
            pediatricians.map((ped) => (
              <div
                key={ped.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <Stethoscope className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{ped.nome}</p>
                  {ped.crm && ped.crm !== 'Não informado' && (
                    <p className="text-sm text-muted-foreground">
                      <strong>CRM:</strong> {ped.crm}
                    </p>
                  )}
                  {ped.especialidade && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Especialidade:</strong> {ped.especialidade}
                    </p>
                  )}
                  {ped.data_inicio && (
                    <p className="text-xs text-muted-foreground">
                      Desde:{' '}
                      {new Date(ped.data_inicio).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePediatrician(ped.id)}
                  disabled={isDeleting === ped.id}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {isDeleting === ped.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          ) : (
            <div className="text-center py-6 border-2 border-dashed rounded-lg">
              <Stethoscope className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Nenhum pediatra cadastrado
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Pediatra
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialog para adicionar pediatra */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Pediatra</DialogTitle>
          </DialogHeader>

          <PediatricianStep
            onContinue={handleAddPediatrician}
            onBack={() => setIsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
