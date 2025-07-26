import React, { useState, useEffect, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Badge } from '@/components/primitives/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Plus, UserPlus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/primitives/use-toast';

// AI dev note: ResponsibleSelect é um componente Composed para gerenciar responsáveis
// Permite adicionar, editar e remover responsáveis de uma pessoa

export interface ResponsibleSelectProps {
  personId?: string; // ID da pessoa para qual estamos gerenciando responsáveis
  className?: string;
}

interface Pessoa {
  id: string;
  nome: string;
  email: string | null;
  tipo_pessoa_nome: string | null;
}

interface Responsabilidade {
  id: string;
  id_responsavel: string;
  nome_responsavel: string;
  tipo_responsabilidade: 'legal' | 'financeiro' | 'ambos';
}

export const ResponsibleSelect: React.FC<ResponsibleSelectProps> = ({
  personId,
  className,
}) => {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [responsabilidades, setResponsabilidades] = useState<
    Responsabilidade[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedTipo, setSelectedTipo] = useState<
    'legal' | 'financeiro' | 'ambos'
  >('ambos');
  const [saving, setSaving] = useState(false);

  const fetchResponsabilidades = useCallback(async () => {
    if (!personId) return;

    try {
      const { data: respData, error: respError } = await supabase
        .from('pessoa_responsaveis')
        .select(
          `
          id,
          id_responsavel,
          tipo_responsabilidade,
          responsavel:pessoas!pessoa_responsaveis_id_responsavel_fkey(nome)
        `
        )
        .eq('id_pessoa', personId)
        .eq('ativo', true);

      if (respError) {
        console.error('Erro ao carregar responsabilidades:', respError);
      } else {
        const responsabilidadesFormatted = (respData || []).map((resp) => ({
          id: resp.id,
          id_responsavel: resp.id_responsavel,
          nome_responsavel:
            (resp as { responsavel?: { nome?: string } }).responsavel?.nome ||
            'Nome não encontrado',
          tipo_responsabilidade: resp.tipo_responsabilidade,
        }));
        setResponsabilidades(responsabilidadesFormatted);
      }
    } catch (error) {
      console.error('Erro ao carregar responsabilidades:', error);
    }
  }, [personId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!personId) {
        setLoading(false);
        return;
      }

      try {
        // Carregar pessoas que podem ser responsáveis
        const { data: pessoasData, error: pessoasError } = await supabase
          .from('vw_usuarios_admin')
          .select('id, nome, email, tipo_pessoa_nome')
          .neq('id', personId) // Excluir a própria pessoa
          .order('nome');

        if (pessoasError) {
          console.error('Erro ao carregar pessoas:', pessoasError);
        } else {
          setPessoas(pessoasData || []);
        }

        // Carregar responsabilidades existentes
        await fetchResponsabilidades();
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [personId, fetchResponsabilidades]);

  const handleAddResponsible = async () => {
    if (!personId || !selectedPersonId || !selectedTipo) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('pessoa_responsaveis').insert({
        id_pessoa: personId,
        id_responsavel: selectedPersonId,
        tipo_responsabilidade: selectedTipo,
        ativo: true,
      });

      if (error) {
        console.error('Erro ao adicionar responsável:', error);
        toast({
          title: 'Erro ao adicionar responsável',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Responsável adicionado com sucesso',
      });

      // Recarregar responsabilidades
      await fetchResponsabilidades();

      // Limpar formulário
      setSelectedPersonId('');
      setSelectedTipo('ambos');
      setShowAddModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveResponsible = async (responsibilidadeId: string) => {
    try {
      const { error } = await supabase
        .from('pessoa_responsaveis')
        .update({ ativo: false })
        .eq('id', responsibilidadeId);

      if (error) {
        console.error('Erro ao remover responsável:', error);
        toast({
          title: 'Erro ao remover responsável',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Responsável removido com sucesso',
      });

      // Recarregar responsabilidades
      await fetchResponsabilidades();
    } catch (error) {
      console.error('Erro ao remover responsável:', error);
    }
  };

  const getResponsabilityBadgeVariant = (tipo: string) => {
    switch (tipo) {
      case 'legal':
        return 'default';
      case 'financeiro':
        return 'secondary';
      case 'ambos':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getResponsabilityLabel = (tipo: string) => {
    switch (tipo) {
      case 'legal':
        return 'Legal';
      case 'financeiro':
        return 'Financeiro';
      case 'ambos':
        return 'Legal e Financeiro';
      default:
        return tipo;
    }
  };

  if (!personId) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>Responsáveis</Label>
        <p className="text-sm text-muted-foreground">
          Selecione um usuário primeiro para gerenciar responsáveis
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Label>Responsáveis</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddModal(true)}
          disabled={loading}
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : responsabilidades.length > 0 ? (
        <div className="space-y-2">
          {responsabilidades.map((resp) => (
            <div
              key={resp.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{resp.nome_responsavel}</span>
                <Badge
                  variant={getResponsabilityBadgeVariant(
                    resp.tipo_responsabilidade
                  )}
                >
                  {getResponsabilityLabel(resp.tipo_responsabilidade)}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveResponsible(resp.id)}
                title="Remover responsável"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum responsável cadastrado
        </p>
      )}

      {/* Modal para adicionar responsável */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Responsável
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pessoa</Label>
              <Select
                value={selectedPersonId}
                onValueChange={setSelectedPersonId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((pessoa) => (
                    <SelectItem key={pessoa.id} value={pessoa.id}>
                      <div className="flex flex-col">
                        <span>{pessoa.nome}</span>
                        {pessoa.email && (
                          <span className="text-xs text-muted-foreground">
                            {pessoa.email}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Responsabilidade</Label>
              <Select
                value={selectedTipo}
                onValueChange={(value: 'legal' | 'financeiro' | 'ambos') =>
                  setSelectedTipo(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="ambos">Legal e Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setSelectedPersonId('');
                setSelectedTipo('ambos');
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddResponsible}
              disabled={!selectedPersonId || saving}
            >
              {saving ? 'Adicionando...' : 'Adicionar Responsável'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

ResponsibleSelect.displayName = 'ResponsibleSelect';
