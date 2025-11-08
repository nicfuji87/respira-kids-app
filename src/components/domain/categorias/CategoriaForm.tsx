import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Palette, Folder, FolderOpen } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { normalizeSelectValue } from '@/lib/form-utils';

// AI dev note: Formulário para cadastro e edição de categorias contábeis
// Suporta hierarquia de até 3 níveis: Grupo > Classificação > Subclassificação
// Integração com seletor de cores para UI

const categoriaSchema = z.object({
  codigo: z
    .string()
    .min(2, 'Código deve ter pelo menos 2 caracteres')
    .max(20, 'Código muito longo')
    .regex(/^[A-Z0-9_]+$/, 'Use apenas letras maiúsculas, números e _'),
  nome: z
    .string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(100, 'Nome muito longo'),
  descricao: z.string().max(500, 'Descrição muito longa').optional(),
  categoria_pai_id: z.string().uuid().optional().nullable(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida')
    .optional(),
  ordem_exibicao: z.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});

type CategoriaFormData = z.infer<typeof categoriaSchema>;

interface CategoriaHierarquia {
  id: string;
  codigo: string;
  nome: string;
  nivel: number;
  categoria_pai_id?: string | null;
}

interface CategoriaFormProps {
  categoria?: {
    id: string;
    codigo: string;
    nome: string;
    descricao?: string;
    categoria_pai_id?: string | null;
    nivel: number;
    cor?: string;
    ordem_exibicao: number;
    ativo: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CategoriaForm = React.memo<CategoriaFormProps>(
  ({ categoria, onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [categoriasDisponiveis, setCategoriasDisponiveis] = React.useState<
      CategoriaHierarquia[]
    >([]);
    const { toast } = useToast();

    const form = useForm<CategoriaFormData>({
      resolver: zodResolver(categoriaSchema),
      defaultValues: {
        codigo: categoria?.codigo || '',
        nome: categoria?.nome || '',
        descricao: categoria?.descricao || '',
        categoria_pai_id: categoria?.categoria_pai_id || null,
        cor: categoria?.cor || '#3B82F6',
        ordem_exibicao: categoria?.ordem_exibicao || 0,
        ativo: categoria?.ativo ?? true,
      },
    });

    const categoriaPaiId = form.watch('categoria_pai_id');

    // Carregar categorias disponíveis para hierarquia
    React.useEffect(() => {
      const loadCategorias = async () => {
        try {
          let query = supabase
            .from('categorias_contabeis')
            .select('id, codigo, nome, nivel, categoria_pai_id')
            .lt('nivel', 3) // Apenas níveis 1 e 2 podem ser pais
            .eq('ativo', true)
            .order('nivel')
            .order('ordem_exibicao');

          // Se editando, excluir a própria categoria e suas filhas
          if (categoria?.id) {
            query = query.neq('id', categoria.id);
          }

          const { data, error } = await query;

          if (error) throw error;

          setCategoriasDisponiveis(data || []);
        } catch (error) {
          console.error('Erro ao carregar categorias:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar categorias',
            description: 'Não foi possível carregar as categorias disponíveis.',
          });
        }
      };

      loadCategorias();
    }, [categoria?.id, toast]);

    // Determinar nível baseado na categoria pai
    const determinarNivel = (
      categoriaPaiId: string | null | undefined
    ): number => {
      if (!categoriaPaiId) return 1; // Sem pai = nível 1 (Grupo)

      const categoriaPai = categoriasDisponiveis.find(
        (c) => c.id === categoriaPaiId
      );
      if (!categoriaPai) return 1;

      return categoriaPai.nivel + 1;
    };

    // Agrupar categorias por nível para exibição
    const categoriasPorNivel = React.useMemo(() => {
      const nivel1 = categoriasDisponiveis.filter((c) => c.nivel === 1);
      const nivel2 = categoriasDisponiveis.filter((c) => c.nivel === 2);

      return { nivel1, nivel2 };
    }, [categoriasDisponiveis]);

    // Obter nome do nível
    const getNomeNivel = (nivel: number): string => {
      switch (nivel) {
        case 1:
          return 'Grupo (Centro de Custo)';
        case 2:
          return 'Classificação';
        case 3:
          return 'Subclassificação';
        default:
          return '';
      }
    };

    const onSubmit = async (data: CategoriaFormData) => {
      try {
        setIsLoading(true);

        const nivel = determinarNivel(data.categoria_pai_id);

        const categoriaData = {
          codigo: data.codigo.toUpperCase(),
          nome: data.nome,
          descricao: data.descricao || null,
          categoria_pai_id: data.categoria_pai_id || null,
          nivel,
          cor: nivel === 1 ? data.cor : null, // Cor apenas para nível 1
          ordem_exibicao: data.ordem_exibicao,
          ativo: data.ativo,
        };

        if (categoria?.id) {
          // Atualizar
          const { error } = await supabase
            .from('categorias_contabeis')
            .update(categoriaData)
            .eq('id', categoria.id);

          if (error) throw error;

          toast({
            title: 'Categoria atualizada',
            description: 'Dados da categoria foram atualizados com sucesso.',
          });
        } else {
          // Criar
          const { error } = await supabase
            .from('categorias_contabeis')
            .insert(categoriaData);

          if (error) throw error;

          toast({
            title: 'Categoria cadastrada',
            description: 'Nova categoria foi cadastrada com sucesso.',
          });
        }

        onSuccess?.();
      } catch (error) {
        console.error('Erro ao salvar categoria:', error);

        // Tratar erro de código duplicado
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        ) {
          form.setError('codigo', {
            message: 'Este código já está em uso',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Erro ao salvar',
            description:
              'Ocorreu um erro ao salvar a categoria. Tente novamente.',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    const nivelAtual = determinarNivel(categoriaPaiId);

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {categoria ? 'Editar Categoria' : 'Nova Categoria'}
          </CardTitle>
          <CardDescription>
            {categoria
              ? 'Atualize os dados da categoria contábil'
              : 'Preencha os dados para cadastrar uma nova categoria'}
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {/* Categoria Pai */}
              {(!categoria || categoria.nivel > 1) && (
                <FormField
                  control={form.control}
                  name="categoria_pai_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria Pai</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(normalizeSelectValue(value))
                        }
                        value={field.value || '__none__'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a categoria pai (opcional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <div className="flex items-center gap-2">
                              <Folder className="h-4 w-4" />
                              Nenhuma (Criar Grupo)
                            </div>
                          </SelectItem>

                          {categoriasPorNivel.nivel1.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                Grupos (Nível 1)
                              </div>
                              {categoriasPorNivel.nivel1.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  <div className="flex items-center gap-2">
                                    <FolderOpen className="h-4 w-4" />
                                    {cat.nome}
                                    <code className="text-xs text-muted-foreground">
                                      {cat.codigo}
                                    </code>
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}

                          {categoriasPorNivel.nivel2.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                Classificações (Nível 2)
                              </div>
                              {categoriasPorNivel.nivel2.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  <div className="flex items-center gap-2 pl-4">
                                    <FolderOpen className="h-4 w-4" />
                                    {cat.nome}
                                    <code className="text-xs text-muted-foreground">
                                      {cat.codigo}
                                    </code>
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Deixe vazio para criar um grupo de nível 1
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Nível da Categoria */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Nível da categoria:
                  </span>
                  <Badge variant="outline">{getNomeNivel(nivelAtual)}</Badge>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Código */}
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="DESP_OPER"
                          className="uppercase"
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Código único em maiúsculas
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Nome */}
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Despesas Operacionais" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Cor (apenas para nível 1) */}
              {nivelAtual === 1 && (
                <FormField
                  control={form.control}
                  name="cor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4" />
                          Cor de Exibição
                        </div>
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            {...field}
                            value={field.value || '#3B82F6'}
                            className="w-20 h-10 cursor-pointer"
                          />
                          <Input
                            type="text"
                            {...field}
                            value={field.value || '#3B82F6'}
                            placeholder="#3B82F6"
                            className="font-mono"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Cor para gráficos e relatórios
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Ordem de Exibição */}
              <FormField
                control={form.control}
                name="ordem_exibicao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem de Exibição</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                        min={0}
                        max={999}
                      />
                    </FormControl>
                    <FormDescription>
                      Ordem para exibição em listas (menor primeiro)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Descrição */}
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Descrição detalhada da categoria..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>

            <CardFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {categoria ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    );
  }
);

CategoriaForm.displayName = 'CategoriaForm';
