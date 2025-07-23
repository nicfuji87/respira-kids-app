import React, { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Button } from '@/components/primitives/button';
import { RichTextEditor } from '@/components/primitives/rich-text-editor';
import { VariableInserter } from './VariableInserter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/primitives/tabs';
import { Badge } from '@/components/primitives/badge';
import type { UseFormReturn } from 'react-hook-form';
import type { ContractTemplate } from '@/types/system-config';
import { Loader2, Eye, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: ContractTemplateEditor composed que combina RichTextEditor + VariableInserter
// Modal completo para criação/edição de templates de contrato com preview

export interface ContractTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ContractTemplate) => void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  isEditing?: boolean;
  loading?: boolean;
  defaultVariables?: string[];
}

export const ContractTemplateEditor = React.memo<ContractTemplateEditorProps>(
  ({
    isOpen,
    onClose,
    onSubmit,
    form,
    isEditing = false,
    loading = false,
    defaultVariables = [],
  }) => {
    const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
    const [customVariables, setCustomVariables] = useState<string[]>([]);

    // Todas as variáveis disponíveis
    const allVariables = useMemo(() => {
      const standardVariables = [
        'nome_paciente',
        'cpf_paciente',
        'data_nascimento',
        'endereco_completo',
        'telefone',
        'email',
        'nome_profissional',
        'registro_profissional',
        'especialidade',
        'data_atual',
        'nome_empresa',
        'cnpj_empresa',
        ...defaultVariables,
      ];
      return [...standardVariables, ...customVariables];
    }, [defaultVariables, customVariables]);

    // Watch do conteúdo para preview
    const conteudoTemplate = form.watch('conteudo_template') || '';
    const variaveisDisponiveis = form.watch('variaveis_disponiveis') || allVariables;

    // Handle inserção de variável customizada
    const handleCustomVariableInsert = useCallback(
      (variable: string) => {
        // Inserir no editor
        try {
          document.execCommand('insertText', false, variable);
          
          // Adicionar à lista de variáveis disponíveis se não existir
          const variableName = variable.replace(/[{}]/g, '');
          if (!allVariables.includes(variableName)) {
            const newVariables = [...allVariables, variableName];
            setCustomVariables(prev => [...prev, variableName]);
            form.setValue('variaveis_disponiveis', newVariables);
          }
        } catch (error) {
          console.warn('⚠️ Erro ao inserir variável:', error);
        }
      },
      [allVariables, form]
    );

    // Renderizar preview com variáveis substituídas por dados fictícios
    const renderPreview = useCallback(() => {
      let preview = conteudoTemplate;
      
      // Dados fictícios para preview
      const mockData: Record<string, string> = {
        nome_paciente: 'João Silva Santos',
        cpf_paciente: '123.456.789-00',
        data_nascimento: '15/03/1990',
        endereco_completo: 'Rua das Flores, 123, Jardim Primavera, São Paulo, SP',
        telefone: '(11) 99999-9999',
        email: 'joao.silva@email.com',
        nome_profissional: 'Dr. Maria Oliveira',
        registro_profissional: 'CREFITO-12345',
        especialidade: 'Fisioterapia Respiratória',
        data_atual: new Date().toLocaleDateString('pt-BR'),
        nome_empresa: 'Respira Kids',
        cnpj_empresa: '12.345.678/0001-90',
      };

      // Substituir variáveis
      variaveisDisponiveis.forEach((variable: string) => {
        const regex = new RegExp(`{{${variable}}}`, 'g');
        const value = mockData[variable] || `[${variable}]`;
        preview = preview.replace(regex, `<strong>${value}</strong>`);
      });

      return preview;
    }, [conteudoTemplate, variaveisDisponiveis]);

    const title = isEditing ? 'Editar Modelo de Contrato' : 'Novo Modelo de Contrato';

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              {title}
            </DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Edite as informações do modelo de contrato'
                : 'Crie um novo modelo de contrato com variáveis dinâmicas'
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Campos básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Modelo *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Contrato de Fisioterapia"
                          disabled={loading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="versao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Versão</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          placeholder="1"
                          disabled={loading || isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Descreva o propósito deste modelo de contrato..."
                        disabled={loading}
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Editor de conteúdo com tabs */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base font-medium">
                    Conteúdo do Contrato *
                  </FormLabel>
                  <div className="flex items-center gap-2">
                    <VariableInserter
                      variables={allVariables}
                      onInsert={handleCustomVariableInsert}
                      disabled={loading || activeTab === 'preview'}
                    />
                    <Badge variant="outline" className="text-xs">
                      {allVariables.length} variáveis disponíveis
                    </Badge>
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'editor' | 'preview')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="editor" className="flex items-center gap-2">
                      <Edit3 className="h-4 w-4" />
                      Editor
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Preview
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="mt-4">
                    <FormField
                      control={form.control}
                      name="conteudo_template"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RichTextEditor
                              {...field}
                              placeholder="Digite o conteúdo do contrato... Use as variáveis para inserir dados dinâmicos."
                              disabled={loading}
                              minHeight={300}
                              maxHeight={500}
                              className="border-2"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <div 
                      className={cn(
                        "border-2 rounded-lg p-4 min-h-[300px] max-h-[500px] overflow-y-auto",
                        "bg-background prose prose-sm max-w-none"
                      )}
                      dangerouslySetInnerHTML={{
                        __html: renderPreview() || '<p class="text-muted-foreground">Nenhum conteúdo para visualizar</p>'
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Salvar Alterações' : 'Criar Modelo'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
);

ContractTemplateEditor.displayName = 'ContractTemplateEditor'; 