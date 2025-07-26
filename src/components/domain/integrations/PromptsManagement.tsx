import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Edit, Save, Eye } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Switch } from '@/components/primitives/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { RichTextEditor } from '@/components/primitives/rich-text-editor';
import { useToast } from '@/components/primitives/use-toast';
import type { AiPrompt, AiPromptCreate } from '@/types/integrations';
import { cn } from '@/lib/utils';

// AI dev note: PromptsManagement é um componente Domain para gerenciar prompts de IA
// Permite criar, editar e visualizar prompts usados no processamento de IA

export interface PromptsManagementProps {
  className?: string;
}

export const PromptsManagement = React.memo<PromptsManagementProps>(
  ({ className }) => {
    const [prompts, setPrompts] = useState<AiPrompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<AiPrompt | null>(null);
    const [previewPrompt, setPreviewPrompt] = useState<AiPrompt | null>(null);
    const [formData, setFormData] = useState<Partial<AiPromptCreate>>({});
    const [saving, setSaving] = useState(false);

    const { toast } = useToast();

    // Simular carregamento inicial (será substituído pela API real)
    useEffect(() => {
      const loadPrompts = async () => {
        setLoading(true);
        try {
          // TODO: Implementar fetchPrompts quando a API estiver pronta
          console.log('📡 Carregando prompts de IA...');

          // Dados mockados para desenvolvimento
          const mockPrompts: AiPrompt[] = [
            {
              id: '1',
              prompt_name: 'evolution_format',
              prompt_title: 'Formatação de Evolução',
              prompt_description:
                'Prompt para formatar evoluções de pacientes de forma estruturada',
              prompt_content:
                'Você é um assistente especializado em formatação de evoluções médicas. Sua tarefa é organizar as informações fornecidas de forma clara e estruturada, seguindo o padrão clínico adequado.',
              is_active: true,
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
            {
              id: '2',
              prompt_name: 'history_format',
              prompt_title: 'Formatação de Histórico',
              prompt_description:
                'Prompt para formatar histórico de atendimentos de forma cronológica',
              prompt_content:
                'Você é um assistente especializado em organização de históricos médicos. Sua tarefa é estruturar o histórico de atendimentos de forma cronológica e clara, destacando informações relevantes.',
              is_active: true,
              created_at: '2024-01-15T10:00:00Z',
              updated_at: '2024-01-15T10:00:00Z',
            },
          ];

          setPrompts(mockPrompts);
        } catch (error) {
          console.error('❌ Erro ao carregar prompts:', error);
          toast({
            title: 'Erro ao carregar prompts',
            description: 'Falha ao carregar prompts de IA',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      };

      loadPrompts();
    }, [toast]);

    const handleCreatePrompt = async () => {
      if (
        !formData.prompt_name ||
        !formData.prompt_title ||
        !formData.prompt_content
      ) {
        toast({
          title: 'Campos obrigatórios',
          description: 'Preencha todos os campos obrigatórios',
          variant: 'destructive',
        });
        return;
      }

      setSaving(true);
      try {
        // TODO: Implementar createPrompt quando a API estiver pronta
        console.log('🤖 Criando prompt:', formData);

        toast({
          title: 'Prompt criado',
          description: `Prompt "${formData.prompt_title}" criado com sucesso`,
        });

        // Reset form
        setFormData({});
        setShowCreateModal(false);

        // Recarregar lista (será substituído pela chamada real da API)
        // await loadPrompts();
      } catch (error) {
        console.error('❌ Erro ao criar prompt:', error);
        toast({
          title: 'Erro ao criar prompt',
          description: 'Falha ao salvar prompt de IA',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const handleEditPrompt = (prompt: AiPrompt) => {
      setEditingPrompt(prompt);
      setFormData({
        prompt_name: prompt.prompt_name,
        prompt_title: prompt.prompt_title,
        prompt_description: prompt.prompt_description,
        prompt_content: prompt.prompt_content,
        is_active: prompt.is_active,
      });
      setShowEditModal(true);
    };

    const handleUpdatePrompt = async () => {
      if (
        !editingPrompt ||
        !formData.prompt_title ||
        !formData.prompt_content
      ) {
        toast({
          title: 'Campos obrigatórios',
          description: 'Preencha todos os campos obrigatórios',
          variant: 'destructive',
        });
        return;
      }

      setSaving(true);
      try {
        // TODO: Implementar updatePrompt quando a API estiver pronta
        console.log('🔄 Atualizando prompt:', editingPrompt.id, formData);

        toast({
          title: 'Prompt atualizado',
          description: `Prompt "${formData.prompt_title}" atualizado com sucesso`,
        });

        // Reset form
        setFormData({});
        setEditingPrompt(null);
        setShowEditModal(false);

        // Recarregar lista (será substituído pela chamada real da API)
        // await loadPrompts();
      } catch (error) {
        console.error('❌ Erro ao atualizar prompt:', error);
        toast({
          title: 'Erro ao atualizar prompt',
          description: 'Falha ao atualizar prompt de IA',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    const togglePromptStatus = async (prompt: AiPrompt) => {
      try {
        // TODO: Implementar togglePromptStatus quando a API estiver pronta
        console.log(
          '🔄 Alterando status do prompt:',
          prompt.id,
          'para:',
          !prompt.is_active
        );

        toast({
          title: `Prompt ${prompt.is_active ? 'desativado' : 'ativado'}`,
          description: `"${prompt.prompt_title}" ${prompt.is_active ? 'desativado' : 'ativado'} com sucesso`,
        });

        // Atualizar estado local (será substituído pela chamada real da API)
        setPrompts((prompts) =>
          prompts.map((p) =>
            p.id === prompt.id ? { ...p, is_active: !p.is_active } : p
          )
        );
      } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        toast({
          title: 'Erro ao alterar status',
          description: 'Falha ao alterar status do prompt',
          variant: 'destructive',
        });
      }
    };

    const handlePreviewPrompt = (prompt: AiPrompt) => {
      setPreviewPrompt(prompt);
      setShowPreviewModal(true);
    };

    const renderPromptCard = (prompt: AiPrompt) => (
      <Card key={prompt.id} className="relative">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">{prompt.prompt_title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {prompt.prompt_description || 'Sem descrição'}
                </p>
                <Badge variant="outline" className="mt-2 text-xs">
                  {prompt.prompt_name}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={prompt.is_active ? 'default' : 'secondary'}>
                {prompt.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
              <Switch
                checked={prompt.is_active}
                onCheckedChange={() => togglePromptStatus(prompt)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Preview do conteúdo */}
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Conteúdo do Prompt
              </Label>
              <p className="text-sm line-clamp-3">{prompt.prompt_content}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreviewPrompt(prompt)}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditPrompt(prompt)}
                className="flex-1"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );

    const renderFormModal = (isEdit = false) => (
      <Dialog
        open={isEdit ? showEditModal : showCreateModal}
        onOpenChange={isEdit ? setShowEditModal : setShowCreateModal}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {isEdit ? 'Editar' : 'Criar'} Prompt de IA
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Atualize o prompt para melhorar o processamento de IA'
                : 'Crie um novo prompt para processamento de IA'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isEdit && (
              <div className="space-y-2">
                <Label htmlFor="prompt_name">Nome Técnico *</Label>
                <Input
                  id="prompt_name"
                  placeholder="Ex: patient_summary, report_format"
                  value={formData.prompt_name || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      prompt_name: e.target.value,
                    }))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Nome único para identificar o prompt no sistema (sem espaços)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="prompt_title">Título *</Label>
              <Input
                id="prompt_title"
                placeholder="Ex: Resumo de Paciente, Formatação de Relatório"
                value={formData.prompt_title || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    prompt_title: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt_description">Descrição</Label>
              <Textarea
                id="prompt_description"
                placeholder="Descreva o que este prompt faz e quando deve ser usado"
                value={formData.prompt_description || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    prompt_description: e.target.value,
                  }))
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt_content">Conteúdo do Prompt *</Label>
              <RichTextEditor
                value={formData.prompt_content || ''}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    prompt_content: value,
                  }))
                }
                placeholder="Digite o prompt que será enviado para a IA..."
                className="min-h-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                Use texto rico para formatar instruções complexas. Variáveis
                podem ser inseridas como {'{variable_name}'}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFormData({});
                if (isEdit) {
                  setEditingPrompt(null);
                  setShowEditModal(false);
                } else {
                  setShowCreateModal(false);
                }
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={isEdit ? handleUpdatePrompt : handleCreatePrompt}
              disabled={
                saving || !formData.prompt_title || !formData.prompt_content
              }
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    const renderPreviewModal = () => (
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {previewPrompt?.prompt_title}
            </DialogTitle>
            <DialogDescription>
              Visualização do conteúdo do prompt
            </DialogDescription>
          </DialogHeader>

          {previewPrompt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Nome Técnico</Label>
                  <p className="font-mono bg-muted p-2 rounded">
                    {previewPrompt.prompt_name}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-2">
                    <Badge
                      variant={
                        previewPrompt.is_active ? 'default' : 'secondary'
                      }
                    >
                      {previewPrompt.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>

              {previewPrompt.prompt_description && (
                <div>
                  <Label className="text-muted-foreground">Descrição</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded">
                    {previewPrompt.prompt_description}
                  </p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">
                  Conteúdo do Prompt
                </Label>
                <div
                  className="mt-2 p-4 bg-muted rounded prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: previewPrompt.prompt_content,
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPreviewModal(false)}
            >
              Fechar
            </Button>
            {previewPrompt && (
              <Button
                onClick={() => {
                  setShowPreviewModal(false);
                  handleEditPrompt(previewPrompt);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    if (loading) {
      return (
        <div className={cn('space-y-6', className)}>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Carregando prompts...</p>
          </div>
        </div>
      );
    }

    return (
      <div className={cn('space-y-6', className)}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Prompts de IA</h2>
            <p className="text-sm text-muted-foreground">
              Configure prompts para processamento inteligente de dados
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Prompt
          </Button>
        </div>

        {/* Lista de Prompts */}
        <div className="grid gap-6">
          {prompts.map((prompt) => renderPromptCard(prompt))}

          {prompts.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Nenhum prompt configurado</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Crie prompts para melhorar o processamento de IA da aplicação
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Prompt
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Modais */}
        {renderFormModal(false)}
        {renderFormModal(true)}
        {renderPreviewModal()}
      </div>
    );
  }
);

PromptsManagement.displayName = 'PromptsManagement';
